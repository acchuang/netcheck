export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  downloadLoadedLatency: number | null;
  uploadLoadedLatency: number | null;
  bufferbloat: number | null;
}

export interface SpeedGrade {
  grade: string;
  label: string;
  factors: {
    download: "pass" | "warn" | "fail";
    upload: "pass" | "warn" | "fail";
    latency: "pass" | "warn" | "fail";
    jitter: "pass" | "warn" | "fail";
    bufferbloat: "pass" | "warn" | "fail";
  };
}

export type SpeedTestPhase = "latency" | "download" | "upload";

export type ProgressCallback = (
  phase: SpeedTestPhase,
  percent: number,
  results: SpeedTestResults
) => void;

const PING_COUNT = 20;
const TRIM_COUNT = 2;

const DL_CONNECTIONS = 3;
const INITIAL_CHUNK = 524288;
const MIN_CHUNK = 262144;
const MAX_CHUNK = 268435456;
const DL_MAX_DURATION = 10000;

function nextChunkSize(currentSize: number, throughputMbps: number): number {
  if (throughputMbps > 100) return Math.min(currentSize * 2, MAX_CHUNK);
  if (throughputMbps > 30) return currentSize;
  if (throughputMbps < 10) return Math.max(currentSize / 2, MIN_CHUNK);
  return currentSize;
}

const RANDOM_BLOCK = new Uint8Array(65536);
crypto.getRandomValues(RANDOM_BLOCK);

function fillIncompressible(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += RANDOM_BLOCK.length) {
    const chunkSize = Math.min(RANDOM_BLOCK.length, size - offset);
    data.set(RANDOM_BLOCK.subarray(0, chunkSize), offset);
  }
  return data;
}

class EWMA {
  private value: number | null = null;
  constructor(private alpha: number = 0.3) {}
  update(sample: number): number {
    if (this.value === null) { this.value = sample; }
    else { this.value = this.alpha * sample + (1 - this.alpha) * this.value; }
    return this.value;
  }
  get(): number | null { return this.value; }
  reset(): void { this.value = null; }
}

async function warmUp(): Promise<void> {
  try {
    await fetch(`/api/speedtest/down?bytes=102400&_=${Date.now()}`, { cache: "no-store" });
  } catch { /* ignore */ }
}

