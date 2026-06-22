import { describe, it, expect } from 'vitest';
import { dnsState } from '../state/dns-state';

describe('dnsState', () => {
  it('has ipData starting as null', () => {
    expect(dnsState.ipData.get()).toBeNull();
  });

  it('has resolvers starting as empty array', () => {
    expect(dnsState.resolvers.get()).toEqual([]);
  });

  it('has securityChecks starting as empty array', () => {
    expect(dnsState.securityChecks.get()).toEqual([]);
  });

  it('has webrtcLeak starting as null', () => {
    expect(dnsState.webrtcLeak.get()).toBeNull();
  });

  it('has dnssec starting as null', () => {
    expect(dnsState.dnssec.get()).toBeNull();
  });
});
