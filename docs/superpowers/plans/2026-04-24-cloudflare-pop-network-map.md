# Cloudflare PoP Network Map Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 generic probes with ~25 curated Cloudflare PoP locations and show real PoP names in the speed test.

**Architecture:** Worker serves a curated PoP catalog via `/api/map/probes`, client pings each PoP via `/api/map/ping` (already returns `x-colo`), speed test uses the `colo` from `/api/ip` + `cf-pops.ts` to show real data center names.

**Tech Stack:** Vanilla TypeScript, Cloudflare Workers, leaflet maps, existing `cf-pops.ts` lookup system.

---

## Chunk 1: Worker — Replace PROBES with Cloudflare PoP catalog

**Files:**
- Modify: `src/worker/index.ts:469-504`

- [ ] **Step 1: Replace PROBES with curated Cloudflare PoP entries**

Replace the `PROBES` constant in `src/worker/index.ts` with:

```ts
const PROBES = [
  { id: "IAD", name: "Ashburn", country: "US", region: "North America", city: "Ashburn", lat: 39.04, lon: -77.49, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "DFW", name: "Dallas", country: "US", region: "North America", city: "Dallas", lat: 32.79, lon: -96.77, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "LAX", name: "Los Angeles", country: "US", region: "North America", city: "Los Angeles", lat: 33.94, lon: -118.41, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "ORD", name: "Chicago", country: "US", region: "North America", city: "Chicago", lat: 41.88, lon: -87.63, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "SEA", name: "Seattle", country: "US", region: "North America", city: "Seattle", lat: 47.61, lon: -122.33, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "YYZ", name: "Toronto", country: "CA", region: "North America", city: "Toronto", lat: 43.65, lon: -79.38, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "MIA", name: "Miami", country: "US", region: "North America", city: "Miami", lat: 25.76, lon: -80.19, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "GRU", name: "São Paulo", country: "BR", region: "South America", city: "São Paulo", lat: -23.55, lon: -46.63, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "EZE", name: "Buenos Aires", country: "AR", region: "South America", city: "Buenos Aires", lat: -34.60, lon: -58.38, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "SCL", name: "Santiago", country: "CL", region: "South America", city: "Santiago", lat: -33.45, lon: -70.67, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "BOG", name: "Bogotá", country: "CO", region: "South America", city: "Bogotá", lat: 4.71, lon: -74.07, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "LHR", name: "London", country: "GB", region: "Europe", city: "London", lat: 51.51, lon: -0.13, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "FRA", name: "Frankfurt", country: "DE", region: "Europe", city: "Frankfurt", lat: 50.11, lon: 8.68, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "CDG", name: "Paris", country: "FR", region: "Europe", city: "Paris", lat: 49.01, lon: 2.55, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "AMS", name: "Amsterdam", country: "NL", region: "Europe", city: "Amsterdam", lat: 52.37, lon: 4.90, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "ARN", name: "Stockholm", country: "SE", region: "Europe", city: "Stockholm", lat: 59.33, lon: 18.07, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "WAW", name: "Warsaw", country: "PL", region: "Europe", city: "Warsaw", lat: 52.23, lon: 21.01, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "MAD", name: "Madrid", country: "ES", region: "Europe", city: "Madrid", lat: 40.42, lon: -3.70, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "DXB", name: "Dubai", country: "AE", region: "Middle East", city: "Dubai", lat: 25.20, lon: 55.27, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "TLV", name: "Tel Aviv", country: "IL", region: "Middle East", city: "Tel Aviv", lat: 32.09, lon: 34.77, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "JNB", name: "Johannesburg", country: "ZA", region: "Africa", city: "Johannesburg", lat: -26.20, lon: 28.05, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "LOS", name: "Lagos", country: "NG", region: "Africa", city: "Lagos", lat: 6.52, lon: 3.38, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "NBO", name: "Nairobi", country: "KE", region: "Africa", city: "Nairobi", lat: -1.29, lon: 36.82, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "SIN", name: "Singapore", country: "SG", region: "Asia", city: "Singapore", lat: 1.35, lon: 103.82, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "NRT", name: "Tokyo", country: "JP", region: "Asia", city: "Tokyo", lat: 35.68, lon: 139.69, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "HKG", name: "Hong Kong", country: "HK", region: "Asia", city: "Hong Kong", lat: 22.32, lon: 114.17, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "BOM", name: "Mumbai", country: "IN", region: "Asia", city: "Mumbai", lat: 19.08, lon: 72.88, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "ICN", name: "Seoul", country: "KR", region: "Asia", city: "Seoul", lat: 37.57, lon: 126.98, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "TPE", name: "Taipei", country: "TW", region: "Asia", city: "Taipei", lat: 25.03, lon: 121.57, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "SYD", name: "Sydney", country: "AU", region: "Oceania", city: "Sydney", lat: -33.87, lon: 151.21, url: "https://1.1.1.1/cdn-cgi/trace" },
  { id: "AKL", name: "Auckland", country: "NZ", region: "Oceania", city: "Auckland", lat: -36.85, lon: 174.76, url: "https://1.1.1.1/cdn-cgi/trace" },
];
```

