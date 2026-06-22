import { describe, it, expect } from 'vitest';
import { speedState } from '../state/speed-state';

describe('speedState', () => {
  it('has download starting as 0', () => {
    expect(speedState.download.get()).toBe(0);
  });

  it('has upload starting as 0', () => {
    expect(speedState.upload.get()).toBe(0);
  });

  it('has latency starting as 0', () => {
    expect(speedState.latency.get()).toBe(0);
  });

  it('has grade starting as empty string', () => {
    expect(speedState.grade.get()).toBe('');
  });

  it('has phase starting as idle', () => {
    expect(speedState.phase.get()).toBe('idle');
  });
});
