# Hybrid Region Latency Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fake per-city latency (all hitting the same anycast IP) with hybrid approach: real measured latency to 6 R2 regions + distance-based estimates for individual PoPs.

**Architecture:** Create 6 R2 buckets with location hints (wnam, enam, weur, eeur, apac, oc), each containing a tiny ping file. Client fetches these files to measure real per-region latency. Individual PoP latencies are estimated from the measured region latency, scaled by haversine distance ratios. The map cards get a "measured" vs "estimated" badge.

**Tech Stack:** Cloudflare Workers, R2 (6 buckets), existing Leaflet map, existing `haversineKm()` in `cf-pops.ts`

---

## Chunk 1: R2 Infrastructure + Worker Ping Endpoint

### Task 1: Create R2 Buckets and Upload Ping Files

**Manual steps (not automatable from CLI):**

- [ ] **Step 1:** Create 6 R2 buckets via Cloudflare Dashboard → R2 → Create bucket, one per region:

| Bucket Name | Location Hint | Region |
|---|---|---|
| `netcheck-ping-wnam` | wnam | Western North America |
| `netcheck-ping-enam` | enam | Eastern North America |
| `netcheck-ping-weur` | weur | Western Europe |
| `netcheck-ping-eeur` | eeur | Eastern Europe |
| `netcheck-ping-apac` | apac | Asia-Pacific |
| `netcheck-ping-oc` | oc | Oceania |

- [ ] **Step 2:** Upload a `ping.json` file to each bucket containing:
```json
{"t":0}
```

- [ ] **Step 3:** Configure CORS on each bucket:
```json
[{
  "AllowedOrigins": ["https://netcheck-site.oilygold.workers.dev", "http://localhost:8787"],
  "AllowedMethods": ["GET"]
}]
```

- [ ] **Step 4:** Enable public access (r2.dev) on each bucket OR set up custom domains. If using r2.dev URLs, note the generated URL for each bucket. If using custom domains, create CNAME records:

| Subdomain | R2 Bucket |
|---|---|
| `wnam-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-wnam |
| `enam-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-enam |
| `weur-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-weur |
| `eeur-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-eeur |
| `apac-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-apac |
| `oc-ping.netcheck-site.oilygold.workers.dev` | netcheck-ping-oc |

> **Note:** The simplest approach is enabling r2.dev public access on each bucket. The URLs will be `https://pub-<hash>.r2.dev/ping.json`. Record these URLs.

- [ ] **Step 5:** Record the 6 public URLs somewhere accessible. We'll need them in the worker config.

---

### Task 2: Add R2 Bucket Bindings to wrangler.toml

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1:** Add R2 bucket bindings for all 6 regional buckets

```toml
name = "netcheck-site"
compatibility_date = "2025-04-01"
main = "src/worker/index.ts"

[[kv_namespaces]]
binding = "ANALYTICS"
id = "c8d691f38f32437db35f62b5111d6c3b"

[[r2_buckets]]
binding = "PING_WNAM"
bucket_name = "netcheck-ping-wnam"

[[r2_buckets]]
binding = "PING_ENAM"
bucket_name = "netcheck-ping-enam"

[[r2_buckets]]
binding = "PING_WEUR"
bucket_name = "netcheck-ping-weur"

[[r2_buckets]]
binding = "PING_EEUR"
bucket_name = "netcheck-ping-eeur"

[[r2_buckets]]
binding = "PING_APAC"
bucket_name = "netcheck-ping-apac"

[[r2_buckets]]
binding = "PING_OC"
bucket_name = "netcheck-ping-oc"
```

- [ ] **Step 2:** Update the `Env` interface in worker to include R2 bindings

In `src/worker/index.ts`, update the Env interface:

```typescript
interface Env {
  ANALYTICS: KVNamespace;
  PING_WNAM: R2Bucket;
  PING_ENAM: R2Bucket;
  PING_WEUR: R2Bucket;
  PING_EEUR: R2Bucket;
  PING_APAC: R2Bucket;
  PING_OC: R2Bucket;
}
```

- [ ] **Step 3:** Run `npx wrangler deploy` to verify the bindings are valid

Run: `npx wrangler deploy`
Expected: successful deploy with new R2 bindings shown

---

### Task 3: Create Worker Endpoint for Regional Pings

**Files:**
- Modify: `src/worker/index.ts:44-49` (replace `/api/map/ping`)
- Modify: `src/worker/index.ts:469-530` (replace PROBES + handleMapProbes)

This replaces the broken anycast-based relay measurement with real R2-backed regional endpoints.

- [ ] **Step 1:** Add region-to-binding mapping and new ping handler

