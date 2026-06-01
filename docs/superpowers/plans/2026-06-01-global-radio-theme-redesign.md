# Global Radio Theme Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign NetCheck's visual theme from violet/glass to Global Radio lime/terminal aesthetic — flat dark cards, pill badges, mono typography, category accent colors.

**Architecture:** Token-first migration. Replace design tokens → update Tailwind @theme → rewrite base styles → rewrite component CSS → update HTML/TS markup. All existing functionality and state management remain untouched.

**Tech Stack:** CSS custom properties, Tailwind CSS v4, TypeScript, Vite, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-06-01-global-radio-theme-redesign.md`

**Key files that will be fully rewritten:**
- `public/css/tokens.css` (~242 lines → ~180 new)
- `public/css/styles.css` (~3,978 lines → ~2,500 new)
- `src/client/app.css` (~611 lines → ~350 new)

**Key files that will be partially edited:**
- `index.html` — font links, header markup
- `src/client/app.ts` — toolbar repositioning
- `src/client/theme.ts` — minor token adjustments
- `src/client/components/badge.ts` — class name updates
- `src/client/components/card.ts` — class name updates
- `src/client/components/progress.ts` — class name updates
- `src/client/ui-utils.ts` — animation helpers adapted

---

## Chunk 1: Design Tokens — Color, Spacing, Typography

### Task 1.1: Rewrite tokens.css

**Files:**
- Modify: `public/css/tokens.css` (complete rewrite)

- [ ] **Step 1: Write the complete new tokens.css**

Replace the entire content of `tokens.css` with:

```css
/* ========================================
   NetCheck Global Radio Design Tokens
   ======================================== */

/* ── Raw color palette ── */
:root {
  --gray-0: #ffffff;
  --gray-50: #F5F5F0;
  --gray-100: #E3E3D3;
  --gray-200: #CCCCBB;
  --gray-300: #AAAA99;
  --gray-400: #888877;
  --gray-500: #666655;
  --gray-600: #4a4a3a;
  --gray-700: #333322;
  --gray-800: #1a1a11;
  --gray-850: #111111;
  --gray-900: #0D0D0D;
  --gray-950: #0A0A0A;
  --gray-1000: #000000;
}

/* ── Category accent colors ── */
:root {
  --accent-lime: #C8FF00;
  --accent-cyan: #00C2FF;
  --accent-orange: #FF6B35;
  --accent-rose: #FF4D6A;
  --accent-purple: #A855F7;
  --accent-green: #22C55E;
  --accent-amber: #FFB800;

  --status-pass: var(--accent-lime);
  --status-warn: var(--accent-amber);
  --status-fail: var(--accent-rose);
  --status-neutral: #4a4a4a;
}

/* ── Spacing scale ── */
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
}

/* ── Radius scale ── */
:root {
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-2xl: 24px;
  --radius-full: 9999px;
}

/* ── Shadows ── */
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow: 0 0 20px rgba(200, 255, 0, 0.15);
  --shadow-glow-hover: 0 0 20px rgba(200, 255, 0, 0.3);
}

/* ── Type scale ── */
:root {
  --text-hero: 3.5rem;
  --text-display: 2.5rem;
  --text-heading: 1.5rem;
  --text-body: 0.875rem;
  --text-mono: 0.75rem;
  --text-mono-sm: 0.625rem;
  --text-mono-xs: 0.5rem;
}

/* ── Leading ── */
:root {
  --leading-tight: 1.1;
  --leading-snug: 1.3;
  --leading-normal: 1.5;
}

/* ── Transitions ── */
:root {
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-150: 150ms;
  --duration-200: 200ms;
  --duration-300: 300ms;
}

/* ── Layout ── */
:root {
  --page-px: clamp(1rem, 5vw, 2.5rem);
  --container-max: 1200px;
  --sidebar-width: 180px;
  --header-height: 48px;
  --gap-sm: var(--space-2);
  --gap-md: var(--space-3);
  --gap-lg: var(--space-6);
  --card-p: var(--space-5);
}

/* ========================================
   Semantic Tokens — Dark Theme
   ======================================== */

[data-theme="dark"] {
  --surface-primary: var(--gray-950);
  --surface-secondary: var(--gray-900);
  --surface-tertiary: #0f0f0f;
  --surface-elevated: var(--gray-850);

  --text-primary: var(--gray-100);
  --text-secondary: #666666;
  --text-muted: #4a4a4a;

  --border-default: #1a1a1a;
  --border-accent: var(--status-pass);
  --border-hover: var(--gray-850);

  --accent: var(--accent-lime);
  --accent-glow: rgba(200, 255, 0, 0.12);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);

  color-scheme: dark;
}

/* ========================================
   Semantic Tokens — Light Theme
   ======================================== */

