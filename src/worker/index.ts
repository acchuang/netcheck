export default {
  async fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

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

    if (url.pathname === "/api/speedtest/down") {
      return handleSpeedDown(url, request);
    }

    if (url.pathname === "/api/speedtest/up" && request.method === "POST") {
      return handleSpeedUp(request);
    }

    return Response.json({ error: "Not Found" }, { status: 404, headers: corsHeaders() });
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

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(request: Request): Response | null {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return null;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return Response.json(
      { error: "Rate limit exceeded", retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - entry.windowStart)) / 1000) },
      { status: 429, headers: { ...corsHeaders(), "Retry-After": "60" } }
    );
  }

  return null;
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return true;
  if (hostname.endsWith(".internal") || hostname.endsWith(".test") || hostname.endsWith(".example")) return true;
  const parts = hostname.split(".");
  if (parts.length <= 1) return true;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(hostname)) return true;
  return false;
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

  const bytes = Math.min(parseInt(url.searchParams.get("bytes") || "0", 10), 100000000);
  if (bytes <= 0) {
    return new Response("", { headers: corsHeaders() });
  }
  const block = getRandomBlock();
  const data = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += block.length) {
    const chunkSize = Math.min(block.length, bytes - offset);
    data.set(block.subarray(0, chunkSize), offset);
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

async function handleSpeedUp(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const body = await request.arrayBuffer();
  return Response.json({ bytes: body.byteLength }, { headers: corsHeaders() });
}

interface ResolverDef {
  name: string;
  host: string;
  ip: string;
  desc: string;
}

const RESOLVERS: ResolverDef[] = [
  { name: "Cloudflare", host: "cloudflare-dns.com", ip: "1.1.1.1", desc: "Fast, privacy-focused" },
  { name: "Google", host: "dns.google", ip: "8.8.8.8", desc: "Reliable, global" },
  { name: "Quad9", host: "dns.quad9.net", ip: "9.9.9.9", desc: "Security-focused, threat blocking" },
  { name: "OpenDNS", host: "dns.opendns.com", ip: "208.67.222.222", desc: "Cisco Umbrella, filtering" },
  { name: "AdGuard DNS", host: "dns.adguard-dns.com", ip: "94.140.14.14", desc: "Ad & tracker blocking" },
  { name: "Cloudflare Families", host: "family.cloudflare-dns.com", ip: "1.1.1.3", desc: "Malware + adult content filter" },
  { name: "NextDNS", host: "dns.nextdns.io", ip: "45.90.28.0", desc: "Customizable, analytics" },
  { name: "Mullvad DNS", host: "dns.mullvad.net", ip: "194.242.2.2", desc: "Privacy, no logging" },
];

async function testOneResolver(resolver: ResolverDef) {
  const dohBase = `https://${resolver.host}/dns-query`;

  try {
    const start = Date.now();
    const res = await fetch(`${dohBase}?name=example.com&type=A`, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(4000),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { ...resolver, reachable: false, latency: null, dnssec: false, filtering: false };

    let dnssec = false;
    try {
      const dnssecRes = await fetch(`${dohBase}?name=cloudflare.com&type=A&do=1`, {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(3000),
      });
      const dnssecData = await dnssecRes.json() as { AD?: boolean };
      dnssec = !!dnssecData.AD;
    } catch { /* ignore */ }

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

const SECURITY_HEADERS = [
  { key: "strict-transport-security", name: "headers.hsts", desc: "headers.hsts.desc" },
  { key: "content-security-policy", name: "headers.csp", desc: "headers.csp.desc" },
  { key: "x-content-type-options", name: "headers.xcto", desc: "headers.xcto.desc" },
  { key: "x-frame-options", name: "headers.xfo", desc: "headers.xfo.desc" },
  { key: "referrer-policy", name: "headers.rp", desc: "headers.rp.desc" },
  { key: "permissions-policy", name: "headers.pp", desc: "headers.pp.desc" },
  { key: "x-xss-protection", name: "headers.xxss", desc: "headers.xxss.desc" },
  { key: "cross-origin-opener-policy", name: "headers.coop", desc: "headers.coop.desc" },
  { key: "cross-origin-embedder-policy", name: "headers.coep", desc: "headers.coep.desc" },
  { key: "cross-origin-resource-policy", name: "headers.corp", desc: "headers.corp.desc" },
];

async function handleHeadersCheck(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return Response.json({ error: "Missing ?url= parameter" }, { status: 400, headers: corsHeaders() });
  }

  let targetUrl: string;
  try {
    const parsed = new URL(target.startsWith("http") ? target : `https://${target}`);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return Response.json({ error: "Only HTTP/HTTPS URLs are allowed" }, { status: 400, headers: corsHeaders() });
    }
    if (isPrivateHostname(parsed.hostname)) {
      return Response.json({ error: "Private/internal hostnames are not allowed" }, { status: 400, headers: corsHeaders() });
    }
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };
}