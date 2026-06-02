import { describe, it, expect } from 'vitest';
import { networkMapState } from '../state/network-map-state';

describe('networkMapState', () => {
  it('has correct initial values', () => {
    expect(networkMapState.results.get()).toBeNull();
    expect(networkMapState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: boolean[] = [];
    const dispose = networkMapState.loading.subscribe((v) => values.push(v));
    networkMapState.loading.set(true);
    expect(values).toEqual([true]);
    expect(networkMapState.loading.get()).toBe(true);
    dispose();
  });
});