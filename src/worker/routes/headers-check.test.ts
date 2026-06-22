import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleHeadersCheck } from './headers-check';
import { rateLimitMap } from '../shared';

function makeRequest(urlParam: string | null, ip = '1.2.3.4'): Request {
  const qs = urlParam ? `?url=${encodeURIComponent(urlParam)}` : '';
  return new Request(`https://netcheck.oilygold.xyz/api/headers/check${qs}`, {
    headers: { 'cf-connecting-ip': ip },
  });
}

function mockResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status < 300 ? '<html><head></head><body>ok</body></html>' : '', {
    status,
    headers,
  });
}

describe('handleHeadersCheck', () => {
  beforeEach(() => {
    rateLimitMap.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects missing url param', async () => {
    const res = await handleHeadersCheck(makeRequest(null));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Missing');
  });

  it('rejects private hostname (SSRF guard)', async () => {
    const res = await handleHeadersCheck(makeRequest('https://127.0.0.1'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('Private');
  });

  it('rejects invalid URL', async () => {
    const res = await handleHeadersCheck(makeRequest('://bad'));
    expect(res.status).toBe(400);
  });

  it('rejects non-HTTP protocol', async () => {
    const res = await handleHeadersCheck(makeRequest('ftp://example.com'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('HTTP');
  });

  it('returns headers for a successful fetch', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        mockResponse(200, {
          'strict-transport-security': 'max-age=31536000',
          'content-security-policy': "default-src 'self'",
        }),
      )
      .mockResolvedValueOnce(mockResponse(404));
    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('grade');
    expect(data).toHaveProperty('score');
    expect(data).toHaveProperty('checks');
    fetchSpy.mockRestore();
  });

  it('follows redirects up to MAX_REDIRECT_HOPS (4 redirects, then 200)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse(301, { location: 'https://example.com/page1' }))
      .mockResolvedValueOnce(mockResponse(301, { location: 'https://example.com/page2' }))
      .mockResolvedValueOnce(mockResponse(301, { location: 'https://example.com/page3' }))
      .mockResolvedValueOnce(mockResponse(301, { location: 'https://example.com/page4' }))
      .mockResolvedValueOnce(mockResponse(200, { 'strict-transport-security': 'max-age=1' }))
      .mockResolvedValueOnce(mockResponse(404));

    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { grade: string; redirectChain: string[] };
    expect(data).toHaveProperty('grade');
    expect(data).toHaveProperty('redirectChain');
    expect(data.redirectChain).toHaveLength(4);
    expect(fetchSpy).toHaveBeenCalledTimes(6);
    fetchSpy.mockRestore();
  });

  it('rejects too many redirects (5 redirects triggers error)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockResponse(301, { location: 'https://example.com/loop' }),
    );

    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('redirects');
    fetchSpy.mockRestore();
  });

  it('blocks redirect to private hostname', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse(301, { location: 'https://10.0.0.1/secret' }));

    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('private');
    fetchSpy.mockRestore();
  });

  it('returns 500 on fetch failure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(500);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain('fetch');
    fetchSpy.mockRestore();
  });

  it('respects rate limit', async () => {
    for (let i = 0; i < 120; i++) {
      await handleHeadersCheck(makeRequest('https://example.com'));
    }
    const res = await handleHeadersCheck(makeRequest('https://example.com'));
    expect(res.status).toBe(429);
  });
});