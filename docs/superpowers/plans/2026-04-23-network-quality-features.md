# Network Quality Features Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Connection Quality tab, Enhanced Speed metrics, and Network Map tab to NetCheck.

**Architecture:** Feature A is a standalone tab with no backend changes. Feature B extends the existing speed test module. Feature C adds new worker endpoints for regional latency probes. All use vanilla TS + DOM, following established patterns.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, vanilla DOM, localStorage, no new dependencies

---

## Priority Order

| Priority | Chunk | Tasks |
|----------|-------|-------|
| **1** | **Feature A: Connection Quality Tab** | Tasks 1-7 |
| **2** | **Feature B: Enhanced Speed Tab** | Tasks 8-11 |
| **3** | **Feature C: Network Map Tab** | Tasks 12-17 |

---

## Chunk 1: Feature A — Connection Quality Tab

### Task 1: Create connection-quality.ts with core logic

**Files:**
- Create: `src/client/connection-quality.ts`

- [ ] **Step 1: Create the module with all types and detection functions**

```ts
export interface ConnectionInfo {
  type: string | null;
  effectiveType: string | null;
  downlinkMbps: number | null;
  rttMs: number | null;
  dataSaver: boolean;
}

export interface TlsInfo {
  version: string | null;
  cipher: string | null;
  httpProtocol: string | null;
  serverTcpRtt: number | null;
}

export interface ResourceTimingBreakdown {
  dns: number;
  tcp: number;
  tls: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface StabilityResults {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  jitter: number;
  sent: number;
  received: number;
  lossPercent: number;
}

export interface QualityScore {
  grade: string;
  label: string;
  factors: {
    tls: "pass" | "warn" | "fail";
    serverRtt: "pass" | "warn" | "fail";
    connectionType: "pass" | "warn" | "fail" | "unavailable";
    stability: "pass" | "warn" | "fail" | "unavailable";
  };
}

export interface ConnectionQualityResults {
  connectionInfo: ConnectionInfo | null;
  tlsInfo: TlsInfo | null;
  timing: ResourceTimingBreakdown | null;
  stability: StabilityResults | null;
  score: QualityScore;
}

function getConnectionInfo(): ConnectionInfo | null {
  const conn = (navigator as any).connection as {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
  } | undefined;
  if (!conn) return null;
  return {
    type: conn.type ?? null,
    effectiveType: conn.effectiveType ?? null,
    downlinkMbps: conn.downlink ?? null,
    rttMs: conn.rtt ?? null,
    dataSaver: conn.saveData ?? false,
  };
}

async function fetchTlsInfo(): Promise<TlsInfo | null> {
  try {
    const res = await fetch("/api/ip", { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      version: data.tlsVersion ?? null,
      cipher: data.tlsCipher ?? null,
      httpProtocol: data.httpProtocol ?? null,
      serverTcpRtt: data.clientTcpRtt ?? null,
    };
  } catch {
    return null;
  }
}

async function measureTiming(): Promise<ResourceTimingBreakdown | null> {
  try {
    performance.clearResourceTimings();
    const start = performance.now();
    await fetch("/api/speedtest/ping?_=" + Date.now(), { cache: "no-store" });
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const entry = entries.find((e) => e.name.includes("/api/speedtest/ping"));
    if (!entry || entry.startTime < start - 1000) return null;
    return {
      dns: Math.round(entry.domainLookupEnd - entry.domainLookupStart),
      tcp: Math.round(entry.connectEnd - entry.connectStart),
      tls: entry.secureConnectionStart > 0 ? Math.round(entry.connectEnd - entry.secureConnectionStart) : 0,
      ttfb: Math.round(entry.responseStart - entry.requestStart),
      download: Math.round(entry.responseEnd - entry.responseStart),
      total: Math.round(entry.responseEnd - entry.startTime),
    };
  } catch {
    return null;
  }
}

async function runStabilityTest(
  onProgress?: (sent: number, results: number[]) => void
): Promise<StabilityResults> {
  const PING_COUNT = 30;
  const rtts: number[] = [];
  let sent = 0;
  for (let i = 0; i < PING_COUNT; i++) {
    sent++;
    try {
      const start = performance.now();
      await fetch(`/api/speedtest/ping?_=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      rtts.push(performance.now() - start);
    } catch {
      // packet loss
    }
    if (onProgress) onProgress(sent, [...rtts]);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (rtts.length === 0) {
    return { min: 0, max: 0, mean: 0, stddev: 0, jitter: 0, sent: PING_COUNT, received: 0, lossPercent: 100 };
  }
  const sorted = [...rtts].sort((a, b) => a - b);
  const mean = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const variance = rtts.reduce((sum, v) => sum + (v - mean) ** 2, 0) / rtts.length;
  const stddev = Math.sqrt(variance);
  let jitterSum = 0;
  for (let i = 1; i < rtts.length; i++) jitterSum += Math.abs(rtts[i] - rtts[i - 1]);
  const jitter = rtts.length > 1 ? jitterSum / (rtts.length - 1) : 0;
  return {
    min: Math.round(sorted[0] * 10) / 10,
    max: Math.round(sorted[sorted.length - 1] * 10) / 10,
    mean: Math.round(mean * 10) / 10,
    stddev: Math.round(stddev * 10) / 10,
    jitter: Math.round(jitter * 10) / 10,
    sent: PING_COUNT,
    received: rtts.length,
    lossPercent: Math.round(((PING_COUNT - rtts.length) / PING_COUNT) * 100),
  };
}

