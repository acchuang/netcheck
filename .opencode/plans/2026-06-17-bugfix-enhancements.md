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
- E2 Event-listener hygiene — `addEventListener` ~60+ uses, `removeEventListener` only 2 files. Hotspots: `tooltip.ts` (6/0), `install-prompt.ts` (4/0), `onboarding.ts` (3/0), `ai-analysis-ui.ts` (8/0), `app.ts` (14/0). Audit re-init paths; fix only confirmed leaks.

**P2 Maintainability**
- E3 Worker split — `src/worker/index.ts` 2,871 lines → modules (dns/tls/headers/email/security/ai). Touch-only; defer unless touching worker for another reason.
- E4 `any` cleanup — ~20 warnings, concentrated in `privacy-exposure.ts` (8) + `state/observable.ts` (3). Add `types/dom-extras.d.ts` for non-standard Web APIs.
- E5 Archive stale April plan.

**P3 Polish**
- E6 CSS strategy clarity — Tailwind v4 (`app.css` via `app.ts:1`) + hand-written `public/css/styles.css` (4,465 lines) coexist. Document ownership in AGENTS.md.
- E7 i18n consistency — move inline `en` from `i18n.ts` to `locales/en.ts`.

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
- [ ] Phase 3 — E2
- [ ] Phase 4 — E4, E5, E7
- [ ] Phase 5 — E3 (deferred)