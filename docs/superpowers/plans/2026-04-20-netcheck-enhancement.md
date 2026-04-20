# NetCheck Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Architecturally refactor the monolithic app.ts, implement Browser Fingerprint tab, overhaul speed test algorithms, polish UX, and fix accessibility/SEO issues.

**Architecture:** Split app.ts into focused modules (graph, suggestions, history, fingerprint, headers-ui). Speed test gains adaptive chunking, multi-connection downloads, bufferbloat detection, anti-compression data, EWMA smoothing, comprehensive grading, and better ping statistics. New fingerprint tab uses browser APIs (canvas, WebGL, AudioContext, font detection). All changes maintain the existing vanilla TS + Vite + Cloudflare Workers stack.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, vanilla DOM, localStorage, no new dependencies

---

## Priority Order

| Priority | Chunk | Tasks |
|----------|-------|-------|
| **1** | **Speed Test Algorithm Overhaul** | Tasks 6-13 |
| **2** | **Architecture — Modular Split** | Tasks 1-5 |
| **3** | **Browser Fingerprint Tab** | Tasks 14-15 |
| **4** | **UX Polish** | Tasks 16-18 |
| **5** | **Accessibility & SEO** | Tasks 19-21 |

---

## Chunk 1: Speed Test Algorithm Overhaul

### Task 6: Anti-compression data generation (worker-side)

**Files:**
- Modify: `src/worker/index.ts:122-140`

- [ ] **Step 1: Replace sparse data fill with pseudo-random generation**

Replace `handleSpeedDown` function with:

```ts
const RANDOM_BLOCK = new Uint8Array(65536);
crypto.getRandomValues(RANDOM_BLOCK);

function handleSpeedDown(url: URL): Response {
  const bytes = Math.min(parseInt(url.searchParams.get("bytes") || "0", 10), 100000000);
  if (bytes <= 0) {
    return new Response("", { headers: corsHeaders() });
  }
  const data = new Uint8Array(bytes);
  for (let offset = 0; offset < bytes; offset += RANDOM_BLOCK.length) {
    const chunkSize = Math.min(RANDOM_BLOCK.length, bytes - offset);
    data.set(RANDOM_BLOCK.subarray(0, chunkSize), offset);
  }
  return new Response(data, {
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
git commit -m "fix: use pseudo-random download data to prevent compression inflation"
```

---

### Task 7: Anti-compression data generation (client-side upload)

**Files:**
- Modify: `src/client/speed-test.ts:137-141`

- [ ] **Step 1: Replace sparse upload data with incompressible fill**

Add a module-level random block and helper:

```ts
const RANDOM_BLOCK = new Uint8Array(65536);
crypto.getRandomValues(RANDOM_BLOCK);

function fillIncompressible(size: number): Uint8Array {
  const data = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += RANDOM_BLOCK.length) {
    const chunkSize = Math.min(RANDOM_BLOCK.length, size - offset);
    data.set(RANDOM_BLOCK.subarray(0, chunkSize), offset);
  }
  return data;
}
```

Replace the upload loop's data generation:

```ts
// OLD:
const data = new Uint8Array(ulSizes[i]);
for (let j = 0; j < ulSizes[i]; j += 4096)
  data[j] = (Math.random() * 256) | 0;
```

With:

```ts
const data = fillIncompressible(ulSizes[i]);
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "fix: use incompressible upload data to prevent compression inflation"
```

---

### Task 8: Multi-connection download

**Files:**
- Modify: `src/client/speed-test.ts`

- [ ] **Step 1: Add parallel download support**

Add constants and parallel download function:

