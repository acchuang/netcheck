import { observable } from './observable';
import type { ConnectionInfo, TlsInfo, ResourceTimingBreakdown, StabilityResults, QualityScore } from '../connection-quality';

const defaultScore: QualityScore = {
  grade: '—',
  label: 'Unknown',
  factors: {
    tls: 'fail',
    serverRtt: 'fail',
    connectionType: 'unavailable',
    stability: 'unavailable',
  },
};

export const qualityState = {
  score: observable<QualityScore>(defaultScore),
  connectionInfo: observable<ConnectionInfo | null>(null),
  tlsInfo: observable<TlsInfo | null>(null),
  timing: observable<ResourceTimingBreakdown | null>(null),
  stabilityTest: observable<StabilityResults | null>(null),
  hasRun: observable<boolean>(false),
  isRunning: observable<boolean>(false),
  isRunningStability: observable<boolean>(false),
  loading: observable<boolean>(false),
};