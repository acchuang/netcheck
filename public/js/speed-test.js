const SpeedTest = {
  results: { download: null, upload: null, latency: null, jitter: null },
  onProgress: null,

  async run(onProgress) {
    this.onProgress = onProgress || (() => {});
    this.results = { download: null, upload: null, latency: null, jitter: null };

    // Latency + jitter
    this.onProgress("latency", 0);
    const latencyResults = await this.measureLatency();
    this.results.latency = latencyResults.median;
    this.results.jitter = latencyResults.jitter;
    this.onProgress("latency", 100, this.results);

    // Download
    this.onProgress("download", 0);
    this.results.download = await this.measureDownload();
    this.onProgress("download", 100, this.results);

    // Upload
    this.onProgress("upload", 0);
    this.results.upload = await this.measureUpload();
    this.onProgress("upload", 100, this.results);

    return this.results;
  },

  async measureLatency() {
    const pings = [];
    const rounds = 20;

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      try {
        await fetch(`/api/ip?_=${Date.now()}`, { cache: "no-store" });
        const elapsed = performance.now() - start;
        pings.push(elapsed);
      } catch {
        // skip failed pings
      }
      this.onProgress("latency", Math.round(((i + 1) / rounds) * 100));
    }

    if (pings.length === 0) return { median: null, jitter: null };

    pings.sort((a, b) => a - b);
    const median = pings[Math.floor(pings.length / 2)];

    // Jitter = average difference between consecutive pings
    let jitterSum = 0;
    for (let i = 1; i < pings.length; i++) {
      jitterSum += Math.abs(pings[i] - pings[i - 1]);
    }
    const jitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;

    return { median: Math.round(median * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
  },

  async measureDownload() {
    // Use Cloudflare's speed test endpoint — download increasing chunk sizes
    const sizes = [
      { bytes: 100000, label: "100KB" },
      { bytes: 500000, label: "500KB" },
      { bytes: 1000000, label: "1MB" },
      { bytes: 5000000, label: "5MB" },
      { bytes: 10000000, label: "10MB" },
      { bytes: 25000000, label: "25MB" },
    ];

    const speeds = [];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      try {
        const start = performance.now();
        const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${size.bytes}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const blob = await res.blob();
        const elapsed = (performance.now() - start) / 1000; // seconds

        const mbps = (blob.size * 8) / (elapsed * 1000000); // Mbps
        speeds.push(mbps);
        totalBytes += blob.size;
        totalTime += elapsed;

        this.onProgress("download", Math.round(((i + 1) / sizes.length) * 100));

        // If this chunk took too long, skip larger ones
        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    if (speeds.length === 0) return null;

    // Use weighted average favoring larger samples
    const weightedSpeed = (totalBytes * 8) / (totalTime * 1000000);
    return Math.round(weightedSpeed * 100) / 100;
  },

  async measureUpload() {
    const sizes = [100000, 500000, 1000000, 2000000, 5000000];
    const speeds = [];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      const data = new Uint8Array(size);
      // Fill with random-ish data to prevent compression
      for (let j = 0; j < size; j += 4096) {
        data[j] = Math.random() * 256;
      }

      try {
        const start = performance.now();
        await fetch("https://speed.cloudflare.com/__up", {
          method: "POST",
          body: data,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = (performance.now() - start) / 1000;

        const mbps = (size * 8) / (elapsed * 1000000);
        speeds.push(mbps);
        totalBytes += size;
        totalTime += elapsed;

        this.onProgress("upload", Math.round(((i + 1) / sizes.length) * 100));

        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    if (speeds.length === 0) return null;

    const weightedSpeed = (totalBytes * 8) / (totalTime * 1000000);
    return Math.round(weightedSpeed * 100) / 100;
  },

  formatSpeed(mbps) {
    if (mbps === null) return "—";
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${(mbps * 1000).toFixed(0)} Kbps`;
  },

  getGrade(downloadMbps) {
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
