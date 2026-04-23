export interface ProbeDef {
  id: string;
  name: string;
  region: string;
  city: string;
}

export interface ProbeResult {
  id: string;
  name: string;
  region: string;
  city: string;
  latency: number | null;
  relayLatency: number | null;
  colo: string | null;
}

export interface MapResults {
  userColo: string;
  userLat: number | null;
  userLon: number | null;
  probes: ProbeResult[];
}

export const NetworkMap = {
  async fetchProbes(): Promise<{ probes: ProbeDef[]; userColo: string; userLat: number | null; userLon: number | null; relayLatencies: Record<string, number | null> }> {
    const res = await fetch("/api/map/probes", { cache: "no-store" });
    return res.json();
  },

  async measureClientLatency(probes: ProbeDef[]): Promise<MapResults["probes"]> {
    const results = await Promise.all(probes.map(async (probe) => {
      try {
        const start = performance.now();
        const res = await fetch(`/api/map/ping?id=${probe.id}&_=${Date.now()}`, { cache: "no-store" });
        const latency = performance.now() - start;
        const colo = res.headers.get("x-colo");
        return { ...probe, latency: Math.round(latency * 10) / 10, relayLatency: null as number | null, colo };
      } catch {
        return { ...probe, latency: null, relayLatency: null as number | null, colo: null };
      }
    }));
    return results;
  },

  async run(): Promise<MapResults> {
    const data = await this.fetchProbes();
    const clientResults = await this.measureClientLatency(data.probes);

    const probes = clientResults.map((r) => ({
      ...r,
      relayLatency: data.relayLatencies[r.id] ?? null,
    }));

    return {
      userColo: data.userColo,
      userLat: data.userLat,
      userLon: data.userLon,
      probes,
    };
  },

  getLatencyColor(latency: number | null): string {
    if (latency === null) return "var(--text-quaternary)";
    if (latency < 50) return "var(--green)";
    if (latency < 150) return "var(--amber)";
    if (latency < 300) return "var(--brand)";
    return "var(--red)";
  },

  getLatencyDots(latency: number | null): number {
    if (latency === null) return 0;
    if (latency < 50) return 5;
    if (latency < 100) return 4;
    if (latency < 150) return 3;
    if (latency < 300) return 2;
    return 1;
  },
};