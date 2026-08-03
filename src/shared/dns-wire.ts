// RFC 8484 DNS-over-HTTPS wire-format client.
//
// The JSON DoH API (`application/dns-json`) is a Cloudflare/Google extension,
// not a standard: Quad9, OpenDNS, AdGuard and Mullvad all answer it with HTTP
// 400, and dns.google serves it at /resolve rather than /dns-query. Wire format
// is the only transport that reaches every resolver we probe, and it's also the
// only one that exposes RCODE, the AD bit and Extended DNS Errors — which is
// what a real DNSSEC validation test needs.
//
// Decoded answers use the DoH-JSON field names (name/type/TTL/data) so callers
// that already speak that shape don't need to change.

export const RR_TYPES: Record<string, number> = {
  A: 1, NS: 2, CNAME: 5, SOA: 6, PTR: 12, MX: 15, TXT: 16,
  AAAA: 28, SRV: 33, DS: 43, DNSKEY: 48, HTTPS: 65,
};

const RR_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(RR_TYPES).map(([k, v]) => [v, k])
);

export const RCODE_NAMES: Record<number, string> = {
  0: "NOERROR", 1: "FORMERR", 2: "SERVFAIL", 3: "NXDOMAIN",
  4: "NOTIMP", 5: "REFUSED", 9: "NOTAUTH",
};

export interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

export interface DnsMessage {
  Status: number;
  rcodeName: string;
  AD: boolean;
  CD: boolean;
  Answer: DnsAnswer[];
  /** Extended DNS Error (RFC 8914) — resolvers use it to explain SERVFAIL. */
  ede: { code: number; text: string } | null;
}

export interface QueryOptions {
  /** DO bit — ask for DNSSEC records and a meaningful AD flag. */
  dnssecOk?: boolean;
  /** CD bit — disable validation, so bogus zones resolve anyway. */
  checkingDisabled?: boolean;
}

// --- encoding ---

function encodeName(name: string): Uint8Array {
  const labels = name.replace(/\.$/, "").split(".").filter((l) => l.length > 0);
  const parts: number[] = [];
  for (const label of labels) {
    const bytes = new TextEncoder().encode(label);
    if (bytes.length > 63) throw new Error(`DNS label too long: ${label}`);
    parts.push(bytes.length, ...bytes);
  }
  parts.push(0);
  if (parts.length > 255) throw new Error("DNS name too long");
  return new Uint8Array(parts);
}

