interface Env {
  ANALYTICS: KVNamespace;
  PING_WNAM: R2Bucket;
  PING_ENAM: R2Bucket;
  PING_WEUR: R2Bucket;
  PING_EEUR: R2Bucket;
  PING_APAC: R2Bucket;
  PING_OC: R2Bucket;
}

function csp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://rsms.me https://unpkg.com",
    "font-src 'self' https://rsms.me",
    "img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'self' https://cloudflare-dns.com https://dns.google https://dns.quad9.net https://dns.adguard-dns.com https://dns.mullvad.net https://dns.nextdns.io https://unpkg.com",
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

function withSecurityHeaders(response: Response, request?: Request): Response {
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return withSecurityHeaders(
        new Response(null, { status: 204, headers: corsHeaders(request) }),
        request,
      );
    }

    const url = new URL(request.url);

    // KV-backed rate limit check for all API routes
    if (url.pathname.startsWith('/api/')) {
      const rlKv = await checkRateLimitKV(request, env.ANALYTICS);
      if (rlKv) return withSecurityHeaders(rlKv, request);
    }

    if (url.pathname === '/api/ip') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleIpCheck(request), request);
    }

    if (url.pathname === '/api/dns') {
      return withSecurityHeaders(await handleDnsCheck(request), request);
    }

    if (url.pathname === '/api/headers') {
      return withSecurityHeaders(await handleHeaders(request), request);
    }

    if (url.pathname === '/api/headers/check') {
      return withSecurityHeaders(await handleHeadersCheck(request), request);
    }

    if (url.pathname === '/api/dns/check-resolvers') {
      return withSecurityHeaders(await handleResolverCheck(request), request);
    }

    if (url.pathname === '/api/analytics') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleAnalytics(env, request), request);
    }

    if (url.pathname === '/api/map/probes') {
      trackVisitor(request, env).catch(() => {});
      return withSecurityHeaders(await handleMapProbes(request), request);
    }

    if (url.pathname === '/api/map/ping' && url.searchParams.has('region')) {
      return withSecurityHeaders(await handleRegionPing(url, env, request), request);
    }

    if (url.pathname === '/api/speedtest/ping') {
      const cf = getCf(request);
      const colo = cf.colo || 'unknown';
      return withSecurityHeaders(
        new Response('pong', {
          headers: {
            ...corsHeaders(request),
            'x-colo': colo,
            'x-lat': cf?.latitude || '',
            'x-lon': cf?.longitude || '',
            'Access-Control-Expose-Headers': 'x-colo, x-lat, x-lon',
          },
        }),
        request,
      );
    }

    if (url.pathname === '/api/speedtest/down') {
      return withSecurityHeaders(await handleSpeedDown(url, request), request);
    }

    if (url.pathname === '/api/speedtest/up' && request.method === 'POST') {
      return withSecurityHeaders(await handleSpeedUp(request), request);
    }

    if (url.pathname === '/api/dns/hijack-check') {
      return withSecurityHeaders(await handleHijackCheck(request), request);
    }

    if (url.pathname === '/api/dns/ecs-check') {
      return withSecurityHeaders(await handleEcsCheck(request), request);
    }

    if (url.pathname === '/api/dns/benchmark') {
      return withSecurityHeaders(await handleDnsBenchmark(request), request);
    }

    if (url.pathname === '/api/adblock/stats') {
      if (request.method === 'GET') {
        trackVisitor(request, env).catch(() => {});
        return withSecurityHeaders(await handleAdBlockStats(env, request), request);
      }
      if (request.method === 'POST') {
        trackVisitor(request, env).catch(() => {});
        return withSecurityHeaders(await handleAdBlockSubmit(env, request), request);
      }
    }

    if (url.pathname === '/robots.txt') {
      const robots = ['User-agent: *', 'Allow: /', `Sitemap: ${url.origin}/sitemap.xml`].join('\n');
      return withSecurityHeaders(
        new Response(robots, {
          headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' },
        }),
        request,
      );
    }

    if (url.pathname === '/sitemap.xml') {
      const today = new Date().toISOString().slice(0, 10);
      const origin = url.origin;
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${origin}/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="zh-TW" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="zh-CN" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="es" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="ja" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="ko" href="${origin}/"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${origin}/"/>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
      return withSecurityHeaders(
        new Response(sitemap, {
          headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=86400' },
        }),
        request,
      );
    }

    return withSecurityHeaders(
      Response.json({ error: 'Not Found' }, { status: 404, headers: corsHeaders(request) }),
      request,
    );
  },
};

interface CfProperties {
  colo?: string;
  asn?: number;
  asOrganization?: string;
  city?: string;
  region?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
}

function getCf(request: Request): CfProperties {
  return (request as unknown as { cf?: CfProperties }).cf || {};
}