async function downloadParallel(
  chunkSize: number,
  onBytesDelta: (delta: number) => void
): Promise<number> {
  const promises = Array.from({ length: DL_CONNECTIONS }, async () => {
    let connBytes = 0;
    const url = `/api/speedtest/down?bytes=${chunkSize}&_=${Date.now()}_${Math.random()}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });

    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        connBytes += value.byteLength;
        onBytesDelta(value.byteLength);
      }
    } else {
      const blob = await res.blob();
      connBytes = blob.size;
      onBytesDelta(blob.size);
    }
    return connBytes;
  });

  const results = await Promise.all(promises);
  return results.reduce((a, b) => a + b, 0);
}

async function measureLoadedLatency(signal: AbortSignal): Promise<number[]> {
  const rtts: number[] = [];
  while (!signal.aborted) {
    try {
      const t0 = performance.now();
      await fetch(`/api/speedtest/ping?_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      rtts.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      if (signal.aborted) break;
    }
  }
  return rtts;
}

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
    downloadLoadedLatency: null,
    uploadLoadedLatency: null,
    bufferbloat: null,
  } as SpeedTestResults,

  async run(onProgress?: ProgressCallback): Promise<SpeedTestResults> {
    this.results = {
      download: null, upload: null, latency: null, jitter: null,
      colo: null, userLat: null, userLon: null,
      downloadLoadedLatency: null, uploadLoadedLatency: null, bufferbloat: null,
    };
    const cb: ProgressCallback = onProgress || (() => {});

    // Phase 1: Latency + jitter (20 pings, trim best/worst 2)
    cb("latency", 0, this.results);
    const pings: number[] = [];
    for (let i = 0; i < PING_COUNT; i++) {
      try {
        const start = performance.now();
        const res = await fetch(`/api/speedtest/ping?_=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        pings.push(performance.now() - start);
        if (i === 0) {
          this.results.colo = res.headers.get("x-colo") || null;
          const lat = res.headers.get("x-lat");
          const lon = res.headers.get("x-lon");
          if (lat && lon) {
            this.results.userLat = parseFloat(lat);
            this.results.userLon = parseFloat(lon);
          }
        }
      } catch {
        /* skip */
      }
      cb("latency", Math.round(((i + 1) / PING_COUNT) * 100), this.results);
    }

    if (pings.length > TRIM_COUNT * 2) {
      pings.sort((a, b) => a - b);
      const trimmed = pings.slice(TRIM_COUNT, pings.length - TRIM_COUNT);
      this.results.latency = Math.round(medianOf(trimmed) * 10) / 10;
      let jitterSum = 0;
      for (let i = 1; i < trimmed.length; i++) {
        jitterSum += Math.abs(trimmed[i] - trimmed[i - 1]);
      }
      this.results.jitter = trimmed.length > 1
        ? Math.round((jitterSum / (trimmed.length - 1)) * 10) / 10
        : 0;
    } else if (pings.length > 0) {
      pings.sort((a, b) => a - b);
      this.results.latency = Math.round(medianOf(pings) * 10) / 10;
      let jitterSum = 0;
      for (let i = 1; i < pings.length; i++) {
        jitterSum += Math.abs(pings[i] - pings[i - 1]);
      }
      this.results.jitter = pings.length > 1
        ? Math.round((jitterSum / (pings.length - 1)) * 10) / 10
        : 0;
    }
    cb("latency", 100, this.results);

    // Warm-up
    await warmUp();

    // Start bufferbloat measurement in background
    const blController = new AbortController();
    const dlLoadedPingsPromise = measureLoadedLatency(blController.signal);

    // Phase 2: Download — adaptive sizing, multi-connection, EWMA
    cb("download", 0, this.results);
    let chunkSize = INITIAL_CHUNK;
    let dlTotalBytes = 0;
    const dlStart = performance.now();
    const dlEWMA = new EWMA(0.3);
    let dlIterations = 0;

    while (performance.now() - dlStart < DL_MAX_DURATION && dlIterations < 12) {
      try {
        const chunkBytes = await downloadParallel(chunkSize, (delta) => {
          dlTotalBytes += delta;
          const elapsed = (performance.now() - dlStart) / 1000;
          const instantMbps = (dlTotalBytes * 8) / (elapsed * 1e6);
          const smoothed = dlEWMA.update(instantMbps);
          this.results.download = Math.round(smoothed * 100) / 100;
          cb("download", Math.min(95, Math.round((elapsed / DL_MAX_DURATION) * 100)), this.results);
        });
        const elapsed = (performance.now() - dlStart) / 1000;
        const throughput = (chunkBytes * 8) / (elapsed * 1e6);
        chunkSize = nextChunkSize(chunkSize, throughput);
        dlIterations++;
      } catch {
        break;
      }
    }

    const dlElapsed = (performance.now() - dlStart) / 1000;
    if (dlElapsed > 0 && dlTotalBytes > 0) {
      this.results.download = Math.round(((dlTotalBytes * 8) / (dlElapsed * 1e6)) * 100) / 100;
    } else {
      this.results.download = null;
    }
    cb("download", 100, this.results);

    // Measure download loaded latency
    const ulLoadedPingsPromise = measureLoadedLatency(blController.signal);

    // Phase 3: Upload — adaptive sizing, EWMA
    cb("upload", 0, this.results);
    let ulChunkSize = INITIAL_CHUNK;
    let ulTotalBytes = 0;
    const ulStart = performance.now();
    const ulEWMA = new EWMA(0.3);
    const ulSizes = [100000, 500000, 1000000, 2000000, 5000000, 10000000, 20000000];
    let ulIdx = 0;

    while (performance.now() - ulStart < DL_MAX_DURATION && ulIdx < ulSizes.length) {
      const raw = fillIncompressible(ulSizes[ulIdx]);
      const body = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      try {
        await fetch("/api/speedtest/up", {
          method: "POST",
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        ulTotalBytes += ulSizes[ulIdx];
        const elapsed = (performance.now() - ulStart) / 1000;
        const instantMbps = (ulTotalBytes * 8) / (elapsed * 1e6);
        const smoothed = ulEWMA.update(instantMbps);
        this.results.upload = Math.round(smoothed * 100) / 100;
        cb("upload", Math.min(95, Math.round(((ulIdx + 1) / ulSizes.length) * 100)), this.results);
        ulIdx++;
      } catch {
        break;
      }
    }

    const ulElapsed = (performance.now() - ulStart) / 1000;
    if (ulElapsed > 0 && ulTotalBytes > 0) {
      this.results.upload = Math.round(((ulTotalBytes * 8) / (ulElapsed * 1e6)) * 100) / 100;
    } else {
      this.results.upload = null;
    }
    cb("upload", 100, this.results);

    // Stop bufferbloat measurement
    blController.abort();
    const dlLoadedPings = await dlLoadedPingsPromise;
    const ulLoadedPings = await ulLoadedPingsPromise;

    if (dlLoadedPings.length > 0) {
      dlLoadedPings.sort((a, b) => a - b);
      this.results.downloadLoadedLatency = Math.round(medianOf(dlLoadedPings) * 10) / 10;
    }
    if (ulLoadedPings.length > 0) {
      ulLoadedPings.sort((a, b) => a - b);
      this.results.uploadLoadedLatency = Math.round(medianOf(ulLoadedPings) * 10) / 10;
    }

    const idleRtt = this.results.latency;
    const maxLoadedRtt = Math.max(
      this.results.downloadLoadedLatency ?? 0,
      this.results.uploadLoadedLatency ?? 0
    );
    this.results.bufferbloat = idleRtt !== null
      ? Math.round(Math.max(0, maxLoadedRtt - idleRtt) * 10) / 10
      : null;

    return this.results;
  },

  formatSpeed(mbps: number | null): string {
    if (mbps === null) return "—";
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  },

  getGrade(download: number | null, upload?: number | null, latency?: number | null, jitter?: number | null, bufferbloat?: number | null): SpeedGrade {
    const dl = download ?? 0;
    const ul = upload ?? 0;
    const lat = latency ?? (dl > 0 ? 999 : 0);
    const jit = jitter ?? (dl > 0 ? 999 : 0);
    const bb = bufferbloat ?? (dl > 0 ? 999 : 0);

    const factors: SpeedGrade["factors"] = {
      download: dl >= 100 ? "pass" : dl >= 25 ? "warn" : "fail",
      upload: ul >= 50 ? "pass" : ul >= 10 ? "warn" : "fail",
      latency: lat < 20 ? "pass" : lat < 50 ? "warn" : "fail",
      jitter: jit < 5 ? "pass" : jit < 15 ? "warn" : "fail",
      bufferbloat: bb < 20 ? "pass" : bb < 50 ? "warn" : "fail",
    };

    const passCount = Object.values(factors).filter((v) => v === "pass").length;
    const failCount = Object.values(factors).filter((v) => v === "fail").length;

    if (download === null) return { grade: "—", label: "Unknown", factors };
    if (failCount === 0 && passCount === 5) return { grade: "A+", label: "Exceptional", factors };
    if (failCount === 0 && passCount >= 4) return { grade: "A", label: "Excellent", factors };
    if (failCount === 0 && passCount >= 3) return { grade: "B+", label: "Very Good", factors };
    if (failCount <= 1 && passCount >= 3) return { grade: "B", label: "Good", factors };
    if (failCount <= 1) return { grade: "C+", label: "Average", factors };
    if (failCount <= 2) return { grade: "C", label: "Below Average", factors };
    if (failCount <= 3) return { grade: "D", label: "Poor", factors };
    return { grade: "F", label: "Very Poor", factors };
  },
};