Note: All probes use `https://1.1.1.1/cdn-cgi/trace` because Cloudflare's anycast routes to the nearest PoP. The relay latency measures Worker→PoP, while the client ping measures User→nearest-edge-with-PoP-header. The `x-colo` header on `/api/map/ping` tells us which PoP actually handled the request.

- [ ] **Step 2: Update handleMapProbes response shape**

The `handleMapProbes` function already returns the data we need. Just update the probe mapping to include `country`:

In the `probes:` mapping line, change from:
```ts
probes: PROBES.map((p) => ({ id: p.id, name: p.name, region: p.region, city: p.city, lat: p.lat, lon: p.lon })),
```
to:
```ts
probes: PROBES.map((p) => ({ id: p.id, name: p.name, country: p.country, region: p.region, city: p.city, lat: p.lat, lon: p.lon })),
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: replace 5 generic probes with 30 Cloudflare PoP locations"
```

---

## Chunk 2: Client — Update network map types and rendering

**Files:**
- Modify: `src/client/network-map.ts`
- Modify: `src/client/network-map-ui.ts`

- [ ] **Step 1: Update ProbeDef and ProbeResult interfaces**

In `src/client/network-map.ts`, update `ProbeDef` to include `country`:

```ts
export interface ProbeDef {
  id: string;
  name: string;
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
}
```

Update `ProbeResult` to include `country`:

```ts
export interface ProbeResult {
  id: string;
  name: string;
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  latency: number | null;
  relayLatency: number | null;
  colo: string | null;
}
```

- [ ] **Step 2: Update network-map-ui.ts to use PoP code as id**

In `src/client/network-map-ui.ts`, update `renderResults` to show `probe.id` (PoP code like "FRA") alongside city name. Update the popup and card HTML:

In the popup for each marker, change the `<strong>` line from:
```ts
<strong>${probe.region}${closestBadge}</strong>
```
to:
```ts
<strong>${probe.name} (${probe.id})${closestBadge}</strong>
```

And change the city subtitle from:
```ts
<span style="font-size:12px;color:#888">${probe.city}</span>
```
to:
```ts
<span style="font-size:12px;color:#888">${probe.city}, ${probe.country}</span>
```

In `renderResults`, update the region card to show PoP code:
```ts
<div class="region-name" style="color:var(--text-primary)">${probe.name} <span style="color:var(--text-quaternary);font-size:11px">${probe.id}</span></div>
<div class="region-city" style="color:var(--text-tertiary);font-size:12px">${probe.city}, ${probe.country}</div>
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (may have type errors from missing `country` field — fix before committing)

- [ ] **Step 4: Build and verify**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/client/network-map.ts src/client/network-map-ui.ts
git commit -m "feat: update network map UI for 30 PoP locations with country display"
```

---

## Chunk 3: Client — Show real PoP name in speed test

**Files:**
- Modify: `src/client/speed-ui.ts`

The speed test already uses `formatColo(colo, ...)` from `cf-pops.ts` to display PoP names in history cards and via `updateServerBadge`. The `colo` field comes from the `/api/ip` response which already returns `cf.colo`. So the speed test already shows real PoP data.

However, the initial label shows "Automatic — nearest edge" via `speed.autoNearest` string. Let's update it to show the actual PoP after detection.

- [ ] **Step 1: Update speed test to show detected PoP name**

In `src/client/speed-ui.ts`, the `runSpeedTest` function already calls `updateServerBadge(data.colo, ...)` during progress callbacks. The initial "Automatic — nearest edge" text is set in `speed-ui.ts` line 120:
```ts
document.getElementById("speed-server-value")!.textContent = t("speed.detecting");
```

This is fine — it shows "detecting..." during the test, then the real PoP name appears once data arrives. No change needed here.

The one improvement is in `speed-suggestions.ts` line 113, `updateServerBadge` already formats the colo into a city name. This works well.

**Actually no code changes needed for this chunk** — the speed test already integrates real PoP data. Moving on.

