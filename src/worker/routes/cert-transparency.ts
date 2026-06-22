import { corsHeaders, checkRateLimit, isPrivateHostname } from '../shared';

export interface CrtShEntry {
  common_name?: string;
  name_value?: string;
  not_before?: string;
  not_after?: string;
  issuer_name?: string;
  issuer_organization?: string;
  organization?: string;
  key_type?: string;
  key_length?: number;
  sha256?: string;
}

const crtCache = new Map<string, { data: CrtShEntry[]; expires: number }>();
const CRT_CACHE_TTL = 5 * 60 * 1000;

export interface WorkerTlsCerts {
  subject: { cn: string; sans: string[]; organization?: string };
  issuer: { cn: string; organization?: string };
  validity: { notBefore: string; notAfter: string; daysRemaining: number };
  key: { type: string; size: number };
  fingerprint: string;
  chainDepth: number;
  intermediates?: Array<{ cn: string; organization?: string; fingerprint: string }>;
}

export interface WorkerTlsWeakness {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
}

export async function fetchCrtShCerts(domain: string): Promise<CrtShEntry[] | null> {
  const cached = crtCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.data;
  try {
    const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'NetCheck/1.0' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CrtShEntry[];
    crtCache.set(domain, { data, expires: Date.now() + CRT_CACHE_TTL });
    if (crtCache.size > 500) {
      const oldest = [...crtCache.entries()].sort((a, b) => a[1].expires - b[1].expires);
      for (let i = 0; i < 100 && i < oldest.length; i++) crtCache.delete(oldest[i][0]);
    }
    return data;
  } catch {
    return null;
  }
}

export function parseCertFromCrtSh(entries: CrtShEntry[], domain: string): WorkerTlsCerts | null {
  if (!entries || entries.length === 0) return null;
  const cert = entries[0];
  const now = new Date();
  const notBefore = cert.not_before ?? '';
  const notAfter = cert.not_after ?? '';
  const daysRemaining = notAfter
    ? Math.floor((new Date(notAfter).getTime() - now.getTime()) / 86400000)
    : -1;
  const cn = cert.common_name ?? cert.name_value?.split('\n')[0] ?? domain;
  const sans = (cert.name_value ?? '').split('\n').filter((s: string) => s && s !== cn);
  const rawKeyType = cert.key_type ?? '';
  const keyType = rawKeyType.includes('RSA')
    ? 'RSA'
    : rawKeyType.includes('EC')
      ? 'ECDSA'
      : 'unknown';
  return {
    subject: { cn, sans, organization: cert.organization ?? undefined },
    issuer: { cn: cert.issuer_name ?? '', organization: cert.issuer_organization ?? undefined },
    validity: { notBefore, notAfter, daysRemaining },
    key: { type: keyType, size: cert.key_length ?? 0 },
    fingerprint: cert.sha256 ?? '',
    chainDepth: entries.length,
    intermediates: entries.slice(1, 4).map((e) => ({
      cn: e.common_name ?? e.name_value?.split('\n')[0] ?? '',
      organization: e.organization ?? undefined,
      fingerprint: e.sha256 ?? '',
    })),
  };
}

export function detectWeaknesses(certs: WorkerTlsCerts | null): WorkerTlsWeakness[] {
  const weaknesses: WorkerTlsWeakness[] = [];
  if (certs) {
    if (certs.validity.daysRemaining < 0) {
      weaknesses.push({
        id: 'cert-expired',
        severity: 'critical',
        description: 'Certificate has expired',
      });
    } else if (certs.validity.daysRemaining <= 7) {
      weaknesses.push({
        id: 'cert-expiring',
        severity: 'critical',
        description: `Certificate expires in ${certs.validity.daysRemaining} days`,
      });
    } else if (certs.validity.daysRemaining <= 30) {
      weaknesses.push({
        id: 'cert-expiring-soon',
        severity: 'high',
        description: `Certificate expires in ${certs.validity.daysRemaining} days`,
      });
    }
    if (certs.key.type === 'RSA' && certs.key.size > 0 && certs.key.size < 2048) {
      weaknesses.push({
        id: 'small-key',
        severity: 'high',
        description: `Weak key: RSA ${certs.key.size} bits (minimum 2048)`,
      });
    }
    if (certs.key.type === 'ECDSA' && certs.key.size > 0 && certs.key.size < 224) {
      weaknesses.push({
        id: 'small-key',
        severity: 'high',
        description: `Weak key: ECDSA ${certs.key.size} bits (minimum 224)`,
      });
    }
    if (certs.subject.cn && certs.subject.cn === certs.issuer.cn) {
      weaknesses.push({
        id: 'self-signed',
        severity: 'high',
        description: 'Self-signed certificate',
      });
    }
  }
  return weaknesses;
}

