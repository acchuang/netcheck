import { describe, it, expect } from 'vitest';
import { adblockState } from '../state/adblock-state';

describe('adblockState', () => {
  it('has correct initial values', () => {
    expect(adblockState.score.get()).toBe(0);
    expect(adblockState.totalBlocked.get()).toBe(0);
    expect(adblockState.totalTests.get()).toBe(0);
    expect(adblockState.results.get()).toEqual([]);
    expect(adblockState.categoryScores.get()).toEqual({});
    expect(adblockState.filterLists.get()).toEqual([]);
    expect(adblockState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: number[] = [];
    const dispose = adblockState.score.subscribe((v) => values.push(v));
    adblockState.score.set(85);
    expect(values).toEqual([85]);
    expect(adblockState.score.get()).toBe(85);
    dispose();
  });
});