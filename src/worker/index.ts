import { RESOLVERS, type ResolverInfo } from "../shared/resolvers.ts";

export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/ip") {
      return handleIpCheck(request);
    }

    if (url.pathname === "/api/dns") {
      return handleDnsCheck(request);
    }

    if (url.pathname === "/api/headers") {
      return handleHeaders(request);
    }

    if (url.pathname === "/api/headers/check") {
      return handleHeadersCheck(request);
    }

    if (url.pathname === "/api/dns/check-resolvers") {
      return handleResolverCheck();
    }

    if (url.pathname === "/api/dns/compare") {
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

async function handleDnsCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain") || "example.com";
  const type = url.searchParams.get("type") || "A";

  // Use Cloudflare DoH to perform DNS lookups
  const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${encodeURIComponent(type)}`;

  try {
    const dnsResponse = await fetch(dohUrl, {
      headers: { Accept: "application/dns-json" },
    });
    const dnsData = await dnsResponse.json();
    return Response.json(dnsData, { headers: corsHeaders() });
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
  const bytes = Math.min(parseInt(url.searchParams.get("bytes") || "0", 10), 100000000);
  if (bytes <= 0) {
    return new Response("", { headers: corsHeaders() });
  }
  // Generate random-ish data to prevent compression
  const data = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i += 1024) {
    data[i] = (i * 7 + 13) & 0xff;
  }
  return new Response(data, {
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

async function handleSpeedUp(request: Request): Promise<Response> {
  const body = await request.arrayBuffer();
  return Response.json({ bytes: body.byteLength }, { headers: corsHeaders() });
}

async function testOneResolver(resolver: ResolverInfo) {
  const dohBase = `https://${resolver.host}/dns-query`;

  try {
    // Latency + basic resolution
    const start = Date.now();
    const res = await fetch(`${dohBase}?name=example.com&type=A`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };

    // DNSSEC check (AD flag on a signed domain)
    let dnssec = false;
    try {
      const dnssecRes = await fetch(`${dohBase}?name=cloudflare.com&type=A&do=1`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const dnssecData = await dnssecRes.json() as { AD?: boolean };
      dnssec = !!dnssecData.AD;
    } catch { /* ignore */ }

    // Filtering check — resolve a known ad/tracker domain and see if it's blocked
    let filtering = false;
    try {
      const filterRes = await fetch(`${dohBase}?name=ads.google.com&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const filterData = await filterRes.json() as { Answer?: { data: string }[]; Status?: number };
      const blocked = !filterData.Answer || filterData.Answer.length === 0 ||
        filterData.Answer.some((a: { data: string }) => a.data === "0.0.0.0" || a.data === "127.0.0.1") ||
        filterData.Status === 3;
      filtering = blocked;
    } catch { /* ignore */ }

    return { ...resolver, reachable: true, latency, dnssec, filtering };
  } catch {
    return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };
  }
}

async function handleResolverCheck(): Promise<Response> {
  const results = await Promise.all(RESOLVERS.map(testOneResolver));
  return Response.json(results, { headers: corsHeaders() });
}

// Resolve the same domain through every resolver so the client can diff
// answers (hijack / captive-portal signal; CDN geo-routing causes benign diffs).
async function handleDnsCompare(url: URL): Promise<Response> {
  const domain = url.searchParams.get("domain") || "example.com";
  const results = await Promise.all(RESOLVERS.map(async (r) => {
    try {
      const res = await fetch(`https://${r.host}/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json() as { Answer?: { type: number; data: string }[] };
      const ips = (data.Answer || []).filter((a) => a.type === 1).map((a) => a.data).sort();
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

async function handleHeadersCheck(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return Response.json({ error: "Missing ?url= parameter" }, { status: 400, headers: corsHeaders() });
  }

  let targetUrl: string;
  try {
    const parsed = new URL(target.startsWith("http") ? target : `https://${target}`);
    targetUrl = parsed.href;
  } catch {
    return Response.json({ error: "Invalid URL" }, { status: 400, headers: corsHeaders() });
  }

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "NetCheck Security Scanner/1.0" },
    });

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
      url: targetUrl,
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
}
