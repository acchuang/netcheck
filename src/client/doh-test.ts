interface DohResult {
  resolver: string;
  url: string;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

const DOH_RESOLVERS: Array<{ name: string; url: string }> = [
  { name: 'Cloudflare', url: 'https://1.1.1.1/dns-query' },
  { name: 'Google', url: 'https://dns.google/dns-query' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' },
  { name: 'NextDNS', url: 'https://dns.nextdns.io/dns-query' },
];

export async function testDohConnectivity(): Promise<DohResult[]> {
  const results: DohResult[] = [];
  for (const r of DOH_RESOLVERS) {
    try {
      const start = performance.now();
      const res = await fetch(r.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/dns-message', Accept: 'application/dns-message' },
        body: new Uint8Array([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 7, 101, 120, 97, 109, 112, 108, 101, 3, 99, 111, 109, 0, 0, 1, 0, 1]).buffer,
        signal: AbortSignal.timeout(5000),
      });
      results.push({
        resolver: r.name,
        url: r.url,
        reachable: res.ok || res.status === 400,
        latencyMs: Math.round(performance.now() - start),
        error: null,
      });
    } catch (e) {
      results.push({ resolver: r.name, url: r.url, reachable: false, latencyMs: null, error: (e as Error).message });
    }
  }
  return results;
}

export function renderDohRows(data: DohResult[]): string {
  if (!data.length) return '';
  return data
    .map((r) => {
      const icon = r.reachable ? 'pass' : 'fail';
      const iconSvg = r.reachable
        ? '<circle cx="12" cy="12" r="10"/><polyline points="9 12 11.5 14.5 16 9.5"/>'
        : '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
      const latency = r.latencyMs !== null ? `${r.latencyMs} ms` : '—';
      return `<div class="dns-check-item fade-in">
        <svg class="check-icon ${icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <span class="check-label">${r.resolver}</span>
        <span class="check-value">${r.reachable ? `Reachable (${latency})` : `Unreachable`}</span>
      </div>`;
    })
    .join('');
}