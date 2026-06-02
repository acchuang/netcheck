import { describe, it, expect } from 'vitest';
import { dnssecValidationState } from '../state/dnssec-validation-state';

describe('dnssecValidationState', () => {
  it('has correct initial values', () => {
    expect(dnssecValidationState.domain.get()).toBe('');
    expect(dnssecValidationState.status.get()).toBe('insecure');
    expect(dnssecValidationState.adFlag.get()).toBe(false);
    expect(dnssecValidationState.chain.get()).toEqual([]);
    expect(dnssecValidationState.dsRecord.get()).toBeNull();
    expect(dnssecValidationState.dnskeyRecord.get()).toBeNull();
    expect(dnssecValidationState.error.get()).toBeNull();
    expect(dnssecValidationState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: string[] = [];
    const dispose = dnssecValidationState.status.subscribe((v) => values.push(v));
    dnssecValidationState.status.set('secure');
    expect(values).toEqual(['secure']);
    expect(dnssecValidationState.status.get()).toBe('secure');
    dispose();
  });
});