// Response encoder for the probe nameserver.
//
// This lives here rather than in src/shared/dns-wire.ts because only the
// nameserver ever builds a response — the browser and the Worker are pure
// clients, and shipping an encoder they never call would just bloat the bundle.

import { encodeName, type DnsQuestion } from "../src/shared/dns-wire.ts";

export const RCODE_NOERROR = 0;
export const RCODE_NXDOMAIN = 3;
export const RCODE_NOTIMP = 4;
export const RCODE_REFUSED = 5;

interface ResponseOptions {
  /** IPv4 to answer with, as four octets. Omit for an empty answer section. */
  a?: [number, number, number, number];
  ttl?: number;
  /** Pre-built records for the answer section, appended after `a`. */
  answers?: Uint8Array[];
  /** Authority section. A negative answer without an SOA here is uncacheable. */
  authority?: Uint8Array[];
}

const SOA_TTL = 300;
/**
 * SOA MINIMUM doubles as the negative-cache TTL (RFC 2308). Tokens are single-use,
 * so nothing benefits from long negative caching, and a short value keeps a
 * mistyped delegation from being remembered for hours.
 */
const NEGATIVE_TTL = 60;
const NS_TTL = 3600;

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function record(owner: string, type: number, ttl: number, rdata: number[]): Uint8Array {
  const name = encodeName(owner);
  return new Uint8Array([
    ...name,
    type >> 8, type & 0xff,
    0, 1, // class IN
    ...u32be(ttl),
    rdata.length >> 8, rdata.length & 0xff,
    ...rdata,
  ]);
}

/**
 * The zone's SOA. Carried in the authority section of every NXDOMAIN and NODATA
 * so resolvers can cache the negative answer; served in the answer section when
 * asked for directly. Serial is fixed: there are no secondaries and no AXFR, so
 * nothing ever compares it.
 */
export function soaRecord(zone: string, ns: string): Uint8Array {
  return record(zone, 6, SOA_TTL, [
    ...encodeName(ns),
    ...encodeName(`hostmaster.${zone}`),
    ...u32be(1), ...u32be(3600), ...u32be(900), ...u32be(604800), ...u32be(NEGATIVE_TTL),
  ]);
}

/**
 * The apex NS. Must list the same hosts as the delegation at the parent — a
 * resolver that finds the authoritative set disagreeing with the referral it
 * followed may treat the zone as lame.
 */
export function nsRecord(zone: string, ns: string): Uint8Array {
  return record(zone, 2, NS_TTL, [...encodeName(ns)]);
}

/**
 * Build a reply to `q`. Always authoritative (AA=1) and never recursion-available
 * (RA=0) — this server is authoritative-only and must never look like an open
 * resolver, which is what gets a box conscripted into reflection attacks.
 */
export function encodeResponse(q: DnsQuestion, rcode: number, opts: ResponseOptions = {}): Uint8Array {
  const qname = encodeName(q.name);
  const answers = opts.a ? [buildARecord(opts.a, opts.ttl ?? 60), ...(opts.answers ?? [])] : (opts.answers ?? []);
  const authority = opts.authority ?? [];

  // Echoing the client's OPT is required when it sent one (RFC 6891); sending
  // one it didn't ask for would be a protocol error. We advertise 512 so we
  // never emit a datagram larger than the query could justify.
  const opt = q.hasOpt ? [0, 0, 41, 0x02, 0x00, 0, 0, 0, 0, 0, 0] : [];

  const ancount = answers.length;
  const nscount = authority.length;
  const arcount = q.hasOpt ? 1 : 0;
  const flags = 0x8400 | (q.opcode << 11) | rcode; // QR=1 AA=1 RA=0

  const header = [
    q.id >> 8, q.id & 0xff,
    flags >> 8, flags & 0xff,
    0, 1,
    ancount >> 8, ancount & 0xff,
    nscount >> 8, nscount & 0xff,
    0, arcount,
  ];

  const rrBytes = [...answers, ...authority].reduce((n, r) => n + r.length, 0);
  const msg = new Uint8Array(header.length + qname.length + 4 + rrBytes + opt.length);
  let p = 0;
  msg.set(header, p); p += header.length;
  msg.set(qname, p); p += qname.length;
  msg[p++] = q.type >> 8;
  msg[p++] = q.type & 0xff;
  msg[p++] = 0;
  msg[p++] = 1; // class IN
  for (const rr of [...answers, ...authority]) { msg.set(rr, p); p += rr.length; }
  if (opt.length) msg.set(opt, p);
  return msg;
}

function buildARecord(octets: [number, number, number, number], ttl: number): Uint8Array {
  // Name is a compression pointer back to the question at offset 12, which keeps
  // the response barely larger than the query — the cheapest amplification defence.
  return new Uint8Array([
    0xc0, 0x0c,
    0, 1,
    0, 1,
    (ttl >>> 24) & 0xff, (ttl >>> 16) & 0xff, (ttl >>> 8) & 0xff, ttl & 0xff,
    0, 4,
    ...octets,
  ]);
}
