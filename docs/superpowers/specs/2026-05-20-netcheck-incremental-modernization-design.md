# NetCheck Incremental Modernization Design

**Date:** 2026-05-20
**Status:** Approved
**Approach:** Incremental Modernization (4 phases, ~5 weeks total)

## Context

NetCheck is a comprehensive client-side network diagnostics tool — vanilla TypeScript SPA on Cloudflare Workers with 8 tabs (DNS, Speed, Ad Block, Headers, Fingerprint, Quality, Network Map, About). The primary maintainability bottlenecks are:

1. **Monolithic UI files** — each `*-ui.ts` (400-500 LOC) mixes DOM construction, event handling, data fetching, and rendering
2. **No shared state** — tabs can't inform each other (e.g., DNS results can't auto-suggest speed test targets)
3. **No CI/CD** — no GitHub Actions, no automated testing on push, no linting in pipeline
4. **No component reuse** — gauge, badge, card patterns are duplicated across tabs

**Goal:** Maintainability-first, with UX and feature improvements layered on top of a better architecture. Each phase is independently shippable.

---

## Phase 1 — Foundation (~1 week)

### 1.1 CI/CD Pipeline

**GitHub Actions workflow** on `.github/workflows/ci.yml`:
- Trigger: push to any branch, PRs to main
- Steps: ESLint → TypeScript typecheck → Vitest unit tests → Vite build check
- Deploy job: `wrangler deploy` on merge to main (secrets via GitHub Actions)

### 1.2 Lint & Format

- `eslint.config.js` — flat config with `@typescript-eslint/recommended`, `no-console` rule (use structured logging)
- `.prettierrc` — consistent formatting, enforced in CI
- `npm run lint` and `npm run format` scripts in `package.json`

### 1.3 State Management Layer

**New directory:** `src/client/state/`

`observable.ts` — minimal reactive primitive (~50 LOC):
```typescript
type Subscriber<T> = (value: T) => void;

interface Observable<T> {
  get(): T;
  set(value: T): void;
  subscribe(fn: Subscriber<T>): () => void;
}

function observable<T>(initial: T): Observable<T>;
function derive<T>(sources: Observable<any>[], compute: (...values: any[]) => T): Observable<T>;
```

Per-tab state modules:
- `dns-state.ts` — IP, geolocation, resolver results, DNSSEC, WebRTC leak status
- `speed-state.ts` — download, upload, latency, jitter, bufferbloat, grade
- `adblock-state.ts` — score, category results, filter list detection
- `headers-state.ts` — scanned URL, header results, grade
- `fingerprint-state.ts` — uniqueness score, category results
- `quality-state.ts` — connection info, TLS details, timing, stability
- `network-state.ts` — probe latencies, map data
- `shared-state.ts` — cross-tab data (overall score, last test times, IP shared across tabs)

No DOM logic in state files. State modules export `Observable` instances and action functions.

### 1.4 Shared Components

**New directory:** `src/client/components/`

Extract reusable render functions from existing UI files:
- `gauge.ts` — circular/speed gauge (used by Speed, Quality)
- `badge.ts` — pass/warn/fail badge (used by DNS, Headers, Ad Block)
- `card.ts` — result card layout (used by all tabs)
- `progress.ts` — progress bar/skeleton (used by all tabs)
- `chart.ts` — canvas-based line chart (used by Speed, History)

Each component: pure function `(container: HTMLElement, data: ComponentProps) => void`. No internal state, no side effects — reads from observables and renders.

### 1.5 File Structure After Phase 1

```
src/client/
  state/
    observable.ts          # Reactive primitive
    dns-state.ts
    speed-state.ts
    adblock-state.ts
    headers-state.ts
    fingerprint-state.ts
    quality-state.ts
    network-state.ts
    shared-state.ts
  components/
    gauge.ts
    badge.ts
    card.ts
    progress.ts
    chart.ts
  tabs/
    dns-tab.ts              # Composes dns-state + components
    speed-tab.ts
    adblock-tab.ts
    headers-tab.ts
    fingerprint-tab.ts
    quality-tab.ts
    network-tab.ts
    dashboard-tab.ts        # (Phase 2 — placeholder for now)
  app.ts
  main.ts
  i18n.ts
  theme.ts
  ...existing utils...
```

