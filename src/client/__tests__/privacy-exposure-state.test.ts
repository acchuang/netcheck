import { describe, it, expect } from 'vitest';
import { privacyExposureState } from '../state/privacy-exposure-state';

describe('privacyExposureState', () => {
  it('has correct initial values', () => {
    expect(privacyExposureState.score.get()).toBe(0);
    expect(privacyExposureState.grade.get()).toBe('');
    expect(privacyExposureState.riskLevel.get()).toBe('low');
    expect(privacyExposureState.checks.get()).toEqual([]);
    expect(privacyExposureState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: number[] = [];
    const dispose = privacyExposureState.score.subscribe((v) => values.push(v));
    privacyExposureState.score.set(75);
    expect(values).toEqual([75]);
    expect(privacyExposureState.score.get()).toBe(75);
    dispose();
  });
});