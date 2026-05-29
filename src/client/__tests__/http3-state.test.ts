import { describe, it, expect } from 'vitest';
import { http3State } from '../state/http3-state';

describe('http3State', () => {
  it('starts with null result', () => {
    expect(http3State.result.get()).toBeNull();
  });

  it('starts with loading false', () => {
    expect(http3State.loading.get()).toBe(false);
  });

  it('starts with null error', () => {
    expect(http3State.error.get()).toBeNull();
  });

  it('allows setting result', () => {
    http3State.result.set({
      pingResults: [{ protocol: 'h3', latency: 42 }],
      dominantProtocol: 'h3',
      h3PingCount: 1,
      totalPings: 1,
      supportsH3: true,
      medianLatency: 42,
      zeroRtt: true,
      altSvc: 'h3=":443"',
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(true);
    expect(r.dominantProtocol).toBe('h3');
    expect(r.zeroRtt).toBe(true);
    http3State.result.set(null);
  });

  it('allows setting error and loading', () => {
    http3State.error.set('fail');
    expect(http3State.error.get()).toBe('fail');
    http3State.loading.set(true);
    expect(http3State.loading.get()).toBe(true);
    http3State.error.set(null);
    http3State.loading.set(false);
  });
});

describe('runHttp3Test', () => {
  it('computes h3 detection and median latency from ping results', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'h3', latency: 40 },
        { protocol: 'h3', latency: 42 },
        { protocol: 'h2', latency: 55 },
        { protocol: 'h3', latency: 44 },
        { protocol: 'h3', latency: 38 },
      ],
      dominantProtocol: 'h3',
      h3PingCount: 4,
      totalPings: 5,
      supportsH3: true,
      medianLatency: 42,
      zeroRtt: false,
      altSvc: 'h3=":443"',
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(true);
    expect(r.h3PingCount).toBe(4);
    expect(r.medianLatency).toBe(42);
    expect(r.dominantProtocol).toBe('h3');
    http3State.result.set(null);
  });

  it('handles h2-only scenario', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'h2', latency: 50 },
        { protocol: 'h2', latency: 55 },
        { protocol: 'h2', latency: 52 },
        { protocol: 'h2', latency: 48 },
        { protocol: 'h2', latency: 53 },
      ],
      dominantProtocol: 'h2',
      h3PingCount: 0,
      totalPings: 5,
      supportsH3: false,
      medianLatency: 52,
      zeroRtt: null,
      altSvc: null,
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(false);
    expect(r.h3PingCount).toBe(0);
    http3State.result.set(null);
  });

  it('handles no-h3 browser scenario', () => {
    http3State.result.set({
      pingResults: [
        { protocol: 'http/1.1', latency: 120 },
        { protocol: 'http/1.1', latency: 125 },
      ],
      dominantProtocol: 'http/1.1',
      h3PingCount: 0,
      totalPings: 2,
      supportsH3: false,
      medianLatency: 122,
      zeroRtt: null,
      altSvc: null,
    });
    const r = http3State.result.get()!;
    expect(r.supportsH3).toBe(false);
    expect(r.zeroRtt).toBeNull();
    http3State.result.set(null);
  });
});