function computeScore(
  tlsInfo: TlsInfo | null,
  stability: StabilityResults | null,
  connectionInfo: ConnectionInfo | null
): QualityScore {
  let tls: QualityScore["factors"]["tls"] = "fail";
  if (tlsInfo) {
    const v = tlsInfo.version ?? "";
    if (v.includes("1.3")) tls = "pass";
    else if (v.includes("1.2")) tls = "warn";
  }
  let serverRtt: QualityScore["factors"]["serverRtt"] = "fail";
  if (tlsInfo?.serverTcpRtt != null) {
    if (tlsInfo.serverTcpRtt < 50) serverRtt = "pass";
    else if (tlsInfo.serverTcpRtt < 100) serverRtt = "warn";
  }
  let connectionType: QualityScore["factors"]["connectionType"] = "unavailable";
  if (connectionInfo?.effectiveType) {
    const t = connectionInfo.effectiveType;
    if (t === "4g") connectionType = "pass";
    else if (t === "3g") connectionType = "warn";
    else connectionType = "fail";
  }
  let stabilityFactor: QualityScore["factors"]["stability"] = "unavailable";
  if (stability) {
    if (stability.stddev < 3 && stability.lossPercent === 0) stabilityFactor = "pass";
    else if (stability.stddev < 10 && stability.lossPercent < 5) stabilityFactor = "warn";
    else stabilityFactor = "fail";
  }
  const factors = { tls, serverRtt, connectionType, stability: stabilityFactor };
  const passCount = Object.values(factors).filter((v) => v === "pass").length;
  const failCount = Object.values(factors).filter((v) => v === "fail").length;
  const unavailableCount = Object.values(factors).filter((v) => v === "unavailable").length;
  const gradedCount = 4 - unavailableCount;
  let grade: string, label: string;
  if (gradedCount === 0) { grade = "—"; label = "Unknown"; }
  else if (failCount === 0 && passCount === gradedCount) { grade = "A+"; label = "Exceptional"; }
  else if (failCount === 0 && passCount >= gradedCount - 1) { grade = "A"; label = "Excellent"; }
  else if (failCount <= 1 && passCount >= 2) { grade = "B"; label = "Good"; }
  else if (failCount <= 1) { grade = "C+"; label = "Average"; }
  else if (failCount <= 2) { grade = "C"; label = "Below Average"; }
  else if (gradedCount > 0 && failCount >= gradedCount - 1) { grade = "D"; label = "Poor"; }
  else { grade = "F"; label = "Very Poor"; }
  return { grade, label, factors };
}

