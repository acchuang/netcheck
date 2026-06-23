# NetCheck Frontend Rebuild Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the NetCheck frontend UI/UX with a new Editorial Report design system, consolidating 17 tabs into 6 workflows, while keeping the Cloudflare Worker backend, observable state layer, test engines, and i18n system unchanged.

**Architecture:** Vanilla TypeScript + Vite (no framework). Dual CSS system (Tailwind v4 + hand-written CSS tokens). Hash-based routing for 6 workflows. Observable state layer (`src/client/state/`) reused as-is — only the render layer is rewritten. 20 phased approach, each phase ≤5 files with verification gates.

**Tech Stack:** Vite 8, TypeScript 5.8, Tailwind CSS v4, Vitest 4, Playwright 1.59, ESLint 10, Prettier 3, Cloudflare Workers (backend unchanged)

**Spec:** `docs/superpowers/specs/2026-06-23-netcheck-frontend-rebuild-design.md`

**Design decisions (from visual companion mockups):**
- Personality: Editorial Report (warm off-white, serif headings, muted greens)
- Navigation: Top Tab Bar (horizontal tabs, bottom bar on mobile)
- Overview: Hero + Grid (score/IP side by side, 2×4 status card grid)
- DNS: Pill sub-tabs (6 pills, IP card pinned above)
- Speed & Performance: Speed as hero + collapsible sections
- Security Scan: Self + Target split (auto-detected self on top, target with pills below)
- Privacy & Blocking: Pill sub-tabs (5 pills, consistent with DNS)

**Verification commands (run after EVERY phase):**
- Type-check: `npx tsc --noEmit`
- Lint: `npx eslint src/`
- Build: `npm run build`
- Unit tests: `npx vitest run` (where applicable)

**Git workflow:** One commit per phase. Tag each phase: `git tag phase-Na` etc. Feature branch: `frontend-rebuild`.

---

## Chunk 1: Cleanup + Design System (Phases 0a–1)

### Task 0a: Delete PWA Artifacts

**Files:**
- Delete: `public/manifest.json`
- Delete: `public/sw.js`
- Delete: `public/offline.html`
- Delete: `src/client/install-prompt.ts`

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b frontend-rebuild
```

- [ ] **Step 2: Delete PWA files**

```bash
rm public/manifest.json public/sw.js public/offline.html src/client/install-prompt.ts
```

- [ ] **Step 3: Verify no dangling imports**

Run: `npx tsc --noEmit`
Expected: Errors about `install-prompt` import in `app.ts` — this is expected, fixed in Task 0b.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove PWA artifacts (manifest, sw.js, offline.html, install-prompt)"
git tag phase-0a
```

### Task 0b: Remove PWA References

**Files:**
- Modify: `src/client/app.ts` — remove `initInstallPrompt` import and call
- Modify: `index.html` — remove `<link rel="manifest">` line

- [ ] **Step 1: Remove install-prompt import from app.ts**

In `src/client/app.ts`, remove the line:
```ts
import { initInstallPrompt } from './install-prompt';
```
And remove the `safeInit` call for install prompt:
```ts
safeInit('Install Prompt', initInstallPrompt);
```

- [ ] **Step 2: Remove manifest link from index.html**

In `index.html`, remove:
```html
<link rel="manifest" href="/public/manifest.json">
```

- [ ] **Step 3: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 4: Verify lint passes**

Run: `npx eslint src/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/app.ts index.html
git commit -m "chore: remove PWA references from app.ts and index.html"
git tag phase-0b
```

### Task 1: Rebuild Design Tokens

**Files:**
- Modify: `public/css/tokens.css` — new Editorial Report color palette, typography, spacing
- Modify: `public/css/styles.css` — new component styles for Editorial Report
- Modify: `public/css/utilities.css` — utility classes for new design
- Modify: `src/client/app.css` — Tailwind v4 imports + custom layer

- [ ] **Step 1: Rewrite tokens.css with Editorial Report palette**

Replace `public/css/tokens.css` with the new Editorial Report design tokens. Key changes:
- Light mode: warm off-white `#F5F5F0` primary, `#FFFFFF` cards, `#EBEBE3` tertiary
- Dark mode: deep charcoal `#1A1A10` primary, `#0D0D0D` cards, `#333322` tertiary
- Accent: muted green `#3B6B00` (light) / `#7BC02F` (dark)
- Status: pass `#228B22`, warn `#946B00`, fail `#CC1F3D`, neutral `#666655`
- Typography: `--font-display: Georgia, 'Tiempos', 'Fraunces', serif`; `--font-body: 'Inter', system-ui, sans-serif`; `--font-mono: 'JetBrains Mono', monospace`
- Type scale: hero 3.5rem, display 2.5rem, heading 1.5rem (serif), body 0.875rem, mono 0.75rem
- Spacing: retain existing scale (4–48px)
- Radius: 6px sm, 8px md, 12px lg, 16px xl, 9999px full (for pills)
- Shadows: subtle for editorial — `0 1px 2px rgba(0,0,0,0.08)` light, `0 1px 2px rgba(0,0,0,0.4)` dark

```css
/* Editorial Report Design Tokens */

/* ── Raw color palette ── */
:root {
  --warm-0: #FFFFFF;
  --warm-50: #F5F5F0;
  --warm-100: #EBEBE3;
  --warm-200: #CCCCBB;
  --warm-300: #AAAA99;
  --warm-400: #888877;
  --warm-500: #666655;
  --warm-600: #444433;
  --warm-700: #333322;
  --warm-800: #1A1A10;
  --warm-850: #111111;
  --warm-900: #0D0D0D;
  --warm-950: #0A0A0A;
}

/* ── Accent colors ── */
:root {
  --accent-green: #3B6B00;
  --accent-green-light: #5A8A00;
  --accent-amber: #946B00;
  --accent-rose: #CC1F3D;
  --accent-cyan: #007699;
  --accent-purple: #782BC9;
  --accent-orange: #B35700;

  --status-pass: #228B22;
  --status-warn: #946B00;
  --status-fail: #CC1F3D;
  --status-neutral: #666655;
}

/* ── Typography ── */
:root {
  --font-display: Georgia, 'Tiempos Text', 'Fraunces', serif;
  --font-body: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;

  --text-hero: 3.5rem;
  --text-display: 2.5rem;
  --text-heading: 1.5rem;
  --text-body: 0.875rem;
  --text-mono: 0.75rem;
  --text-mono-sm: 0.625rem;
}

/* ── Spacing (retained) ── */
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

/* ── Radius ── */
:root {
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 9999px;
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
  --header-height: 48px;
  --card-p: var(--space-5);
}

/* ── Semantic Tokens — Light Theme (default) ── */
[data-theme="light"] {
  --surface-primary: var(--warm-50);
  --surface-secondary: var(--warm-0);
  --surface-tertiary: var(--warm-100);
  --surface-elevated: #F0F0EB;

  --text-primary: var(--warm-800);
  --text-secondary: var(--warm-600);
  --text-muted: var(--warm-500);

  --border-default: var(--warm-200);
  --border-subtle: var(--warm-100);
  --border-accent: var(--accent-green);

  --accent: var(--accent-green);
  --accent-glow: rgba(59, 107, 0, 0.08);

  /* Status */
  --status-pass: #228B22;
  --status-warn: #946B00;
  --status-fail: #CC1F3D;
  --status-neutral: #666655;

  /* Grade scale */
  --grade-a-plus: #228B22;
  --grade-a: #2D9D2D;
  --grade-b: #946B00;
  --grade-c: #B35700;
  --grade-d: #CC1F3D;
  --grade-f: #B91C1C;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

  color-scheme: light;
}

/* ── Semantic Tokens — Dark Theme ── */
[data-theme="dark"] {
  --surface-primary: var(--warm-950);
  --surface-secondary: var(--warm-900);
  --surface-tertiary: #0f0f0f;
  --surface-elevated: var(--warm-850);

  --text-primary: #E3E3D3;
  --text-secondary: #B0B0A0;
  --text-muted: #888877;

  --border-default: #1a1a1a;
  --border-subtle: #1a1a1a;
  --border-accent: #7BC02F;

  --accent: #7BC02F;
  --accent-glow: rgba(123, 192, 47, 0.12);

  /* Status */
  --status-pass: #7BC02F;
  --status-warn: #FFB800;
  --status-fail: #FF4D6A;
  --status-neutral: #888877;

  /* Grade scale */
  --grade-a-plus: #22c55e;
  --grade-a: #4ade80;
  --grade-b: #f59e0b;
  --grade-c: #f97316;
  --grade-d: #ef4444;
  --grade-f: #dc2626;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.6);

  color-scheme: dark;
}

/* Legacy aliases (used in inline styles during migration) */
:root {
  --brand: var(--accent);
  --brand-glow: var(--accent-glow);
  --text-tertiary: var(--text-muted);
  --green: var(--status-pass);
  --red: var(--status-fail);
  --amber: var(--status-warn);
  --emerald: var(--status-pass);
  --error: var(--status-fail);
  --border: var(--border-default);
  --surface-card: var(--surface-secondary);
  --surface-hover: var(--surface-elevated);
}
```

