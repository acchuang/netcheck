# Modern Glass — UI/UX Enhancement Design

**Date:** 2026-05-29
**Status:** Draft
**Approach:** Design tokens first, then systematic component rollout
**Visual Direction:** Modern Glass / Premium

## Context

NetCheck has a functional but utilitarian UI — solid dark backgrounds, flat cards, minimal visual hierarchy, and basic transitions. The design lacks depth, polish, and the refined feel expected from a modern diagnostic tool. The goal is a premium glass aesthetic with:

- Frosted glass cards with subtle backdrop-blur
- Refined borders and shadows for depth
- Gradient accents for visual hierarchy
- Smooth micro-interactions and transitions
- Collapsible navigation categories
- Mobile-friendly glass sidebar overlay

All changes are CSS-only — no new JS dependencies, no framework changes. The only DOM change is adding chevron `<span>` elements to nav category labels for collapsible navigation. The existing `Vanilla TS` + `Vite` + `Cloudflare Workers` architecture is untouched.

### CSS File Load Order

The site loads CSS in this order:
1. `/css/tokens.css` (semantic tokens, `--surface-*`, `--border-*`, `--status-*`, dark+light scoped)
2. `/public/css/styles.css` (main stylesheet, references tokens.css variables)
3. `app.css` loaded last by Vite (Tailwind `@theme` block, `--color-*` variables, utility classes)

New glass tokens go in **`tokens.css`** (loaded first, available to all subsequent stylesheets) inside the existing `[data-theme="dark"]` and `[data-theme="light"]` blocks. New CSS utility classes and component overrides go in **`app.css`** (loaded last, can override styles.css selectors).

---

## Phase 1: Design Tokens

**Files:** `public/css/tokens.css` (new custom properties), `src/client/app.css` (new utility classes)

### 1.1 New Custom Properties in tokens.css

Add to both `[data-theme="dark"]` and `[data-theme="light"]` blocks in `public/css/tokens.css`, next to the existing `--border-*` section:

**Dark theme:**
```css
/* Glass tokens */
--glass-bg: rgba(255, 255, 255, 0.04);
--glass-bg-hover: rgba(255, 255, 255, 0.06);
--glass-bg-active: rgba(255, 255, 255, 0.08);
--glass-blur: blur(12px);
--glass-border: rgba(255, 255, 255, 0.08);
--glass-border-hover: rgba(255, 255, 255, 0.12);
--glass-border-accent: rgba(124, 92, 252, 0.25);
--shadow-glass: 0 1px 3px rgba(0, 0, 0, 0.3);
--shadow-glass-elevated: 0 4px 12px rgba(0, 0, 0, 0.4);
--gradient-bar: linear-gradient(90deg, #7c5cfc, #2dd4bf);
```

**Light theme:**
```css
/* Glass tokens */
--glass-bg: rgba(0, 0, 0, 0.03);
--glass-bg-hover: rgba(0, 0, 0, 0.05);
--glass-bg-active: rgba(0, 0, 0, 0.07);
--glass-blur: blur(12px);
--glass-border: rgba(0, 0, 0, 0.06);
--glass-border-hover: rgba(0, 0, 0, 0.10);
--glass-border-accent: rgba(124, 92, 252, 0.25);
--shadow-glass: 0 1px 3px rgba(0, 0, 0, 0.08);
--shadow-glass-elevated: 0 4px 12px rgba(0, 0, 0, 0.12);
--gradient-bar: linear-gradient(90deg, #7c5cfc, #2dd4bf);
```

### 1.2 Utility Classes in app.css

Add to `src/client/app.css` after the existing `.card-base` utility (line ~157):