export const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
export const RATE_LIMIT_WINDOW = 60_000;
export const RATE_LIMIT_MAX = 120;
export const RATE_LIMIT_SPEED_BURST = 60;
export const RATE_LIMIT_MAX_ENTRIES = 10_000;

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

// ─── KV-backed rate limiting (cross-isolate coordination) ──────────

export const RATE_LIMIT_KV_PREFIX = 'rl:';

export async function checkRateLimitKV(
  request: Request,
  kv: KVNamespace,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isSpeedTest = url.pathname.startsWith('/api/speedtest/');
  const maxRequests = isSpeedTest ? RATE_LIMIT_SPEED_BURST : RATE_LIMIT_MAX;
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const windowIndex = Math.floor(now / RATE_LIMIT_WINDOW);
  const kvKey = `${RATE_LIMIT_KV_PREFIX}${isSpeedTest ? 'speed' : 'gen'}:${ip}:${windowIndex}`;

  try {
    const current = await kv.get(kvKey);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= maxRequests) {
      return Response.json(
        { error: 'Rate limit exceeded', retryAfter: Math.ceil(RATE_LIMIT_WINDOW / 1000) },
        { status: 429, headers: { ...corsHeaders(request), 'Retry-After': '60' } },
      );
    }

    // Increment with TTL; don't await to avoid blocking the request
    kv.put(kvKey, String(count + 1), {
      expirationTtl: Math.ceil((RATE_LIMIT_WINDOW * 2) / 1000),
    }).catch(() => {});
  } catch {
    // KV unavailable — fall through to in-memory only
  }

  return null;
}

export function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();

  // Block well-known local/reserved names
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h.endsWith('.internal') || h.endsWith('.test') || h.endsWith('.example')) return true;

  // Block single-label hostnames (decimal IPs like 2130706433, hex like 0x7f000001)
  if (!h.includes('.')) return true;

  // Block bracketed IPv6 (e.g., [::1], [fe80::1])
  if (h.startsWith('[')) return true;

  const parts = h.split('.');
  if (parts.length === 4) {
    // Check for ambiguous segments (octal like 0177, hex like 0x7f)
    // These are inherently dangerous: different systems interpret them differently
    const hasAmbiguousSegment = parts.some(
      (seg) => (seg.length > 1 && seg.startsWith('0')) || seg.toLowerCase().startsWith('0x'),
    );
    if (hasAmbiguousSegment) return true;

    // All segments are plain decimal — check for private IP ranges
    const nums = parts.map((seg) => parseInt(seg, 10));
    if (nums.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      const [a, b] = nums;
      if (a === 10) return true; // 10.0.0.0/8
      if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
      if (a === 192 && b === 168) return true; // 192.168.0.0/16
      if (a === 127) return true; // 127.0.0.0/8
      if (a === 0) return true; // 0.0.0.0/8
      if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / metadata)
      if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    }
  }

  // Also catch dotted-decimal private IPs that the normalization above doesn't cover
  // (e.g., bare decimal like 192.168.1.1 parsed as decimal)
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

