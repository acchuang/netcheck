import { RESOLVERS, type ResolverInfo } from "../shared/resolvers.ts";
import {
  dohQuery, parseWhoami, DNSSEC_BOGUS_DOMAIN, ECS_PROBE_DOMAIN, AD_PROBE_DOMAIN, type DnsMessage,
} from "../shared/dns-wire.ts";
import { ipScope } from "../shared/ip-classify.ts";

export default {
  async fetch(request: Request, env?: Record<string, string>): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";

    if (url.pathname === "/api/ip") {
      return handleIpCheck(request);
    }

    if (url.pathname === "/api/dns") {
      if (isRateLimited(clientIp, "dns")) return rateLimitedResponse();
      return handleDnsCheck(request);
    }

    if (url.pathname === "/api/dns/probe-result") {
      return handleProbeResult(request, env);
    }

    if (url.pathname === "/api/headers") {
      return handleHeaders(request);
    }

    if (url.pathname === "/api/headers/check") {
      if (isRateLimited(clientIp, "headers-check")) return rateLimitedResponse();
      return handleHeadersCheck(request);
    }

    if (url.pathname === "/api/dns/check-resolvers") {
      if (isRateLimited(clientIp, "dns")) return rateLimitedResponse();
      return handleResolverCheck();
    }

    if (url.pathname === "/api/dns/compare") {
      if (isRateLimited(clientIp, "dns")) return rateLimitedResponse();
      return handleDnsCompare(url);
    }

    if (url.pathname === "/api/speedtest/ping") {
      const cf = getCf(request);
      const colo = cf.colo || "unknown";
      return new Response("pong", {
        headers: {
          ...corsHeaders(),
          "x-colo": colo,
          "x-lat": cf?.latitude || "",
          "x-lon": cf?.longitude || "",
          "Access-Control-Expose-Headers": "x-colo, x-lat, x-lon",
        },
      });
    }

    if (url.pathname === "/api/speedtest/fast-targets") {
      return handleFastTargets();
    }

    if (url.pathname === "/api/speedtest/ookla-targets") {
      return handleOoklaTargets(request);
    }

    if (url.pathname === "/api/speedtest/down") {
      return handleSpeedDown(url);
    }

    if (url.pathname === "/api/speedtest/up" && request.method === "POST") {
      return handleSpeedUp(request);
    }

    // Static assets handled by wrangler assets binding
    return new Response("Not Found", { status: 404 });
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

function handleIpCheck(request: Request): Response {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const country = request.headers.get("cf-ipcountry") || "unknown";
  const cf = getCf(request);

  return Response.json({
    ip,
    country,
    colo: cf.colo || "unknown",
    asn: cf.asn || null,
    asOrganization: cf.asOrganization || null,
    city: cf.city || null,
    region: cf.region || null,
    timezone: cf.timezone || null,
    httpProtocol: cf.httpProtocol || null,
    tlsVersion: cf.tlsVersion || null,
    tlsCipher: cf.tlsCipher || null,
    clientTcpRtt: cf.clientTcpRtt || null,
  }, { headers: corsHeaders() });
}

// Hostnames get encoded straight into a DNS packet, so validate at the boundary
// rather than letting a malformed label produce a garbage query.
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

function isValidHostname(name: string): boolean {
  return HOSTNAME_RE.test(name);
}

async function handleDnsCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") || "example.com";
  const type = url.searchParams.get("type") || "A";

  if (!isValidHostname(domain)) {
    return Response.json({ error: "Invalid domain" }, { status: 400, headers: corsHeaders() });
  }

  try {
    const msg = await dohQuery("cloudflare-dns.com", domain, type, { dnssecOk: true });
    return Response.json(msg, { headers: corsHeaders() });
  } catch (err) {
    return Response.json(
      { error: "DNS lookup failed", detail: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function handleHeaders(request: Request): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of request.headers) {
    headers[key] = value;
  }
  return Response.json({ headers }, { headers: corsHeaders() });
}

export function handleSpeedDown(url: URL): Response {
  const bytes = Math.min(parseInt(url.searchParams.get("bytes") || "0", 10), 100_000_000);
  if (bytes <= 0) {
    return new Response("", { headers: corsHeaders() });
  }

  const CHUNK_SIZE = 64 * 1024;
  const chunk = new Uint8Array(CHUNK_SIZE);
  for (let i = 0; i < CHUNK_SIZE; i += 1024) {
    chunk[i] = (i * 7 + 13) & 0xff;
  }

  let remaining = bytes;
  const stream = new ReadableStream({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }
      const sendSize = Math.min(remaining, CHUNK_SIZE);
      controller.enqueue(sendSize === CHUNK_SIZE ? chunk : chunk.subarray(0, sendSize));
      remaining -= sendSize;
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store",
    },
  });
}

