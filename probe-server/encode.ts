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
}

/**
 * Build a reply to `q`. Always authoritative (AA=1) and never recursion-available
 * (RA=0) — this server is authoritative-only and must never look like an open
 * resolver, which is what gets a box conscripted into reflection attacks.
 */
export function encodeResponse(q: DnsQuestion, rcode: number, opts: ResponseOptions = {}): Uint8Array {
  const qname = encodeName(q.name);
  const answer = opts.a ? buildARecord(opts.a, opts.ttl ?? 60) : null;

  // Echoing the client's OPT is required when it sent one (RFC 6891); sending
  // one it didn't ask for would be a protocol error. We advertise 512 so we
  // never emit a datagram larger than the query could justify.
  const opt = q.hasOpt ? [0, 0, 41, 0x02, 0x00, 0, 0, 0, 0, 0, 0] : [];

  const ancount = answer ? 1 : 0;
  const arcount = q.hasOpt ? 1 : 0;
  const flags = 0x8400 | (q.opcode << 11) | rcode; // QR=1 AA=1 RA=0

  const header = [
    q.id >> 8, q.id & 0xff,
    flags >> 8, flags & 0xff,
    0, 1,
    0, ancount,
    0, 0,
    0, arcount,
  ];

  const size = header.length + qname.length + 4 + (answer?.length ?? 0) + opt.length;
  const msg = new Uint8Array(size);
  let p = 0;
  msg.set(header, p); p += header.length;
  msg.set(qname, p); p += qname.length;
  msg[p++] = q.type >> 8;
  msg[p++] = q.type & 0xff;
  msg[p++] = 0;
  msg[p++] = 1; // class IN
  if (answer) { msg.set(answer, p); p += answer.length; }
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
