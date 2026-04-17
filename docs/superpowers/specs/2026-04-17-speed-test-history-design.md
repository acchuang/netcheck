# Speed Test History — Design Spec

## Goal

Display the last two speed test results below the current speed test result on the Speed Test page, allowing users to compare their current performance against recent history.

## Decisions

- **Storage**: localStorage (key: `netcheck-speed-history`) — persists across sessions
- **Max entries**: 2 (newest first, FIFO eviction)
- **Display**: Compact metric cards placed between the speed graph and the suggestions section
- **Architecture**: Separate `history.ts` module (Approach B)

## Data Model

```ts
interface SpeedTestHistoryEntry {
  download: number | null;
  upload: number | null;
  latency: number | null;
  jitter: number | null;
  colo: string | null;
  timestamp: number; // Date.now() epoch ms
}
```

- localStorage key: `netcheck-speed-history`
- Value: JSON array of `SpeedTestHistoryEntry`, max length 2
- On save: prepend new entry, truncate to 2
- On load: parse JSON, return `[]` on parse error or missing key

## New File: `src/client/history.ts`

`SpeedTestHistory` module:
- `save(result: SpeedTestResults): void` — prepend entry, cap at 2, write to localStorage
- `load(): SpeedTestHistoryEntry[]` — read and parse from localStorage
- `clear(): void` — remove localStorage key

Imports `SpeedTestResults` type from `./speed-test`.

## Changes to `src/client/app.ts`

- Import `SpeedTestHistory` from `./history`
- In `runSpeedTest()`: after results finalize (~line 751), call `SpeedTestHistory.save(results)`
- Call `renderSpeedHistory()` in `initSpeedTest()` (on page load) and at the end of `runSpeedTest()`
- New function `renderSpeedHistory()`: reads history, renders cards into `#speed-history` container, toggles `.hidden` class

### renderSpeedHistory() behavior

- If 0 entries: container stays hidden (`.hidden`)
- If 1–2 entries: show container, render cards
- Each card shows: timestamp (relative for <1hr, else absolute), 4 metrics (↓ upload ↓ latency ↓ jitter), grade badge
- Relative time: "just now", "<X> min ago", "<X> hr ago"
- Absolute time: locale-formatted date+time (e.g. "Apr 17, 14:32")

## Changes to `index.html`

Insert between the speed graph card (line 308) and suggestions section (line 311):

```html
<div id="speed-history" class="speed-history hidden">
  <h2 class="speed-history-title" id="speed-history-title">History</h2>
  <p class="speed-history-empty" id="speed-history-empty">No previous tests recorded</p>
  <div class="speed-history-cards" id="speed-history-cards"></div>
</div>
```

## Changes to `src/client/i18n.ts`

Add keys (both `en` and `zh-TW`):

| Key | English | zh-TW |
|-----|---------|-------|
| `speed.history.title` | History | 歷史記錄 |
| `speed.history.empty` | No previous tests recorded | 尚無歷史記錄 |
| `speed.history.justNow` | just now | 剛才 |
| `speed.history.minAgo` | {0} min ago | {0} 分鐘前 |
| `speed.history.hrAgo` | {0} hr ago | {0} 小時前 |

## Changes to `public/css/styles.css`

- `.speed-history` — container with margin/padding matching existing card spacing
- `.speed-history-title` — matches `.suggestions-title` style
- `.speed-history-empty` — muted text, matching `.info-muted`
- `.speed-history-cards` — flexbox row, gap, responsive (column on mobile)
- `.speed-history-card` — compact card: subtle border, rounded corners, dark card bg
  - `.speed-history-card-header` — timestamp + grade badge (right-aligned, small)
  - `.speed-history-card-metrics` — 4-column flex row: ↓ ↓ lat jit with labels
  - `.speed-history-card-metric` — value + small label underneath
- `.speed-history-card.col-1` / `.col-2` — optional nth-child styling for visual distinction
- Responsive: `@media (max-width: 640px)` — cards stack vertically

## Rendering Sketch

```
┌─ History ──────────────────────────────────────────┐
│                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │ 5 min ago        B+ │  │ 1 hr ago          A  │  │
│  │                      │  │                      │  │
│  │ ↓  87.3   ↑  24.1   │  │ ↓ 203.5   ↑  45.2   │  │
│  │  Mbps      Mbps      │  │  Mbps      Mbps      │  │
│  │  12ms lat  3ms jit   │  │  8ms lat   2ms jit   │  │
│  └──────────────────────┘  └──────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

## Files Touched

1. **New**: `src/client/history.ts` — storage module
2. **Edit**: `src/client/app.ts` — import, save call, renderSpeedHistory()
3. **Edit**: `index.html` — add history container
4. **Edit**: `src/client/i18n.ts` — add 5 i18n keys × 2 locales
5. **Edit**: `public/css/styles.css` — history card styles

## Out of Scope

- Server-side history / sync across devices
- History > 2 entries (no pagination, no "view all")
- Exporting history
- Visual delta indicators (↑/↓ vs. previous run)