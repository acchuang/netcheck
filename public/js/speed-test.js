const SpeedTest = {
  results: { download: null, upload: null, latency: null, jitter: null },
  onProgress: null,
  selectedServer: null,

  servers: [
    {
      id: "cf-edge",
      name: "Cloudflare",
      location: "Nearest Edge",
      ping: "https://speed.cloudflare.com/__down?bytes=0",
      down: "https://speed.cloudflare.com/__down",
      up: "https://speed.cloudflare.com/__up",
    },
    {
      id: "worker",
      name: "NetCheck Worker",
      location: "Cloudflare Edge",
      ping: "/api/speedtest/ping",
      down: "/api/speedtest/down",
      up: "/api/speedtest/up",
    },
    {
      id: "hetzner-de",
      name: "Hetzner",
      location: "Falkenstein, DE",
      ping: "https://speed.hetzner.de/1kB.bin",
      down: "https://speed.hetzner.de",
      up: null,
      downSizes: [
        { url: "https://speed.hetzner.de/100MB.bin", bytes: 104857600 },
        { url: "https://speed.hetzner.de/10GB.bin", bytes: 10737418240 },
      ],
    },
    {
      id: "ovh-fr",
      name: "OVH",
      location: "Gravelines, FR",
      ping: "https://proof.ovh.net/files/1Mb.dat",
      down: "https://proof.ovh.net/files",
      up: null,
      downSizes: [
        { url: "https://proof.ovh.net/files/1Mb.dat", bytes: 1048576 },
        { url: "https://proof.ovh.net/files/10Mb.dat", bytes: 10485760 },
        { url: "https://proof.ovh.net/files/100Mb.dat", bytes: 104857600 },
      ],
    },
    {
      id: "tele2-se",
      name: "Tele2",
      location: "Stockholm, SE",
      ping: "https://speedtest.tele2.net/1KB.zip",
      down: "https://speedtest.tele2.net",
      up: null,
      downSizes: [
        { url: "https://speedtest.tele2.net/1MB.zip", bytes: 1048576 },
        { url: "https://speedtest.tele2.net/10MB.zip", bytes: 10485760 },
        { url: "https://speedtest.tele2.net/100MB.zip", bytes: 104857600 },
      ],
    },
    {
      id: "scaleway-fr",
      name: "Scaleway",
      location: "Paris, FR",
      ping: "https://ping.online.net/1kb",
      down: "https://ping.online.net",
      up: null,
      downSizes: [
        { url: "https://ping.online.net/1000Mo.dat", bytes: 1048576000 },
        { url: "https://ping.online.net/100Mo.dat", bytes: 104857600 },
        { url: "https://ping.online.net/10Mo.dat", bytes: 10485760 },
      ],
    },
    {
      id: "fdc-la",
      name: "FDC Servers",
      location: "Los Angeles, US",
      ping: "https://lg.lax-us.fdcservers.net/1KB.test",
      down: "https://lg.lax-us.fdcservers.net",
      up: null,
      downSizes: [
        { url: "https://lg.lax-us.fdcservers.net/10MBtest.zip", bytes: 10485760 },
        { url: "https://lg.lax-us.fdcservers.net/100MBtest.zip", bytes: 104857600 },
      ],
    },
    {
      id: "fdc-ny",
      name: "FDC Servers",
      location: "New York, US",
      ping: "https://lg.nyc-us.fdcservers.net/1KB.test",
      down: "https://lg.nyc-us.fdcservers.net",
      up: null,
      downSizes: [
        { url: "https://lg.nyc-us.fdcservers.net/10MBtest.zip", bytes: 10485760 },
        { url: "https://lg.nyc-us.fdcservers.net/100MBtest.zip", bytes: 104857600 },
      ],
    },
    {
      id: "fdc-chi",
      name: "FDC Servers",
      location: "Chicago, US",
      ping: "https://lg.chi-us.fdcservers.net/1KB.test",
      down: "https://lg.chi-us.fdcservers.net",
      up: null,
      downSizes: [
        { url: "https://lg.chi-us.fdcservers.net/10MBtest.zip", bytes: 10485760 },
        { url: "https://lg.chi-us.fdcservers.net/100MBtest.zip", bytes: 104857600 },
      ],
    },
    {
      id: "linode-sg",
      name: "Akamai",
      location: "Singapore, SG",
      ping: "https://speedtest.singapore.linode.com/garbage?r=0&ckSize=0",
      down: "https://speedtest.singapore.linode.com/garbage",
      up: null,
      downSizes: [
        { url: "https://speedtest.singapore.linode.com/100MB-singapore.bin", bytes: 104857600 },
      ],
    },
    {
      id: "linode-jp",
      name: "Akamai",
      location: "Tokyo, JP",
      ping: "https://speedtest.tokyo2.linode.com/garbage?r=0&ckSize=0",
      down: "https://speedtest.tokyo2.linode.com/garbage",
      up: null,
      downSizes: [
        { url: "https://speedtest.tokyo2.linode.com/100MB-tokyo2.bin", bytes: 104857600 },
      ],
    },
    {
      id: "linode-uk",
      name: "Akamai",
      location: "London, UK",
      ping: "https://speedtest.london.linode.com/garbage?r=0&ckSize=0",
      down: "https://speedtest.london.linode.com/garbage",
      up: null,
      downSizes: [
        { url: "https://speedtest.london.linode.com/100MB-london.bin", bytes: 104857600 },
      ],
    },
  ],

  probeResults: [],

  async probeServers() {
    this.probeResults = [];

    const probes = this.servers.map(async (server) => {
      try {
        const start = performance.now();
        await fetch(server.ping, {
          mode: "cors",
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        const latency = Math.round(performance.now() - start);
        return { server, latency, reachable: true };
      } catch {
        return { server, latency: Infinity, reachable: false };
      }
    });

    const results = await Promise.all(probes);
    this.probeResults = results
      .filter((r) => r.reachable)
      .sort((a, b) => a.latency - b.latency);

    return this.probeResults.slice(0, 5);
  },

  selectServer(serverId) {
    const probe = this.probeResults.find((p) => p.server.id === serverId);
    this.selectedServer = probe ? probe.server : this.probeResults[0]?.server || this.servers[0];
  },

  async run(onProgress) {
    this.onProgress = onProgress || (() => {});
    this.results = { download: null, upload: null, latency: null, jitter: null };

    const server = this.selectedServer || this.servers[0];

    // Latency + jitter
    this.onProgress("latency", 0);
    const latencyResults = await this.measureLatency(server);
    this.results.latency = latencyResults.median;
    this.results.jitter = latencyResults.jitter;
    this.onProgress("latency", 100, this.results);

    // Download
    this.onProgress("download", 0);
    this.results.download = await this.measureDownload(server);
    this.onProgress("download", 100, this.results);

    // Upload
    this.onProgress("upload", 0);
    if (server.up) {
      this.results.upload = await this.measureUpload(server);
    } else {
      this.results.upload = null;
    }
    this.onProgress("upload", 100, this.results);

    return this.results;
  },

  async measureLatency(server) {
    const pings = [];
    const rounds = 20;
    const pingUrl = server.ping;

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      try {
        await fetch(`${pingUrl}${pingUrl.includes("?") ? "&" : "?"}_=${Date.now()}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        const elapsed = performance.now() - start;
        pings.push(elapsed);
      } catch {
        // skip
      }
      this.onProgress("latency", Math.round(((i + 1) / rounds) * 100));
    }

    if (pings.length === 0) return { median: null, jitter: null };

    pings.sort((a, b) => a - b);
    const median = pings[Math.floor(pings.length / 2)];

    let jitterSum = 0;
    for (let i = 1; i < pings.length; i++) {
      jitterSum += Math.abs(pings[i] - pings[i - 1]);
    }
    const jitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;

    return { median: Math.round(median * 10) / 10, jitter: Math.round(jitter * 10) / 10 };
  },

  async measureDownload(server) {
    // Use fixed-URL download files if the server provides them
    if (server.downSizes) {
      return this.measureDownloadFixed(server);
    }

    // Use dynamic byte-size endpoint (Cloudflare / Worker)
    const sizes = [100000, 500000, 1000000, 5000000, 10000000, 25000000];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      try {
        const url = `${server.down}${server.down.includes("?") ? "&" : "?"}bytes=${size}`;
        const start = performance.now();
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const blob = await res.blob();
        const elapsed = (performance.now() - start) / 1000;

        totalBytes += blob.size;
        totalTime += elapsed;

        this.onProgress("download", Math.round(((i + 1) / sizes.length) * 100));
        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    if (totalTime === 0) return null;
    return Math.round(((totalBytes * 8) / (totalTime * 1000000)) * 100) / 100;
  },

  async measureDownloadFixed(server) {
    let totalBytes = 0;
    let totalTime = 0;
    const files = server.downSizes;

    for (let i = 0; i < files.length; i++) {
      try {
        const url = `${files[i].url}${files[i].url.includes("?") ? "&" : "?"}_=${Date.now()}`;
        const start = performance.now();
        const res = await fetch(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const blob = await res.blob();
        const elapsed = (performance.now() - start) / 1000;

        totalBytes += blob.size;
        totalTime += elapsed;

        this.onProgress("download", Math.round(((i + 1) / files.length) * 100));
        // If we've collected enough data (>3s of transfer), stop
        if (totalTime > 3 || elapsed > 10) break;
      } catch {
        break;
      }
    }

    if (totalTime === 0) return null;
    return Math.round(((totalBytes * 8) / (totalTime * 1000000)) * 100) / 100;
  },

  async measureUpload(server) {
    if (!server.up) return null;

    const sizes = [100000, 500000, 1000000, 2000000, 5000000];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i];
      const data = new Uint8Array(size);
      for (let j = 0; j < size; j += 4096) {
        data[j] = Math.random() * 256;
      }

      try {
        const start = performance.now();
        await fetch(server.up, {
          method: "POST",
          body: data,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = (performance.now() - start) / 1000;

        totalBytes += size;
        totalTime += elapsed;

        this.onProgress("upload", Math.round(((i + 1) / sizes.length) * 100));
        if (elapsed > 8) break;
      } catch {
        break;
      }
    }

    if (totalTime === 0) return null;
    return Math.round(((totalBytes * 8) / (totalTime * 1000000)) * 100) / 100;
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
