import { corsHeaders, checkRateLimit, isPrivateHostname } from '../shared';
import {
  fetchCrtShCerts,
  parseCertFromCrtSh,
  detectWeaknesses,
  type WorkerTlsCerts,
  type WorkerTlsWeakness,
} from './cert-transparency';

async function resolveDomainIp(domain: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { Answer?: Array<{ data: string }> };
    return data.Answer?.find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a.data))?.data ?? null;
  } catch {
    return null;
  }
}

async function lookupAsn(
  ip: string,
): Promise<{ asn: string | null; asOrganization: string | null }> {
  const parts = ip.split('.');
  if (parts.length !== 4) return { asn: null, asOrganization: null };
  const rev = parts.reverse().join('.');
  try {
    const originRes = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${rev}.origin.asn.cymru.com&type=TXT`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      },
    );
    if (!originRes.ok) return { asn: null, asOrganization: null };
    const originData = (await originRes.json()) as { Answer?: Array<{ data: string }> };
    const raw = originData.Answer?.[0]?.data;
    if (!raw) return { asn: null, asOrganization: null };
    const txt = raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
    const asn = txt.split(' | ')[0]?.trim();
    if (!asn || !/^\d+$/.test(asn)) return { asn: null, asOrganization: null };
    let asOrganization: string | null = null;
    try {
      const nameRes = await fetch(
        `https://cloudflare-dns.com/dns-query?name=AS${asn}.asn.cymru.com&type=TXT`,
        {
          headers: { Accept: 'application/dns-json' },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (nameRes.ok) {
        const nameData = (await nameRes.json()) as { Answer?: Array<{ data: string }> };
        const nameRaw = nameData.Answer?.[0]?.data;
        if (nameRaw) {
          const nameTxt =
            nameRaw.startsWith('"') && nameRaw.endsWith('"') ? nameRaw.slice(1, -1) : nameRaw;
          asOrganization = nameTxt.split(' | ')[4]?.trim() ?? null;
        }
      }
    } catch {
      // keep asn without organization
    }
    return { asn, asOrganization };
  } catch {
    return { asn: null, asOrganization: null };
  }
}

export async function handleTlsTargetCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain')?.trim().toLowerCase();

  if (!domain) {
    return Response.json(
      { error: 'Missing ?domain= parameter' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  if (isPrivateHostname(domain)) {
    return Response.json(
      { error: 'Invalid domain' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const result: {
    domain: string;
    httpsAvailable: boolean;
    redirectsToHttps: boolean;
    redirectChain: string[];
    hsts: {
      present: boolean;
      maxAge: number | null;
      includeSubDomains: boolean;
      preload: boolean;
    } | null;
    grade: string;
    score: number;
    supportsH3: boolean;
    error?: string;
    certs?: WorkerTlsCerts | null;
    weaknesses?: WorkerTlsWeakness[];
    asn?: string | null;
    asOrganization?: string | null;
    resolvedIp?: string | null;
  } = {
    domain,
    httpsAvailable: false,
    redirectsToHttps: false,
    redirectChain: [],
    hsts: null,
    grade: 'F',
    score: 0,
    supportsH3: false,
  };

  // Network info: resolve the domain and look up its ASN (Team Cymru DoH).
  const resolvedIp = await resolveDomainIp(domain);
  if (resolvedIp) {
    result.resolvedIp = resolvedIp;
    const asnInfo = await lookupAsn(resolvedIp);
    result.asn = asnInfo.asn;
    result.asOrganization = asnInfo.asOrganization;
  }

  try {
    const httpRes = await fetch(`http://${domain}/`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'NetCheck/1.0' },
    });

    if (httpRes.status >= 300 && httpRes.status < 400) {
      const location = httpRes.headers.get('location') || '';
      result.redirectChain.push(`http://${domain} → ${location}`);
      if (location.startsWith('https://')) {
        result.redirectsToHttps = true;
      }
    }
  } catch {
    /* HTTP not available, expected for HTTPS-only domains */
  }

  try {
    const httpsRes = await fetch(`https://${domain}/`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'NetCheck/1.0' },
    });

    result.httpsAvailable = true;

    const altSvc = httpsRes.headers.get('alt-svc') || '';
    result.supportsH3 = /h3[=-]/i.test(altSvc);

    const hstsHeader = httpsRes.headers.get('strict-transport-security');
    if (hstsHeader) {
      const maxAgeMatch = hstsHeader.match(/max-age=(\d+)/i);
      result.hsts = {
        present: true,
        maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null,
        includeSubDomains: hstsHeader.toLowerCase().includes('includesubdomains'),
        preload: hstsHeader.toLowerCase().includes('preload'),
      };
    }

    let score = 0;
    if (result.httpsAvailable) score += 40;
    if (result.redirectsToHttps) score += 25;
    if (result.hsts?.present) score += 20;
    if ((result.hsts?.maxAge ?? 0) >= 31536000) score += 10;
    if (result.hsts?.includeSubDomains) score += 5;
    if (result.hsts?.preload) score += 5;

    result.score = Math.min(100, score);
    const grade =
      score >= 93
        ? 'A+'
        : score >= 85
          ? 'A'
          : score >= 70
            ? 'B'
            : score >= 55
              ? 'C'
              : score >= 40
                ? 'D'
                : 'F';
    result.grade = grade;

    const certEntries = await fetchCrtShCerts(domain);
    result.certs = certEntries ? parseCertFromCrtSh(certEntries, domain) : null;
    result.weaknesses = detectWeaknesses(result.certs);

    if (result.weaknesses.length > 0) {
      const penalty = result.weaknesses.reduce(
        (sum, w) => sum + (w.severity === 'critical' ? 30 : w.severity === 'high' ? 20 : 10),
        0,
      );
      result.score = Math.max(0, result.score - penalty);
      result.grade =
        result.score >= 93
          ? 'A+'
          : result.score >= 85
            ? 'A'
            : result.score >= 70
              ? 'B'
              : result.score >= 55
                ? 'C'
                : result.score >= 40
                  ? 'D'
                  : 'F';
    }
  } catch {
    if (!result.httpsAvailable && !result.redirectsToHttps) {
      result.error = 'Domain does not support HTTPS';
      result.grade = 'F';
      result.score = 0;
    }
  }

  return Response.json(result, { headers: corsHeaders(request) });
}