Replace the `/api/map/ping` handler block (lines 44-49) with:

```typescript
if (url.pathname === "/api/map/ping" && url.searchParams.has("region")) {
  return handleRegionPing(url, env, request);
}
```

Add the `handleRegionPing` function after `handleMapProbes`:

```typescript
const REGION_BUCKETS: Record<string, string> = {
  wnam: "PING_WNAM", enam: "PING_ENAM", weur: "PING_WEUR",
  eeur: "PING_EEUR", apac: "PING_APAC", oc: "PING_OC",
};

async function handleRegionPing(url: URL, env: Env, request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const region = url.searchParams.get("region")!;
  const bindingName = REGION_BUCKETS[region];
  if (!bindingName) {
    return Response.json({ error: "Unknown region" }, { status: 400, headers: corsHeaders(request) });
  }

  const bucket = env[bindingName as keyof Env] as unknown as R2Bucket;
  const start = Date.now();
  const obj = await bucket.get("ping.json");
  const latency = Date.now() - start;

  if (!obj) {
    return Response.json({ error: "Ping file not found" }, { status: 404, headers: corsHeaders(request) });
  }

  return Response.json({ region, latency, ts: Date.now() }, { headers: corsHeaders(request) });
}
```

- [ ] **Step 2:** Run `npx tsc --noEmit` to verify type safety

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3:** Commit

```bash
git add wrangler.toml src/worker/index.ts
git commit -m "feat: replace anycast relay with R2 regional ping endpoints"
```

---

## Chunk 2: Client-Side Regional Measurement + Estimation

### Task 4: Update Network Map Types and Region Constants

**Files:**
- Modify: `src/client/network-map.ts`

- [ ] **Step 1:** Replace the entire `network-map.ts` with the hybrid approach

```typescript
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

export const R2_REGION_META: Record<R2Region, { name: string; lat: number; lon: number; probeRegion: string }> = {
  wnam: { name: "Western North America", lat: 37.5, lon: -122, probeRegion: "North America" },
  enam: { name: "Eastern North America", lat: 39.0, lon: -77, probeRegion: "North America" },
  weur: { name: "Western Europe", lat: 50.0, lon: 4.0, probeRegion: "Europe" },
  eeur: { name: "Eastern Europe", lat: 52.0, lon: 21.0, probeRegion: "Europe" },
  apac: { name: "Asia-Pacific", lat: 1.35, lon: 103.8, probeRegion: "Asia" },
  oc: { name: "Oceania", lat: -33.9, lon: 151.2, probeRegion: "Oceania" },
};

export const NetworkMap = {
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
    const REGION_PROBE_MAP: Record<string, R2Region> = {
      "North America": "wnam",
      "South America": "enam",
      "Europe": "weur",
      "Middle East": "eeur",
      "Africa": "eeur",
      "Asia": "apac",
      "Oceania": "oc",
    };

    const r2Key = REGION_PROBE_MAP[probe.region];
    if (!r2Key) return null;
    const regionLatency = regionLatencies[r2Key];
    if (regionLatency == null) return null;

    if (userLat == null || userLon == null) return regionLatency;

    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const meta = R2_REGION_META[r2Key];
    const distUserToRegion = haversineKm(userLat, userLon, meta.lat, meta.lon);
    const distUserToProbe = haversineKm(userLat, userLon, probe.lat, probe.lon);
    const distRegionToProbe = haversineKm(meta.lat, meta.lon, probe.lat, probe.lon);

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
      return {
        ...p,
        latency: estimated,
        measured: false,
        colo: null,
      };
    });

    return {
      userColo: data.userColo,
      userLat: data.userLat,
      userLon: data.userLon,
      probes,
    };
  },

  async fetchProbes(): Promise<{ probes: ProbeDef[]; userColo: string; userLat: number | null; userLon: number | null }> {
    const res = await fetch("/api/map/probes", { cache: "no-store" });
    return res.json();
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
```

- [ ] **Step 2:** Run `npx tsc --noEmit`

Run: `npx tsc --noEmit`
Expected: type errors in `network-map-ui.ts` because `relayLatency` no longer exists on `ProbeResult` — we'll fix in the next task

- [ ] **Step 3:** Commit

```bash
git add src/client/network-map.ts
git commit -m "feat: hybrid latency measurement — R2 regions + distance estimates"
```

---

### Task 5: Update Network Map UI for Hybrid Display

**Files:**
- Modify: `src/client/network-map-ui.ts`
- Modify: `src/client/i18n.ts` (add "estimated" i18n key)

- [ ] **Step 1:** Update `network-map-ui.ts` — remove all `relayLatency` references

