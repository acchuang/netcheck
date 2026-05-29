# Modern Glass UI/UX — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Modern Glass aesthetic — frosted glass cards, gradient accents, refined shadows, smooth transitions, collapsible nav categories — across the entire NetCheck UI.

**Architecture:** CSS-only with minimal JS for nav collapse. New glass tokens in `tokens.css` (dark+light scoped), utility classes and animations in `app.css`, component updates across HTML/CSS/TS files. Existing JS architecture untouched.

**Tech Stack:** CSS custom properties, CSS `@keyframes`, `backdrop-filter`, TypeScript (minimal)

**Spec:** `docs/superpowers/specs/2026-05-29-ui-ux-modern-glass-design.md`

---

## Chunk 1: Design Tokens + Utility Classes

### Task 1: Add Glass Tokens to tokens.css

**Files:**
- Modify: `public/css/tokens.css`

- [ ] **Step 1: Add glass tokens to dark theme block**

In `public/css/tokens.css`, find the `[data-theme="dark"]` block. After the existing `--border-*` section, add:

```css
    /* Glass */
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

- [ ] **Step 2: Add glass tokens to light theme block**

Find the `[data-theme="light"]` block. Add the same block with light-appropriate values:

```css
    /* Glass */
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

- [ ] **Step 3: Verify themes still compile**

Run: `npm run typecheck && npm test`
Expected: No regressions

- [ ] **Step 4: Commit**

```bash
git add public/css/tokens.css
git commit -m "feat: add glass design tokens for dark and light themes"
```

---

### Task 2: Add Utility Classes and Animations to app.css

**Files:**
- Modify: `src/client/app.css`

- [ ] **Step 1: Add glass utility and animation classes**

Add to the end of `src/client/app.css` (after line 170):

```css
/* ========================================
   Modern Glass Utilities
   ======================================== */

.glass-card {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  box-shadow: var(--shadow-glass);
  transition: border-color 150ms ease;
}
.glass-card:hover {
  border-color: var(--glass-border-hover);
}

.glass-nav {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-color: var(--glass-border);
}

/* Section tab transition — use absolute positioning so inactive sections don't take space */
.section {
  position: absolute;
  width: 100%;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 200ms ease, transform 250ms ease-out;
  pointer-events: none;
}
.section.active {
  position: relative;
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
main {
  position: relative;
  min-height: 100vh;
}

/* Card stagger reveal */
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

/* Glass skeleton pulse */
.glass-skeleton {
  background: var(--glass-bg);
  border-radius: 0.5rem;
  animation: glass-pulse 1.5s ease-in-out infinite;
}
@keyframes glass-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 0.3; }
}

/* Pill badges */
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

/* Grade gradient text */
.grade-gradient-a-plus {
  background: linear-gradient(135deg, #22c55e, #4ade80);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Button styles */
.btn-primary {
  background: linear-gradient(135deg, var(--color-accent, #7c5cfc), #a78bfa);
  border: none;
  color: #fff;
}
.btn-primary:hover { opacity: 0.9; }

.btn-secondary {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  color: var(--color-text, #f0f0f2);
}
.btn-secondary:hover {
  border-color: var(--glass-border-accent);
  background: var(--glass-bg-hover);
}

/* Nav link transitions + active indicator */
.nav-link {
  transition: background 150ms ease, border-color 150ms ease;
  border-left: 3px solid transparent;
}
.nav-link:hover:not(.active) {
  background: var(--glass-bg-hover);
}
.nav-link.active {
  border-left: 3px solid;
  border-image: var(--gradient-bar) 1;
}

/* Button press feedback */
.btn:active {
  transform: scale(0.97);
  transition: transform 80ms ease;
}
.btn:not(:active) {
  transition: transform 150ms var(--ease-spring);
}
```

- [ ] **Step 2: Replace existing stagger-item with stagger-glass**

In `src/client/app.css`, find existing `.stagger-item` styles and rename to `.stagger-glass`:

```css
.stagger-glass {
  opacity: 0;
  animation: card-reveal 300ms ease-out forwards;
}
```

Note: The `.stagger-item` class is used in `adblock-ui.ts`. Task 8 renames these references to `.stagger-glass`.

- [ ] **Step 3: Verify build**

Run: `npm run typecheck`
Expected: No errors (CSS-only changes, typecheck is unaffected)

- [ ] **Step 4: Commit**

```bash
git add src/client/app.css
git commit -m "feat: add Modern Glass utility classes and animations"
```

---

## Chunk 2: Component Updates

### Task 3: Update Badge Component

**Files:**
- Modify: `src/client/components/badge.ts`

- [ ] **Step 1: Update renderBadge to output pill-shaped HTML**

In `src/client/components/badge.ts`, find the `renderBadge` function. Add pill classes:

```typescript
export function renderBadge(props: BadgeProps): HTMLElement {
  const el = document.createElement('span');
  const pillClass = `badge-pill badge-pill-${props.status}`;
  el.className = `${pillClass} check-badge`;
  el.textContent = props.label;
  if (props.detail) {
    el.setAttribute('title', props.detail);
  }
  return el;
}
```