export const ConnectionQuality = {
  getConnectionInfo,
  fetchTlsInfo,
  measureTiming,
  runStabilityTest,
  computeScore,
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/connection-quality.ts
git commit -m "feat: add ConnectionQuality core logic module"
```

---

### Task 2: Create connection-quality-ui.ts

**Files:**
- Create: `src/client/connection-quality-ui.ts`

- [ ] **Step 1: Create the UI rendering module**

```ts
import { ConnectionQuality, type ConnectionQualityResults, type ConnectionInfo, type TlsInfo, type ResourceTimingBreakdown, type StabilityResults } from "./connection-quality";
import { t } from "./i18n";

export function initConnectionQuality(): void {
  const btn = document.getElementById("quality-run-btn");
  if (btn) btn.addEventListener("click", runQualityTest);
}

async function runQualityTest(): Promise<void> {
  const btn = document.getElementById("quality-run-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = t("quality.running");

  const [connectionInfo, tlsInfo] = await Promise.all([
    Promise.resolve(ConnectionQuality.getConnectionInfo()),
    ConnectionQuality.fetchTlsInfo(),
  ]);

  renderConnectionInfo(connectionInfo);
  renderTlsInfo(tlsInfo);
  renderScorePlaceholder();

  const timing = await ConnectionQuality.measureTiming();
  renderTimingBreakdown(timing);

  btn.textContent = t("quality.runStability");
  btn.disabled = false;

  const stabilityBtn = document.getElementById("quality-stability-btn") as HTMLButtonElement;
  if (stabilityBtn) {
    stabilityBtn.disabled = false;
    stabilityBtn.addEventListener("click", async () => {
      stabilityBtn.disabled = true;
      stabilityBtn.textContent = t("quality.stabilityRunning");
      const stability = await ConnectionQuality.runStabilityTest((sent) => {
        (document.getElementById("stability-progress") as HTMLElement).textContent = `${sent}/30`;
      });
      renderStability(stability);
      renderFinalScore(tlsInfo, stability, connectionInfo);
      stabilityBtn.textContent = t("quality.runStabilityAgain");
      stabilityBtn.disabled = false;
    });
  }

  btn.textContent = t("quality.runAgain");

  // Compute preliminary score without stability
  renderFinalScore(tlsInfo, null, connectionInfo);
}

function renderConnectionInfo(info: ConnectionInfo | null): void {
  const el = document.getElementById("quality-connection-info")!;
  if (!info) {
    el.innerHTML = `<p class="info-muted">${t("quality.connectionUnavailable")}</p>`;
    return;
  }
  const typeMap: Record<string, string> = { wifi: "Wi-Fi", cellular: "Cellular", ethernet: "Ethernet", bluetooth: "Bluetooth", none: "None", unknown: "Unknown" };
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.connType")}</span><span class="info-value">${info.type ? (typeMap[info.type] || info.type) : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.effectiveType")}</span><span class="info-value">${info.effectiveType || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.downlink")}</span><span class="info-value">${info.downlinkMbps !== null ? `${info.downlinkMbps} Mbps` : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.rttEstimate")}</span><span class="info-value">${info.rttMs !== null ? `${info.rttMs} ms` : "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.dataSaver")}</span><span class="info-value">${info.dataSaver ? t("quality.enabled") : t("quality.disabled")}</span></div>
  `;
}

function renderTlsInfo(info: TlsInfo | null): void {
  const el = document.getElementById("quality-tls-info")!;
  if (!info) {
    el.innerHTML = `<p class="info-muted">${t("quality.tlsUnavailable")}</p>`;
    return;
  }
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.tlsVersion")}</span><span class="info-value mono">${info.version || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.cipher")}</span><span class="info-value mono">${info.cipher || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.httpProtocol")}</span><span class="info-value mono">${info.httpProtocol || "—"}</span></div>
    <div class="info-row"><span class="info-label">${t("quality.serverRtt")}</span><span class="info-value">${info.serverTcpRtt !== null ? `${info.serverTcpRtt} ms` : "—"}</span></div>
  `;
}

function renderTimingBreakdown(timing: ResourceTimingBreakdown | null): void {
  const el = document.getElementById("quality-timing-info")!;
  if (!timing || timing.total === 0) {
    el.innerHTML = `<p class="info-muted">${t("quality.timingUnavailable")}</p>`;
    return;
  }
  const phases = [
    { key: "dns", label: t("quality.dnsTiming"), value: timing.dns, color: "var(--brand)" },
    { key: "tcp", label: t("quality.tcpTiming"), value: timing.tcp, color: "var(--emerald)" },
    { key: "tls", label: t("quality.tlsTiming"), value: timing.tls, color: "var(--accent)" },
    { key: "ttfb", label: t("quality.ttfbTiming"), value: timing.ttfb, color: "var(--amber)" },
    { key: "download", label: t("quality.downloadTiming"), value: timing.download, color: "var(--text-tertiary)" },
  ];
  const total = timing.total;
  el.innerHTML = phases.map((p) => {
    const pct = total > 0 ? Math.max(2, (p.value / total) * 100) : 0;
    return `
      <div class="timing-row">
        <span class="timing-label">${p.label}</span>
        <div class="timing-bar-container">
          <div class="timing-bar" style="width:${pct}%;background:${p.color}"></div>
        </div>
        <span class="timing-value mono">${p.value}ms</span>
      </div>`;
  }).join("");
}

