// Authoritative nameserver for the resolver-fanout probe.
//
// Delegate a zone to this box (p.oilygold.xyz NS ns-probe.oilygold.xyz), then
// have the browser resolve <label>.p.oilygold.xyz, where the label is the hash
// of a read key only that tab holds. Every recursive resolver in
// the visitor's real path has to ask us directly, so the source IPs we see are
// their resolvers — the one thing a DoH client can never observe about itself.
// The Worker reads the result back over HTTPS, presenting the key, and hands
// the result to the page.
//
// Run: PROBE_SECRET=... node probe-server/server.ts --zone p.oilygold.xyz

import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { decodeQuestion } from "../src/shared/dns-wire.ts";
import {
  handleQuery, getObservations, sessionCount, sweepSessions, rateLimited, sweepRateLimit, labelForKey, TOKEN_RE,
} from "./handler.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const ZONE = arg("zone", "p.oilygold.xyz").replace(/\.$/, "").toLowerCase();
// Must match the NS records delegated at the parent, glue included. Change
// --zone without changing this and the apex NS set contradicts the referral.
const NS = arg("ns", "ns-probe.oilygold.xyz").replace(/\.$/, "").toLowerCase();
const DNS_PORT = Number(arg("dns-port", "53"));
const HTTP_PORT = Number(arg("http-port", "8080"));
const SECRET = process.env.PROBE_SECRET ?? "";

if (!SECRET) {
  console.error("PROBE_SECRET is required — the read-back endpoint maps read keys to visitors' resolver IPs.");
  process.exit(1);
}

setInterval(() => sweepSessions(), 30_000).unref();
setInterval(() => sweepRateLimit(), 30_000).unref();

// --- DNS ---
//
// v4 and v6 sockets, because the resolver set we observe depends on it: a
// resolver that reaches us over IPv6 is invisible on a v4-only listener, and
// since the whole point is enumerating the visitor's real resolver path, a
// missing transport reads as "fewer resolvers" rather than as a gap.
//
// No TCP listener. RFC 7766 makes TCP a MUST for a general authoritative
// server, but every answer we produce fits in 512 bytes, so nothing here ever
// sets TC=1 and no resolver has a reason to retry over TCP.
function listen(type: "udp4" | "udp6"): void {
  // ipv6Only keeps the two sockets from fighting over the v4 port on Linux,
  // and keeps rinfo.address off the ::ffff:1.2.3.4 form we'd have to unwrap.
  const sock = type === "udp6"
    ? dgram.createSocket({ type, ipv6Only: true })
    : dgram.createSocket({ type });

  sock.on("message", (msg, rinfo) => {
    if (rateLimited(rinfo.address)) return;
    const q = decodeQuestion(new Uint8Array(msg));
    if (!q) return; // malformed: stay silent rather than reply to a possibly spoofed source
    try {
      sock.send(handleQuery(q, rinfo.address, ZONE, NS), rinfo.port, rinfo.address);
    } catch {
      // A single bad packet must never take the listener down.
    }
  });

  sock.on("error", (err) => {
    // A box with no IPv6 address is normal; losing v4 is not.
    if (type === "udp6") {
      console.error(`udp6 disabled: ${err.message}`);
      sock.close();
      return;
    }
    console.error("udp socket error:", err.message);
    process.exit(1);
  });

  sock.bind(DNS_PORT, () => console.log(`dns: ${type}/${DNS_PORT} authoritative for ${ZONE} (ns ${NS})`));
}

listen("udp4");
listen("udp6");

// --- read-back API ---

function secretOk(provided: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

// The read-back request carries PROBE_SECRET in a header and the reply is a list
// of a visitor's resolver IPs. Over plaintext both are readable by every hop
// between Cloudflare and this box, and the secret is replayable — anyone holding
// it can enumerate any token. So: TLS whenever this listens on a public
// interface, and loopback-only when there is no certificate to use. There is no
// "insecure but public" mode, because that is the one that ships by accident.
const tlsCert = process.env.PROBE_TLS_CERT;
const tlsKey = process.env.PROBE_TLS_KEY;
const tls = tlsCert && tlsKey
  ? { cert: readFileSync(tlsCert), key: readFileSync(tlsKey) }
  : null;

if (!tls) {
  console.warn(
    "PROBE_TLS_CERT/PROBE_TLS_KEY unset — read-back bound to 127.0.0.1 only. " +
    "A remote Worker cannot reach it. Fine for local runs; supply a certificate to serve it publicly."
  );
}

const handleHttp = (req: http.IncomingMessage, res: http.ServerResponse): void => {
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

  // Keyed by the read key, never by the queried label. The label is public —
  // it crosses every resolver in the path and lands in this process's own logs
  // — so accepting it here would make observing a query enough to read the
  // visitor's resolver list back.
  const key = url.searchParams.get("key") ?? "";
  if (!TOKEN_RE.test(key)) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "bad key" }));
    return;
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ resolvers: getObservations(labelForKey(key)) }));
};

const readback = tls ? https.createServer(tls, handleHttp) : http.createServer(handleHttp);
readback.listen(HTTP_PORT, tls ? undefined : "127.0.0.1", () =>
  console.log(`${tls ? "https" : "http (loopback only)"}: :${HTTP_PORT} read-back`)
);
