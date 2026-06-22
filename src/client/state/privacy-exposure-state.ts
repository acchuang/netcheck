import { observable } from './observable';

export interface PrivacyCheck {
  name: string;
  api: string;
  status: 'available' | 'blocked' | 'permission' | 'unavailable';
  risk: 'high' | 'medium' | 'low';
  reveals: string;
  tip: string;
}

export const privacyExposureState = {
  score: observable<number>(0),
  grade: observable<string>(''),
  riskLevel: observable<'high' | 'medium' | 'low'>('low'),
  checks: observable<PrivacyCheck[]>([]),
  loading: observable<boolean>(false),
};