function renderStability(stability: StabilityResults): void {
  const el = document.getElementById("quality-stability-info")!;
  el.innerHTML = `
    <div class="info-row"><span class="info-label">${t("quality.min")}</span><span class="info-value mono">${stability.min}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.max")}</span><span class="info-value mono">${stability.max}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.mean")}</span><span class="info-value mono">${stability.mean}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.stddev")}</span><span class="info-value mono">${stability.stddev}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.jitter")}</span><span class="info-value mono">${stability.jitter}ms</span></div>
    <div class="info-row"><span class="info-label">${t("quality.packetLoss")}</span><span class="info-value mono">${stability.lossPercent}%</span></div>
  `;
}

function renderScorePlaceholder(): void {
  const el = document.getElementById("quality-grade")!;
  el.textContent = "—";
}

function renderFinalScore(tlsInfo: TlsInfo | null, stability: StabilityResults | null, connectionInfo: ConnectionInfo | null): void {
  const score = ConnectionQuality.computeScore(tlsInfo, stability, connectionInfo);
  const gradeEl = document.getElementById("quality-grade")!;
  gradeEl.textContent = score.grade;
  gradeEl.classList.add("grade-reveal");
  setTimeout(() => gradeEl.classList.remove("grade-reveal"), 400);

  (document.getElementById("quality-grade-label") as HTMLElement).textContent = t(`quality.grade.${score.label}`) || score.label;

  const factorsEl = document.getElementById("quality-factors")!;
  const factorKeys: { key: keyof typeof score.factors; label: string }[] = [
    { key: "tls", label: t("quality.tlsFactor") },
    { key: "serverRtt", label: t("quality.serverRttFactor") },
    { key: "connectionType", label: t("quality.connTypeFactor") },
    { key: "stability", label: t("quality.stabilityFactor") },
  ];
  factorsEl.innerHTML = factorKeys.map((f) => {
    const status = score.factors[f.key];
    const label = status === "unavailable" ? "—" : status;
    return `<span class="grade-factor"><span class="grade-factor-dot ${status === "unavailable" ? "" : status}"></span>${f.label}</span>`;
  }).join("");
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/connection-quality-ui.ts
git commit -m "feat: add ConnectionQuality UI rendering module"
```

---

### Task 3: Add i18n keys for Connection Quality

**Files:**
- Modify: `src/client/i18n.ts`

- [ ] **Step 1: Add English keys after `onboarding.text`**

Add after `"onboarding.text"` in the `en` object:

```ts
  // Connection Quality
  "quality.title": "Connection Quality",
  "quality.subtitle": "Analyze your network connection, TLS security, and stability",
  "quality.runTest": "Run Test",
  "quality.running": "Testing...",
  "quality.runAgain": "Run Again",
  "quality.runStability": "Test Stability",
  "quality.runStabilityAgain": "Test Again",
  "quality.stabilityRunning": "Pinging...",
  "quality.connectionTitle": "Connection Type",
  "quality.tlsTitle": "TLS Details",
  "quality.timingTitle": "Request Timing",
  "quality.stabilityTitle": "Connection Stability",
  "quality.scoreTitle": "Quality Score",
  "quality.connType": "Type",
  "quality.effectiveType": "Effective Type",
  "quality.downlink": "Downlink Estimate",
  "quality.rttEstimate": "RTT Estimate",
  "quality.dataSaver": "Data Saver",
  "quality.enabled": "Enabled",
  "quality.disabled": "Disabled",
  "quality.connectionUnavailable": "Connection info not available in this browser",
  "quality.tlsUnavailable": "TLS info not available",
  "quality.timingUnavailable": "Timing data not available",
  "quality.tlsVersion": "TLS Version",
  "quality.cipher": "Cipher Suite",
  "quality.httpProtocol": "HTTP Protocol",
  "quality.serverRtt": "Server TCP RTT",
  "quality.dnsTiming": "DNS Lookup",
  "quality.tcpTiming": "TCP Connect",
  "quality.tlsTiming": "TLS Handshake",
  "quality.ttfbTiming": "TTFB",
  "quality.downloadTiming": "Content Download",
  "quality.min": "Min",
  "quality.max": "Max",
  "quality.mean": "Mean",
  "quality.stddev": "Std Dev",
  "quality.jitter": "Jitter",
  "quality.packetLoss": "Packet Loss",
  "quality.tlsFactor": "TLS",
  "quality.serverRttFactor": "Server RTT",
  "quality.connTypeFactor": "Connection",
  "quality.stabilityFactor": "Stability",
  "quality.grade.Exceptional": "Exceptional",
  "quality.grade.Excellent": "Excellent",
  "quality.grade.Good": "Good",
  "quality.grade.Average": "Average",
  "quality.grade.Below Average": "Below Average",
  "quality.grade.Poor": "Poor",
  "quality.grade.Very Poor": "Very Poor",
  "quality.grade.Unknown": "Unknown",
  "nav.quality": "Quality",
```

- [ ] **Step 2: Add Chinese keys in the `zhTW` object**

Add corresponding zh-TW translations after the onboarding key.

- [ ] **Step 3: Add static translations in `applyStaticTranslations()`**

Add the `quality` tab to the nav link translation loop and add `s()` calls for all quality section IDs.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/client/i18n.ts
git commit -m "feat: add i18n keys for Connection Quality tab"
```

---

### Task 4: Add Connection Quality HTML section and nav link

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add nav link after the Fingerprint link**

```html
<a href="#quality" class="nav-link" data-tab="quality">
  <svg class="nav-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
  <span class="nav-link-text" id="nav-quality-text">Quality</span>
</a>
```

- [ ] **Step 2: Add the quality section after the fingerprint section**

The section should contain:
- Section header (title + subtitle)
- Two-column card grid: Quality Score ring (left) + Connection Type card (right)
- Second row: TLS Details card + Request Timing card
- Third row: Stability card with run button
- Each card uses existing `.card`, `.card-header`, `.card-body`, `.info-row` CSS classes

- [ ] **Step 3: Verify build**

Run: `npx vite build`

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add Connection Quality tab HTML section and nav link"
```

---

### Task 5: Add Connection Quality CSS styles

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add timing breakdown bar styles**

```css
/* Timing breakdown */
.timing-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
}
.timing-label {
  font-size: 13px;
  color: var(--text-tertiary);
  min-width: 110px;
}
.timing-bar-container {
  flex: 1;
  height: 8px;
  background: var(--bg-surface);
  border-radius: 4px;
  overflow: hidden;
}
.timing-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease-out;
  min-width: 2px;
}
.timing-value {
  font-size: 13px;
  color: var(--text-primary);
  min-width: 50px;
  text-align: right;
}
```

- [ ] **Step 2: Add stability test styles**

```css
.stability-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add Connection Quality CSS styles"
```

---

### Task 6: Wire up Connection Quality in app.ts

**Files:**
- Modify: `src/client/app.ts`

- [ ] **Step 1: Add import and init call**

```ts
import { initConnectionQuality } from "./connection-quality-ui";
```

Add `initConnectionQuality()` after `initFingerprint()` in the DOMContentLoaded handler.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 3: Commit**

```bash
git add src/client/app.ts
git commit -m "feat: wire up Connection Quality tab in app.ts"
```

---

### Task 7: Integration test — verify Feature A works end-to-end

- [ ] **Step 1: Run `npx wrangler dev` and manually test the Quality tab in the browser**

Verify:
- Quality tab appears in nav and shows the section when clicked
- Running the test fetches IP info and shows TLS/connection details
- Timing breakdown shows bars
- Stability test runs 30 pings and shows results
- Quality score computes and displays grade with factor dots
- All i18n strings render correctly in both en and zh-TW
- Skip link, theme toggle, and other tabs still work

- [ ] **Step 2: Final commit**

```bash
git commit --allow-empty -m "test: verify Feature A (Connection Quality) works end-to-end"
```

---

## Chunk 2: Feature B — Enhanced Speed Tab

### Task 8: Add ResourceTimingBreakdown to SpeedTestResults

**Files:**
- Modify: `src/client/speed-test.ts`

- [ ] **Step 1: Add the type and collection logic**

Add `ResourceTimingBreakdown` import/types (can reuse from connection-quality or define a shared type). Add `timing: ResourceTimingBreakdown | null` to `SpeedTestResults`. After speed test completes, call `measureTiming()` to collect the breakdown.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/speed-test.ts
git commit -m "feat: add resource timing breakdown to SpeedTestResults"
```

