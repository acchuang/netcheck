// Pure address maths shared by the DNS card: what kind of address is this, is
// it one of the public encrypted-DNS operators, and does a WebRTC candidate
// disagree with the address the site itself sees. No DOM, no network — so it
// can be unit-tested under `node --test`.

import { ENCRYPTED_DNS_NETWORKS } from "./resolvers.ts";

export type IpScope = "public" | "private" | "linkLocal" | "loopback" | "unspecified";

function parseV4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

function parseV6(text: string): number[] | null {
  let head = text;
  let tail = "";
  const doubleColon = text.indexOf("::");
  if (doubleColon !== -1) {
    if (text.indexOf("::", doubleColon + 1) !== -1) return null;
    head = text.slice(0, doubleColon);
    tail = text.slice(doubleColon + 2);
  }

  const expand = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const out: number[] = [];
    const groups = chunk.split(":");
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      // A trailing dotted quad (::ffff:192.0.2.1) contributes two groups.
      if (i === groups.length - 1 && g.includes(".")) {
        const v4 = parseV4(g);
        if (!v4) return null;
        out.push(...v4);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      const n = parseInt(g, 16);
      out.push(n >> 8, n & 0xff);
    }
    return out;
  };

  const left = expand(head);
  const right = expand(tail);
  if (!left || !right) return null;

  if (doubleColon === -1) return left.length === 16 ? left : null;
  const gap = 16 - left.length - right.length;
  if (gap < 0) return null;
  return [...left, ...new Array(gap).fill(0), ...right];
}

/**
 * Address as bytes: 4 for IPv4, 16 for IPv6 — except IPv4-mapped/compatible
 * v6 (::ffff:1.2.3.4), which collapses to its 4 v4 bytes so it compares and
 * classifies as the v4 address it actually is.
 */
export function ipBytes(text: string): number[] | null {
  const ip = text.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!ip) return null;
  if (ip.includes(":")) {
    const bytes = parseV6(ip);
    if (!bytes) return null;
    // ::ffff:a.b.c.d is that v4 address wearing a v6 hat. (:: and ::1 are not.)
    const v4Mapped = bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
    return v4Mapped ? bytes.slice(12) : bytes;
  }
  return parseV4(ip);
}

export function isIp(text: string): boolean {
  return ipBytes(text) !== null;
}

export function sameIp(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = ipBytes(a);
  const y = ipBytes(b);
  if (!x || !y || x.length !== y.length) return false;
  return x.every((byte, i) => byte === y[i]);
}

function maskedEqual(a: number[], b: number[], bits: number): boolean {
  const whole = bits >> 3;
  const rest = bits & 7;
  for (let i = 0; i < whole; i++) if (a[i] !== b[i]) return false;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (a[whole] & mask) === (b[whole] & mask);
}

export function inCidr(ip: string, cidr: string): boolean {
  const [network, prefix] = cidr.split("/");
  const bits = Number(prefix);
  const a = ipBytes(ip);
  const b = ipBytes(network);
  if (!a || !b || a.length !== b.length) return false;
  if (!Number.isInteger(bits) || bits < 0 || bits > a.length * 8) return false;
  return maskedEqual(a, b, bits);
}

export function ipScope(ip: string): IpScope {
  const bytes = ipBytes(ip);
  if (!bytes) return "unspecified";

  if (bytes.length === 4) {
    const [a, b] = bytes;
    if (a === 0) return "unspecified";
    if (a === 127) return "loopback";
    if (a === 169 && b === 254) return "linkLocal";
    if (a === 10) return "private";
    if (a === 172 && b >= 16 && b <= 31) return "private";
    if (a === 192 && b === 168) return "private";
    // CGNAT: not the visitor's own address and not routable, so treating it as
    // public would report every carrier-NAT user as leaking.
    if (a === 100 && b >= 64 && b <= 127) return "private";
    return "public";
  }

  if (bytes.every((byte) => byte === 0)) return "unspecified";
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return "loopback";
  if ((bytes[0] & 0xfe) === 0xfc) return "private"; // fc00::/7 ULA
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return "linkLocal"; // fe80::/10
  return "public";
}

