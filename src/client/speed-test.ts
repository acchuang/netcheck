export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
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

export const SpeedTest = {
  results: {
    download: null,
    upload: null,
    latency: null,
    jitter: null,
    colo: null,
  } as SpeedTestResults,

  async run(onProgress?: ProgressCallback): Promise<SpeedTestResults> {
    this.results = { download: null, upload: null, latency: null, jitter: null, colo: null };
    const cb: ProgressCallback = onProgress || (() => {});

    // Phase 1: Latency + jitter (10 pings)
    cb("latency", 0, this.results);
    const pings: number[] = [];
    for (let i = 0; i < 10; i++) {
      try {
        const start = performance.now();
        const res = await fetch(`/api/speedtest/ping?_=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        pings.push(performance.now() - start);
        if (i === 0) {
          this.results.colo = res.headers.get("x-colo") || null;
        }
      } catch {
        /* skip */
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

    // Phase 2: Download — progressive sizes with streaming for live updates
    cb("download", 0, this.results);
    const dlSizes = [100000, 500000, 1000000, 5000000, 10000000, 25000000];
    const dlStart = performance.now();
    let dlTotalBytes = 0;

    for (let i = 0; i < dlSizes.length; i++) {
      try {
        const url = `/api/speedtest/down?bytes=${dlSizes[i]}&_=${Date.now()}`;
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

    const dlElapsed = (performance.now() - dlStart) / 1000;
    if (dlElapsed === 0 || dlTotalBytes === 0) this.results.download = null;
    cb("download", 100, this.results);

    // Phase 3: Upload — progressive sizes
    cb("upload", 0, this.results);
    const ulSizes = [100000, 500000, 1000000, 2000000, 5000000];
    const ulStart = performance.now();
    let ulTotalBytes = 0;

    for (let i = 0; i < ulSizes.length; i++) {
      const data = new Uint8Array(ulSizes[i]);
      for (let j = 0; j < ulSizes[i]; j += 4096)
        data[j] = (Math.random() * 256) | 0;

      try {
        await fetch("/api/speedtest/up", {
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

    const ulElapsed = (performance.now() - ulStart) / 1000;
    if (ulElapsed === 0 || ulTotalBytes === 0) this.results.upload = null;
    cb("upload", 100, this.results);

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
};
