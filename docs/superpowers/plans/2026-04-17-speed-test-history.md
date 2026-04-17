# Speed Test History Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the last two speed test results as compact metric cards below the current speed test on the Speed Test page, stored in localStorage.

**Architecture:** New `history.ts` module handles localStorage persistence (save/load/clear). `app.ts` handles rendering via `renderSpeedHistory()`, called on page load and after each test. HTML container added inside `.speed-dashboard`, CSS follows existing card patterns.

**Tech Stack:** TypeScript, vanilla DOM, localStorage, existing i18n system

**Spec:** `docs/superpowers/specs/2026-04-17-speed-test-history-design.md`

---

## Chunk 1: Data Layer + i18n + HTML

### Task 1: Create history.ts module

**Files:**
- Create: `src/client/history.ts`

- [ ] **Step 1: Write the history module**

```ts
import type { SpeedTestResults } from "./speed-test";

export interface SpeedTestHistoryEntry {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  userLat: number | null;
  userLon: number | null;
  timestamp: number;
}

const STORAGE_KEY = "netcheck-speed-history";
const MAX_ENTRIES = 2;

export const SpeedTestHistory = {
  save(result: SpeedTestResults): void {
    const entry: SpeedTestHistoryEntry = {
      download: result.download,
      upload: result.upload,
      latency: result.latency,
      jitter: result.jitter,
      colo: result.colo,
      userLat: result.userLat,
      userLon: result.userLon,
      timestamp: Date.now(),
    };
    const entries = this.load();
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      /* storage full or unavailable */
    }
  },

  load(): SpeedTestHistoryEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  },
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/client/history.ts
git commit -m "feat: add SpeedTestHistory localStorage module"
```

---

### Task 2: Add i18n keys

**Files:**
- Modify: `src/client/i18n.ts`

- [ ] **Step 1: Add English i18n keys after the existing speed keys**

After the line containing `"speed.grade.unknown"` (around line 170), add:

```ts
  // Speed history
  "speed.history.title": "History",
  "speed.history.empty": "No previous tests recorded",
  "speed.history.justNow": "just now",
  "speed.history.minAgo": "{0} min ago",
  "speed.history.hrAgo": "{0} hr ago",
```

- [ ] **Step 2: Add zh-TW i18n keys after the existing speed keys**

Find the zh-TW locale block and after the line containing the zh-TW equivalent of speed grade keys, add:

```ts
  "speed.history.title": "歷史記錄",
  "speed.history.empty": "尚無歷史記錄",
  "speed.history.justNow": "剛才",
  "speed.history.minAgo": "{0} 分鐘前",
  "speed.history.hrAgo": "{0} 小時前",
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/client/i18n.ts
git commit -m "feat: add speed history i18n keys (en + zh-TW)"
```

---

### Task 3: Add HTML container

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the history container inside `.speed-dashboard`**

Between the closing `</div>` of the speed-graph-card (line 308) and the `<div class="suggestions-section"` (line 311), insert:

```html
        <!-- Speed History -->
        <div id="speed-history" class="speed-history">
          <h2 class="speed-history-title" id="speed-history-title">History</h2>
          <p class="speed-history-empty" id="speed-history-empty">No previous tests recorded</p>
          <div class="speed-history-cards" id="speed-history-cards"></div>
        </div>

```

- [ ] **Step 2: Verify page loads without errors**

Run: `npx vite build` (or just check the HTML is well-formed)

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add speed history HTML container"
```

---

## Chunk 2: Rendering + CSS + Integration

### Task 4: Add CSS styles for history cards

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add history styles after the speed-graph-card styles (after line ~1620)**

Find the end of the speed-graph-card section. After it, add:

```css
/* Speed History */
.speed-history {
  margin-top: 24px;
  display: none;
}

.speed-history.visible {
  display: block;
  animation: fade-in 0.3s ease-out;
}

.speed-history-title {
  font-size: 20px;
  font-weight: 590;
  color: var(--text-primary);
  letter-spacing: -0.24px;
  margin-bottom: 6px;
}

