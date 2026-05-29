import { observable } from './observable';

export interface H3TestResult {
  pingResults: { protocol: string; latency: number }[];
  dominantProtocol: string;
  h3PingCount: number;
  totalPings: number;
  supportsH3: boolean;
  medianLatency: number | null;
  zeroRtt: boolean | null;
  altSvc: string | null;
}

export const http3State = {
  result: observable<H3TestResult | null>(null),
  loading: observable<boolean>(false),
  error: observable<string | null>(null),
};

export async function runHttp3Test(): Promise<void> {
  http3State.loading.set(true);
  http3State.error.set(null);

  try {
    const pingResults: { protocol: string; latency: number }[] = [];
    let altSvc: string | null = null;

    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      const res = await fetch(`/api/speedtest/ping?_h3=${i}`);
      const end = performance.now();
      const latency = Math.round(end - start);

      const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const ourEntry = entries.find((e) => e.name.includes(`_h3=${i}`));
      const protocol = ourEntry?.nextHopProtocol || 'unknown';

      pingResults.push({ protocol, latency });

      if (i === 0) {
        altSvc = res.headers.get('Alt-Svc');
      }
    }

    const h3Count = pingResults.filter((p) => p.protocol.startsWith('h3')).length;
    const latencies = pingResults.map((p) => p.latency).sort((a, b) => a - b);
    const medianLatency = latencies[Math.floor(latencies.length / 2)];

    let zeroRtt: boolean | null = null;
    if (h3Count >= 2) {
      const secondProtocol = pingResults[1]?.protocol;
      if (secondProtocol?.startsWith('h3') && pingResults[1].latency < 5) {
        zeroRtt = true;
      } else if (h3Count > 0) {
        zeroRtt = false;
      }
    }

    const protocolCounts: Record<string, number> = {};
    for (const p of pingResults) {
      protocolCounts[p.protocol] = (protocolCounts[p.protocol] || 0) + 1;
    }
    let dominant = 'unknown';
    let maxCount = 0;
    for (const [proto, count] of Object.entries(protocolCounts)) {
      if (count > maxCount) {
        dominant = proto;
        maxCount = count;
      }
    }

    http3State.result.set({
      pingResults,
      dominantProtocol: dominant,
      h3PingCount: h3Count,
      totalPings: 5,
      supportsH3: h3Count > 0,
      medianLatency,
      zeroRtt,
      altSvc,
    });
  } catch (e) {
    http3State.error.set(e instanceof Error ? e.message : 'HTTP/3 test failed');
  } finally {
    http3State.loading.set(false);
  }
}
