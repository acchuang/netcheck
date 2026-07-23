export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  packetLoss: number | null; // % of idle pings that failed

  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  loadedLatency: number | null;
  bufferbloatIncrease: number | null;
}

export interface SpeedGrade {
  grade: string;
  labelKey: string; // i18n key — callers render with t(labelKey)
}

export type SpeedTestPhase = "latency" | "download" | "upload";

export type ProgressCallback = (
  phase: SpeedTestPhase,
  percent: number,
  results: SpeedTestResults
) => void;

interface ServerMeta {
  colo: string | null;
  lat: number | null;
  lon: number | null;
}

interface SpeedServer {
  id: string;
  // plain display name for third-party nodes; built-in servers use i18n labels in app.ts
  name?: string;
  // false if this server type never reports a colo/location (default: true)
  locatable?: boolean;
  // async URL discovery; returns false if the node is unavailable
  init?: () => Promise<boolean>;
  pingUrl: () => string;
  downUrl: (bytes: number) => string;
  upUrl: () => string;
  // read colo + geo from the first ping response
  parseMeta: (res: Response) => ServerMeta;
  // some servers (speed.cloudflare.com) don't expose colo/geo on the ping response —
  // they need a separate metadata request instead
  fetchMeta?: () => Promise<ServerMeta>;
  // ponytail: cf-speed uses text/plain Blob to avoid CORS preflight (OPTIONS 400s)
  makeUploadBody: (size: number) => BodyInit;
}

async function resolveMeta(server: SpeedServer, res: Response): Promise<ServerMeta> {
  if (server.fetchMeta) return server.fetchMeta();
  return server.parseMeta(res);
}

let customBaseUrl = "";

export function setCustomServerUrl(url: string): void {
  customBaseUrl = url.trim().replace(/\/+$/, "");
}

function hasCustomServerUrl(): boolean {
  return customBaseUrl.length > 0;
}

function randomBody(size: number): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(size);
  for (let j = 0; j < size; j += 4096) d[j] = (Math.random() * 256) | 0;
  return d;
}

// ponytail: text/plain Blob => simple request, no CORS preflight (speed.cloudflare.com OPTIONS 400s)
function randomBlobBody(size: number): Blob {
  return new Blob([randomBody(size)], { type: "text/plain" });
}

// Netflix OCA (fast.com) node. URL discovery goes through our worker because
// api.fast.com sends no CORS headers; the speed traffic itself is browser -> OCA
// direct, so measurements are unaffected. Target URLs embed an expiry (~hours);
// re-running after that fails cleanly and a reload re-discovers.
let fastTarget = "";
let fastTargetSetAt = 0;
// ponytail: conservative fixed TTL well under the URL's real (~hours) expiry, since we
// don't parse the expiry out of the target URL itself; re-init if a real expiry check is needed
const FAST_TARGET_TTL_MS = 20 * 60 * 1000;

