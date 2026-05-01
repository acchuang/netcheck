# UI/UX Design System Upgrade — Phase 1

**Date:** 2026-05-01
**Status:** Draft
**Scope:** NetCheck entire frontend

## Overview

NetCheck currently uses a single ~2778-line `styles.css` with ~40 ad-hoc CSS variables and minimal responsive design. This phase introduces a structured three-layer design token system, responsive mobile-first layout, micro-interactions, premium component polish, accessibility hardening, and PWA improvements. This lays the visual and interactive foundation for all subsequent feature phases.

## 1. Design Token System & CSS Architecture

### 1.1 Three-layer token structure

| Layer | File | Purpose | Example |
|-------|------|---------|---------|
| Primitive tokens | `public/css/tokens.css` | Raw colour, spacing, radii, shadow values | `--gray-900: #08090a` |
| Semantic tokens | `public/css/tokens.css` | Purpose-bound aliases | `--surface-primary: var(--gray-900)` |
| Component styles | `public/css/styles.css` | Per-component rules referencing tokens | `background: var(--surface-primary)` |

### 1.2 Colour tokens

**Primitives (both themes):**

`--gray-0` (#ffffff) and `--gray-1000` (#000000) — absolute white/black endpoints
`--gray-50` through `--gray-950` — the core 11-step scale (50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950)
`--gray-850` (#13151a) — single interpolated value between gray-800 and gray-900 for surface-elevated dark theme
`--brand-50` through `--brand-950` (indigo/violet)
`--green-50` through `--green-950`
`--amber-50` through `--amber-950`
`--red-50` through `--red-950`

**Semantic tokens — Dark theme (`[data-theme="dark"]`):**

```css
--surface-primary: var(--gray-950);
--surface-secondary: var(--gray-900);
--surface-tertiary: var(--gray-800);
--surface-elevated: var(--gray-850); /* interpolated: #13151a, sits between --gray-800 and --gray-900 for card hover lift */
--text-primary: var(--gray-100);
--text-secondary: var(--gray-300);
--text-tertiary: var(--gray-500);
--border-subtle: color-mix(in srgb, var(--gray-700) 60%, transparent);
--border-default: var(--gray-700);
--brand: #5e6ad2;
--brand-glow: color-mix(in srgb, var(--brand) 25%, transparent);
--status-pass: var(--green-400);
--status-warn: var(--amber-400);
--status-fail: var(--red-400);
--status-progress: var(--brand-400);
```
**Semantic tokens — Light theme (`[data-theme="light"]`):**

```css
--surface-primary: var(--gray-50);
--surface-secondary: var(--gray-0);
--surface-tertiary: var(--gray-100);
--surface-elevated: var(--gray-0);
--text-primary: var(--gray-900);
--text-secondary: var(--gray-600);
--text-tertiary: var(--gray-400);
--border-subtle: color-mix(in srgb, var(--gray-200) 75%, transparent);
--border-default: var(--gray-200);
--brand: #5e6ad2;
--brand-glow: color-mix(in srgb, var(--brand) 15%, transparent);
--status-pass: var(--green-600);
--status-warn: var(--amber-600);
--status-fail: var(--red-600);
--status-progress: var(--brand-600);
```
### 1.2a Theme toggle behaviour

The `<html data-theme>` attribute controls which token set applies:

1. **Initial load:** Check `localStorage.getItem("netcheck-theme")`; if "dark" or "light", apply that value to `data-theme`
2. **No stored preference:** Respect `prefers-color-scheme: dark` media query (auto-dark default)
3. **Toggle button:** Existing moon/sun icon button in nav (`#theme-toggle`) sets `data-theme` on `<html>` and persists to `localStorage`
4. **System changes:** Listen for `matchMedia("(prefers-color-scheme: dark)").addEventListener("change")` — auto-update unless user has set an explicit preference in localStorage

The existing `src/client/theme.ts` already implements most of this flow; it needs a minor update to use `data-theme` (currently uses class-based `.dark`/`.light` approach).

### 1.3 Spacing scale

`--space-1` through `--space-16` (4px increments: 4px → 64px).

### 1.4 Radius scale

| Token | Value | Use |
|-------|-------|-----|
| `--radius-sm` | 4px | Inputs, badges |
| `--radius-md` | 8px | Cards, buttons |
| `--radius-lg` | 12px | Score cards, modals |
| `--radius-xl` | 16px | Large containers |
| `--radius-full` | 9999px | Pills, rings |

### 1.5 Shadow scale

**Light:**
| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.04)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.08)` |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.1)` |