In `probeCard` (around line 221-236), replace the card template:

```typescript
const probeCard = (probe: typeof results.probes[0]) => {
    const color = NetworkMap.getLatencyColor(probe.latency);
    const dots = NetworkMap.getLatencyDots(probe.latency);
    const latencyText = probe.latency != null ? `${probe.latency}<span class="region-unit">ms</span>` : "—";
    const estimateBadge = !probe.measured
      ? `<span class="estimate-badge">${t("network.estimated")}</span>`
      : "";
    const isClosest = probe.id === closest?.id;

    return `
      <div class="region-card${isClosest ? " active" : ""}">
        <div class="region-name" style="color:var(--text-primary)">${probe.name} <span style="color:var(--text-quaternary);font-size:11px">${probe.id}</span></div>
        <div class="region-latency" style="color:${color}">${latencyText} ${estimateBadge}</div>
        <div class="region-dots" style="color:${color}">
          ${Array.from({ length: 5 }, (_, i) => `<span class="region-dot${i < dots ? " active" : ""}"></span>`).join("")}
        </div>
      </div>`;
  };
```

- [ ] **Step 2:** Update popup template in `renderMapResults` — remove `relayText`

In `renderMapResults` (around line 110-148), update the popup:

Replace the `relayText` line and popup template:
```typescript
const latencyText = probe.latency != null ? `${probe.latency}ms` : "—";
const closestBadge = probe.id === closest?.id
  ? `<span style="background:#5e6ad2;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">${t("network.closest") || "Closest"}</span>`
  : "";
const estimateLabel = !probe.measured
  ? `<br><span style="font-size:10px;color:#999">⏱ ${t("network.estimated")}</span>`
  : "";

marker.bindPopup(
  `<div style="text-align:center;font-family:Inter,system-ui,sans-serif;min-width:120px">
    <strong>${probe.name} (${probe.id})${closestBadge}</strong><br>
    <span style="font-size:12px;color:#888">${probe.city}, ${probe.country}</span><br>
    <span style="font-size:18px;font-weight:600;color:${cssColor}">${latencyText}</span>
    ${estimateLabel}
  </div>`
);
```

- [ ] **Step 3:** Add i18n key for "estimated"

In `src/client/i18n.ts`, add to the English translations (after line 109 `"network.closest": "Closest"`):

```typescript
"network.estimated": "estimated",
```

- [ ] **Step 4:** Add the same key to all 5 locale files

| File | Key + Value |
|---|---|
| `src/client/locales/zh-TW.ts` | `"network.estimated": "估計"` |
| `src/client/locales/zh-CN.ts` | `"network.estimated": "估算"` |
| `src/client/locales/es.ts` | `"network.estimated": "estimado"` |
| `src/client/locales/ja.ts` | `"network.estimated": "推定"` |
| `src/client/locales/ko.ts` | `"network.estimated": "추정"` |

- [ ] **Step 5:** Add "estimated" badge CSS

In `public/css/styles.css`, after `.region-dots` block (around line 2667):

```css
.estimate-badge {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-quaternary);
  background: var(--surface-secondary);
  padding: 1px 5px;
  border-radius: 4px;
  margin-left: 4px;
  vertical-align: middle;
}
```

- [ ] **Step 6:** Run `npx tsc --noEmit && npx vite build`

Run: `npx tsc --noEmit && npx vite build`
Expected: clean build

- [ ] **Step 7:** Commit

```bash
git add src/client/network-map-ui.ts src/client/i18n.ts src/client/locales/ public/css/styles.css
git commit -m "feat: update network map UI for hybrid latency display"
```

---

## Chunk 3: Worker Cleanup + Deploy

### Task 6: Remove Broken Relay Measurement from Worker

**Files:**
- Modify: `src/worker/index.ts:503-530`

- [ ] **Step 1:** Simplify `handleMapProbes` — remove relay latency fetches

Replace `handleMapProbes` (lines 503-530) with:

```typescript
async function handleMapProbes(request: Request): Promise<Response> {
  const rl = checkRateLimit(request);
  if (rl) return rl;

  const cf = getCf(request);
  const userColo = cf.colo || "unknown";
  const userLat = cf.latitude ? parseFloat(cf.latitude) : null;
  const userLon = cf.longitude ? parseFloat(cf.longitude) : null;

  return Response.json({
    userColo,
    userLat,
    userLon,
    probes: PROBES.map((p) => ({ id: p.id, name: p.name, country: p.country, region: p.region, city: p.city, lat: p.lat, lon: p.lon })),
  }, { headers: corsHeaders(request) });
}
```

- [ ] **Step 2:** Remove the `url` field from `PROBES` array since it's no longer used