---

### Task 9: Add timing breakdown, connection badge, and stability readout to speed UI

**Files:**
- Modify: `src/client/speed-ui.ts`
- Modify: `index.html`
- Modify: `src/client/i18n.ts`
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add HTML containers for timing breakdown and connection badge in the speed section**

After the speed graph card, add a collapsible timing breakdown section and a small connection info badge.

- [ ] **Step 2: Add `navigator.connection` info collection and rendering**

After speed test completes, read `navigator.connection` and display a small badge near the server badge.

- [ ] **Step 3: Add timing breakdown rendering**

After speed test, call `speedResult.timing` and render horizontal bars.

- [ ] **Step 4: Add stability readout below bufferbloat**

Show "Avg: Xms · Jitter: Xms · Loss: 0%" under the bufferbloat gauge.

- [ ] **Step 5: Add i18n keys**

`speed.timing.*`, `speed.connection.*`, `speed.stability.*`

- [ ] **Step 6: Add CSS for timing bars and connection badge**

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 8: Commit**

```bash
git add src/client/speed-ui.ts index.html src/client/i18n.ts public/css/styles.css
git commit -m "feat: add timing breakdown, connection badge, and stability readout to speed tab"
```

---

### Task 10: Persist timing data in speed history

**Files:**
- Modify: `src/client/history.ts`

