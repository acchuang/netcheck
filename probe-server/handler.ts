// Zone logic and the observation store, kept apart from the socket code so it
// can be exercised without binding a privileged port.

import { type DnsQuestion } from "../src/shared/dns-wire.ts";
import {
  encodeResponse, RCODE_NOERROR, RCODE_NXDOMAIN, RCODE_NOTIMP, RCODE_REFUSED,
} from "./encode.ts";

// Answers point at TEST-NET-1 (RFC 5737), which is guaranteed unroutable. The
// browser's fetch to <token>.ZONE exists only to force the DNS lookup; we never
// want it to actually reach a host, least of all one on the user's LAN.
const ANSWER_IP: [number, number, number, number] = [192, 0, 2, 1];

export const TOKEN_RE = /^[a-f0-9]{16,64}$/;
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

export function handleQuery(q: DnsQuestion, ip: string, zone: string): Uint8Array {
  if (q.opcode !== 0) return encodeResponse(q, RCODE_NOTIMP);
  if (q.type === 255) return encodeResponse(q, RCODE_REFUSED); // ANY: pure amplification bait

  const n = q.name.replace(/\.$/, "").toLowerCase();
  // Never answer for names we aren't delegated — that is what an open resolver
  // looks like, and it is how a box gets conscripted into reflection attacks.
  if (n !== zone && !n.endsWith(`.${zone}`)) return encodeResponse(q, RCODE_REFUSED);

  const token = tokenFor(q.name, zone);
  if (token === null) return encodeResponse(q, RCODE_NXDOMAIN);

  recordHit(token, ip, q.ecs);

  if (q.type !== 1) return encodeResponse(q, RCODE_NOERROR); // exists, but no AAAA/etc.
  return encodeResponse(q, RCODE_NOERROR, { a: ANSWER_IP, ttl: 10 });
}