**Dark:**
| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.3)` |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.4)` |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.5)` |
| `--shadow-xl` | `0 16px 48px rgba(0,0,0,0.6)` |

### 1.6 CSS file organisation

```
public/css/
├── tokens.css       # Primitives + semantic tokens (~300 lines)
└── styles.css       # Component styles (~2200 lines, refactored)
```

`tokens.css` loads first and is cacheable independently.

## 2. Typography & Brand System

### 2.1 Type scale

| Token | Size | Use |
|-------|------|-----|
| `--text-xs` | `0.75rem` / 12px | Badges, meta labels |
| `--text-sm` | `0.8125rem` / 13px | Body small, card subtitles |
| `--text-base` | `0.9375rem` / 15px | Body copy, form inputs |
| `--text-md` | `1.0625rem` / 17px | Card titles, nav links |
| `--text-lg` | `1.25rem` / 20px | Section subtitles |
| `--text-xl` | `1.5rem` / 24px | Section headers |
| `--text-2xl` | `2rem` / 32px | Hero/display text |
| `--text-3xl` | `2.75rem` / 44px | Speed test gauge values |

### 2.2 Font configuration

- **Font:** Inter Variable (SIL Open Font License), loaded via `https://rsms.me/inter/inter.css`
- **Features:** `font-feature-settings: "cv02", "cv03", "cv04", "ss01"` applied to `body` and all headings for premium Inter rendering (alt lowercase 'a', alt 'y', straight '6' and '9', open '4')
- **Tabular numbers:** `font-variant-numeric: tabular-nums` on all numeric data (IPs, latencies, scores)
- **Line height:** `--leading-tight: 1.15`, `--leading-normal: 1.5`, `--leading-relaxed: 1.7`

### 2.3 Brand

- Logomark: existing shield icon kept
- Accent gradient: `linear-gradient(135deg, var(--brand) 0%, var(--brand-500) 100%)`
- Gradient applied to: hero headings, score rings fill, active nav indicators, loading bars
- All other UI remains flat (no gradient backgrounds)

## 3. Layout & Spacing System

### 3.1 Breakpoints (mobile-first)

| Name | Width | Layout |
|------|-------|--------|
| Base (mobile) | < 640px | Single column, stacked cards, fixed bottom nav |
| `--bp-tablet` | ≥ 640px | 2-column card grid, horizontal top nav |
| `--bp-desktop` | ≥ 1024px | 3-column grid where applicable, sidebar nav |

### 3.2 Container

- `max-width: 1280px` with `margin: 0 auto`
- Horizontal padding: `--page-px: clamp(1rem, 5vw, 2.5rem)`

### 3.3 Grid system

- Cards grid uses `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))`
- Gap tokens: `--gap-sm: var(--space-2)`, `--gap-md: var(--space-4)`, `--gap-lg: var(--space-6)`

### 3.4 Tab-specific grid overrides

| Tab | Mobile | Tablet | Desktop |
|-----|--------|--------|---------|
| DNS Check | 1-col | 2-col | 3-col (`cards-grid`) |
| Speed Test | 5 gauges vertical | 5 gauges as scrollable row | 5 gauges horizontal |
| Ad Block Test | 1-col cards | 2-col | 2-col |
| Headers | 1-col | 2-col | 2-col |
| Fingerprint | 1-col | 2-col | 2-col |
| Connection Quality | 1-col | 2-col | 3-col top, 2-col bottom |
| Network Map | 1-col | 2-col region grid | 2-col region grid |
| About | 1-col | 2-col | 3-col |

### 3.5 Navigation

- **Desktop:** Left sidebar, 220px wide, icon + label per item, fixed position
- **Mobile:** Fixed bottom tab bar, `height: 64px`, `padding-bottom: env(safe-area-inset-bottom)`, icon-only labels, horizontal scroll if needed

## 4. Micro-interactions & Motion

### 4.1 Interaction catalogue