- [ ] **Step 2: Commit (no changes)**

Skip this chunk, mark as complete.

---

## Chunk 4: i18n — Add region names for new regions

**Files:**
- Modify: `src/client/i18n.ts`
- Modify: `src/client/locales/zh-TW.ts`
- Modify: `src/client/locales/zh-CN.ts`
- Modify: `src/client/locales/es.ts`
- Modify: `src/client/locales/ja.ts`
- Modify: `src/client/locales/ko.ts`

- [ ] **Step 1: Add region i18n keys to English locale in i18n.ts**

Add these keys to the `en` object in `src/client/i18n.ts`, after the existing `network.` entries:

```ts
"network.region.northAmerica": "North America",
"network.region.southAmerica": "South America",
"network.region.europe": "Europe",
"network.region.middleEast": "Middle East",
"network.region.africa": "Africa",
"network.region.asia": "Asia",
"network.region.oceania": "Oceania",
"network.region.global": "Global",
```

- [ ] **Step 2: Add same keys to all locale files**

Add the translated equivalents to each locale file:

`zh-TW.ts`:
```ts
"network.region.northAmerica": "北美洲",
"network.region.southAmerica": "南美洲",
"network.region.europe": "歐洲",
"network.region.middleEast": "中東",
"network.region.africa": "非洲",
"network.region.asia": "亞洲",
"network.region.oceania": "大洋洲",
"network.region.global": "全球",
```

`zh-CN.ts`:
```ts
"network.region.northAmerica": "北美洲",
"network.region.southAmerica": "南美洲",
"network.region.europe": "欧洲",
"network.region.middleEast": "中东",
"network.region.africa": "非洲",
"network.region.asia": "亚洲",
"network.region.oceania": "大洋洲",
"network.region.global": "全球",
```

`es.ts`:
```ts
"network.region.northAmerica": "Norteamérica",
"network.region.southAmerica": "Sudamérica",
"network.region.europe": "Europa",
"network.region.middleEast": "Oriente Medio",
"network.region.africa": "África",
"network.region.asia": "Asia",
"network.region.oceania": "Oceanía",
"network.region.global": "Global",
```

`ja.ts`:
```ts
"network.region.northAmerica": "北米",
"network.region.southAmerica": "南米",
"network.region.europe": "ヨーロッパ",
"network.region.middleEast": "中東",
"network.region.africa": "アフリカ",
"network.region.asia": "アジア",
"network.region.oceania": "オセアニア",
"network.region.global": "グローバル",
```

`ko.ts`:
```ts
"network.region.northAmerica": "북미",
"network.region.southAmerica": "남미",
"network.region.europe": "유럽",
"network.region.middleEast": "중동",
"network.region.africa": "아프리카",
"network.region.asia": "아시아",
"network.region.oceania": "오세아니아",
"network.region.global": "글로벌",
```

- [ ] **Step 3: Update network-map-ui.ts to use i18n for regions**

In `renderResults`, change the region name display from the raw English `probe.region` to translated:

```ts
const regionKey = `network.region.${probe.region.toLowerCase().replace(/\s+/g, '').replace('&', '')}`;
```

This maps "North America" → "network.region.northamerica" etc. Actually, simpler to just add a helper:

In `network-map-ui.ts`, at the top after imports, add:
```ts
function regionKey(region: string): string {
  const map: Record<string, string> = {
    "North America": "network.region.northAmerica",
    "South America": "network.region.southAmerica",
    "Europe": "network.region.europe",
    "Middle East": "network.region.middleEast",
    "Africa": "network.region.africa",
    "Asia": "network.region.asia",
    "Oceania": "network.region.oceania",
    "Global": "network.region.global",
  };
  return map[region] || region;
}
```

Then in `renderResults` and popup rendering, replace `${probe.region}` with `${t(regionKey(probe.region))}`.

- [ ] **Step 4: Run typecheck and build**

Run: `npx tsc --noEmit && npx vite build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/i18n.ts src/client/locales/ src/client/network-map-ui.ts
git commit -m "feat: add i18n region names for Cloudflare PoP locations"
```

---

## Chunk 5: Final build and deploy verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Full build**

Run: `npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`
Open http://localhost:8787, navigate to Network Map tab, click "Run Test", verify:
- 30 PoP markers appear on the map
- Each popup shows PoP code + city + country
- Region cards grid shows all 30 entries with latency
- Speed test tab shows real PoP name (e.g., "Frankfurt (FRA)")

- [ ] **Step 4: Deploy**

Run: `npm run deploy`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: 30 Cloudflare PoP network map with real data center names"
```