- [ ] **Step 1: Add `timing` field to the saved history entry interface**

Update `SpeedTestHistory` to optionally save `ResourceTimingBreakdown`.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/history.ts
git commit -m "feat: persist resource timing in speed test history"
```

---

### Task 11: Integration test — verify Feature B

- [ ] **Step 1: Manual testing**

Verify:
- Speed test shows connection info badge when `navigator.connection` is available
- Timing breakdown shows bars after test
- Stability readout shows avg/jitter below bufferbloat
- Existing speed test still works correctly
- History entries load correctly

- [ ] **Step 2: Commit**

```bash
git commit --allow-empty -m "test: verify Feature B (Enhanced Speed) works end-to-end"
```

---

## Chunk 3: Feature C — Network Map Tab

### Task 12: Add worker endpoints for regional probes

**Files:**
- Modify: `src/worker/index.ts`

- [ ] **Step 1: Add `/api/map/probes` and `/api/map/ping` routes**

Add a `PROBES` array defining regional endpoints. The `/api/map/probes` handler measures server-side latency to each target and returns both the probe list and relay latencies. The `/api/map/ping?id=X` handler returns a simple pong with `x-colo` header for client-side measurement.

```ts
const PROBES = [
  { id: "cf-na", name: "Cloudflare NA", url: "https://1.1.1.1/cdn-cgi/trace", region: "North America", city: "Multiple" },
  { id: "cf-eu", name: "Cloudflare EU", url: "https://one.one.one.one/cdn-cgi/trace", region: "Europe", city: "Multiple" },
  { id: "google-dns", name: "Google DNS", url: "https://dns.google/resolve?name=example.com&type=A", region: "Global", city: "Multiple" },
  { id: "quad9", name: "Quad9 DNS", url: "https://dns.quad9.net:5053/dns-query?name=example.com&type=A", region: "Switzerland", city: "Zurich" },
  { id: "adguard", name: "AdGuard DNS", url: "https://dns.adguard-dns.com/resolve?name=example.com&type=A", region: "Cyprus", city: "Limassol" },
];

async function handleMapProbes(request: Request): Promise<Response> {
  const cf = getCf(request);
  const userColo = cf.colo || "unknown";
  const userLat = cf.latitude ? parseFloat(cf.latitude) : null;
  const userLon = cf.longitude ? parseFloat(cf.longitude) : null;

  // Measure server-side relay latency to each probe
  const relayLatencies: Record<string, number | null> = {};
  await Promise.all(PROBES.map(async (probe) => {
    try {
      const start = Date.now();
      await fetch(probe.url, { method: "GET", signal: AbortSignal.timeout(5000) });
      relayLatencies[probe.id] = Date.now() - start;
    } catch {
      relayLatencies[probe.id] = null;
    }
  }));

  return Response.json({
    userColo,
    userLat,
    userLon,
    probes: PROBES.map((p) => ({ id: p.id, name: p.name, region: p.region, city: p.city })),
    relayLatencies,
  }, { headers: corsHeaders() });
}