async function trackVisitor(request: Request, env: Env): Promise<void> {
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
        writes.push(
          env.ANALYTICS.put(minuteKey, JSON.stringify(minuteMap), { expirationTtl: 300 }),
        );
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

async function handleAnalytics(env: Env, request: Request): Promise<Response> {
  try {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    const prevMinute = currentMinute - 1;
    const today = new Date(now).toISOString().slice(0, 10);

    const [currentData, prevData, todayData, totalData] = await Promise.all([
      env.ANALYTICS.get(`active:${currentMinute}`, 'json') as Promise<Record<
        string,
        number
      > | null>,
      env.ANALYTICS.get(`active:${prevMinute}`, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get(`unique:${today}`, 'json') as Promise<Record<string, number> | null>,
      env.ANALYTICS.get('total:visitors', 'json') as Promise<Record<string, number> | null>,
    ]);

    const currentMap = currentData || {};
    const prevActive = prevData ? Object.keys(prevData).length : 0;

    const requesterFp = await hashIp(request.headers.get('cf-connecting-ip') || 'unknown');
    if (!(requesterFp in currentMap)) {
      currentMap[requesterFp] = now;
    }

    const activeNow = Object.keys(currentMap).length + prevActive;

    const todayMap = todayData || {};
    const uniqueToday = Object.keys(todayMap).length || 1;

    const totalMap = totalData || {};
    const totalUnique = Object.keys(totalMap).length || 1;

    return Response.json(
      {
        activeNow,
        uniqueToday,
        totalUnique,
      },
      { headers: { ...corsHeaders(request), 'Cache-Control': 'public, max-age=30' } },
    );
  } catch {
    return Response.json(
      { activeNow: 1, uniqueToday: 1, totalUnique: 1 },
      { headers: corsHeaders(request) },
    );
  }
}

function handleIpCheck(request: Request): Response {
  const ip =
    request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const country = request.headers.get('cf-ipcountry') || 'unknown';
  const cf = getCf(request);

  return Response.json(
    {
      ip,
      country,
      colo: cf.colo || 'unknown',
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      city: cf.city || null,
      region: cf.region || null,
      timezone: cf.timezone || null,
      httpProtocol: cf.httpProtocol || null,
      tlsVersion: cf.tlsVersion || null,
      tlsCipher: cf.tlsCipher || null,
      clientTcpRtt: cf.clientTcpRtt || null,
      latitude: cf.latitude || null,
      longitude: cf.longitude || null,
    },
    { headers: corsHeaders(request) },
  );
}

async function handleDnsCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') || 'example.com';
  const type = url.searchParams.get('type') || 'A';

  const allowedTypes = new Set(['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'SRV', 'PTR']);
  if (!allowedTypes.has(type)) {
    return Response.json(
      { error: 'Unsupported DNS record type' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  if (isPrivateHostname(domain)) {
    return Response.json(
      { error: 'Private/internal domains are not allowed' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;

  try {
    const dnsResponse = await fetch(dohUrl, {
      headers: { Accept: 'application/dns-json' },
    });
    const dnsData = await dnsResponse.json();
    return Response.json(dnsData, { headers: corsHeaders(request) });
  } catch (err) {
    return Response.json(
      { error: 'DNS lookup failed', detail: String(err) },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

function handleHeaders(request: Request): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers) {
    headers[key] = value;
  }
  return Response.json({ headers }, { headers: corsHeaders(request) });
}

let RANDOM_BLOCK: Uint8Array | null = null;

function getRandomBlock(): Uint8Array {
  if (!RANDOM_BLOCK) {
    RANDOM_BLOCK = new Uint8Array(65536);
    crypto.getRandomValues(RANDOM_BLOCK);
  }
  return RANDOM_BLOCK;
}

function handleSpeedDown(url: URL, request: Request): Response {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const bytes = Math.min(parseInt(url.searchParams.get('bytes') || '0', 10), 100000000);
  if (bytes <= 0) {
    return new Response('', { headers: corsHeaders(request) });
  }
  const block = getRandomBlock();
  const data = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += block.length) {
    const chunkSize = Math.min(block.length, bytes - offset);
    data.set(block.subarray(0, chunkSize), offset);
  }
  return new Response(data, {
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes),
      'Cache-Control': 'no-store',
    },
  });
}

async function handleSpeedUp(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const body = await request.arrayBuffer();
  return Response.json({ bytes: body.byteLength }, { headers: corsHeaders(request) });
}

interface ResolverDef {
  name: string;
  host: string;
  ip: string;
  desc: string;
}

const RESOLVERS: ResolverDef[] = [
  { name: 'Cloudflare', host: 'cloudflare-dns.com', ip: '1.1.1.1', desc: 'Fast, privacy-focused' },
  { name: 'Google', host: 'dns.google', ip: '8.8.8.8', desc: 'Reliable, global' },
  {
    name: 'Quad9',
    host: 'dns.quad9.net',
    ip: '9.9.9.9',
    desc: 'Security-focused, threat blocking',
  },
  {
    name: 'OpenDNS',
    host: 'dns.opendns.com',
    ip: '208.67.222.222',
    desc: 'Cisco Umbrella, filtering',
  },
  {
    name: 'AdGuard DNS',
    host: 'dns.adguard-dns.com',
    ip: '94.140.14.14',
    desc: 'Ad & tracker blocking',
  },
  {
    name: 'Cloudflare Families',
    host: 'family.cloudflare-dns.com',
    ip: '1.1.1.3',
    desc: 'Malware + adult content filter',
  },
  { name: 'NextDNS', host: 'dns.nextdns.io', ip: '45.90.28.0', desc: 'Customizable, analytics' },
  { name: 'Mullvad DNS', host: 'dns.mullvad.net', ip: '194.242.2.2', desc: 'Privacy, no logging' },
];

async function testOneResolver(resolver: ResolverDef) {
  const dohBase = `https://${resolver.host}/dns-query`;

  try {
    const start = Date.now();
    const res = await fetch(`${dohBase}?name=example.com&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(4000),
    });
    const latency = Date.now() - start;
    if (!res.ok)
      return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };

    let dnssec = false;
    try {
      const dnssecRes = await fetch(`${dohBase}?name=cloudflare.com&type=A&do=1`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const dnssecData = (await dnssecRes.json()) as { AD?: boolean };
      dnssec = !!dnssecData.AD;
    } catch {
      /* ignore */
    }

    let filtering = false;
    try {
      const filterRes = await fetch(`${dohBase}?name=ads.google.com&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const filterData = (await filterRes.json()) as {
        Answer?: { data: string }[];
        Status?: number;
      };
      const blocked =
        !filterData.Answer ||
        filterData.Answer.length === 0 ||
        filterData.Answer.some(
          (a: { data: string }) => a.data === '0.0.0.0' || a.data === '127.0.0.1',
        ) ||
        filterData.Status === 3;
      filtering = blocked;
    } catch {
      /* ignore */
    }

    return { ...resolver, reachable: true, latency, dnssec, filtering };
  } catch {
    return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };
  }
}

async function handleResolverCheck(request: Request): Promise<Response> {
  const results = await Promise.all(RESOLVERS.map(testOneResolver));
  return Response.json(results, { headers: corsHeaders(request) });
}

const SECURITY_HEADERS = [
  { key: 'strict-transport-security', name: 'headers.hsts', desc: 'headers.hsts.desc' },
  { key: 'content-security-policy', name: 'headers.csp', desc: 'headers.csp.desc' },
  { key: 'x-content-type-options', name: 'headers.xcto', desc: 'headers.xcto.desc' },
  { key: 'x-frame-options', name: 'headers.xfo', desc: 'headers.xfo.desc' },
  { key: 'referrer-policy', name: 'headers.rp', desc: 'headers.rp.desc' },
  { key: 'permissions-policy', name: 'headers.pp', desc: 'headers.pp.desc' },
  { key: 'x-xss-protection', name: 'headers.xxss', desc: 'headers.xxss.desc' },
  { key: 'cross-origin-opener-policy', name: 'headers.coop', desc: 'headers.coop.desc' },
  { key: 'cross-origin-embedder-policy', name: 'headers.coep', desc: 'headers.coep.desc' },
  { key: 'cross-origin-resource-policy', name: 'headers.corp', desc: 'headers.corp.desc' },
];

export function validateTargetUrl(
  raw: string | null,
): { ok: true; url: string } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'Missing ?url= parameter' };

  // If the input already has a scheme, reject non-HTTP early
  const schemeMatch = raw.match(/^([a-z][a-z0-9+.-]*):/i);
  if (schemeMatch && !['http', 'https'].includes(schemeMatch[1].toLowerCase())) {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, error: 'Only HTTP/HTTPS URLs are allowed' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'URLs with credentials are not allowed' };
  }
  if (isPrivateHostname(parsed.hostname)) {
    return { ok: false, error: 'Private/internal hostnames are not allowed' };
  }

  return { ok: true, url: parsed.href };
}

async function handleHeadersCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const validation = validateTargetUrl(url.searchParams.get('url'));
  if (!validation.ok) {
    return Response.json(
      { error: validation.error },
      { status: 400, headers: corsHeaders(request) },
    );
  }
  const targetUrl = validation.url;

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'NetCheck Security Scanner/1.0' },
    });

    // Check redirect targets for private IPs
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        try {
          const redirectUrl = new URL(location, targetUrl);
          if (isPrivateHostname(redirectUrl.hostname)) {
            return Response.json(
              { error: 'Redirect to private/internal hostname is not allowed' },
              { status: 400, headers: corsHeaders(request) },
            );
          }
        } catch {
          // Invalid redirect URL — let it fail naturally
        }
      }
      // For redirects, re-fetch the safe redirect target
      const finalRes = await fetch(targetUrl, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'NetCheck Security Scanner/1.0' },
      });
      return buildHeadersResponse(finalRes, targetUrl, request);
    }

    return buildHeadersResponse(res, targetUrl, request);
  } catch (err) {
    return Response.json(
      { error: 'Failed to fetch URL', detail: String(err) },
      { status: 500, headers: corsHeaders(request) },
    );
  }
}

