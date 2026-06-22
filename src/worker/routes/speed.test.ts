import { describe, it, expect, beforeEach } from 'vitest';
import { handleSpeedDown, handleHeaders, MAX_UPLOAD_BYTES } from './speed';
import { rateLimitMap } from '../shared';

function makeRequest(path: string, ip = '1.2.3.4'): Request {
  return new Request(`https://netcheck.oilygold.xyz${path}`, {
    headers: { 'cf-connecting-ip': ip },
  });
}

describe('handleSpeedDown', () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  it('returns empty response when bytes param missing', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    expect(await res.text()).toBe('');
  });

  it('returns empty response when bytes param non-numeric', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down?bytes=abc');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    expect(await res.text()).toBe('');
  });

  it('returns empty response when bytes is zero', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down?bytes=0');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    expect(await res.text()).toBe('');
  });

  it('returns data of requested size', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down?bytes=100');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(100);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Content-Length')).toBe('100');
  });

  it('caps bytes at 100000000', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down?bytes=200000000');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    expect(res.headers.get('Content-Length')).toBe('100000000');
  });

  it('truncates fractional bytes', async () => {
    const url = new URL('https://netcheck.oilygold.xyz/api/speedtest/down?bytes=50.7');
    const res = handleSpeedDown(url, makeRequest('/api/speedtest/down'));
    expect(res.headers.get('Content-Length')).toBe('50');
  });
});

describe('handleHeaders', () => {
  it('echoes request headers as JSON', async () => {
    const req = new Request('https://netcheck.oilygold.xyz/api/headers', {
      headers: { 'x-custom': 'hello', 'x-test': 'world' },
    });
    const res = handleHeaders(req);
    const data = (await res.json()) as { headers: Record<string, string> };
    expect(data.headers['x-custom']).toBe('hello');
    expect(data.headers['x-test']).toBe('world');
  });
});

describe('MAX_UPLOAD_BYTES', () => {
  it('is 10 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});