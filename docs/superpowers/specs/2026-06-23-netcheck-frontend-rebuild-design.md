# NetCheck Frontend Rebuild — Design Spec

**Date:** 2026-06-23
**Status:** Draft (post-review revisions)
**Scope:** Frontend-only rebuild with new UI/UX. Worker backend, observable state layer, test engines, i18n, Share/Export, theme toggle retained. PWA dropped.

---

## 1. Goals

- Replace the 17-tab UI with **6 consolidated workflows**.
- New visual design system (personality TBD via mockup).
- New navigation model (TBD via mockup).
- Keep all backend API routes, observable state layer, test engines, i18n, Share/Export, theme toggle unchanged.
- Drop PWA support (manifest, service worker, install prompt, offline page).

## 2. Non-Goals

- Backend route changes (including the orphaned `/api/headers` route — left as-is, see §11).
- New features beyond current set.
- Framework adoption (staying vanilla TS).
- Consolidating the dual Tailwind+CSS styling approach.

---

## 3. Module Classification

Every top-level `src/client/*.ts` module (53 files, excluding tests) is classified into one of the buckets below. State modules (`src/client/state/*.ts`, 21 files) are all **Unchanged** per §3.1's parent contract (observable state layer retained). Locale files (`src/client/locales/*.ts`, 6 files) are **Unchanged** (keys reused, new keys added in Phase 11). This resolves the review finding that ~15 engine modules were unclassified.

### 3.1 Unchanged — Pure logic, no DOM coupling

These modules have zero `document.*` / `getElementById` / `querySelector` calls. They are imported and called by the UI layer but contain no rendering. The rebuild does not touch them.

| Module | Purpose | Workflow |
|--------|---------|----------|
| `dns-check.ts` | IP detection, DNS API client | W2 |
| `dns-audit.ts` | DNS audit orchestration | W2 |
| `doh-test.ts` | DNS-over-HTTPS test | W2 |
| `dns-benchmark.ts` | DNS resolver benchmarking | W2 |
| `speed-test.ts` | Speed test engine (16.8K) | W3 |
| `speed-monitor.ts` | Speed monitoring loop | W3 |
| `network-map.ts` | Network map data + probing | W3 |
| `cf-pops.ts` | Cloudflare PoP coordinates | W3 |
| `ai-cloud.ts` | Cloud AI engine (Workers AI) | W6 |
| `ai-local.ts` | On-device AI engine (Transformers.js) | W6 |
| `ai-prompt.ts` | LLM prompt builder | W6 |
| `adblock-cname.ts` | CNAME tracker detection | W5 |
| `connection-quality.ts` | Quality measurement logic | W3 |
| `escape.ts` | HTML escape utility | shared |
| `logger.ts` | Logging utility | shared |
| `locale-events.ts` | Locale change notifier | shared |
| `types.ts` | Shared TypeScript interfaces | shared |
| `history.ts` | Legacy speed history store | W3 |
| `affiliates.ts` | Affiliate link mapping | shared |

### 3.2 Adapt DOM coupling — Logic stays, DOM refs updated

These modules contain logic AND touch the DOM (by ID, selector, or element creation). The logic is unchanged; DOM references are updated to match the new HTML structure during the relevant workflow phase.

| Module | DOM coupling | Workflow | Phase |
|--------|-------------|----------|-------|
| `dnssec-validation.ts` | `#dnssec-results`, `#dnssec-domain-input`, `#dnssec-check-btn` | W2 | 6 |
| `cert-transparency.ts` | `#ct-*` elements | W4 | 8 |
| `speed-graph.ts` | `#speed-graph` canvas | W3 | 7 |
| `speed-suggestions.ts` | `#speed-suggestions-grid` | W3 | 7 |
| `fingerprint.ts` | `#fp-*` elements | W5 | 9 |
| `filter-lists.ts` | `#filter-list-grid` | W5 | 9 |
| `breach-check.ts` | `#breach-*` elements | W5 | 9 |
| `privacy-exposure.ts` | `#privacy-exposure-results` | W5 | 9 |
| `adblock-test.ts` | `#test-categories` | W5 | 9 |
| `ai-collector.ts` | Reads DOM by ID for AI input | W6 | 10 |
| `error-boundary.ts` | `safeInit` / `safeInitAsync` wrappers | shared | 11 |
| `ui-utils.ts` | `renderSkeletonRows`, helpers | shared | 4 |

