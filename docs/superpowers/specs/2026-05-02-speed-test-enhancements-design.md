# Speed Test Enhancements — Phase 3

**Date:** 2026-05-02
**Status:** Draft
**Scope:** Speed Test Tab — multi-node comparison + continuous monitoring + history charts

## Overview

NetCheck's speed test currently benchmarks against the single nearest Cloudflare edge. Phase 3 adds multi-node discovery (top 3 regions, benchmark best + compare others), adaptive-pacing monitor mode (5/10/30 minute durations), a history timeline chart replacing the 3-result card view (50 stored entries), per-metric trend indicators, and CSV export of historical data.

No new worker endpoints required — multi-node discovery reuses existing `/api/speedtest/ping` and `/api/map/ping?region=`.

## 1. Multi-Node Auto-Discovery

### 1.1 Flow

```
1. GET /api/speedtest/ping → response: { colo, userLat, userLon }
2. GET /api/map/ping?region=wnam → response: { region, latency }
   Repeat for enam, weur, eeur, apac, oc
3. Sort 6 regions by latency ascending, pick top 3
4. Primary node: run full download/upload/quality benchmark
5. Secondary nodes: ping-test only for latency comparison
6. Server badge shows: "Nearest: SYD (2ms)  |  Also: NRT (85ms), LAX (152ms)"
```

### 1.2 Server Badge Display

Replaces the existing single `Automatic — nearest edge` badge. A compact multi-line format:

```
🟢 Nearest: SYD (2ms)
🟡 Region:   NRT (85ms)
🟡 Region:   LAX (152ms)
```

Colour: green <30ms, amber 30–100ms, red ≥100ms. If fewer than 3 regions respond successfully, show only the available ones (minimum 1). If zero probes succeed, show "Detection failed — retry" and a small retry button.

### 1.3 API Dependencies

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `/api/speedtest/ping` | Get current colo + coords | Existing |
| `/api/map/ping?region=wnam,...` | Measure R2 latency per region | Existing |

No new worker endpoints. All discovery runs on page load before speed test button is clicked.

## 2. Adaptive Pacing Monitor Mode

### 2.1 Pacing Schedule (Per Duration)

**5 minutes (10 tests):**

| Phase | Tests | Interval | Cumulative time |
|-------|-------|----------|-----------------|
| Warmup | 1–3 | 10s | ~20s |
| Stabilisation | 4–7 | 30s | ~140s |
| Steady-state | 8–10 | ~53s | ~300s |

**10 minutes (16 tests):**

| Phase | Tests | Interval | Cumulative time |
|-------|-------|----------|-----------------|
| Warmup | 1–3 | 10s | ~20s |
| Stabilisation | 4–10 | 30s | ~230s |
| Steady-state | 11–16 | ~62s | ~600s |

**30 minutes (25 tests):**

| Phase | Tests | Interval | Cumulative time |
|-------|-------|----------|-----------------|
| Warmup | 1–3 | 10s | ~20s |
| Stabilisation | 4–10 | 30s | ~230s |
| Steady-state | 11–25 | ~105s | ~1800s |

### 2.2 Monitor UI

```
Before: [Run Speed Test] [Monitor for ▼ 5 min]
During: ━━━━━━━━━━━━━━━━━□  Test 8/18 · 4:20 remaining  [Stop]
         Progress bar (brand), test counter, time remaining
```

Dropdown options: 5 min / 10 min / 30 min.

### 2.3 Data Collection

During monitoring, each test result is pushed to the history chart in real-time. The chart live-updates after each test completes.

### 2.4 Client Module

`src/client/speed-monitor.ts`:
```
export const SpeedMonitor = {
  state: { running, duration, testsRemaining },
  async start(durationMin: number, onResult: (r) => void): Promise<void> {},
  stop(): void {},
  getInterval(testIndex: number, durationMin: number): number {},
};
```

## 3. History Timeline Chart

### 3.1 Chart Specification

| Property | Value |
|----------|-------|
| Type | Canvas-based multi-line chart |
| Lines | Download (brand), Upload (status-pass), Latency (status-warn) |
| X-axis | Relative time labels ("30m ago" … "now") |
| Y-axis | Dual scale — left: Mbps (0–max), right: ms (0–max) |
| Data points | 50 stored in localStorage (up from 3) |
| Opacity decay | Oldest points fade to 30% alpha, newest at 100% |
| Hover | Tooltip showing exact value at each point |
| Dimensions | 1100×250px canvas box, responsive to container width |

### 3.2 Data Format