| Interaction | Timing | Easing | Property |
|-------------|--------|--------|----------|
| Card data reveal | 400ms, 80ms stagger | `cubic-bezier(0.16, 1, 0.3, 1)` | `opacity` + `translateY(8px → 0)` |
| Button press | 120ms | ease-out | `scale(0.97)` on `:active` |
| Score ring fill | 800ms | ease-out | SVG `stroke-dashoffset` |
| Gauge bar fill | 600ms | ease-out | `transform: scaleX(0→1)` |
| Tab switch | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `opacity` crossfade + `translateX(±12px)` |
| Card hover | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` | `translateY(-2px)` + shadow lift |
| Skeleton → data | 150ms out / 250ms in | ease | `opacity` |
| Status badge pulse | continuous, subtle | ease-in-out | `box-shadow` pulse on active states |

### 4.2 Motion principles

- All animations wrap in `@media (prefers-reduced-motion: no-preference)`
- Max single animation duration: 800ms
- Only animate `transform` and `opacity` (GPU-composited, no layout thrashing)
- Exit easing: `cubic-bezier(0.7, 0, 0.84, 0)` for elements leaving

## 5. Component Polish

### 5.1 Cards

- Base: `background: var(--surface-secondary)`, `border-radius: var(--radius-lg)`, 1px `border: var(--border-subtle)`
- Glass variant (score cards): `background: color-mix(in srgb, var(--surface-secondary) 85%, transparent)`
- Hover: `translateY(-2px)` + `box-shadow: var(--shadow-md)`
- Padding: `--card-p: var(--space-5)`

### 5.2 Score rings

- SVG viewBox: `0 0 140 140` (increase from current 120)
- Stroke width: 6px (increase from current 4px)
- Fill: brand gradient via `stroke="url(#brandGradient)"`
- Inner label: percentage + grade text, centred
- Animation: `stroke-dashoffset` from full circumference → calculated length

### 5.3 Speed test gauges

- Mobile: vertical stack, each gauge full-width with horizontal progress bar
- Desktop: compact horizontal row, `gap: var(--gap-md)`
- Progress bars: height 4px, `border-radius: var(--radius-full)`, brand gradient fill

### 5.4 Status badges

- Pill shape: `border-radius: var(--radius-full)`, `padding: 2px 10px`
- Colour coding: green = passing, amber = warning, red = failing, blue = in-progress
- Icon + text layout, `font-size: var(--text-xs)`
- Pulse animation on "detecting..." / "running..." states

### 5.5 Buttons

- Height: `--btn-h: 40px` (unified)
- Primary: brand gradient background + subtle glow `box-shadow: 0 0 12px var(--brand-glow)`
- Secondary/ghost: transparent bg, brand-coloured border or text
- `transition: transform 120ms ease, background 120ms ease, box-shadow 120ms ease`

### 5.6 Form inputs

- Search-style: integrated icon (magnifying glass), rounded `--radius-md`
- Height: 40px to match buttons
- Focus ring: `box-shadow: 0 0 0 3px var(--brand-glow)`
- Border transition: `transition: border-color 150ms ease`

### 5.7a Dropdown menus

- Existing language selector (`#lang-dropdown`) and export menu (`#export-menu`) are the two dropdown components
- Both open on button click, close on click outside or `Esc` key
- Appearance: 150ms fade + `translateY(4px → 0)`, positioned below trigger, `z-index: 100`
- Styling: `background: var(--surface-elevated)`, `border-radius: var(--radius-md)`, `box-shadow: var(--shadow-lg)`, 1px `border: var(--border-subtle)`

### 5.7 Navigation

- Desktop sidebar: 220px fixed left, `background: var(--surface-secondary)`, items with icon + label, active indicator as left border accent (3px, brand gradient)
- Mobile bottom bar: `position: fixed; bottom: 0`, full-width, `height: 64px`, safe-area-aware, icon-only, active state as top border accent

### 5.8 Footer

- Condense to single row: privacy badge inline with copyright
- Font: `--text-xs`, colour: `--text-tertiary`

### 5.9 Tooltips

- Replace native `title` attributes with floating tooltip cards
- Trigger: hover (desktop) / long-press ≥500ms with <5px movement and no scroll during press (mobile); release shows tooltip, any significant movement or scroll cancels
- Implementation: single shared `tooltip.ts` module; attach via `data-tooltip` attributes on relevant elements
- Appearance: 200ms fade-in, positioned above/below element, max-width 280px
- Content: short description from `data-tooltip` attribute, fallback to `title`; tooltip element linked via `aria-describedby`

## 6. Accessibility

### 6.1 Screen readers

