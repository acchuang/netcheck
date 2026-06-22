import { describe, it, expect } from 'vitest';
import { breachState } from '../state/breach-state';

describe('breachState', () => {
  it('has correct initial values', () => {
    expect(breachState.found.get()).toBe(false);
    expect(breachState.count.get()).toBe(0);
    expect(breachState.error.get()).toBeNull();
    expect(breachState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: boolean[] = [];
    const dispose = breachState.found.subscribe((v) => values.push(v));
    breachState.found.set(true);
    expect(values).toEqual([true]);
    expect(breachState.found.get()).toBe(true);
    dispose();
  });
});
