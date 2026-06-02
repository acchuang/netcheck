# Foundation Fine-Tuning Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all NetCheck tools to observable state, fill i18n gaps, wire consumers to state instead of DOM, and extract shared CSS classes.

**Architecture:** Full Observable Migration — each tool gets an observable state module (like existing `dnsState`, `speedState`), consumers read from observables instead of DOM, i18n keys are added for 5 tools, shared CSS classes are extracted. Dual-write pattern during transition prevents stale reads.

**Tech Stack:** Vanilla TypeScript, existing `observable.ts` reactive primitive, existing `t()` i18n system, Vitest for tests.

---

## File Structure

### New files to create:
- `src/client/state/adblock-state.ts` — adblock + filter list state
- `src/client/state/headers-state.ts` — security headers state
- `src/client/state/fingerprint-state.ts` — browser fingerprint state
- `src/client/state/quality-state.ts` — connection quality state
- `src/client/state/breach-state.ts` — breach check state
- `src/client/state/cert-transparency-state.ts` — certificate transparency state
- `src/client/state/dnssec-validation-state.ts` — DNSSEC validation state
- `src/client/state/privacy-exposure-state.ts` — privacy exposure state
- `src/client/state/network-map-state.ts` — network map state
- `public/css/utilities.css` — shared utility CSS classes

### New test files to create:
- `src/client/__tests__/adblock-state.test.ts`
- `src/client/__tests__/headers-state.test.ts`
- `src/client/__tests__/fingerprint-state.test.ts`
- `src/client/__tests__/quality-state.test.ts`
- `src/client/__tests__/breach-state.test.ts`
- `src/client/__tests__/cert-transparency-state.test.ts`
- `src/client/__tests__/dnssec-validation-state.test.ts`
- `src/client/__tests__/privacy-exposure-state.test.ts`
- `src/client/__tests__/network-map-state.test.ts`

### Files to modify:
- `src/client/i18n.ts` — add ~90 new i18n keys
- `src/client/locales/zh-TW.ts` — add matching translations
- `src/client/locales/zh-CN.ts` — add matching translations
- `src/client/locales/es.ts` — add matching translations
- `src/client/locales/ja.ts` — add matching translations
- `src/client/locales/ko.ts` — add matching translations
- `src/client/adblock-test.ts` — write to adblockState, dual-write
- `src/client/adblock-ui.ts` — subscribe to adblockState
- `src/client/filter-lists.ts` — write to adblockState.filterLists, dual-write
- `src/client/filter-ui.ts` — subscribe to adblockState
- `src/client/headers-ui.ts` — write to headersState, replace scanInProgress
- `src/client/fingerprint.ts` — write to fingerprintState
- `src/client/fingerprint-ui.ts` — subscribe to fingerprintState
- `src/client/connection-quality.ts` — write to qualityState
- `src/client/connection-quality-ui.ts` — subscribe to qualityState
- `src/client/breach-check.ts` — write to breachState, add i18n
- `src/client/cert-transparency.ts` — write to certTransparencyState, add i18n
- `src/client/dnssec-validation.ts` — write to dnssecValidationState, add i18n
- `src/client/privacy-exposure.ts` — write to privacyExposureState, add i18n, remove scoreToGrade import
- `src/client/network-map.ts` — write to networkMapState
- `src/client/network-map-ui.ts` — subscribe to networkMapState
- `src/client/tabs/dashboard-tab.ts` — read from observables instead of DOM
- `src/client/ai-collector.ts` — read from observables instead of DOM
- `src/client/share.ts` — read from observables instead of DOM
- `src/client/export-report.ts` — read from observables instead of module properties
- `src/client/tls-tab.ts` — add targetLoading observable
- `src/client/state/tls-state.ts` — add targetLoading observable
- `src/client/app.ts` — import new state modules (if needed for init)
- `index.html` — add utilities.css link
- `public/css/styles.css` — remove classes that move to utilities.css

---

## Chunk 1: State Modules

### Task 1: Create adblock-state.ts

**Files:**
- Create: `src/client/state/adblock-state.ts`
- Test: `src/client/__tests__/adblock-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/client/__tests__/adblock-state.test.ts
import { describe, it, expect } from 'vitest';
import { adblockState } from '../state/adblock-state';

describe('adblockState', () => {
  it('has correct initial values', () => {
    expect(adblockState.score.get()).toBe(0);
    expect(adblockState.totalBlocked.get()).toBe(0);
    expect(adblockState.totalTests.get()).toBe(0);
    expect(adblockState.results.get()).toEqual([]);
    expect(adblockState.categoryScores.get()).toEqual({});
    expect(adblockState.filterLists.get()).toEqual([]);
    expect(adblockState.loading.get()).toBe(false);
  });

  it('supports set and subscribe', () => {
    const values: number[] = [];
    const dispose = adblockState.score.subscribe((v) => values.push(v));
    adblockState.score.set(85);
    expect(values).toEqual([85]);
    expect(adblockState.score.get()).toBe(85);
    dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/adblock-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the state module**

```ts
// src/client/state/adblock-state.ts
import { observable } from './observable';