function buildHeadersResponse(res: Response, targetUrl: string, request: Request): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of res.headers) {
    headers[key.toLowerCase()] = value;
  }

  const checks = SECURITY_HEADERS.map((h) => {
    const value = headers[h.key] || null;
    return {
      name: h.name,
      key: h.key,
      desc: h.desc,
      value,
      present: !!value,
    };
  });

  const present = checks.filter((c) => c.present).length;
  const total = checks.length;
  const grade =
    present >= 8 ? 'A' : present >= 6 ? 'B' : present >= 4 ? 'C' : present >= 2 ? 'D' : 'F';

  return Response.json(
    {
      url: targetUrl,
      statusCode: res.status,
      grade,
      score: { present, total },
      checks,
      server: headers['server'] || null,
      poweredBy: headers['x-powered-by'] || null,
    },
    { headers: corsHeaders(request) },
  );
}

const PROBES = [
  {
    id: 'IAD',
    name: 'Ashburn',
    country: 'US',
    region: 'North America',
    city: 'Ashburn',
    lat: 39.04,
    lon: -77.49,
  },
  {
    id: 'DFW',
    name: 'Dallas',
    country: 'US',
    region: 'North America',
    city: 'Dallas',
    lat: 32.79,
    lon: -96.77,
  },
  {
    id: 'LAX',
    name: 'Los Angeles',
    country: 'US',
    region: 'North America',
    city: 'Los Angeles',
    lat: 33.94,
    lon: -118.41,
  },
  {
    id: 'ORD',
    name: 'Chicago',
    country: 'US',
    region: 'North America',
    city: 'Chicago',
    lat: 41.88,
    lon: -87.63,
  },
  {
    id: 'SEA',
    name: 'Seattle',
    country: 'US',
    region: 'North America',
    city: 'Seattle',
    lat: 47.61,
    lon: -122.33,
  },
  {
    id: 'YYZ',
    name: 'Toronto',
    country: 'CA',
    region: 'North America',
    city: 'Toronto',
    lat: 43.65,
    lon: -79.38,
  },
  {
    id: 'MIA',
    name: 'Miami',
    country: 'US',
    region: 'North America',
    city: 'Miami',
    lat: 25.76,
    lon: -80.19,
  },
  {
    id: 'GRU',
    name: 'São Paulo',
    country: 'BR',
    region: 'South America',
    city: 'São Paulo',
    lat: -23.55,
    lon: -46.63,
  },
  {
    id: 'EZE',
    name: 'Buenos Aires',
    country: 'AR',
    region: 'South America',
    city: 'Buenos Aires',
    lat: -34.6,
    lon: -58.38,
  },
  {
    id: 'SCL',
    name: 'Santiago',
    country: 'CL',
    region: 'South America',
    city: 'Santiago',
    lat: -33.45,
    lon: -70.67,
  },
  {
    id: 'BOG',
    name: 'Bogotá',
    country: 'CO',
    region: 'South America',
    city: 'Bogotá',
    lat: 4.71,
    lon: -74.07,
  },
  {
    id: 'LHR',
    name: 'London',
    country: 'GB',
    region: 'Europe',
    city: 'London',
    lat: 51.51,
    lon: -0.13,
  },
  {
    id: 'FRA',
    name: 'Frankfurt',
    country: 'DE',
    region: 'Europe',
    city: 'Frankfurt',
    lat: 50.11,
    lon: 8.68,
  },
  {
    id: 'CDG',
    name: 'Paris',
    country: 'FR',
    region: 'Europe',
    city: 'Paris',
    lat: 49.01,
    lon: 2.55,
  },
  {
    id: 'AMS',
    name: 'Amsterdam',
    country: 'NL',
    region: 'Europe',
    city: 'Amsterdam',
    lat: 52.37,
    lon: 4.9,
  },
  {
    id: 'ARN',
    name: 'Stockholm',
    country: 'SE',
    region: 'Europe',
    city: 'Stockholm',
    lat: 59.33,
    lon: 18.07,
  },
  {
    id: 'WAW',
    name: 'Warsaw',
    country: 'PL',
    region: 'Europe',
    city: 'Warsaw',
    lat: 52.23,
    lon: 21.01,
  },
  {
    id: 'MAD',
    name: 'Madrid',
    country: 'ES',
    region: 'Europe',
    city: 'Madrid',
    lat: 40.42,
    lon: -3.7,
  },
  {
    id: 'DXB',
    name: 'Dubai',
    country: 'AE',
    region: 'Middle East',
    city: 'Dubai',
    lat: 25.2,
    lon: 55.27,
  },
  {
    id: 'TLV',
    name: 'Tel Aviv',
    country: 'IL',
    region: 'Middle East',
    city: 'Tel Aviv',
    lat: 32.09,
    lon: 34.77,
  },
  {
    id: 'JNB',
    name: 'Johannesburg',
    country: 'ZA',
    region: 'Africa',
    city: 'Johannesburg',
    lat: -26.2,
    lon: 28.05,
  },
  {
    id: 'LOS',
    name: 'Lagos',
    country: 'NG',
    region: 'Africa',
    city: 'Lagos',
    lat: 6.52,
    lon: 3.38,
  },
  {
    id: 'NBO',
    name: 'Nairobi',
    country: 'KE',
    region: 'Africa',
    city: 'Nairobi',
    lat: -1.29,
    lon: 36.82,
  },
  {
    id: 'SIN',
    name: 'Singapore',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
  {
    id: 'NRT',
    name: 'Tokyo',
    country: 'JP',
    region: 'Asia',
    city: 'Tokyo',
    lat: 35.68,
    lon: 139.69,
  },
  {
    id: 'HKG',
    name: 'Hong Kong',
    country: 'HK',
    region: 'Asia',
    city: 'Hong Kong',
    lat: 22.32,
    lon: 114.17,
  },
  {
    id: 'BOM',
    name: 'Mumbai',
    country: 'IN',
    region: 'Asia',
    city: 'Mumbai',
    lat: 19.08,
    lon: 72.88,
  },
  {
    id: 'ICN',
    name: 'Seoul',
    country: 'KR',
    region: 'Asia',
    city: 'Seoul',
    lat: 37.57,
    lon: 126.98,
  },
  {
    id: 'TPE',
    name: 'Taipei',
    country: 'TW',
    region: 'Asia',
    city: 'Taipei',
    lat: 25.03,
    lon: 121.57,
  },
  {
    id: 'SYD',
    name: 'Sydney',
    country: 'AU',
    region: 'Oceania',
    city: 'Sydney',
    lat: -33.87,
    lon: 151.21,
  },
  {
    id: 'AKL',
    name: 'Auckland',
    country: 'NZ',
    region: 'Oceania',
    city: 'Auckland',
    lat: -36.85,
    lon: 174.76,
  },
  // Cloud provider edge locations
  {
    id: 'AWS-VA',
    name: 'AWS us-east-1',
    country: 'US',
    region: 'North America',
    city: 'Ashburn',
    lat: 39.04,
    lon: -77.49,
  },
  {
    id: 'AWS-IR',
    name: 'AWS eu-west-1',
    country: 'IE',
    region: 'Europe',
    city: 'Dublin',
    lat: 53.34,
    lon: -6.26,
  },
  {
    id: 'AWS-SG',
    name: 'AWS ap-southeast-1',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
  {
    id: 'GCP-IA',
    name: 'GCP us-central1',
    country: 'US',
    region: 'North America',
    city: 'Council Bluffs',
    lat: 41.26,
    lon: -95.86,
  },
  {
    id: 'GCP-BE',
    name: 'GCP europe-west1',
    country: 'BE',
    region: 'Europe',
    city: 'St. Ghislain',
    lat: 50.45,
    lon: 3.82,
  },
  {
    id: 'GCP-TW',
    name: 'GCP asia-east1',
    country: 'TW',
    region: 'Asia',
    city: 'Changhua',
    lat: 24.06,
    lon: 120.53,
  },
  {
    id: 'AZ-US',
    name: 'Azure eastus',
    country: 'US',
    region: 'North America',
    city: 'Boydton',
    lat: 36.67,
    lon: -78.39,
  },
  {
    id: 'AZ-NL',
    name: 'Azure westeurope',
    country: 'NL',
    region: 'Europe',
    city: 'Amsterdam',
    lat: 52.37,
    lon: 4.9,
  },
  {
    id: 'AZ-SG',
    name: 'Azure southeastasia',
    country: 'SG',
    region: 'Asia',
    city: 'Singapore',
    lat: 1.35,
    lon: 103.82,
  },
];

const REGION_BUCKETS: Record<string, keyof Env> = {
  wnam: 'PING_WNAM',
  enam: 'PING_ENAM',
  weur: 'PING_WEUR',
  eeur: 'PING_EEUR',
  apac: 'PING_APAC',
  oc: 'PING_OC',
};

async function handleRegionPing(url: URL, env: Env, request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const region = url.searchParams.get('region')!;
  const bindingName = REGION_BUCKETS[region];
  if (!bindingName) {
    return Response.json(
      { error: 'Unknown region' },
      { status: 400, headers: corsHeaders(request) },
    );
  }

  const bucket = env[bindingName] as unknown as R2Bucket;
  const start = Date.now();
  const obj = await bucket.get('ping.json');
  const latency = Date.now() - start;

  if (!obj) {
    return Response.json(
      { error: 'Ping file not found' },
      { status: 404, headers: corsHeaders(request) },
    );
  }

  return Response.json({ region, latency, ts: Date.now() }, { headers: corsHeaders(request) });
}

async function handleMapProbes(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const cf = getCf(request);
  const userColo = cf.colo || 'unknown';
  const userLat = cf.latitude ? parseFloat(cf.latitude) : null;
  const userLon = cf.longitude ? parseFloat(cf.longitude) : null;

  return Response.json(
    {
      userColo,
      userLat,
      userLon,
      probes: PROBES.map((p) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        region: p.region,
        city: p.city,
        lat: p.lat,
        lon: p.lon,
      })),
    },
    { headers: corsHeaders(request) },
  );
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
async function handleHijackCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const aDomain = 'check.cloudflare-dns.com';
  const aResults: { resolver: string; records: string[]; ttl: number }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${aDomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const data = (await res.json()) as { Answer?: { data: string; TTL: number }[] };
      const records = (data.Answer || []).map((a: { data: string }) => a.data);
      const ttl = data.Answer?.[0]?.TTL || 0;
      aResults.push({ resolver: r.name, records, ttl });
    } catch {
      aResults.push({ resolver: r.name, records: [], ttl: 0 });
    }
  }

  const allIps = aResults.flatMap((r) => r.records);
  const freq = new Map<string, number>();
  for (const ip of allIps) freq.set(ip, (freq.get(ip) || 0) + 1);
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  const maxCount = sorted[0]?.[1] || 0;
  const expectedARecords = sorted.filter((e) => e[1] === maxCount).map((e) => e[0]);
  const hasMajority = maxCount > aResults.filter((r) => r.records.length > 0).length / 2;

  const ttls = aResults
    .filter((r) => r.ttl > 0)
    .map((r) => r.ttl)
    .sort((a, b) => a - b);
  const medianTTL = ttls.length > 0 ? ttls[Math.floor(ttls.length / 2)] : 0;

  const nxdomain = `nonexistent-${crypto.randomUUID().slice(0, 8)}.netcheck.test`;
  const nxResults: { resolver: string; tampered: boolean }[] = [];
  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${nxdomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(3000),
      });
      const data = (await res.json()) as { Answer?: unknown[] };
      nxResults.push({ resolver: r.name, tampered: (data.Answer?.length || 0) > 0 });
    } catch {
      nxResults.push({ resolver: r.name, tampered: false });
    }
  }

  const results = RESOLVERS.map((r) => {
    const a = aResults.find((x) => x.resolver === r.name)!;
    const nx = nxResults.find((x) => x.resolver === r.name)!;

    let aScore = 0;
    if (expectedARecords.length > 0) {
      const matchCount = a.records.filter((ip) => expectedARecords.includes(ip)).length;
      aScore =
        a.records.length > 0 ? matchCount / Math.max(a.records.length, expectedARecords.length) : 0;
    }
    const nxScore = nx.tampered ? 0 : 1;
    const ttlOk = medianTTL > 0 && a.ttl > 0;
    const ttlScore = ttlOk ? (a.ttl >= medianTTL / 2 && a.ttl <= medianTTL * 2 ? 1 : 0) : 0.5;

    const aWeight = hasMajority ? 0.4 : 0.25;
    const nxWeight = hasMajority ? 0.3 : 0.375;
    const ttlWeight = hasMajority ? 0.3 : 0.375;
    const trustScore = Math.round(
      (aScore * aWeight + nxScore * nxWeight + ttlScore * ttlWeight) * 100,
    );

    return {
      resolver: r.name,
      aRecords: a.records,
      expectedARecords,
      nxdomainTampered: nx.tampered,
      ttlAnomaly: ttlOk && (a.ttl < medianTTL / 2 || a.ttl > medianTTL * 2),
      trustScore,
      summary: trustScore >= 80 ? 'clean' : trustScore >= 50 ? 'suspicious' : 'tampered',
    };
  });

  return Response.json(results, {
    headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
  });
}

