export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  /**
   * % of idle latency probes that got no answer. Deliberately NOT called packet
   * loss: TCP retransmits lost packets, so real loss shows up as latency and a
   * probe still succeeds. 10 samples also means the only expressible values are
   * 0, 10, 20… A non-zero value here means requests failed outright — timeout,
   * reset, or the target refusing us.
   */
  failedProbes: number | null;

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

type ProgressCallback = (
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
  parseMeta?: (res: Response) => ServerMeta;
  // some servers (speed.cloudflare.com) don't expose colo/geo on the ping response —
  // they need a separate metadata request instead
  fetchMeta?: () => Promise<ServerMeta>;
  // ponytail: cf-speed uses text/plain Blob to avoid CORS preflight (OPTIONS 400s)
  makeUploadBody: (size: number) => BodyInit;
}

async function resolveMeta(server: SpeedServer, res: Response): Promise<ServerMeta> {
  if (server.fetchMeta) return server.fetchMeta();
  return server.parseMeta?.(res) ?? { colo: null, lat: null, lon: null };
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

let ooklaTarget = { base: "", lat: null, lon: null } as { base: string; lat: number | null; lon: number | null };
let ooklaTargetSetAt = 0;

const OOKLA_TARGET_TTL_MS = 20 * 60 * 1000;

// Ookla serves fixed random{N}x{N}.jpg files; map the requested byte count to
// the smallest file that covers it (the 4000 file covers the 25MB step).
function ooklaFileSize(bytes: number): number {
  if (bytes <= 100_000) return 500;
  if (bytes <= 500_000) return 1000;
  if (bytes <= 1_000_000) return 2000;
  if (bytes <= 5_000_000) return 3000;
  if (bytes <= 10_000_000) return 3500;
  return 4000;
}

const ooklaServer: SpeedServer = {
  id: "ookla",
  name: "Ookla Speedtest",
  locatable: true,
  init: async () => {
    if (ooklaTarget.base && Date.now() - ooklaTargetSetAt < OOKLA_TARGET_TTL_MS) return true;
    try {
      const res = await fetch("/api/speedtest/ookla-targets", { signal: AbortSignal.timeout(5000) });
      const data = (await res.json()) as { targets?: { url?: string; lat?: number | null; lon?: number | null }[] };
      for (const t of data.targets ?? []) {
        if (!t.url) continue;
        try {
          // Browser fetch fails on missing CORS headers, so a 200 here also
          // proves the host allows us; try the next target otherwise.
          const probe = await fetch(t.url.replace("/speedtest/upload.php", "/speedtest/random500x500.jpg"), {
            cache: "no-store",
            signal: AbortSignal.timeout(3000),
          });
          if (probe.ok) {
            ooklaTarget = {
              base: t.url.replace("/speedtest/upload.php", ""),
              lat: t.lat ?? null,
              lon: t.lon ?? null,
            };
            ooklaTargetSetAt = Date.now();
            return true;
          }
        } catch {
          // try next target
        }
      }
      return false;
    } catch {
      return false;
    }
  },
  pingUrl: () => `${ooklaTarget.base}/speedtest/random500x500.jpg?_=${Date.now()}`,
  downUrl: (bytes) => {
    const s = ooklaFileSize(bytes);
    return `${ooklaTarget.base}/speedtest/random${s}x${s}.jpg?_=${Date.now()}`;
  },
  upUrl: () => `${ooklaTarget.base}/speedtest/upload.php`,
  fetchMeta: () => Promise.resolve({ colo: null, lat: ooklaTarget.lat, lon: ooklaTarget.lon }),
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
  ooklaServer,
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

async function pingOnce(server: SpeedServer, signal?: AbortSignal): Promise<number | null> {
  try {
    const start = performance.now();
    await fetch(server.pingUrl(), { cache: "no-store", signal: signal ?? AbortSignal.timeout(3000) });
    return performance.now() - start;
  } catch {
    return null;
  }
}

// A loaded ping that never returns is the strongest bufferbloat signal there
// is, so it must not be the one sample we throw away. Without a deadline the
// pinger inherits only the run's abort signal, waits out the browser's own
// multi-second timeout, and records nothing — leaving the median built from
// exactly the pings that were fast enough to come back. That reports a
// congested link as a clean one.
const LOADED_PING_TIMEOUT_MS = 3000;

// Bufferbloat: ping in the background while download/upload saturate the link,
// so latency-under-load can be compared against the idle baseline.
function startLoadedPinger(server: SpeedServer, sink: number[], signal?: AbortSignal): () => void {
  let stopped = false;
  (async () => {
    while (!stopped && !signal?.aborted) {
      const started = performance.now();
      const ms = await pingOnce(server, combineSignal(LOADED_PING_TIMEOUT_MS, signal));
      const waited = performance.now() - started;
      if (ms !== null) sink.push(ms);
      // Failed at the deadline: a floor, not a measurement — the real latency
      // is at least this. A fast failure is a reset or a CORS refusal, which
      // says nothing about queueing, so that one is still dropped.
      else if (!signal?.aborted && waited >= LOADED_PING_TIMEOUT_MS - 50) sink.push(LOADED_PING_TIMEOUT_MS);
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
  return () => { stopped = true; };
}

/**
 * Bufferbloat is directional — a link can queue badly upstream and be clean
 * downstream — and the two phases run at different times, so pooling their
 * pings into one median lets the calmer phase dilute the worse one. Report the
 * worse direction, which is the one the user actually feels on a video call.
 */
export function worseLoadedLatency(download: number | null, upload: number | null): number | null {
  if (download === null) return upload;
  if (upload === null) return download;
  return Math.max(download, upload);
}

/**
 * The first step big enough to measure. Everything below this is warm-up: TCP
 * slow start, TLS, and the connection pool ramping mean a 100 KB request is
 * mostly overhead, and averaging it in drags a fast link's number down by more
 * than the small steps contribute in confidence.
 */
export const MEASURE_FROM_BYTES = 5_000_000;

/**
 * One connection cannot fill a fast link: a single TCP stream is bounded by
 * window size over RTT, so a 500 Mbps line across an ocean measures like a
 * 50 Mbps one. Real clients open several. Only the measured steps get the
 * parallelism — running the warm-up steps four-wide would just multiply the
 * slow-start overhead we are already excluding.
 */
export const MEASURED_STREAMS = 4;

export function streamsFor(bytes: number): number {
  return bytes >= MEASURE_FROM_BYTES ? MEASURED_STREAMS : 1;
}

export function mbps(bytes: number, seconds: number): number | null {
  if (bytes <= 0 || seconds <= 0) return null;
  return Math.round(((bytes * 8) / (seconds * 1e6)) * 100) / 100;
}

/** Streams one download to completion, reporting bytes as they arrive. */
async function downloadOnce(
  server: SpeedServer, bytes: number, signal: AbortSignal, onBytes: (n: number) => void
): Promise<void> {
  const res = await fetch(server.downUrl(bytes), { cache: "no-store", signal });
  if (!res.body) {
    onBytes((await res.blob()).size);
    return;
  }
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onBytes(value.byteLength);
  }
}

/**
 * Mean absolute difference between consecutive samples, in the order they
 * arrived. Order is the whole point: summing |Δ| over a *sorted* array
 * telescopes to max − min, so a steady link with one spike and a link that
 * oscillates every ping would report identical jitter.
 */
export function jitterOf(samplesInArrivalOrder: number[]): number {
  if (samplesInArrivalOrder.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < samplesInArrivalOrder.length; i++) {
    sum += Math.abs(samplesInArrivalOrder[i] - samplesInArrivalOrder[i - 1]);
  }
  return Math.round((sum / (samplesInArrivalOrder.length - 1)) * 10) / 10;
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

export function combineSignal(timeoutMs: number, abortSignal?: AbortSignal): AbortSignal {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Timeout", "TimeoutError")), timeoutMs);
  if (abortSignal) {
    if (abortSignal.aborted) {
      clearTimeout(timer);
      ctrl.abort(abortSignal.reason);
    } else {
      abortSignal.addEventListener("abort", () => {
        clearTimeout(timer);
        ctrl.abort(abortSignal.reason);
      }, { once: true });
    }
  }
  return ctrl.signal;
}

export const SpeedTest = {
  results: {
    download: null,
    upload: null,
    latency: null,
    jitter: null,
    failedProbes: null,
    loadedLatency: null,
    bufferbloatIncrease: null,
    colo: null,
    userLat: null,
    userLon: null,
  } as SpeedTestResults,

  abortController: null as AbortController | null,

  abort(): void {
    if (this.abortController) {
      this.abortController.abort(new DOMException("User aborted test", "AbortError"));
      this.abortController = null;
    }
  },

  async run(onProgress?: ProgressCallback, serverId = "cf-speed"): Promise<SpeedTestResults> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.results = {
      download: null, upload: null, latency: null, jitter: null, failedProbes: null, colo: null, userLat: null, userLon: null,
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
    const downloadPings: number[] = [];
    const uploadPings: number[] = [];

    // Latency
    cb("latency", 0, this.results);
    const pings: number[] = [];
    const PING_COUNT = 10;
    let lostPings = 0;
    for (let i = 0; i < PING_COUNT; i++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const start = performance.now();
        const res = await fetch(server.pingUrl(), {
          cache: "no-store",
          signal: combineSignal(4000, signal),
        });
        pings.push(performance.now() - start);
        if (i === 0) {
          const meta = await resolveMeta(server, res);
          this.results.colo = meta.colo;
          this.results.userLat = meta.lat;
          this.results.userLon = meta.lon;
        }
      } catch (err) {
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        lostPings++;
      }
      cb("latency", Math.round(((i + 1) / PING_COUNT) * 100), this.results);
    }
    this.results.failedProbes = Math.round((lostPings / PING_COUNT) * 100);

    if (pings.length > 0) {
      // Jitter first, while `pings` is still in arrival order — median() sorts a
      // copy, but this used to sort `pings` in place and then walk the sorted
      // array for jitter, which silently reported range / (n − 1) instead.
      this.results.jitter = jitterOf(pings);
      this.results.latency = Math.round(median(pings)! * 10) / 10;
    }
    cb("latency", 100, this.results);

    // Download
    cb("download", 0, this.results);
    const dlSizes = [100000, 500000, 1000000, 5000000, 10000000, 25000000];
    const dlStart = performance.now();
    // Two clocks. `measureStart` opens at the first step big enough to trust
    // and is what the reported number comes from; the warm-up totals are kept
    // only so a link too slow to finish a single measured step still reports
    // something instead of a dash.
    let measureStart: number | null = null;
    let measuredBytes = 0;
    let warmupBytes = 0;
    let step = 0;
    const stopDownloadPing = startLoadedPinger(server, downloadPings, signal);

    const addDownloadBytes = (n: number): void => {
      if (measureStart === null) warmupBytes += n;
      else measuredBytes += n;
      const elapsed = ((performance.now() - (measureStart ?? dlStart))) / 1000;
      const speed = mbps(measureStart === null ? warmupBytes : measuredBytes, elapsed);
      if (speed !== null) this.results.download = speed;
      cb("download", Math.round(((step + 0.5) / dlSizes.length) * 100), this.results);
    };

    for (step = 0; step < dlSizes.length; step++) {
      if (signal.aborted) {
        stopDownloadPing();
        throw new DOMException("Aborted", "AbortError");
      }
      const size = dlSizes[step];
      const streams = streamsFor(size);
      if (streams > 1 && measureStart === null) measureStart = performance.now();

      try {
        // One deadline shared by the whole step: a straggler stream must not
        // get its own fresh 12s after the others have finished.
        const stepSignal = combineSignal(12000, signal);
        await Promise.all(
          Array.from({ length: streams }, () => downloadOnce(server, size, stepSignal, addDownloadBytes))
        );
        cb("download", Math.round(((step + 1) / dlSizes.length) * 100), this.results);
        if ((performance.now() - dlStart) / 1000 > 8) break;
      } catch (err) {
        if (signal.aborted) {
          stopDownloadPing();
          throw new DOMException("Aborted", "AbortError");
        }
        // A step that times out still delivered bytes on the way, and those
        // are already counted — stop climbing the sizes, keep the measurement.
        break;
      }
    }

    stopDownloadPing();
    if (measureStart !== null && measuredBytes > 0) {
      this.results.download = mbps(measuredBytes, (performance.now() - measureStart) / 1000);
    } else if (warmupBytes === 0) {
      this.results.download = null;
    }
    cb("download", 100, this.results);

    // Upload
    cb("upload", 0, this.results);
    const ulSizes = [100000, 500000, 1000000, 2000000, 5000000];
    const ulStart = performance.now();
    let ulTotalBytes = 0;
    const stopUploadPing = startLoadedPinger(server, uploadPings, signal);

    // Same two-clock, multi-stream shape as the download, for the same reasons.
    let ulMeasureStart: number | null = null;
    let ulMeasuredBytes = 0;

    for (let i = 0; i < ulSizes.length; i++) {
      if (signal.aborted) {
        stopUploadPing();
        throw new DOMException("Aborted", "AbortError");
      }
      const size = ulSizes[i];
      const streams = streamsFor(size);
      if (streams > 1 && ulMeasureStart === null) ulMeasureStart = performance.now();

      try {
        const stepSignal = combineSignal(12000, signal);
        await Promise.all(Array.from({ length: streams }, () =>
          fetch(server.upUrl(), {
            method: "POST",
            // A fresh body per stream: one BodyInit cannot be sent twice.
            body: server.makeUploadBody(size),
            cache: "no-store",
            signal: stepSignal,
          })
        ));
        ulTotalBytes += size * streams;
        if (ulMeasureStart !== null) ulMeasuredBytes += size * streams;
        const measuring = ulMeasureStart !== null;
        const speed = mbps(
          measuring ? ulMeasuredBytes : ulTotalBytes,
          (performance.now() - (ulMeasureStart ?? ulStart)) / 1000
        );
        if (speed !== null) this.results.upload = speed;
        cb("upload", Math.round(((i + 1) / ulSizes.length) * 100), this.results);
        if ((performance.now() - ulStart) / 1000 > 8) break;
      } catch (err) {
        if (signal.aborted) {
          stopUploadPing();
          throw new DOMException("Aborted", "AbortError");
        }
        // Unlike the download, a failed upload step contributes nothing: the
        // bytes may never have left, so they are not counted at all.
        break;
      }
    }

    stopUploadPing();
    if (ulTotalBytes === 0) this.results.upload = null;
    cb("upload", 100, this.results);

    this.results.loadedLatency = worseLoadedLatency(median(downloadPings), median(uploadPings));
    if (this.results.loadedLatency !== null && this.results.latency !== null) {
      this.results.bufferbloatIncrease = Math.max(0, Math.round(this.results.loadedLatency - this.results.latency));
    }

    this.abortController = null;
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
