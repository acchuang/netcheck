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

    if (url.pathname === "/api/speedtest/ping") {
      return new Response("pong", { headers: corsHeaders() });
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

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };
}
