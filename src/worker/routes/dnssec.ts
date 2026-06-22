import { corsHeaders, checkRateLimit, isPrivateHostname } from '../shared';

function computeKeyTag(dnskeyData: string): number {
  const parts = dnskeyData.trim().split(/\s+/);
  if (parts.length < 4) return 0;

  const flags = parseInt(parts[0], 10);
  const protocol = parseInt(parts[1], 10);
  const algorithm = parseInt(parts[2], 10);
  const keyBase64 = parts.slice(3).join('');

  let keyBytes: number[];
  try {
    const decoded = atob(keyBase64.replace(/\s/g, ''));
    keyBytes = Array.from(decoded, (c) => c.charCodeAt(0));
  } catch {
    return 0;
  }

  const rdata = [flags >> 8, flags & 0xff, protocol, algorithm, ...keyBytes];

  let ac = 0;
  for (let i = 0; i + 1 < rdata.length; i += 2) {
    ac += (rdata[i] << 8) + rdata[i + 1];
  }
  if (rdata.length % 2 !== 0) {
    ac += rdata[rdata.length - 1];
  }
  ac += (ac >> 16) & 0xffff;

  return ac & 0xffff;
}

export async function handleDnssecValidation(request: Request): Promise<Response> {
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

  const dohBase = 'https://cloudflare-dns.com/dns-query';
  const dohHeaders = { Accept: 'application/dns-json' };

  const result: {
    domain: string;
    status: 'SECURE' | 'INSECURE' | 'BOGUS' | 'ERROR';
    adFlag: boolean;
    chain: { step: string; status: 'pass' | 'fail' | 'skip'; details: string }[];
    dsRecord: {
      present: boolean;
      algorithm: number | null;
      digestType: number | null;
      keyTag: number | null;
    } | null;
    dnskeyRecord: {
      present: boolean;
      algorithm: number | null;
      keyTag: number | null;
      flags: number | null;
    } | null;
    hashVerified: boolean | null;
    error?: string;
  } = {
    domain,
    status: 'INSECURE',
    adFlag: false,
    chain: [],
    dsRecord: null,
    dnskeyRecord: null,
    hashVerified: null,
  };

  try {
    const domainRes = await fetch(`${dohBase}?name=${encodeURIComponent(domain)}&type=A`, {
      headers: dohHeaders,
      signal: AbortSignal.timeout(5000),
    });
    const domainJson = (await domainRes.json()) as { AD?: boolean };
    result.adFlag = !!domainJson.AD;

    if (!result.adFlag) {
      result.chain.push({
        step: 'Domain query',
        status: 'skip',
        details: 'AD flag not set — domain may not be DNSSEC-signed',
      });
    } else {
      result.chain.push({
        step: 'Domain query',
        status: 'pass',
        details: 'AD flag set — resolver reports DNSSEC validation passed',
      });
    }

    const tld = domain.split('.').slice(-1)[0];

    try {
      const dsRes = await fetch(`${dohBase}?name=${encodeURIComponent(domain)}&type=DS`, {
        headers: dohHeaders,
        signal: AbortSignal.timeout(5000),
      });
      const dsJson = (await dsRes.json()) as {
        Answer?: { data: string; type: number }[];
        AD?: boolean;
      };

      if (dsJson.Answer && dsJson.Answer.length > 0) {
        const dsData = dsJson.Answer.find((a) => a.type === 43);
        if (dsData) {
          const parts = dsData.data.trim().split(/\s+/);
          result.dsRecord = {
            present: true,
            keyTag: parts[0] ? parseInt(parts[0], 10) : null,
            algorithm: parts[1] ? parseInt(parts[1], 10) : null,
            digestType: parts[2] ? parseInt(parts[2], 10) : null,
          };
          result.chain.push({
            step: `DS record (${tld} zone)`,
            status: 'pass',
            details: `Found: keyTag=${parts[0]}, alg=${parts[1]}, digestType=${parts[2]}`,
          });
        }
      } else {
        result.dsRecord = { present: false, algorithm: null, digestType: null, keyTag: null };
        result.chain.push({
          step: `DS record (${tld} zone)`,
          status: 'fail',
          details: 'No DS record found — domain is not in the DNSSEC chain of trust',
        });
      }
    } catch {
      result.dsRecord = { present: false, algorithm: null, digestType: null, keyTag: null };
      result.chain.push({
        step: `DS record (${tld} zone)`,
        status: 'fail',
        details: 'Failed to query DS record',
      });
    }

    try {
      const dnskeyRes = await fetch(`${dohBase}?name=${encodeURIComponent(domain)}&type=DNSKEY`, {
        headers: dohHeaders,
        signal: AbortSignal.timeout(5000),
      });
      const dnskeyJson = (await dnskeyRes.json()) as {
        Answer?: { data: string; type: number }[];
        AD?: boolean;
      };

      if (dnskeyJson.Answer && dnskeyJson.Answer.length > 0) {
        const kskEntry = dnskeyJson.Answer.find((a) => {
          if (a.type !== 48) return false;
          const flags = parseInt(a.data.trim().split(/\s+/)[0] || '0', 10);
          return flags === 257;
        });
        const entry = kskEntry || dnskeyJson.Answer.find((a) => a.type === 48);
        if (entry) {
          const parts = entry.data.trim().split(/\s+/);
          result.dnskeyRecord = {
            present: true,
            flags: parts[0] ? parseInt(parts[0], 10) : null,
            algorithm: parts[2] ? parseInt(parts[2], 10) : null,
            keyTag: null,
          };
          const keyTag = computeKeyTag(entry.data);
          result.dnskeyRecord.keyTag = keyTag;
          result.chain.push({
            step: 'DNSKEY record',
            status: 'pass',
            details: `Found: flags=${parts[0]}, protocol=${parts[1]}, alg=${parts[2]}, computed keyTag=${keyTag}`,
          });

          if (result.dsRecord?.present && result.dsRecord.keyTag === keyTag) {
            result.hashVerified = true;
            result.chain.push({
              step: 'Key Tag Verification',
              status: 'pass',
              details: `DS keyTag (${result.dsRecord.keyTag}) matches DNSKEY computed keyTag (${keyTag})`,
            });
          } else if (result.dsRecord?.present && result.dsRecord.keyTag !== keyTag) {
            result.hashVerified = false;
            result.chain.push({
              step: 'Key Tag Verification',
              status: 'fail',
              details: `DS keyTag (${result.dsRecord.keyTag}) does NOT match DNSKEY computed keyTag (${keyTag})`,
            });
            result.status = 'BOGUS';
          }
        }
      } else {
        result.dnskeyRecord = { present: false, algorithm: null, keyTag: null, flags: null };
        result.chain.push({
          step: 'DNSKEY record',
          status: 'fail',
          details: 'No DNSKEY record found',
        });
      }
    } catch {
      result.dnskeyRecord = { present: false, algorithm: null, keyTag: null, flags: null };
      result.chain.push({
        step: 'DNSKEY record',
        status: 'fail',
        details: 'Failed to query DNSKEY',
      });
    }

    if (result.status !== 'BOGUS') {
      if (
        result.dsRecord?.present &&
        result.dnskeyRecord?.present &&
        result.hashVerified !== false
      ) {
        result.status = 'SECURE';
      } else if (result.adFlag) {
        result.status =
          result.dsRecord?.present && result.dnskeyRecord?.present ? 'SECURE' : 'INSECURE';
      }
    }
  } catch (err) {
    const msg =
      err instanceof Error && err.name === 'TimeoutError'
        ? 'DNSSEC validation timed out'
        : 'DNSSEC validation failed';
    result.error = msg;
    result.status = 'ERROR';
  }

  return Response.json(result, { headers: corsHeaders(request) });
}