export const adblockState = {
  score: observable<number>(0),
  totalBlocked: observable<number>(0),
  totalTests: observable<number>(0),
  results: observable<CategoryResult[]>([]),
  categoryScores: observable<Record<string, number>>({}),
  filterLists: observable<FilterListResult[]>([]),
  loading: observable<boolean>(false),
};
```

Note: Import the `CategoryResult` type from `adblock-test.ts` and `FilterListResult` from `filter-lists.ts`. If these types are not exported, export them first. Also export `CtCert` from `cert-transparency.ts` and `CspIssue`/`HeaderCheckResult` from `headers-ui.ts` so the state modules can import them.

- [ ] **Step 4: Export types from source modules if needed**

In `src/client/adblock-test.ts`, ensure `CategoryResult`, `Score`, `TestWithResult` interfaces are exported (add `export` keyword).

In `src/client/filter-lists.ts`, ensure `FilterListResult` is exported.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/adblock-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/state/adblock-state.ts src/client/__tests__/adblock-state.test.ts src/client/adblock-test.ts src/client/filter-lists.ts
git commit -m "feat: add adblockState observable module with tests"
```

---

### Task 2: Create headers-state.ts

**Files:**
- Create: `src/client/state/headers-state.ts`
- Test: `src/client/__tests__/headers-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/client/__tests__/headers-state.test.ts
import { describe, it, expect } from 'vitest';
import { headersState } from '../state/headers-state';

describe('headersState', () => {
  it('has correct initial values', () => {
    expect(headersState.url.get()).toBe('');
    expect(headersState.grade.get()).toBe('');
    expect(headersState.score.get()).toBe(0);
    expect(headersState.checks.get()).toEqual([]);
    expect(headersState.cspAnalysis.get()).toBeNull();
    expect(headersState.loading.get()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/headers-state.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Identify headers types from headers-ui.ts**

Read `src/client/headers-ui.ts` and find the `HeaderCheckResult` and `CspAnalysis` interfaces. Export them from `headers-ui.ts` if not already exported. The `CspAnalysis` has fields `present`, `raw`, `directives`, `issues`, `score`, `grade` — NOT `findings`/`hasCsp`/`summary`. Use `HeaderCheckResult` (NOT `SecurityCheck`) for the `checks` observable.

- [ ] **Step 4: Write the state module**

```ts
// src/client/state/headers-state.ts
import { observable } from './observable';
import type { SecurityCheck } from '../types';

export interface CspIssue {
  severity: string;
  directive: string;
  value: string;
  description: string;
}

export interface CspAnalysis {
  present: boolean;
  raw: string | null;
  directives: { name: string; values: string[] }[];
  issues: CspIssue[];
  score: number;
  grade: string;
}

export interface HeaderCheckResult {
  name: string;
  key: string;
  desc: string;
  value: string;
  present: boolean;
}

