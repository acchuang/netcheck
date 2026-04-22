# Network Quality Features Design Spec

**Goal:** Add three network quality features to NetCheck: Connection Quality tab (A), Enhanced Speed metrics (B), and Network Map tab (C).

**Approach:** Build A → B → C. A is self-contained with no new backend. B extends the existing speed tab. C requires a new worker endpoint for regional probes.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, vanilla DOM, no new dependencies.

---

## Feature A: Connection Quality Tab

### Data Sources

| Metric | Source | Notes |
|---|---|---|
| Connection type, effective type, downlink estimate, RTT estimate, data saver | `navigator.connection` (Network Information API) | Not available in Safari/Firefox. Graceful fallback to "Not available". |
| DNS time, TCP connect, TLS handshake, TTFB, content download, total | `PerformanceResourceTiming` on speed test ping request | Collected after speed test or standalone fetch to `/api/speedtest/ping`. |
| TLS version, cipher, HTTP protocol, server TCP RTT | `/api/ip` response | Already returned by `handleIpCheck`. |
| Connection stability: min/max/mean/stddev/jitter/packet loss | 30 sustained pings to `/api/speedtest/ping` | New client-side measurement. |

### UI Layout

A new `<section id="quality">` tab with:

1. **Quality Score Ring** (left card) — Composite A+–F grade based on:
   - TLS: 1.3 = pass, 1.2 = warn, older = fail
   - Server RTT: <50ms pass, <100ms warn, else fail
   - Connection type: 4g/wifi pass, 3g warn, 2g/slow-2g fail
   - Stability (stddev of 30 pings): <3ms pass, <10ms warn, else fail

2. **Connection Type Card** — Browser-reported type, effective type, downlink estimate (Mbps), RTT estimate (ms), data saver status.

3. **TLS Details Card** — Version, cipher, HTTP protocol displayed from `/api/ip`.

4. **Timing Breakdown Card** — Horizontal stacked bar showing DNS, TCP, TLS, TTFB, download phases from `PerformanceResourceTiming`.

5. **Stability Card** — [Run Stability Test] button triggers 30 seconds of sustained pings, showing min/max/mean/stddev/jitter/loss %.

### Types

```ts
interface ConnectionQualityResults {
  score: QualityScore;
  connectionInfo: ConnectionInfo | null;
  tlsInfo: TlsInfo | null;
  timing: ResourceTimingBreakdown | null;
  stability: StabilityResults | null;
}

interface QualityScore {
  grade: string;
  label: string;
  factors: {
    tls: "pass" | "warn" | "fail";
    serverRtt: "pass" | "warn" | "fail";
    connectionType: "pass" | "warn" | "fail" | "unavailable";
    stability: "pass" | "warn" | "fail" | "unavailable";
  };
}

interface ConnectionInfo {
  type: string | null;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  dataSaver: boolean;
}

interface TlsInfo {
  version: string | null;
  cipher: string | null;
  httpProtocol: string | null;
  serverTcpRtt: number | null;
}

interface ResourceTimingBreakdown {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

interface StabilityResults {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  jitter: number;
  sent: number;
  received: number;
  lossPercent: number;
}
```

### File Changes

| File | Action | Purpose |
|---|---|---|
| `src/client/connection-quality.ts` | Create | Core logic: fetch IP info, measure timing, run stability test |
| `src/client/connection-quality-ui.ts` | Create | UI rendering |
| `index.html` | Modify | Add `<section id="quality">` and nav link |
| `src/client/i18n.ts` | Modify | Add `quality.*` i18n keys |
| `public/css/styles.css` | Modify | Add quality section styles |
| `src/client/app.ts` | Modify | Import and init |

---

## Feature B: Enhanced Speed Tab

### Additions to existing Speed tab

1. **Resource Timing row** — After speed test completes, collect `PerformanceResourceTiming` entries for download/upload fetches. Show as a collapsible "Request Timing" section with horizontal bars (DNS, TCP, TLS, TTFB, Download).

2. **`navigator.connection` badge** — Small inline badge next to the server badge showing effective connection type (e.g. "4G") and estimated downlink when available.

3. **Stability readout** — Below bufferbloat gauge, show "Avg RTT: Xms · Jitter: Xms" as a subtle subtitle, computed from the 20 latency pings already measured.

### File Changes

| File | Action | Purpose |
|---|---|---|
| `src/client/speed-test.ts` | Modify | Add `timingBreakdown: ResourceTimingBreakdown | null` to `SpeedTestResults`; collect timing after test |
| `src/client/speed-ui.ts` | Modify | Render timing breakdown, connection badge, stability readout |
| `index.html` | Modify | Add timing breakdown container + connection badge elements |
| `src/client/i18n.ts` | Modify | Add `speed.timing.*` and `speed.connection.*` i18n keys |
| `public/css/styles.css` | Modify | Add timing breakdown bar styles, connection badge styles |

### Key Design Decisions

- `ResourceTimingBreakdown` is added to `SpeedTestResults` so the history module can persist it
- The timing data is collected from `performance.getEntriesByName()` after the speed test finishes, looking for entries matching the download/upload URLs
- `navigator.connection` info is collected once at test start and displayed in a small badge
- The stability subtitle uses the 20 pings already collected during the latency phase (no extra requests)