```typescript
interface SpeedHistoryEntry {
  ts: number;           // epoch ms
  download: number;     // Mbps
  upload: number;       // Mbps
  latency: number;      // ms
  jitter: number;       // ms
  bufferbloat: number;  // ms
  colo: string;         // e.g. "SYD"
}
```

### 3.3 Storage

- Key: `netcheck-speed-history` in localStorage
- Max entries: 50 (FIFO — oldest evicted). Each entry stores only: `ts`, `download`, `upload`, `latency`, `jitter`, `bufferbloat`, `colo`
- Migration: on first load, try reading old `netcheck-speed-history` (3-entry format). For each entry, keep only the fields above. Drop `timing`, `connectionInfo`, `avgRtt`, `pingJitter`, `userLat`, `userLon`. Write back in new format.
- If parsing fails, start with empty history (no data migration — clean slate)

### 3.4 Chart States

A single `<canvas id="speed-graph">` renders three states:

| State | Mode | Display |
|-------|------|---------|
| **Idle** | — | Empty canvas with "Run a test to see your speed" placeholder text |
| **Live test** | Real-time streaming | Download/upload lines draw progressively as data arrives (existing behaviour preserved) |
| **History view** | Timeline chart | X-axis = relative time labels. Y-axis = dual scale (left Mbps, right ms). Three lines: download (brand), upload (status-pass), latency (status-warn). Data from localStorage |

**Monitoring:** During monitor mode, the canvas stays in **Live test** mode for each individual test, then switches to **History view** between tests (showing cumulative data so far). After the final test, it stays on History view.

**Responsive sizing:** Canvas uses `width: 100%; height: 250px` via CSS. JS calls `canvas.width = canvas.clientWidth * dpr` on resize via `ResizeObserver`. On narrow viewports (<640px), height drops to 180px.

**Opacity decay:** Linear interpolation by array position. Entry 0 (oldest) → 30% alpha, entry 49 (newest) → 100% alpha. Per-line stroke opacity only — fill stays at 10% for all points.

## 4. Trend Indicators

### 4.1 Computation

After each test, compare latest result to previous result:

```
For each metric m:
  Δ = m_current - m_previous
  For download/upload: positive Δ = improving (↑), negative = degrading (↓)
  For latency/jitter/bufferbloat: negative Δ = improving (↓), positive = degrading (↑)
  Threshold: |Δ| < 2% → stable (→)
```

### 4.2 Display

Below each gauge on the speed test dashboard, add a small trend indicator:

```
Download      Upload        Latency       Jitter
245 Mbps      38 Mbps       12 ms         3 ms
  ↑ 12%         ↓ 5%          → 0%          ↑ 1ms
```

Trend styling: green (improving, `--status-pass`), amber (stable, `--status-warn`), red (degrading, `--status-fail`).

### 4.3 First-run handling

On first test (no previous results), trend indicators show "—" instead of arrows.

## 5. CSV Export

### 5.1 Format

```csv
time,download_mbps,upload_mbps,latency_ms,jitter_ms,bufferbloat_ms,server_colo
2026-05-02T14:30:00Z,245,38,12,3,0,SYD
2026-05-02T14:31:00Z,238,40,14,2,0,SYD
```

### 5.2 Implementation

Client-side Blob generation. Added to Export dropdown as "Download CSV (Speed History)". No worker endpoint needed. Generates from localStorage data.

### 5.3 Empty State

If no history exists, CSV option is greyed out with "(no data)" suffix.

## 6. File Impact

| File | Change | Lines |
|------|--------|-------|
| `src/client/speed-monitor.ts` | **New** — adaptive pacing monitor engine | ~80 |
| `src/client/speed-graph.ts` | **Rewrite** — real-time graph + history chart | ~250 |
| `src/client/history.ts` | **Modify** — expand from 3 to 50, add CSV gen | ~50 |
| `src/client/speed-ui.ts` | **Modify** — trend bars, monitor buttons, CSV export | ~100 |
| `src/client/speed-test.ts` | **No changes** — existing engine reused | — |
| `index.html` | **Modify** — add monitor buttons, server badge rows | ~20 |
| `src/client/i18n.ts` | **Modify** — add ~15 new keys | ~15 |

No worker changes.

## 7. Testing

| Test file | Scope |
|-----------|-------|
| `src/client/__tests__/speed-monitor.test.ts` | Pacing schedule correctness, start/stop lifecycle |
| `src/client/__tests__/speed-graph.test.ts` | Chart data transforms, history migration |
| `src/client/__tests__/speed-history.test.ts` | 50-entry storage, FIFO eviction, CSV generation |
| Existing tests | Unchanged, must still pass |