```ts
const DL_CONNECTIONS = 3;

async function downloadParallel(
  chunkSize: number,
  onBytesDelta: (delta: number) => void
): Promise<number> {
  let totalBytes = 0;
  const promises = Array.from({ length: DL_CONNECTIONS }, async () => {
    let connBytes = 0;
    const url = `/api/speedtest/down?bytes=${chunkSize}&_=${Date.now()}_${Math.random()}`;
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });

    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        connBytes += value.byteLength;
        onBytesDelta(value.byteLength);
      }
    } else {
      const blob = await res.blob();
      connBytes = blob.size;
      onBytesDelta(blob.size);
    }
    return connBytes;
  });

  const results = await Promise.all(promises);
  totalBytes = results.reduce((a, b) => a + b, 0);
  return totalBytes;
}
```

- [ ] **Step 2: Replace the existing download loop in `run()` with parallel calls**

```ts
// Phase 2: Download — adaptive sizing, multi-connection
cb("download", 0, this.results);
let chunkSize = INITIAL_CHUNK;
let dlTotalBytes = 0;
const dlStart = performance.now();
let dlIterations = 0;

while (performance.now() - dlStart < DL_MAX_DURATION && dlIterations < 12) {
  try {
    const bytes = await downloadParallel(chunkSize, (delta) => {
      dlTotalBytes += delta;
      const elapsed = (performance.now() - dlStart) / 1000;
      this.results.download = Math.round(((dlTotalBytes * 8) / (elapsed * 1e6)) * 100) / 100;
      cb("download", Math.min(95, Math.round((elapsed / DL_MAX_DURATION) * 100)), this.results);
    });
    const elapsed = (performance.now() - dlStart) / 1000;
    const throughput = (bytes * 8) / (elapsed * 1e6);
    chunkSize = nextChunkSize(chunkSize, throughput);
    dlIterations++;
  } catch {
    break;
  }
}

const dlElapsed = (performance.now() - dlStart) / 1000;
if (dlElapsed === 0 || dlTotalBytes === 0) this.results.download = null;
cb("download", 100, this.results);
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "feat: multi-connection download for accurate throughput measurement"
```

---

### Task 9: Adaptive chunk sizing + warm-up round

**Files:**
- Modify: `src/client/speed-test.ts`

- [ ] **Step 1: Add adaptive chunk constants and logic**

```ts
const INITIAL_CHUNK = 524288;
const MIN_CHUNK = 262144;
const MAX_CHUNK = 268435456;
const DL_MAX_DURATION = 10000;

function nextChunkSize(currentSize: number, throughputMbps: number): number {
  if (throughputMbps > 100) return Math.min(currentSize * 2, MAX_CHUNK);
  if (throughputMbps > 30) return currentSize;
  if (throughputMbps < 10) return Math.max(currentSize / 2, MIN_CHUNK);
  return currentSize;
}
```

- [ ] **Step 2: Add warm-up function**

```ts
async function warmUp(): Promise<void> {
  try {
    await fetch(`/api/speedtest/down?bytes=102400&_=${Date.now()}`, { cache: "no-store" });
  } catch { /* ignore */ }
}
```

- [ ] **Step 3: Call `await warmUp()` before the download loop**

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "feat: adaptive chunk sizing and warm-up round for speed test"
```

---

### Task 10: EWMA smoothing for real-time display

**Files:**
- Modify: `src/client/speed-test.ts`

- [ ] **Step 1: Add EWMA class**

```ts
class EWMA {
  private value: number | null = null;
  constructor(private alpha: number = 0.3) {}
  update(sample: number): number {
    if (this.value === null) { this.value = sample; }
    else { this.value = this.alpha * sample + (1 - this.alpha) * this.value; }
    return this.value;
  }
  get(): number | null { return this.value; }
  reset(): void { this.value = null; }
}
```

- [ ] **Step 2: Use EWMA in download and upload phases for real-time gauge updates**

During download, compute instant Mbps from each chunk's bytes/time, feed into EWMA, display smoothed value. Final result still uses total bytes / total elapsed.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "feat: EWMA smoothing for real-time speed gauge display"
```

---

### Task 11: Bufferbloat detection

