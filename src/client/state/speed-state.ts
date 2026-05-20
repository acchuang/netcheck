import { observable } from './observable';

export type SpeedPhase = 'idle' | 'latency' | 'download' | 'upload' | 'done';

export const speedState = {
  phase: observable<SpeedPhase>('idle'),
  progress: observable<number>(0),
  download: observable<number>(0),
  upload: observable<number>(0),
  latency: observable<number>(0),
  jitter: observable<number>(0),
  bufferbloat: observable<number>(0),
  grade: observable<string>(''),
  loading: observable<boolean>(false),
};