export async function handleCertTransparency(request: Request): Promise<Response> {
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

  try {
    const ctRes = await fetch(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'NetCheck/1.0' },
    });

    if (!ctRes.ok) {
      return Response.json(
        {
          domain,
          error: `crt.sh returned status ${ctRes.status}`,
          certs: [],
          summary: { total: 0, active: 0, expired: 0, issuers: 0 },
        },
        { status: 502, headers: corsHeaders(request) },
      );
    }

    const raw = (await ctRes.json()) as {
      issuer_ca_id: number;
      issuer_name: string;
      common_name: string;
      name_value: string;
      not_before: string;
      not_after: string;
      serial_number: string;
    }[];

    const now = new Date();
    const seenFingerprints = new Set<string>();
    const certs: {
      issuer: string;
      commonName: string;
      names: string;
      notBefore: string;
      notAfter: string;
      status: 'active' | 'expired';
      isWildcard: boolean;
    }[] = [];

    for (const c of raw.slice(0, 200)) {
      const fingerprint = `${c.issuer_name}|${c.common_name}|${c.serial_number}`;
      if (seenFingerprints.has(fingerprint)) continue;
      seenFingerprints.add(fingerprint);

      const notAfter = new Date(c.not_after);
      const status = notAfter > now ? 'active' : 'expired';
      const isWildcard = c.common_name.startsWith('*.') || c.name_value.includes('*.');

      certs.push({
        issuer: c.issuer_name,
        commonName: c.common_name,
        names: c.name_value,
        notBefore: c.not_before,
        notAfter: c.not_after,
        status,
        isWildcard,
      });
    }

    const active = certs.filter((c) => c.status === 'active');
    const expired = certs.filter((c) => c.status === 'expired');
    const issuers = new Set(certs.map((c) => c.issuer)).size;
    const wildcardCerts = certs.filter((c) => c.isWildcard);

    const recentCerts = active.filter((c) => {
      const notBefore = new Date(c.notBefore);
      const diffDays = (now.getTime() - notBefore.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 30;
    });

    const trustIndicators: string[] = [];
    if (issuers <= 2) trustIndicators.push('Few issuers — consistent certificate authority');
    if (recentCerts.length > 3)
      trustIndicators.push(
        `${recentCerts.length} certificates issued in the last 30 days — investigate if unexpected`,
      );
    if (wildcardCerts.length > 5)
      trustIndicators.push('Multiple wildcard certificates — broad subdomain coverage');

    return Response.json(
      {
        domain,
        certs: certs.slice(0, 100),
        totalInDb: raw.length,
        summary: {
          total: certs.length,
          active: active.length,
          expired: expired.length,
          issuers,
          wildcardCount: wildcardCerts.length,
          recentlyIssued: recentCerts.length,
        },
        trustIndicators,
      },
      { headers: corsHeaders(request) },
    );
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    const msg = isTimeout
      ? 'crt.sh request timed out'
      : 'Failed to fetch certificate transparency data';
    return Response.json(
      { domain, error: msg, certs: [], summary: { total: 0, active: 0, expired: 0, issuers: 0 } },
      { status: isTimeout ? 504 : 502, headers: corsHeaders(request) },
    );
  }
}