/** Operator name if the address belongs to a known encrypted-DNS service. */
export function encryptedDnsOperator(ip: string): string | null {
  for (const net of ENCRYPTED_DNS_NETWORKS) {
    if (net.cidrs.some((cidr) => inCidr(ip, cidr))) return net.operator;
  }
  return null;
}

/**
 * Rough "same network as the visitor" test, used only to phrase the warning:
 * a resolver inside the visitor's own /16 (v4) or /32 (v6) is their ISP's or
 * their router's, not a third-party service.
 */
export function sameNetwork(a: string, b: string): boolean {
  const x = ipBytes(a);
  const y = ipBytes(b);
  if (!x || !y || x.length !== y.length) return false;
  return maskedEqual(x, y, x.length === 4 ? 16 : 32);
}

// --- WebRTC ---

export interface IceCandidate {
  ip: string;
  /** host | srflx | prflx | relay */
  kind: string;
}

/**
 * `candidate:842163049 1 udp 1677729535 203.0.113.5 54321 typ srflx raddr ...`
 * mDNS candidates (abc.local) and anything unparseable return null.
 */
export function parseIceCandidate(line: string): IceCandidate | null {
  const fields = line.trim().split(/\s+/);
  const typIndex = fields.indexOf("typ");
  if (fields.length < 6 || typIndex === -1) return null;
  const address = fields[4];
  if (!isIp(address)) return null;
  return { ip: address, kind: fields[typIndex + 1] ?? "host" };
}

export interface WebRtcVerdict {
  /** A public address WebRTC exposes that is not the one this site sees. */
  leak: string | null;
  /** RFC1918 / CGNAT / ULA / link-local addresses — visible, but not a leak. */
  lanIps: string[];
}

/**
 * A public candidate that matches the address the site already sees tells an
 * observer nothing new. One that differs is the leak: it is the real path out,
 * exposed past whatever VPN or proxy the page itself is going through.
 * When the reported address for that family is unknown we stay quiet rather
 * than call an unverifiable difference a leak. A reported address that is not
 * public counts as unknown: local dev hands the page 127.0.0.1, and every
 * candidate would "differ" from that.
 */
export function evaluateWebRtc(
  candidateLines: string[],
  reported: { ipv4?: string | null; ipv6?: string | null }
): WebRtcVerdict {
  const lanIps: string[] = [];
  let leak: string | null = null;

  for (const line of candidateLines) {
    const candidate = parseIceCandidate(line);
    if (!candidate) continue;
    const scope = ipScope(candidate.ip);

    if (scope === "private" || scope === "linkLocal") {
      if (!lanIps.some((ip) => sameIp(ip, candidate.ip))) lanIps.push(candidate.ip);
      continue;
    }
    if (scope !== "public" || leak) continue;

    const isV4 = ipBytes(candidate.ip)!.length === 4;
    const mine = isV4 ? reported.ipv4 : reported.ipv6;
    if (!mine || ipScope(mine) !== "public") continue;
    if (!sameIp(mine, candidate.ip)) leak = candidate.ip;
  }

  return { leak, lanIps };
}

// --- Encrypted DNS verdict ---

export type DohVerdict =
  | { kind: "encrypted"; operator: string; ip: string }
  | { kind: "isp"; ip: string }
  | { kind: "unrecognized"; ip: string }
  | { kind: "unknown" };

/**
 * Judges the visitor's *own* recursion path from the resolver IPs our
 * authoritative probe actually saw. No observation means no verdict — never a
 * pass, because "this page can speak DoH" says nothing about the system
 * resolver.
 */
export function dohVerdict(
  observedIps: string[],
  client: { ipv4?: string | null; ipv6?: string | null } = {}
): DohVerdict {
  const seen = observedIps.filter(isIp);
  if (seen.length === 0) return { kind: "unknown" };

  for (const ip of seen) {
    const operator = encryptedDnsOperator(ip);
    if (operator) return { kind: "encrypted", operator, ip };
  }

  const ispLike = seen.find(
    (ip) =>
      (client.ipv4 && sameNetwork(ip, client.ipv4)) ||
      (client.ipv6 && sameNetwork(ip, client.ipv6))
  );
  return ispLike ? { kind: "isp", ip: ispLike } : { kind: "unrecognized", ip: seen[0] };
}
