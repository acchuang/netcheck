# NetCheck — Bug Fix & Enhancements Plan

> **Status:** Phase 0 in progress. Derived from the 2026-06-17 project review.
> **Verify after each phase:** `npm run typecheck && npx eslint . && npm test && npm run build`

## Health snapshot (verified 2026-06-17)

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | 280 tests / 33 files pass |
| `vite build` | builds; 2 chunk-size warnings + 1 ineffective-dynamic-import warning |
| `eslint src/` (`npm run lint`) | passes (scoped) |
| `eslint .` (repo-wide) | 11 `no-undef` errors in `public/sw.js` |
| Hardcoded secrets / TODO/FIXME | none |

**Scope reality:** vanilla TypeScript + Vite (no React). The April plan (`.opencode/plans/2026-04-14-site-improvements.md`) is largely done/superseded — 15 newer design specs live in `docs/superpowers/specs/`.

## Confirmed bugs

| # | Bug | Location | Fix | Verify |
|---|---|---|---|---|
| B1 | Repo-wide ESLint broken: `public/sw.js` flagged for `caches`/`fetch`/`self`/`indexedDB` | `eslint.config.js` (globals only for `src/**/*.ts`) | Add a service-worker-globals block for `public/sw.js` | `npx eslint .` exits 0 |
| B2 | DOX doc-accuracy: AGENTS.md claims "Vite + React" — no React exists | `AGENTS.md:5,9,13`; root `Project/AGENTS.md` | "Vite + vanilla TypeScript" (both files) | `grep -i react AGENTS.md` empty |
| B3 | Build warning: `INEFFECTIVE_DYNAMIC_IMPORT` — `state/shared-state.ts` dynamic-imported by `dns-ui.ts` but statically imported by 12+ files | `src/client/dns-ui.ts` | Make it a static import (dynamic import is dead) | build warning gone |
| B4 | `logger.ts` `console.log` triggers `no-console` | `src/client/logger.ts:28,31` | eslint override block for logger.ts | `npx eslint .` → 0 logger warnings |

## Enhancement opportunities

**P1 Robustness**
- E1 a11y — DONE: 99 decorative SVGs aria-hidden; 2 hardcoded Dismiss labels i18n'd (`common.dismiss` ×6 locales) in error-boundary.ts + onboarding.ts; `speed-monitor-stop` i18n aria-label (`speed.monitorStop` ×6 locales + mapping; `speed-history-clear` was already i18n'd — no change); a11y unit guard added (`a11y-static.test.ts`, 3 jsdom+axe tests). Note: guard is a runnable jsdom unit test, not Playwright e2e (e2e has no `webServer` + browsers unavailable here).
- E2 Event-listener hygiene — AUDITED, NO leaks. The addEventListener/removeEventListener imbalance is intentional and correct: app-lifetime document/window listeners registered once at init (`initTabs`/`initTooltips`/`initInstallPrompt`/`initKeyboardShortcuts`/`initNetworkChange` via `safeInit` on `DOMContentLoaded`); element listeners on short-lived banners/toasts and `ai-analysis-ui` re-rendered containers (`innerHTML` replace → GC'd); `{ once: true }` + `AbortController` cover the rest. Corrected: `dns-ui.ts` has 0 listeners (initial estimate of 2 was a miscount).

**P2 Maintainability**
- E3 Worker split — `src/worker/index.ts` 2,871 lines → modules (dns/tls/headers/email/security/ai). Touch-only; defer unless touching worker for another reason.
- E4 `any` cleanup — DONE: all 25 `no-explicit-any` warnings → 0. Added `PrivacyNav` (privacy-exposure), `ConnectionNavigator`/inline intersection casts (network-change/connection-quality/fingerprint), `CrtShEntry` + `AiBinding` (worker crt.sh + AI binding), exported `DnsResult`/`DnsAnswer` (typed dns-ui `allData`), `TestWithResult` (adblock-ui), tuple-generic `derive` (observable), typed globalThis cast (dns-audit.test). `npx eslint .` now 0 warnings / 0 errors.
- E5 Archive stale April plan — DONE: moved `.opencode/plans/2026-04-14-site-improvements.md` → `docs/archive/` (superseded by 15 specs in `docs/superpowers/specs/`).

**P3 Polish**
- E6 CSS strategy clarity — DONE: documented the Tailwind v4 (`app.css` via `app.ts`) + hand-written `public/css/` (`styles.css`/`tokens.css`/`utilities.css`) coexistence in `AGENTS.md` Local Contracts (no single source of truth; match the existing system of the file you edit).
- E7 i18n consistency — DONE: moved inline `en` (844 lines) from `i18n.ts` to `src/client/locales/en.ts` (`export const en = {...} as const`); `i18n.ts` imports it; `Translations = Record<keyof typeof en, string>` preserved.

## Phased execution

- **Phase 0 — Doc & lint hygiene (~15 min):** B1, B2, B4. No behavior change.
- **Phase 1 — Build cleanup (~10 min):** B3. Warning-free build.
- **Phase 2 — a11y hardening (~1–2 h):** E1.
- **Phase 3 — Listener-leak audit (~1 h):** E2.
- **Phase 4 — Type & maintainability (~2–3 h):** E4, E5, E7.
- **Phase 5 — Worker modularization (defer):** E3 only if touching worker anyway.

## Progress

- [x] Plan saved
- [x] Phase 0 — B1, B2, B4 (verified: eslint . exit 0, no sw.js/logger errors; AGENTS.md React claims removed; typecheck/test/build green)
- [x] Phase 1 — B3 (verified: INEFFECTIVE_DYNAMIC_IMPORT warning gone; tsc/eslint/test/build green)
- [x] Phase 2 — E1 + B + C + guard (99 SVGs aria-hidden; common.dismiss ×6 locales; speed.monitorStop i18n; a11y-static.test.ts guard; 283 tests green). COMPLETE.
- [x] Phase 3 — E2 (audited: NO leaks. All document/window listeners registered once at init; element listeners on short-lived/re-rendered DOM (GC'd); { once: true } + AbortController handle the rest. No code change needed.)
- [x] Phase 4 — E4, E5, E7 (25 any→0 warnings; April plan archived; en moved to locales/en.ts; tsc/eslint 0-warn/283 tests/build green). COMPLETE.
- [x] Residuals — i18n error-boundary "failed to load" toast (`error.moduleFailed` ×6 locales) + E6 CSS-ownership note in AGENTS.md. tsc/eslint 0-warn/283 tests/build green.
- [ ] Phase 5 — E3 (deferred — worker split, only if touching worker)

## Features added (2026-06-17, post-review)

- **#2 Captive-portal detection** — DONE: client-only check in Connection Quality (`checkCaptivePortal` fetches `cloudflare-dns.com` DoH; valid DNS JSON = `ok`, HTML/empty = `captive`, fetch error = `blocked`); new `quality-captive-info` card + status badge; `quality.captive.{label,ok,captive,blocked}` ×6 locales. No worker/CSP change (reuses an already-`connect-src`-allowed host). tsc/eslint 0-warn/283 tests/build green.
- **#1 BGP/ASN** — DONE: user-IP ASN was already live (`cf.asn`/`cf.asOrganization` -> IP card). Added **target-domain ASN**: `handleTlsTargetCheck` now resolves the domain (DoH A) + looks up ASN via Team Cymru DoH (`origin.asn.cymru.com` + `AS<n>.asn.cymru.com` TXT), returns `asn`/`asOrganization`/`resolvedIp`; TLS tab shows "Network: Org · AS#### · IP" under the target grade; `tls.target.network` x6 locales. tsc/eslint 0-warn/283 tests/build green.