[data-theme="light"] {
  --surface-primary: #F5F5F0;
  --surface-secondary: #FFFFFF;
  --surface-tertiary: #E8E8E3;
  --surface-elevated: #F0F0EB;

  --text-primary: #0A0A0A;
  --text-secondary: #555555;
  --text-muted: #888888;

  --border-default: #e0e0d8;
  --border-accent: var(--status-pass);
  --border-hover: #ccccbb;

  --accent: var(--accent-lime);
  --accent-glow: rgba(200, 255, 0, 0.08);

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.08);

  color-scheme: light;
}
```

- [ ] **Step 2: Verify tokens.css is valid CSS**

```bash
node -e "require('fs').readFileSync('public/css/tokens.css','utf8').length > 100 && console.log('OK: tokens.css has content')"
```

- [ ] **Step 3: Commit**

```bash
git add public/css/tokens.css
git commit -m "feat: rewrite design tokens for Global Radio theme — lime palette, flat surfaces, mono type scale"
```

### Task 1.2: Update Tailwind @theme in app.css

**Files:**
- Modify: `src/client/app.css` (@theme block only, lines 7-66)

- [ ] **Step 1: Replace the @theme block in app.css**

Replace lines 7-66 (the entire `@theme { ... }` block) with:

```css
@theme {
  /* ── Colors ── */
  --color-bg: #0A0A0A;
  --color-bg-surface: #0D0D0D;
  --color-bg-elevated: #111111;
  --color-bg-tertiary: #0f0f0f;

  --color-text: #E3E3D3;
  --color-text-secondary: #666666;
  --color-text-muted: #4a4a4a;

  --color-accent: #C8FF00;
  --color-accent-hover: #D4FF1A;
  --color-accent-glow: rgba(200, 255, 0, 0.15);
  --color-accent-subtle: rgba(200, 255, 0, 0.06);

  --color-cyan: #00C2FF;
  --color-orange: #FF6B35;
  --color-rose: #FF4D6A;
  --color-purple: #A855F7;
  --color-green: #22C55E;
  --color-amber: #FFB800;

  --color-border: #1a1a1a;
  --color-border-hover: #333333;
  --color-border-accent: rgba(200, 255, 0, 0.3);

  /* ── Typography ── */
  --font-sans: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  --font-display: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;

  --text-hero: 3.5rem;
  --text-display: 2.5rem;
  --text-heading: 1.5rem;
  --text-body: 0.875rem;
  --text-mono: 0.75rem;
  --text-mono-sm: 0.625rem;
  --text-xs: 0.625rem;
  --text-sm: 0.75rem;
  --text-base: 0.875rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --text-4xl: 2.5rem;

  /* ── Spacing ── */
  --spacing-page: clamp(1.5rem, 5vw, 3rem);

  /* ── Radius ── */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;

  /* ── Shadows ── */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 20px var(--color-accent-glow);

  /* ── Transitions ── */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 2: Verify the @theme block is syntactically valid**

```bash
grep -c '@theme' src/client/app.css | grep '1' || echo "ERROR: wrong number of @theme blocks"
```

- [ ] **Step 3: Commit**

```bash
git add src/client/app.css
git commit -m "feat: update Tailwind @theme for Global Radio design tokens"
```

---

## Chunk 2: Base Styles & Utility Classes

### Task 2.1: Rewrite base styles and utilities in app.css

**Files:**
- Modify: `src/client/app.css` (base layer, utility classes, remove feature CSS)

- [ ] **Step 1: Replace the base layer styles (lines 68-101 of app.css)**

Remove the noise texture, Geist font-feature-settings, and old base styles. Replace lines 68-101 with:

```css
/* ── Base Reset ── */
@layer base {
  *, *::before, *::after {
    border-color: var(--color-border);
  }

  html {
    scroll-behavior: smooth;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    font-family: var(--font-sans);
    background: var(--color-bg);
    color: var(--color-text);
    line-height: 1.6;
    min-height: 100dvh;
    overflow-x: hidden;
  }
}
```

- [ ] **Step 2: Rewrite utility classes (lines 103-170 of app.css)**

Replace the `.text-display`, `.text-heading`, `.text-label`, `.glow-border`, `.card-base`, `.gradient-text` utilities with:

```css
/* ── Utility Classes ── */
@layer utilities {
  .text-hero {
    font-family: var(--font-display);
    font-size: var(--text-hero);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .text-hero-accent {
    font-family: var(--font-display);
    font-size: var(--text-hero);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--accent-lime);
  }

  .text-display {
    font-family: var(--font-display);
    font-size: var(--text-display);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .text-heading {
    font-family: var(--font-display);
    font-size: var(--text-heading);
    font-weight: 700;
    line-height: 1.2;
  }

  .text-label {
    font-family: var(--font-mono);
    font-size: var(--text-mono-sm);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .text-label-muted {
    font-family: var(--font-mono);
    font-size: var(--text-mono-sm);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .text-mono {
    font-family: var(--font-mono);
    font-size: var(--text-mono);
  }

  .text-mono-sm {
    font-family: var(--font-mono);
    font-size: var(--text-mono-sm);
  }

  .card-flat {
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    transition: border-color var(--duration-150) var(--ease-out);
  }

  .card-flat:hover {
    border-color: var(--color-border-hover);
  }

  .card-accent-top {
    position: relative;
    background: var(--color-bg-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    overflow: hidden;
  }

  .card-accent-top::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent, var(--color-accent));
    border-radius: 2px 2px 0 0;
  }
}
```

- [ ] **Step 3: Remove feature-specific CSS from app.css (lines 172-611)**

Remove all Email Security, HTTP/3 Test, Cookie Audit, and AI Analysis CSS blocks (lines 172-611). These will be moved into `styles.css` in a later chunk.

- [ ] **Step 4: Verify app.css builds correctly**

```bash
npx tailwindcss --input src/client/app.css --output /dev/null 2>&1 | head -5
```

- [ ] **Step 5: Commit**

```bash
git add src/client/app.css
git commit -m "feat: rewrite base styles and utilities — flat cards, mono typography, remove Geist/grain/glass"
```

### Task 2.2: Clean body styles in styles.css

**Files:**
- Modify: `public/css/styles.css` (lines 1-66)

- [ ] **Step 1: Replace the body styles in styles.css**

Remove the body background-image radial gradients and Geist font references. Replace lines 48-66:

```css
html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--text-secondary);
  background: var(--surface-primary);
  min-height: 100vh;
}
```

- [ ] **Step 2: Verify the change took effect**

```bash
grep -c 'Geist' public/css/styles.css || echo "OK: no Geist references remain in styles.css"
```

- [ ] **Step 3: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: remove Geist font and body gradients from styles.css"
```

---

## Chunk 3: Layout & Navigation CSS

### Task 3.1: Rewrite nav/sidebar CSS in styles.css

**Files:**
- Modify: `public/css/styles.css` (lines 68-315, the nav/sidebar section)

- [ ] **Step 1: Replace nav sidebar CSS (lines 68-315)**

Replace the entire nav/sidebar styles with:

```css
/* Burger button (hidden on desktop) */
.nav-burger {
  display: none;
  position: fixed;
  top: 10px;
  left: 12px;
  z-index: 200;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--duration-150);
}

