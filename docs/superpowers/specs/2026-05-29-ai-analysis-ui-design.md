# AI Analysis UI Enhancement Design

**Date:** 2026-05-29
**Status:** Draft
**Scope:** Single tab UI enhancement — `src/client/ai-analysis-ui.ts` + `src/client/app.css`

## Changes

### 1. Test Readiness Panel (pre-analysis)
Replace plain mode toggle with readiness pills showing which tests have data. Each pill: green ✓ for completed, gray — for not-yet-run. Reuses `dash-stat-card` + new `.ai-readiness-pill` CSS.

### 2. Summary Cards (post-analysis)
After analysis, show 4 metric cards at top (Overall Grade, Speed, DNS, TLS) pulling from live state. Full AI analysis below in collapsible accordion sections (Key Findings, Risks, Recommendations). Cards use existing `dash-stat-card`. Accordion reuses `test-category-header` + `test-category-body` classes from adblock-ui.

### 3. Result Controls
Copy-to-clipboard button + Re-analyze button below results.

### Files
- Modify: `src/client/ai-analysis-ui.ts` (~150 lines added/modified)
- Modify: `src/client/app.css` (~40 lines for accordion, pills, readiness panel)
- Modify: `src/client/i18n.ts` (~5 keys)
- Modify: `src/client/locales/*` (5 files, English fallback)