- [ ] **Step 2: Rewrite styles.css with Editorial Report component styles**

Replace `public/css/styles.css` with new component styles matching the mockups. Key components:
- `.nav-header` — white background, serif brand, horizontal tabs with 2px accent bottom border
- `.tab-bar` — flex row of workflow tabs, active state with serif + accent border
- `.tab-bar-mobile` — bottom fixed bar for mobile (hidden on desktop)
- `.section` — workflow container, max-width 1200px, padded
- `.section-header` — serif display heading + muted subtitle
- `.card` — white bg, subtle border, 8px radius, 16-20px padding
- `.card-hero` — larger padding, accent left border
- `.pill-nav` — flex row of rounded pills, active = accent bg + warm text
- `.stat-strip` — flex row of label-value pairs
- `.score-display` — serif large number + muted /100
- `.collapsible-section` — dot + serif heading + ▾ toggle, expandable body
- `.lookup-form` — input + button row
- `.data-table` — native table with border styling
- `.suggestions-grid` — card grid for recommendations
- `.grade-display` — serif letter grade with color
- Skeleton/empty/error states

This file will be large (~2000+ lines). Write it in the editorial style matching the mockups. Use the tokens from tokens.css — no hardcoded colors.

- [ ] **Step 3: Update utilities.css**

Replace `public/css/utilities.css` with utility classes for the new system:
- `.hidden` — display:none
- `.mono` — font-family: var(--font-mono)
- `.serif` — font-family: var(--font-display)
- `.muted` — color: var(--text-muted)
- `.text-center`, `.text-right` — text alignment
- `.flex`, `.flex-col`, `.gap-2`, `.gap-4` — flexbox helpers
- `.grid-2`, `.grid-3`, `.grid-4` — grid helpers
- `.mt-4`, `.mt-8`, `.mb-4`, `.mb-8` — spacing helpers
- `.border-t`, `.border-b` — border helpers
- `.italic` — font-style: italic
- `.uppercase` — text-transform + letter-spacing

- [ ] **Step 4: Update app.css (Tailwind v4 entry)**

Update `src/client/app.css` to import Tailwind v4 and define the custom layer:
```css
@import 'tailwindcss';

@layer base {
  body {
    font-family: var(--font-body);
    background-color: var(--surface-primary);
    color: var(--text-primary);
    margin: 0;
  }
}
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: PASS (build succeeds, CSS compiles)

- [ ] **Step 6: Visual review**

Run: `npm run dev` and open localhost — the existing 17-tab UI will look broken (expected — HTML still references old structure), but tokens and base styles should be visible. Check that colors/fonts load correctly.

- [ ] **Step 7: Commit**

```bash
git add public/css/ src/client/app.css
git commit -m "feat: rebuild design system — Editorial Report tokens, styles, utilities"
git tag phase-1
```

---

## Chunk 2: HTML Shell + Routing (Phases 2–3)

### Task 2: Rebuild HTML Shell

**Files:**
- Modify: `index.html` — new 6-workflow nav structure, top tab bar, section containers

- [ ] **Step 1: Rewrite index.html with 6-workflow structure**

Replace the 17-tab nav with 6 workflow tabs. Key structural changes:
- Header: brand + toolbar (lang, theme, export, share) + top tab bar
- 6 `<section>` elements with IDs: `overview`, `dns`, `speed`, `security`, `privacy`, `ai`
- Each section has `.section-header` (serif h1 + subtitle) and `.section-body` (populated by JS)
- Bottom tab bar for mobile (icons + labels)
- Remove all old nav-category/nav-link/nav-category-links blocks
- Remove all old section HTML (dashboard, dns, adblock, headers, tls, etc.)
- Keep: CSP meta, SEO meta, fonts, `<link>` for CSS, skip link, favicon, theme script
- Remove: manifest link (already done in Task 0b), PWA-related meta
- Update: `<title>`, meta description to reflect new structure

HTML structure:
```html
<header class="nav-header">
  <div class="nav-header-brand">
    <div class="nav-header-logo"><!-- globe SVG --></div>
    <span class="nav-header-title">NetCheck</span>
  </div>
  <div class="nav-header-tools">
    <button id="lang-toggle-header" class="nav-header-btn">EN</button>
    <button id="theme-toggle-header" class="nav-header-btn">LIGHT</button>
    <button id="export-btn-header" class="nav-header-btn">Export</button>
    <button id="share-btn-header" class="nav-header-btn">Share</button>
  </div>
</header>
<nav class="tab-bar" role="tablist">
  <a href="#overview" class="tab-link active" data-tab="overview" role="tab">Overview</a>
  <a href="#dns" class="tab-link" data-tab="dns" role="tab">DNS</a>
  <a href="#speed" class="tab-link" data-tab="speed" role="tab">Speed</a>
  <a href="#security" class="tab-link" data-tab="security" role="tab">Security</a>
  <a href="#privacy" class="tab-link" data-tab="privacy" role="tab">Privacy</a>
  <a href="#ai" class="tab-link" data-tab="ai" role="tab">AI</a>
</nav>
<nav class="tab-bar-mobile" role="tablist"><!-- 6 items with icons --></nav>
<main id="main" class="main">
  <section id="overview" class="section active" role="region" tabindex="-1" aria-label="Overview">
    <div class="section-header"><h1 class="display" id="overview-title">Network Overview</h1><p class="subtitle" id="overview-subtitle">Your network status at a glance</p></div>
    <div id="overview-content" class="section-body"></div>
  </section>
  <section id="dns" class="section" role="region" tabindex="-1" aria-label="DNS">
    <div class="section-header"><h1 class="display" id="dns-title">DNS & Network</h1><p class="subtitle" id="dns-subtitle">Detect your IP, DNS resolvers, and security configuration</p></div>
    <div id="dns-content" class="section-body"></div>
  </section>
  <section id="speed" class="section" role="region" tabindex="-1" aria-label="Speed & Performance">
    <div class="section-header"><h1 class="display" id="speed-title">Speed & Performance</h1><p class="subtitle" id="speed-subtitle">Measure bandwidth, quality, latency, and history</p></div>
    <div id="speed-content" class="section-body"></div>
  </section>
  <section id="security" class="section" role="region" tabindex="-1" aria-label="Security Scan">
    <div class="section-header"><h1 class="display" id="security-title">Security Scan</h1><p class="subtitle" id="security-subtitle">Scan any website's security posture</p></div>
    <div id="security-content" class="section-body"></div>
  </section>
  <section id="privacy" class="section" role="region" tabindex="-1" aria-label="Privacy & Blocking">
    <div class="section-header"><h1 class="display" id="privacy-title">Privacy & Blocking</h1><p class="subtitle" id="privacy-subtitle">Test ad blocking, fingerprint uniqueness, and data exposure</p></div>
    <div id="privacy-content" class="section-body"></div>
  </section>
  <section id="ai" class="section" role="region" tabindex="-1" aria-label="AI Analysis">
    <div class="section-header"><h1 class="display" id="ai-title">AI Analysis</h1><p class="subtitle" id="ai-subtitle">AI-powered insights into your network health</p></div>
    <div id="ai-content" class="section-body"></div>
  </section>