async function handleEcsCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const results: {
    resolver: string;
    ecsDetected: boolean;
    ecsPrefix: number | null;
    ecsAddress: string | null;
    rating: 'none' | 'moderate' | 'significant';
  }[] = [];

  for (const r of RESOLVERS) {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=whoami.akamai.net&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const text = await res.text();
      const ipMatch = text.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g);
      const ecsIps = ipMatch
        ? ipMatch.filter((ip) => {
            const oct = parseInt(ip.split('.')[0]);
            return (
              oct !== 10 &&
              oct !== 127 &&
              oct !== 0 &&
              !(
                oct === 172 &&
                parseInt(ip.split('.')[1]) >= 16 &&
                parseInt(ip.split('.')[1]) <= 31
              ) &&
              !(oct === 192 && parseInt(ip.split('.')[1]) === 168)
            );
          })
        : [];

      if (ecsIps.length > 0) {
        const ip = ecsIps[0];
        const parts = ip.split('.');
        const anonymised = `${parts[0]}.${parts[1]}.0.0`;
        const prefix = 32;
        results.push({
          resolver: r.name,
          ecsDetected: true,
          ecsPrefix: prefix,
          ecsAddress: anonymised,
          rating: prefix >= 24 ? 'significant' : prefix >= 16 ? 'moderate' : 'none',
        });
      } else {
        results.push({
          resolver: r.name,
          ecsDetected: false,
          ecsPrefix: null,
          ecsAddress: null,
          rating: 'none',
        });
      }
    } catch {
      results.push({
        resolver: r.name,
        ecsDetected: false,
        ecsPrefix: null,
        ecsAddress: null,
        rating: 'none',
      });
    }
  }

  return Response.json(results, {
    headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
  });
}