.speed-history-empty {
  font-size: 14px;
  color: var(--text-tertiary);
}

.speed-history-cards {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.speed-history-card {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--border-standard);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.speed-history-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.speed-history-card-time {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 510;
}

.speed-history-card-grade {
  font-size: 15px;
  font-weight: 590;
  padding: 2px 10px;
  border-radius: 6px;
  background: var(--bg-elevated);
  color: var(--text-secondary);
}

.speed-history-card-server {
  font-size: 12px;
  color: var(--text-quaternary);
}

.speed-history-card-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.speed-history-card-metric {
  text-align: center;
}

.speed-history-card-metric-value {
  font-size: 18px;
  font-weight: 510;
  color: var(--text-primary);
  letter-spacing: -0.5px;
  font-family: "Inter Variable", "Inter", sans-serif;
  font-feature-settings: "cv01", "ss03", "tnum";
}

.speed-history-card-metric-label {
  font-size: 11px;
  font-weight: 510;
  color: var(--text-quaternary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}

.speed-history-card-metric.download .speed-history-card-metric-value { color: var(--accent); }
.speed-history-card-metric.upload .speed-history-card-metric-value { color: var(--emerald); }
.speed-history-card-metric.latency .speed-history-card-metric-value { color: var(--amber); }
.speed-history-card-metric.jitter .speed-history-card-metric-value { color: var(--text-secondary); }
```

- [ ] **Step 2: Add responsive styles**

In the mobile breakpoint section (find `@media (max-width: 640px)`), add inside that block:

```css
  .speed-history-cards {
    flex-direction: column;
  }
```

And in the tablet/small-desktop breakpoint if there is one (e.g. `@media (max-width: 768px)`), add:

```css
  .speed-history-card-metrics {
    grid-template-columns: repeat(2, 1fr);
  }
```

- [ ] **Step 3: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add speed history card CSS styles"
```

---

### Task 5: Add renderSpeedHistory() and integrate into app.ts

**Files:**
- Modify: `src/client/app.ts`

- [ ] **Step 1: Add import for SpeedTestHistory at the top**

In the import block at the top of `app.ts` (around line 4), add after the existing `speed-test` import:

```ts
import { SpeedTestHistory } from "./history";
```

- [ ] **Step 2: Hoist gradeKeys to module scope and add the renderSpeedHistory function**

First, extract the `gradeKeys` map from `runSpeedTest()` (~line 762-767) to module scope. Find and cut:

```ts
const gradeKeys: Record<string, string> = {
    "Exceptional": "speed.grade.exceptional", "Excellent": "speed.grade.excellent",
    "Very Good": "speed.grade.veryGood", "Good": "speed.grade.good",
    "Average": "speed.grade.average", "Below Average": "speed.grade.belowAvg",
    "Slow": "speed.grade.slow", "Unknown": "speed.grade.unknown",
  };
```

Paste it at module scope (near the top of app.ts, after the existing module-level constants like `speedGraphData`), without the `const` toplevel — just make it a regular `const` at module level:

```ts
const gradeKeys: Record<string, string> = {
  "Exceptional": "speed.grade.exceptional", "Excellent": "speed.grade.excellent",
  "Very Good": "speed.grade.veryGood", "Good": "speed.grade.good",
  "Average": "speed.grade.average", "Below Average": "speed.grade.belowAvg",
  "Slow": "speed.grade.slow", "Unknown": "speed.grade.unknown",
};
```

Then in `runSpeedTest()`, replace the inline map with just `gradeKeys` (it was already referencing it as a local, now references the module-level one).

Then add these functions right before `initSpeedTest()` (around line 605):

```ts
function formatHistoryTimestamp(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return t("speed.history.justNow");
  if (minutes < 60) return t("speed.history.minAgo").replace("{0}", String(minutes));
  if (hours < 24) return t("speed.history.hrAgo").replace("{0}", String(hours));
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderSpeedHistory(): void {
  const container = document.getElementById("speed-history")!;
  const cardsEl = document.getElementById("speed-history-cards")!;
  const emptyEl = document.getElementById("speed-history-empty")!;
  const entries = SpeedTestHistory.load();

  if (entries.length === 0) {
    container.classList.remove("visible");
    cardsEl.innerHTML = "";
    return;
  }

  container.classList.add("visible");
  emptyEl.style.display = "none";

  cardsEl.innerHTML = entries.map((entry) => {
    const grade = SpeedTest.getGrade(entry.download);
    const gradeLabel = t(gradeKeys[grade.label] || grade.label);
    const server = formatColo(entry.colo, entry.userLat, entry.userLon);
    const time = formatHistoryTimestamp(entry.timestamp);

    return `
    <div class="speed-history-card stagger-item">
      <div class="speed-history-card-header">
        <span class="speed-history-card-time">${time}</span>
        <span class="speed-history-card-grade">${grade.grade} · ${gradeLabel}</span>
      </div>
      <span class="speed-history-card-server">${server}</span>
      <div class="speed-history-card-metrics">
        <div class="speed-history-card-metric download">
          <div class="speed-history-card-metric-value">${SpeedTest.formatSpeed(entry.download)}</div>
          <div class="speed-history-card-metric-label">↓</div>
        </div>
        <div class="speed-history-card-metric upload">
          <div class="speed-history-card-metric-value">${SpeedTest.formatSpeed(entry.upload)}</div>
          <div class="speed-history-card-metric-label">↑</div>
        </div>
        <div class="speed-history-card-metric latency">
          <div class="speed-history-card-metric-value">${entry.latency !== null ? String(Math.round(entry.latency)) : "—"}</div>
          <div class="speed-history-card-metric-label">ms</div>
        </div>
        <div class="speed-history-card-metric jitter">
          <div class="speed-history-card-metric-value">${entry.jitter !== null ? String(Math.round(entry.jitter)) : "—"}</div>
          <div class="speed-history-card-metric-label">ms</div>
        </div>
      </div>
    </div>`;
  }).join("");
}
```

- [ ] **Step 3: Call renderSpeedHistory() on page load**

In `initSpeedTest()` (around line 605-607), add a call to `renderSpeedHistory()`:

```ts
function initSpeedTest(): void {
  document.getElementById("speed-start-btn")!.addEventListener("click", runSpeedTest);
  renderSpeedHistory();
}
```

- [ ] **Step 4: Save results and re-render after each speed test**

In `runSpeedTest()`, after the results are finalized (after `renderSpeedSuggestions(results);` around line 775), add:

```ts
  SpeedTestHistory.save(results);
  renderSpeedHistory();
```

- [ ] **Step 5: Add locale-switch support**

In `applyStaticTranslations()` in `i18n.ts`, add to the Speed section block (after the line `s("speed-route-you", "speed.you");` around line 714):

```ts
  s("speed-history-title", "speed.history.title");
  s("speed-history-empty", "speed.history.empty");
```

And import/re-export `renderSpeedHistory` from `app.ts` so it can be called on locale switch. The simplest approach: in `app.ts`, expose `renderSpeedHistory` on the window object:

In `app.ts`, near the end of the file (or right after the `renderSpeedHistory` function definition), add:

```ts
(window as any).renderSpeedHistory = renderSpeedHistory;
```

Then in `i18n.ts`, at the end of `applyStaticTranslations()`, add:

```ts
  if ((window as any).renderSpeedHistory) (window as any).renderSpeedHistory();
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/client/app.ts src/client/i18n.ts
git commit -m "feat: integrate speed history rendering and locale support"
```

---

### Task 6: Verify end-to-end and build

**Files:** None (verification only)

- [ ] **Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Run build**

Run: `npx vite build`
Expected: successful build with no errors

- [ ] **Step 3: Manual verification**

Open the site in a browser:
1. Navigate to the Speed Test tab
2. Expected: No history section visible (first visit, no prior tests)
3. Click "Run Speed Test" — after completion, one history card should appear
4. Click "Run Again" — after completion, two history cards should appear
5. Refresh the page — both history cards should still be visible (localStorage persistence)
6. Toggle locale (EN → zh-TW) — history titles and timestamps should switch language

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during verification"
```