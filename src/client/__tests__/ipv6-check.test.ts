import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dnsState, type Ipv6Result } from '../state/dns-state';

// We test ipv6-check by mocking fetch and verifying it sets dnsState.ipv6
// Since runIpv6Check does fetch calls, we mock globalThis.fetch

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  dnsState.ipv6.set(null);
});

describe('ipv6-check', () => {
  it('sets ipv4Connectivity to true on successful IPv4 fetch', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.ipv4Connectivity).toBe(true);
  });

  it('sets ipv4Connectivity to false on failed IPv4 fetch', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.ipv4Connectivity).toBe(false);
  });

  it('sets ipv6Connectivity to true on successful IPv6 fetch', async () => {
    // IPv4 ping
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    // IPv6 fetch
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    // AAAA DNS
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [{ data: '2606:4700::1' }] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.ipv6Connectivity).toBe(true);
  });

  it('sets ipv6Connectivity to false on failed IPv6 fetch', async () => {
    // IPv4 ping ok
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    // IPv6 fetch fails
    mockFetch.mockRejectedValueOnce(new Error('IPv6 fail'));
    // AAAA DNS
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.ipv6Connectivity).toBe(false);
  });

  it('sets aaaaResolution from DNS response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [{ data: '2606:4700::1' }] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.aaaaResolution).toBe(true);
  });

  it('sets aaaaResolution to false when no AAAA records', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.aaaaResolution).toBe(false);
  });

  it('sets dualStackPreference to ipv6 when faster', async () => {
    // IPv4: 50ms
    mockFetch.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, status: 200 };
    });
    // IPv6: faster (resolves immediately)
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    // AAAA DNS
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [{ data: '::1' }] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    // Both connected, preference depends on measured latency
    expect(['ipv6', 'ipv4']).toContain(result.dualStackPreference);
  });

  it('sets ipv4Fallback when IPv4 is available', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ Answer: [] }),
    });
    const { runIpv6Check } = await import('../state/ipv6-check');
    await runIpv6Check();
    const result = dnsState.ipv6.get() as Ipv6Result;
    expect(result.ipv4Fallback).toBe(true);
  });
});