### 3.3 Rebuilt — Render layer rewritten

These modules are the UI layer. They are fully rewritten for the new design system and 6-workflow structure.

| Module | LOC | Rebuilt in phase |
|--------|-----|-----------------|
| `index.html` | 950+ | 2 |
| `public/css/tokens.css` | 240 | 1 |
| `public/css/styles.css` | 3300+ | 1 |
| `public/css/utilities.css` | — | 1 |
| `src/client/app.css` | — | 1 |
| `src/client/app.ts` | 298 | 3 |
| `src/client/components/card.ts` | 38 | 4a |
| `src/client/components/badge.ts` | — | 4a |
| `src/client/components/progress.ts` | — | 4a |
| `src/client/components/workflow-nav.ts` | NEW | 4a |
| `src/client/components/sub-nav.ts` | NEW | 4a |
| `src/client/components/score-ring.ts` | NEW | 4b |
| `src/client/components/gauge.ts` | NEW | 4b |
| `src/client/components/data-table.ts` | NEW | 4b |
| `src/client/tabs/overview-tab.ts` | (was dashboard-tab.ts, 493) | 5 |
| `src/client/tabs/dns-tab.ts` | (merges dns-ui.ts, 635 + sub-modules) | 6a/6b |
| `src/client/tabs/speed-performance-tab.ts` | (merges speed-ui, connection-quality-ui, network-map-ui, history-tab) | 7a/7b |
| `src/client/tabs/security-scan-tab.ts` | (merges headers-ui, tls-tab, http3-tab, email-tab) | 8a/8b |
| `src/client/tabs/privacy-blocking-tab.ts` | (merges adblock-ui, fingerprint-ui, filter-ui) | 9a/9b |
| `src/client/tabs/ai-analysis-tab.ts` | (was ai-analysis-ui.ts, 519) | 10 |
| `src/client/analytics.ts` | 1.1K | 11 |
| `src/client/onboarding.ts` | 1.5K | 11 |
| `src/client/motion.ts` | 1.3K | 11 |
| `src/client/tooltip.ts` | 3.1K | 11 |
| `src/client/a11y.ts` | 4.5K | 11 |
| `src/client/share.ts` | 148 | 11 |
| `src/client/export-report.ts` | 513 | 11 |
| `src/client/i18n.ts` | 250 | 11 |
| `src/client/theme.ts` | 1.4K | 11 (adapt only) |
| `src/client/network-change.ts` | 2.7K | 11 |

### 3.3a Implicitly rebuilt — Old UI modules absorbed into new tab files

These existing UI modules are **fully rewritten** but not listed individually in §3.3 because their functionality is absorbed into the new workflow tab files listed there. They appear here for explicit bucket assignment — the "every module classified" contract (§3) applies to them too. Each is replaced by the new tab module shown in the "Replaced by" column; the old file is deleted at the end of that phase.