// api.fast.com sends no CORS headers, so the browser can't do URL discovery
// itself; proxy only this tiny JSON call — speed traffic goes browser -> OCA direct.
// The token is the public one embedded in fast.com's own client JS (stable for years).
// Cached across visitors via the edge Cache API — targets stay valid for hours, so there's
// no need to hit api.fast.com on every single page load.
const FAST_TARGETS_CACHE_KEY = new Request("https://netcheck.internal/cache/fast-targets");

async function handleFastTargets(): Promise<Response> {
  // ponytail: DOM lib's ambient `caches` shadows workers-types' (which has `.default`), and the
  // global only exists in the Workers runtime — cast + access lazily so `node --test` (no `caches`
  // global) can still import this file without touching the shared tsconfig's lib/types.
  const edgeCache = caches as unknown as { default: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } };
  const cached = await edgeCache.default.match(FAST_TARGETS_CACHE_KEY);
  if (cached) return cached;
  try {
    const res = await fetch(
      "https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=3",
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    const response = Response.json(data, { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=900" } });
    await edgeCache.default.put(FAST_TARGETS_CACHE_KEY, response.clone());
    return response;
  } catch (err) {
    return Response.json(
      { error: "fast.com discovery failed", detail: String(err) },
      { status: 502, headers: corsHeaders() }
    );
  }
}

// Same pattern as fast.com: servers.php sends no CORS headers, so proxy the tiny
// discovery call and let speed traffic go browser -> Ookla host direct. Targets
// are rewritten to https — most Ookla hosts serve TLS on their 8080 port.
// servers.php geolocates purely by the requesting IP (the worker's US egress,
// useless to visitors) and ignores lat/lon params, but its `search` param is a
// true text filter over name/country/sponsor. Search by the visitor's city from
// request.cf, fall back to a country-name map, and key the cache per term.
const COUNTRY_SEARCH: Record<string, string> = {
  AU: "Australia", NZ: "New Zealand", US: "United States", CA: "Canada", GB: "United Kingdom",
  IE: "Ireland", DE: "Germany", FR: "France", NL: "Netherlands", BE: "Belgium",
  CH: "Switzerland", AT: "Austria", IT: "Italy", ES: "Spain", PT: "Portugal",
  SE: "Sweden", NO: "Norway", FI: "Finland", DK: "Denmark", PL: "Poland",
  CZ: "Czech Republic", RU: "Russia", UA: "Ukraine", RO: "Romania", GR: "Greece",
  TR: "Turkey", IL: "Israel", AE: "United Arab Emirates", SA: "Saudi Arabia", ZA: "South Africa",
  EG: "Egypt", NG: "Nigeria", IN: "India", PK: "Pakistan", BD: "Bangladesh",
  LK: "Sri Lanka", TH: "Thailand", VN: "Vietnam", PH: "Philippines", ID: "Indonesia",
  MY: "Malaysia", SG: "Singapore", HK: "Hong Kong", TW: "Taiwan", KR: "South Korea",
  JP: "Japan", CN: "China", BR: "Brazil", MX: "Mexico", AR: "Argentina",
  CL: "Chile", CO: "Colombia",
};

async function handleOoklaTargets(request: Request): Promise<Response> {
  const cf = getCf(request);
  const city = cf.city?.trim() || "";
  const country = request.headers.get("cf-ipcountry")?.toUpperCase() || "";
  const search = city || COUNTRY_SEARCH[country] || "";
  const edgeCache = caches as unknown as { default: { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> } };
  const cacheKey = new Request(`https://netcheck.internal/cache/ookla-targets/${search || "any"}`);
  const cached = await edgeCache.default.match(cacheKey);
  if (cached) return cached;
  try {
    const q = search ? `&search=${encodeURIComponent(search)}` : "";
    const res = await fetch(
      `https://www.speedtest.net/api/js/servers.php?engine=js&limit=8${q}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const servers = (await res.json()) as {
      url?: string;
      lat?: string;
      lon?: string;
      name?: string;
      sponsor?: string;
      id?: string;
      https_functional?: number;
    }[];
    const targets = servers
      .filter((s) => s.https_functional === 1 && s.url?.startsWith("http://"))
      .map((s) => ({
        url: s.url!.replace("http://", "https://"),
        name: s.name ?? "",
        sponsor: s.sponsor ?? "",
        id: s.id ?? "",
        lat: s.lat != null ? parseFloat(s.lat) : null,
        lon: s.lon != null ? parseFloat(s.lon) : null,
      }));
    const response = Response.json({ targets }, { headers: { ...corsHeaders(), "Cache-Control": "public, max-age=900" } });
    await edgeCache.default.put(cacheKey, response.clone());
    return response;
  } catch (err) {
    return Response.json(
      { error: "Ookla discovery failed", detail: String(err) },
      { status: 502, headers: corsHeaders() }
    );
  }
}

async function handleSpeedUp(request: Request): Promise<Response> {
  const body = await request.arrayBuffer();
  return Response.json({ bytes: body.byteLength }, { headers: corsHeaders() });
}

interface ResolverProbe extends ResolverInfo {
  reachable: boolean;
  latency: number | null;
  /** null when the probe couldn't reach a verdict. */
  validatesDnssec: boolean | null;
  /** Extended DNS Error text explaining a SERVFAIL, when the resolver sends one. */
  dnssecDetail: string | null;
  forwardsEcs: boolean | null;
  /** Subnet the resolver forwarded — of *this Worker*, not the visitor. */
  ecsSubnet: string | null;
  egressIp: string | null;
  filtering: boolean;
}

// 4 subrequests per resolver x 8 resolvers = 32, comfortably under the Workers
// per-request subrequest cap. Add probes here with that ceiling in mind.
async function testOneResolver(resolver: ResolverInfo): Promise<ResolverProbe> {
  const base: ResolverProbe = {
    ...resolver,
    reachable: false,
    latency: null,
    validatesDnssec: null,
    dnssecDetail: null,
    forwardsEcs: null,
    ecsSubnet: null,
    egressIp: null,
    filtering: false,
  };

  let control: DnsMessage & { latency: number };
  try {
    control = await dohQuery(resolver.host, "example.com", "A", { dnssecOk: true, timeoutMs: 4000 });
  } catch {
    return base;
  }
  if (control.Status !== 0) return base;

  const [bogus, whoami, filter] = await Promise.all([
    dohQuery(resolver.host, DNSSEC_BOGUS_DOMAIN, "A", { dnssecOk: true, timeoutMs: 4000 }).catch(() => null),
    dohQuery(resolver.host, ECS_PROBE_DOMAIN, "TXT", { timeoutMs: 4000 }).catch(() => null),
    dohQuery(resolver.host, AD_PROBE_DOMAIN, "A", { timeoutMs: 4000 }).catch(() => null),
  ]);

  // SERVFAIL on the bogus zone is the validation signal. The control query
  // already proved the resolver works, so a failure here is about DNSSEC, not
  // reachability. NXDOMAIN means the resolver blocked it for some other reason
  // (filtering), which tells us nothing about validation.
  let validatesDnssec: boolean | null = null;
  let dnssecDetail: string | null = null;
  if (bogus) {
    if (bogus.Status === 2) {
      validatesDnssec = true;
      dnssecDetail = bogus.ede?.text || null;
    } else if (bogus.Status === 0 && bogus.Answer.length > 0) {
      validatesDnssec = false;
    }
  }

  const { egressIp, ecsSubnet } = whoami ? parseWhoami(whoami) : { egressIp: null, ecsSubnet: null };

  const filtering = filter
    ? filter.Status === 3 ||
      filter.Answer.length === 0 ||
      filter.Answer.some((a) => a.data === "0.0.0.0" || a.data === "127.0.0.1" || a.data === "::")
    : false;

  return {
    ...base,
    reachable: true,
    latency: control.latency,
    validatesDnssec,
    dnssecDetail,
    forwardsEcs: whoami ? ecsSubnet !== null : null,
    ecsSubnet,
    egressIp,
    filtering,
  };
}

async function handleResolverCheck(): Promise<Response> {
  const results = await Promise.all(RESOLVERS.map(testOneResolver));
  return Response.json(results, { headers: corsHeaders() });
}

// Resolve the same domain through every resolver so the client can diff
// answers (hijack / captive-portal signal; CDN geo-routing causes benign diffs).
async function handleDnsCompare(url: URL): Promise<Response> {
  const domain = url.searchParams.get("domain") || "example.com";
  if (!isValidHostname(domain)) {
    return Response.json({ error: "Invalid domain" }, { status: 400, headers: corsHeaders() });
  }
  const results = await Promise.all(RESOLVERS.map(async (r) => {
    try {
      const msg = await dohQuery(r.host, domain, "A", { timeoutMs: 4000 });
      const ips = msg.Answer.filter((a) => a.type === 1).map((a) => a.data).sort();
      return { name: r.name, ok: true, ips };
    } catch {
      return { name: r.name, ok: false, ips: [] as string[] };
    }
  }));
  return Response.json(results, { headers: corsHeaders() });
}

const SECURITY_HEADERS = [
  { key: "strict-transport-security", name: "Strict-Transport-Security (HSTS)", desc: "Forces HTTPS connections, preventing downgrade attacks" },
  { key: "content-security-policy", name: "Content-Security-Policy (CSP)", desc: "Controls which resources the browser can load, mitigating XSS" },
  { key: "x-content-type-options", name: "X-Content-Type-Options", desc: "Prevents MIME type sniffing attacks", expected: "nosniff" },
  { key: "x-frame-options", name: "X-Frame-Options", desc: "Prevents clickjacking by controlling iframe embedding" },
  { key: "referrer-policy", name: "Referrer-Policy", desc: "Controls how much referrer information is sent with requests" },
  { key: "permissions-policy", name: "Permissions-Policy", desc: "Controls which browser features the page can use" },
  { key: "x-xss-protection", name: "X-XSS-Protection", desc: "Legacy XSS filter (mostly superseded by CSP)" },
  { key: "cross-origin-opener-policy", name: "Cross-Origin-Opener-Policy (COOP)", desc: "Isolates browsing context from cross-origin popups" },
  { key: "cross-origin-embedder-policy", name: "Cross-Origin-Embedder-Policy (COEP)", desc: "Requires CORS/CORP for all cross-origin resources" },
  { key: "cross-origin-resource-policy", name: "Cross-Origin-Resource-Policy (CORP)", desc: "Controls which origins can embed this resource" },
];

// --- SSRF guard ---
//
// This endpoint fetches an arbitrary caller-supplied URL server-side. Reject
// non-http(s) schemes outright, and resolve the hostname via DoH (Workers have
// no raw socket DNS) so we can block private/loopback/link-local/multicast
// targets — including the 169.254.169.254 cloud metadata address — before the
// real fetch ever goes out.
//
// ponytail: this is check-then-use, not a hard pin — `fetch()`'s own DNS
// resolution happens independently of the DoH check above, so a rebinding
// attacker who flips A/AAAA between the two lookups could slip through.
// Workers' only IP-pinning knob (`cf.resolveOverride`) only works for
// hostnames proxied on this zone, so it can't pin a fetch to an arbitrary
// external target — a real fix needs a hand-rolled TLS+HTTP client over
// `cloudflare:sockets`. Not worth it here: Workers egress has no metadata
// service or internal network behind it, so the worst a rebind reaches is
// the sandboxed runtime's own loopback. Revisit if this Worker ever gets a
// service binding, Tunnel, or VPC route into something private.
// ipBytes() (used by ipScope) already strips brackets from IPv6 literals and
// handles IPv4-mapped v6 addresses, so this is a thin wrapper — the range
// math itself lives once in ip-classify.ts, shared with the WebRTC leak
// check, instead of duplicated here (a prior duplicate copy missed the CGNAT
// range that ip-classify.ts carries after an earlier false-positive fix).
function isPrivateOrReservedIp(ip: string): boolean {
  return ipScope(ip) !== "public";
}

async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  // A bare IP literal as the hostname — no DNS involved.
  if (isPrivateOrReservedIp(hostname)) return true;

  const results = await Promise.allSettled([
    dohQuery("cloudflare-dns.com", hostname, "A", { timeoutMs: 4000 }),
    dohQuery("cloudflare-dns.com", hostname, "AAAA", { timeoutMs: 4000 }),
  ]);

  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const answer of r.value.Answer) {
      if ((answer.type === 1 || answer.type === 28) && isPrivateOrReservedIp(answer.data)) {
        return true;
      }
    }
  }
  return false;
}

// --- per-IP rate limit (mirrors probe-server/server.ts's crude in-memory counter) ---
// ponytail: per-isolate, not durable/global — fine for "resist casual abuse",
// swap for a Workers Rate Limiting binding if this needs to hold across isolates.
// "dns" also covers /api/dns/check-resolvers and /api/dns/compare, which each
// fan out to all 8 resolvers per request — same abuse shape as headers-check.
const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = { "headers-check": 20, dns: 20 };
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, bucket: keyof typeof RATE_LIMITS): boolean {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (rateBuckets.size > 10_000) {
    for (const [k, e] of rateBuckets) if (now > e.resetAt) rateBuckets.delete(k);
  }
  return entry.count > RATE_LIMITS[bucket];
}

function rateLimitedResponse(): Response {
  return Response.json({ error: "Rate limit exceeded, try again shortly" }, { status: 429, headers: corsHeaders() });
}

const TOKEN_RE = /^[a-f0-9]{16,64}$/;

async function handleProbeResult(request: Request, env?: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  if (!TOKEN_RE.test(token)) {
    return Response.json({ error: "Invalid or missing token" }, { status: 400, headers: corsHeaders() });
  }

  const probeUrl = env?.PROBE_SERVER_URL || "http://127.0.0.1:8099";
  const probeSecret = env?.PROBE_SECRET || "dev";

  try {
    const res = await fetch(`${probeUrl}/lookup?token=${encodeURIComponent(token)}`, {
      headers: { "x-probe-secret": probeSecret },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = await res.json();
      return Response.json(data, { headers: corsHeaders() });
    }
  } catch {
    // Probe server may be offline or unconfigured in dev/preview
  }
  return Response.json({ token, resolvers: [] }, { headers: corsHeaders() });
}

async function handleHeadersCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return Response.json({ error: "Missing ?url= parameter" }, { status: 400, headers: corsHeaders() });
  }

  let targetUrl: string;
  try {
    // Only skip the https:// prefix when the input already names a scheme —
    // `target.startsWith("http")` alone let "ftp://…" through un-prefixed,
    // which `new URL` then parsed as host "ftp" under an https:// scheme
    // instead of the ftp: scheme it should have been rejected for.
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(target);
    const parsed = new URL(hasScheme ? target : `https://${target}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return Response.json({ error: "Only http(s) URLs are allowed" }, { status: 400, headers: corsHeaders() });
    }
    targetUrl = parsed.href;
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400, headers: corsHeaders() });
  }

  try {
    let currentUrl = targetUrl;
    let res: Response | null = null;
    const MAX_REDIRECTS = 5;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
      const parsedUrl = new URL(currentUrl);
      if (await resolvesToPrivateIp(parsedUrl.hostname)) {
        return Response.json(
          { error: "Target resolves to a private, loopback, link-local, or multicast address" },
          { status: 400, headers: corsHeaders() }
        );
      }

      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "NetCheck Security Scanner/1.0" },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) break;
        try {
          const nextUrl = new URL(location, currentUrl);
          if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
            return Response.json({ error: "Redirected to non-http(s) URL" }, { status: 400, headers: corsHeaders() });
          }
          currentUrl = nextUrl.href;
          if (redirectCount === MAX_REDIRECTS) {
            return Response.json({ error: "Too many redirects" }, { status: 400, headers: corsHeaders() });
          }
          continue;
        } catch {
          break;
        }
      }
      break;
    }

    if (!res) {
      return Response.json({ error: "Failed to fetch URL" }, { status: 500, headers: corsHeaders() });
    }

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
    const grade = present >= 8 ? "A" : present >= 6 ? "B" : present >= 4 ? "C" : present >= 2 ? "D" : "F";

    return Response.json({
      url: currentUrl,
      statusCode: res.status,
      grade,
      score: { present, total },
      checks,
      server: headers["server"] || null,
      poweredBy: headers["x-powered-by"] || null,
    }, { headers: corsHeaders() });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch URL", detail: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Range",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };
}