</main>
<!-- Dropdown panels (lang, export, share) — retained from current structure -->
```

Keep the dropdown panels (`#lang-menu`, `#export-menu`, `#share-menu`) with their existing IDs.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: rebuild HTML shell — 6 workflow tabs, top tab bar, section containers"
git tag phase-2
```

### Task 3: Rebuild Routing (app.ts)

**Files:**
- Modify: `src/client/app.ts` — new 6-workflow router with legacy redirect map

- [ ] **Step 1: Write the legacy redirect map**

In `src/client/app.ts`, define the redirect map for old hash routes:
```ts
const LEGACY_REDIRECTS: Record<string, string> = {
  'dashboard': 'overview',
  'about': 'overview',
  'dns': 'dns',
  'speed': 'speed',
  'adblock': 'privacy',
  'fingerprint': 'privacy',
  'cookies': 'privacy',
  'breach': 'privacy',
  'headers': 'security',
  'tls': 'security',
  'http3': 'security',
  'cert-transparency': 'security',
  'email-security': 'security',
  'quality': 'speed',
  'network': 'speed',
  'history': 'speed',
  'ai-analysis': 'ai',
};
```

- [ ] **Step 2: Rewrite initTabs() for 6-workflow routing**

Replace the old `initTabs()` function with a new router that:
- Reads `location.hash` to determine active workflow
- Applies `LEGACY_REDIRECTS` for old hashes
- Updates `.tab-link` active states (both desktop `.tab-bar` and mobile `.tab-bar-mobile`)
- Shows/hides `<section>` elements via `.active` class
- Calls `updateMetaForTab(tab)` with new workflow names
- Lazy-loads workflow content via dynamic `import()` — only the active workflow's module is loaded
- Supports keyboard nav: number keys 1-6 jump to workflows (remap from current 1-8)

```ts
const WORKFLOW_NAMES: Record<string, string> = {
  overview: 'Overview',
  dns: 'DNS',
  speed: 'Speed & Performance',
  security: 'Security Scan',
  privacy: 'Privacy & Blocking',
  ai: 'AI Analysis',
};

function initRouter(): void {
  const hash = location.hash.slice(1) || 'overview';
  const tab = LEGACY_REDIRECTS[hash] || hash;
  navigateTo(tab);
}

function navigateTo(tab: string): void {
  // Update active states
  document.querySelectorAll('.tab-link, .tab-bar-mobile-item').forEach((l) => {
    l.classList.remove('active');
    l.removeAttribute('aria-current');
  });
  document.querySelector(`.tab-link[data-tab="${tab}"]`)?.classList.add('active');
  document.querySelector(`.tab-bar-mobile-item[data-tab="${tab}"]`)?.classList.add('active');

  // Show/hide sections
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  document.getElementById(tab)?.classList.add('active');

  // Update meta
  updateMetaForTab(tab);

  // Lazy-load workflow module
  loadWorkflow(tab);

  // Update hash
  if (location.hash.slice(1) !== tab) {
    history.replaceState(null, '', `#${tab}`);
  }
}

const loadedWorkflows = new Set<string>();
async function loadWorkflow(tab: string): Promise<void> {
  if (loadedWorkflows.has(tab)) return;
  loadedWorkflows.add(tab);
  try {
    switch (tab) {
      case 'overview': await import('./tabs/overview-tab'); break;
      case 'dns': await import('./tabs/dns-tab'); break;
      case 'speed': await import('./tabs/speed-performance-tab'); break;
      case 'security': await import('./tabs/security-scan-tab'); break;
      case 'privacy': await import('./tabs/privacy-blocking-tab'); break;
      case 'ai': await import('./tabs/ai-analysis-tab'); break;
    }
  } catch (e) {
    console.error(`Failed to load workflow ${tab}:`, e);
  }
}
```

- [ ] **Step 3: Update bootstrap() to call initRouter instead of initTabs**

Remove all old `safeInit` calls for the 17 old tab modules. Add `safeInit('Router', initRouter)`. Keep `safeInit` calls for: theme, i18n, tooltips, analytics, share, export. Remove the old per-tab init calls (dashboard-tab, tls-tab, history-tab, email-tab, http3-tab, cookie-tab, etc.) — those are now lazy-loaded.

- [ ] **Step 4: Remove old tab name map**

Remove the old `tabNames` object (lines 78-94 in current app.ts) and replace with `WORKFLOW_NAMES`.

- [ ] **Step 5: Write failing test for legacy redirect**

Create `src/client/__tests__/router.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('Legacy redirect map', () => {
  it('maps all 17 old tab names', () => {
    const oldTabs = ['dashboard', 'about', 'dns', 'speed', 'adblock', 'fingerprint',
      'cookies', 'breach', 'headers', 'tls', 'http3', 'cert-transparency',
      'email-security', 'quality', 'network', 'history', 'ai-analysis'];
    // Each must map to one of the 6 new workflows
    const newWorkflows = ['overview', 'dns', 'speed', 'security', 'privacy', 'ai'];
    oldTabs.forEach((old) => {
      const redirected = LEGACY_REDIRECTS[old];
      expect(redirected).toBeDefined();
      expect(newWorkflows).toContain(redirected);
    });
  });
});
```

Note: export `LEGACY_REDIRECTS` from app.ts for testing.

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/router.test.ts`
Expected: FAIL (LEGACY_REDIRECTS not exported yet)

- [ ] **Step 7: Export LEGACY_REDIRECTS and run test**

Add `export` to the `LEGACY_REDIRECTS` const. Run the test again.
Expected: PASS

- [ ] **Step 8: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Verify lint passes**

Run: `npx eslint src/`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/client/app.ts src/client/__tests__/router.test.ts
git commit -m "feat: rebuild router — 6-workflow navigation with legacy redirect map"
git tag phase-3
```

---

## Chunk 3: Component Primitives (Phases 4a–4b)

### Task 4a: Core Component Primitives

**Files:**
- Modify: `src/client/components/card.ts` — rebuild for Editorial Report
- Modify: `src/client/components/badge.ts` — rebuild for Editorial Report
- Modify: `src/client/components/progress.ts` — rebuild for Editorial Report
- Create: `src/client/components/workflow-nav.ts` — top tab bar component
- Create: `src/client/components/sub-nav.ts` — pill sub-tab component

- [ ] **Step 1: Write failing tests for card**

Update `src/client/__tests__/card.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderCard } from '../components/card';