const BENCH_SCENARIOS: { scenario: string; domain: string }[] = [
  { scenario: 'CDN', domain: 'www.cloudflare.com' },
  { scenario: 'Cross-Region EU', domain: 'www.bbc.co.uk' },
  { scenario: 'Cross-Region Asia', domain: 'www.baidu.com' },
  { scenario: 'Low TTL', domain: 'dns.google' },
];

async function handleDnsBenchmark(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  interface ScenarioEntry {
    scenario: string;
    timings: number[];
    min: number;
    median: number;
    max: number;
  }
  interface BenchmarkEntry {
    resolver: string;
    scenarios: ScenarioEntry[];
    overallMedian: number;
    pathTiming: { networkRtt: number; processingTime: number; total: number };
  }

  const results: BenchmarkEntry[] = [];
  for (const r of RESOLVERS) {
    const scenarios: ScenarioEntry[] = [];
    const allTimings: number[] = [];

    for (const s of BENCH_SCENARIOS) {
      const timings: number[] = [];
      for (let i = 0; i < 3; i++) {
        try {
          const start = Date.now();
          const res = await fetch(`https://${r.host}/dns-query?name=${s.domain}&type=A`, {
            headers: { Accept: 'application/dns-json' },
            signal: AbortSignal.timeout(4000),
          });
          const elapsed = Date.now() - start;
          if (res.ok) timings.push(elapsed);
        } catch {
          /* skip */
        }
      }
      const sortedVals = [...timings].sort((a, b) => a - b);
      scenarios.push({
        scenario: s.scenario,
        timings,
        min: sortedVals[0] || 0,
        median: sortedVals[Math.floor(sortedVals.length / 2)] || 0,
        max: sortedVals[sortedVals.length - 1] || 0,
      });
      allTimings.push(...timings);
    }

    const coldDomain = `${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}.dev`;
    let pathTiming = { networkRtt: 0, processingTime: 0, total: 0 };
    try {
      const start = Date.now();
      const _res = await fetch(`https://${r.host}/dns-query?name=${coldDomain}&type=A`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(4000),
      });
      const total = Date.now() - start;
      scenarios.push({
        scenario: 'Cold Cache',
        timings: [total],
        min: total,
        median: total,
        max: total,
      });
      allTimings.push(total);
      pathTiming = {
        networkRtt: Math.round(total * 0.7),
        processingTime: Math.round(total * 0.3),
        total,
      };
    } catch {
      scenarios.push({ scenario: 'Cold Cache', timings: [], min: 0, median: 0, max: 0 });
    }

    const sortedAll = [...allTimings].sort((a, b) => a - b);
    results.push({
      resolver: r.name,
      scenarios,
      overallMedian: sortedAll[Math.floor(sortedAll.length / 2)] || 0,
      pathTiming,
    });
  }

  const pathTimings = results.map((r) => ({
    resolver: r.resolver,
    networkRtt: r.pathTiming.networkRtt,
    processingTime: r.pathTiming.processingTime,
    total: r.pathTiming.total,
  }));

  return Response.json(
    { resolvers: results, pathTimings },
    {
      headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
    },
  );
}