export const headersState = {
  url: observable<string>(''),
  grade: observable<string>(''),
  score: observable<number>(0),
  checks: observable<HeaderCheckResult[]>([]),
  cspAnalysis: observable<CspAnalysis | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/headers-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/state/headers-state.ts src/client/__tests__/headers-state.test.ts
git commit -m "feat: add headersState observable module with tests"
```

---

### Task 3: Create fingerprint-state.ts

**Files:**
- Create: `src/client/state/fingerprint-state.ts`
- Test: `src/client/__tests__/fingerprint-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/client/__tests__/fingerprint-state.test.ts
import { describe, it, expect } from 'vitest';
import { fingerprintState } from '../state/fingerprint-state';

describe('fingerprintState', () => {
  it('has correct initial values', () => {
    expect(fingerprintState.uniquenessScore.get()).toBe(0);
    expect(fingerprintState.totalEntropy.get()).toBe(0);
    expect(fingerprintState.categories.get()).toEqual([]);
    expect(fingerprintState.loading.get()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/fingerprint-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Ensure FingerprintCategory and FingerprintResult types are exported**

In `src/client/fingerprint.ts`, ensure `FingerprintCategory`, `FingerprintItem`, and `FingerprintResult` interfaces have `export` keyword.

- [ ] **Step 4: Write the state module**

```ts
// src/client/state/fingerprint-state.ts
import { observable } from './observable';
import type { FingerprintCategory } from '../fingerprint';

export const fingerprintState = {
  uniquenessScore: observable<number>(0),
  totalEntropy: observable<number>(0),
  categories: observable<FingerprintCategory[]>([]),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/fingerprint-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/state/fingerprint-state.ts src/client/__tests__/fingerprint-state.test.ts src/client/fingerprint.ts
git commit -m "feat: add fingerprintState observable module with tests"
```

---

### Task 4: Create quality-state.ts

**Files:**
- Create: `src/client/state/quality-state.ts`
- Test: `src/client/__tests__/quality-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/client/__tests__/quality-state.test.ts
import { describe, it, expect } from 'vitest';
import { qualityState } from '../state/quality-state';

describe('qualityState', () => {
  it('has correct initial values', () => {
    expect(qualityState.loading.get()).toBe(false);
    expect(qualityState.hasRun.get()).toBe(false);
    expect(qualityState.isRunning.get()).toBe(false);
    expect(qualityState.score.get().grade).toBe('—');
    expect(qualityState.score.get().label).toBe('Unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/quality-state.test.ts`
Expected: FAIL

- [ ] **Step 3: Ensure ConnectionQuality types are exported**

In `src/client/connection-quality.ts`, ensure `ConnectionInfo`, `TlsInfo`, `ResourceTimingBreakdown`, `StabilityResults`, `QualityScore` interfaces/types have `export` keyword.

- [ ] **Step 4: Write the state module**

```ts
// src/client/state/quality-state.ts
import { observable } from './observable';
import type { ConnectionInfo, TlsInfo, ResourceTimingBreakdown, StabilityResults, QualityScore } from '../connection-quality';

const defaultScore: QualityScore = {
  grade: '—',
  label: 'Unknown',
  factors: {
    tls: 'fail',
    serverRtt: 'fail',
    connectionType: 'unavailable',
    stability: 'unavailable',
  },
};

export const qualityState = {
  score: observable<QualityScore>(defaultScore),
  connectionInfo: observable<ConnectionInfo | null>(null),
  tlsInfo: observable<TlsInfo | null>(null),
  timing: observable<ResourceTimingBreakdown | null>(null),
  stabilityTest: observable<StabilityResults | null>(null),
  hasRun: observable<boolean>(false),
  isRunning: observable<boolean>(false),
  isRunningStability: observable<boolean>(false),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/quality-state.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/state/quality-state.ts src/client/__tests__/quality-state.test.ts src/client/connection-quality.ts
git commit -m "feat: add qualityState observable module with tests"
```

---

### Task 5: Create remaining state modules (breach, cert-transparency, dnssec-validation, privacy-exposure, network-map)

This task creates 5 state modules in sequence. Each gets its own commit.

**Files:**
- Create: `src/client/state/breach-state.ts`, `src/client/state/cert-transparency-state.ts`, `src/client/state/dnssec-validation-state.ts`, `src/client/state/privacy-exposure-state.ts`, `src/client/state/network-map-state.ts`
- Create: corresponding test files

- [ ] **Step 1: Create breach-state.ts**

```ts
// src/client/state/breach-state.ts
import { observable } from './observable';

export const breachState = {
  found: observable<boolean>(false),
  count: observable<number>(0),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 2: Write breach-state test**

```ts
// src/client/__tests__/breach-state.test.ts
import { describe, it, expect } from 'vitest';
import { breachState } from '../state/breach-state';

describe('breachState', () => {
  it('has correct initial values', () => {
    expect(breachState.found.get()).toBe(false);
    expect(breachState.count.get()).toBe(0);
    expect(breachState.error.get()).toBeNull();
    expect(breachState.loading.get()).toBe(false);
  });
});
```

- [ ] **Step 3: Create cert-transparency-state.ts**

```ts
// src/client/state/cert-transparency-state.ts
import { observable } from './observable';

export interface CtSummary {
  total: number;
  active: number;
  expired: number;
  issuers: number;
  wildcardCount: number;
  recentlyIssued: number;
}

export const certTransparencyState = {
  domain: observable<string>(''),
  summary: observable<CtSummary | null>(null),
  certs: observable<CtCert[]>([]),
  trustIndicators: observable<string[]>([]),
  totalInDb: observable<number>(0),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 4: Create dnssec-validation-state.ts**

```ts
// src/client/state/dnssec-validation-state.ts
import { observable } from './observable';

export interface DnssecChainStep {
  step: string;
  status: 'pass' | 'fail' | 'skip';
  details: string;
}

export interface DsRecord {
  present: boolean;
  algorithm?: string;
  digestType?: string;
  keyTag?: number;
}

export interface DnskeyRecord {
  present: boolean;
  algorithm?: string;
  keyTag?: number;
  flags?: number;
}

export const dnssecValidationState = {
  domain: observable<string>(''),
  status: observable<'secure' | 'insecure' | 'bogus' | 'error'>('insecure'),  // lowercase normalized from API's uppercase
  adFlag: observable<boolean>(false),
  chain: observable<DnssecChainStep[]>([]),
  dsRecord: observable<DsRecord | null>(null),
  dnskeyRecord: observable<DnskeyRecord | null>(null),
  error: observable<string | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 5: Create privacy-exposure-state.ts**

```ts
// src/client/state/privacy-exposure-state.ts
import { observable } from './observable';

export interface PrivacyCheck {
  name: string;
  api: string;
  status: 'available' | 'blocked' | 'permission' | 'unavailable';
  risk: 'high' | 'medium' | 'low';
  reveals: string;
  tip: string;
}

export const privacyExposureState = {
  score: observable<number>(0),
  grade: observable<string>(''),
  riskLevel: observable<'high' | 'medium' | 'low'>('low'),
  checks: observable<PrivacyCheck[]>([]),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 6: Create network-map-state.ts**

```ts
// src/client/state/network-map-state.ts
import { observable } from './observable';
import type { MapResults } from '../network-map';

export const networkMapState = {
  results: observable<MapResults | null>(null),
  loading: observable<boolean>(false),
};
```

- [ ] **Step 7: Write remaining test files**

Follow the same pattern for each test file. Verify initial values match the observables defined above.

- [ ] **Step 8: Run all new state tests**

Run: `npx vitest run src/client/__tests__/*-state.test.ts`
Expected: ALL PASS

- [ ] **Step 9: Commit each state module separately**

```bash
git add src/client/state/breach-state.ts src/client/__tests__/breach-state.test.ts
git commit -m "feat: add breachState observable module with tests"
git add src/client/state/cert-transparency-state.ts src/client/__tests__/cert-transparency-state.test.ts src/client/cert-transparency.ts
git commit -m "feat: add certTransparencyState observable module with tests"
git add src/client/state/dnssec-validation-state.ts src/client/__tests__/dnssec-validation-state.test.ts src/client/dnssec-validation.ts
git commit -m "feat: add dnssecValidationState observable module with tests"
git add src/client/state/privacy-exposure-state.ts src/client/__tests__/privacy-exposure-state.test.ts
git commit -m "feat: add privacyExposureState observable module with tests"
git add src/client/state/network-map-state.ts src/client/__tests__/network-map-state.test.ts
git commit -m "feat: add networkMapState observable module with tests"
```

---

### Task 6: Add targetLoading to TLS state

**Files:**
- Modify: `src/client/state/tls-state.ts`

- [ ] **Step 1: Add targetLoading observable**

Add `targetLoading: observable<boolean>(false)` to the `tlsState` export object in `src/client/state/tls-state.ts`.

- [ ] **Step 2: Update tls-tab.ts to use targetLoading**

In `src/client/tabs/tls-tab.ts`, replace `let targetScanInProgress = false` (line 27) with `tlsState.targetLoading`. Update all references:
- `if (targetScanInProgress) return` → `if (tlsState.targetLoading.get()) return`
- `targetScanInProgress = true` → `tlsState.targetLoading.set(true)`
- `targetScanInProgress = false` → `tlsState.targetLoading.set(false)`

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/client/state/tls-state.ts src/client/tabs/tls-tab.ts
git commit -m "feat: add targetLoading to tlsState, replace scanInProgress flag"
```

---

## Chunk 2: Tool Migrations (Ad Block, Headers, Fingerprint)

### Task 7: Migrate Ad Block to adblockState

**Files:**
- Modify: `src/client/adblock-test.ts`
- Modify: `src/client/adblock-ui.ts`
- Modify: `src/client/filter-lists.ts`
- Modify: `src/client/filter-ui.ts`

**Strategy:** Dual-write — write to both `AdBlockTest.results` and `adblockState` during this migration. Consumers (dashboard, AI collector) are migrated later.

- [ ] **Step 1: Add import and dual-write in adblock-test.ts**

Add `import { adblockState } from './state/adblock-state';` at top of `adblock-test.ts`.

Find where `this.results` is set after test completion. After each `this.results = ...` assignment, add `adblockState.results.set(...)`.

After `getScore()` is called to compute the score, add `adblockState.score.set(score); adblockState.totalBlocked.set(blocked); adblockState.totalTests.set(total);`.

- [ ] **Step 2: Add import and dual-write in filter-lists.ts**

Add `import { adblockState } from './state/adblock-state';` at top.

After `this.results = ...` assignment, add `adblockState.filterLists.set(...)`.

- [ ] **Step 3: Update adblock-ui.ts to subscribe to adblockState**

In `adblock-ui.ts`, add `import { adblockState } from './state/adblock-state';`.

Find where the UI reads `AdBlockTest.results` and `AdBlockTest.getScore()`. Subscribe to `adblockState.results` and `adblockState.score` for reactive updates, keeping the DOM writes as they are.

- [ ] **Step 4: Update filter-ui.ts to subscribe to adblockState**

Same pattern — import adblockState, subscribe to filterLists observable.

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Verify dev server works**

Run: `npm run dev`
Check: Load the Ad Block tab, run the test, verify results display correctly.

- [ ] **Step 7: Commit**

```bash
git add src/client/adblock-test.ts src/client/adblock-ui.ts src/client/filter-lists.ts src/client/filter-ui.ts
git commit -m "feat: dual-write adblock data to adblockState, subscribe in UI"
```

---

### Task 8: Migrate Headers to headersState

**Files:**
- Modify: `src/client/headers-ui.ts`

- [ ] **Step 1: Add import and dual-write in headers-ui.ts**

Add `import { headersState } from './state/headers-state';`.

Replace `let scanInProgress = false` (line 41) with `headersState.loading`.

In the scan function, set `headersState.loading.set(true)` at start, `headersState.loading.set(false)` at end/finally.

When grade and score are set on the DOM, also set `headersState.grade.set(grade)` and `headersState.score.set(score)`.

When URL is read from input, set `headersState.url.set(input.value)`.

When security checks are rendered, also set `headersState.checks.set(checks)`.

When CSP analysis is rendered, also set `headersState.cspAnalysis.set(analysis)`.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify dev server works**

Run: `npm run dev`
Check: Scan a URL for headers, verify results display correctly.

- [ ] **Step 4: Commit**

```bash
git add src/client/headers-ui.ts
git commit -m "feat: dual-write headers data to headersState"
```

---

### Task 9: Migrate Fingerprint to fingerprintState

**Files:**
- Modify: `src/client/fingerprint.ts`
- Modify: `src/client/fingerprint-ui.ts`

- [ ] **Step 1: Add import and write in fingerprint.ts**

Add `import { fingerprintState } from './state/fingerprint-state';`.

After fingerprint results are computed, add:
```ts
fingerprintState.uniquenessScore.set(result.uniquenessScore);
fingerprintState.totalEntropy.set(result.totalEntropy);
fingerprintState.categories.set(result.categories);
```

- [ ] **Step 2: Add import and subscribe in fingerprint-ui.ts**

Add `import { fingerprintState } from './state/fingerprint-state';`.

Subscribe to observables for re-rendering.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/client/fingerprint.ts src/client/fingerprint-ui.ts
git commit -m "feat: dual-write fingerprint data to fingerprintState"
```

---

## Chunk 3: Tool Migrations (Quality, Breach, Cert Transparency, DNSSEC, Privacy, Network Map)

### Task 10: Migrate Connection Quality to qualityState

**Files:**
- Modify: `src/client/connection-quality.ts`
- Modify: `src/client/connection-quality-ui.ts`

- [ ] **Step 1: Add import and write in connection-quality.ts**

Add `import { qualityState } from './state/quality-state';`.

After each `computeScore()` call, set `qualityState.score.set(result)`.
After connection info is gathered, set `qualityState.connectionInfo.set(info)`.
After TLS info is fetched, set `qualityState.tlsInfo.set(info)`.
After timing data is computed, set `qualityState.timing.set(timing)`.
After stability test, set `qualityState.stabilityTest.set(stability)`.
Set `qualityState.isRunning.set(true/false)` around the test.
Set `qualityState.hasRun.set(true)` after completion.

- [ ] **Step 2: Add import and subscribe in connection-quality-ui.ts**

Add `import { qualityState } from './state/quality-state';`.

Subscribe to relevant observables for reactive updates.

- [ ] **Step 3: Run typecheck and verify**

Run: `npx tsc --noEmit && npm run dev`

- [ ] **Step 4: Commit**

```bash
git add src/client/connection-quality.ts src/client/connection-quality-ui.ts src/client/state/quality-state.ts
git commit -m "feat: dual-write quality data to qualityState"
```

---

### Task 11: Migrate Breach Check to breachState + i18n

**Files:**
- Modify: `src/client/breach-check.ts`

This tool has no `scanInProgress` flag (it uses button disabled state). Add `breachState` writes, add `error` observable writes for error cases, and replace all hardcoded English strings with `t()` calls. Note: `breach-check.ts` already imports `t` from `./i18n` (line 1) — don't add a duplicate import. The `getSeverity()` helper stays as a local function; severity is derived from `breachState.count`, not stored in state.

- [ ] **Step 1: Add i18n keys to src/client/i18n.ts**

Add after the last existing key in the `en` object (approximately line 719):

```ts
'breachCheck.title': 'Password Breach Check',
'breachCheck.enterPassword': 'Enter a password to check',
'breachCheck.check': 'Check Password',
'breachCheck.checking': 'Checking...',
'breachCheck.checkingDesc': 'Checking against breach databases...',
'breachCheck.safe': 'Not found in breaches',
'breachCheck.safeLabel': 'Safe',
'breachCheck.safeDesc': 'This password was not found in known data breaches. However, this does not guarantee it is secure — always use unique, strong passwords.',
'breachCheck.found': 'Found {0} times in breaches',
'breachCheck.foundDesc': 'This password has appeared in known data breaches. You should change it immediately on any site where you use it.',
'breachCheck.severity.low': 'Low Risk',
'breachCheck.severity.medium': 'Medium Risk',
'breachCheck.severity.high': 'High Risk',
'breachCheck.safeStatus': 'Safe',
'breachCheck.error': 'Unable to check password. The Have I Been Pwned API may be temporarily unavailable.',
'breachCheck.errorLink': 'Check on haveibeenpwned.com',
```

- [ ] **Step 2: Add same keys to all 5 locale files** (`zh-TW.ts`, `zh-CN.ts`, `es.ts`, `ja.ts`, `ko.ts`) with English as placeholder, using `satisfies Translations`.

- [ ] **Step 3: Add breachState writes in breach-check.ts**

Add `import { breachState } from './state/breach-state';` and `import { t } from './i18n';`.

Replace hardcoded strings with `t('breachCheck.xxx')` calls.
Set `breachState.found.set(result.found)`, `breachState.count.set(result.count)`.
Set `breachState.loading.set(true/false)` around the API call.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Add i18n static translations for breach check elements in i18n.ts applyStaticTranslations array**

- [ ] **Step 6: Commit**

```bash
git add src/client/breach-check.ts src/client/i18n.ts src/client/locales/*.ts
git commit -m "feat: migrate breach check to breachState + add i18n"
```

---

### Task 12: Migrate Cert Transparency to certTransparencyState + i18n

**Files:**
- Modify: `src/client/cert-transparency.ts`

- [ ] **Step 1: Add i18n keys to src/client/i18n.ts**

```ts
'certTransparency.title': 'Certificate Transparency',
'certTransparency.search': 'Search CT Logs',
'certTransparency.searching': 'Searching...',
'certTransparency.searchingDesc': 'Searching certificate transparency logs...',
'certTransparency.totalCerts': 'Total Certs',
'certTransparency.active': 'Active',
'certTransparency.expired': 'Expired',
'certTransparency.issuers': 'Issuers',
'certTransparency.wildcards': 'Wildcards',
'certTransparency.last30Days': 'Last 30 Days',
'certTransparency.trustIndicators': 'Trust Indicators',
'certTransparency.warning': 'WARNING',
'certTransparency.warningDesc': 'certificates issued in the last 30 days. Investigate if unexpected.',
'certTransparency.issuer': 'Issuer',
'certTransparency.commonName': 'Common Name',
'certTransparency.status': 'Status',
'certTransparency.validFrom': 'Valid From',
'certTransparency.validUntil': 'Valid Until',
'certTransparency.wildcard': 'WILDCARD',
'certTransparency.showing': 'Showing {0} of {1} certificates. View all on crt.sh',
'certTransparency.error': 'Failed to fetch certificate transparency data. The crt.sh API may be temporarily unavailable.',
'certTransparency.errorLink': 'Search on crt.sh',
'certTransparency.noResults': 'No certificates found for this domain.',
```

- [ ] **Step 2: Add same keys to all 5 locale files** with English as placeholder.

- [ ] **Step 3: Replace scanInProgress with certTransparencyState.loading and add state writes + i18n**

Add imports. Replace `scanInProgress` flag. Replace hardcoded strings with `t()` calls. Write results to state observables.

- [ ] **Step 4: Run typecheck and commit**

```bash
git add src/client/cert-transparency.ts src/client/i18n.ts src/client/locales/*.ts
git commit -m "feat: migrate cert transparency to certTransparencyState + add i18n"
```

---

### Task 13: Migrate DNSSEC Validation to dnssecValidationState + i18n

**Files:**
- Modify: `src/client/dnssec-validation.ts`

Same pattern as Task 12: replace `scanInProgress`, add state writes, add i18n.

- [ ] **Step 1: Add i18n keys**

```ts
'dnssecValidation.title': 'DNSSEC Validation',
'dnssecValidation.validate': 'Validate DNSSEC',
'dnssecValidation.validating': 'Validating...',
'dnssecValidation.validatingDesc': 'Validating DNSSEC chain of trust...',
'dnssecValidation.secure': 'SECURE — Chain of trust validated',
'dnssecValidation.insecure': 'INSECURE — Domain is not DNSSEC-signed',
'dnssecValidation.bogus': 'BOGUS — Chain of trust is broken',
'dnssecValidation.error': 'ERROR — Validation failed',
'dnssecValidation.trustChain': 'Trust Chain',
'dnssecValidation.resolver': 'RESOLVER',
'dnssecValidation.resolverAdTrue': "Cloudflare's resolver also validated this domain (AD flag = true)",
'dnssecValidation.resolverAdFalse': "Cloudflare's resolver did not set the AD flag for this domain",
'dnssecValidation.errorMsg': 'DNSSEC validation failed. The server may be temporarily unavailable.',
'dnssecValidation.dsRecord': 'DS Record',
'dnssecValidation.dnskeyRecord': 'DNSKEY Record',
```

- [ ] **Step 2: Add same keys to all 5 locale files**

- [ ] **Step 3: Replace scanInProgress, add state writes + i18n**

- [ ] **Step 4: Commit**

```bash
git add src/client/dnssec-validation.ts src/client/i18n.ts src/client/locales/*.ts
git commit -m "feat: migrate dnssec validation to dnssecValidationState + add i18n"
```

---

### Task 14: Migrate Privacy Exposure to privacyExposureState + i18n

**Files:**
- Modify: `src/client/privacy-exposure.ts`

- [ ] **Step 1: Add i18n keys**

```ts
'privacyExposure.title': 'Privacy Exposure',
'privacyExposure.test': 'Check Privacy Exposure',
'privacyExposure.testing': 'Checking...',
'privacyExposure.testingDesc': 'Detecting privacy exposure...',
'privacyExposure.score': 'Privacy Exposure Score',
'privacyExposure.highRisk': 'High Risk Exposures',
'privacyExposure.available': 'Available',
'privacyExposure.blocked': 'Blocked',
'privacyExposure.permission': 'Requires Permission',
'privacyExposure.unavailable': 'Not Available',
'privacyExposure.high': 'High',
'privacyExposure.medium': 'Medium',
'privacyExposure.low': 'Low',
'privacyExposure.api.webrtc': 'WebRTC',
'privacyExposure.api.battery': 'Battery',
'privacyExposure.api.deviceMemory': 'Device Memory',
'privacyExposure.api.bluetooth': 'Bluetooth',
'privacyExposure.api.usb': 'USB',
'privacyExposure.api.serial': 'Serial',
'privacyExposure.api.gamepad': 'Gamepad',
'privacyExposure.api.geolocation': 'Geolocation',
'privacyExposure.api.notifications': 'Notifications',
'privacyExposure.api.mediaDevices': 'Media Devices',
'privacyExposure.api.clipboard': 'Clipboard',
```

- [ ] **Step 2: Add same keys to all 5 locale files**

- [ ] **Step 3: Add state writes + i18n**

Remove `import { scoreToGrade } from './tabs/dashboard-tab';` — copy the `scoreToGrade` function locally into `privacy-exposure.ts` (it's a simple grade lookup table) to break the circular dependency between privacy-exposure and dashboard-tab.

Write results to `privacyExposureState` observables. Replace hardcoded strings with `t()` calls.

- [ ] **Step 4: Commit**

```bash
git add src/client/privacy-exposure.ts src/client/i18n.ts src/client/locales/*.ts
git commit -m "feat: migrate privacy exposure to privacyExposureState + add i18n"
```

---

### Task 15: Migrate Network Map to networkMapState

**Files:**
- Modify: `src/client/network-map.ts`
- Modify: `src/client/network-map-ui.ts`

- [ ] **Step 1: Add import and write in network-map.ts**

Add `import { networkMapState } from './state/network-map-state';`.

After probes are fetched and latencies computed, set `networkMapState.results.set({ userColo, userLat, userLon, probes })`.

Set `networkMapState.loading.set(true/false)` around the network requests.

- [ ] **Step 2: Add import and subscribe in network-map-ui.ts**

Add `import { networkMapState } from './state/network-map-state';`.

Note: Leaflet map objects (`map`, `userMarker`, `probeMarkers`, etc.) stay as module-level variables since they're DOM resources, not serializable state.

- [ ] **Step 3: Run typecheck and verify**

- [ ] **Step 4: Commit**

```bash
git add src/client/network-map.ts src/client/network-map-ui.ts
git commit -m "feat: dual-write network map data to networkMapState"
```

---

## Chunk 4: Consumer Rewiring

### Task 16: Wire Dashboard to observables

**Files:**
- Modify: `src/client/tabs/dashboard-tab.ts`

- [ ] **Step 1: Replace DOM reads with observable reads in computeOverallScore**

In `dashboard-tab.ts`, replace:
- `document.getElementById('score-number')?.textContent` → `adblockState.score.get()`
- `document.getElementById('headers-grade')?.textContent` → `headersState.grade.get()`

Note: `computeOverallScore()` currently defaults to 50 for unimplemented tools. This placeholder stays until Phase 2.

- [ ] **Step 2: Add observable subscriptions in initDashboard**

Subscribe to `adblockState.score`, `headersState.grade`, `headersState.score` to trigger `renderDashboard()` on changes.

- [ ] **Step 3: Import new state modules**

Add imports for `adblockState`, `headersState`, etc.

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/client/tabs/dashboard-tab.ts
git commit -m "feat: wire dashboard to observable state instead of DOM reads"
```

---

### Task 17: Wire AI Collector to observables

**Files:**
- Modify: `src/client/ai-collector.ts`

- [ ] **Step 1: Replace 8 DOM reads with observable reads**

Replace in `collectTestResults()`:
| Line | DOM Read | Observable |
|------|---------|-----------|
| ~82 | `document.getElementById('headers-grade')?.textContent` | `headersState.grade.get()` |
| ~83 | `document.getElementById('headers-score')?.textContent` | `headersState.score.get()` |
| ~84 | `document.getElementById('headers-url')?.value` | `headersState.url.get()` |
| ~90 | `document.getElementById('score-number')?.textContent` | `adblockState.score.get()` |
| ~91 | `document.getElementById('adblock-total-blocked')?.textContent` | `adblockState.totalBlocked.get()` |
| ~97 | `document.getElementById('fp-score-number')?.textContent` | `fingerprintState.uniquenessScore.get()` |
| ~102 | `document.getElementById('quality-grade')?.textContent` | `qualityState.score.get().grade` |
| ~103 | `document.getElementById('quality-grade-label')?.textContent` | `qualityState.score.get().label` |

- [ ] **Step 2: Add imports**

```ts
import { headersState } from './state/headers-state';
import { adblockState } from './state/adblock-state';
import { fingerprintState } from './state/fingerprint-state';
import { qualityState } from './state/quality-state';
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/client/ai-collector.ts
git commit -m "feat: wire AI collector to observable state"
```

---

### Task 18: Wire Share to observables

**Files:**
- Modify: `src/client/share.ts`

- [ ] **Step 1: Replace DOM reads with state reads where possible**

For each tab section in `buildSummary()`:
- **adblock**: Read from `adblockState.score.get()` instead of `document.getElementById('score-number')`
- **fingerprint**: Read from `fingerprintState.uniquenessScore.get()` instead of `document.getElementById('fp-score-number')`
- **quality**: Read from `qualityState.score.get().grade` instead of `document.getElementById('quality-grade')`
- **headers**: Read from `headersState.grade.get()` instead of `document.getElementById('headers-grade')`
- **cookies**: Read from `cookieState` observables instead of DOM queries
- **tls**: Already has `tlsState` — use it directly

Keep DOM reads for static i18n text (labels that don't change dynamically).

- [ ] **Step 2: Import state modules**

- [ ] **Step 3: Run typecheck and verify**

- [ ] **Step 4: Commit**

```bash
git add src/client/share.ts
git commit -m "feat: wire share module to observable state"
```

---

### Task 19: Wire Export Report to observables

**Files:**
- Modify: `src/client/export-report.ts`

- [ ] **Step 1: Replace module property reads with observable reads**

Replace:
- `SpeedTest.results` → `speedState.download.get()`, `speedState.upload.get()`, etc.
- `AdBlockTest.results` → `adblockState.results.get()`
- `AdBlockTest.getScore()` → `adblockState.score.get()` (construct Score object from observables)
- `FilterListDetector.results` → `adblockState.filterLists.get()`

Replace DOM reads for headers, DNS results, cookies with observable reads where state observables exist.

- [ ] **Step 2: Import state modules**

- [ ] **Step 3: Run typecheck and verify**

- [ ] **Step 4: Commit**

```bash
git add src/client/export-report.ts
git commit -m "feat: wire export report to observable state"
```

---

## Chunk 5: CSS Isolation + Cleanup

### Task 20: Extract shared CSS classes

**Files:**
- Create: `public/css/utilities.css`
- Modify: `index.html` (add link)
- Modify: `public/css/styles.css` (remove moved classes)

- [ ] **Step 1: Create utilities.css with shared classes**

Identify the CSS for `.breach-loading`, `.csp-analysis-card`, and the inline grade styling pattern used by `.tls-target-grade` and `.quality-grade`. Extract these to `public/css/utilities.css`.

For `.tls-target-grade` — this has no existing CSS rule (it's inline-styled). Create a new `.grade-badge` class that captures the common grade display pattern (bold, centered, colored).

- [ ] **Step 2: Add utilities.css link to index.html**

Add before `styles.css`:
```html
<link rel="stylesheet" href="/css/utilities.css">
```

- [ ] **Step 3: Update references in HTML and TS**

Find all references to `.breach-loading`, `.csp-analysis-card` in TypeScript files and ensure they still work.

- [ ] **Step 4: Remove duplicated CSS from styles.css**

Remove the definitions that are now in utilities.css (keeping any that have tool-specific overrides).

- [ ] **Step 5: Run dev server and verify visual appearance**

Run: `npm run dev`
Check: Breach check, cert transparency, DNSSEC validation, privacy exposure, and headers all look correct.

- [ ] **Step 6: Commit**

```bash
git add public/css/utilities.css public/css/styles.css index.html src/client/*.ts
git commit -m "feat: extract shared CSS classes to utilities.css"
```

---

### Task 21: Remove dead code and dual-write remnants

**Files:**
- Modify: `src/client/adblock-test.ts` — remove `results` property and `getScore()` method
- Modify: `src/client/filter-lists.ts` — remove `results` property
- Modify: `src/client/speed-test.ts` — remove `results` property and `getGrade()` method if fully replaced by `speedState`
- Modify: `src/client/breach-check.ts` — ensure no remaining hardcoded strings
- Modify: `src/client/cert-transparency.ts` — ensure `scanInProgress` is fully removed
- Modify: `src/client/dnssec-validation.ts` — ensure `scanInProgress` is fully removed
- Modify: `src/client/headers-ui.ts` — ensure `scanInProgress` is fully removed

**Important:** Only remove `AdBlockTest.results` and `AdBlockTest.getScore()` once ALL consumers (dashboard, AI collector, share, export) are confirmed to read from `adblockState` instead.

- [ ] **Step 1: Verify all consumers use observables**

Grep for `AdBlockTest.results`, `AdBlockTest.getScore()`, `FilterListDetector.results`, `SpeedTest.results`, `SpeedTest.getGrade`. Ensure zero references remain (other than the definitions being removed).

- [ ] **Step 2: Remove module-level mutable state**

- Remove `results` from `AdBlockTest` object
- Remove `getScore()` from `AdBlockTest` object
- Remove `results` from `FilterListDetector` object
- Remove `results` and `getGrade()` from `SpeedTest` (if all consumers now use `speedState`)
- Remove all `scanInProgress` flags (they're now `*.loading.set()`)

- [ ] **Step 3: Run full test suite**

Run: `npm run test && npm run typecheck && npm run lint`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove dead module-level mutable state, now replaced by observables"
```

---

### Task 22: Cookie i18n gap fill

**Files:**
- Modify: `src/client/i18n.ts`
- Modify: `src/client/locales/*.ts`
- Modify: `src/client/tabs/cookie-tab.ts` (if needed)

- [ ] **Step 1: Audit existing cookie.* i18n keys**

Search `src/client/i18n.ts` for existing `cookie.` keys. List them all.

Existing keys found: `cookie.title`, `cookie.desc`, `cookie.audit`, `cookie.auditing`, `cookie.error`, `cookie.ready`, `cookie.total`, `cookie.size`, `cookie.grade`, `cookie.httpOnlyNote`, `cookie.noCookie`, `cookie.secure`, `cookie.category`, `cookie.retry`.

- [ ] **Step 2: Identify missing keys**

Check `src/client/tabs/cookie-tab.ts` for any hardcoded English strings not covered by existing `cookie.*` keys. Add only what's missing under the `cookie.` namespace (not `cookieAudit.`).

- [ ] **Step 3: Add missing keys to i18n.ts and all 5 locale files**

- [ ] **Step 4: Replace hardcoded strings in cookie-tab.ts**

- [ ] **Step 5: Run typecheck**

- [ ] **Step 6: Commit**

```bash
git add src/client/i18n.ts src/client/locales/*.ts src/client/tabs/cookie-tab.ts
git commit -m "feat: fill cookie audit i18n gaps"
```

---

### Task 23: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run test`

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run lint**

Run: `npm run lint`

- [ ] **Step 4: Run dev server and manually verify all tabs**

Run: `npm run dev`

Check each tab:
- Dashboard: overall score displays, stats update
- DNS Check: resolvers, security, lookup all work
- Speed Test: download, upload, latency all work
- Ad Block: test runs, score displays
- Headers: scan works, grade displays
- Fingerprint: detection runs, score displays
- Connection Quality: test runs, grade displays
- Network Map: map loads, pings work
- AI Analysis: can analyze results (cloud mode)
- History: shows past tests
- TLS Check: target domain check works
- Email Security: SPF/DKIM/DMARC checks work
- HTTP/3: ping test works
- Cookie Audit: cookie scan works
- Breach Check: password check works, shows translatable strings
- Cert Transparency: domain search works, shows translatable strings
- DNSSEC Validation: domain check works, shows translatable strings
- Privacy Exposure: test runs, shows translatable strings

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "chore: final verification of foundation fine-tuning Phase 1"
```