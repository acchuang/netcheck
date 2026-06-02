import { describe, it, expect } from 'vitest';
import { headersState } from '../state/headers-state';

describe('headersState', () => {
  it('has correct initial values', () => {
    expect(headersState.url.get()).toBe('');
    expect(headersState.grade.get()).toBe('');
    expect(headersState.score.get()).toBe(0);
    expect(headersState.checks.get()).toEqual([]);
    expect(headersState.cspAnalysis.get()).toBeNull();
    expect(headersState.loading.get()).toBe(false);
  });
});