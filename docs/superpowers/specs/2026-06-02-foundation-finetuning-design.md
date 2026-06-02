# Foundation Fine-Tuning Design

**Date:** 2026-06-02
**Status:** Draft
**Approach:** Full Observable Migration (Phase 1 of 4-phase fine-tuning)

## Context

NetCheck has 20+ tools/tabs, but only DNS, Speed, TLS, Email, History, Cookie, Dashboard, and HTTP/3 use observable state modules. The remaining tools (Ad Block, Headers, Fingerprint, Connection Quality, Breach Check, Cert Transparency, DNSSEC Validation, Privacy Exposure, Network Map) store results in module-level singletons or DOM-only. This creates four cross-cutting problems:

1. **i18n gaps** — Breach Check, Cert Transparency, DNSSEC Validation, and Privacy Exposure use hardcoded English
2. **DOM coupling** — Dashboard, AI Collector, Share, and Export-Report read data from DOM IDs instead of state
3. **State inconsistency** — Some tools use observable state, others use static class properties or `scanInProgress` flags
4. **CSS class sharing** — Tools borrow each other's CSS classes (`breach-loading`, `csp-analysis-card`, `tls-target-grade`)

This design addresses all four problems in Phase 1 (Foundation). Later phases will address dashboard scoring, worker extraction, and test coverage.

---

## 1. Observable State Modules

### 1.1 New State Modules

Each new state module follows the pattern established by `dns-state.ts`, `speed-state.ts`, and `tlsState`:

```typescript
// Example: src/client/state/adblock-state.ts
import { observable } from './observable';

export const adblockState = {
  score: observable<number>(0),
  totalBlocked: observable<number>(0),
  totalTests: observable<number>(0),
  results: observable<AdBlockResult[]>([]),
  categoryScores: observable<Record<string, number>>({}),
  filterLists: observable<FilterListResult[]>([]),
  loading: observable<boolean>(false),
};
```

New modules to create:

| Module | File | Key Observables | Replaces |
|---|---|---|---|
| `adblockState` | `state/adblock-state.ts` | `score`, `totalBlocked`, `totalTests`, `results`, `categoryScores`, `filterLists`, `loading` | `AdBlockTest.results`, `AdBlockTest.getScore()`, `FilterListDetector.results`, DOM reads of `#score-number`, `#adblock-total-blocked` |
| `headersState` | `state/headers-state.ts` | `url`, `grade`, `score`, `checks`, `cspAnalysis`, `loading`, `scanInProgress` | DOM reads of `#headers-grade`, `#headers-score`, `#headers-url`, module-level `scanInProgress` flag |
| `fingerprintState` | `state/fingerprint-state.ts` | `score`, `uniquenessLevel`, `categories`, `loading` | DOM reads of `#fp-score-number`, `#fp-uniqueness-label`, `#fp-score-summary` |
| `qualityState` | `state/quality-state.ts` | `grade`, `gradeLabel`, `effectiveType`, `connectionInfo`, `timing`, `stabilityTest`, `loading` | DOM reads of `#quality-grade`, `#quality-grade-label`, `#quality-score-title`, `#quality-tls-info` |
| `breachState` | `state/breach-state.ts` | `passwordHash`, `count`, `severity`, `loading` | module-level mutable state in `breach-check.ts` |
| `certTransparencyState` | `state/cert-transparency-state.ts` | `domain`, `totalCerts`, `activeCerts`, `expiredCerts`, `wildcardCerts`, `recentCerts`, `trustIndicators`, `certs`, `loading` | module-level mutable state in `cert-transparency.ts` |
| `dnssecValidationState` | `state/dnssec-validation-state.ts` | `domain`, `status`, `chainSteps`, `dsRecords`, `dnskeyRecords`, `loading` | module-level mutable state in `dnssec-validation.ts` |
| `privacyExposureState` | `state/privacy-exposure-state.ts` | `score`, `grade`, `riskLevel`, `apiResults`, `loading` | module-level mutable state in `privacy-exposure.ts` |
| `networkMapState` | `state/network-map-state.ts` | `probes`, `latencies`, `regionLatencies`, `loading` | module-level mutable state in `network-map.ts` |

