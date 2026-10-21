import type { ResolverInfo } from "../shared/resolvers.ts";
import { t } from "./i18n.ts";
import { CF_POPS } from "./ui-utils.ts";

export interface ResolverResult extends ResolverInfo {
  reachable: boolean;
  latency: number | null;
  /** null when the probe couldn't reach a verdict. */
  validatesDnssec: boolean | null;
  /** Extended DNS Error explaining the SERVFAIL, when the resolver sends one. */
  dnssecDetail: string | null;
  forwardsEcs: boolean | null;
  ecsSubnet: string | null;
  egressIp: string | null;
  filtering: boolean;
  /** True once a browser-side probe replaced the Worker's numbers for this row. */
  measuredFromBrowser?: boolean;
}

export function blankResult(resolver: ResolverInfo): ResolverResult {
  return {
    ...resolver,
    reachable: false,
    latency: null,
    validatesDnssec: null,
    dnssecDetail: null,
    forwardsEcs: null,
    ecsSubnet: null,
    egressIp: null,
    filtering: false,
  };
}

export type SecurityStatus = "pass" | "warn" | "fail" | "info";
export type SecurityCheckId = "dnssec" | "doh" | "ecs" | "malware" | "webrtc" | "lan";

// Stores identifiers + i18n keys (not display strings) so locale switches
// can re-render the card without re-running the checks.
export interface SecurityCheck {
  id: SecurityCheckId;
  status: SecurityStatus;
  detailKey: string;
  detailArg?: string;
}

export interface IpData {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  asOrganization?: string;
  asn?: string;
  timezone?: string;
  colo?: string;
  httpProtocol?: string;
  tlsVersion?: string;
  tlsCipher?: string;
  clientTcpRtt?: number;
  error?: string;
}

export interface ProbeResult {
  resolvers: { ip: string; ecs: string | null; count: number }[];
  /** The nameserver could not be read at all — not the same as seeing nothing. */
  unreachable?: boolean;
  /** Read-back failed partway; the list is what arrived before it did. */
  incomplete?: boolean;
}

/**
 * Everything one station run has observed. The UI renders from this, and so
 * will the export, so what's on screen and what's in the report can't drift.
 * Unset fields mean "not seen yet"; they are never filled with a guess.
 */
export interface DnsReport {
  ip: IpData | null;
  /** undefined = not yet probed. */
  ipv6: string | null | undefined;
  resolvers: ResolverResult[] | null;
  /** undefined = probe still running, null = this deployment has no probe. */
  probe: ProbeResult | null | undefined;
  security: SecurityCheck[] | null;
}

export function emptyReport(): DnsReport {
  return { ip: null, ipv6: undefined, resolvers: null, probe: undefined, security: null };
}

// --- Rows ---
// The screen and the export both render from these, so a row's status and
// wording can only be decided in one place.

export type RowStatus = "pass" | "warn" | "fail" | "info";

export interface DnsRow {
  status: RowStatus;
  label: string;
  value: string;
  sublabel?: string;
}

const DASH = "—";

export function ipFields(ip: IpData | null) {
  const pop = ip?.colo ? CF_POPS[ip.colo] : null;
  return {
    ip: ip?.ip || DASH,
    location: [ip?.city, ip?.region, ip?.country].filter(Boolean).join(", ") || DASH,
    asn: ip?.asOrganization ? `${ip.asOrganization} (AS${ip.asn})` : DASH,
    timezone: ip?.timezone || DASH,
    colo: pop ? `${pop[0]} (${ip!.colo})` : ip?.colo || DASH,
    http: ip?.httpProtocol || DASH,
    tls: ip?.tlsVersion || DASH,
  };
}

export interface ResolverRow {
  status: RowStatus;
  reachable: boolean;
  name: string;
  ip: string;
  badges: { text: string; kind: "pass" | "leak" | "filter" }[];
  egressIp: string | null;
  value: string;
  /** The label as plain text, the way a reader of the export sees it. */
  label: string;
}

export function resolverRows(resolvers: ResolverResult[]): ResolverRow[] {
  const reachable = resolvers.filter((r) => r.reachable);
  if (reachable.length === 0) return [];
  const fastest = reachable.reduce((a, b) => ((a.latency ?? Infinity) < (b.latency ?? Infinity) ? a : b));

  const up = reachable.map((r): ResolverRow => {
    const badges: ResolverRow["badges"] = [];
    if (r.validatesDnssec === true) badges.push({ text: "DNSSEC", kind: "pass" });
    if (r.validatesDnssec === false) badges.push({ text: "NO DNSSEC", kind: "leak" });
    if (r.forwardsEcs === true) badges.push({ text: "ECS", kind: "leak" });
    if (r.filtering) badges.push({ text: "Filtering", kind: "filter" });
    return {
      status: r.name === fastest.name ? "pass" : "warn",
      reachable: true,
      name: r.name,
      ip: r.ip,
      badges,
      egressIp: r.egressIp,
      value: `${r.latency}ms`,
      label: [r.name, r.ip, ...badges.map((b) => b.text)].join(" "),
    };
  });
  const down = resolvers.filter((r) => !r.reachable).map((r): ResolverRow => ({
    status: "fail",
    reachable: false,
    name: r.name,
    ip: r.ip,
    badges: [],
    egressIp: null,
    value: t("dns.unreachable"),
    label: `${r.name} (${r.ip})`,
  }));
  return [...up, ...down];
}

export interface EcsView {
  known: ResolverResult[];
  forwarding: ResolverResult[];
  /** Only a browser-side probe sees the visitor's own subnet; the Worker's would be Cloudflare's edge. */
  leakedSubnet: string | null;
  rows: DnsRow[];
}

export function ecsView(resolvers: ResolverResult[]): EcsView {
  const known = resolvers.filter((r) => r.reachable && r.forwardsEcs !== null);
  const forwarding = known.filter((r) => r.forwardsEcs);
  return {
    known,
    forwarding,
    leakedSubnet: known.find((r) => r.measuredFromBrowser && r.ecsSubnet)?.ecsSubnet ?? null,
    rows: known.map((r) => ({
      status: r.forwardsEcs ? "warn" : "pass",
      label: r.name,
      value: r.forwardsEcs
        ? (r.measuredFromBrowser && r.ecsSubnet ? r.ecsSubnet : t("dns.ecsYes"))
        : t("dns.ecsNo"),
    })),
  };
}

/** `wrapSubnet` lets the screen style the subnet; the export leaves it plain. */
export function ecsSummary(e: EcsView, wrapSubnet: (subnet: string) => string = (s) => s): string {
  if (e.known.length === 0) return t("dns.ecsUnknown");
  if (e.leakedSubnet) return t("dns.ecsLeaking", wrapSubnet(e.leakedSubnet));
  if (e.forwarding.length > 0) return t("dns.ecsForwardOnly", String(e.forwarding.length), String(e.known.length));
  return t("dns.ecsNone");
}

export function securityRows(checks: SecurityCheck[]): DnsRow[] {
  return checks.map((c) => ({
    status: c.status,
    label: t(`dns.check.${c.id}`),
    value: "",
    sublabel: c.detailArg !== undefined ? t(c.detailKey, c.detailArg) : t(c.detailKey),
  }));
}
