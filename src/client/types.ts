export interface ResolverResult {
  name: string;
  host: string;
  ip: string;
  desc: string;
  reachable: boolean;
  latency: number | null;
  dnssec: boolean;
  filtering: boolean;
}

export type SecurityStatus = "pass" | "warn" | "fail";

export interface SecurityCheck {
  name: string;
  status: SecurityStatus;
  detail: string;
}