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