Existing `*-ui.ts` files are refactored to become thin `*-tab.ts` wrappers that compose state + components. The logic that was in `*-ui.ts` splits into `state/` (data) and `components/` (rendering).

---

## Phase 2 — UX Layer (~1.5 weeks after Phase 1)

### 2.1 Dashboard Overview Tab

New default landing tab (`dashboard-tab.ts`). Replaces DNS as the first tab users see.

**Layout:**
- **Overall Score** card (A+ through F, computed from all completed tests)
- **Quick Stats** row — download speed, latency, IP/PoP (populated as tests run)
- **Quick Status** panel — one-line results from each completed test: DNS security (✓/✗), WebRTC leak, Ad Block score, Security headers, TLS version
- **Test History** mini-chart — last 7 days of speed test results as bar chart
- **Action Buttons** — "Run DNS Check", "Run Speed Test", "Run All Security"

**Data sources:**
- `shared-state.ts` — aggregates data from all tab states
- `history.ts` — existing localStorage history, expanded to store more metrics
- Dashboard doesn't run any tests itself — it reads from other states

### 2.2 Categorized Navigation

Replace flat 8-tab horizontal scroll with categorized groups:

| Category | Tabs |
|----------|------|
| Overview | Dashboard |
| Performance | Speed, Quality |
| Security | DNS, Headers, Ad Block |
| Privacy | Fingerprint |
| Explore | Network Map |

Implementation: `<nav>` gets category group labels. On mobile, categories collapse into a hamburger/dropdown. Current active tab's category expands.

### 2.3 Animated Transitions

- **Tab switch:** fade + slide (CSS `transition` on `opacity` and `transform`, ~200ms)
- **Skeleton → content:** fade-in after data loads (CSS `@keyframes fadeIn`)
- **Gauge reveal:** spring-eased count-up animation for scores/grades
- **Reduced motion:** all animations respect `prefers-reduced-motion: reduce`

No JS animation libraries. Pure CSS transitions + `requestAnimationFrame` for gauge count-ups.

---

## Phase 3 — New Features (~1.5 weeks after Phase 2)

### 3.1 TLS Certificate Inspector

**New tab** under Security category.

**Data source:** Worker `/api/ip` already returns `cf-tlsVersion`, `cf-tlsCipher`. Add new Worker endpoint `/api/tls/cert` that:
- Reads TLS certificate from the incoming connection (Cloudflare exposes cert info via `request.cf` and `request.headers`)
- Returns: subject, issuer, validity dates, key type/size, SANs, CT SCTs, chain

**Client UI:**
- Certificate validity card (valid/invalid/expired, days remaining)
- Certificate chain visualization (leaf → intermediate → root)
- TLS handshake details (protocol, cipher, key exchange, forward secrecy)
- OCSP stapling, HSTS status
- Overall TLS grade (A+ through F)

**State:** `tls-state.ts` — new observable state for TLS results

### 3.2 IPv6 Readiness Check

**Integrated into DNS tab** (new section, not a separate tab).

**Tests:**
1. **IPv6 connectivity** — attempt fetch to dual-stack endpoint, check if AAAA record resolved
2. **DNS AAAA resolution** — query AAAA record for known dual-stack domains
3. **Happy Eyeballs v2 (RFC 8305)** — verify client implements connection racing
4. **IPv4 fallback** — confirm IPv4 still works as backup
5. **Path MTU** — check IPv6 path MTU ≥ 1280

**Worker endpoint:** `/api/ipv6/check` — returns IPv6 address, IPv4 address, AAAA resolution results

**State:** Added to `dns-state.ts` as `ipv6` observable

### 3.3 Connection History Timeline

**New tab** under Overview category.

**Features:**
- 30-day bar chart of speed test results (download speed as bar height)
- Average stats row (avg download, avg latency, trend %)
- CSV export (reuse existing `history.ts` export)
- History expanded from 50 → 200 entries in localStorage
- Detail view: click a bar to see full test results

**State:** `history-state.ts` — wraps `history.ts` with observables, stores entries with richer metadata (all tab results, not just speed)

### 3.4 Test Comparison

**Feature within History tab.**

- Select two test runs from timeline
- Side-by-side diff view showing all metrics
- Green highlighting for improvements, red for regressions
- Percentage change displayed

