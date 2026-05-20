import { observable } from './observable';
import type { ResolverResult, SecurityCheck } from '../types';

export interface IpData {
  ip: string;
  city: string;
  region: string;
  country: string;
  asOrganization: string;
  asn: number;
  timezone: string;
  colo: string;
  httpProtocol: string;
  tlsVersion: string;
  tlsCipher: string;
  clientTcpRtt: number;
  latitude: number;
  longitude: number;
  error?: string;
}

export const dnsState = {
  ipData: observable<IpData | null>(null),
  resolvers: observable<ResolverResult[]>([]),
  securityChecks: observable<SecurityCheck[]>([]),
  webrtcLeak: observable<boolean | null>(null),
  dnssec: observable<boolean | null>(null),
  loading: observable<boolean>(false),
};