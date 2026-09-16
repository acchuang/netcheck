// Zone logic and the observation store, kept apart from the socket code so it
// can be exercised without binding a privileged port.

import { createHash } from "node:crypto";
import { type DnsQuestion } from "../src/shared/dns-wire.ts";
import {
  encodeResponse, soaRecord, nsRecord,
  RCODE_NOERROR, RCODE_NXDOMAIN, RCODE_NOTIMP, RCODE_REFUSED,
} from "./encode.ts";

// Answers point at TEST-NET-1 (RFC 5737), which is guaranteed unroutable. The
// browser's fetch to <label>.ZONE exists only to force the DNS lookup; we never
// want it to actually reach a host, least of all one on the user's LAN.
const ANSWER_IP: [number, number, number, number] = [192, 0, 2, 1];

export const TOKEN_RE = /^[a-f0-9]{16,64}$/;

/**
 * The queried label is the SHA-256 of a read key the visitor's tab keeps to
 * itself. Every resolver in the path sees the label, and so does anyone with
 * these logs — so the label must not be enough to read the result back. Only
 * the holder of the key can name the session, and the key never goes on the
 * wire in a DNS query.
 */
export function labelForKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

const SESSION_TTL_MS = 5 * 60_000;
const MAX_SESSIONS = 20_000;
const MAX_RESOLVERS_PER_SESSION = 64;

interface Observation { ip: string; ecs: string | null; at: number; count: number; }
interface Session { created: number; resolvers: Map<string, Observation>; }

const sessions = new Map<string, Session>();

export function sessionCount(): number {
  return sessions.size;
}

export function getObservations(token: string): Observation[] {
  const s = sessions.get(token);
  return s ? [...s.resolvers.values()] : [];
}

export function recordHit(token: string, ip: string, ecs: string | null): void {
  let session = sessions.get(token);
  if (!session) {
    // Bounded, evicting oldest-first: the token space is public, so anyone can
    // mint sessions by querying us. Unbounded growth here is a free OOM.
    if (sessions.size >= MAX_SESSIONS) {
      const oldest = sessions.keys().next().value;
      if (oldest !== undefined) sessions.delete(oldest);
    }
    session = { created: Date.now(), resolvers: new Map() };
    sessions.set(token, session);
  }
  const existing = session.resolvers.get(ip);
  if (existing) {
    existing.count += 1;
    if (ecs && !existing.ecs) existing.ecs = ecs;
    return;
  }
  if (session.resolvers.size >= MAX_RESOLVERS_PER_SESSION) return;
  session.resolvers.set(ip, { ip, ecs, at: Date.now(), count: 1 });
}

export function sweepSessions(now = Date.now()): void {
  const cutoff = now - SESSION_TTL_MS;
  for (const [token, s] of sessions) if (s.created < cutoff) sessions.delete(token);
}

/** Returns the token for a name inside `zone`, or null if it isn't one. */
export function tokenFor(name: string, zone: string): string | null {
  const n = name.replace(/\.$/, "").toLowerCase();
  if (n === zone) return null;
  if (!n.endsWith(`.${zone}`)) return null;
  const label = n.slice(0, -(zone.length + 1));
  if (label.includes(".")) return null; // one label only; no deeper names exist here
  return TOKEN_RE.test(label) ? label : null;
}

export function handleQuery(q: DnsQuestion, ip: string, zone: string, ns: string): Uint8Array {
  if (q.opcode !== 0) return encodeResponse(q, RCODE_NOTIMP);
  if (q.type === 255) return encodeResponse(q, RCODE_REFUSED); // ANY: pure amplification bait

  const n = q.name.replace(/\.$/, "").toLowerCase();
  // Never answer for names we aren't delegated — that is what an open resolver
  // looks like, and it is how a box gets conscripted into reflection attacks.
  if (n !== zone && !n.endsWith(`.${zone}`)) return encodeResponse(q, RCODE_REFUSED);

  // Every negative answer carries the SOA. Without it a resolver cannot cache
  // the negative at all, so it re-asks us for the same dead name forever, and
  // some validators treat an SOA-less NXDOMAIN from an AA server as malformed.
  const soa = () => [soaRecord(zone, ns)];

  if (n === zone) {
    // The apex exists and answering for it is what makes us look like a real
    // zone rather than a wildcard trap: NS so the delegation checks out, SOA
    // so negatives are cacheable, NODATA for everything else.
    if (q.type === 2) return encodeResponse(q, RCODE_NOERROR, { answers: [nsRecord(zone, ns)] });
    if (q.type === 6) return encodeResponse(q, RCODE_NOERROR, { answers: soa() });
    return encodeResponse(q, RCODE_NOERROR, { authority: soa() });
  }

  const token = tokenFor(q.name, zone);
  if (token === null) return encodeResponse(q, RCODE_NXDOMAIN, { authority: soa() });

  recordHit(token, ip, q.ecs);

  // Exists, but has no AAAA/TXT/etc. NODATA is NOERROR with an empty answer —
  // NXDOMAIN here would tell the resolver the name itself is gone (RFC 8020),
  // and it would stop asking for the A record we actually want it to fetch.
  if (q.type !== 1) return encodeResponse(q, RCODE_NOERROR, { authority: soa() });
  return encodeResponse(q, RCODE_NOERROR, { a: ANSWER_IP, ttl: 10 });
}

// --- per-source rate limit ---
//
// An authoritative server on open UDP/53 is a reflection candidate. Answers
// here are barely larger than queries (compression pointer, no DNSSEC, 512-byte
// OPT), so amplification is near 1x — but a source cap costs nothing and stops
// us being useful as a flood relay at all. Lives here, not in the socket code,
// so it can be tested without binding a privileged port.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 200;
// Source IPs are spoofable and free, so the Map itself is the attack surface:
// one packet per forged address fills it faster than the 30s sweep drains it.
// Bounded LRU — entries are re-inserted on touch, so the first key is the
// least recently seen.
const MAX_RATE_SOURCES = 50_000;
const rate = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(ip: string, now = Date.now()): boolean {
  const entry = rate.get(ip);
  if (entry && now <= entry.resetAt) {
    entry.count += 1;
    rate.delete(ip);
    rate.set(ip, entry);
    return entry.count > RATE_MAX;
  }
  if (!entry && rate.size >= MAX_RATE_SOURCES) {
    const lru = rate.keys().next().value;
    if (lru !== undefined) rate.delete(lru);
  }
  rate.delete(ip);
  rate.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
  return false;
}

export function sweepRateLimit(now = Date.now()): void {
  for (const [ip, e] of rate) if (now > e.resetAt) rate.delete(ip);
}

export function rateSourceCount(): number {
  return rate.size;
}
