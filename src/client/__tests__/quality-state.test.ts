import { describe, it, expect } from 'vitest';
import { qualityState } from '../state/quality-state';

describe('qualityState', () => {
  it('has correct initial values', () => {
    expect(qualityState.score.get().grade).toBe('—');
    expect(qualityState.score.get().label).toBe('Unknown');
    expect(qualityState.connectionInfo.get()).toBeNull();
    expect(qualityState.tlsInfo.get()).toBeNull();
    expect(qualityState.timing.get()).toBeNull();
    expect(qualityState.stabilityTest.get()).toBeNull();
    expect(qualityState.hasRun.get()).toBe(false);
    expect(qualityState.isRunning.get()).toBe(false);
    expect(qualityState.isRunningStability.get()).toBe(false);
    expect(qualityState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: string[] = [];
    const dispose = qualityState.score.subscribe((v) => values.push(v.grade));
    qualityState.score.set({
      grade: 'A+',
      label: 'Exceptional',
      factors: { tls: 'pass', serverRtt: 'pass', connectionType: 'pass', stability: 'pass' },
    });
    expect(values).toEqual(['A+']);
    expect(qualityState.score.get().grade).toBe('A+');
    dispose();
  });
});