.nav-burger:hover {
  color: var(--accent);
}

.nav-burger-icon {
  width: 20px;
  height: 20px;
}

/* Overlay */
.nav-overlay {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 90;
  background: rgba(10, 10, 10, 0.8);
  opacity: 0;
  transition: opacity var(--duration-200) var(--ease-out);
  pointer-events: none;
}

body.nav-open .nav-overlay {
  opacity: 1;
  pointer-events: auto;
}

/* Sidebar Nav */
.nav {
  position: fixed;
  top: var(--header-height);
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: var(--surface-secondary);
  border-right: 1px solid var(--border-default);
  overflow: visible;
}

.nav-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px 0;
  gap: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
}

/* Category headers */
.nav-category-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 12px 16px 4px;
}

/* Nav link */
.nav-link {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 6px 14px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  text-decoration: none;
  border-left: 2px solid transparent;
  transition: color var(--duration-150), border-color var(--duration-150), background-color var(--duration-150);
}

.nav-link:hover {
  color: var(--accent);
  background: rgba(200, 255, 0, 0.03);
}

.nav-link.active {
  color: var(--text-primary);
  border-left-color: var(--accent);
  background: rgba(200, 255, 0, 0.05);
}

.nav-link-icon {
  display: none;
}

.nav-link-text {
  display: block;
}

/* Toolbar (moved to .nav-header in a later step) */
/* Bottom toolbar hidden — tools move to top header */
```

- [ ] **Step 2: Verify nav CSS is complete**

```bash
grep -c '\.nav-link' public/css/styles.css
```

- [ ] **Step 3: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite sidebar nav CSS — mono labels, lime active indicator, flat surface"
```

### Task 3.2: Add top header CSS to styles.css

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add top header styles immediately after the nav sidebar section**

Insert after the sidebar CSS (after the last `.nav-link-text` rule):

```css
/* Top Header */
.nav-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--header-height);
  z-index: 110;
  display: flex;
  align-items: center;
  padding: 0 24px;
  background: var(--surface-primary);
  border-bottom: 1px solid var(--border-default);
}

.nav-header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.nav-header-logo {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-header-logo svg {
  width: 14px;
  height: 14px;
  color: var(--surface-primary);
}

.nav-header-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 800;
  color: var(--accent);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

/* Toolbar group */
.nav-header-tools {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-left: auto;
}

.nav-header-btn {
  background: none;
  border: none;
  padding: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-150);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.nav-header-btn:hover {
  color: var(--accent);
}

.nav-header-btn.active {
  color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add top header CSS — logo, title, toolbar group"
```

### Task 3.3: Adjust main content area positioning

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Update .main element styles**

Find the `.main` rule in styles.css and update to account for the new top header and 180px sidebar:

```css
.main {
  margin-left: var(--sidebar-width);
  margin-top: var(--header-height);
  padding: 24px;
  min-height: calc(100vh - var(--header-height));
}
```

- [ ] **Step 2: Update section styles**

```css
.section {
  display: none;
}

.section.active {
  display: block;
}

.section-header {
  margin-bottom: 24px;
}

.section-header .display,
.section-header .text-hero {
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
}

.section-header .subtitle {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-top: 8px;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: update main content positioning and section styles for new layout"
```

---

## Chunk 4: Component CSS — Cards, Badges, Progress, Score Rings, Buttons, Forms

### Task 4.1: Rewrite card component CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace all existing card styles with new flat card CSS**

Replace all `.card`, `.card-header`, `.card-icon`, `.card-title`, `.card-body`, `.card-wide`, `.cards-grid` rules with:

```css
/* Cards */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--gap-md);
}

.cards-grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

.cards-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.cards-grid-4 {
  grid-template-columns: repeat(4, 1fr);
}

.card {
  position: relative;
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition: border-color var(--duration-150);
}

.card:hover {
  border-color: var(--border-hover);
}

.card-accent-lime { border-top: 2px solid var(--accent-lime); }
.card-accent-cyan { border-top: 2px solid var(--accent-cyan); }
.card-accent-orange { border-top: 2px solid var(--accent-orange); }
.card-accent-rose { border-top: 2px solid var(--accent-rose); }
.card-accent-purple { border-top: 2px solid var(--accent-purple); }
.card-accent-green { border-top: 2px solid var(--accent-green); }
.card-accent-amber { border-top: 2px solid var(--accent-amber); }

.card-wide {
  grid-column: 1 / -1;
}

.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--card-p) var(--card-p) 0;
}

.card-icon {
  display: none;
}

.card-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

.card-body {
  padding: var(--card-p);
}

.card-grade {
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: 800;
  color: var(--accent);
  margin-left: auto;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite card CSS — flat surfaces, accent top borders, mono labels, no icons"
```

### Task 4.2: Rewrite badge/tag CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace all .status-badge and pill/tag styles**

