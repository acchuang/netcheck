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

**Files touched:**
- `src/client/tabs/dashboard-tab.ts` — `renderDashboard()`: replace first stat card HTML with ring SVG; call `animateRing` + `animateNumber` after `container.innerHTML =` (query the ring + score elements, invoke animations)

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
- The ring SVG structure matches `src/client/adblock-ui.ts` and `src/client/fingerprint-ui.ts` — follow their exact markup pattern for consistency
- Grade color comes from `GRADE_COLORS` map already in `dashboard-tab.ts`
- `computeOverallScore()` already returns `{ grade, score, testsCompleted }` — wire its `score` into `animateNumber` and `animateRing`

## Verification

- `npx tsc --noEmit` clean
- `npx eslint src/ --quiet` clean
- `npx prettier --check 'src/**/*.ts'` clean
- `npx vitest run` — existing 325 tests pass (dashboard-tab.test.ts has 6 tests)
- Manual: open dashboard, run tests, verify ring animates, score counts up, grade pops, no double tooltip on chart bars