- All score updates wrapped in `aria-live="polite"` regions
- `aria-busy="true"` set on containers during active tests
- Proper `role` attributes: `role="region"` on sections, `role="status"` on live regions
- Tab switch announces new section via live region

### 6.2 Focus management

- Visible focus rings (`outline: 2px solid var(--brand); outline-offset: 2px`) on all interactive elements
- Logical DOM tab order matching visual order
- Skip-to-content link retained
- Keyboard shortcuts: existing set kept; add `Esc` to close open dropdown menus (language selector `#lang-dropdown` and export menu `#export-menu`, see Section 5.7a)

### 6.3 Colour contrast

- All body text meets WCAG AA: 4.5:1 minimum in both themes
- Large text (headings, scores): 3:1 minimum
- Status badge colours tested for text-on-colour contrast
- No colour-as-only-indicator — status badges always include icon/text

### 6.4 Touch targets

- Minimum 44px × 44px for all interactive elements (mobile)
- Nav bar items at 48px minimum height
- Sufficient spacing between adjacent touch targets

## 7. PWA & Offline

### 7.1 Service worker

- Existing `sw.js` enhanced with offline fallback page
- Cache strategy: stale-while-revalidate for CSS/tokens, network-first for API, cache-first for fonts

### 7.2 Manifest

- `"display": "standalone"` (already set)
- `"background_color": "#08090a"` (dark default; manifest supports single value, no dual-theme)
- `"theme_color": "#08090a"` (kept)
- Splash screen: solid brand-dark background with centred logomark

### 7.3 Offline page

- Minimal page: logomark + "You're offline. Connect to the internet to run tests."
- Linked from service worker fetch handler when offline + navigation request

## 8. Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 100+ |
| Firefox | 100+ |
| Safari | 16+ |
| Edge | 100+ |

### 8.1 CSS progressive enhancement

```css
/* Modern: color-mix for glass effects */
@supports (background: color-mix(in srgb, black 50%, transparent)) {
  .card-score { background: color-mix(in srgb, var(--surface-secondary) 85%, transparent); }
}
/* Fallback: solid colour */
@supports not (background: color-mix(in srgb, black 50%, transparent)) {
  .card-score { background: var(--surface-secondary); }
}
```

Similar `@supports` for `clamp()`, `aspect-ratio`, `backdrop-filter`.

## 9. Testing Strategy

### 9.1 Visual regression

- Playwright-based screenshot comparisons added to CI
- Snapshots taken for each tab at 3 breakpoints (mobile, tablet, desktop)
- Both themes tested

### 9.2 Responsive testing

- Existing `vitest` suite extended with layout tests
- Manual QA checklist: every component renders correctly at 375px, 768px, 1280px

### 9.3 Accessibility audit

- axe-core automated scan in CI
- Manual keyboard navigation test per release

### 9.4 Performance budget

| Asset | Budget |
|-------|--------|
| `tokens.css` | < 5KB gzipped |
| `styles.css` | < 30KB gzipped |
| Total CSS | < 50KB gzipped |
| Total JS | < 80KB gzipped (existing budget, unchanged) |

## 10. Migration Strategy

### 10.1 Non-breaking rollout

- `tokens.css` loads first — introduces new variables without breaking existing component styles
- Existing component classes kept, styles migrated to new tokens incrementally
- Old CSS variables cleaned up after migration confirmed in both themes

### 10.2 File impact

| File | Change |
|------|--------|
| `public/css/tokens.css` | **New** — all primitive + semantic tokens |
| `public/css/styles.css` | **Refactor** — consume tokens, reorganise mobile-first |
| `index.html` | **Update** — add `tokens.css` link, update nav structure for mobile |
| `public/sw.js` | **Update** — add offline fallback, cache tokens.css |
| `public/manifest.json` | **Update** — add splash screen, single `background_color: "#08090a"` |
| `public/offline.html` | **New** — minimal offline fallback page |
| `src/client/tooltip.ts` | **New** — shared tooltip module |
| `src/client/__tests__/layout.test.ts` | **New** — responsive layout tests |
| `src/client/__tests__/a11y.test.ts` | **New** — axe-core accessibility tests |
| `e2e/visual/` | **New** — Playwright visual regression snapshots + config |
| `src/client/theme.ts` | May need minor update for token switching |
| `src/client/*.ts` (UI modules) | Light updates for new class names, aria attributes |

### 10.3 Rollback

All changes are additive — remove `tokens.css` link and revert `styles.css` refactor to restore previous state.