**State:** `compare-state.ts` — holds references to two history entries, computes diff

---

## Phase 4 — Polish (~1 week after Phase 3)

### 4.1 Testing & Quality

**Expand test coverage:**

| Layer | Target | Tool |
|-------|--------|------|
| State | 100% coverage (pure functions) | Vitest |
| Components | render + interaction tests | Vitest + jsdom |
| Worker | expand edge cases & routes | Vitest |
| Integration | state → render → DOM | Vitest |
| E2E | critical user flows | Playwright |
| Accessibility | axe-core audit in CI | Playwright + axe |

**CI enforcement:** Test coverage minimum 80% overall, 100% for `state/` layer.

### 4.2 Performance Budget

**Lighthouse targets:**
- Performance ≥ 95
- Accessibility = 100
- Best Practices = 100
- SEO ≥ 95

**Bundle size targets** (gzipped):
- JS < 80 KB (current: ~60 KB)
- CSS < 20 KB (current: ~15 KB)
- First Paint < 1.5s on 4G
- TTI < 3s on 4G

**CI enforcement:** Lighthouse CI runs on every PR, fails if any metric drops below threshold.

### 4.3 PWA & Offline Improvements

**Enhanced service worker** (`public/sw.js`):
- Cache-first for static assets (JS, CSS, fonts, images)
- Network-first for API calls, fallback to cached results
- Stale-while-revalidate for analytics badge
- Offline page: show cached last-known results with "offline" badge and timestamps

**Custom install prompt:**
- Show contextual "Add to Home Screen" banner after 2nd visit
- Brief explanation: "Run speed tests and security checks offline"
- One-tap install via `beforeinstallprompt` event

**Background sync:**
- Queue failed analytics pings
- Retry on `sync` event when connection restored

### 4.4 Accessibility Audit (WCAG 2.2 AA)

- Color contrast ratios ≥ 4.5:1 on all text
- `focus-visible` on all interactive elements
- ARIA live regions for test results (announcements on completion)
- Screen reader progress announcements (x% complete, test finished)
- Skip-to-content link
- `prefers-reduced-motion: reduce` respected for all animations
- Touch targets ≥ 44px
- axe-core automated audit in CI pipeline

---

## Architecture Decisions

### No Framework

The project stays vanilla TypeScript. The `observable.ts` reactive primitive adds ~50-100 LOC total and provides the benefits of reactive state without framework overhead, bundle bloat, or supply chain risk. This is the right choice because:

1. **Zero bundle increase** — no framework to ship
2. **Cloudflare Workers compatible** — no SSR complexity
3. **Existing code works** — we refactor incrementally, not rewrite
4. **Observable is trivially understood** — no learning curve for contributors

### Incremental Refactor Strategy

Each `*-ui.ts` file is migrated in isolation:
1. Extract state into `state/*-state.ts`
2. Extract components into `components/*.ts`
3. Replace with `tabs/*-tab.ts` that composes state + components
4. Delete old `*-ui.ts`
5. Run tests, verify visually, commit

One tab per PR. Never refactor multiple tabs simultaneously.

### Backward Compatibility

All existing API endpoints remain unchanged. New endpoints:
- `GET /api/tls/cert` — TLS certificate info
- `GET /api/ipv6/check` — IPv6 readiness check

localStorage schema versioned — `history` key gets a `v` field. Migration logic in `history.ts`.

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Observable pattern too simplistic for complex UIs | Low | Can add computed/derived observables; pattern is extensible |
| Refactoring breaks existing features | Medium | One tab per PR, visual verification, existing tests pass first |
| Bundle size grows beyond budget | Low | Performance budget enforced in CI; no new dependencies |
| Dashboard shows stale data | Medium | Dashboard subscribes to state observables; auto-updates on tab navigation |
| IPv6 check unreliable on some networks | Medium | Graceful degradation — show "IPv6 check unavailable" instead of error |
| Timeline feature limited by localStorage 5MB cap | Low | 200 entries ≈ 200KB; well within limit; add cleanup option |

---

## Success Metrics

- Developer velocity: time from "start feature" to "shipped" halved (measured after Phase 1)
- Bug rate: CI catches regressions before deploy
- Test coverage: ≥80% overall, 100% state layer
- Lighthouse: all targets met
- No regression in existing functionality