| Old module | LOC | Replaced by | Phase |
|-----------|-----|-------------|-------|
| `tabs/dashboard-tab.ts` | 493 | `tabs/overview-tab.ts` | 5 |
| `dns-ui.ts` | 635 | `tabs/dns-tab.ts` | 6a/6b |
| `speed-ui.ts` | 351 | `tabs/speed-performance-tab.ts` | 7a |
| `connection-quality-ui.ts` | 403 | `tabs/speed-performance-tab.ts` | 7a |
| `network-map-ui.ts` | — | `tabs/speed-performance-tab.ts` | 7b |
| `tabs/history-tab.ts` | 313 | `tabs/speed-performance-tab.ts` | 7b |
| `headers-ui.ts` | 397 | `tabs/security-scan-tab.ts` | 8a |
| `tabs/tls-tab.ts` | 478 | `tabs/security-scan-tab.ts` | 8a |
| `tabs/http3-tab.ts` | 110 | `tabs/security-scan-tab.ts` | 8b |
| `tabs/email-tab.ts` | 349 | `tabs/security-scan-tab.ts` | 8b |
| `adblock-ui.ts` | 364 | `tabs/privacy-blocking-tab.ts` | 9a |
| `fingerprint-ui.ts` | 206 | `tabs/privacy-blocking-tab.ts` | 9a |
| `filter-ui.ts` | — | `tabs/privacy-blocking-tab.ts` | 9b |
| `tabs/cookie-tab.ts` | 198 | `tabs/privacy-blocking-tab.ts` | 9b |
| `ai-analysis-ui.ts` | 519 | `tabs/ai-analysis-tab.ts` | 10 |

**15 old UI modules** absorbed into 6 new workflow tab files. All are deleted after their replacement phase passes verification.

### 3.4 Deleted

| Module | Reason |
|--------|--------|
| `public/manifest.json` | PWA dropped |
| `public/sw.js` | PWA dropped |
| `public/offline.html` | PWA dropped (orphaned by sw.js removal) |
| `src/client/install-prompt.ts` | PWA dropped |

### 3.5 Unchanged — Entry point & type declarations

| Module | Purpose | Notes |
|--------|---------|-------|
| `main.ts` | Vite entry (`import './app';`) | Unchanged — imports `app.ts` which is rebuilt in Phase 3 |
| `leaflet.d.ts` | Leaflet type declaration | Unchanged — used by network-map-ui (absorbed into W3) |

---

## 4. Workflow Consolidation Map

### Workflow 1: Overview
- **Merges:** Dashboard, About (about section folded into Overview footer)
- **State:** `appState`, `dnsState`, `speedState`, `tlsState`, `adblockState`, `headersState`, `fingerprintState`, `qualityState`
- **Routes:** `/api/ip`, `/api/analytics`
- **Data source contract:** Overview displays **cached state** from other workflows. It does not re-run tests. On first load, it triggers the lightweight auto-runs (IP detection, analytics ping) but defers heavy tests to their respective workflows. The dashboard score is computed from `appState.completedTests` via `scoreToGrade()` (existing logic in dashboard-tab.ts:41-46).
- **Content:** Overall network score, IP/location card, latest speed/latency cards, quick-status across all categories, About blurb.

### Workflow 2: DNS
- **Merges:** DNS + DNSSEC Validation + IPv6 Readiness + DNS Lookup + DNS Benchmark + Resolution Path
- **State:** `dnsState` (incl. `.ipv6` sub-observable, populated by `runIpv6Check()` in `state/ipv6-check.ts`), `dnssecValidationState`
- **Note:** `ipv6Check` is a **runner function**, not a state export. The UI subscribes to `dnsState.ipv6`, not to an `ipv6Check` observable. `runIpv6Check()` is called during W2 init.
- **State also used:** `compareState` is NOT used here.
- **Routes:** `/api/dns`, `/api/dns/check-resolvers`, `/api/dns/check-security`, `/api/dns/hijack-check`, `/api/dns/ecs-check`, `/api/dns/benchmark`, `/api/dns/dnssec-validate`
- **Content:** IP info, resolver cards, security checks, DNSSEC chain validator, IPv6 readiness, DNS lookup tool, benchmark, resolution path, suggestions — as sub-sections within the workflow.

### Workflow 3: Speed & Performance
- **Merges:** Speed Test + Connection Quality + History + Network Map
- **State:** `speedState`, `qualityState`, `historyState`, `networkMapState`, `compareState` (used by history compare feature, history-tab.ts:214,253)
- **Routes:** `/api/speedtest/ping`, `/api/speedtest/down`, `/api/speedtest/up`, `/api/map/probes`, `/api/map/ping`
- **Content:** Speed gauges + grade, connection quality score, history chart + comparison (uses `compareState`), network latency map. Sub-navigation between the four.