Modules that already have observable state (no changes needed):
- `dnsState`, `speedState`, `tlsState`, `emailState`, `http3State`, `cookieState`, `appState` (shared-state.ts)

### 1.2 Migration Pattern

For each tool with module-level mutable state:

1. Create state module with observables
2. Update the tool's `run()` or `init()` function to call `.set()` on observables as results arrive
3. Update the tool's UI module to subscribe to observables instead of reading from static properties or DOM
4. Remove the old static properties and `scanInProgress` flags
5. Verify the tool still works identically

Example — `adblock-test.ts` migration:

```typescript
// Before:
export class AdBlockTest {
  static results: AdBlockResult[] = [];
  static getScore(): AdBlockScore { /* ... */ }
}

// After: AdBlockTest.run() calls adblockState.score.set(score), etc.
// AdBlockTest class is simplified to just the test-run logic
// UI reads from adblockState.score.get()
```

### 1.3 Subscription Pattern in UI

UI modules subscribe to observables and re-render on change:

```typescript
// Before (adblock-ui.ts):
const score = AdBlockTest.getScore();
document.getElementById('score-number')!.textContent = String(score.score);

// After:
adblockState.score.subscribe((score) => {
  document.getElementById('score-number')!.textContent = String(score);
});
```

---

## 2. Consumer Rewiring

### 2.1 Dashboard (`dashboard-tab.ts`)

Replace DOM reads with observable reads:

| Current Read | Replacement |
|---|---|
| `document.getElementById('score-number')?.textContent` | `adblockState.score.get()` |
| `document.getElementById('headers-grade')?.textContent` | `headersState.grade.get()` |
| `document.getElementById('headers-score')?.textContent` | `headersState.score.get()` |

The `computeOverallScore()` function will read from observables for all completed tests. Tests without real scoring (adblock, headers, fingerprint, quality, tls) will have placeholder scores of 50 until Phase 2 implements real scoring.

### 2.2 AI Collector (`ai-collector.ts`)

Replace 8 DOM reads:

| Current Read | Replacement |
|---|---|
| `document.getElementById('headers-grade')?.textContent` | `headersState.grade.get()` |
| `document.getElementById('headers-score')?.textContent` | `headersState.score.get()` |
| `document.getElementById('headers-url')?.value` | `headersState.url.get()` |
| `document.getElementById('score-number')?.textContent` | `adblockState.score.get()` |
| `document.getElementById('adblock-total-blocked')?.textContent` | `adblockState.totalBlocked.get()` |
| `document.getElementById('fp-score-number')?.textContent` | `fingerprintState.score.get()` |
| `document.getElementById('quality-grade')?.textContent` | `qualityState.grade.get()` |
| `document.getElementById('quality-grade-label')?.textContent` | `qualityState.gradeLabel.get()` |

### 2.3 Share (`share.ts`)

Replace all `document.getElementById()` reads with observable `.get()` calls. The `buildSummary()` function will read from state observables by tab name, falling back to DOM reads only for genuinely DOM-only data (e.g., speed test labels that are static i18n text).

### 2.4 Export Report (`export-report.ts`)

Replace:
- `SpeedTest.results` → `speedState` observables (already exists)
- `AdBlockTest.results` / `AdBlockTest.getScore()` → `adblockState` observables
- `FilterListDetector.results` → `adblockState.filterLists.get()`
- DOM scraping of cookie table, DNS results, headers results → observable reads

---

## 3. i18n Gap Fill

### 3.1 New Translation Keys

Add keys to `src/client/i18n.ts` (English source) and all 5 locale files (`zh-TW`, `zh-CN`, `es`, `ja`, `ko`).

**Breach Check** (~25 keys):
- `breachCheck.title`, `breachCheck.enterPassword`, `breachCheck.check`, `breachCheck.checking`, `breachCheck.safe`, `breachCheck.found`, `breachCheck.severity.low`, `breachCheck.severity.medium`, `breachCheck.severity.high`, `breachCheck.count`, `breachCheck.secure`, `breachCheck.warning`, `breachCheck.danger`, etc.