// In the main fetch handler, add:
if (url.pathname === "/api/map/probes") return handleMapProbes(request);
if (url.pathname === "/api/map/ping") {
  return new Response("pong", {
    headers: { ...corsHeaders(), "x-colo": cf.colo || "unknown" },
  });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/worker/index.ts
git commit -m "feat: add /api/map/probes and /api/map/ping worker endpoints"
```

---

### Task 13: Create network-map.ts with core logic

**Files:**
- Create: `src/client/network-map.ts`

- [ ] **Step 1: Create the module**

```ts
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

    // Merge relay latencies from server
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
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/network-map.ts
git commit -m "feat: add NetworkMap core logic module"
```

---

### Task 14: Create network-map-ui.ts

**Files:**
- Create: `src/client/network-map-ui.ts`

- [ ] **Step 1: Create the UI module**

Render a grid of region cards with latency, quality dots, and color coding. Show "Run Test" button, progress state, and closest region indicator.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/client/network-map-ui.ts
git commit -m "feat: add NetworkMap UI rendering module"
```

---

### Task 15: Add i18n keys for Network Map

**Files:**
- Modify: `src/client/i18n.ts`

- [ ] **Step 1: Add `network.*` keys for both en and zh-TW**

```ts
"network.title": "Network Map",
"network.subtitle": "Measure latency to global regions",
"network.runTest": "Run Test",
"network.running": "Testing...",
"network.runAgain": "Run Again",
"network.closestRegion": "Closest region",
"network.noResults": "No results yet",
"network.relayLatency": "Server relay",
"network.directLatency": "Direct",
"network.latency": "Latency",
"nav.network": "Network",
```

- [ ] **Step 2: Add nav translation in static translations**

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/i18n.ts
git commit -m "feat: add i18n keys for Network Map tab"
```

---

### Task 16: Add Network Map HTML and CSS

**Files:**
- Modify: `index.html`
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add nav link and section HTML**

Add nav link with globe icon. Add `<section id="network">` with region card grid, run button, and results container.

- [ ] **Step 2: Add region card CSS styles**

```css
.region-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.region-card {
  background: var(--surface-gradient);
  border: var(--surface-border);
  border-radius: var(--radius-xl);
  padding: 20px;
  text-align: center;
  box-shadow: var(--surface-shadow);
  transition: border-color 0.2s, box-shadow 0.25s, transform 0.25s;
}

.region-card:hover {
  border-color: var(--hover-border);
  box-shadow: var(--surface-shadow-hover);
  transform: translateY(-1px);
}

.region-latency {
  font-size: 36px;
  font-weight: 620;
  letter-spacing: -1px;
  line-height: 1.1;
  margin: 8px 0;
}

.region-unit {
  font-size: 14px;
  font-weight: 510;
  color: var(--text-tertiary);
}

.region-dots {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-top: 8px;
}

.region-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-elevated);
}

.region-dot.active {
  background: currentColor;
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx vite build`

- [ ] **Step 4: Commit**

```bash
git add index.html public/css/styles.css
git commit -m "feat: add Network Map tab HTML section and CSS styles"
```

---

### Task 17: Wire up Network Map and integration test

**Files:**
- Modify: `src/client/app.ts`

- [ ] **Step 1: Add import and init call**

```ts
import { initNetworkMap } from "./network-map-ui";
```

Add `initNetworkMap()` in the DOMContentLoaded handler.

- [ ] **Step 2: Test end-to-end**

Run `npx wrangler dev` and verify:
- Network tab appears and shows when clicked
- "Run Test" triggers probe measurement
- Region cards show latencies with colored dots
- Closest region is highlighted
- i18n works for both languages
- All existing tabs still work

- [ ] **Step 3: Final commit**

```bash
git add src/client/app.ts
git commit -m "feat: wire up Network Map tab in app.ts"
```

---

## Verification

After all chunks are complete:
1. Run `npx tsc --noEmit` — zero errors
2. Run `npx vite build` — successful build
3. Run `npx wrangler dev` — all tabs work, no console errors
4. Test all three features in browser
5. Test en/zh-TW locale toggle
6. Test on mobile viewport