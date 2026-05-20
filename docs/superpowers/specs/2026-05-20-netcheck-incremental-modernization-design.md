# NetCheck Incremental Modernization Design

**Date:** 2026-05-20
**Status:** Approved (revised after spec review)
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

- `eslint.config.js` — flat config with `@typescript-eslint/recommended`, `no-console` rule in production builds only (dev builds allow console for debugging)
- Add `src/client/logger.ts` — thin wrapper over `console` that respects log levels and can be silenced in production
- `.prettierrc` — consistent formatting, enforced in CI
- `npm run lint` and `npm run format` scripts in `package.json`
- **Done when:** `npm run lint` and `npm run format:check` pass with zero errors in CI

### 1.3 State Management Layer

**New directory:** `src/client/state/`

`observable.ts` — minimal reactive primitive (~120-150 LOC, including batch scheduling, error boundaries, and disposal):

```typescript
type Subscriber<T> = (value: T) => void;
type Disposer = () => void;

interface Observable<T> {
  get(): T;
  set(value: T): void;
  subscribe(fn: Subscriber<T>): Disposer;
}

// Create a reactive value
function observable<T>(initial: T): Observable<T>;

// Derive a computed value from other observables.
// Automatically subscribes to sources, unsubscribes on dispose().
function derive<T>(sources: Observable<any>[], compute: (...values: any[]) => T): Observable<T> & { dispose: Disposer };

// Batch multiple observable updates into a single notification cycle.
// Subscribers are notified once after the callback completes, not per-set.
function batch<T>(fn: () => T): T;

// Error handling: if a compute function in derive() throws,
// the derived observable retains its last good value and logs the error.
// It does not enter an error state — subsequent source changes retry compute.
```
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

Extract reusable render functions from existing `*-ui.ts` files. Each component is a pure function that reads from observables and renders to a container. The existing `ui-utils.ts` helpers (`animateNumber`, `setActiveGauge`, skeleton row generators) are absorbed into these components.

- `gauge.ts` — circular/speed gauge (used by Speed, Quality). Props: `GaugeProps = { value: number; max: number; label: string; phase?: 'idle' | 'testing' | 'done'; unit?: string }`
- `badge.ts` — pass/warn/fail badge (used by DNS, Headers, Ad Block). Props: `BadgeProps = { status: 'pass' | 'warn' | 'fail'; label: string; detail?: string }`
- `card.ts` — result card layout (used by all tabs). Props: `CardProps = { title: string; grade?: string; children: HTMLElement[] }`
- `progress.ts` — progress bar/skeleton (used by all tabs). Props: `ProgressProps = { percent: number; label?: string; indeterminate?: boolean }`
- `chart.ts` — canvas-based line chart (used by Speed, History). Props: `ChartProps = { data: { x: number; y: number }[]; width: number; height: number; color?: string; label?: string }`

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
  i18n.ts                # (unchanged)
  theme.ts               # (unchanged)
  logger.ts              # New: thin console wrapper, log-level aware
  ...existing utils...