- [ ] **Step 2: Verify with existing tests**

Run: `npx vitest run src/client/__tests__/badge.test.ts`
Expected: Tests pass (badge output may change but class-based tests should still work)

- [ ] **Step 3: Commit**

```bash
git add src/client/components/badge.ts
git commit -m "feat: update badges to pill-shaped glass style"
```

---

### Task 4: Update Progress Bar Component

**Files:**
- Modify: `src/client/components/progress.ts`

- [ ] **Step 1: Add gradient fill to progress bar**

In `src/client/components/progress.ts`, update the fill element to use the gradient:

```css
/* In the progress bar's fill element style: */
background: var(--gradient-bar);
```

Or if rendering inline styles in TypeScript, change:
```typescript
fill.style.background = 'var(--gradient-bar)';
```

- [ ] **Step 2: Verify with existing tests**

Run: `npx vitest run src/client/__tests__/progress.test.ts`
Expected: Tests pass

- [ ] **Step 3: Commit**

```bash
git add src/client/components/progress.ts
git commit -m "feat: gradient fill on progress bars"
```

---

### Task 5: Apply Glass Cards to index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add glass-card class to card-like elements**

In `index.html`, find all elements with classes like `dash-stat-card`, `tls-details-card`, etc. Add `glass-card` to their class list. Skip elements that are purely structural (tables, form rows, headers). Focus on card containers:

The `.glass-card` class replaces existing background/border/border-radius on these elements. Example changes:

```html
<!-- Before -->
<div class="dash-stat-card">...</div>
<div class="tls-grade-card">...</div>

<!-- After -->
<div class="dash-stat-card glass-card">...</div>
<div class="tls-grade-card glass-card">...</div>
```

Also add `.glass-nav` to the `<nav class="nav">` element.

Also add `.input-glass` to the `<input class="check-input">` elements that benefit from glass styling (domain inputs in email, headers, DNS tabs).

- [ ] **Step 2: Verify HTML is valid**

Review: no unclosed tags, no malformed attributes.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: apply glass-card and glass-nav classes to HTML elements"
```

---

### Task 6: Update Skeleton Rendering

**Files:**
- Modify: `src/client/ui-utils.ts`
- Modify: `src/client/tabs/dashboard-tab.ts`

- [ ] **Step 1: Add glass-skeleton class to renderSkeletonRows output**

In `src/client/ui-utils.ts`, find `renderSkeletonRows`. Update the generated row div to include `glass-skeleton`:

```typescript
export function renderSkeletonRows(container: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.className = 'skeleton-row glass-skeleton';
    // ... existing row content
    container.appendChild(row);
  }
}
```

- [ ] **Step 2: Update dashboard empty state skeletons**

In `src/client/tabs/dashboard-tab.ts`, find the `renderSkeletonCards` function. Update skeleton blocks from `.skeleton-block` to `.glass-skeleton`:

```typescript
function renderSkeletonCards(): string {
  return `
    <div class="dashboard-stats">
      <div class="dash-stat-card glass-card">
        <div class="glass-skeleton" style="width:60%;height:1.75rem;"></div>
        <div class="glass-skeleton" style="width:40%;height:2.25rem;margin-top:0.5rem;"></div>
        <div class="glass-skeleton" style="width:80%;height:0.75rem;margin-top:0.25rem;"></div>
      </div>
      <!-- repeat for other 3 cards -->
    </div>
    <!-- ... CTA section unchanged ... -->
  `;
}
```

- [ ] **Step 3: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/client/ui-utils.ts src/client/tabs/dashboard-tab.ts
git commit -m "feat: glass-skeleton for loading states"
```

---

### Task 7: Apply Grade Display + Content Max-Width + Mobile Glass

**Files:**
- Modify: `src/client/app.css`

- [ ] **Step 1: Add content max-width**

Add to `src/client/app.css`:

```css
/* Content max-width for readability */
.section-body,
[id$="-content"] {
  max-width: 52rem;
  margin-left: auto;
  margin-right: auto;
}
```

- [ ] **Step 2: Add mobile nav glass backdrop**

Add to `src/client/app.css`:

```css
/* Mobile nav glass overlay */
body.nav-open .nav {
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
```

- [ ] **Step 3: Add skeleton → content fade transition**

Add to `src/client/app.css`:

```css
/* Skeleton fade-out */
.skeleton-row {
  transition: opacity 300ms ease;
}
.data-loaded .skeleton-row {
  opacity: 0;
  pointer-events: none;
}
```

- [ ] **Step 4: Verify build**

Run: `npm run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/client/app.css
git commit -m "feat: content max-width, mobile glass backdrop, skeleton fade"
```

---

### Task 8: Apply Grade Gradient Text + stagger-glass Rename

**Files:**
- Modify: `src/client/tabs/dashboard-tab.ts`
- Modify: `src/client/adblock-ui.ts` (stagger-item → stagger-glass)

- [ ] **Step 1: Apply grade-gradient-a-plus to A+ score displays**

In `src/client/tabs/dashboard-tab.ts`, find the overall grade rendering. Replace inline `style="color:${gradeColor}"` with `class="grade-gradient-a-plus"` when `score >= 93`:

```typescript
const gradeClass = score >= 93 ? 'grade-gradient-a-plus' : '';
const gradeStyle = score < 93
  ? `style="color:${GRADE_COLORS[grade] || 'var(--text-secondary)'}"`
  : '';

const statsHtml = `
  ...
  <div class="dash-stat-value ${gradeClass}" ${gradeStyle}>${grade || '—'}</div>
  ...
`;
```

- [ ] **Step 2: Rename .stagger-item to .stagger-glass in adblock-ui.ts**

In `src/client/adblock-ui.ts`, search for `stagger-item` and replace with `stagger-glass`:

```typescript
// Before:
catEl.classList.add('stagger-item');
// After:
catEl.classList.add('stagger-glass');
```

Also remove any old `.stagger-item` CSS from `public/css/styles.css` if present.

- [ ] **Step 3: Verify build and tests**

Run: `npm run typecheck && npm test`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/dashboard-tab.ts src/client/adblock-ui.ts
git commit -m "feat: grade gradient for A+, rename stagger-item to stagger-glass"
```

---

### Task 9: Add Category Collapse Navigation

**Files:**
- Modify: `index.html`
- Modify: `src/client/app.ts`

- [ ] **Step 1: Add chevron spans to nav category labels**

In `index.html`, for each `.nav-category-label`, add a chevron SVG inside:

```html
<span class="nav-category-label">
  Overview
  <span class="nav-category-chevron">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </span>
</span>
```

Add to all 5 categories (Overview, Security, Performance, Privacy, Explore).

- [ ] **Step 2: Add chevron CSS to app.css**

At the end of `src/client/app.css`, add:

```css
.nav-category-chevron {
  display: inline-flex;
  align-items: center;
  transition: transform 200ms ease;
  opacity: 0.5;
}
.nav-category.collapsed .nav-category-chevron {
  transform: rotate(90deg);
}
.nav-category.collapsed .nav-category-links {
  display: none;
}
.nav-category-label {
  cursor: pointer;
  user-select: none;
}
```

- [ ] **Step 3: Add collapse JS to app.ts**

In `src/client/app.ts`, inside the `initTabs()` function, add the collapse listener:

```typescript
// Category collapse/expand
document.querySelectorAll('.nav-category-label').forEach((label) => {
  label.addEventListener('click', () => {
    const category = label.parentElement! as HTMLElement;
    category.classList.toggle('collapsed');
    try {
      const indices: number[] = [];
      document.querySelectorAll('.nav-category').forEach((c, i) => {
        if (c.classList.contains('collapsed')) indices.push(i);
      });
      localStorage.setItem('netcheck-nav-collapsed', JSON.stringify(indices));
    } catch { /* quota / private browsing */ }
  });
});

// Restore collapsed state
try {
  const saved = JSON.parse(localStorage.getItem('netcheck-nav-collapsed') || '[]');
  const cats = document.querySelectorAll('.nav-category');
  saved.forEach((i: number) => { if (cats[i]) cats[i].classList.add('collapsed'); });
} catch { /* */ }
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run typecheck && npm test`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add index.html src/client/app.ts src/client/app.css
git commit -m "feat: add collapsible nav categories with chevron"
```

---

### Task 10: Apply Tab Transitions

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Remove display-toggle based .section styles**

In `public/css/styles.css`, find the existing `.section` styles (likely near line 455). They use `display: none` / `display: block` to toggle visibility. Remove these and replace with:

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

This replaces the existing `app.css` section styles from Task 2 — since `app.css` loads last, its definition wins. Keep both for clarity but ensure `styles.css` no longer uses `display: none` on `.section`.

- [ ] **Step 3: Commit**

```bash
git add src/client/app.css public/css/styles.css
git commit -m "feat: fade+slide tab transitions"
```

---

## Chunk 4: Verification + Deploy

### Task 11: Full Verification

- [ ] **Step 1: Run full test suite**

```bash
npm test
```
Expected: All tests pass (no regressions from CSS/class changes)

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: No errors

- [ ] **Step 3: Run lint**

```bash
npm run lint
```
Expected: No errors (0 errors, pre-existing warnings OK)

- [ ] **Step 4: Build check**

```bash
npm run build
```
Expected: Build succeeds

- [ ] **Step 5: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 6: Deploy to Cloudflare**

```bash
npm run deploy
```

- [ ] **Step 7: Manual visual verification**

Open `https://netcheck.oilygold.xyz` and verify:
- Cards have glass effect (translucent background, subtle border)
- Dashboard: glass stats cards, pill quick status badges, glass-skeleton on empty state
- Navigation: chevrons visible, click to collapse/expand, state persisted on reload
- Tab switches: content fades + slides
- Buttons: gradient primary, press feedback (scale)
- Badges: pill-shaped with tinted backgrounds
- Dark theme: glass uses white tints
- Light theme: glass uses black tints (toggle theme to verify)
- Mobile: hamburger sidebar has glass backdrop

- [ ] **Step 8: Final commit (if any post-deploy fixes)**

```bash
git add -A && git commit -m "fix: post-deploy visual tweaks" && git push origin main && npm run deploy
```
