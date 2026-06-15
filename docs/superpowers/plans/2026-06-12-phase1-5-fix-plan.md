# Phase 1-5 Fix Plan — Post-Theme Audit

Date: 2026-06-12
Status: Phase 1 ✅ complete, Phases 2-5 pending

## Audit Summary

| Area | CRITICAL | HIGH | MEDIUM | LOW |
|------|----------|------|--------|-----|
| Security/XSS | 1 | 7 | 8 | 6 |
| Feature modules | 0 | 10 | 12 | 18 |
| Worker backend | 2 | 8 | 16 | 14 |
| Testing/CI | 0 | 4 | 6 | 8 |
| **Total** | **3** | **29** | **42** | **46** |

## Phase 1 — Critical Bugs ✅ COMPLETE

Deployed: commit `244c2b5`, version `1e90cbe4-6107-462b-b803-5c4dee9581bd`

- [x] Worker `computeKeyTag` — RFC 4034 Appendix B (proper byte pairing)
- [x] AI endpoint — system prompt + 4KB cap
- [x] `headers-ui.ts` — early return skipped cleanup (UI stuck forever)
- [x] `fingerprint.ts` — drift calculation (compared hash to raw values)
- [x] `dns-check.ts` — fallback DoH CORS failure
- [x] `dns-check.ts` — security checks tested Cloudflare, not user's resolver
- [x] `export-report.ts` — missing `packetLoss` arg
- [x] `ai-collector.ts` — truthiness check on score `0` dropped data
- [x] `i18n.ts` — `String.replace` without global flag

## Phase 2 — XSS & Security Hardening (PENDING)

Files: ~8, ~200 LOC

### XSS via innerHTML
- [ ] `cert-transparency.ts:142-150` — `c.issuer`, `c.commonName` unescaped (crt.sh data, **CRITICAL**)
- [ ] `tls-tab.ts:309, 322, 327, 331, 350` — cert fields from crt.sh
- [ ] `headers-ui.ts:299` — `data.securityTxt.content` into `<pre>`
- [ ] `email-tab.ts:53-87` — SPF/DKIM/DMARC/BIMI/MTA-STS values
- [ ] `dns-ui.ts:561` — DNS record data into `<td>`
- [ ] `cookie-tab.ts:49` — `e.name` cookie name

### Add `escapeHtml` helper
- [ ] Create shared `src/client/escape.ts` with `escapeHtml(str)` function
- [ ] Replace all unescaped template interpolations with `escapeHtml()`
- [ ] Add ESLint rule or comment convention

### CSP tightening
- [ ] Remove `script-src 'unsafe-inline'` from `index.html:5`
- [ ] Remove `style-src 'unsafe-inline'` (or add nonce)
- [ ] Add `frame-ancestors 'none'`
- [ ] Add `Upgrade-Insecure-Requests`

### Worker security
- [ ] Remove double rate limiting (KV + in-memory) — pick one
- [ ] Fix KV rate limit fire-and-forget — await `put` or use reliable pattern
- [ ] Add body size limit to `handleSpeedUp` (currently OOM risk)
- [ ] Fix information leakage (`detail: String(err)` in 2 handlers)
- [ ] Add per-route rate limits for `/api/email-security`, `/api/cert-transparency`, `/api/tls/check`, `/api/dns/dnssec-validate`
- [ ] Block multi-hop redirects in `/api/headers/check` (SSRF risk)
- [ ] Cap AI prompt length (already done in Phase 1 — 4KB)

## Phase 3 — Reliability & Error Recovery (PENDING)

Files: ~10, ~150 LOC

### Missing try/catch in UI
- [ ] `speed-ui.ts:73-125` — wrap `SpeedTest.run()` in try/catch with `finally`
- [ ] `dns-ui.ts:303-363` — wrap `runDnsChecks()` in try/catch with `finally`
- [ ] `fingerprint-ui.ts` — wrap `FingerprintDetector.runAll()` in try/catch
- [ ] `connection-quality-ui.ts:137-235` — wrap main test logic in try/catch

### `connection-quality.ts:85`
- [ ] Replace `performance.clearResourceTimings()` with filtered clearing (breaks concurrent measurements)

### `speed-test.ts:212-253`
- [ ] Remove mutable singleton — return fresh results from `run()` instead of mutating `this.results`

### Dual state management
- [ ] `connection-quality-ui.ts:25-43` — remove module-level `state`, use only `qualityState` atoms
- [ ] `dns-ui.ts:152-156` — remove `lastIpData`/`lastResolvers`/etc. module-level locals

### DOM-based data collection
- [ ] `export-report.ts:104-112` — read from state atoms, not DOM textContent
- [ ] `share.ts:92-93` — read from state atoms, not DOM text

### AbortController
- [ ] Add `AbortSignal.timeout()` to all `runX` async test functions
- [ ] Specifically: `headers-ui.ts`, `cookie-state.ts`, `email-state.ts`, `breach-check.ts`, `tls-state.ts`

### Worker fixes
- [ ] ECS hardcoded prefix (`index.ts:1844`)
- [ ] Analytics double-counting (`index.ts:529`)
- [ ] Adblock race condition (`index.ts:2023-2033`)
- [ ] Cert error 200 status (`index.ts:2503-2508`)
- [ ] Add timeouts to all DoH fetches
- [ ] `csp issue.directive` / `issue.message` XSS in `headers-ui.ts:240-247`
- [ ] `tls-tab.ts:309` redirect chain location XSS

## Phase 4 — Testing & CI (PENDING)

New files: ~300 LOC

