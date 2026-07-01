export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  loadedLatency: number | null;
  bufferbloatIncrease: number | null;
}

export interface SpeedGrade {
  grade: string;
  label: string;
}

export type SpeedTestPhase = "latency" | "download" | "upload";

export type ProgressCallback = (
  phase: SpeedTestPhase,
  percent: number,
  results: SpeedTestResults
) => void;

interface SpeedServer {
  id: string;
  pingUrl: () => string;
  downUrl: (bytes: number) => string;
  upUrl: () => string;
  // read colo + geo from the first ping response
  parseMeta: (res: Response) => { colo: string | null; lat: number | null; lon: number | null };
  // ponytail: cf-speed uses text/plain Blob to avoid CORS preflight (OPTIONS 400s)
  makeUploadBody: (size: number) => BodyInit;
}

let customBaseUrl = "";

export function setCustomServerUrl(url: string): void {
  customBaseUrl = url.trim().replace(/\/+$/, "");
}

export function hasCustomServerUrl(): boolean {
  return customBaseUrl.length > 0;
}

const SERVERS: SpeedServer[] = [
  {
    id: "edge",
    pingUrl: () => `/api/speedtest/ping?_=${Date.now()}`,
    downUrl: (bytes) => `/api/speedtest/down?bytes=${bytes}&_=${Date.now()}`,
    upUrl: () => "/api/speedtest/up",
    parseMeta: (res) => ({
      colo: res.headers.get("x-colo"),
      lat: parseFloat(res.headers.get("x-lat") || "") || null,
      lon: parseFloat(res.headers.get("x-lon") || "") || null,
    }),
    makeUploadBody: (size) => {
      const d = new Uint8Array(size);
      for (let j = 0; j < size; j += 4096) d[j] = (Math.random() * 256) | 0;
      return d;
    },
  },
  {
    id: "cf-speed",
    pingUrl: () => `https://speed.cloudflare.com/__down?bytes=0&_=${Date.now()}`,
    downUrl: (bytes) => `https://speed.cloudflare.com/__down?bytes=${bytes}&_=${Date.now()}`,
    upUrl: () => "https://speed.cloudflare.com/__up",
    parseMeta: (res) => ({
      colo: res.headers.get("cf-meta-colo"),
      lat: parseFloat(res.headers.get("cf-meta-latitude") || "") || null,
      lon: parseFloat(res.headers.get("cf-meta-longitude") || "") || null,
    }),
    makeUploadBody: (size) => {
      const d = new Uint8Array(size);
      for (let j = 0; j < size; j += 4096) d[j] = (Math.random() * 256) | 0;
      // text/plain => simple request, no CORS preflight (speed.cloudflare.com OPTIONS 400s)
      return new Blob([d], { type: "text/plain" });
    },
  },
  {
    id: "custom",
    pingUrl: () => `${customBaseUrl}/api/speedtest/ping?_=${Date.now()}`,
    downUrl: (bytes) => `${customBaseUrl}/api/speedtest/down?bytes=${bytes}&_=${Date.now()}`,
    upUrl: () => `${customBaseUrl}/api/speedtest/up`,
    parseMeta: (res) => ({
      colo: res.headers.get("x-colo"),
      lat: parseFloat(res.headers.get("x-lat") || "") || null,
      lon: parseFloat(res.headers.get("x-lon") || "") || null,
    }),
    makeUploadBody: (size) => {
      const d = new Uint8Array(size);
      for (let j = 0; j < size; j += 4096) d[j] = (Math.random() * 256) | 0;
      // text/plain => simple request, no CORS preflight
      return new Blob([d], { type: "text/plain" });
    },
  },
];