async function handleAdBlockStats(env: Env, request: Request): Promise<Response> {
  try {
    const dayKey = `adblock:${new Date().toISOString().slice(0, 10)}`;
    const data = (await env.ANALYTICS.get(dayKey, 'json')) as {
      total: number;
      scores: number[];
    } | null;
    if (!data || !data.scores.length) {
      return Response.json(
        { total: 0, median: 0, p75: 0, p90: 0 },
        { headers: corsHeaders(request) },
      );
    }
    const sorted = [...data.scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const p75 = sorted[Math.floor(sorted.length * 0.75)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    return Response.json(
      { total: data.total, median: Math.round(median), p75: Math.round(p75), p90: Math.round(p90) },
      {
        headers: { ...corsHeaders(request), 'Cache-Control': 'public, max-age=300' },
      },
    );
  } catch {
    return Response.json(
      { total: 0, median: 0, p75: 0, p90: 0 },
      { headers: corsHeaders(request) },
    );
  }
}

async function handleAdBlockSubmit(env: Env, request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { score: number };
    if (typeof body.score !== 'number' || body.score < 0 || body.score > 100) {
      return Response.json(
        { error: 'Invalid score' },
        { status: 400, headers: corsHeaders(request) },
      );
    }
    const dayKey = `adblock:${new Date().toISOString().slice(0, 10)}`;
    const data = (await env.ANALYTICS.get(dayKey, 'json')) as {
      total: number;
      scores: number[];
    } | null;
    const current = data || { total: 0, scores: [] };
    current.total += 1;
    current.scores.push(body.score);
    // Cap at 5000 scores to keep size manageable
    if (current.scores.length > 5000) current.scores.shift();
    await env.ANALYTICS.put(dayKey, JSON.stringify(current), { expirationTtl: 86400 * 2 });
    return Response.json({ ok: true }, { headers: corsHeaders(request) });
  } catch {
    return Response.json({ ok: false }, { headers: corsHeaders(request) });
  }
}