```

Existing `*-ui.ts` files are refactored to become thin `*-tab.ts` wrappers that compose state + components. The logic that was in `*-ui.ts` splits into `state/` (data) and `components/` (rendering).

**Phase 1 acceptance criteria:** All existing tabs work identically to before refactoring. CI pipeline runs on every push. `npm run lint` and `npm run typecheck` pass. State layer has 100% test coverage.

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

**Overall Score algorithm:**
Each test produces a 0-100 numeric score. The overall score is a weighted average:

| Test | Weight | Rationale |
|------|--------|-----------|
| DNS Security | 20% | Core infrastructure check |
| Speed | 20% | Primary user concern |
| Ad Block | 15% | Privacy/security |
| Headers | 15% | Security posture |
| Fingerprint | 10% | Privacy awareness |
| Connection Quality | 15% | Stability indicator |
| TLS | 5% | Bonus metric |

Incomplete tests are excluded from the weight, redistributed proportionally. Grade thresholds: ≥93 A+, ≥90 A, ≥80 B, ≥70 C, ≥60 D, <60 F.

**Empty state:** On first load with no completed tests, show skeleton cards with "Run your first test" CTA buttons. Each card transitions to real data as the corresponding test completes.

### 2.2 Categorized Navigation

Replace flat 8-tab horizontal scroll with categorized groups:

| Category | Tabs |
|----------|------|
| Overview | Dashboard, History |
| Performance | Speed, Quality |
| Security | DNS, Headers, Ad Block, TLS |
| Privacy | Fingerprint |
| Explore | Network Map, About |

Implementation: `<nav>` gets category group labels. On mobile, categories collapse into a hamburger/dropdown. Current active tab's category expands.

### 2.3 Animated Transitions

- **Tab switch:** fade + slide (CSS `transition` on `opacity` and `transform`, ~200ms)
- **Skeleton → content:** fade-in after data loads (CSS `@keyframes fadeIn`)
- **Gauge reveal:** spring-eased count-up animation for scores/grades
- **Reduced motion:** all animations respect `prefers-reduced-motion: reduce`

No JS animation libraries. Pure CSS transitions + `requestAnimationFrame` for gauge count-ups (preserving existing `animateNumber` from `ui-utils.ts`, absorbed into `components/gauge.ts`).

**Phase 2 acceptance criteria:** Dashboard shows overall score computed from completed tests. Empty state shows skeleton with CTA. Navigation groups tabs by category. Tab transitions are animated. `prefers-reduced-motion` respected.

---

## Phase 3 — New Features (~1.5 weeks after Phase 2)

### 3.1 TLS Connection Inspector

**New tab** under Security category.

**Design constraint:** Cloudflare Workers' `request.cf` only exposes `tlsVersion` and `tlsCipher` — full certificate chain, SANs, validity dates, and CT SCTs are not available server-side. This tab uses a combination of available data and client-side checks.

**Data sources:**
- Worker `/api/ip` — existing endpoint already returns `cf-tlsVersion`, `cf-tlsCipher`, `cf-httpProtocol`
- Worker `/api/headers/check` — existing endpoint, point at the site's own origin to check HSTS, CSP, etc.
- Client-side `PerformanceResourceTiming` — `secureConnectionStart` and `connectEnd` for TLS handshake duration
- Client-side check — `crypto.subtle` availability, HSTS preload list check

**Client UI:**
- **TLS Protocol** — version, cipher suite, key exchange (from existing data)
- **Forward Secrecy** — determined from cipher suite name (e.g., ECDHE = yes)
- **TLS Handshake Time** — from Performance API timing
- **HTTP Protocol** — h2 vs h3 (from `cf-httpProtocol`)
- **HSTS Status** — checked via headers scan of own origin
- **OCSP Stapling** — not directly detectable client-side, shown as "unknown" with explanation
- **Overall TLS Grade** — A+ through F, computed from protocol version, cipher strength, forward secrecy, and HSTS

**Note:** This is intentionally scoped to what's feasible. No certificate chain, no SANs, no validity dates — those require server-side cert parsing that Cloudflare Workers doesn't expose.

**State:** `tls-state.ts` — new observable state for TLS results

### 3.2 IPv6 Readiness Check

**Integrated into DNS tab** (new section, not a separate tab).

**Design constraint:** IPv6 connectivity, AAAA resolution, and dual-stack behavior are client-side observations. The server can only report whether the incoming request arrived over IPv6 (via `cf-connecting-ip`). All other checks must be performed client-side.

**Tests (all client-side):**
1. **IPv4 connectivity** — `fetch()` to a known IPv4-only endpoint, measure latency
2. **IPv6 connectivity** — `fetch()` to a known IPv6-only endpoint (Cloudflare R2 bucket with AAAA record), measure latency
3. **DNS AAAA resolution** — query Cloudflare DoH (`cloudflare-dns.com/dns-query?name=ipv6test.google.com&type=AAAA`) and check for AAAA response
4. **IPv4 fallback** — verify IPv4 endpoint still works after IPv6
5. **Dual-stack preference** — compare IPv6 latency vs IPv4 latency; if IPv6 is faster, dual-stack is working correctly

**Not feasible client-side** (removed from design):
- Happy Eyeballs v2 compliance (browser networking stack, not observable from JS)
- Path MTU discovery (requires ICMP or OS-level APIs)

**Server endpoint:** No new endpoint needed. The existing `/api/ip` already returns the client's IP address (which reveals IPv4 vs IPv6 transport).

**State:** Added to `dns-state.ts` as `ipv6` observable

### 3.3 Connection History Timeline

**New tab** under Overview category.

**Features:**
- 30-day bar chart of speed test results (download speed as bar height)
- Average stats row (avg download, avg latency, trend %)
- CSV export (reuse existing `history.ts` export)
- History expanded from 50 → 200 entries in localStorage
- Detail view: click a bar to see full test results
- **Schema migration:** History key gets a `v` field. Current schema is `v: 0` (speed-only). New schema:

```typescript
interface HistoryEntry {
  v: 1;
  id: string;                    // unique ID for comparison
  timestamp: number;             // Unix ms
  speed?: { download: number; upload: number; latency: number; jitter: number; bufferbloat: number; grade: string };
  dns?: { security: string; webrtcLeak: boolean; resolverCount: number; dnssec: boolean };
  adblock?: { score: number; categories: Record<string, number> };
  headers?: { url: string; grade: string; score: number };
  fingerprint?: { uniquenessScore: number; categories: Record<string, number> };
  quality?: { effectiveType: string; downlink: number; rtt: number; tlsGrade: string };
}
```

Migration: existing `v: 0` entries (speed-only) are converted to `v: 1` with only the `speed` field populated. Unknown fields default to `undefined`.

- CSV export (reuse existing `history.ts` export, expanded columns for all tab results)

**State:** `history-state.ts` — wraps `history.ts` with observables, stores entries with richer metadata (all tab results, not just speed)

### 3.4 Test Comparison

**Feature within History tab.**

- Select two test runs from timeline
- Side-by-side diff view showing all metrics
- Green highlighting for improvements, red for regressions
- Percentage change displayed

**State:** `compare-state.ts` — holds references to two history entries, computes diff

**Phase 3 acceptance criteria:** TLS tab displays connection info with grade. IPv6 section in DNS tab shows 5 client-side checks. History timeline shows 30-day bar chart with clickable detail. Comparison view shows side-by-side diff with green/red highlighting. History schema migrates v0 → v1 automatically.

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
- JS < 90 KB (current: ~60 KB; headroom for observable, components, new tabs)
- CSS < 25 KB (current: ~15 KB; headroom for dashboard, history, navigation styles)
- First Paint < 1.5s on 4G
- TTI < 3s on 4G

**CI enforcement:** Lighthouse CI runs on every PR, fails if any metric drops below threshold.

### 4.3 PWA & Offline Improvements

**Enhanced service worker** (registered at `/public/sw.js` in `app.ts`):
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

**Phase 4 acceptance criteria:** Test coverage ≥80% overall, 100% state layer. Lighthouse scores all meet targets. Custom PWA install prompt shown on 2nd visit. axe-core zero violations in CI. All animations respect `prefers-reduced-motion`.

---

## Architecture Decisions

### No Framework

The project stays vanilla TypeScript. The `observable.ts` reactive primitive adds ~120-150 LOC total (including batch scheduling, error handling, and disposal) and provides the benefits of reactive state without framework overhead, bundle bloat, or supply chain risk. This is the right choice because:

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

All existing API endpoints remain unchanged. No new Worker endpoints are needed — TLS data comes from existing `/api/ip` and `/api/headers/check`, and IPv6 checks are client-side.

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