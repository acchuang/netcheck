import { observable } from './observable';

export interface DnssecChainStep {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  details: string;
}

export interface DsRecord {
  present: boolean;
  algorithm?: string;
  digestType?: string;
  keyTag?: number;
}

export interface DnskeyRecord {
  present: boolean;
  algorithm?: string;
  keyTag?: number;
  flags?: number;
}

export const dnssecValidationState = {
  domain: observable<string>(''),
  status: observable<'secure' | 'insecure' | 'bogus' | 'error'>('insecure'),
  adFlag: observable<boolean>(false),
  chain: observable<DnssecChainStep[]>([]),
  dsRecord: observable<DsRecord | null>(null),
  dnskeyRecord: observable<DnskeyRecord | null>(null),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};