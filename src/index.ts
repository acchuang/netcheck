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

    if (url.pathname === "/api/speedtest/proxy") {
      return handleSpeedProxy(url);
    }

    if (url.pathname === "/api/speedtest/proxy/ping") {
      return handleProxyPing(url);
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

// Allowed hostnames for proxy speed test — prevents open-relay abuse
const PROXY_ALLOWLIST = new Set([
  // AWS S3 regions
  "s3.amazonaws.com",
  "s3.us-east-1.amazonaws.com",
  "s3.us-west-2.amazonaws.com",
  "s3.eu-west-1.amazonaws.com",
  "s3.ap-southeast-1.amazonaws.com",
  "s3.ap-northeast-1.amazonaws.com",
  // GCP
  "storage.googleapis.com",
  // Azure
  "azurespeed.azurewebsites.net",
  // DigitalOcean
  "speedtest-ams3.digitalocean.com",
  "speedtest-sgp1.digitalocean.com",
  "speedtest-nyc3.digitalocean.com",
  "speedtest-sfo3.digitalocean.com",
  "speedtest-lon1.digitalocean.com",
  "speedtest-blr1.digitalocean.com",
  "speedtest-syd1.digitalocean.com",
  // Vultr
  "fra-de-ping.vultr.com",
  "sgp-ping.vultr.com",
  "nrt-jp-ping.vultr.com",
  "lax-us-ping.vultr.com",
  "chi-us-ping.vultr.com",
  "ewr-us-ping.vultr.com",
  "syd-au-ping.vultr.com",
  "lon-gb-ping.vultr.com",
  // Hetzner
  "speed.hetzner.de",
  // OVH
  "proof.ovh.net",
  // Tele2
  "speedtest.tele2.net",
  // Linode/Akamai
  "speedtest.singapore.linode.com",
  "speedtest.tokyo2.linode.com",
  "speedtest.london.linode.com",
  "speedtest.newark.linode.com",
  "speedtest.fremont.linode.com",
  "speedtest.atlanta.linode.com",
  // Scaleway
  "ping.online.net",
  // FDC
  "lg.lax-us.fdcservers.net",
  "lg.nyc-us.fdcservers.net",
  "lg.chi-us.fdcservers.net",
]);

async function handleSpeedProxy(url: URL): Promise<Response> {
  const target = url.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url parameter" }, { status: 400, headers: corsHeaders() });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400, headers: corsHeaders() });
  }

  if (!PROXY_ALLOWLIST.has(targetUrl.hostname)) {
    return Response.json({ error: "Host not allowed" }, { status: 403, headers: corsHeaders() });
  }

  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(30000),
      headers: { "User-Agent": "NetCheck-SpeedTest/1.0" },
    });

    return new Response(response.body, {
      status: response.status,
      headers: {
        ...corsHeaders(),
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": response.headers.get("Content-Length") || "",
        "Cache-Control": "no-store",
        "X-Proxy-Host": targetUrl.hostname,
      },
    });
  } catch (err) {
    return Response.json(
      { error: "Proxy fetch failed", detail: String(err) },
      { status: 502, headers: corsHeaders() }
    );
  }
}

async function handleProxyPing(url: URL): Promise<Response> {
  const target = url.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "Missing url parameter" }, { status: 400, headers: corsHeaders() });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return Response.json({ error: "Invalid url" }, { status: 400, headers: corsHeaders() });
  }

  if (!PROXY_ALLOWLIST.has(targetUrl.hostname)) {
    return Response.json({ error: "Host not allowed" }, { status: 403, headers: corsHeaders() });
  }

  const start = Date.now();
  try {
    const response = await fetch(target, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "NetCheck-SpeedTest/1.0" },
    });
    const elapsed = Date.now() - start;

    return Response.json(
      { latency: elapsed, status: response.status, host: targetUrl.hostname },
      { headers: corsHeaders() }
    );
  } catch (err) {
    return Response.json(
      { error: "Ping failed", detail: String(err) },
      { status: 502, headers: corsHeaders() }
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