```css
/* Status badges — pill style */
.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-default);
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: border-color var(--duration-150), color var(--duration-150);
}

.status-badge.pass,
.status-badge.done {
  border-color: var(--status-pass);
  color: var(--status-pass);
}

.status-badge.warn {
  border-color: var(--status-warn);
  color: var(--status-warn);
}

.status-badge.fail,
.status-badge.error {
  border-color: var(--status-fail);
  color: var(--status-fail);
}

.status-badge.detecting {
  border-color: var(--border-default);
  color: var(--text-muted);
  animation: pulse-muted 2s ease-in-out infinite;
}

.status-badge.info {
  border-color: var(--border-default);
  color: var(--text-secondary);
}

@keyframes pulse-muted {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite badge CSS — outlined pills, mono font, colored borders"
```

### Task 4.3: Rewrite progress bar CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace progress bar styles**

```css
/* Progress Bars */
.progress-bar {
  width: 100%;
  height: 3px;
  background: var(--border-default);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.progress-label {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width var(--duration-300) var(--ease-out);
}

.progress-fill.pass { background: var(--status-pass); }
.progress-fill.warn { background: var(--status-warn); }
.progress-fill.fail { background: var(--status-fail); }
.progress-fill.dns { background: var(--accent-lime); }
.progress-fill.tls { background: var(--accent-cyan); }
.progress-fill.speed { background: var(--accent-orange); }
.progress-fill.privacy { background: var(--accent-rose); }
.progress-fill.email { background: var(--accent-purple); }
.progress-fill.network { background: var(--accent-green); }
.progress-fill.security { background: var(--accent-amber); }

.progress-fill.indeterminate {
  width: 30% !important;
  animation: progress-indeterminate 1.5s ease-in-out infinite;
}

@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite progress bar CSS — 3px flat bars, category accent fills"
```

### Task 4.4: Rewrite score ring CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace score ring styles**

```css
/* Score Ring */
.score-ring {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto;
}

.score-ring svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.score-ring-bg {
  fill: none;
  stroke: var(--border-default);
  stroke-width: 3;
}

.score-ring-fill {
  fill: none;
  stroke: var(--accent-lime);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.6s var(--ease-out);
}

.score-value {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.score-number {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
}

.score-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.score-meta {
  text-align: center;
  margin-top: var(--space-3);
}

.score-summary {
  font-family: var(--font-display);
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--text-primary);
}

.score-detail {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-top: 4px;
}

.score-card {
  text-align: center;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite score ring CSS — flat stroke, no gradient, display font center"
```

### Task 4.5: Rewrite button CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace button styles**

Find and replace all `.btn-primary`, `.btn-secondary`, `.btn-large`, `.btn-danger` rules:

```css
/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 20px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--duration-150) var(--ease-out);
  text-decoration: none;
  line-height: 1;
}

.btn-primary {
  background: var(--accent-lime);
  color: var(--surface-primary);
  border: none;
}

.btn-primary:hover {
  box-shadow: var(--shadow-glow-hover);
}

.btn-primary:active {
  transform: scale(0.97);
}

.btn-secondary {
  background: transparent;
  color: var(--text-secondary);
  border-color: var(--border-default);
}

.btn-secondary:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.btn-secondary:active {
  transform: scale(0.97);
}

.btn-danger {
  background: transparent;
  color: var(--status-fail);
  border-color: var(--border-default);
}

.btn-danger:hover {
  border-color: var(--status-fail);
}

.btn-large {
  padding: 12px 32px;
  font-size: var(--text-mono);
}

.btn-nav-action {
  background: none;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--duration-150);
}

.btn-nav-action:hover {
  color: var(--accent);
  border-color: var(--accent);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite button CSS — pill shapes, lime fill primary, outlined secondary"
```

### Task 4.6: Rewrite form/input CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace input/select/form styles**

```css
/* Inputs & Forms */
.input {
  padding: 8px 16px;
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
  transition: border-color var(--duration-150), box-shadow var(--duration-150);
  outline: none;
}

.input::placeholder {
  color: var(--text-muted);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}

.input-wide {
  flex: 1;
  min-width: 200px;
}

.select {
  appearance: none;
  cursor: pointer;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%234a4a4a' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.lookup-form {
  display: flex;
  gap: var(--gap-sm);
  flex-wrap: wrap;
}

.headers-input-wrap {
  display: flex;
  gap: var(--gap-sm);
}

.headers-url-input {
  flex: 1;
  padding: 8px 16px;
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
  outline: none;
}

.headers-url-input:focus {
  border-color: var(--accent);
}

/* Info rows (details display) */
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--surface-tertiary);
}

.info-row:last-child {
  border-bottom: none;
}

.info-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.info-value {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
}

.info-value.mono {
  font-size: var(--text-mono-sm);
}

.info-muted {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite form/input CSS — pill inputs, mono font, lime focus ring"
```

---

## Chunk 5: Feature-Specific CSS & Remaining Styles

### Task 5.1: Rewrite data table CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add table and result list styles**

```css
/* Data tables & result lists */
.result-list {
  display: flex;
  flex-direction: column;
}

.result-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-tertiary);
}

.result-row:last-child {
  border-bottom: none;
}

.result-row-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 120px;
}

.result-row-value {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
  margin-left: var(--space-3);
}

/* Check items (DNS results) */
.dns-check-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 0;
  border-bottom: 1px solid var(--surface-tertiary);
}

.dns-check-item:last-child {
  border-bottom: none;
}

.check-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.check-icon.pass { color: var(--status-pass); }
.check-icon.fail { color: var(--status-fail); }
.check-icon.warn { color: var(--status-warn); }

.check-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
}

.check-value {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
  margin-left: auto;
}

/* Code blocks */
.code-block {
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add data table and result list CSS — mono typography, subtle separators"
```

### Task 5.2: Rewrite speed test CSS

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add/rewrite speed test section styles**

