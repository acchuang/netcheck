import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRegionPing, handleMapProbes, PROBES } from './map';
import { rateLimitMap } from '../shared';
import type { Env } from '../types';

function makeRequest(path: string, ip = '1.2.3.4'): Request {
  return new Request(`https://netcheck.oilygold.xyz${path}`, {
    headers: { 'cf-connecting-ip': ip },
  });
}

function mockBucket(getResult: { body?: ReadableStream; size?: number } | null): R2Bucket {
  return {
    get: vi.fn(async () => getResult) as unknown as R2Bucket['get'],
  } as unknown as R2Bucket;
}

function makeEnv(bucket: R2Bucket): Env {
  return {
    ANALYTICS: {} as KVNamespace,
    PING_WNAM: bucket,
    PING_ENAM: bucket,
    PING_WEUR: bucket,
    PING_EEUR: bucket,
    PING_APAC: bucket,
    PING_OC: bucket,
    AI: {} as unknown as Env['AI'],
  };
}

describe('handleRegionPing', () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  it('returns 400 when region param missing', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/map/ping');
    const res = await handleRegionPing(url, makeEnv(mockBucket(null)), makeRequest('/api/map/ping'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Missing region');
  });

  it('returns 400 for unknown region', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/map/ping?region=mars');
    const res = await handleRegionPing(url, makeEnv(mockBucket(null)), makeRequest('/api/map/ping?region=mars'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Unknown region');
  });

  it('returns 404 when ping file not found in bucket', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/map/ping?region=wnam');
    const env = makeEnv(mockBucket(null));
    const res = await handleRegionPing(url, env, makeRequest('/api/map/ping?region=wnam'));
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Ping file not found');
  });

  it('returns latency when ping file found', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/map/ping?region=wnam');
    const env = makeEnv(mockBucket({ body: new ReadableStream(), size: 100 }));
    const res = await handleRegionPing(url, env, makeRequest('/api/map/ping?region=wnam'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { region: string; latency: number; ts: number };
    expect(data.region).toBe('wnam');
    expect(typeof data.latency).toBe('number');
    expect(data.ts).toBeGreaterThan(0);
  });

  it('respects rate limit', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/map/ping?region=wnam');
    const env = makeEnv(mockBucket(null));
    for (let i = 0; i < 120; i++) {
      await handleRegionPing(url, env, makeRequest('/api/map/ping?region=wnam'));
    }
    const res = await handleRegionPing(url, env, makeRequest('/api/map/ping?region=wnam'));
    expect(res.status).toBe(429);
  });
});

describe('handleMapProbes', () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  it('returns probe list and user location from cf', async () => {
    const req = new Request('https://netcheck.oilygold.xyz/api/map/probes', {
      headers: {
        'cf-connecting-ip': '1.2.3.4',
        // simulate cf properties via custom header shape not available in jsdom,
        // so userColo defaults to 'unknown'
      },
    });
    const res = await handleMapProbes(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      userColo: string;
      probes: Array<{ id: string; name: string; lat: number; lon: number }>;
    };
    expect(data.userColo).toBe('unknown');
    expect(Array.isArray(data.probes)).toBe(true);
    expect(data.probes.length).toBe(PROBES.length);
    expect(data.probes[0]).toHaveProperty('id');
    expect(data.probes[0]).toHaveProperty('lat');
    expect(data.probes[0]).toHaveProperty('lon');
  });

  it('respects rate limit', async () => {
    for (let i = 0; i < 120; i++) {
      await handleMapProbes(makeRequest('/api/map/probes'));
    }
    const res = await handleMapProbes(makeRequest('/api/map/probes'));
    expect(res.status).toBe(429);
  });
});