export function encodeQuery(name: string, type: string | number, opts: QueryOptions = {}): Uint8Array {
  const qtype = typeof type === "number" ? type : (RR_TYPES[type.toUpperCase()] ?? 1);
  const qname = encodeName(name);

  // id 0 is fine over HTTPS — the transport already correlates request/response,
  // and a fixed id keeps GET URLs cacheable.
  const flags = 0x0100 | (opts.checkingDisabled ? 0x0010 : 0); // RD [+ CD]
  const header = [0, 0, flags >> 8, flags & 0xff, 0, 1, 0, 0, 0, 0, 0, 1];

  // OPT pseudo-record (EDNS0). Wire layout: name(1) type(2) class(2) ttl(4)
  // rdlength(2), where the 4-byte TTL is ext-rcode | version | flags(2) and the
  // DO bit is the top bit of flags — i.e. the third TTL byte, not the first.
  const doBit = opts.dnssecOk ? 0x80 : 0x00;
  const opt = [0, 0, 41, 0x10, 0x00, 0, 0, doBit, 0, 0, 0];

  const msg = new Uint8Array(header.length + qname.length + 4 + opt.length);
  msg.set(header, 0);
  msg.set(qname, header.length);
  const q = header.length + qname.length;
  msg[q] = qtype >> 8;
  msg[q + 1] = qtype & 0xff;
  msg[q + 2] = 0;
  msg[q + 3] = 1; // class IN
  msg.set(opt, q + 4);
  return msg;
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- decoding ---

interface Cursor { pos: number; }

function readName(buf: Uint8Array, cur: Cursor): string {
  const labels: string[] = [];
  let jumped = false;
  let hops = 0;
  let pos = cur.pos;

  for (;;) {
    if (pos >= buf.length) break;
    const len = buf[pos];
    if (len === 0) {
      pos += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      // Compression pointer. Cap hops so a self-referential packet can't hang us.
      if (pos + 1 >= buf.length || ++hops > 64) break;
      const target = ((len & 0x3f) << 8) | buf[pos + 1];
      if (!jumped) {
        cur.pos = pos + 2;
        jumped = true;
      }
      pos = target;
      continue;
    }
    pos += 1;
    if (pos + len > buf.length) break;
    labels.push(new TextDecoder().decode(buf.subarray(pos, pos + len)));
    pos += len;
  }

  if (!jumped) cur.pos = pos;
  return labels.length > 0 ? `${labels.join(".")}.` : ".";
}

function u16(buf: Uint8Array, pos: number): number {
  return (buf[pos] << 8) | buf[pos + 1];
}

function u32(buf: Uint8Array, pos: number): number {
  return ((buf[pos] << 24) >>> 0) + (buf[pos + 1] << 16) + (buf[pos + 2] << 8) + buf[pos + 3];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatIpv6(bytes: Uint8Array): string {
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(u16(bytes, i).toString(16));

  // Collapse the longest run of zero groups into "::".
  let bestStart = -1, bestLen = 0, runStart = -1, runLen = 0;
  groups.forEach((g, i) => {
    if (g === "0") {
      if (runStart < 0) { runStart = i; runLen = 0; }
      runLen += 1;
      if (runLen > bestLen) { bestStart = runStart; bestLen = runLen; }
    } else {
      runStart = -1; runLen = 0;
    }
  });
  if (bestLen < 2) return groups.join(":");
  return `${groups.slice(0, bestStart).join(":")}::${groups.slice(bestStart + bestLen).join(":")}`;
}

function formatRdata(buf: Uint8Array, type: number, start: number, len: number): string {
  const rdata = buf.subarray(start, start + len);
  const cur: Cursor = { pos: start };

  switch (type) {
    case 1: // A
      return len === 4 ? Array.from(rdata).join(".") : toHex(rdata);
    case 28: // AAAA
      return len === 16 ? formatIpv6(rdata) : toHex(rdata);
    case 2: case 5: case 12: // NS, CNAME, PTR
      return readName(buf, cur);
    case 15: { // MX
      cur.pos = start + 2;
      return `${u16(buf, start)} ${readName(buf, cur)}`;
    }
    case 16: { // TXT — one or more length-prefixed strings, rendered dig-style
      const strings: string[] = [];
      let p = start;
      while (p < start + len) {
        const slen = buf[p];
        p += 1;
        strings.push(new TextDecoder().decode(buf.subarray(p, p + slen)));
        p += slen;
      }
      return strings.map((s) => `"${s}"`).join(" ");
    }
    case 6: { // SOA
      const mname = readName(buf, cur);
      const rname = readName(buf, cur);
      const nums: number[] = [];
      for (let i = 0; i < 5; i++) nums.push(u32(buf, cur.pos + i * 4));
      return `${mname} ${rname} ${nums.join(" ")}`;
    }
    case 33: { // SRV
      cur.pos = start + 6;
      return `${u16(buf, start)} ${u16(buf, start + 2)} ${u16(buf, start + 4)} ${readName(buf, cur)}`;
    }
    default:
      return toHex(rdata);
  }
}

/** Walk a record section, returning the position just past it. */
function skipSection(buf: Uint8Array, pos: number, count: number): number {
  for (let i = 0; i < count && pos < buf.length; i++) {
    const cur: Cursor = { pos };
    readName(buf, cur);
    pos = cur.pos + 8; // type(2) class(2) ttl(4)
    if (pos + 2 > buf.length) return buf.length;
    pos += 2 + u16(buf, pos);
  }
  return pos;
}

export function decodeMessage(buf: Uint8Array): DnsMessage {
  if (buf.length < 12) throw new Error("DNS response too short");

  const flags = u16(buf, 2);
  const qdcount = u16(buf, 4);
  const ancount = u16(buf, 6);
  const nscount = u16(buf, 8);
  const arcount = u16(buf, 10);

  let pos = 12;
  for (let i = 0; i < qdcount; i++) {
    const cur: Cursor = { pos };
    readName(buf, cur);
    pos = cur.pos + 4;
  }

  const Answer: DnsAnswer[] = [];
  for (let i = 0; i < ancount && pos < buf.length; i++) {
    const cur: Cursor = { pos };
    const name = readName(buf, cur);
    pos = cur.pos;
    if (pos + 10 > buf.length) break;
    const type = u16(buf, pos);
    const ttl = u32(buf, pos + 4);
    const rdlength = u16(buf, pos + 8);
    pos += 10;
    Answer.push({ name, type, TTL: ttl, data: formatRdata(buf, type, pos, rdlength) });
    pos += rdlength;
  }

  // EDE lives on the OPT record in the additional section, past authority.
  pos = skipSection(buf, pos, nscount);
  let ede: DnsMessage["ede"] = null;
  let extendedRcode = 0;

  for (let i = 0; i < arcount && pos < buf.length; i++) {
    const cur: Cursor = { pos };
    readName(buf, cur);
    pos = cur.pos;
    if (pos + 10 > buf.length) break;
    const type = u16(buf, pos);
    const ttl = u32(buf, pos + 4);
    const rdlength = u16(buf, pos + 8);
    const rdstart = pos + 10;

    if (type === 41) {
      extendedRcode = (ttl >>> 24) & 0xff;
      let p = rdstart;
      while (p + 4 <= rdstart + rdlength) {
        const optCode = u16(buf, p);
        const optLen = u16(buf, p + 2);
        if (optCode === 15 && optLen >= 2) {
          ede = {
            code: u16(buf, p + 4),
            text: new TextDecoder().decode(buf.subarray(p + 6, p + 4 + optLen)).replace(/\0+$/, ""),
          };
        }
        p += 4 + optLen;
      }
    }
    pos = rdstart + rdlength;
  }

  const Status = (extendedRcode << 4) | (flags & 0x0f);
  return {
    Status,
    rcodeName: RCODE_NAMES[Status] ?? `RCODE${Status}`,
    AD: ((flags >> 5) & 1) === 1,
    CD: ((flags >> 4) & 1) === 1,
    Answer,
    ede,
  };
}

export function rrTypeName(type: number): string {
  return RR_NAMES[type] ?? `TYPE${type}`;
}

// --- probe targets, shared by the Worker and the browser ---

/**
 * A zone with a deliberately broken DNSSEC chain — its DS record matches no key
 * in the zone. A validating resolver must answer SERVFAIL; a non-validating one
 * returns the A record happily. This is the only way to test validation from
 * outside: the AD flag alone reports what the resolver *claims*, and every
 * resolver sets it on an already-signed answer regardless of who's asking.
 */
export const DNSSEC_BOGUS_DOMAIN = "brokendnssec.net";

/**
 * Akamai's public whoami service echoes back what the recursive resolver sent
 * it: "ns" is the resolver's egress IP, and an "ecs" record appears only when
 * the resolver forwarded the client's subnet (EDNS Client Subnet, RFC 7871).
 */
export const ECS_PROBE_DOMAIN = "whoami.ds.akahelp.net";

/**
 * Ad-filtering canary. It has to be a domain that ad-blocking resolvers list
 * but that still resolves normally everywhere else, or the probe can't tell
 * the two apart. "ads.google.com" fails that test — no public resolver blocks
 * it — and "ads.doubleclick.net" fails the other way, NXDOMAIN-ing even on
 * unfiltered resolvers because it genuinely does not exist.
 */
export const AD_PROBE_DOMAIN = "doubleclick.net";

const WHOAMI_TXT_RE = /"([^"]*)"\s+"([^"]*)"/;

export interface WhoamiResult {
  egressIp: string | null;
  /** Source prefix the resolver forwarded, e.g. "203.0.113.0/24". */
  ecsSubnet: string | null;
}

export function parseWhoami(msg: DnsMessage): WhoamiResult {
  const result: WhoamiResult = { egressIp: null, ecsSubnet: null };
  for (const answer of msg.Answer) {
    const match = WHOAMI_TXT_RE.exec(answer.data);
    if (!match) continue;
    if (match[1] === "ns") result.egressIp = match[2];
    // Raw value is "203.0.113.0/24/24" — source prefix, then scope prefix.
    if (match[1] === "ecs") result.ecsSubnet = match[2].replace(/\/(\d+)$/, "");
  }
  return result;
}

/**
 * Send one wire-format query to a DoH endpoint. Returns the decoded message
 * plus round-trip latency; throws on transport failure or a non-DNS response.
 */
export async function dohQuery(
  host: string,
  name: string,
  type: string | number,
  opts: QueryOptions & { timeoutMs?: number } = {}
): Promise<DnsMessage & { latency: number }> {
  const dns = toBase64Url(encodeQuery(name, type, opts));
  const start = Date.now();
  const res = await fetch(`https://${host}/dns-query?dns=${dns}`, {
    headers: { Accept: "application/dns-message" },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
  });
  const latency = Date.now() - start;
  if (!res.ok) throw new Error(`DoH ${host} returned HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return { ...decodeMessage(buf), latency };
}