**Files:**
- Modify: `src/client/speed-test.ts`
- Modify: `src/worker/index.ts`
- Modify: `index.html`
- Modify: `src/client/i18n.ts`
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add ping endpoint to worker** (`/api/speedtest/ping` already exists)

No worker changes needed — the existing ping endpoint works.

- [ ] **Step 2: Add bufferbloat fields to SpeedTestResults**

```ts
export interface SpeedTestResults {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  downloadLoadedLatency: number | null;
  uploadLoadedLatency: number | null;
  bufferbloat: number | null;
}
```

- [ ] **Step 3: Add measureLoadedLatency function**

```ts
async function measureLoadedLatency(signal: AbortSignal): Promise<number[]> {
  const rtts: number[] = [];
  while (!signal.aborted) {
    try {
      const t0 = performance.now();
      await fetch(`/api/speedtest/ping?_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(2000) });
      rtts.push(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      if (signal.aborted) break;
    }
  }
  return rtts;
}
```

- [ ] **Step 4: Run loaded latency measurement alongside download and upload**

Launch AbortController, start measureLoadedLatency, run download, then upload, then abort. Compute median loaded RTTs and bufferbloat.

- [ ] **Step 5: Add bufferbloat gauge to HTML + CSS + i18n**

Add 5th gauge, update grid to 5 columns, add responsive breakpoints.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 7: Commit**

```bash
git add src/client/speed-test.ts src/client/i18n.ts index.html public/css/styles.css src/worker/index.ts
git commit -m "feat: bufferbloat detection — measure latency under load"
```

---

### Task 12: 20 pings + outlier trim

**Files:**
- Modify: `src/client/speed-test.ts`

- [ ] **Step 1: Increase pings to 20 with outlier trimming**

Replace 10-ping loop with 20 pings, sort, trim best/worst 2, compute median and jitter from remaining 16.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "feat: 20 pings with outlier trimming for reliable latency/jitter"
```

---

### Task 13: Comprehensive 5-factor grading

**Files:**
- Modify: `src/client/speed-test.ts`
- Modify: `src/client/i18n.ts`
- Modify: `index.html`
- Modify: `public/css/styles.css`

- [ ] **Step 1: Update SpeedGrade interface and getGrade function**

```ts
export interface SpeedGrade {
  grade: string;
  label: string;
  factors: {
    download: "pass" | "warn" | "fail";
    upload: "pass" | "warn" | "fail";
    latency: "pass" | "warn" | "fail";
    jitter: "pass" | "warn" | "fail";
    bufferbloat: "pass" | "warn" | "fail";
  };
}
```

- [ ] **Step 2: Add grade factor breakdown HTML + CSS**

- [ ] **Step 3: Add i18n keys for factors**

- [ ] **Step 4: Update callers of getGrade**

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/client/speed-test.ts src/client/i18n.ts index.html public/css/styles.css
git commit -m "feat: comprehensive grading with 5 factor breakdown"
```

---

## Chunk 2: Architecture — Modular Split

### Task 1: Extract cf-pops.ts
### Task 2: Extract speed-graph.ts
### Task 3: Extract speed-suggestions.ts
### Task 4: Extract headers-ui.ts
### Task 5: Remove window globals hack

(Details in full plan above)

---

## Chunk 3: Browser Fingerprint Tab

### Task 14: Create fingerprint detection module
### Task 15: Add fingerprint tab to HTML/nav/i18n/CSS

(Details in full plan above)

---

## Chunk 4: UX Polish

### Task 16: Expand speed history and add clear UI
### Task 17: Include headers data in export
### Task 18: Debounce headers scan

(Details in full plan above)

---

## Chunk 5: Accessibility & SEO Fixes

### Task 19: Fix PWA manifest icons and service worker cache paths
### Task 20: aria-current, region roles, heading structure
### Task 21: Onboarding hint for first-time visitors

(Details in full plan above)