const SpeedTest = {
  results: { download: null, upload: null, latency: null, jitter: null },
  onProgress: null,
  selectedServer: null,

  // mode: "direct" = browser fetches directly, "proxy" = browser fetches via worker proxy
  servers: [
    // --- Cloudflare ---
    {
      id: "cf-edge", network: "Cloudflare", name: "Cloudflare", location: "Nearest Edge", mode: "direct",
      ping: "https://speed.cloudflare.com/__down?bytes=0",
      down: "https://speed.cloudflare.com/__down",
      up: "https://speed.cloudflare.com/__up",
    },
    {
      id: "worker", network: "Cloudflare", name: "NetCheck Worker", location: "Nearest Edge", mode: "direct",
      ping: "/api/speedtest/ping",
      down: "/api/speedtest/down",
      up: "/api/speedtest/up",
    },

    // --- DigitalOcean ---
    {
      id: "do-nyc3", network: "DigitalOcean", name: "DigitalOcean", location: "New York, US", mode: "proxy",
      testFile: "https://speedtest-nyc3.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-nyc3.digitalocean.com/10mb.test",
    },
    {
      id: "do-sfo3", network: "DigitalOcean", name: "DigitalOcean", location: "San Francisco, US", mode: "proxy",
      testFile: "https://speedtest-sfo3.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-sfo3.digitalocean.com/10mb.test",
    },
    {
      id: "do-ams3", network: "DigitalOcean", name: "DigitalOcean", location: "Amsterdam, NL", mode: "proxy",
      testFile: "https://speedtest-ams3.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-ams3.digitalocean.com/10mb.test",
    },
    {
      id: "do-sgp1", network: "DigitalOcean", name: "DigitalOcean", location: "Singapore, SG", mode: "proxy",
      testFile: "https://speedtest-sgp1.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-sgp1.digitalocean.com/10mb.test",
    },
    {
      id: "do-lon1", network: "DigitalOcean", name: "DigitalOcean", location: "London, UK", mode: "proxy",
      testFile: "https://speedtest-lon1.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-lon1.digitalocean.com/10mb.test",
    },
    {
      id: "do-blr1", network: "DigitalOcean", name: "DigitalOcean", location: "Bangalore, IN", mode: "proxy",
      testFile: "https://speedtest-blr1.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-blr1.digitalocean.com/10mb.test",
    },
    {
      id: "do-syd1", network: "DigitalOcean", name: "DigitalOcean", location: "Sydney, AU", mode: "proxy",
      testFile: "https://speedtest-syd1.digitalocean.com/10mb.test",
      pingFile: "https://speedtest-syd1.digitalocean.com/10mb.test",
    },

    // --- Vultr ---
    {
      id: "vultr-lax", network: "Vultr", name: "Vultr", location: "Los Angeles, US", mode: "proxy",
      testFile: "https://lax-us-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://lax-us-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-ewr", network: "Vultr", name: "Vultr", location: "New Jersey, US", mode: "proxy",
      testFile: "https://ewr-us-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://ewr-us-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-fra", network: "Vultr", name: "Vultr", location: "Frankfurt, DE", mode: "proxy",
      testFile: "https://fra-de-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://fra-de-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-sgp", network: "Vultr", name: "Vultr", location: "Singapore, SG", mode: "proxy",
      testFile: "https://sgp-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://sgp-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-nrt", network: "Vultr", name: "Vultr", location: "Tokyo, JP", mode: "proxy",
      testFile: "https://nrt-jp-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://nrt-jp-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-syd", network: "Vultr", name: "Vultr", location: "Sydney, AU", mode: "proxy",
      testFile: "https://syd-au-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://syd-au-ping.vultr.com/vultr.com.100MB.bin",
    },
    {
      id: "vultr-lon", network: "Vultr", name: "Vultr", location: "London, UK", mode: "proxy",
      testFile: "https://lon-gb-ping.vultr.com/vultr.com.100MB.bin",
      pingFile: "https://lon-gb-ping.vultr.com/vultr.com.100MB.bin",
    },

    // --- Akamai / Linode ---
    {
      id: "linode-newark", network: "Akamai", name: "Akamai/Linode", location: "Newark, US", mode: "proxy",
      testFile: "https://speedtest.newark.linode.com/100MB-newark.bin",
      pingFile: "https://speedtest.newark.linode.com/100MB-newark.bin",
    },
    {
      id: "linode-fremont", network: "Akamai", name: "Akamai/Linode", location: "Fremont, US", mode: "proxy",
      testFile: "https://speedtest.fremont.linode.com/100MB-fremont.bin",
      pingFile: "https://speedtest.fremont.linode.com/100MB-fremont.bin",
    },
    {
      id: "linode-atlanta", network: "Akamai", name: "Akamai/Linode", location: "Atlanta, US", mode: "proxy",
      testFile: "https://speedtest.atlanta.linode.com/100MB-atlanta.bin",
      pingFile: "https://speedtest.atlanta.linode.com/100MB-atlanta.bin",
    },
    {
      id: "linode-lon", network: "Akamai", name: "Akamai/Linode", location: "London, UK", mode: "proxy",
      testFile: "https://speedtest.london.linode.com/100MB-london.bin",
      pingFile: "https://speedtest.london.linode.com/100MB-london.bin",
    },
    {
      id: "linode-sgp", network: "Akamai", name: "Akamai/Linode", location: "Singapore, SG", mode: "proxy",
      testFile: "https://speedtest.singapore.linode.com/100MB-singapore.bin",
      pingFile: "https://speedtest.singapore.linode.com/100MB-singapore.bin",
    },
    {
      id: "linode-tok", network: "Akamai", name: "Akamai/Linode", location: "Tokyo, JP", mode: "proxy",
      testFile: "https://speedtest.tokyo2.linode.com/100MB-tokyo2.bin",
      pingFile: "https://speedtest.tokyo2.linode.com/100MB-tokyo2.bin",
    },

    // --- Hetzner ---
    {
      id: "hetzner-de", network: "Hetzner", name: "Hetzner", location: "Falkenstein, DE", mode: "proxy",
      testFile: "https://speed.hetzner.de/100MB.bin",
      pingFile: "https://speed.hetzner.de/100MB.bin",
    },

    // --- OVH ---
    {
      id: "ovh-fr", network: "OVH", name: "OVHcloud", location: "Gravelines, FR", mode: "proxy",
      testFile: "https://proof.ovh.net/files/10Mb.dat",
      pingFile: "https://proof.ovh.net/files/1Mb.dat",
    },

    // --- Tele2 ---
    {
      id: "tele2-se", network: "Tele2", name: "Tele2", location: "Stockholm, SE", mode: "proxy",
      testFile: "https://speedtest.tele2.net/10MB.zip",
      pingFile: "https://speedtest.tele2.net/1KB.zip",
    },

    // --- Scaleway ---
    {
      id: "scaleway-fr", network: "Scaleway", name: "Scaleway", location: "Paris, FR", mode: "proxy",
      testFile: "https://ping.online.net/10Mo.dat",
      pingFile: "https://ping.online.net/1kb",
    },
  ],

  probeResults: [],

  async probeServers(onProgress) {
    this.probeResults = [];
    const total = this.servers.length;
    let done = 0;

    // Probe in batches of 6 to avoid overwhelming the network
    const batchSize = 6;
    const allResults = [];

    for (let i = 0; i < this.servers.length; i += batchSize) {
      const batch = this.servers.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (server) => {
          const result = await this.probeOne(server);
          done++;
          if (onProgress) onProgress(done, total);
          return result;
        })
      );
      allResults.push(...batchResults);
    }

    this.probeResults = allResults
      .filter((r) => r.reachable)
      .sort((a, b) => a.latency - b.latency);

    return this.probeResults;
  },

  async probeOne(server) {
    try {
      if (server.mode === "proxy") {
        // Ping via worker proxy
        const proxyUrl = `/api/speedtest/proxy/ping?url=${encodeURIComponent(server.pingFile)}`;
        const start = performance.now();
        const res = await fetch(proxyUrl, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        const totalRtt = performance.now() - start;

        if (!res.ok) return { server, latency: Infinity, reachable: false };

        const data = await res.json();
        // data.latency = worker→origin latency, totalRtt = user→worker→origin round trip
        return {
          server,
          latency: Math.round(totalRtt),
          originLatency: data.latency || null,
          reachable: true,
        };
      } else {
        // Direct ping
        const start = performance.now();
        await fetch(server.ping, { mode: "cors", cache: "no-store", signal: AbortSignal.timeout(4000) });
        const latency = Math.round(performance.now() - start);
        return { server, latency, originLatency: null, reachable: true };
      }
    } catch {
      return { server, latency: Infinity, reachable: false };
    }
  },

  getNearest(count) {
    return this.probeResults.slice(0, count || 5);
  },

  getNetworks() {
    const networks = {};
    for (const probe of this.probeResults) {
      const net = probe.server.network;
      if (!networks[net]) networks[net] = [];
      networks[net].push(probe);
    }
    return networks;
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
    const hasUpload = server.mode === "direct" && server.up;
    if (hasUpload) {
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

    for (let i = 0; i < rounds; i++) {
      const start = performance.now();
      try {
        if (server.mode === "proxy") {
          await fetch(`/api/speedtest/proxy/ping?url=${encodeURIComponent(server.pingFile)}&_=${Date.now()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
        } else {
          const pingUrl = server.ping;
          await fetch(`${pingUrl}${pingUrl.includes("?") ? "&" : "?"}_=${Date.now()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(5000),
          });
        }
        pings.push(performance.now() - start);
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
    if (server.mode === "proxy") {
      return this.measureDownloadProxy(server);
    }
    return this.measureDownloadDirect(server);
  },

  async measureDownloadDirect(server) {
    const sizes = [100000, 500000, 1000000, 5000000, 10000000, 25000000];
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < sizes.length; i++) {
      try {
        const url = `${server.down}${server.down.includes("?") ? "&" : "?"}bytes=${sizes[i]}`;
        const start = performance.now();
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
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

  async measureDownloadProxy(server) {
    // Download via worker proxy in increasing rounds
    const rounds = 5;
    let totalBytes = 0;
    let totalTime = 0;

    for (let i = 0; i < rounds; i++) {
      try {
        const proxyUrl = `/api/speedtest/proxy?url=${encodeURIComponent(server.testFile)}&_=${Date.now()}-${i}`;
        const start = performance.now();
        const res = await fetch(proxyUrl, { cache: "no-store", signal: AbortSignal.timeout(15000) });
        const blob = await res.blob();
        const elapsed = (performance.now() - start) / 1000;

        totalBytes += blob.size;
        totalTime += elapsed;

        this.onProgress("download", Math.round(((i + 1) / rounds) * 100));
        if (totalTime > 5 || elapsed > 10) break;
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
      const data = new Uint8Array(sizes[i]);
      for (let j = 0; j < sizes[i]; j += 4096) {
        data[j] = Math.random() * 256;
      }

      try {
        const start = performance.now();
        await fetch(server.up, { method: "POST", body: data, cache: "no-store", signal: AbortSignal.timeout(10000) });
        const elapsed = (performance.now() - start) / 1000;

        totalBytes += sizes[i];
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
