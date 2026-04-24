# Cloudflare PoP Network Map & Speed Test Integration

**Date:** 2026-04-24
**Status:** Approved

## Goal

Replace the current 5 generic network map probes with ~25-30 curated Cloudflare data center locations, and integrate real PoP data into the speed test.

## Architecture

### 1. PoP Catalog (Worker)

Replace the `PROBES` constant with a `CF_POPS` array of ~25-30 curated Cloudflare data centers.

**Selected PoPs:**

| Code | City | Country | Lat | Lon | Region |
|------|------|---------|-----|-----|--------|
| IAD | Ashburn | US | 39.04 | -77.49 | North America |
| DFW | Dallas | US | 32.79 | -96.77 | North America |
| LAX | Los Angeles | US | 33.94 | -118.41 | North America |
| ORD | Chicago | US | 41.88 | -87.63 | North America |
| SEA | Seattle | US | 47.61 | -122.33 | North America |
| YYZ | Toronto | CA | 43.65 | -79.38 | North America |
| MIA | Miami | US | 25.76 | -80.19 | North America |
| GRU | São Paulo | BR | -23.55 | -46.63 | South America |
| EZE | Buenos Aires | AR | -34.60 | -58.38 | South America |
| SCL | Santiago | CL | -33.45 | -70.67 | South America |
| BOG | Bogota | CO | 4.71 | -74.07 | South America |
| LHR | London | GB | 51.51 | -0.13 | Europe |
| FRA | Frankfurt | DE | 50.11 | 8.68 | Europe |
| CDG | Paris | FR | 49.01 | 2.55 | Europe |
| AMS | Amsterdam | NL | 52.37 | 4.90 | Europe |
| ARN | Stockholm | SE | 59.33 | 18.07 | Europe |
| WAW | Warsaw | PL | 52.23 | 21.01 | Europe |
| MAD | Madrid | ES | 40.42 | -3.70 | Europe |
| DXB | Dubai | AE | 25.20 | 55.27 | Middle East |
| TLV | Tel Aviv | IL | 32.09 | 34.77 | Middle East |
| JNB | Johannesburg | ZA | -26.20 | 28.05 | Africa |
| LOS | Lagos | NG | 6.52 | 3.38 | Africa |
| NBO | Nairobi | KE | -1.29 | 36.82 | Africa |
| SIN | Singapore | SG | 1.35 | 103.82 | Asia |
| NRT | Tokyo | JP | 35.68 | 139.69 | Asia |
| HKG | Hong Kong | HK | 22.32 | 114.17 | Asia |
| BOM | Mumbai | IN | 19.08 | 72.88 | Asia |
| ICN | Seoul | KR | 37.57 | 126.98 | Asia |
| TPE | Taipei | TW | 25.03 | 121.57 | Asia |
| SYD | Sydney | AU | -33.87 | 151.21 | Oceania |
| AKL | Auckland | NZ | -36.85 | 174.76 | Oceania |

Each PoP entry:
```ts
interface PopEntry {
  code: string;       // IATA-style PoP code (e.g., "FRA")
  city: string;       // City name
  country: string;    // Country code (e.g., "DE")
  region: string;    // Display region (use i18n key)
  lat: number;
  lon: number;
  url: string;        // https://<code>.cloudflare.com/cdn-cgi/trace or similar
}
```

### 2. Worker Endpoint Changes

- **`/api/map/probes`**: Return `CF_POPS` catalog + relay latencies + user colo/lat/lon
- **`/api/map/ping`**: Already returns `x-colo` header — keep as-is
- **`/api/ip`**: Already returns `colo` — keep as-is

### 3. Client Changes

#### network-map.ts
- `fetchProbes()`: No structural change, just gets more entries
- `measureClientLatency()`: Ping each PoP via `/api/map/ping?id=<code>&_=<timestamp>`
- `getLatencyColor()/getLatencyDots()`: Keep existing thresholds (they work well)

#### network-map-ui.ts
- Map renders 25-30 markers instead of 5
- Each popup shows PoP code + city + country + latency + relay latency
- Cluster nearby markers at low zoom levels for readability
- Region cards grid shows all PoPs with latency

#### speed-test.ts / speed-ui.ts
- After IP detection, look up `colo` from `/api/ip` response in `cf-pops.ts` to get human-readable PoP name
- Display "Test Server: Frankfurt (FRA)" instead of "Automatic — nearest edge"
- After network map test completes, surface nearest PoP latency alongside speed results

#### cf-pops.ts
- Expand from ~60 entries to ~300+ entries to cover all Cloudflare PoPs
- Keep as a `Record<string, [string, number, number]>` (city, lat, lon) for efficient lookups
- Only the curated 25-30 are probed for latency; the rest are used for display

### 4. i18n
- Add region label i18n keys for the new regions (Middle East, Africa, South America)
- Add `network.pop` key for PoP tooltip format

## Implementation Plan

1. Expand `cf-pops.ts` with full PoP catalog
2. Add `CF_POPS` probe array to worker with curated 25-30 entries
3. Update `network-map.ts` and `network-map-ui.ts` for denser map
4. Update `speed-ui.ts` to show real PoP name from colo lookup
5. Add i18n keys for new regions
6. Test with `npx tsc --noEmit` and `npx vite build`
7. Deploy

## Out of Scope
- Real speed test download/upload to specific PoPs (uses Cloudflare's anycast routing)
- Clustering/grouping PoPs by region in the UI (future enhancement)
- Historical latency tracking (future enhancement)