### Workflow 4: Security Scan
- **Merges:** Headers + TLS + HTTP/3 + Cert Transparency + Email Security
- **State:** `headersState`, `tlsState`, `http3State`, `certTransparencyState`, `emailState`
- **Routes:** `/api/headers/check`, `/api/tls/check`, `/api/cert-transparency`, `/api/email-security`
- **Note:** The bare `/api/headers` route (Worker index.ts:66, echoes request headers) has **no client-side caller** — confirmed by grep. It is an orphaned backend route, left untouched per Non-Goals. Not mapped to any workflow.
- **Content:** URL input for headers scan, TLS inspector (self + target domain), HTTP/3 support, CT log search, email security (SPF/DKIM/DMARC). Unified "scan a target" interface where possible.

### Workflow 5: Privacy & Blocking
- **Merges:** Ad Block + Fingerprint + Privacy Exposure + Cookies + Breach
- **State:** `adblockState`, `fingerprintState`, `privacyExposureState`, `cookieState`, `breachState`
- **Routes:** `/api/adblock/stats`, `/api/adblock/submit` (POST)
- **Client-only features:** Fingerprint, Privacy Exposure, Cookie Audit, and Breach Check are **client-side** — they do not call Worker routes. Only Ad Block stats/submission hits the backend. The spec explicitly states this: W5 has 1 backend route for 5 features; 4 are browser-local.
- **Content:** Ad block score + categories, fingerprint uniqueness, privacy exposure scan, cookie audit, breach check (HaveIBeenPwned k-anonymity via `api.pwnedpasswords.com` — allowed by CSP). Sub-navigation between the five.

### Workflow 6: AI Analysis
- **Merges:** AI Analysis (standalone)
- **State:** `aiState`
- **Routes:** `/api/ai/analyze`
- **Content:** Cloud AI + on-device AI toggle, collected results from all workflows (via `ai-collector.ts` which reads DOM — adapted in Phase 10), LLM analysis output. Privacy consent flow retained.

---

## 5. Design System

**Resolved via visual companion mockups (2026-06-23):**

