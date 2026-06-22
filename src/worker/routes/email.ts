import { corsHeaders, checkRateLimit, isPrivateHostname } from '../shared';

export async function handleEmailSecurity(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') || '';

  interface SpfData {
    present: boolean;
    valid: boolean;
    value: string | null;
    mechanisms: string[];
    lookupCount: number;
  }
  interface DkimData {
    found: boolean;
    selector: string | null;
    algorithm: string | null;
    keyLength: number | null;
  }
  interface DmarcData {
    present: boolean;
    valid: boolean;
    policy: string | null;
    pct: number | null;
    rua: string[];
    subdomainPolicy: string | null;
  }

  const spf: SpfData = {
    present: false,
    valid: false,
    value: null,
    mechanisms: [],
    lookupCount: 0,
  };
  const dkim: DkimData = { found: false, selector: null, algorithm: null, keyLength: null };
  const dmarc: DmarcData = {
    present: false,
    valid: false,
    policy: null,
    pct: null,
    rua: [],
    subdomainPolicy: null,
  };

  if (!domain) {
    return Response.json(
      { domain: '', spf, dkim, dmarc, grade: 'F', score: 0 },
      { headers: corsHeaders(request) },
    );
  }

  if (isPrivateHostname(domain)) {
    return Response.json(
      { error: 'Invalid domain' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const dohBase = 'https://cloudflare-dns.com/dns-query';

  try {
    const spfRes = await fetch(`${dohBase}?name=${encodeURIComponent(domain)}&type=TXT`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const spfJson = (await spfRes.json()) as { Answer?: { data: string }[] };
    if (spfJson.Answer) {
      for (const a of spfJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=spf1')) {
          spf.present = true;
          spf.valid = raw.trim().startsWith('v=spf1');
          spf.value = raw;
          spf.mechanisms = [];
          let lookupCount = 0;
          const parts = raw.split(/\s+/);
          for (let i = 1; i < parts.length; i++) {
            const p = parts[i];
            if (['a', 'mx', 'ptr', 'exists'].includes(p)) {
              spf.mechanisms.push(p);
              lookupCount++;
            } else if (p.startsWith('include')) {
              spf.mechanisms.push('include');
              lookupCount++;
            } else if (p.startsWith('ip4')) spf.mechanisms.push('ip4');
            else if (p.startsWith('ip6')) spf.mechanisms.push('ip6');
            else if (p.startsWith('redirect')) {
              spf.mechanisms.push('redirect');
              lookupCount++;
            } else if (p.startsWith('exp')) spf.mechanisms.push('exp');
            else if (['all', '-all', '~all', '?all', '+all'].includes(p)) spf.mechanisms.push(p);
          }
          spf.lookupCount = lookupCount;
          if (lookupCount > 10) spf.valid = false;
          break;
        }
      }
    }
  } catch {
    /* leave as not present */
  }

  const selectors = [
    'google._domainkey',
    'default._domainkey',
    'selector1._domainkey',
    'selector2._domainkey',
    'dkim._domainkey',
    'mail._domainkey',
  ];
  for (const sel of selectors) {
    try {
      const dkimRes = await fetch(
        `${dohBase}?name=${encodeURIComponent(sel + '.' + domain)}&type=TXT`,
        { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000) },
      );
      const dkimJson = (await dkimRes.json()) as { Answer?: { data: string }[] };
      if (dkimJson.Answer) {
        for (const a of dkimJson.Answer) {
          const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
          if (raw.includes('v=DKIM1')) {
            dkim.found = true;
            dkim.selector = sel.replace('._domainkey', '');
            const kMatch = raw.match(/k=([^;]+)/);
            if (kMatch) dkim.algorithm = kMatch[1].trim();
            const pMatch = raw.match(/p=([^;]+)/);
            if (pMatch) dkim.keyLength = pMatch[1].trim().length;
            break;
          }
        }
      }
    } catch {
      /* continue to next selector */
    }
    if (dkim.found) break;
  }

  try {
    const dmarcRes = await fetch(`${dohBase}?name=_dmarc.${encodeURIComponent(domain)}&type=TXT`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const dmarcJson = (await dmarcRes.json()) as { Answer?: { data: string }[] };
    if (dmarcJson.Answer) {
      for (const a of dmarcJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=DMARC1')) {
          dmarc.present = true;
          dmarc.valid = true;
          const tags = raw.split(';').map((t) => t.trim());
          for (const tag of tags) {
            const [key, ...valParts] = tag.split('=');
            const val = valParts.join('=');
            switch (key) {
              case 'p':
                dmarc.policy = val || null;
                break;
              case 'pct':
                dmarc.pct = parseInt(val, 10) || null;
                break;
              case 'rua':
                dmarc.rua.push(val);
                break;
              case 'sp':
                dmarc.subdomainPolicy = val || null;
                break;
            }
          }
          break;
        }
      }
    }
  } catch {
    /* leave as not present */
  }

  interface BimiData {
    present: boolean;
    logoUrl: string | null;
    vmcUrl: string | null;
    valid: boolean;
  }

  interface MtaStsData {
    present: boolean;
    mode: string | null;
    maxAge: number | null;
    mxPatterns: string[];
    valid: boolean;
  }

  const bimi: BimiData = { present: false, logoUrl: null, vmcUrl: null, valid: false };
  const mtaSts: MtaStsData = {
    present: false,
    mode: null,
    maxAge: null,
    mxPatterns: [],
    valid: false,
  };

  try {
    const bimiRes = await fetch(
      `${dohBase}?name=default._bimi.${encodeURIComponent(domain)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000) },
    );
    const bimiJson = (await bimiRes.json()) as { Answer?: { data: string }[] };
    if (bimiJson.Answer) {
      for (const a of bimiJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=BIMI1')) {
          bimi.present = true;
          bimi.valid = true;
          const tags = raw.split(';').map((t) => t.trim());
          for (const tag of tags) {
            const [key, ...valParts] = tag.split('=');
            const val = valParts.join('=');
            if (key === 'l') bimi.logoUrl = val || null;
            else if (key === 'a') bimi.vmcUrl = val || null;
          }
          break;
        }
      }
    }
  } catch {
    /* leave as not present */
  }

  try {
    const mtaStsRes = await fetch(
      `${dohBase}?name=_mta-sts.${encodeURIComponent(domain)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' }, signal: AbortSignal.timeout(4000) },
    );
    const mtaStsJson = (await mtaStsRes.json()) as { Answer?: { data: string }[] };
    if (mtaStsJson.Answer) {
      for (const a of mtaStsJson.Answer) {
        const raw = (a.data || '').replace(/^"|"$/g, '').replace(/""/g, '"');
        if (raw.includes('v=STSv1')) {
          mtaSts.present = true;
          mtaSts.valid = true;
          // MTA-STS version id tag ignored
        }
      }
    }
  } catch {
    /* leave as not present */
  }

  if (mtaSts.present) {
    try {
      const policyRes = await fetch(`https://mta-sts.${domain}/.well-known/mta-sts.txt`, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'NetCheck/1.0' },
      });
      if (policyRes.ok) {
        const policyText = await policyRes.text();
        const lines = policyText.split('\n').map((l) => l.trim());
        for (const line of lines) {
          const [key, ...valParts] = line.split(':');
          const val = valParts.join(':').trim();
          if (key === 'mode') mtaSts.mode = val || null;
          else if (key === 'max_age') mtaSts.maxAge = parseInt(val, 10) || null;
          else if (key === 'mx') mtaSts.mxPatterns.push(val);
        }
      }
    } catch {
      /* policy fetch failed */
    }
  }

  let score = 0;
  let bonusScore = 0;
  const warnings: Array<{ type: string; message: string }> = [];
  if (spf.present && spf.valid && spf.mechanisms.length > 0) score += 35;
  else if (spf.present) score += 20;
  if (spf.value && (spf.value.includes('+all') || spf.value.endsWith(' all'))) {
    warnings.push({
      type: 'spf-open',
      message: 'SPF ends with +all or bare "all" — allows any sender. Use -all instead.',
    });
  }
  if (spf.lookupCount > 10) {
    warnings.push({
      type: 'spf-lookup-excess',
      message: `SPF has ${spf.lookupCount} DNS lookups (max 10). Exceeding this causes SPF to fail.`,
    });
  }
  if (dkim.found && dkim.keyLength !== null && dkim.keyLength < 256) {
    warnings.push({
      type: 'dkim-weak-key',
      message: `DKIM key is only ${dkim.keyLength} characters — may be too short (rsa-sha256 should be ≥1024 bits).`,
    });
  }
  if (dmarc.present && dmarc.policy === 'none') {
    warnings.push({
      type: 'dmarc-monitor-only',
      message:
        'DMARC policy is p=none — monitoring only, no enforcement. Upgrade to quarantine or reject.',
    });
  }
  if (dkim.found) score += 35;
  if (dmarc.present && dmarc.valid) {
    score += 25;
    if (dmarc.policy === 'reject') score += 5;
    else if (dmarc.policy === 'quarantine') score += 3;
  }

  if (bimi.present) {
    bonusScore += bimi.logoUrl ? 5 : 3;
    if (bimi.vmcUrl) bonusScore += 3;
  }
  if (mtaSts.present) {
    if (mtaSts.mode === 'enforce') bonusScore += 5;
    else if (mtaSts.mode === 'testing') bonusScore += 3;
    else bonusScore += 1;
  }

  const thresholds: [number, string][] = [
    [93, 'A+'],
    [90, 'A'],
    [80, 'B'],
    [70, 'C'],
    [60, 'D'],
    [0, 'F'],
  ];
  let grade = 'F';
  for (const [t, g] of thresholds) {
    if (score >= t) {
      grade = g;
      break;
    }
  }

  return Response.json(
    { domain, spf, dkim, dmarc, bimi, mtaSts, grade, score, bonusScore, warnings },
    { headers: corsHeaders(request) },
  );
}