```css
/* Speed Test */
.speed-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.speed-gauge-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--gap-sm);
}

.speed-gauge {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  text-align: center;
  transition: border-color var(--duration-150);
}

.speed-gauge.active {
  border-color: var(--accent);
}

.speed-gauge-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.speed-gauge-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  color: var(--text-primary);
}

.speed-gauge-unit {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  margin-top: 2px;
}

.speed-progress-bar {
  height: 3px;
  background: var(--border-default);
  border-radius: 3px;
  margin-top: var(--space-3);
  overflow: hidden;
}

.speed-progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width var(--duration-300) var(--ease-out);
}

.speed-progress-fill.download { background: var(--accent-cyan); }
.speed-progress-fill.upload { background: var(--accent-orange); }
.speed-progress-fill.latency { background: var(--accent-lime); }
.speed-progress-fill.jitter { background: var(--accent-amber); }
.speed-progress-fill.bufferbloat { background: var(--accent-rose); }

.speed-status-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
}

.speed-grade {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
}

.speed-grade-label {
  font-family: var(--font-display);
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--text-primary);
}

.speed-phase {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-top: 4px;
}

.speed-server-badge {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  margin-top: var(--space-3);
}

.server-badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.server-badge-icon {
  width: 16px;
  height: 16px;
  color: var(--accent);
}

.server-badge-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
}

.server-badge-value {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite speed test CSS — flat gauges, display font values, category colors"
```

### Task 5.3: Rewrite tab-specific CSS (TLS, Email, HTTP/3, Cookie, AI, History)

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add TLS tab styles**

```css
/* TLS Tab */
.tls-placeholder {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-8);
}

.tls-target-section {
  margin-top: var(--space-6);
}

.dash-section-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

- [ ] **Step 2: Add Email Security tab styles**

```css
/* Email Security */
.email-results {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.email-grade-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.email-grade-grade {
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: 800;
  color: var(--accent-purple);
}

.email-grade-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
}

.email-details {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--gap-sm);
}

.email-card {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.email-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.email-card-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.email-record-value {
  background: var(--surface-primary);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  word-break: break-all;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.email-record-detail {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.email-mechanisms {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-top: var(--space-2);
}

.email-mechanism-tag {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-full);
  padding: 2px 8px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
}

.email-recommendations-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

.email-loading,
.email-error,
.email-placeholder {
  padding: var(--space-8);
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}

.email-error p { margin-bottom: var(--space-4); }
```

- [ ] **Step 3: Add HTTP/3 Test tab styles**

```css
/* HTTP/3 Test */
.h3p-results {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.h3p-status-card {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  text-align: center;
}

.h3p-status-title {
  font-family: var(--font-display);
  font-size: var(--text-heading);
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.h3p-status-sub {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}

.h3p-bars {
  display: flex;
  gap: var(--space-4);
  justify-content: center;
  align-items: flex-end;
  padding: var(--space-6) 0;
}

.h3p-bar-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
}

.h3p-bar {
  width: 2rem;
  border-radius: var(--radius-sm);
  min-height: 4px;
}

.h3p-bar-h3 { background: var(--accent-lime); }
.h3p-bar-h2 { background: var(--accent-cyan); }
.h3p-bar-h1 { background: var(--accent-amber); }

.h3p-bar-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
}

.h3p-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--gap-sm);
}

.h3p-stat {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
}

.h3p-stat-label {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: var(--space-1);
}

.h3p-stat-value {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-body);
  color: var(--text-primary);
}

.h3p-loading,
.h3p-error,
.h3p-placeholder {
  padding: var(--space-8);
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}
```

- [ ] **Step 4: Add Cookie Audit tab styles**

```css
/* Cookie Audit */
.cookie-results {
  display: flex;
  flex-direction: column;
  gap: var(--gap-md);
}

.cookie-summary {
  display: flex;
  gap: var(--gap-md);
  flex-wrap: wrap;
}

.cookie-grade-card {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  min-width: 160px;
}

.cookie-grade-grade {
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: 800;
}

.cookie-grade-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
}

.cookie-summary-stats {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.cookie-stat {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  min-width: 140px;
}

.cookie-stat-label {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: var(--space-1);
}

.cookie-stat-value {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: var(--text-body);
  color: var(--text-primary);
}

.cookie-pie {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.cookie-pie-title {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-3);
}

.cookie-pie-chart {
  display: flex;
  height: 1.5rem;
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--space-2);
}

.cookie-pie-segment {
  height: 100%;
}

.cookie-pie-legend {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.cookie-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
}

.cookie-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.cookie-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
}

.cookie-table th {
  text-align: left;
  padding: 8px 12px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: var(--text-mono-xs);
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border-default);
}

.cookie-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--surface-tertiary);
}

.cookie-table-name {
  font-size: var(--text-mono-sm);
}

.cookie-note {
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
}

.cookie-recommendations {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.cookie-empty,
.cookie-loading,
.cookie-error,
.cookie-placeholder {
  padding: var(--space-8);
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}
```

- [ ] **Step 5: Add AI Analysis tab styles**

```css
/* AI Analysis */
.ai-readiness { margin: var(--space-4) 0; }

.ai-readiness-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-2) 0;
}

.ai-readiness-pill {
  border-radius: var(--radius-full);
  padding: 3px 10px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  font-weight: 500;
}

.ai-readiness-done {
  border: 1px solid var(--status-pass);
  color: var(--status-pass);
}

.ai-readiness-pending {
  border: 1px solid var(--border-default);
  color: var(--text-muted);
}

.ai-readiness-tip {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin: var(--space-1) 0 0;
}

.ai-summary-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  margin: var(--space-4) 0;
}