- [ ] Create `.github/workflows/ci.yml` (typecheck, lint, test, coverage)
- [ ] Add worker endpoint integration tests:
  - `handleDnsCheck`
  - `handleSpeedDown`
  - `handleHeadersCheck`
  - `handleAiAnalyze` (system prompt verification)
  - `handleSecurityCheck` (new endpoint from Phase 1)
- [ ] Add functional e2e tests:
  - Run DNS check, verify results
  - Run speed test, verify results
  - Switch tabs, verify content
- [ ] Add axe-core to Playwright e2e
- [ ] Upgrade 13 smoke-only state tests to meaningful tests
- [ ] Add global coverage threshold (60%+)
- [ ] Add regression test for `computeKeyTag` (RFC 4034)

## Phase 5 — i18n, Dead Code, Polish (PENDING)

Files: ~8, ~200 LOC

### i18n (massive gaps)
- [ ] `export-report.ts` — ~50 hardcoded English strings (entire report)
- [ ] `headers-ui.ts` — ~8 hardcoded strings
- [ ] `speed-ui.ts` — timing labels, stability labels
- [ ] `dns-ui.ts` — IPv6 results, error messages
- [ ] `install-prompt.ts` — all banner text
- [ ] `connection-quality-ui.ts` — connection type map
- [ ] `share.ts` — footer line
- [ ] `onboarding.ts` — app name
- [ ] `fingerprint-ui.ts` — wrong i18n key usage (`t('speed.noSetup')` in fingerprint context)
- [ ] `ai-analysis-ui.ts` — readiness tips, summary labels

### Dead code
- [ ] `appState` dead fields: `activeTab`, `overallGrade`, `lastRunTimestamp` (`shared-state.ts:3-8`)
- [ ] `speedState` dead fields: `phase`, `progress`, `loading` (`speed-state.ts:5-15`)
- [ ] `tlsState.targetLoading` dead (`tls-state.ts:70`)
- [ ] Dual history storage: `netcheck-speed-history` (legacy) vs `netcheck-history` (v1)
- [ ] Unused exports: `derive()`, `batch()` from `observable.ts` (zero production callers)
- [ ] Unused type imports

### Bug fixes
- [ ] `speed-ui.ts:235-242` — history grade differs from displayed grade (different fallback logic)
- [ ] `speed-ui.ts:325-347` — `runMonitor()` click listener stacking
- [ ] `speed-ui.ts:161-164` — bufferbloat bar width no-op
- [ ] `speed-test.ts:386-388, 435-442` — EWMA value reported then nulled
- [ ] `speed-test.ts:153-169` — `measureLoadedLatency()` no max iteration
- [ ] `dns-check.ts:196` — WebRTC `createOffer().then()` no catch
- [ ] `dns-check.ts:212` — private IP regex misses `127.` and `169.254.`
- [ ] `fingerprint-ui.ts:26-33, 38-44` — dead color set, immediately overwritten
- [ ] `fingerprint-ui.ts:55` — `drift > 0` hides meaningful 0% drift
- [ ] `fingerprint-ui.ts:95-146` — suggestions never hidden on re-scan
- [ ] `connection-quality.ts:201` — too-generous 'A' grade with 1 factor
- [ ] `ai-local.ts:40-43` — progress reset hides modelReady state
- [ ] `ai-cloud.ts:18` — no runtime response shape validation
- [ ] `tooltip.ts:23-31` — position calculated before CSS transition
- [ ] `breach-check.ts:137-138` — `finally` overrides user visibility toggle
- [ ] `breach-check.ts:23` — no AbortSignal.timeout
- [ ] `install-prompt.ts:11-12` — visit counter inflated
- [ ] `install-prompt.ts:57` — no timeout on `userChoice`
- [ ] `a11y.ts:66-76` — `focusRunButton()` missing 8 section entries
- [ ] `analytics.ts:7` — `setInterval` re-init creates duplicate intervals

### Accessibility
- [ ] `tooltip.ts` — no keyboard/focus support
- [ ] `breach-check.ts:70-76` — toggle visibility button missing `aria-label`
- [ ] All UI modules: missing `aria-busy` restoration on error

## Key Decisions Made

1. **Theme consolidation** (commit `3d5d464`) — removed dead Tailwind `@theme` block, added 18 missing CSS variables to `tokens.css`
2. **Security checks via worker** (Phase 1) — added `/api/dns/check-security` endpoint that tests the user's actual resolver
3. **i18n replace global flag** (Phase 1) — `String.replace` with regex global flag for repeated placeholders

## Files Touched in Phase 1

```
src/worker/index.ts          (computeKeyTag fix, new /api/dns/check-security, AI system prompt)
src/client/headers-ui.ts     (remove early return, restructure cleanup)
src/client/fingerprint.ts    (drift calculation fix, new STORE_SIGNALS_KEY)
src/client/dns-check.ts      (remove CORS fallback, route through worker)
src/client/dns-ui.ts         (split security checks, use detected resolver)
src/client/export-report.ts  (pass packetLoss: 0 to getGrade)
src/client/ai-collector.ts   (check headersUrl instead of truthy score)
src/client/i18n.ts           (global regex flag for replace)
```

## Deployment

- **Cloudflare Worker**: `netcheck.oilygold.xyz`
- **Latest version**: `1e90cbe4-6107-462b-b803-5c4dee9581bd` (Phase 1 fixes)
- **Deploy command**: `npm run deploy`
- **Theme version**: `21ceac1b-7d9b-49e6-a841-aa8e10fe8a79` (previous)
