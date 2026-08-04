// Authoritative nameserver for the resolver-fanout probe.
//
// Delegate a zone to this box (p.oilygold.xyz NS ns-probe.oilygold.xyz), then
// have the browser resolve <token>.p.oilygold.xyz. Every recursive resolver in
// the visitor's real path has to ask us directly, so the source IPs we see are
// their resolvers — the one thing a DoH client can never observe about itself.
// The Worker reads the result back over HTTP and hands it to the page.
//
// Run: PROBE_SECRET=... node probe-server/server.ts --zone p.oilygold.xyz

import dgram from "node:dgram";
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { decodeQuestion } from "../src/shared/dns-wire.ts";
import { handleQuery, getObservations, sessionCount, sweepSessions, TOKEN_RE } from "./handler.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const ZONE = arg("zone", "p.oilygold.xyz").replace(/\.$/, "").toLowerCase();
const DNS_PORT = Number(arg("dns-port", "53"));
const HTTP_PORT = Number(arg("http-port", "8080"));
const SECRET = process.env.PROBE_SECRET ?? "";

if (!SECRET) {
  console.error("PROBE_SECRET is required — the read-back endpoint maps tokens to visitors' resolver IPs.");
  process.exit(1);
}

setInterval(() => sweepSessions(), 30_000).unref();

// --- crude per-source rate limit ---
//
// An authoritative server on open UDP/53 is a reflection candidate. Responses
// here are barely larger than queries (compression pointer, no DNSSEC, 512-byte
// OPT), so amplification is near 1x — but a source cap costs nothing and stops
// us being useful as a flood relay at all.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 200;
const rate = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rate.get(ip);
  if (!entry || now > entry.resetAt) {
    rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of rate) if (now > e.resetAt) rate.delete(ip);
}, 30_000).unref();

// --- DNS ---

const udp = dgram.createSocket("udp4");

udp.on("message", (msg, rinfo) => {
  if (rateLimited(rinfo.address)) return;
  const q = decodeQuestion(new Uint8Array(msg));
  if (!q) return; // malformed: stay silent rather than reply to a possibly spoofed source
  try {
    udp.send(handleQuery(q, rinfo.address, ZONE), rinfo.port, rinfo.address);
  } catch {
    // A single bad packet must never take the listener down.
  }
});

udp.on("error", (err) => {
  console.error("udp socket error:", err.message);
  process.exit(1);
});

udp.bind(DNS_PORT, () => console.log(`dns: udp/${DNS_PORT} authoritative for ${ZONE}`));

// --- read-back API ---

function secretOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`ok sessions=${sessionCount()}\n`);
      return;
    }

    if (url.pathname !== "/lookup") {
      res.writeHead(404).end();
      return;
    }

    if (!secretOk(String(req.headers["x-probe-secret"] ?? ""))) {
      res.writeHead(403).end();
      return;
    }

    const token = url.searchParams.get("token") ?? "";
    if (!TOKEN_RE.test(token)) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad token" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ token, resolvers: getObservations(token) }));
  })
  .listen(HTTP_PORT, () => console.log(`http: :${HTTP_PORT} read-back`));
