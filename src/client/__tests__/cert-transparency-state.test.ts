import { describe, it, expect } from 'vitest';
import { certTransparencyState } from '../state/cert-transparency-state';

describe('certTransparencyState', () => {
  it('has correct initial values', () => {
    expect(certTransparencyState.domain.get()).toBe('');
    expect(certTransparencyState.summary.get()).toBeNull();
    expect(certTransparencyState.certs.get()).toEqual([]);
    expect(certTransparencyState.trustIndicators.get()).toEqual([]);
    expect(certTransparencyState.totalInDb.get()).toBe(0);
    expect(certTransparencyState.error.get()).toBeNull();
    expect(certTransparencyState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: string[] = [];
    const dispose = certTransparencyState.domain.subscribe((v) => values.push(v));
    certTransparencyState.domain.set('example.com');
    expect(values).toEqual(['example.com']);
    expect(certTransparencyState.domain.get()).toBe('example.com');
    dispose();
  });
});
