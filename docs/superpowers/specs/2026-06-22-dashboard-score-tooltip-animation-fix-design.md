# Dashboard Score Ring, Tooltip, and Animation Fix

**Date:** 2026-06-22
**Status:** Approved (brainstormed)

## Problem

Three UI/UX bugs identified in the dashboard:

1. **Score ring never animates.** Commit `000c166` added `animateRing` and `animateNumber` utilities to `src/client/ui-utils.ts`, but the dashboard (`src/client/tabs/dashboard-tab.ts`) never calls them. The "Overall Score" stat card renders a static grade letter via `innerHTML` — no ring, no count-up.

2. **Double tooltips on mini-chart bars.** `dashboard-tab.ts:382` uses `title=` on chart bars. The custom tooltip system (`tooltip.ts:18`) falls back to `title` attribute, so both the native browser tooltip AND the custom tooltip fire simultaneously.

3. **No grade-reveal animation on dashboard score.** The `grade-reveal` CSS class (`styles.css:2557`, 0.5s cubic-bezier pop) is used by `speed-ui.ts:207` and `connection-quality-ui.ts:370`, but the dashboard score has no reveal animation at all.

## Design

### 1. Score Ring + Count-up (Option A — selected)

Replace the first `dash-stat-card` (Overall Score) with an SVG ring layout matching the adblock/fingerprint/speed tabs:

- SVG ring: 120×120, radius 54, `--accent-lime` stroke, 8px width, `stroke-linecap: round`
- Background track circle (gray `--border-default`)
- Foreground progress circle animated via `animateRing(ring, score, 54)`
- Grade letter centered in ring (e.g. "A"), styled with `grade-reveal` class for pop animation
- Score number below grade (e.g. "82 / 100"), animated via `animateNumber(el, 0, score, 800, formatter)`
- Respects `prefers-reduced-motion` (both `animateRing` and `animateNumber` already check this)

The other 3 stat cards (IP, Download, Latency) remain unchanged.

**Animation re-trigger guard:** `renderDashboard()` fires on every state subscription (latency ticks, IP updates, score changes, etc.). Without a guard, the ring would empty-and-refill on every re-render. Track the last rendered score in a module-level variable (`lastRenderedScore`, initialized to `null`). Only invoke `animateRing` + `animateNumber` when `score !== lastRenderedScore`. Update `lastRenderedScore` after each render. Initializing to `null` ensures the first non-empty render always animates regardless of score value. This matches the pattern in `adblock-ui.ts` which only re-animates when the score value actually changes.

**Empty-state path:** The animation calls live exclusively in the non-empty branch of `renderDashboard()` (after the `if (empty) { ... return; }` early return at line 218). The empty state renders skeleton cards and returns before the ring HTML exists — no ring/number elements to query, no animation to invoke.

**Files touched:**
- `src/client/tabs/dashboard-tab.ts` — `renderDashboard()`: replace first stat card HTML with ring SVG; after `container.innerHTML =`, query the ring + score elements; guard with `lastRenderedScore` check, then invoke `animateRing` + `animateNumber` + add `grade-reveal` class

### 2. Tooltip fix

`dashboard-tab.ts:382`:
```
title="${dateLabel}: ${Math.round(speed)} Mbps"
```
→
```
data-tooltip="${dateLabel}: ${Math.round(speed)} Mbps"
```

This removes the native browser tooltip; only the custom tooltip system fires.

**Files touched:**
- `src/client/tabs/dashboard-tab.ts` — one attribute swap

### 3. Grade-reveal animation

Add `grade-reveal` class to the grade letter element inside the ring. The CSS animation already exists at `styles.css:2557`. Remove the class after 400ms (matching the pattern in `speed-ui.ts:208` and `connection-quality-ui.ts:371`).

**Files touched:**
- `src/client/tabs/dashboard-tab.ts` — add class + setTimeout removal (same as existing pattern)

## Implementation Notes

- All three fixes are in a single file: `src/client/tabs/dashboard-tab.ts`
- `animateRing` and `animateNumber` are already exported from `src/client/ui-utils.ts` — just import them
- The ring SVG structure follows the pattern in `src/client/fingerprint-ui.ts:165` (animateRing call) and `src/client/adblock-ui.ts:139` — verify the actual SVG template source in those files before writing markup
- Grade color comes from `GRADE_COLORS` map already in `dashboard-tab.ts`
- `computeOverallScore()` already returns `{ grade, score, testsCompleted }` — wire its `score` into `animateNumber` and `animateRing`
- The 400ms grade-reveal removal matches the existing pattern in speed-ui.ts:208 and connection-quality-ui.ts:371, even though the CSS animation is 500ms — the class removal is intentional (animation completes on its own once triggered)

## Tests

Add to `src/client/__tests__/dashboard-tab.test.ts`:
- Test that `renderDashboard` with completed tests produces chart bars with `data-tooltip` attribute (not `title=`)
- Test that `animateRing`/`animateNumber` are invoked when score > 0 (mock or spy)

## Verification

- `npx tsc --noEmit` clean
- `npx eslint src/ --quiet` clean
- `npx prettier --check 'src/**/*.ts'` clean
- `npx vitest run` — existing 325 tests pass + new tests pass
- Manual: open dashboard, run tests, verify ring animates, score counts up, grade pops, no double tooltip on chart bars