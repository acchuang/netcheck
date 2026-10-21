import type { ResolverInfo } from "../shared/resolvers.ts";

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