In the `PROBES` constant (lines 469-501), remove the `url` property from each entry. Each entry becomes:

```typescript
{ id: "IAD", name: "Ashburn", country: "US", region: "North America", city: "Ashburn", lat: 39.04, lon: -77.49 },
```

(Repeat for all 30 entries — just delete the `, url: "https://1.1.1.1/cdn-cgi/trace"` from each line.)

- [ ] **Step 3:** Run `npx tsc --noEmit && npx vite build`

Run: `npx tsc --noEmit && npx vite build`
Expected: clean build

- [ ] **Step 4:** Commit

```bash
git add src/worker/index.ts
git commit -m "chore: remove broken anycast relay measurement from worker"
```

---

### Task 7: Test End-to-End and Deploy

- [ ] **Step 1:** Run local dev server with R2 bindings

Run: `npx wrangler dev --r2 PING_WNAM=netcheck-ping-wnam --r2 PING_ENAM=netcheck-ping-enam --r2 PING_WEUR=netcheck-ping-weur --r2 PING_EEUR=netcheck-ping-eeur --r2 PING_APAC=netcheck-ping-apac --r2 PING_OC=netcheck-ping-oc`

Expected: dev server starts on localhost:8787

- [ ] **Step 2:** Verify `/api/map/ping?region=wnam` returns JSON with latency

Open: `http://localhost:8787/api/map/ping?region=wnam`
Expected: `{"region":"wnam","latency":45,"ts":...}`

- [ ] **Step 3:** Verify `/api/map/ping?region=invalid` returns 400

Open: `http://localhost:8787/api/map/ping?region=invalid`
Expected: `{"error":"Unknown region"}`

- [ ] **Step 4:** Verify `/api/map/probes` no longer returns `relayLatencies`

Open: `http://localhost:8787/api/map/probes`
Expected: JSON with `userColo`, `userLat`, `userLon`, `probes` array — no `relayLatencies` key

- [ ] **Step 5:** Open the app in browser, click "Run Test" on Network Map

Expected: Regional latencies load, per-PoP cards show estimated values with "estimated" badge

- [ ] **Step 6:** Deploy

Run: `npx wrangler deploy`
Expected: successful deploy

- [ ] **Step 7:** Commit any fixup changes if needed

```bash
git add -A && git commit -m "fix: end-to-end testing fixes for hybrid latency"
```

---

### Task 8: Update Region Mapping for South America, Middle East, Africa

After verifying the 6 R2 regions work, we need to map the 3 remaining probe regions (South America, Middle East, Africa) that don't have their own R2 bucket. These will use the nearest R2 region as their measurement base.

**Files:**
- Modify: `src/client/network-map.ts` (the `REGION_PROBE_MAP` in `estimateProbeLatency`)

- [ ] **Step 1:** Verify the current mapping handles all regions

The `REGION_PROBE_MAP` in Task 4 already includes:
```typescript
"South America": "enam",   // closest R2 region to South America
"Middle East": "eeur",     // closest R2 region to Middle East
"Africa": "eeur",          // closest R2 region to Africa
```

These are reasonable defaults. The distance-based ratio scaling in `estimateProbeLatency` will naturally inflate the latency for farther PoPs (e.g., São Paulo will get a higher estimate than Miami even though both use `enam` as their base).

No code change needed if these are already in place from Task 4. Verify and move on.

- [ ] **Step 2:** Commit if any changes made

```bash
git add src/client/network-map.ts
git commit -m "fix: ensure all probe regions have R2 region mapping"
```

---

## Summary

| What | Before (broken) | After (hybrid) |
|---|---|---|
| Client latency | 30 `fetch()` to `/api/map/ping?id=XXX` (all same Worker edge) | 6 `fetch()` to `/api/map/ping?region=XXX` (real R2 regions) |
| Relay latency | Worker fetches `1.1.1.1` 30 times (all same edge) | Removed — was meaningless |
| Per-PoP values | Fake differentiated numbers from single anycast endpoint | Estimated from measured region latency × distance ratio |
| Honesty | Pretends to measure 30 cities | Shows "estimated" badge on derived values |
| API calls | 30 client pings + 30 worker relay fetches = 60 requests | 6 client pings + 1 probes fetch = 7 requests |

**R2 region coverage:**

| R2 Region | Probe Regions Served |
|---|---|
| wnam (Western North America) | North America (west) |
| enam (Eastern North America) | North America (east), South America |
| weur (Western Europe) | Europe (west) |
| eeur (Eastern Europe) | Europe (east), Middle East, Africa |
| apac (Asia-Pacific) | Asia |
| oc (Oceania) | Oceania |