.ai-accordion {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.ai-result-text {
  padding: var(--space-3);
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  line-height: 1.6;
  color: var(--text-secondary);
}

.ai-result-text p { margin: 0 0 var(--space-3); }

.ai-result-text ul { margin: 0 0 var(--space-3) 1.25rem; }

.ai-result-text li { margin-bottom: var(--space-1); }

.ai-result-text strong { color: var(--text-primary); }

.ai-controls {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-default);
}
```

- [ ] **Step 6: Add History tab styles**

```css
/* History */
.history-actions {
  display: flex;
  gap: var(--gap-sm);
  margin-bottom: var(--space-4);
}

.section-inner {
  max-width: var(--container-max);
}

.section-title {
  font-family: var(--font-display);
  font-size: var(--text-display);
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}

.section-subtitle {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-top: var(--space-2);
}
```

- [ ] **Step 7: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite tab-specific CSS — TLS, Email, HTTP/3, Cookie, AI, History"
```

### Task 5.4: Add remaining feature CSS (AdBlock, Headers, Fingerprint, Quality, Network, Filters, Suggestions)

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Add Ad Block test, Headers, Fingerprint, Quality, Network, Filters, and Suggestions styles using the same flat/terminal/mono pattern**

```css
/* Ad Block Categories */
.test-categories {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--gap-sm);
}

.test-category-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3);
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color var(--duration-150);
}

.test-category-header:hover {
  border-color: var(--border-hover);
}

/* Headers Grade Display */
.headers-grade-display {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.headers-grade-meta {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}

.headers-grade-score {
  font-family: var(--font-display);
  font-size: var(--text-heading);
  font-weight: 700;
  color: var(--text-primary);
}

/* Fingerprint */
.fp-score-card {
  text-align: center;
  padding: var(--space-6);
}

/* Suggestion Cards */
.suggestions-section {
  margin-top: var(--space-10);
}

.suggestions-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-1);
}

.suggestions-subtitle {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  margin-bottom: var(--space-4);
}

.suggestions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--gap-sm);
}

/* Filter List Grid */
.filter-list-section {
  margin-top: var(--space-10);
}

.filter-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--gap-sm);
}

/* Speed Graph */
.speed-graph-card {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  margin-top: var(--space-4);
}

.speed-graph-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}

.speed-graph-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.speed-graph-legend {
  display: flex;
  gap: var(--space-3);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-dot.download { background: var(--accent-cyan); }
.legend-dot.upload { background: var(--accent-orange); }

#speed-graph {
  width: 100%;
  height: 200px;
}

/* Speed History */
.speed-history {
  margin-top: var(--space-6);
}

.speed-history-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: var(--space-2);
}

.speed-history-empty {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
  padding: var(--space-4);
}

.speed-history-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--gap-sm);
}

/* Network Map */
.network-map-placeholder {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  text-align: center;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-muted);
}

/* About cards */
.about-card {
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
}

.about-card .card-title {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

/* Skeleton loading */
.skeleton-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 0;
}

.skeleton {
  background: var(--border-default);
  border-radius: var(--radius-sm);
  animation: skeleton-shimmer 1.5s infinite;
}

.skeleton-circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
}

.skeleton-text {
  height: 10px;
}

.skeleton-value {
  width: 60px;
  height: 10px;
}

@keyframes skeleton-shimmer {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}

/* Nav toolbar panels (dropdown menus) */
.nav-toolbar-panel {
  position: fixed;
  z-index: 120;
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-1);
  min-width: 140px;
  display: none;
}

.nav-toolbar-panel.open {
  display: block;
}

.nav-toolbar-option {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background var(--duration-150), color var(--duration-150);
}

.nav-toolbar-option:hover {
  background: var(--surface-tertiary);
  color: var(--accent);
}

.share-panel-content {
  padding: var(--space-3);
}

.share-preview {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--text-secondary);
  white-space: pre-wrap;
  margin-bottom: var(--space-2);
}

/* Hidden utility */
.hidden {
  display: none !important;
}

/* Focus outline override */
.btn:focus-visible,
.nav-link:focus-visible,
.nav-header-btn:focus-visible,
.nav-toolbar-option:focus-visible,
.input:focus-visible,
.select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.skip-link {
  position: absolute;
  top: -100%;
  left: 16px;
  z-index: 200;
  padding: 8px 16px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  color: var(--surface-primary);
  background: var(--accent);
  border-radius: var(--radius-full);
  text-decoration: none;
  transition: top var(--duration-150);
}

.skip-link:focus {
  top: 8px;
}

/* Toolbar item (legacy) */
.nav-toolbar-item {
  position: relative;
}

.nav-toolbar-btn {
  background: none;
  border: none;
  padding: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-150);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.nav-toolbar-btn:hover {
  color: var(--accent);
}

.nav-toolbar-icon {
  display: none;
}

.nav-toolbar-badge {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
}

/* Raw toggle */
.raw-toggle {
  margin-top: var(--space-4);
}

.raw-toggle-summary {
  font-family: var(--font-mono);
  font-size: var(--text-mono-xs);
  color: var(--text-muted);
  cursor: pointer;
}

/* Grade factors */
.grade-factors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: add remaining feature CSS — AdBlock, Headers, Fingerprint, Quality, Network, Filters, skeletons"
```

---

## Chunk 6: Responsive, Print, Motion

### Task 6.1: Rewrite responsive breakpoints

**Files:**
- Modify: `public/css/styles.css`

- [ ] **Step 1: Replace all media query blocks with cohesive responsive rules**

Collect all remaining `@media` blocks in styles.css and replace with:

```css
/* ========================================
   Responsive
   ======================================== */

@media (min-width: 769px) {
  .nav-burger { display: none; }
  .nav-overlay { display: none; }
  .nav { display: flex; }
  body.nav-open .nav-burger,
  body.nav-open .nav-overlay { display: none; }
}

@media (max-width: 768px) {
  :root {
    --sidebar-width: 0px;
  }

  .nav-burger { display: flex; }
  .nav-overlay { display: block; }
  .nav-header { padding: 0 16px; }

  .nav {
    transform: translateX(-100%);
    width: 220px;
    transition: transform var(--duration-200) var(--ease-out);
  }

  body.nav-open .nav {
    transform: translateX(0);
  }

  .main {
    margin-left: 0;
    padding: 16px;
  }

  .section-header .display,
  .section-header .text-hero {
    font-size: 2rem;
  }

  .cards-grid,
  .cards-grid-2,
  .cards-grid-3,
  .cards-grid-4 {
    grid-template-columns: 1fr;
  }

  .speed-gauge-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .cookie-summary {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .main {
    padding: 12px;
  }

  .section-header .display,
  .section-header .text-hero {
    font-size: 1.5rem;
  }

  .speed-gauge-row {
    grid-template-columns: 1fr;
  }

  .nav-header-title {
    font-size: 9px;
  }

  .lookup-form {
    flex-direction: column;
  }

  .headers-input-wrap {
    flex-direction: column;
  }
}

/* ========================================
   Print Styles
   ======================================== */

@media print {
  *, *::before, *::after {
    background: #fff !important;
    color: #000 !important;
    box-shadow: none !important;
    border-color: #ccc !important;
  }

  .nav, .nav-header, .nav-burger, .nav-overlay,
  .btn, .status-badge, .score-ring svg {
    display: none !important;
  }

  .main {
    margin: 0 !important;
    padding: 0 !important;
  }

  .card {
    border: 1px solid #ccc !important;
    page-break-inside: avoid;
  }

  .card-accent-lime,
  .card-accent-cyan,
  .card-accent-orange,
  .card-accent-rose,
  .card-accent-purple,
  .card-accent-green,
  .card-accent-amber {
    border-top-color: #000 !important;
  }

  .section {
    display: block !important;
    margin-bottom: 16px;
  }
}

/* ========================================
   Reduced Motion
   ======================================== */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  .score-ring-fill {
    transition: none;
  }

  .btn-primary:hover {
    box-shadow: none;
  }

  .progress-fill {
    transition: none;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "feat: rewrite responsive breakpoints, print styles, and reduced motion"
```

---

## Chunk 7: HTML & TypeScript Updates

### Task 7.1: Update index.html font links and header markup

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Replace Geist font CDN with Inter + JetBrains Mono**

Replace line 69:
```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/geist@1/dist/geist-sans/style/css.min.css">
```
with:
```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:ital,wght@0,400..700;1,400..700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update CSP to allow Google Fonts**

Replace line 5 (the CSP meta tag) to add google font domains:
```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com; connect-src 'self' https://cloudflare-dns.com https://dns.google https://dns.quad9.net https://dns.adguard-dns.com https://dns.mullvad.net https://dns.nextdns.io https://unpkg.com https://api.pwnedpasswords.com; frame-src 'self'; base-uri 'self'; form-action 'self'">
```

- [ ] **Step 3: Add top header HTML before the sidebar nav**

Insert after `<body>` and the skip-link, before the nav-burger:

```html
  <header class="nav-header">
    <div class="nav-header-brand">
      <div class="nav-header-logo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <span class="nav-header-title">NetCheck</span>
    </div>
    <div class="nav-header-tools" id="nav-header-tools">
      <button class="nav-header-btn" id="lang-toggle-header">EN</button>
      <button class="nav-header-btn" id="theme-toggle-header">DARK</button>
      <button class="nav-header-btn" id="export-btn-header">Export</button>
      <button class="nav-header-btn" id="share-btn-header">Share</button>
    </div>
  </header>
```

- [ ] **Step 4: Remove the old nav-toolbar from the sidebar (lines 186-240 in index.html)**

Remove the entire `<div class="nav-toolbar">` block (lines ~186-240) from the sidebar since tools now live in the top header. Keep the nav-brand block but simplify it.

- [ ] **Step 5: Update nav-brand to show only title (no icon)**

Replace lines 84-90:
```html
      <div class="nav-brand">
        <svg class="nav-icon" ...><!-- old shield icon --></svg>
        <span class="nav-title">NetCheck</span>
      </div>
```
with a simpler version or just remove it (brand is now in top header):
```html
```

(Remove the nav-brand block entirely since the brand is now in the top header.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: update index.html — Inter+JetBrains Mono fonts, top header, remove sidebar toolbar"
```

### Task 7.2: Update theme.ts

**Files:**
- Modify: `src/client/theme.ts`

- [ ] **Step 1: Update theme toggle to reference the new header button**

Change the `apply` function to target `#theme-toggle-header` instead of `#theme-toggle`:

Replace:
```typescript
  const btn = document.getElementById('theme-toggle');
```
with:
```typescript
  const btn = document.getElementById('theme-toggle-header');
```

Replace the event listener `document.getElementById('theme-toggle')`:
```typescript
  document.getElementById('theme-toggle-header')?.addEventListener('click', () => {
```

- [ ] **Step 2: Also update the button text inside the SVG rendering**

Replace the SVG icon logic to show "LIGHT" / "DARK" text labels:
```typescript
function apply(animate = false): void {
  if (animate) enableThemeTransition();
  document.documentElement.setAttribute('data-theme', current);
  const btn = document.getElementById('theme-toggle-header');
  if (btn) {
    btn.textContent = current === 'dark' ? 'DARK' : 'LIGHT';
    btn.title = `Theme: ${current}`;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/client/theme.ts
git commit -m "feat: update theme toggle for new header button"
```

### Task 7.3: Update app.ts toolbar logic

**Files:**
- Modify: `src/client/app.ts`

- [ ] **Step 1: Add event listeners for new header toolbar buttons**

Add to the `DOMContentLoaded` handler (after the existing init calls):

