import { observable } from './observable';
import type { CtCert } from '../cert-transparency';

export interface CtSummary {
  total: number;
  active: number;
  expired: number;
  issuers: number;
  wildcardCount: number;
  recentlyIssued: number;
}

export const certTransparencyState = {
  domain: observable<string>(''),
  summary: observable<CtSummary | null>(null),
  certs: observable<CtCert[]>([]),
  trustIndicators: observable<string[]>([]),
  totalInDb: observable<number>(0),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};