import type { Env, CfProperties } from './types';

function csp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://rsms.me https://unpkg.com",
    "font-src 'self' https://rsms.me",
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'self' https://cloudflare-dns.com https://dns.google https://dns.quad9.net https://dns.adguard-dns.com https://dns.mullvad.net https://dns.nextdns.io https://unpkg.com https://api.pwnedpasswords.com",
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function securityHeaders(_request?: Request): Record<string, string> {
  return {
    'Content-Security-Policy': csp(),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

export function withSecurityHeaders(response: Response, request?: Request): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(securityHeaders(request))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function getCf(request: Request): CfProperties {
  return (request as unknown as { cf?: CfProperties }).cf || {};
}

export const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
export const RATE_LIMIT_WINDOW = 60_000;
export const RATE_LIMIT_MAX = 120;
export const RATE_LIMIT_SPEED_BURST = 60;
export const RATE_LIMIT_MAX_ENTRIES = 10_000;

export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}

export function corsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get('Origin') || '';
  const allowed = [
    'https://netcheck.oilygold.xyz',
    'https://7b64681b.netcheck-site.pages.dev',
    'http://localhost:8787',
    'http://127.0.0.1:8787',
  ];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export function checkRateLimit(request: Request): Response | null {
  const url = new URL(request.url);
  const isSpeedTest = url.pathname.startsWith('/api/speedtest/');
  const maxRequests = isSpeedTest ? RATE_LIMIT_SPEED_BURST : RATE_LIMIT_MAX;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const key = isSpeedTest ? `speed:${ip}` : `gen:${ip}`;

  if (rateLimitMap.size > RATE_LIMIT_MAX_ENTRIES) {
    for (const [k, v] of rateLimitMap) {
      if (now - v.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
    }
  }

  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    return Response.json(
      {
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - entry.windowStart)) / 1000),
      },
      { status: 429, headers: { ...corsHeaders(request), 'Retry-After': '60' } },
    );
  }

  return null;
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h.endsWith('.internal') || h.endsWith('.test') || h.endsWith('.example')) return true;

  if (!h.includes('.')) return true;

  if (h.startsWith('[')) return true;

  const parts = h.split('.');
  if (parts.length === 4) {
    const hasAmbiguousSegment = parts.some(
      (seg) => (seg.length > 1 && seg.startsWith('0')) || seg.toLowerCase().startsWith('0x'),
    );
    if (hasAmbiguousSegment) return true;

    const nums = parts.map((seg) => parseInt(seg, 10));
    if (nums.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      const [a, b] = nums;
      if (a === 10) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 127) return true;
      if (a === 0) return true;
      if (a === 169 && b === 254) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
    }
  }

  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|169\.254\.|100\.64\.)/.test(h))
    return true;

  return false;
}

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '_netcheck_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function trackVisitor(request: Request, env: Env): Promise<void> {
  try {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const fingerprint = await hashIp(ip);
    const now = Date.now();
    const minuteKey = `active:${Math.floor(now / 60000)}`;
    const dayKey = `unique:${new Date(now).toISOString().slice(0, 10)}`;

    const [minuteData, dayData, totalData] = await Promise.all([
      env.ANALYTICS.get(minuteKey, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get(dayKey, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get('total:visitors', 'json') as Promise<Record<string, number> | null>,
    ]);

    const minuteMap = minuteData || {};
    const dayMap = dayData || {};
    const totalMap = totalData || {};

    const isNewMinute = !(fingerprint in minuteMap);
    const isNewDay = !(fingerprint in dayMap);
    const isNewTotal = !(fingerprint in totalMap);

    if (isNewMinute || isNewDay || isNewTotal) {
      const writes: Promise<void>[] = [];
      if (isNewMinute) {
        minuteMap[fingerprint] = now;
        writes.push(env.ANALYTICS.put(minuteKey, JSON.stringify(minuteMap), { expirationTtl: 300 }));
      }
      if (isNewDay) {
        dayMap[fingerprint] = now;
        writes.push(
          env.ANALYTICS.put(dayKey, JSON.stringify(dayMap), { expirationTtl: 86400 * 2 }),
        );
      }
      if (isNewTotal) {
        totalMap[fingerprint] = now;
        writes.push(env.ANALYTICS.put('total:visitors', JSON.stringify(totalMap)));
      }
      await Promise.all(writes);
    }
  } catch {
    // KV not available, skip tracking
  }
}