describe('renderCard (Editorial)', () => {
  it('renders a card with title and body', () => {
    const el = renderCard({ title: 'DNS Security' });
    expect(el.classList.contains('card')).toBe(true);
    expect(el.querySelector('.card-title')?.textContent).toBe('DNS Security');
  });

  it('renders a hero card with accent border', () => {
    const el = renderCard({ title: 'Network Score', variant: 'hero' });
    expect(el.classList.contains('card-hero')).toBe(true);
  });

  it('renders a compact card', () => {
    const el = renderCard({ title: 'Info', variant: 'compact' });
    expect(el.classList.contains('card-compact')).toBe(true);
  });

  it('appends children to card body', () => {
    const child = document.createElement('p');
    child.textContent = 'test';
    const el = renderCard({ title: 'Test', children: [child] });
    expect(el.querySelector('.card-body p')?.textContent).toBe('test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/card.test.ts`
Expected: FAIL (no `variant` prop yet)

- [ ] **Step 3: Implement card.ts for Editorial Report**

```ts
export interface CardProps {
  title: string;
  variant?: 'default' | 'hero' | 'compact' | 'wide';
  accent?: 'green' | 'amber' | 'rose' | 'cyan' | 'purple' | 'orange';
  grade?: string;
  children?: HTMLElement[];
}

export function renderCard(props: CardProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'card';
  if (props.variant && props.variant !== 'default') {
    el.classList.add(`card-${props.variant}`);
  }
  if (props.accent) {
    el.classList.add(`card-accent-${props.accent}`);
  }

  const header = document.createElement('div');
  header.className = 'card-header';

  const title = document.createElement(props.variant === 'hero' ? 'h2' : 'h3');
  title.className = 'card-title';
  title.style.fontFamily = 'var(--font-display)';
  title.textContent = props.title;
  header.appendChild(title);

  if (props.grade) {
    const grade = document.createElement('span');
    grade.className = 'card-grade';
    grade.textContent = props.grade;
    header.appendChild(grade);
  }

  el.appendChild(header);

  if (props.children) {
    const body = document.createElement('div');
    body.className = 'card-body';
    for (const child of props.children) body.appendChild(child);
    el.appendChild(body);
  }

  return el;
}
```

- [ ] **Step 4: Run card test to verify it passes**

Run: `npx vitest run src/client/__tests__/card.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for badge**

Update `src/client/__tests__/badge.test.ts` to test new status types matching editorial palette. The existing tests should pass — badge interface is unchanged. Just verify styles compile.

- [ ] **Step 6: Update badge.ts for Editorial Report**

The interface stays the same (`BadgeProps` with `status`, `label`, `detail`). Update the CSS class names to match new styles.css. The function is mostly unchanged — it just creates a `.status-badge` div with the status class.

- [ ] **Step 7: Write failing test for progress**

The existing `progress.test.ts` tests should pass — the interface is unchanged. Just verify styles compile.

- [ ] **Step 8: Update progress.ts for Editorial Report**

Interface unchanged. Update class names if needed. The progress bar uses accent color via CSS.

- [ ] **Step 9: Write failing test for workflow-nav**

Create `src/client/__tests__/workflow-nav.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderWorkflowNav } from '../components/workflow-nav';

describe('renderWorkflowNav', () => {
  it('renders 6 workflow tabs', () => {
    const el = renderWorkflowNav();
    const links = el.querySelectorAll('.tab-link');
    expect(links.length).toBe(6);
  });

  it('marks overview as active by default', () => {
    const el = renderWorkflowNav('overview');
    const active = el.querySelector('.tab-link.active');
    expect(active?.getAttribute('data-tab')).toBe('overview');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/workflow-nav.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 11: Implement workflow-nav.ts**

```ts
const WORKFLOWS = [
  { id: 'overview', label: 'Overview' },
  { id: 'dns', label: 'DNS' },
  { id: 'speed', label: 'Speed' },
  { id: 'security', label: 'Security' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'ai', label: 'AI' },
] as const;

export function renderWorkflowNav(active: string = 'overview'): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'tab-bar';
  nav.setAttribute('role', 'tablist');

  for (const wf of WORKFLOWS) {
    const link = document.createElement('a');
    link.href = `#${wf.id}`;
    link.className = 'tab-link';
    link.setAttribute('data-tab', wf.id);
    link.setAttribute('role', 'tab');
    link.textContent = wf.label;
    if (wf.id === active) link.classList.add('active');
    nav.appendChild(link);
  }

  return nav;
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/workflow-nav.test.ts`
Expected: PASS

- [ ] **Step 13: Write failing test for sub-nav (pills)**

Create `src/client/__tests__/sub-nav.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderSubNav } from '../components/sub-nav';

describe('renderSubNav', () => {
  it('renders pill buttons for sections', () => {
    const sections = [
      { id: 'resolvers', label: 'Resolvers' },
      { id: 'dnssec', label: 'DNSSEC' },
    ];
    const el = renderSubNav(sections, 'resolvers');
    const pills = el.querySelectorAll('.pill');
    expect(pills.length).toBe(2);
    expect(pills[0].classList.contains('active')).toBe(true);
  });

  it('calls onSwitch when a pill is clicked', () => {
    const sections = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    let clicked = '';
    const el = renderSubNav(sections, 'a', (id) => { clicked = id; });
    (el.querySelectorAll('.pill')[1] as HTMLElement).click();
    expect(clicked).toBe('b');
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/sub-nav.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 15: Implement sub-nav.ts**

```ts
export interface SubNavSection {
  id: string;
  label: string;
}

export function renderSubNav(
  sections: SubNavSection[],
  activeId: string,
  onSwitch?: (id: string) => void,
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'pill-nav';

  for (const section of sections) {
    const pill = document.createElement('button');
    pill.className = 'pill';
    if (section.id === activeId) pill.classList.add('active');
    pill.textContent = section.label;
    pill.addEventListener('click', () => {
      container.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      onSwitch?.(section.id);
    });
    container.appendChild(pill);
  }

  return container;
}
```

- [ ] **Step 16: Run all component tests**

Run: `npx vitest run src/client/__tests__/`
Expected: All PASS

- [ ] **Step 17: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 18: Commit**

```bash
git add src/client/components/ src/client/__tests__/card.test.ts src/client/__tests__/badge.test.ts src/client/__tests__/progress.test.ts src/client/__tests__/workflow-nav.test.ts src/client/__tests__/sub-nav.test.ts
git commit -m "feat: rebuild core component primitives — card, badge, progress, workflow-nav, sub-nav"
git tag phase-4a
```

### Task 4b: Data Component Primitives

**Files:**
- Create: `src/client/components/score-ring.ts` — circular SVG score display
- Create: `src/client/components/gauge.ts` — speed gauge component
- Create: `src/client/components/data-table.ts` — reusable table
- Modify: `src/client/ui-utils.ts` — adapt skeleton rows for new DOM structure

- [ ] **Step 1: Write failing test for score-ring**

Create `src/client/__tests__/score-ring.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderScoreRing } from '../components/score-ring';

describe('renderScoreRing', () => {
  it('renders an SVG with correct score', () => {
    const el = renderScoreRing({ score: 87, max: 100 });
    expect(el.classList.contains('score-ring')).toBe(true);
    const num = el.querySelector('.score-number');
    expect(num?.textContent).toBe('87');
  });

  it('sets aria-label with the score', () => {
    const el = renderScoreRing({ score: 45, max: 100, label: 'Ad Block' });
    expect(el.getAttribute('aria-label')).toContain('45');
    expect(el.getAttribute('aria-label')).toContain('Ad Block');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/score-ring.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement score-ring.ts**

```ts
export interface ScoreRingProps {
  score: number;
  max?: number;
  label?: string;
  color?: string;
}

export function renderScoreRing(props: ScoreRingProps): HTMLDivElement {
  const max = props.max ?? 100;
  const pct = Math.min(1, Math.max(0, props.score / max));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const color = props.color ?? 'var(--accent)';

  const container = document.createElement('div');
  container.className = 'score-ring';
  container.setAttribute('role', 'img');
  container.setAttribute('aria-label', `${props.label ?? 'Score'}: ${props.score} / ${max}`);

  container.innerHTML = `
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="score-ring-bg" cx="60" cy="60" r="${radius}" fill="none" stroke="var(--border-subtle)" stroke-width="4"/>
      <circle class="score-ring-fill" cx="60" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="4"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
        transform="rotate(-90 60 60)" style="transition: stroke-dashoffset 0.6s var(--ease-out)"/>
    </svg>
    <div class="score-value">
      <span class="score-number" style="font-family:var(--font-display);font-size:1.75rem;color:var(--text-primary)">${props.score}</span>
      ${props.label ? `<span class="score-label" style="font-size:0.75rem;color:var(--text-muted)">${props.label}</span>` : ''}
    </div>
  `;

  return container;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/score-ring.test.ts`
Expected: PASS

- [ ] **Step 5: Write failing test for gauge**

Create `src/client/__tests__/gauge.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderGauge } from '../components/gauge';

describe('renderGauge', () => {
  it('renders a gauge with label and value', () => {
    const el = renderGauge({ label: 'Download', value: 94, unit: 'Mbps' });
    expect(el.classList.contains('gauge')).toBe(true);
    expect(el.querySelector('.gauge-label')?.textContent).toBe('Download');
    expect(el.querySelector('.gauge-value')?.textContent).toBe('94');
    expect(el.querySelector('.gauge-unit')?.textContent).toBe('Mbps');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/gauge.test.ts`
Expected: FAIL

- [ ] **Step 7: Implement gauge.ts**

```ts
export interface GaugeProps {
  label: string;
  value: number | string;
  unit: string;
  color?: string;
}

export function renderGauge(props: GaugeProps): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'gauge';

  const label = document.createElement('div');
  label.className = 'gauge-label';
  label.textContent = props.label;
  el.appendChild(label);

  const value = document.createElement('div');
  value.className = 'gauge-value';
  value.style.fontFamily = 'var(--font-display)';
  value.style.fontSize = '2rem';
  value.style.color = props.color ?? 'var(--text-primary)';
  value.textContent = String(props.value);
  el.appendChild(value);

  const unit = document.createElement('div');
  unit.className = 'gauge-unit';
  unit.textContent = props.unit;
  el.appendChild(unit);

  return el;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/client/__tests__/gauge.test.ts`
Expected: PASS

- [ ] **Step 9: Write failing test for data-table**

Create `src/client/__tests__/data-table.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderDataTable } from '../components/data-table';

describe('renderDataTable', () => {
  it('renders a table from headers and rows', () => {
    const el = renderDataTable({
      headers: ['Type', 'Value', 'TTL'],
      rows: [
        ['A', '1.2.3.4', '300'],
        ['MX', 'mail.example.com', '3600'],
      ],
    });
    expect(el.tagName).toBe('TABLE');
    expect(el.querySelectorAll('th').length).toBe(3);
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('renders empty state when no rows', () => {
    const el = renderDataTable({ headers: ['A'], rows: [] });
    expect(el.querySelector('tbody tr')?.textContent).toContain('No records');
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/client/__tests__/data-table.test.ts`
Expected: FAIL

- [ ] **Step 11: Implement data-table.ts**

```ts
export interface DataTableProps {
  headers: string[];
  rows: string[][];
  monoColumns?: number[];
}

export function renderDataTable(props: DataTableProps): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'data-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  for (const h of props.headers) {
    const th = document.createElement('th');
    th.textContent = h;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (props.rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = props.headers.length;
    td.className = 'data-table-empty';
    td.textContent = 'No records found';
    tr.appendChild(td);
    tbody.appendChild(tr);
  } else {
    for (const row of props.rows) {
      const tr = document.createElement('tr');
      row.forEach((cell, i) => {
        const td = document.createElement('td');
        if (props.monoColumns?.includes(i)) {
          td.className = 'mono';
          td.style.fontFamily = 'var(--font-mono)';
        }
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);

  return table;
}
```

- [ ] **Step 12: Run all new component tests**

Run: `npx vitest run src/client/__tests__/`
Expected: All PASS

- [ ] **Step 13: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add src/client/components/ src/client/__tests__/score-ring.test.ts src/client/__tests__/gauge.test.ts src/client/__tests__/data-table.test.ts src/client/ui-utils.ts
git commit -m "feat: add data component primitives — score-ring, gauge, data-table"
git tag phase-4b
```

---

## Chunk 4: Workflow Implementations (Phases 5–10)

> **Note:** The workflow tab files are the largest part of the rebuild. Each workflow subscribes to existing state observables and renders UI using the new component primitives. The test engines and state modules are imported unchanged — only the render layer is new.

### Task 5: Overview Workflow

**Files:**
- Create: `src/client/tabs/overview-tab.ts` — replaces `dashboard-tab.ts`
- Delete: `src/client/tabs/dashboard-tab.ts` (after overview-tab is verified)

- [ ] **Step 1: Write overview-tab.ts**

Create `src/client/tabs/overview-tab.ts` that:
- Imports `appState`, `dnsState`, `speedState`, `tlsState`, `adblockState`, `headersState`, `fingerprintState`, `qualityState` from state modules
- Imports `renderCard`, `renderScoreRing` from components
- Imports `t` from i18n
- Exports `initOverview()` function called by the router
- Renders the Hero + Grid layout (per mockup decision):
  - Score hero: serif number + /100 + italic descriptor
  - IP card: IP address (mono), location, ISP, PoP, protocol
  - 2×4 grid of quick-status cards: DNS, Speed, Ad Block, Headers, TLS, Fingerprint, Quality, Breach
  - Each card: label + value + status color (green/amber/red)
- Subscribes to state changes and re-renders cards when state updates
- Computes overall score using the existing `scoreToGrade()` logic (migrate from dashboard-tab.ts:41-46)
- About blurb at bottom (italic serif): "NetCheck runs all tests locally in your browser."

```ts
import { appState } from '../state/shared-state';
import { dnsState } from '../state/dns-state';
import { speedState } from '../state/speed-state';
import { tlsState } from '../state/tls-state';
import { adblockState } from '../state/adblock-state';
import { headersState } from '../state/headers-state';
import { fingerprintState } from '../state/fingerprint-state';
import { qualityState } from '../state/quality-state';
import { renderCard } from '../components/card';

export function initOverview(): void {
  const container = document.getElementById('overview-content');
  if (!container) return;

  renderOverview(container);

  // Subscribe to state changes for live updates
  appState.completedTests.subscribe(() => renderOverview(container));
  speedState.download.subscribe(() => renderOverview(container));
  dnsState.securityChecks.subscribe(() => renderOverview(container));
  // ... other subscriptions
}

function renderOverview(container: HTMLElement): void {
  // Build hero + grid layout
  // ... (implementation using renderCard, score computation, IP detection)
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Visual review**

Run: `npm run dev`, navigate to `#overview`
Expected: Overview renders with score, IP card, status grid in Editorial Report style

- [ ] **Step 4: Delete old dashboard-tab.ts**

```bash
rm src/client/tabs/dashboard-tab.ts
```

- [ ] **Step 5: Verify type-check still passes (no dangling imports)**

Run: `npx tsc --noEmit`
Expected: PASS (app.ts no longer imports dashboard-tab — it lazy-loads overview-tab)

- [ ] **Step 6: Verify existing state tests still pass**

Run: `npx vitest run`
Expected: All state tests PASS (unchanged)

- [ ] **Step 7: Commit**

```bash
git add src/client/tabs/overview-tab.ts
git rm src/client/tabs/dashboard-tab.ts
git commit -m "feat: overview workflow — hero + grid layout, score, IP, quick status"
git tag phase-5
```

### Task 6a: DNS Workflow (Core)

**Files:**
- Create: `src/client/tabs/dns-tab.ts` (core: IP, resolvers, security, DNSSEC)
- Modify: `src/client/dnssec-validation.ts` — adapt DOM IDs to new structure

- [ ] **Step 1: Write dns-tab.ts core**

Create `src/client/tabs/dns-tab.ts` that:
- Exports `initDns()` function
- Renders IP card (pinned above pills, always visible)
- Renders pill sub-nav with 6 sections: Resolvers, DNSSEC, IPv6, Lookup, Benchmark, Path
- Active pill: "Resolvers" by default
- Resolvers section: grid of resolver cards (Cloudflare, Google, Quad9, OpenDNS, AdGuard, Mullvad, NextDNS) with latency
- DNSSEC section: domain input + validate button + results (calls `runDnssecValidation` which is adapted below)
- Security section: DNSSEC validation, DoH, malware filtering, WebRTC IP leak status badges
- Uses `renderSubNav`, `renderCard`, `renderBadge`, `renderDataTable` from components
- Imports `dnsState` and subscribes for live updates
- Calls `runDnsChecks()` on init (IP detection, resolver checks, security checks)

- [ ] **Step 2: Adapt dnssec-validation.ts DOM IDs**

Update `src/client/dnssec-validation.ts` to use new element IDs:
- `#dnssec-results` → `#dnssec-results` (keep same, section is within dns-tab)
- `#dnssec-domain-input` → `#dnssec-domain-input` (keep same)
- `#dnssec-check-btn` → `#dnssec-check-btn` (keep same)

If the IDs are preserved in the new HTML structure (rendered by dns-tab.ts), no changes needed. Otherwise, update the getElementById calls in dnssec-validation.ts.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Visual review**

Run: `npm run dev`, navigate to `#dns`
Expected: IP card + pill nav + resolver cards visible. Switching pills shows different sections.

- [ ] **Step 5: Commit**

```bash
git add src/client/tabs/dns-tab.ts src/client/dnssec-validation.ts
git commit -m "feat: DNS workflow core — IP card, pill sub-nav, resolvers, security, DNSSEC"
git tag phase-6a
```

### Task 6b: DNS Workflow (Tools)

**Files:**
- Modify: `src/client/tabs/dns-tab.ts` — add IPv6, Lookup, Benchmark, Resolution Path sub-sections

- [ ] **Step 1: Add remaining DNS sub-sections to dns-tab.ts**

Add the remaining 4 pill sections:
- **IPv6:** calls `runIpv6Check()` on init, subscribes to `dnsState.ipv6`, renders readiness status (IPv4/IPv6 connectivity, AAAA resolution, dual-stack preference)
- **Lookup:** domain input + record type select + lookup button + `renderDataTable` for results. Uses existing `runDnsLookup()` from dns-ui.ts (or migrate the function)
- **Benchmark:** runs `runDnsAudit()` (from dns-audit.ts), displays benchmark results for all resolvers
- **Resolution Path:** displays resolution path timing from dnsState (populated by dns-audit)
- Suggestions grid at bottom (migrate from current dns-ui.ts suggestions rendering)

- [ ] **Step 2: Delete old dns-ui.ts**

```bash
rm src/client/dns-ui.ts
```

- [ ] **Step 3: Verify type-check (no dangling imports)**

Run: `npx tsc --noEmit`
Expected: PASS (app.ts no longer imports dns-ui — it lazy-loads dns-tab)

- [ ] **Step 4: Verify unit tests pass**

Run: `npx vitest run`
Expected: All PASS (state tests unchanged, dns-audit/dns-benchmark tests unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/client/tabs/dns-tab.ts
git rm src/client/dns-ui.ts
git commit -m "feat: DNS workflow tools — IPv6, lookup, benchmark, resolution path"
git tag phase-6b
```

### Task 7a: Speed & Performance (Speed + Quality)

**Files:**
- Create: `src/client/tabs/speed-performance-tab.ts` (speed + quality sections)
- Modify: `src/client/speed-suggestions.ts` — adapt DOM IDs
- Delete: `src/client/speed-ui.ts`, `src/client/connection-quality-ui.ts` (after verified)

- [ ] **Step 1: Write speed-performance-tab.ts (speed + quality)**

Create `src/client/tabs/speed-performance-tab.ts` that:
- Exports `initSpeedPerformance()` function
- Renders "Speed as hero" layout (per mockup decision B):
  - Speed Test section (always expanded): 3 gauge cards (Download, Upload, Latency), secondary metrics row (Jitter, Bufferbloat, Loss, Grade), Run button, server badge
  - Connection Quality section (collapsible): quality score ring, connection type, TLS info, resource timing breakdown, stability test
- Uses `renderGauge`, `renderScoreRing`, `renderCard` from components
- Imports `speedState`, `qualityState` and subscribes for live updates
- Calls `initSpeedTest()` (from speed-test.ts engine — unchanged) when Run button clicked

- [ ] **Step 2: Adapt speed-suggestions.ts DOM IDs**

Update `speed-suggestions.ts` to target `#speed-suggestions-grid` (rendered within speed-performance-tab.ts). If the ID is preserved, no change needed.

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Visual review**

Run: `npm run dev`, navigate to `#speed`
Expected: Speed gauges visible, Run button works, Quality section expands/collapses

- [ ] **Step 5: Commit**

```bash
git add src/client/tabs/speed-performance-tab.ts src/client/speed-suggestions.ts
git commit -m "feat: speed & performance — speed gauges + quality collapsible"
git tag phase-7a
```

### Task 7b: Speed & Performance (History + Map)

**Files:**
- Modify: `src/client/tabs/speed-performance-tab.ts` — add history + map collapsible sections
- Modify: `src/client/speed-graph.ts` — adapt canvas ID
- Delete: `src/client/network-map-ui.ts`, `src/client/tabs/history-tab.ts` (after verified)

- [ ] **Step 1: Add history + map sections**

Add to `speed-performance-tab.ts`:
- **History section (collapsible):** history chart (canvas), time range filter (7d/30d/all), stats summary, compare button, CSV export. Uses `compareState`, `historyState`, `SpeedTestHistory` from existing modules. Subscribes to `historyState`.
- **Network Map section (collapsible):** Leaflet map container, probe latency results. Uses `network-map.ts` engine (unchanged) for data.

- [ ] **Step 2: Adapt speed-graph.ts canvas ID**

Update `speed-graph.ts` to target the canvas element rendered by speed-performance-tab.ts. If `#speed-graph` is preserved, no change needed.

- [ ] **Step 3: Delete old UI modules**

```bash
rm src/client/speed-ui.ts src/client/connection-quality-ui.ts src/client/network-map-ui.ts src/client/tabs/history-tab.ts
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/tabs/speed-performance-tab.ts src/client/speed-graph.ts
git rm src/client/speed-ui.ts src/client/connection-quality-ui.ts src/client/network-map-ui.ts src/client/tabs/history-tab.ts
git commit -m "feat: speed & performance — history chart + network map"
git tag phase-7b
```

### Task 8a: Security Scan (Headers + TLS)

**Files:**
- Create: `src/client/tabs/security-scan-tab.ts` (self-check + headers + TLS)
- Delete: `src/client/headers-ui.ts`, `src/client/tabs/tls-tab.ts` (after verified)

- [ ] **Step 1: Write security-scan-tab.ts (self + headers + TLS)**

Create `src/client/tabs/security-scan-tab.ts` that:
- Exports `initSecurityScan()` function
- Renders "Self + Target split" layout (per mockup decision B):
  - **Self Connection section (auto-detected):** TLS version, cipher, HTTP protocol, certificate info — read from `tlsState` and connection quality data. Always visible.
  - **Target Domain section:** URL input + scan button + pill sub-nav for scan types (Headers, TLS, HTTP/3, CT, Email). Active pill: Headers.
- Headers scan: calls `handleHeadersCheck` via fetch to `/api/headers/check?url=...`, displays grade + header-by-header analysis + CSP analysis + suggestions
- TLS target check: calls `/api/tls/check?domain=...`, displays TLS version, cipher, cert chain, SAN list
- Uses `renderCard`, `renderBadge`, `renderDataTable` from components
- Imports `headersState`, `tlsState` and subscribes

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Visual review**

Run: `npm run dev`, navigate to `#security`
Expected: Self connection info visible, target input works, headers scan returns results

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/security-scan-tab.ts
git commit -m "feat: security scan — self connection + headers + TLS target"
git tag phase-8a
```

### Task 8b: Security Scan (HTTP/3 + CT + Email)

**Files:**
- Modify: `src/client/tabs/security-scan-tab.ts` — add HTTP/3, CT, Email sub-sections
- Modify: `src/client/cert-transparency.ts` — adapt DOM IDs
- Delete: `src/client/tabs/http3-tab.ts`, `src/client/tabs/email-tab.ts` (after verified)

- [ ] **Step 1: Add HTTP/3, CT, Email sections**

Add to `security-scan-tab.ts`:
- **HTTP/3 pill:** checks if target supports h3/quic (fetch with alt-svc header inspection). Uses `http3State`.
- **Cert Transparency pill:** domain input + search CT logs via `/api/cert-transparency?domain=...`. Uses `certTransparencyState`. Adapt `cert-transparency.ts` DOM refs.
- **Email Security pill:** domain input + check SPF/DKIM/DMARC via `/api/email-security?domain=...`. Uses `emailState`.

- [ ] **Step 2: Adapt cert-transparency.ts DOM IDs**

Update `cert-transparency.ts` to target elements rendered by security-scan-tab.ts. Preserve `#ct-*` IDs or update to match new structure.

- [ ] **Step 3: Delete old tab modules**

```bash
rm src/client/headers-ui.ts src/client/tabs/tls-tab.ts src/client/tabs/http3-tab.ts src/client/tabs/email-tab.ts
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/tabs/security-scan-tab.ts src/client/cert-transparency.ts
git rm src/client/headers-ui.ts src/client/tabs/tls-tab.ts src/client/tabs/http3-tab.ts src/client/tabs/email-tab.ts
git commit -m "feat: security scan — HTTP/3, cert transparency, email security"
git tag phase-8b
```

### Task 9a: Privacy & Blocking (Ad Block + Fingerprint)

**Files:**
- Create: `src/client/tabs/privacy-blocking-tab.ts` (ad block + fingerprint)
- Delete: `src/client/adblock-ui.ts`, `src/client/fingerprint-ui.ts` (after verified)

- [ ] **Step 1: Write privacy-blocking-tab.ts (ad block + fingerprint)**

Create `src/client/tabs/privacy-blocking-tab.ts` that:
- Exports `initPrivacyBlocking()` function
- Renders pill sub-nav with 5 sections: Ad Block, Fingerprint, Exposure, Cookies, Breach (per mockup decision A)
- **Ad Block section:** score ring (0-100), category breakdown grid (7 categories), filter list detector, CNAME tracking, suggestions. Calls `runAdBlockTests()` on init. Uses `adblockState`.
- **Fingerprint section:** score ring (uniqueness), category cards (Canvas, WebGL, Audio, fonts, screen, navigator, storage), protection tips. Calls fingerprint scan on button click. Uses `fingerprintState`.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Visual review**

Run: `npm run dev`, navigate to `#privacy`
Expected: Ad block tests run, score visible, fingerprint scan works

- [ ] **Step 4: Commit**

```bash
git add src/client/tabs/privacy-blocking-tab.ts
git commit -m "feat: privacy & blocking — ad block score + fingerprint uniqueness"
git tag phase-9a
```

### Task 9b: Privacy & Blocking (Exposure + Cookies + Breach)

**Files:**
- Modify: `src/client/tabs/privacy-blocking-tab.ts` — add exposure, cookies, breach sections
- Modify: `src/client/breach-check.ts`, `src/client/privacy-exposure.ts` — adapt DOM IDs
- Delete: `src/client/tabs/cookie-tab.ts`, `src/client/filter-ui.ts` (after verified)

- [ ] **Step 1: Add exposure, cookies, breach sections**

Add to `privacy-blocking-tab.ts`:
- **Privacy Exposure pill:** button to run scan, results showing which browser APIs are accessible and could leak privacy. Uses `privacyExposureState`. Calls `checkPrivacyExposure()`.
- **Cookies pill:** cookie audit — lists all cookies on the page, classifies as tracking/functional, shows expiry. Uses `cookieState`.
- **Breach pill:** email input + check via HaveIBeenPwned k-anonymity API. Uses `breachState`. Calls `checkBreach()`.

- [ ] **Step 2: Adapt breach-check.ts and privacy-exposure.ts DOM IDs**

Update DOM element IDs in `breach-check.ts` (`#breach-*`) and `privacy-exposure.ts` (`#privacy-exposure-results`) to match elements rendered by privacy-blocking-tab.ts.

- [ ] **Step 3: Delete old modules**

```bash
rm src/client/adblock-ui.ts src/client/fingerprint-ui.ts src/client/filter-ui.ts src/client/tabs/cookie-tab.ts
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/client/tabs/privacy-blocking-tab.ts src/client/breach-check.ts src/client/privacy-exposure.ts
git rm src/client/adblock-ui.ts src/client/fingerprint-ui.ts src/client/filter-ui.ts src/client/tabs/cookie-tab.ts
git commit -m "feat: privacy & blocking — exposure, cookies, breach check"
git tag phase-9b
```

### Task 10: AI Analysis Workflow

**Files:**
- Create: `src/client/tabs/ai-analysis-tab.ts` — replaces `ai-analysis-ui.ts`
- Modify: `src/client/ai-collector.ts` — adapt DOM IDs
- Delete: `src/client/ai-analysis-ui.ts` (after verified)

- [ ] **Step 1: Write ai-analysis-tab.ts**

Create `src/client/tabs/ai-analysis-tab.ts` that:
- Exports `initAiAnalysis()` function
- Renders single panel: cloud/on-device toggle, consent flow, "Run Analysis" button, output area
- Cloud mode: calls `/api/ai/analyze` with collected results from `ai-collector.ts`
- On-device mode: uses `ai-local.ts` (Transformers.js) with model download
- Uses `renderCard` for output display
- Imports `aiState` and subscribes

- [ ] **Step 2: Adapt ai-collector.ts DOM IDs**

Update `ai-collector.ts` to read from new DOM element IDs rendered by the 6 workflow tabs. The collector reads results from the DOM — these IDs must match the new structure. Audit and update all `getElementById` calls in `ai-collector.ts`.

- [ ] **Step 3: Delete old module**

```bash
rm src/client/ai-analysis-ui.ts
```

- [ ] **Step 4: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Visual review**

Run: `npm run dev`, navigate to `#ai`
Expected: AI analysis panel visible, cloud/on-device toggle works, consent flow appears

- [ ] **Step 6: Commit**

```bash
git add src/client/tabs/ai-analysis-tab.ts src/client/ai-collector.ts
git rm src/client/ai-analysis-ui.ts
git commit -m "feat: AI analysis workflow — cloud + on-device toggle, collector adapted"
git tag phase-10
```

---

## Chunk 5: Wiring + E2E (Phases 11–12)

### Task 11: Core Wiring

**Files:**
- Modify: `src/client/share.ts` — update DOM IDs to new structure
- Modify: `src/client/export-report.ts` — update DOM IDs to new structure
- Modify: `src/client/i18n.ts` — add new workflow nav keys, update static selector map
- Modify: `src/client/a11y.ts` — remap keyboard shortcuts 1-6 for workflows
- Modify: `src/client/analytics.ts` — adapt to new section/workflow IDs

- [ ] **Step 1: Audit share.ts DOM IDs**

Current IDs read by share.ts: `score-value`, `dashboard-ip-value`, `dashboard-speed-value`, `dashboard-latency-value`, `score-summary`, `fp-score-summary`, `share-btn`, `share-copy-btn`.

Map each to the new element IDs in the rebuilt HTML:
- `score-value` → `overview-score` (rendered by overview-tab)
- `dashboard-ip-value` → `overview-ip` (rendered by overview-tab)
- `dashboard-speed-value` → `overview-speed` (rendered by overview-tab)
- `dashboard-latency-value` → `overview-latency` (rendered by overview-tab)
- `score-summary` → `overview-score-summary` (rendered by overview-tab)
- `fp-score-summary` → `privacy-fp-summary` (rendered by privacy-blocking-tab)
- `share-btn`, `share-copy-btn` → kept in index.html dropdown panel

Update the `getElementById` calls in share.ts to use the new IDs. Update the `activeTab` check from `data-tab="dashboard"` to `data-tab="overview"`, etc.

- [ ] **Step 2: Audit export-report.ts DOM IDs**

Current IDs: `ip-address`, `ip-location`, `ip-asn`, `ip-timezone`, `ip-colo`, `export-menu` (x2).

Map to new IDs:
- `ip-address` → `dns-ip-address` (rendered by dns-tab)
- `ip-location` → `dns-ip-location`
- `ip-asn` → `dns-ip-asn`
- `ip-timezone` → `dns-ip-timezone`
- `ip-colo` → `dns-ip-colo`
- `export-menu` → kept in index.html

Update getElementById calls in export-report.ts.

- [ ] **Step 3: Add new i18n keys**

In `src/client/i18n.ts`, add new keys to the static selector map:
```ts
{ selector: '.tab-link[data-tab="overview"]', key: 'nav.overview' },
{ selector: '.tab-link[data-tab="dns"]', key: 'nav.dns' },
{ selector: '.tab-link[data-tab="speed"]', key: 'nav.speed' },
{ selector: '.tab-link[data-tab="security"]', key: 'nav.security' },
{ selector: '.tab-link[data-tab="privacy"]', key: 'nav.privacy' },
{ selector: '.tab-link[data-tab="ai"]', key: 'nav.ai' },
```

Add new keys to `src/client/locales/en.ts`:
```ts
'nav.overview': 'Overview',
'nav.dns': 'DNS',
'nav.speed': 'Speed',
'nav.security': 'Security',
'nav.privacy': 'Privacy',
'nav.ai': 'AI',
```

- [ ] **Step 4: Remap a11y.ts keyboard shortcuts**

Update `a11y.ts` line 87 — remap number keys from old 8-tab scheme to 6-workflow scheme:
```ts
const KEY_TO_TAB: Record<string, string> = {
  '1': 'overview',
  '2': 'dns',
  '3': 'speed',
  '4': 'security',
  '5': 'privacy',
  '6': 'ai',
};
```

- [ ] **Step 5: Update analytics.ts**

Adapt any workflow/tab ID references in analytics.ts to use the new 6 workflow IDs.

- [ ] **Step 6: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Verify lint**

Run: `npx eslint src/`
Expected: PASS

- [ ] **Step 8: Verify all unit tests pass**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 9: Commit**

```bash
git add src/client/share.ts src/client/export-report.ts src/client/i18n.ts src/client/a11y.ts src/client/analytics.ts src/client/locales/en.ts
git commit -m "feat: wire share, export, i18n, a11y, analytics to new workflow structure"
git tag phase-11
```

### Task 11b: Auxiliary Wiring

**Files:**
- Modify: `src/client/onboarding.ts` — adapt to new nav structure
- Modify: `src/client/motion.ts` — adapt selectors to new classes
- Modify: `src/client/tooltip.ts` — adapt selectors to new classes
- Modify: `src/client/theme.ts` — adapt toggle button ID (kept same)
- Modify: `src/client/network-change.ts` — adapt to new section IDs

- [ ] **Step 1: Adapt onboarding.ts**

Update any references to old nav/section classes to new `.tab-link`, `.section` classes.

- [ ] **Step 2: Adapt motion.ts**

Update selectors from old class names to new ones. The motion library applies transitions — ensure it targets new component classes.

- [ ] **Step 3: Adapt tooltip.ts**

Update tooltip selectors to match new component structure.

- [ ] **Step 4: Verify theme.ts works**

Theme toggle button ID `theme-toggle-header` is preserved in new index.html. Verify the toggle still works with new `data-theme` attribute (unchanged mechanism).

- [ ] **Step 5: Adapt network-change.ts**

Update any section/tab references to new workflow IDs.

- [ ] **Step 6: Verify type-check + lint + tests**

Run: `npx tsc --noEmit && npx eslint src/ && npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/client/onboarding.ts src/client/motion.ts src/client/tooltip.ts src/client/network-change.ts
git commit -m "feat: wire onboarding, motion, tooltip, network-change to new structure"
git tag phase-11b
```

### Task 12: E2E Tests + Final Verification

**Files:**
- Modify: `e2e/visual/visual.spec.ts` — update selectors for new workflow structure
- Modify: `playwright.config.ts` — if needed

- [ ] **Step 1: Read current e2e test**

Read `e2e/visual/visual.spec.ts` to understand current test structure.

- [ ] **Step 2: Rewrite visual.spec.ts for 6 workflows**

Update the e2e test to:
- Navigate to each of the 6 workflow hashes: `#overview`, `#dns`, `#speed`, `#security`, `#privacy`, `#ai`
- Verify the correct section is visible (`.section.active#overview` etc.)
- Verify tab bar shows correct active tab
- Test legacy redirect: navigate to `#dashboard`, verify redirect to `#overview`
- Basic visual regression: screenshot each workflow

- [ ] **Step 3: Run e2e tests**

Run: `npx playwright test`
Expected: All PASS

- [ ] **Step 4: Run full verification suite**

```bash
npx tsc --noEmit && npx eslint src/ && npm run build && npx vitest run && npx playwright test
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/visual/visual.spec.ts playwright.config.ts
git commit -m "test: update e2e for 6-workflow structure + legacy redirects"
git tag phase-12
```

- [ ] **Step 6: Final visual review**

Run: `npm run dev` and manually test all 6 workflows:
- Overview: score hero + IP + status grid
- DNS: pill sub-tabs (6), IP card, resolvers, DNSSEC, IPv6, lookup, benchmark, path
- Speed: gauges, run button, quality expand, history chart, map
- Security: self connection, target input, headers scan, TLS, HTTP/3, CT, email
- Privacy: pill sub-tabs (5), ad block score, fingerprint, exposure, cookies, breach
- AI: cloud/on-device toggle, consent, analysis output

Verify:
- Theme toggle (light/dark) works
- Language toggle (6 languages) works
- Share button copies summary
- Export downloads Markdown/PDF
- Keyboard shortcuts 1-6 switch workflows
- Legacy bookmarks redirect correctly

- [ ] **Step 7: Merge to main**

```bash
git checkout main
git merge frontend-rebuild
```

---

## Appendix: DOM ID Cross-Reference

### IDs that MUST be preserved (share.ts reads these)
| Old ID | New ID | Rendered by |
|--------|--------|-------------|
| `score-value` | `overview-score` | overview-tab.ts |
| `dashboard-ip-value` | `overview-ip` | overview-tab.ts |
| `dashboard-speed-value` | `overview-speed` | overview-tab.ts |
| `dashboard-latency-value` | `overview-latency` | overview-tab.ts |
| `score-summary` | `overview-score-summary` | overview-tab.ts |
| `fp-score-summary` | `privacy-fp-summary` | privacy-blocking-tab.ts |
| `share-btn` | `share-btn-header` (kept in index.html) | index.html |
| `share-copy-btn` | `share-copy-btn` (kept in index.html) | index.html |

### IDs that MUST be preserved (export-report.ts reads these)
| Old ID | New ID | Rendered by |
|--------|--------|-------------|
| `ip-address` | `dns-ip-address` | dns-tab.ts |
| `ip-location` | `dns-ip-location` | dns-tab.ts |
| `ip-asn` | `dns-ip-asn` | dns-tab.ts |
| `ip-timezone` | `dns-ip-timezone` | dns-tab.ts |
| `ip-colo` | `dns-ip-colo` | dns-tab.ts |
| `export-menu` | `export-menu` (kept in index.html) | index.html |

### IDs kept in index.html (dropdown panels)
- `lang-toggle-header`, `lang-menu`
- `theme-toggle-header`
- `export-btn-header`, `export-menu`
- `share-btn-header`, `share-menu`, `share-preview`, `share-copy-btn`

---

## Summary

| Phase | Files touched | Key output |
|-------|-------------|------------|
| 0a | 4 deleted | PWA artifacts removed |
| 0b | 2 modified | PWA refs cleaned |
| 1 | 4 modified | Editorial Report design system |
| 2 | 1 modified | 6-workflow HTML shell |
| 3 | 1 modified + 1 test | Router with legacy redirects |
| 4a | 5 modified/created | Core component primitives |
| 4b | 4 created/modified | Data component primitives |
| 5 | 1 created, 1 deleted | Overview workflow |
| 6a | 1 created, 1 modified | DNS core |
| 6b | 1 modified, 1 deleted | DNS tools |
| 7a | 2 created/modified | Speed + Quality |
| 7b | 2 modified, 4 deleted | History + Map |
| 8a | 1 created | Security: self + headers + TLS |
| 8b | 2 modified, 4 deleted | Security: HTTP/3 + CT + email |
| 9a | 1 created | Privacy: ad block + fingerprint |
| 9b | 3 modified, 4 deleted | Privacy: exposure + cookies + breach |
| 10 | 2 modified, 1 deleted | AI analysis |
| 11 | 5 modified | Core wiring (share/export/i18n/a11y/analytics) |
| 11b | 5 modified | Auxiliary wiring |
| 12 | 2 modified | E2E tests + final verification |

**Total: 20 phases, ~40 file operations, 6 new workflow modules, 8 new components, 15 old modules absorbed.**