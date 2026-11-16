// A proxy or VPN changes one thing: the exit IP. Everything else the visitor
// sends — their clock, their language, their resolver, the shape of their round
// trip — still describes where they actually are. No single reading proves
// anything; a reading that disagrees with the IP is what gives the game away.

import { encryptedDnsOperator } from "./ip-classify.ts";

/** When a site gets to read the value, earliest first. */
export type TellLayer = "connection" | "tls" | "headers" | "scripts" | "probes";
export type TellStatus = "ok" | "warn" | "info" | "unknown";

export interface Tell {
  id: "timezone" | "rtt" | "language" | "resolverCountry";
  layer: TellLayer;
  status: TellStatus;
  /** What the IP / edge side says. */
  network?: string;
  /** What the browser side says. */
  browser?: string;
}

/** Minutes east of UTC for `zone` right now, or null for an unknown zone. */
export function utcOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!name) return null;
    if (name === "GMT") return 0;
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
    if (!m) return null;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  } catch {
    return null;
  }
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const mm = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
}

const TZ_GAP_MINUTES = 120;

/**
 * Compares offsets, not names: Europe/Paris and Europe/Berlin are the same
 * clock. A one-hour gap is a border region or a DST edge; two or more is a
 * clock set somewhere the IP isn't.
 */
export function timezoneTell(ipZone: string | null | undefined, browserZone: string | null | undefined, at: Date = new Date()): Tell {
  const base = { id: "timezone", layer: "scripts" } as const;
  const net = ipZone ? utcOffsetMinutes(ipZone, at) : null;
  const own = browserZone ? utcOffsetMinutes(browserZone, at) : null;
  if (net === null || own === null) return { ...base, status: "unknown" };
  return {
    ...base,
    status: Math.abs(net - own) >= TZ_GAP_MINUTES ? "warn" : "ok",
    network: `${ipZone} (${formatOffset(net)})`,
    browser: `${browserZone} (${formatOffset(own)})`,
  };
}

const RTT_SLACK_MS = 50;

/**
 * The edge times the TCP handshake with whatever opened the connection. Behind
 * a proxy that is the proxy, so the edge sees a short hop while the browser's
 * own round trip still includes the leg to the proxy. Both conditions must
 * hold: a fixed slack alone flags every slow link, a ratio alone flags every
 * fast one over a 5 ms jitter.
 */
export function rttTell(browserMs: number | null | undefined, edgeMs: number | null | undefined): Tell {
  const base = { id: "rtt", layer: "connection" } as const;
  // No clientTcpRtt on HTTP/3: QUIC isn't TCP. Absent is not zero.
  if (!browserMs || !edgeMs || browserMs <= 0 || edgeMs <= 0) return { ...base, status: "unknown" };
  const gap = browserMs - edgeMs;
  return {
    ...base,
    status: gap > RTT_SLACK_MS && browserMs > edgeMs * 2 ? "warn" : "ok",
    network: `${Math.round(edgeMs)} ms`,
    browser: `${Math.round(browserMs)} ms`,
  };
}

function regionOf(tag: string): string | null {
  try {
    return new Intl.Locale(tag).region ?? null;
  } catch {
    return null;
  }
}

// cf-ipcountry: XX = unknown, T1 = Tor. Neither is a country to compare against.
const NOT_A_COUNTRY = new Set(["XX", "T1"]);

/**
 * Weak on purpose: an en-US browser outside the US is the norm, not a tell.
 * It never warns, only notes when none of the listed languages name the IP's
 * country.
 */
export function languageTell(languages: readonly string[], ipCountry: string | null | undefined): Tell {
  const base = { id: "language", layer: "headers" } as const;
  const regions = languages.map(regionOf).filter((r): r is string => r !== null);
  const country = ipCountry?.toUpperCase();
  if (!country || NOT_A_COUNTRY.has(country) || regions.length === 0) return { ...base, status: "unknown" };
  return {
    ...base,
    status: regions.includes(country) ? "ok" : "info",
    network: country,
    browser: languages.join(", "),
  };
}

export interface LocatedResolver {
  ip: string;
  /** ISO country the address is registered to, null when the lookup failed. */
  country: string | null;
}

/**
 * The classic DNS leak: the tunnel carries the traffic but the system resolver
 * is still the home ISP's, in the home country. Known public operators are
 * skipped — their egress addresses are registered where the company is, not
 * where the node runs, so 8.8.8.8's "US" would flag every Google DNS user.
 * Returns null with nothing observed, so the row can be dropped rather than
 * shown as a check that never ran.
 */
export function resolverCountryTell(resolvers: readonly LocatedResolver[], ipCountry: string | null | undefined): Tell | null {
  if (resolvers.length === 0) return null;
  const base = { id: "resolverCountry", layer: "probes" } as const;
  const country = ipCountry?.toUpperCase();
  const comparable = resolvers.filter((r) => r.country && !encryptedDnsOperator(r.ip));
  if (!country || NOT_A_COUNTRY.has(country) || comparable.length === 0) return { ...base, status: "unknown" };
  const elsewhere = comparable.find((r) => r.country!.toUpperCase() !== country);
  const shown = elsewhere ?? comparable[0];
  return {
    ...base,
    status: elsewhere ? "warn" : "ok",
    network: country,
    browser: `${shown.ip} (${shown.country!.toUpperCase()})`,
  };
}
