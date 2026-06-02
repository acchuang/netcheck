import { describe, it, expect } from 'vitest';
import { fingerprintState } from '../state/fingerprint-state';

describe('fingerprintState', () => {
  it('has correct initial values', () => {
    expect(fingerprintState.uniquenessScore.get()).toBe(0);
    expect(fingerprintState.totalEntropy.get()).toBe(0);
    expect(fingerprintState.categories.get()).toEqual([]);
    expect(fingerprintState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: number[] = [];
    const dispose = fingerprintState.uniquenessScore.subscribe((v) => values.push(v));
    fingerprintState.uniquenessScore.set(85);
    expect(values).toEqual([85]);
    expect(fingerprintState.uniquenessScore.get()).toBe(85);
    dispose();
  });
});