**Cert Transparency** (~20 keys):
- `certTransparency.title`, `certTransparency.search`, `certTransparency.searching`, `certTransparency.totalCerts`, `certTransparency.active`, `certTransparency.expired`, `certTransparency.wildcard`, `certTransparency.recentWarning`, `certTransparency.noResults`, etc.

**DNSSEC Validation** (~15 keys):
- `dnssecValidation.title`, `dnssecValidation.validate`, `dnssecValidation.validating`, `dnssecValidation.secure`, `dnssecValidation.insecure`, `dnssecValidation.bogus`, `dnssecValidation.error`, `dnssecValidation.chain`, `dnssecValidation.dsRecord`, `dnssecValidation.dnskeyRecord`, etc.

**Privacy Exposure** (~20 keys):
- `privacyExposure.title`, `privacyExposure.test`, `privacyExposure.testing`, `privacyExposure.riskLevel`, `privacyExposure.score`, `privacyExposure.grade`, `privacyExposure.high`, `privacyExposure.medium`, `privacyExposure.low`, `privacyExposure.api.webrtc`, `privacyExposure.api.battery`, etc.

**Cookie Audit** (~10 missing keys):
- `cookieAudit.title`, `cookieAudit.total`, `cookieAudit.size`, `cookieAudit.secure`, `cookieAudit.category`, etc.

### 3.2 Application Pattern

Replace all hardcoded English strings with `t('key')` calls. Static text is bound via the existing `applyStaticTranslations()` binding array. Dynamic text is set in UI modules via `el.textContent = t('key')`.

### 3.3 Locale File Updates

Each locale file must include all new keys with `satisfies Translations` type checking. Missing translations should use English as placeholder (existing pattern in the codebase).

---

## 4. CSS Class Isolation

### 4.1 Shared Utility Classes

Create `public/css/utilities.css` with shared classes that are currently defined in tool-specific CSS but reused across tools:

```css
/* Loading indicators */
.breach-loading { /* extracted from breach-check specific CSS */ }
.scan-loading { /* generic loading animation */ }

/* Grade displays */
.grade-badge { /* extracted from tls-target-grade, quality-grade, etc. */ }

/* Status indicators */
.status-pass { /* already global */ }
.status-warn { /* already global */ }
.status-fail { /* already global */ }

/* Analysis cards */
.analysis-card { /* extracted from csp-analysis-card */ }
```

### 4.2 Import Order

Add `utilities.css` to `index.html` before `styles.css`:

```html
<link rel="stylesheet" href="/css/utilities.css">
<link rel="stylesheet" href="/css/styles.css">
```

### 4.3 Migration

For each shared class:
1. Add the class to `utilities.css`
2. Find all references in tool-specific CSS and HTML
3. Replace tool-specific class names with the shared class
4. Verify visually that styling is unchanged

Classes to extract:

| Current Class | Used By | New Shared Class |
|---|---|---|
| `breach-loading` | breach-check, cert-transparency, dnssec-validation, privacy-exposure | `scan-loading` |
| `csp-analysis-card` | headers-ui, cert-transparency, dnssec-validation, privacy-exposure | `analysis-card` |
| `tls-target-grade` | tls-tab, quality-ui | `grade-badge` |

---

## 5. Module-Level Mutable State Removal

### 5.1 Modules to Migrate

| Module | Current Pattern | Migration Target |
|---|---|---|
| `adblock-test.ts` | `static results: AdBlockResult[]`, `static getScore()` | `adblockState.results`, `adblockState.score` |
| `filter-lists.ts` | `static results: FilterListResult[]` | `adblockState.filterLists` |
| `speed-test.ts` | `static results: SpeedTestResults` | Already has `speedState` observables; remove static properties |
| `breach-check.ts` | `let scanInProgress = false` | `breachState.loading` |
| `cert-transparency.ts` | `let scanInProgress = false` | `certTransparencyState.loading` |
| `dnssec-validation.ts` | `let scanInProgress = false` | `dnssecValidationState.loading` |
| `privacy-exposure.ts` | module-level result variables | `privacyExposureState.*` |
| `headers-ui.ts` | `let scanInProgress = false` | `headersState.scanInProgress` |
| `network-map.ts` | `let map`, `let userMarker`, etc. | `networkMapState.*` |

