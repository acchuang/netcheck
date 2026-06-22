import { observable } from './observable';
import type { FingerprintCategory } from '../fingerprint';

export const fingerprintState = {
  uniquenessScore: observable<number>(0),
  totalEntropy: observable<number>(0),
  categories: observable<FingerprintCategory[]>([]),
  loading: observable<boolean>(false),
  fpDrift: observable<number>(0),
  fpDriftDate: observable<string | null>(null),
};
