export interface ProbeDef {
  id: string;
  name: string;
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
}

export interface ProbeResult {
  id: string;
  name: string;
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  latency: number | null;
  measured: boolean;
  colo: string | null;
}

export interface MapResults {
  userColo: string;
  userLat: number | null;
  userLon: number | null;
  probes: ProbeResult[];
}

export const R2_REGIONS = ["wnam", "enam", "weur", "eeur", "apac", "oc"] as const;
export type R2Region = typeof R2_REGIONS[number];

export const R2_REGION_META: Record<R2Region, { name: string; lat: number; lon: number }> = {
  wnam: { name: "Western North America", lat: 37.5, lon: -122 },
  enam: { name: "Eastern North America", lat: 39.0, lon: -77 },
  weur: { name: "Western Europe", lat: 50.0, lon: 4.0 },
  eeur: { name: "Eastern Europe", lat: 52.0, lon: 21.0 },
  apac: { name: "Asia-Pacific", lat: 1.35, lon: 103.8 },
  oc: { name: "Oceania", lat: -33.9, lon: 151.2 },
};

const REGION_PROBE_MAP: Record<string, R2Region> = {
  "North America": "wnam",
  "South America": "enam",
  "Europe": "weur",
  "Middle East": "eeur",
  "Africa": "eeur",
  "Asia": "apac",
  "Oceania": "oc",
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const NetworkMap = {
  async fetchProbes(): Promise<{ probes: ProbeDef[]; userColo: string; userLat: number | null; userLon: number | null }> {
    const res = await fetch("/api/map/probes", { cache: "no-store" });
    return res.json();
  },

  async measureRegionLatencies(): Promise<Record<R2Region, number | null>> {
    const results: Record<string, number | null> = {};
    await Promise.all(R2_REGIONS.map(async (region) => {
      try {
        const start = performance.now();
        await fetch(`/api/map/ping?region=${region}&_=${Date.now()}`, { cache: "no-store" });
        const elapsed = performance.now() - start;
        results[region] = Math.round(elapsed * 10) / 10;
      } catch {
        results[region] = null;
      }
    }));
    return results as Record<R2Region, number | null>;
  },

  estimateProbeLatency(
    probe: ProbeDef,
    regionLatencies: Record<R2Region, number | null>,
    userLat: number | null,
    userLon: number | null,
  ): number | null {
    const r2Key = REGION_PROBE_MAP[probe.region];
    if (!r2Key) return null;
    const regionLatency = regionLatencies[r2Key];
    if (regionLatency == null) return null;

    if (userLat == null || userLon == null) return regionLatency;

    const meta = R2_REGION_META[r2Key];
    const distUserToRegion = haversineKm(userLat, userLon, meta.lat, meta.lon);
    const distUserToProbe = haversineKm(userLat, userLon, probe.lat, probe.lon);

    if (distUserToRegion < 1) return regionLatency;

    const ratio = distUserToProbe / distUserToRegion;
    const cappedRatio = Math.max(0.5, Math.min(ratio, 3.0));
    return Math.round(regionLatency * cappedRatio);
  },

  async run(): Promise<MapResults> {
    const data = await this.fetchProbes();
    const regionLatencies = await this.measureRegionLatencies();

    const probes = data.probes.map((p) => {
      const estimated = this.estimateProbeLatency(p, regionLatencies, data.userLat, data.userLon);
      return { ...p, latency: estimated, measured: false, colo: null };
    });

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