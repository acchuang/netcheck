export interface ResolverInfo {
  name: string;
  host: string;
  ip: string;
  desc: string;
  /**
   * Endpoint sends `Access-Control-Allow-Origin: *`, so the browser can query it
   * directly. Worth doing where possible: a browser-side probe measures the
   * user's own latency and reveals the user's real ECS subnet, whereas a probe
   * from the Worker only ever measures Cloudflare's edge. Quad9 additionally
   * refuses HTTP/1.1 (505), so the browser is the only path that reaches it.
   */
  cors: boolean;
}

export const RESOLVERS: ResolverInfo[] = [
  { name: "Cloudflare", host: "cloudflare-dns.com", ip: "1.1.1.1", desc: "Fast, privacy-focused", cors: true },
  { name: "Google", host: "dns.google", ip: "8.8.8.8", desc: "Reliable, global", cors: true },
  { name: "Quad9", host: "dns.quad9.net", ip: "9.9.9.9", desc: "Security-focused, threat blocking", cors: true },
  { name: "OpenDNS", host: "dns.opendns.com", ip: "208.67.222.222", desc: "Cisco Umbrella, filtering", cors: false },
  { name: "AdGuard DNS", host: "dns.adguard-dns.com", ip: "94.140.14.14", desc: "Ad & tracker blocking", cors: false },
  { name: "Cloudflare Families", host: "family.cloudflare-dns.com", ip: "1.1.1.3", desc: "Malware + adult content filter", cors: true },
  { name: "NextDNS", host: "dns.nextdns.io", ip: "45.90.28.0", desc: "Customizable, analytics", cors: false },
  { name: "Mullvad DNS", host: "dns.mullvad.net", ip: "194.242.2.2", desc: "Privacy, no logging", cors: false },
];

export interface EncryptedDnsNetwork {
  operator: string;
  /** Anycast listening addresses first, then the egress ranges (see below). */
  cidrs: string[];
}

/**
 * Networks belonging to public resolvers that offer DoH/DoT, used to judge
 * whether the visitor's own recursion path is one of them.
 *
 * Each operator lists two kinds of entry: the anycast addresses people
 * configure, and the ranges that service queries authoritative servers *from*.
 * The recursion probe only ever sees the second kind — 1.1.1.1 asks our
 * nameserver from 172.68.x.x, never from 1.1.1.1 — so matching just the
 * listening address would make the "encrypted" verdict unreachable, which is
 * the mirror of the bug where it was unconditionally true. A match on an
 * operator-owned range means the query genuinely came out of that operator's
 * network; it does not prove the first hop was encrypted, which is why the row
 * is worded as "reaches the internet via", not "your DNS is encrypted".
 */
export const ENCRYPTED_DNS_NETWORKS: EncryptedDnsNetwork[] = [
  {
    operator: "Cloudflare",
    cidrs: [
      "1.1.1.1/32", "1.0.0.1/32", "1.1.1.2/32", "1.0.0.2/32", "1.1.1.3/32", "1.0.0.3/32",
      "2606:4700:4700::1111/128", "2606:4700:4700::1001/128",
      "2606:4700:4700::1112/128", "2606:4700:4700::1002/128",
      "2606:4700:4700::1113/128", "2606:4700:4700::1003/128",
      "172.64.0.0/13", "162.158.0.0/15", "2606:4700::/32", "2a06:98c0::/29",
    ],
  },
  {
    operator: "Google",
    cidrs: [
      "8.8.8.8/32", "8.8.4.4/32",
      "2001:4860:4860::8888/128", "2001:4860:4860::8844/128",
      "74.125.0.0/16", "172.217.0.0/16", "172.253.0.0/16", "216.239.32.0/19",
      "108.170.128.0/17", "2001:4860::/32",
    ],
  },
  {
    operator: "Quad9",
    cidrs: [
      "9.9.9.9/32", "9.9.9.10/32", "9.9.9.11/32",
      "149.112.112.112/32", "149.112.112.9/32", "149.112.112.10/32", "149.112.112.11/32",
      "2620:fe::fe/128", "2620:fe::9/128", "2620:fe::10/128", "2620:fe::11/128",
      "9.9.9.0/24", "149.112.112.0/24", "2620:fe::/48",
    ],
  },
  {
    operator: "OpenDNS",
    cidrs: [
      "208.67.222.222/32", "208.67.220.220/32", "208.67.222.123/32", "208.67.220.123/32",
      "2620:119:35::35/128", "2620:119:53::53/128",
      "208.67.216.0/21", "2620:119::/40",
    ],
  },
  {
    operator: "AdGuard DNS",
    cidrs: [
      "94.140.14.14/32", "94.140.15.15/32", "94.140.14.15/32", "94.140.15.16/32",
      "2a10:50c0::ad1:ff/128", "2a10:50c0::ad2:ff/128",
      "2a10:50c0::bad1:ff/128", "2a10:50c0::bad2:ff/128",
      "94.140.14.0/23", "2a10:50c0::/32",
    ],
  },
  {
    operator: "Mullvad DNS",
    cidrs: [
      "194.242.2.2/32", "194.242.2.3/32", "194.242.2.4/32", "194.242.2.9/32",
      "2a07:e340::2/128", "2a07:e340::3/128", "2a07:e340::4/128", "2a07:e340::9/128",
      "194.242.2.0/24", "2a07:e340::/32",
    ],
  },
  {
    operator: "NextDNS",
    cidrs: [
      "45.90.28.0/32", "45.90.30.0/32", "2a07:a8c0::/128", "2a07:a8c1::/128",
      "45.90.28.0/22", "2a07:a8c0::/32", "2a07:a8c1::/32",
    ],
  },
];