---

## Feature C: Network Map Tab

### Architecture

Add two new worker endpoints:

1. **`/api/map/probes`** — Returns list of regional probe targets with the user's colo/lat/lon
2. **`/api/map/ping?region=X`** — Returns "pong" with timing headers; the worker routes through different Cloudflare PoPs via regional origin URLs

Actually, since Cloudflare anycast means all requests go to the same PoP, we can't force regional routing. Instead, we use **public anycast DNS resolvers** as probe targets — measuring latency to 1.1.1.1, 8.8.8.8, 9.9.9.9, etc. gives us real-world latency to different networks. Additionally, we can use the `x-colo` header to confirm which PoP handled each request.

**Simplified approach:** Measure TTFB to multiple well-known HTTPS endpoints across regions. Each represents a different network vantage point. The user's own PoP gives us their "home" region.

### Probes

```ts
const PROBES = [
  { id: "cf-na", name: "Cloudflare NA", url: "https://1.1.1.1/cdn-cgi/trace", region: "North America", city: "San Francisco" },
  { id: "cf-eu", name: "Cloudflare EU", url: "https://1.0.0.1/cdn-cgi/trace", region: "Europe", city: "London" },
  { id: "cf-ap", name: "Cloudflare AP", url: "https://one.one.one.one/cdn-cgi/trace", region: "Asia Pacific", city: "Tokyo" },
  { id: "google", name: "Google DNS", url: "https://dns.google/resolve?name=example.com&type=A", region: "Global CDN", city: "Various" },
  { id: "quad9", name: "Quad9 DNS", url: "https://dns.quad9.net:5053/dns-query?name=example.com&type=A", region: "Switzerland", city: "Zurich" },
];
```

Wait — these all go through the same Cloudflare PoP since the user's traffic is anycast. The TTFB to each reflects only network path differences to the origin, not regional distance.

**Better approach:** Use the worker itself as a relay. The worker can `fetch()` to regional endpoints and measure server-side latency, then return those measurements alongside the client's direct latency to the worker.

**Final approach:**

1. Client pings `/api/speedtest/ping` (existing) — measures direct latency to nearest CF PoP
2. Client calls `/api/map/probes` — worker fetches from regional CF PoPs (by hitting different `https://<cloudflare-managed-domain>/cdn-cgi/trace` endpoints) and measures server-side latency
3. Worker returns both the probe list AND worker-measured latencies
4. Client measures its own TTFB to each probe target directly

This gives **two perspectives**: client→CF-PoP (direct) and CF-PoP→region (server-side relay), plus client→region (direct with DNS resolution included).

### Worker Endpoints

```
GET /api/map/probes
Response: {
  userColo: string,
  userLat: number | null,
  userLon: number | null,
  clientLatencies: { [probeId]: number },  // client→probe TTFB measured client-side
  relayLatencies: { [probeId]: number }    // worker→probe RTT measured server-side
}
```

Each probe entry also gets a `/api/map/ping?id=X` endpoint that returns headers with `x-colo` for verification.

### UI Layout

```
┌─────────────────────────────────────────────┐
│  Network Map                                 │
│  Measure latency to global regions           │
├─────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ NA      │ │ EU      │ │ AP      │        │
│  │ 24ms    │ │ 128ms   │ │ 186ms   │        │
│  │ ●●●●○  │ │ ●●●○○  │ │ ●●○○○  │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ SA      │ │ AF      │ │ OC      │        │
│  │ 152ms   │ │ 210ms   │ │ 198ms   │        │
│  │ ●●○○○  │ │ ●○○○○  │ │ ●○○○○  │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│  [Run Test]                                  │
│                                              │
│  Your PoP: SJC · Closest: NA (24ms)          │
└─────────────────────────────────────────────┘
```

Cards show region name, latency in ms, and a 5-dot quality indicator (●●●●○ = 4/5 dots filled). Color-coded: green <50ms, yellow <150ms, orange <300ms, red >300ms.

### Types

```ts
interface ProbeDef {
  id: string;
  name: string;
  region: string;
  city: string;
  targetUrl: string;
}

interface ProbeResult {
  id: string;
  latency: number | null;       // client-side TTFB
  relayLatency: number | null;  // server-side RTT
  colo: string | null;
}

interface MapResults {
  userColo: string;
  userLat: number | null;
  userLon: number | null;
  probes: ProbeResult[];
}
```

### File Changes

| File | Action | Purpose |
|---|---|---|
| `src/worker/index.ts` | Modify | Add `/api/map/probes` and `/api/map/ping` routes |
| `src/client/network-map.ts` | Create | Core logic: fetch probes, measure latencies |
| `src/client/network-map-ui.ts` | Create | UI rendering |
| `index.html` | Modify | Add `<section id="network">` and nav link |
| `src/client/i18n.ts` | Modify | Add `network.*` i18n keys |
| `public/css/styles.css` | Modify | Add network map styles |
| `src/client/app.ts` | Modify | Import and init |

---

## Build Order

1. **Feature A** — Connection Quality tab (self-contained, no backend changes)
2. **Feature B** — Enhanced Speed tab (extends existing speed module)
3. **Feature C** — Network Map tab (requires new worker endpoints)