### 5.2 `scanInProgress` Pattern

Replace all `let scanInProgress = false` module-level flags with observable `loading` state:

```typescript
// Before (breach-check.ts):
let scanInProgress = false;
async function runBreachCheck() {
  if (scanInProgress) return;
  scanInProgress = true;
  // ... do work ...
  scanInProgress = false;
}

// After:
async function runBreachCheck() {
  if (breachState.loading.get()) return;
  breachState.loading.set(true);
  // ... do work ...
  breachState.loading.set(false);
}
```

---

## 6. Implementation Order

Work proceeds one tool at a time, in this order:

1. **State modules** — Create all 9 new state modules (adblock, headers, fingerprint, quality, breach, cert-transparency, dnssec-validation, privacy-exposure, network-map)
2. **Ad Block** — Migrate `adblock-test.ts` + `adblock-ui.ts` + `filter-lists.ts` + `filter-ui.ts` to use `adblockState`
3. **Headers** — Migrate `headers-ui.ts` to use `headersState`
4. **Fingerprint** — Migrate `fingerprint.ts` + `fingerprint-ui.ts` to use `fingerprintState`
5. **Connection Quality** — Migrate `connection-quality.ts` + `connection-quality-ui.ts` to use `qualityState`
6. **Breach Check** — Migrate `breach-check.ts` to use `breachState` + add i18n
7. **Cert Transparency** — Migrate `cert-transparency.ts` to use `certTransparencyState` + add i18n
8. **DNSSEC Validation** — Migrate `dnssec-validation.ts` to use `dnssecValidationState` + add i18n
9. **Privacy Exposure** — Migrate `privacy-exposure.ts` to use `privacyExposureState` + add i18n
10. **Network Map** — Migrate `network-map.ts` + `network-map-ui.ts` to use `networkMapState`
11. **Consumers** — Update dashboard, AI collector, share, and export-report to read from new observables
12. **CSS isolation** — Extract shared classes to `utilities.css`
13. **Remove dead code** — Delete old module-level mutable state, unused static properties

Each step is one commit. Never refactor multiple tools in the same commit.

---

## 7. Acceptance Criteria

- [ ] All 9 new state modules created with observable exports
- [ ] All `scanInProgress` module-level flags replaced with `.loading` observables
- [ ] All static class properties (`AdBlockTest.results`, `FilterListDetector.results`, `SpeedTest.results`) removed
- [ ] Dashboard reads exclusively from observables — zero `document.getElementById()` calls for data
- [ ] AI collector reads exclusively from observables — zero DOM reads for test data
- [ ] Share module reads from observables for all data that exists in state
- [ ] Export report reads from observables for all data that exists in state
- [ ] Breach Check, Cert Transparency, DNSSEC Validation, Privacy Exposure fully internationalized
- [ ] Cookie Audit missing i18n keys added
- [ ] Shared CSS classes extracted to `utilities.css`
- [ ] All existing tests pass
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] No visual regression — all tabs look and behave identically

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Observable migration breaks UI rendering | Medium | Migrate one tool at a time, verify visually after each |
| i18n key typos or missing translations | Low | TypeScript `satisfies Translations` enforces key completeness |
| CSS extraction changes visual appearance | Low | Visual comparison per tool after extraction |
| Dashboard temporarily shows stale data during migration | Medium | Dashboard subscribes to observables; auto-updates on change |
| Large state module surface area | Low | Each module follows identical pattern; repetitive not complex |

---

## Later Phases (Not in Scope)

- **Phase 2 — Scoring:** Implement real scoring for adblock, headers, fingerprint, quality, and TLS in `computeOverallScore()`
- **Phase 3 — Worker Extraction:** Split `worker/index.ts` (2440 lines) into separate handler modules
- **Phase 4 — Tests:** Add unit tests for tools that lack them