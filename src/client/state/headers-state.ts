import { observable } from './observable';
import type { CspAnalysis, HeaderCheckResult } from '../headers-ui';

export const headersState = {
  url: observable<string>(''),
  grade: observable<string>(''),
  score: observable<number>(0),
  checks: observable<HeaderCheckResult[]>([]),
  cspAnalysis: observable<CspAnalysis | null>(null),
  loading: observable<boolean>(false),
};
