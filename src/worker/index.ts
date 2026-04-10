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

    if (url.pathname === "/api/dns/check-resolvers") {
      return handleResolverCheck();
    }

    if (url.pathname === "/api/speedtest/ping") {
      const colo = request.headers.get("cf-ray")?.split("-")[1] || "unknown";
      return new Response("pong", {
        headers: { ...corsHeaders(), "x-colo": colo },
      });
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

function handleIpCheck(request: Request): Response {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
  const country = request.headers.get("cf-ipcountry") || "unknown";
  const colo = request.headers.get("cf-ray")?.split("-")[1] || "unknown";
  const asn = (request as unknown as { cf?: { asn?: number; asOrganization?: string; city?: string; region?: string; timezone?: string } }).cf?.asn || null;
  const asOrg = (request as unknown as { cf?: { asn?: number; asOrganization?: string; city?: string; region?: string; timezone?: string } }).cf?.asOrganization || null;
  const city = (request as unknown as { cf?: { asn?: number; asOrganization?: string; city?: string; region?: string; timezone?: string } }).cf?.city || null;
  const region = (request as unknown as { cf?: { asn?: number; asOrganization?: string; city?: string; region?: string; timezone?: string } }).cf?.region || null;
  const timezone = (request as unknown as { cf?: { asn?: number; asOrganization?: string; city?: string; region?: string; timezone?: string } }).cf?.timezone || null;

  return Response.json({
    ip,
    country,
    colo,
    asn,
    asOrganization: asOrg,
    city,
    region,
    timezone,
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

function handleSpeedDown(url: URL): Response {
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

async function handleSpeedUp(request: Request): Promise<Response> {
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

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
}