```typescript
  // Header toolbar buttons
  document.getElementById('lang-toggle-header')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const menu = document.getElementById('lang-menu');
    const btn = e.currentTarget as HTMLElement;
    if (menu) {
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
      if (!wasOpen) {
        menu.classList.add('open');
        positionToolbarPanel(btn, menu);
      }
    }
  });

  document.getElementById('export-btn-header')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const btn = e.currentTarget as HTMLElement;
    const menu = document.getElementById('export-menu');
    if (menu) {
      const wasOpen = menu.classList.contains('open');
      document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
      if (!wasOpen) {
        menu.classList.add('open');
        positionToolbarPanel(btn, menu);
      }
    }
  });

  const shareBtn = document.getElementById('share-btn-header') as HTMLElement;
  if (shareBtn) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const shareMenu = document.getElementById('share-menu');
      const sharePreview = document.getElementById('share-preview');
      const shareCopyBtn = document.getElementById('share-copy-btn');
      if (shareMenu && sharePreview && shareCopyBtn) {
        const wasOpen = shareMenu.classList.contains('open');
        document.querySelectorAll('.nav-toolbar-panel').forEach((p) => p.classList.remove('open'));
        if (!wasOpen) {
          sharePreview.textContent = buildSummary();
          shareMenu.classList.add('open');
          positionToolbarPanel(shareBtn, shareMenu);
        }
      }
    });
  }
```

- [ ] **Step 2: Keep existing export and share panel logic (for backward compatibility)**

Keep the existing export-btn/share-btn listeners in initTabs() but also add the header button handlers. The duplicate logic handles both old and new buttons.

- [ ] **Step 3: Remove the old toolbar init that references removed DOM elements**

Remove or guard any references to `#theme-toggle` (old ID) and `#lang-toggle` (old ID) since those elements no longer exist:

```typescript
  // Remove references to deleted elements
  // The old #theme-toggle, #lang-toggle, #export-btn in the sidebar toolbar
  // are replaced by header equivalents
```

Actually, keep the old references (they'll just fail silently if elements don't exist) but add null guards:

- [ ] **Step 4: Adjust positionToolbarPanel sidebar width reference**

Change the `sidebarW` calculation from `220` to `180`:
```typescript
  const sidebarW = vpW >= 769 ? 180 : (vpW >= 641 ? 180 : 0);
```

- [ ] **Step 5: Commit**

```bash
git add src/client/app.ts
git commit -m "feat: add header toolbar event handlers, adjust sidebar width to 180px"
```

### Task 7.4: Update component files

**Files:**
- Modify: `src/client/components/badge.ts`
- Modify: `src/client/components/card.ts`
- Modify: `src/client/components/progress.ts`
- Modify: `src/client/ui-utils.ts`

- [ ] **Step 1: Update badge.ts class names**

No functional changes needed — the `status-badge ${status}` class pattern still applies since we rewrote the CSS with the same selectors.

- [ ] **Step 2: Update card.ts to use flat card classes**

Replace:
```typescript
    el.className = 'result-card';
```
with:
```typescript
    el.className = 'card card-accent-lime';
```

Replace `card-title` with just `card-title` (unchanged, CSS handles it).

- [ ] **Step 3: Update progress.ts for new progress bar**

No functional changes needed — `.progress-bar`, `.progress-fill` selectors remain the same. The CSS handles the 3px height and solid fills.

- [ ] **Step 4: Update ui-utils.ts pulseValue**

Replace:
```typescript
export function pulseValue(el: HTMLElement): void {
  el.classList.add('updating');
  setTimeout(() => el.classList.remove('updating'), 150);
}
```
with:
```typescript
export function pulseValue(el: HTMLElement): void {
  // No-op in the new theme — values change without flash animation
}
```

- [ ] **Step 5: Commit**

```bash
git add src/client/components/badge.ts src/client/components/card.ts src/client/components/progress.ts src/client/ui-utils.ts
git commit -m "feat: update component TS — flat card classes, remove pulse animation"
```

---

## Chunk 8: Verification & Cleanup

### Task 8.1: Build and lint

**Files:**
- None (verification only)

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: No errors. If errors appear, fix them.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds without errors. The Vite build should produce the bundle.

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: Tests pass (no functional changes were made).

- [ ] **Step 4: Check for any remaining Geist references**

```bash
grep -rni 'geist' public/css/ src/client/app.css src/client/theme.ts index.html || echo "OK: no Geist references remain"
```

- [ ] **Step 5: Check for any remaining violet references (#7c5cfc)**

```bash
rg '#7c5cfc' public/ src/ || echo "OK: no violet brand color remains"
```

- [ ] **Step 6: Verify the complete CSS is syntactically valid**

```bash
npx tailwindcss --input src/client/app.css --output /dev/null 2>&1 | tail -3
```

Expected: No errors.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete Global Radio theme redesign — verify build, lint, and tests pass"
```

---

## Verification Summary

After completing all chunks, verify:

1. `npm run lint` passes with no errors
2. `npm run build` succeeds
3. `npm test` passes
4. No Geist font references remain in the codebase
5. No violet (#7c5cfc) brand color remains
6. Visual check: Open the dev server and verify each tab:
   - Dashboard: lime hero, flat cards, pill badges
   - DNS: card accent top borders, mono labels
   - Speed: flat gauges, display font values
   - TLS: mono typography
   - Email Security: purple accent, pill tags
   - HTTP/3: color-coded bars
   - Cookie Audit: mono data table
   - AI Analysis: pill readiness indicators
   - History: flat card layout
   - Fingerprint: score ring with flat stroke
   - Headers: grade display
   - Quality: score card
   - Network: map placeholder
7. Toggle dark/light theme — verify light theme works
8. Check responsive layout at 768px and 480px
9. Test reduced-motion preference
10. Check print preview