```css
/* Glass card overlay — reuse on existing card elements */
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-glass);
  transition: border-color 150ms ease;
}
.glass-card:hover {
  border-color: var(--glass-border-hover);
}

/* Glass nav — for sidebar/nav */
.glass-nav {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-color: var(--glass-border);
}

/* Sections get transition for tab switches */
.section-tab {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 200ms ease, transform 250ms ease-out;
  pointer-events: none;
}
.section-tab.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

/* Card reveal stagger */
.stagger-glass {
  opacity: 0;
  animation: glass-reveal 300ms ease-out forwards;
}
.stagger-glass:nth-child(1) { animation-delay: 0ms; }
.stagger-glass:nth-child(2) { animation-delay: 75ms; }
.stagger-glass:nth-child(3) { animation-delay: 150ms; }
.stagger-glass:nth-child(4) { animation-delay: 225ms; }
.stagger-glass:nth-child(5) { animation-delay: 300ms; }
.stagger-glass:nth-child(6) { animation-delay: 375ms; }
.stagger-glass:nth-child(7) { animation-delay: 450ms; }
.stagger-glass:nth-child(8) { animation-delay: 525ms; }

@keyframes glass-reveal {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Glass pulse skeleton — replaces existing skeleton-pulse for glass aesthetic */
.glass-skeleton {
  background: var(--glass-bg);
  border-radius: var(--radius-md);
  animation: glass-pulse 1.5s ease-in-out infinite;
}
@keyframes glass-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

/* Gradient accent bar for section headers and nav active indicator */
.gradient-accent-bar {
  background: linear-gradient(135deg, var(--color-accent, #7c5cfc), #a78bfa);
}

/* Pill badges for status display */
.badge-pill {
  border-radius: 1rem;
  padding: 0.2rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 500;
}
.badge-pill-pass {
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.2);
  color: var(--status-pass, #2dd4bf);
}
.badge-pill-warn {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.2);
  color: var(--status-warn, #fbbf24);
}
.badge-pill-fail {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.2);
  color: var(--status-fail, #f87171);
}

/* Button enhancements */
.btn-glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--color-text, #f0f0f2);
}
.btn-gradient {
  background: linear-gradient(135deg, var(--color-accent, #7c5cfc), #a78bfa);
  border: none;
  color: #fff;
}
.btn-gradient:hover {
  opacity: 0.9;
}

/* Input glass style */
.input-glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  transition: border-color 150ms ease;
}
.input-glass:focus {
  border-color: var(--glass-border-accent);
  outline: none;
}

/* Grade gradient text for A+ */
.grade-gradient-a-plus {
  background: linear-gradient(135deg, #22c55e, #4ade80);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Phase 2: Component Standards

### 2.1 Cards

All existing card elements (`dash-stat-card`, `email-card`, `tls-details-card`, etc.) get the `.glass-card` class added in `index.html` or in their respective tab render functions (where the HTML is generated in TypeScript). The existing card backgrounds and borders are removed from per-component CSS and replaced by the single `.glass-card` utility.

In `index.html` and tab modules, change e.g.:
```html
<div class="dash-stat-card">...</div>
```
to:
```html
<div class="dash-stat-card glass-card">...</div>
```

For dynamically rendered cards (dashboard, TLS, email), add the class in the template strings. Card-specific padding, grid placement, and typography stay in their component classes — only background, border, border-radius, and shadow move to `.glass-card`.

Note: `app.css` already has a `.card-base` utility (line ~153). `.glass-card` replaces it for glass-aesthetic cards. Existing `.card-base` usage is updated to `.glass-card`.

### 2.2 Buttons

**Primary buttons** (`.btn-primary` in styles.css):
- Background changed from solid `var(--color-accent)` to `linear-gradient(135deg, var(--color-accent), #a78bfa)`
- Active: `transform: scale(0.97); transition: transform 80ms ease;`
- Release: `transition: transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1);`

**Secondary buttons** (`.btn-secondary`):
- Background: `var(--glass-bg)` instead of solid
- Border: `1px solid var(--glass-border)`
- Hover: `border-color: var(--glass-border-accent); background: var(--glass-bg-hover);`

### 2.3 Badges

Update `renderBadge` in `src/client/components/badge.ts` to output pill-shaped HTML using the `.badge-pill` and `.badge-pill-{status}` classes defined in 1.2.

### 2.4 Inputs

Add `.input-glass` class to `<input class="check-input input-glass">` in `index.html`. The existing `.check-input` sizing/layout stays; `.input-glass` handles the glass visual treatment.

### 2.5 Progress Bars

Update the `components/progress.ts` render output to use `var(--gradient-bar)` for the fill element's background.

### 2.6 Loading Skeletons

Add the `.glass-skeleton` class to skeleton HTML output. In `renderSkeletonRows()` from `ui-utils.ts`, update the generated markup to include `glass-skeleton` on the skeleton row elements. Dashboard empty state skeletons in `dashboard-tab.ts` also get the class. The existing `@keyframes skeleton-pulse` in `styles.css:2748` is kept for backward compatibility.

### 2.7 Grade Display

A+ grades: replace inline `style="color:var(--grade-a-plus)"` with the `.grade-gradient-a-plus` class from 1.2. Other grades (A, B, C, D, F) keep their existing solid colors.

---

## Phase 3: Layout & Navigation

### 3.1 Sidebar (`index.html` nav element)

- Add `.glass-nav` class to the `<nav class="nav">` element
- Active nav item: `background: var(--glass-bg-active); border-left: 3px solid; border-image: var(--gradient-bar) 1;`
- Inactive nav item hover: `background: var(--glass-bg-hover); transition: background 150ms ease;`
- Focus-visible: `border-left: 3px solid var(--glass-border-accent);`
- Category labels: clickable chevron that rotates 90deg on expand
- Collapsed state stored in `localStorage` key `netcheck-nav-collapsed`
- Bottom toolbar stays fixed with glass background

### 3.2 Category Collapse (DOM + JS change)

Add a `<span class="nav-category-chevron">` inside each `.nav-category-label` in `index.html`. Example:
```html
<span class="nav-category-label">
  Security
  <span class="nav-category-chevron">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
  </span>
</span>
```

CSS: `.nav-category-chevron` transitions 90deg on `.nav-category.collapsed`. The collapsed state hides `.nav-category-links` children via `display: none`.

JS: In `app.ts` `initTabs()`, add click listener:
```typescript
document.querySelectorAll('.nav-category-label').forEach((label) => {
  label.addEventListener('click', () => {
    const category = label.parentElement!;
    category.classList.toggle('collapsed');
    // Save collapsed state to localStorage
    const collapsed = document.querySelectorAll('.nav-category.collapsed');
    const ids = Array.from(collapsed).map((c, i) => i);
    try { localStorage.setItem('netcheck-nav-collapsed', JSON.stringify(ids)); } catch {}
  });
});
// Restore collapsed state on load
try {
  const saved = JSON.parse(localStorage.getItem('netcheck-nav-collapsed') || '[]');
  const cats = document.querySelectorAll('.nav-category');
  saved.forEach((i: number) => { if (cats[i]) cats[i].classList.add('collapsed'); });
} catch {}
```

### 3.3 Dashboard (`.dashboard-stats`, `.dashboard-quick-status`)

- Cards: replace existing solid bg with `.glass-card` class
- Quick Status: pill badges (see 2.3) instead of raw text spans
- Mini chart: bar fills get `var(--gradient-bar)`
- Empty state skeleton: use glass-pulse instead of gray blocks

### 3.4 Tab Content Transitions

- Current: immediate hide/show via `display` or `opacity` toggle
- New CSS:
```css
.section {
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 200ms ease, transform 250ms ease-out;
  pointer-events: none;
}
.section.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
```
- Respect `prefers-reduced-motion: reduce` (duration: 0.01ms, no transform)

### 3.5 Mobile Layout (<768px)

The existing mobile layout uses a hamburger-triggered sidebar overlay (`.nav-open` class on body). The changes:

- **Sidebar overlay:** Add `backdrop-filter: var(--glass-blur)` and glass background via the `.glass-nav` class. The existing `position: fixed` and `z-index` handling in `styles.css` stays unchanged.
- **Bottom toolbar:** The existing `.nav-toolbar` at the bottom of the sidebar stays in place and inherits glass styling. On mobile, it remains inside the slide-out sidebar (no change to DOM position). Icons are already SVG-only; no label removal needed.
- **Content:** Full-width with existing padding. The `max-width: 52rem` from 3.6 applies on tablets and up.
- **Safe-area:** Existing `env(safe-area-inset-bottom)` handling in `styles.css:2208` stays unchanged.
- **Touch targets:** All interactive elements already have `min-height: 44px` / `min-width: 44px`. Glass styling doesn't change this.

### 3.6 Content Max-Width

- All `.section-body` or main content containers get `max-width: 52rem; margin: 0 auto;`
- Prevents text/content from stretching too wide on large screens

---

## Phase 4: Motion & Interactions

### 4.1 Card Reveal Stagger

Uses the `.stagger-glass` class and `@keyframes glass-reveal` defined in Phase 1.2. Apply `.stagger-glass` class to cards as they're inserted into the DOM (already done for adblock categories via `.stagger-item` — rename existing uses to `.stagger-glass`).

### 4.2 Button Press

```css
.btn { transition: transform 80ms ease; }
.btn:active { transform: scale(0.97); }
.btn:not(:active) { transition: transform 150ms var(--ease-spring); }
```

### 4.3 Nav Item Hover

```css
.nav-link {
  transition: background 150ms ease, border-color 150ms ease;
  border-left: 3px solid transparent;
}
.nav-link:hover:not(.active) {
  background: var(--glass-bg-hover);
}
```

### 4.4 Loading → Content Fade

```css
.skeleton-block { transition: opacity 300ms ease; }
.data-loaded .skeleton-block { opacity: 0; pointer-events: none; }
```

### 4.5 Score Gauge Animation

- Existing `animateNumber` from `motion.ts` is reused
- A+ gradient text is applied via `.grade-gradient-a-plus` class (see 1.2)
- All respects `prefersReducedMotion()` guard (already added in `motion.ts`)

### 4.6 Reduced Motion

The site already has two `@media (prefers-reduced-motion: reduce)` blocks in `styles.css` (lines ~2448 and ~3202) that zero out animation durations. No new block is added — the existing blocks automatically cover all new animations since they use `*` selectors.

The JS-level guard in `motion.ts` (`prefersReducedMotion()`) already skips counter animations for reduced-motion users. No changes needed.

New animations (`glass-reveal`, `glass-pulse`, tab transitions) are all CSS `animation`/`transition` properties — they are automatically disabled by the existing `prefers-reduced-motion` media query blocks.

---

## File Structure After Implementation

```
Modified files:
  public/css/tokens.css         # +~50 lines: glass tokens in [data-theme="dark"] and [data-theme="light"] blocks
  src/client/app.css            # +~200 lines: utility classes (glass-card, badges, skeletons, animations, etc.)
  public/css/styles.css         # ~50 lines changed: existing selectors updated for glass, some backgrounds/borders removed
  index.html                    # +~30 lines: .glass-card classes, chevron spans in nav categories
  src/client/app.ts             # +~25 lines: category collapse JS in initTabs()
  src/client/tabs/dashboard-tab.ts  # Minor: skeleton HTML uses .glass-skeleton
  src/client/components/badge.ts    # Minor: badge output uses pill classes
  src/client/components/progress.ts # Minor: fill uses gradient bar

No new files. No new dependencies. CSS-only (+ HTML class additions, minimal JS for nav collapse).
```

## File Path Note

`tokens.css` is referenced as `/css/tokens.css` in `index.html:68` (no `public/` prefix in the href attribute). The actual source file is `public/css/tokens.css`.

---

## Acceptance Criteria

- **Tokens:** Glass custom properties added to `tokens.css` in both `[data-theme="dark"]` and `[data-theme="light"]` blocks. Light theme uses `rgba(0,0,0,...)` tints; dark theme uses `rgba(255,255,255,...)` tints. Utility classes added to `app.css`.
- **Cards:** All card elements get `.glass-card` class. Glass background, backdrop-blur, refined border. Hover brightens border.
- **Buttons:** Primary buttons have gradient background. Active press scales to 0.97. Secondary buttons have glass background.
- **Badges:** Pill-shaped with tinted backgrounds (green/amber/red at 10% opacity + 20% border). Uses existing `renderBadge` component — modify output, not replace.
- **Sidebar:** Glass nav via `.glass-nav`. Active item: gradient left border. Category labels: chevron + collapse/expand. State in localStorage, graceful fallback if unavailable.
- **Dashboard:** Glass stats cards + glass-skeleton empty state + gradient mini-chart bars.
- **Tab transitions:** Sections fade + slide on switch via `.section-tab` class on `<section>` elements. Instant on reduced motion (covered by existing media query blocks).
- **Skeletons:** Glass-pulse animation replacing gray blocks where `.glass-skeleton` is used. Existing `skeleton-pulse` keyframes kept for backward compatibility.
- **Mobile:** Sidebar overlay gets glass backdrop-blur. Bottom toolbar stays in sidebar (no structural change). Touch targets remain ≥44px.
- **No regressions:** All existing tests pass. TypeScript clean. ESLint clean. CSS bundle ~+3KB gzipped.
- **Dark/light theme:** Both themes supported. Glass tokens use theme-appropriate tints (white on dark, black on light).