const fastServer: SpeedServer = {
  id: "fast",
  name: "Netflix (fast.com)",
  locatable: false,
  init: async () => {
    if (fastTarget && Date.now() - fastTargetSetAt < FAST_TARGET_TTL_MS) return true;
    try {
      const res = await fetch("/api/speedtest/fast-targets", { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { targets?: { url?: string }[] };
      fastTarget = data.targets?.[0]?.url || "";
      fastTargetSetAt = Date.now();
      return fastTarget !== "";
    } catch {
      return false;
    }
  },
  pingUrl: () => fastTarget.replace("/speedtest?", "/speedtest/range/0-0?"),
  downUrl: (bytes) => fastTarget.replace("/speedtest?", `/speedtest/range/0-${bytes}?`),
  upUrl: () => fastTarget.replace("/speedtest?", "/speedtest/range/0-0?"),
  parseMeta: () => ({ colo: null, lat: null, lon: null }),
  makeUploadBody: randomBlobBody,
};

export const SERVERS: SpeedServer[] = [
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
    makeUploadBody: randomBody,
  },
  {
    id: "cf-speed",
    pingUrl: () => `https://speed.cloudflare.com/__down?bytes=0&_=${Date.now()}`,
    downUrl: (bytes) => `https://speed.cloudflare.com/__down?bytes=${bytes}&_=${Date.now()}`,
    upUrl: () => "https://speed.cloudflare.com/__up",
    parseMeta: () => ({ colo: null, lat: null, lon: null }),
    fetchMeta: async () => {
      try {
        const res = await fetch("https://speed.cloudflare.com/meta", {
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        // colo.iata is the serving edge location; top-level latitude/longitude is the client's geo
        const data = (await res.json()) as { latitude?: string; longitude?: string; colo?: { iata?: string } };
        return {
          colo: data.colo?.iata ?? null,
          lat: data.latitude != null ? parseFloat(data.latitude) : null,
          lon: data.longitude != null ? parseFloat(data.longitude) : null,
        };
      } catch {
        return { colo: null, lat: null, lon: null };
      }
    },
    makeUploadBody: randomBlobBody,
  },
  fastServer,
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
    makeUploadBody: randomBlobBody,
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

export function getServer(id: string): SpeedServer {
  return SERVERS.find((s) => s.id === id) || SERVERS[0];
}

export interface ServerProbeResult {
  id: string;
  reachable: boolean;
  latency: number | null;
  colo: string | null;
  lat: number | null;
  lon: number | null;
}

async function probeServer(id: string): Promise<ServerProbeResult> {
  if (id === "custom" && !hasCustomServerUrl()) {
    return { id, reachable: false, latency: null, colo: null, lat: null, lon: null };
  }
  const server = getServer(id);
  if (server.init && !(await server.init())) {
    return { id, reachable: false, latency: null, colo: null, lat: null, lon: null };
  }
  try {
    const start = performance.now();
    const res = await fetch(server.pingUrl(), { cache: "no-store", signal: AbortSignal.timeout(3000) });
    const ms = performance.now() - start;
    const meta = await resolveMeta(server, res);
    return { id, reachable: true, latency: Math.round(ms), colo: meta.colo, lat: meta.lat, lon: meta.lon };
  } catch {
    return { id, reachable: false, latency: null, colo: null, lat: null, lon: null };
  }
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

  async run(onProgress?: ProgressCallback, serverId = "cf-speed"): Promise<SpeedTestResults> {
    this.results = {
      download: null, upload: null, latency: null, jitter: null, packetLoss: null, colo: null, userLat: null, userLon: null,
      loadedLatency: null, bufferbloatIncrease: null,
    };
    if (serverId === "custom" && !hasCustomServerUrl()) {
      throw new Error("No custom server URL set");
    }
    const server = getServer(serverId);
    if (server.init && !(await server.init())) {
      throw new Error("Server unavailable");
    }
    const cb: ProgressCallback = onProgress || (() => {});
    const loadedPings: number[] = [];

    // Latency
    cb("latency", 0, this.results);
    const pings: number[] = [];
    const PING_COUNT = 10;
    let lostPings = 0;
    for (let i = 0; i < PING_COUNT; i++) {
      try {
        const start = performance.now();
        const res = await fetch(server.pingUrl(), {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        pings.push(performance.now() - start);
        if (i === 0) {
          const meta = await resolveMeta(server, res);
          this.results.colo = meta.colo;
          this.results.userLat = meta.lat;
          this.results.userLon = meta.lon;
        }
      } catch {
        lostPings++;
      }
      cb("latency", Math.round(((i + 1) / PING_COUNT) * 100), this.results);
    }
    this.results.packetLoss = Math.round((lostPings / PING_COUNT) * 100);

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
    if (downloadMbps === null) return { grade: "—", labelKey: "speed.grade.unknown" };
    if (downloadMbps >= 500) return { grade: "A+", labelKey: "speed.grade.exceptional" };
    if (downloadMbps >= 200) return { grade: "A", labelKey: "speed.grade.excellent" };
    if (downloadMbps >= 100) return { grade: "B+", labelKey: "speed.grade.veryGood" };
    if (downloadMbps >= 50) return { grade: "B", labelKey: "speed.grade.good" };
    if (downloadMbps >= 25) return { grade: "C", labelKey: "speed.grade.average" };
    if (downloadMbps >= 10) return { grade: "D", labelKey: "speed.grade.belowAvg" };
    return { grade: "F", labelKey: "speed.grade.slow" };
  },

  // Waveform-style bufferbloat grading: ms of latency increase under a saturated link.
  getBufferbloatGrade(increaseMs: number | null): SpeedGrade {
    if (increaseMs === null) return { grade: "—", labelKey: "speed.bb.unknown" };
    if (increaseMs < 5) return { grade: "A+", labelKey: "speed.bb.none" };
    if (increaseMs < 30) return { grade: "A", labelKey: "speed.bb.minimal" };
    if (increaseMs < 60) return { grade: "B", labelKey: "speed.bb.mild" };
    if (increaseMs < 200) return { grade: "C", labelKey: "speed.bb.moderate" };
    if (increaseMs < 400) return { grade: "D", labelKey: "speed.bb.significant" };
    return { grade: "F", labelKey: "speed.bb.severe" };
  },
};