### 5.1 Design Personality: Editorial Report
- **Background:** Warm off-white (#F5F5F0 light mode), dark variant for dark theme
- **Typography:** Serif display headings (Georgia / Tiempos / Fraunces), Inter for body, JetBrains Mono for data values
- **Accent color:** Muted greens (#3B6B00 light, adapted for dark)
- **Character:** Premium diagnostic report — not a hacker tool. Big numbers, sparse chrome, generous whitespace, italic callouts
- **Grade colors:** A+ green → F red (retained), but muted to fit editorial palette
- **Motion:** `motion.ts` retained, adapted for editorial transitions (subtle, not flashy)

### 5.2 Navigation Model: Top Tab Bar
- Horizontal tabs under header: Overview · DNS · Speed · Security · Privacy · AI
- Active tab: serif label + 2px bottom border in accent green
- Mobile: bottom tab bar (icons + labels)
- No sidebar, no command palette

### 5.3 Workflow Layouts (resolved per mockup)

| Workflow | Layout pattern | Mockup choice |
|----------|---------------|---------------|
| **Overview** | Hero + Grid — score and IP side by side at top, 2×4 card grid for quick status | B |
| **DNS** | Pill sub-tabs — 6 pills (Resolvers / DNSSEC / IPv6 / Lookup / Benchmark / Path). IP card pinned above pills. One active at a time | A |
| **Speed & Performance** | Speed as hero + collapsible sections — Speed Test always expanded as primary. Quality, History, Map as collapsible sections below | B |
| **Security Scan** | Self + Target split — top: auto-detected connection (TLS, HTTP/3, cipher). Bottom: target domain input with pills for scan type (Headers / TLS / HTTP/3 / CT / Email) | B |
| **Privacy & Blocking** | Pill sub-tabs — 5 pills (Ad Block / Fingerprint / Exposure / Cookies / Breach). One active at a time. Consistent with DNS pattern | A |
| **AI Analysis** | Single panel — cloud/on-device toggle + results output. No sub-tabs needed | — |

### 5.4 Sub-navigation patterns
Two patterns, used contextually:
1. **Pill sub-tabs** (rounded, accent-green active): DNS (6), Privacy (5) — many sub-features, equal weight
2. **Hero + collapsible** (dot + serif heading, ▾ expand): Speed & Performance (4) — one primary, rest secondary
3. **Self + target split**: Security Scan (5) — two distinct scan modes

### 5.5 Confirmed regardless of personality
- CSS custom properties token system (`tokens.css`) retained as architecture
- Dark + light themes via `data-theme` attribute on `<html>`
- Category accent colors remapped per workflow in muted editorial palette
- Status semantics: pass (muted green #228B22) / warn (amber #946B00) / fail (red #CC1F3D) / neutral
- Grade scale colors: A+ through F, muted for editorial
- Motion library (`motion.ts`) for transitions — adapted, not replaced
- JetBrains Mono for data values
- Inter for body text
- Serif (Georgia/Tiempos/Fraunces) for display headings

---

## 6. Architecture

### Routing
```
app.ts
├── initRouter() — hash-based routing for 6 workflows
├── initWorkflow(workflowId) — lazy-mount workflow content
├── bindNav() — nav link click handlers
├── bindToolbar() — language, theme, export, share dropdowns
└── bootstrap() — DOMContentLoaded orchestrator
```

### State binding pattern (unchanged)
UI modules subscribe to existing observables:
```ts
dnsState.securityChecks.subscribe((checks) => renderDnsSecurity(checks));
```

### Component primitives
- `Card` — rebuild with new design
- `Badge` — status indicators
- `Progress` — loading bars
- `WorkflowNav` — top-level workflow switcher (NEW)
- `SubNav` — in-workflow section tabs (NEW)
- `ScoreRing` — circular score display, extracted from current inline SVG (NEW)
- `Gauge` — speed gauge component, extracted from current speed UI (NEW)
- `DataTable` — reusable table for DNS records, headers, etc. (NEW)

---

## 7. Phased Execution Plan

Each phase ≤5 files. Verification gate (typecheck + lint + build) between every phase. The review found the original 13-phase plan violated the ≤5-file cap on Phases 4 and 6; both are now split.

| Phase | Files | Output | Verification |
|-------|-------|--------|--------------|
| 0a: Delete PWA | Delete `manifest.json`, `sw.js`, `offline.html`, `install-prompt.ts` | Dead files removed | `tsc --noEmit` |
| 0b: Remove PWA refs | `app.ts`, `index.html` (remove install-prompt import + manifest link) | Clean refs | `tsc` + `eslint` |
| 1: Design tokens | `tokens.css`, `styles.css`, `utilities.css`, `app.css` | New design system | Visual review |
| 2: HTML shell | `index.html` | 6-workflow nav + section structure | `vite build` |
| 3: Routing | `app.ts` | Workflow router + nav binding | `tsc` + `eslint` |
| 4a: Core primitives | `components/card.ts`, `badge.ts`, `progress.ts`, `workflow-nav.ts`, `sub-nav.ts` | 5 primitives | Unit tests |
| 4b: Data primitives | `components/score-ring.ts`, `gauge.ts`, `data-table.ts`, `ui-utils.ts` | 3 new + 1 adapted | Unit tests |
| 5: Overview | `tabs/overview-tab.ts` | Workflow 1 complete | `tsc` + visual |
| 6a: DNS core | `tabs/dns-tab.ts` (core: IP, resolvers, security, DNSSEC), `dnssec-validation.ts` (adapt DOM) | W2 part 1 | `tsc` + visual |
| 6b: DNS tools | `tabs/dns-tab.ts` (sub-sections: IPv6, lookup, benchmark, resolution path) | W2 complete | `tsc` + visual |
| 7a: Speed | `tabs/speed-performance-tab.ts` (speed + quality), `speed-ui.ts`, `connection-quality-ui.ts`, `speed-suggestions.ts` (adapt DOM) | W3 part 1 | `tsc` + visual |
| 7b: Perf history | `tabs/speed-performance-tab.ts` (history + map), network-map-ui, `speed-graph.ts` (adapt) | W3 complete | `tsc` + visual |
| 8a: Security core | `tabs/security-scan-tab.ts` (headers + TLS), `headers-ui.ts`, `tls-tab.ts` | W4 part 1 | `tsc` + visual |
| 8b: Security extras | `tabs/security-scan-tab.ts` (HTTP/3 + CT + email), `cert-transparency.ts` (adapt), `email-tab.ts` | W4 complete | `tsc` + visual |
| 9a: Privacy core | `tabs/privacy-blocking-tab.ts` (ad block + fingerprint), `adblock-ui.ts`, `fingerprint-ui.ts` | W5 part 1 | `tsc` + visual |
| 9b: Privacy extras | `tabs/privacy-blocking-tab.ts` (privacy exposure + cookies + breach), `tabs/cookie-tab.ts` (absorb into W5), `filter-ui.ts`, `breach-check.ts` (adapt), `privacy-exposure.ts` (adapt) | W5 complete | `tsc` + visual |
| 10: AI Analysis | `tabs/ai-analysis-tab.ts`, `ai-collector.ts` (adapt) | W6 complete | `tsc` + visual |
| 11: Wiring | `share.ts`, `export-report.ts`, `i18n.ts`, `a11y.ts`, `analytics.ts` | Core systems connected | `vitest run` |
| 11b: Wiring extras | `onboarding.ts`, `motion.ts`, `tooltip.ts`, `network-change.ts`, `error-boundary.ts` | All systems connected | `vitest run` |
| 11c: Locale propagation | `en.ts`, `zh-TW.ts`, `zh-CN.ts`, `es.ts`, `ja.ts`, `ko.ts` (split 5+1) | 6 nav keys across 6 locales | `vitest run` |
| 12: E2E | `e2e/visual/visual.spec.ts`, `playwright.config.ts` | Updated e2e | `npx playwright test` |

**Total: 22 phases** (0a, 0b, 1, 2, 3, 4a, 4b, 5, 6a, 6b, 7a, 7b, 8a, 8b, 9a, 9b, 10, 11, 11b, 11c, 12). Each respects the ≤5-file constraint.

---

## 8. Testing Strategy

- **Unit:** Existing Vitest tests for state modules stay green (no state changes). New component tests added in Phases 4a/4b.
- **Type-check:** `npx tsc --noEmit` after every phase.
- **Lint:** `npx eslint .` after every phase.
- **Build:** `npm run build` after Phase 2 onward.
- **E2E:** Playwright visual spec updated in Phase 12.
- **Manual:** `npm run dev` visual review after each workflow phase.

---

## 9. Accessibility Plan

The rebuild must maintain the existing a11y commitments and extend them to the new workflow structure:

1. **Keyboard navigation:** The 6-workflow router must support arrow-key + Tab navigation. `a11y.ts` currently maps number keys `1`-`8` to tabs (line 87); this is remapped to `1`-`6` for workflows. Sub-navigation within workflows uses Tab/Shift+Tab.
2. **Focus management:** On workflow switch, focus moves to the workflow's `<section>` heading (existing `tabindex="-1"` + `role="region"` pattern preserved).
3. **ARIA patterns:** ScoreRing and Gauge are non-text state indicators — they get `role="img"` + `aria-label` with the numeric value. WorkflowNav uses `role="tablist"` / `role="tab"` / `role="tabpanel"` semantics.
4. **Reduced motion:** `motion.ts` respects `prefers-reduced-motion`; the rebuild does not add new animations that bypass this check.
5. **Skip link:** The existing `.skip-link` to `#main` is preserved.
6. **Existing a11y tests:** `src/client/__tests__/a11y.test.ts` must stay green. Updated in Phase 11.
7. **axe-core:** Already a devDependency — run axe in Phase 12 e2e for automated a11y regression.

---

## 10. Performance Budget

- **Initial JS:** ≤95KB gzipped (current is ~90KB). The 6-workflow consolidation must not bloat the initial bundle.
- **Code-splitting:** Non-active workflows are lazy-loaded via dynamic `import()`. Only Overview loads on first paint.
- **CSS:** ≤15KB gzipped (current is ~13KB). Design system rewrite must stay within budget.
- **LCP:** ≤2.5s on a 3G connection (Cloudflare edge serves the HTML).
- **Fonts:** Inter + JetBrains Mono via Google Fonts with `display=swap` (existing pattern preserved).
- **No new dependencies** beyond what's in `package.json`. The `motion` library is retained for animations.

---

## 11. Migration & Rollback

### Hash route migration
The new 6-workflow router uses new hash routes (e.g., `#overview`, `#dns`, `#speed`, `#security`, `#privacy`, `#ai`). The old 17 tab hashes (`#dashboard`, `#adblock`, `#headers`, `#tls`, `#fingerprint`, `#quality`, `#network`, `#history`, `#about`, `#email-security`, `#cert-transparency`, `#http3`, `#cookies`, `#breach`, `#ai-analysis`) will break.

**Migration approach:** The router includes a redirect map for old hashes → new workflows:
```ts
const LEGACY_REDIRECTS: Record<string, string> = {
  'dashboard': 'overview', 'about': 'overview',
  'dns': 'dns', // same
  'speed': 'speed', // same
  'adblock': 'privacy', 'fingerprint': 'privacy', 'cookies': 'privacy', 'breach': 'privacy',
  'headers': 'security', 'tls': 'security', 'http3': 'security', 'cert-transparency': 'security', 'email-security': 'security',
  'quality': 'speed', 'network': 'speed', 'history': 'speed',
  'ai-analysis': 'ai',
};
```
This preserves bookmarks. Implemented in Phase 3.

### Rollback
- Each phase is committed separately with a conventional commit message.
- If a phase fails verification (typecheck/lint/build), fix before proceeding — never commit broken code.
- Git tags mark phase boundaries (`phase-0`, `phase-1`, ...) for quick rollback.
- No feature flags — the rebuild is a clean cutover on a feature branch, merged to `main` only when all phases pass.

### SEO / sitemap
The Worker serves `/sitemap.xml` with a single `<url>` for `/` (index.ts:175-201). No new sitemap entries needed (hash routes are not crawlable). If the new design changes meta tags per workflow, the existing `updateMeta()` function in `app.ts:96-111` is adapted in Phase 3. OG image (`public/og-image.png`) stays unless the visual mockup redesigns it.

### Offline behavior
With PWA dropped, there is no service worker. `offline.html` is deleted (Phase 0). Users on flaky connections get the browser's default offline error. This is an accepted tradeoff — the app requires connectivity to run network tests anyway.

---

## 12. i18n Key Plan

- **Existing keys:** All keys in `locales/en.ts` (and the 5 other locale files) are reused where possible. The rebuild does not delete keys wholesale.
- **New keys needed:**
  - `nav.overview`, `nav.dns`, `nav.speed`, `nav.security`, `nav.privacy`, `nav.ai` (6 workflow labels)
  - Sub-navigation labels for each workflow's sub-sections
  - Any merged-section headings (e.g., "Speed & Performance" vs separate "Speed Test" / "Connection Quality")
- **Process:** Phase 2 (HTML shell) references existing `data-i18n` keys. New keys are added to `en.ts` first, then propagated to the other 5 locale files in Phase 11c. `locale-events.ts` notifies UI of locale changes (unchanged).

- **Audit:** Phase 11 cross-references all `data-i18n` attributes in the new `index.html` against `locales/en.ts` to catch drift. Phase 11c adds the 6 new nav keys to all 6 locale files.
---

## 13. Browser Support

- **Target:** Latest 2 versions of Chrome, Firefox, Safari, Edge (desktop + mobile).
- **iOS:** Safari 16+ (for `structuredClone`, `crypto.randomUUID`, and CSS nesting via Tailwind v4).
- **No IE support** (already the case).
- **ScoreRing/Gauge:** Use inline SVG (no canvas dependency) for broad compatibility. `DataTable` uses native `<table>` — no virtualization needed (result sets are small, <100 rows).
- **Feature detection:** Network Information API, `navigator.connection`) is feature-detected as in current `connection-quality.ts`.

---

## 14. Error / Empty / Loading States

- **Loading:** `ui-utils.ts:renderSkeletonRows()` is adapted in Phase 4b. Each workflow shows skeleton placeholders while tests run.
- **Error:** `error-boundary.ts` (`safeInit` / `safeInitAsync`) wraps every workflow init — unchanged pattern, adapted to new module names in Phase 11.
- **Empty:** Workflows that require user action (Security Scan URL input, DNS Lookup, DNSSEC Validation) show instructive empty-state copy, not blank space. Empty-state text is i18n-keyed.

---

## 15. Risks (updated)

1. **Share/Export DOM coupling** — `share.ts` reads DOM by element ID (148 LOC, ~15 `getElementById` calls). New HTML must preserve IDs or `share.ts` is updated in Phase 11. **Mitigation:** audit all `getElementById` in `share.ts` before Phase 2; document required IDs in the HTML spec.
2. **i18n key drift** — new HTML must use existing `data-i18n` keys. **Mitigation:** Phase 2 cross-references `locales/en.ts` keys; Phase 11c adds new keys to all 6 locales.
3. **`ai-collector.ts` DOM coupling** — reads DOM by ID to collect test results for AI input. **Mitigation:** adapted in Phase 10 alongside the AI workflow rebuild.
4. **Bundle size** — consolidating tabs may increase initial bundle. **Mitigation:** lazy-load non-active workflows via dynamic `import()` (Phase 3 router).
5. **`/api/headers` orphaned route** — no client caller; left untouched per Non-Goals. **Mitigation:** none needed; route is harmless.
6. **DNS workflow complexity** — W2 merges 6 sub-features. **Mitigation:** split into Phases 6a/6b per the phased plan.
7. **Engine modules with DOM coupling** — 9 modules (§3.2) have DOM refs that must match new HTML. **Mitigation:** each is adapted in its workflow phase; a pre-audit in Phase 2 documents all required element IDs.

---

## 16. Visual Companion Decisions (RESOLVED)

All 7 open items resolved via browser mockups on 2026-06-23:

1. **Design personality:** Editorial Report (warm off-white, serif headings, muted greens)
2. **Navigation model:** Top Tab Bar (horizontal tabs, bottom bar on mobile)
3. **Overview layout:** Hero + Grid (score/IP side by side, 2×4 status card grid)
4. **DNS sub-nav:** Pill sub-tabs (6 pills, IP card pinned above)
5. **Speed & Performance:** Speed as hero + collapsible sections (Quality/History/Map below)
6. **Security Scan:** Self + Target split (auto-detected self on top, target domain with pills below)
7. **Privacy & Blocking:** Pill sub-tabs (5 pills, consistent with DNS)

See §5 for full design system details.

---

## Appendix A: Full Module Inventory

53 source modules in `src/client/` (excluding tests) + 4 in `src/client/components/` + 17 in `src/client/state/` + 6 in `src/client/tabs/` + 6 in `src/client/locales/` + 3 CSS files in `public/css/` + `index.html` = 90 files total in the frontend.

Classification summary:
- **Unchanged (pure logic):** 19 modules
- **Adapt DOM coupling:** 12 modules
- **Rebuilt (new tab files + components):** 14 existing UI modules (§3.3) + 15 old UI modules absorbed (§3.3a) + 11 new files (6 components + 5 new tab modules beyond the replaced ones) = 40 rebuilt/created
- **Unchanged entry/declarations:** 2 modules (§3.5)
- **Deleted:** 4 files