async function pingOnce(server: SpeedServer): Promise<number | null> {
  try {
    const start = performance.now();
    await fetch(server.pingUrl(), { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return performance.now() - start;
  } catch {
    return null;
  }
}

// Bufferbloat: ping in the background while download/upload saturate the link,
// so latency-under-load can be compared against the idle baseline.
function startLoadedPinger(server: SpeedServer, sink: number[]): () => void {
  let stopped = false;
  (async () => {
    while (!stopped) {
      const ms = await pingOnce(server);
      if (ms !== null) sink.push(ms);
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  return () => { stopped = true; };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function getServer(id: string): SpeedServer {
  return SERVERS.find((s) => s.id === id) || SERVERS[0];
}

export function getServerIds(): string[] {
  return SERVERS.map((s) => s.id);
}

export interface ServerProbeResult {
  id: string;
  reachable: boolean;
  latency: number | null;
}

export async function probeServer(id: string): Promise<ServerProbeResult> {
  if (id === "custom" && !hasCustomServerUrl()) {
    return { id, reachable: false, latency: null };
  }
  const server = getServer(id);
  const ms = await pingOnce(server);
  return { id, reachable: ms !== null, latency: ms !== null ? Math.round(ms) : null };
}

export async function probeServers(ids?: string[]): Promise<ServerProbeResult[]> {
  const targets = ids || SERVERS.map((s) => s.id);
  return Promise.all(targets.map((id) => probeServer(id)));
}

export const SpeedTest = {
  results: {
    download: null,
    upload: null,
    latency: null,
    jitter: null,
    colo: null,
    userLat: null,
    userLon: null,
  } as SpeedTestResults,

  async run(onProgress?: ProgressCallback, serverId = "edge"): Promise<SpeedTestResults> {
    this.results = {
      download: null, upload: null, latency: null, jitter: null, colo: null, userLat: null, userLon: null,
      loadedLatency: null, bufferbloatIncrease: null,
    };
    if (serverId === "custom" && !hasCustomServerUrl()) {
      throw new Error("No custom server URL set");
    }
    const server = getServer(serverId);
    const cb: ProgressCallback = onProgress || (() => {});
    const loadedPings: number[] = [];

    // Latency
    cb("latency", 0, this.results);
    const pings: number[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        const start = performance.now();
        const res = await fetch(server.pingUrl(), {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        pings.push(performance.now() - start);
        if (i === 0) {
          const meta = server.parseMeta(res);
          this.results.colo = meta.colo;
          this.results.userLat = meta.lat;
          this.results.userLon = meta.lon;
        }
      } catch {
      }
      cb("latency", Math.round(((i + 1) / 10) * 100), this.results);
    }

    if (pings.length > 0) {
      pings.sort((a, b) => a - b);
      this.results.latency =
        Math.round(pings[Math.floor(pings.length / 2)] * 10) / 10;
      let jitterSum = 0;
      for (let i = 1; i < pings.length; i++)
        jitterSum += Math.abs(pings[i] - pings[i - 1]);
      this.results.jitter =
        pings.length > 1
          ? Math.round((jitterSum / (pings.length - 1)) * 10) / 10
          : 0;
    }
    cb("latency", 100, this.results);

    // Download
    cb("download", 0, this.results);
    const dlSizes = [100000, 500000, 1000000, 5000000, 10000000, 25000000];
    const dlStart = performance.now();
    let dlTotalBytes = 0;
    const stopDownloadPing = startLoadedPinger(server, loadedPings);

    for (let i = 0; i < dlSizes.length; i++) {
      try {
        const url = server.downUrl(dlSizes[i]);
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });

        if (res.body) {
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            dlTotalBytes += value.byteLength;
            const elapsed = (performance.now() - dlStart) / 1000;
            this.results.download =
              Math.round(((dlTotalBytes * 8) / (elapsed * 1e6)) * 100) / 100;
            cb(
              "download",
              Math.round(((i + 0.5) / dlSizes.length) * 100),
              this.results
            );
          }
        } else {
          const blob = await res.blob();
          dlTotalBytes += blob.size;
        }

        const elapsed = (performance.now() - dlStart) / 1000;
        this.results.download =
          Math.round(((dlTotalBytes * 8) / (elapsed * 1e6)) * 100) / 100;
        cb(
          "download",
          Math.round(((i + 1) / dlSizes.length) * 100),
          this.results
        );
        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    stopDownloadPing();
    const dlElapsed = (performance.now() - dlStart) / 1000;
    if (dlElapsed === 0 || dlTotalBytes === 0) this.results.download = null;
    cb("download", 100, this.results);

    // Upload
    cb("upload", 0, this.results);
    const ulSizes = [100000, 500000, 1000000, 2000000, 5000000];
    const ulStart = performance.now();
    let ulTotalBytes = 0;
    const stopUploadPing = startLoadedPinger(server, loadedPings);

    for (let i = 0; i < ulSizes.length; i++) {
      const data = server.makeUploadBody(ulSizes[i]);

      try {
        await fetch(server.upUrl(), {
          method: "POST",
          body: data,
          cache: "no-store",
          signal: AbortSignal.timeout(12000),
        });
        ulTotalBytes += ulSizes[i];
        const elapsed = (performance.now() - ulStart) / 1000;
        this.results.upload =
          Math.round(((ulTotalBytes * 8) / (elapsed * 1e6)) * 100) / 100;
        cb(
          "upload",
          Math.round(((i + 1) / ulSizes.length) * 100),
          this.results
        );
        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    stopUploadPing();
    const ulElapsed = (performance.now() - ulStart) / 1000;
    if (ulElapsed === 0 || ulTotalBytes === 0) this.results.upload = null;
    cb("upload", 100, this.results);

    this.results.loadedLatency = median(loadedPings);
    if (this.results.loadedLatency !== null && this.results.latency !== null) {
      this.results.bufferbloatIncrease = Math.max(0, Math.round(this.results.loadedLatency - this.results.latency));
    }

    return this.results;
  },

  formatSpeed(mbps: number | null): string {
    if (mbps === null) return "—";
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  },

  getGrade(downloadMbps: number | null): SpeedGrade {
    if (downloadMbps === null) return { grade: "—", label: "Unknown" };
    if (downloadMbps >= 500) return { grade: "A+", label: "Exceptional" };
    if (downloadMbps >= 200) return { grade: "A", label: "Excellent" };
    if (downloadMbps >= 100) return { grade: "B+", label: "Very Good" };
    if (downloadMbps >= 50) return { grade: "B", label: "Good" };
    if (downloadMbps >= 25) return { grade: "C", label: "Average" };
    if (downloadMbps >= 10) return { grade: "D", label: "Below Average" };
    return { grade: "F", label: "Slow" };
  },

  // Waveform-style bufferbloat grading: ms of latency increase under a saturated link.
  getBufferbloatGrade(increaseMs: number | null): SpeedGrade {
    if (increaseMs === null) return { grade: "—", label: "Unknown" };
    if (increaseMs < 5) return { grade: "A+", label: "None" };
    if (increaseMs < 30) return { grade: "A", label: "Minimal" };
    if (increaseMs < 60) return { grade: "B", label: "Mild" };
    if (increaseMs < 200) return { grade: "C", label: "Moderate" };
    if (increaseMs < 400) return { grade: "D", label: "Significant" };
    return { grade: "F", label: "Severe" };
  },
};
