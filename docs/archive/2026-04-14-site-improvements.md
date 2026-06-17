# NetCheck Site Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve NetCheck's SEO, trust signals, UX polish, and PWA/mobile support based on the site review.

**Architecture:** All changes are to the front-end client bundle (index.html, styles.css, i18n.ts, app.ts, theme.ts) and the Cloudflare Worker (worker/index.ts). No new dependencies. PWA manifest and service worker are static assets served from `public/`.

**Tech Stack:** TypeScript, Vite, Cloudflare Workers, plain CSS, no frameworks.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `index.html` | Modify | Add favicon, meta tags, OG tags, theme-color, privacy badge HTML |
| `public/css/styles.css` | Modify | Show nav icons on desktop, improve mobile gauges, status badge tints, card shadow |
| `src/client/i18n.ts` | Modify | Add i18n keys for privacy badge, collapsed resolvers, header descriptions |
| `src/client/app.ts` | Modify | Collapse unreachable resolvers, localize header desc |
| `src/client/theme.ts` | Modify | Simplify to dark/light binary toggle |
| `src/worker/index.ts` | Modify | Add locale-aware header descriptions |
| `public/manifest.json` | Create | PWA manifest |
| `public/sw.js` | Create | Minimal service worker |

---

## Chunk 1: SEO & Shareability (Phase 1)

### Task 1: Add favicon, meta description, OG tags, and theme-color

**Files:**
- Modify: `index.html:1-10`

- [ ] **Step 1: Add all meta tags and favicon to `<head>`**

Replace the existing `<head>` section (lines 3-9) with:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="NetCheck — Test your DNS, ad blocker, network speed, and security headers. All tests run locally in your browser.">
  <meta name="theme-color" content="#08090a" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#f8f9fa" media="(prefers-color-scheme: light)">
  <title>NetCheck — DNS & Ad Block Tester</title>

  <!-- Favicon (inline SVG) -->
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235e6ad2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M2 12h20'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E">

  <!-- Open Graph -->
  <meta property="og:title" content="NetCheck — DNS & Ad Block Tester">
  <meta property="og:description" content="Test your DNS, ad blocker, network speed, and security headers. All tests run locally in your browser.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://netcheck-site.oilygold.workers.dev">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="NetCheck — DNS & Ad Block Tester">
  <meta name="twitter:description" content="Test your DNS, ad blocker, network speed, and security headers. All tests run locally in your browser.">

  <!-- PWA manifest -->
  <link rel="manifest" href="/public/manifest.json">

  <link rel="preconnect" href="https://rsms.me/">
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css">
  <link rel="stylesheet" href="/public/css/styles.css">
</head>
```

- [ ] **Step 2: Run typecheck to verify no breakage**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add favicon, meta description, OG/Twitter cards, theme-color, manifest link"
```

---

## Chunk 2: Trust Signals (Phase 2)

### Task 2: Add privacy badge and footer privacy link

**Files:**
- Modify: `index.html:425-431` (footer)
- Modify: `src/client/i18n.ts` (add i18n keys)

- [ ] **Step 1: Add i18n keys for privacy badge and footer**

In `src/client/i18n.ts`, add to the `en` object (after `"footer.text"`):

```typescript
"footer.privacy": "Privacy",
"footer.privacyBadge": "100% client-side — no data leaves your browser",
```

And add to the `zhTW` object (after `"footer.text"`):

```typescript
"footer.privacy": "隱私",
"footer.privacyBadge": "100% 客戶端 — 無資料離開您的瀏覽器",
```

- [ ] **Step 2: Update `applyStaticTranslations` in `i18n.ts`**

After the `s("footer-text", "footer.text");` line, add:

```typescript
s("privacy-badge", "footer.privacyBadge");
```

- [ ] **Step 3: Update footer HTML in `index.html`**

Replace the footer (lines 425-431) with:

```html
<footer class="footer">
  <div class="footer-top">
    <span class="privacy-badge" id="privacy-badge">100% client-side — no data leaves your browser</span>
  </div>
  <div class="footer-bottom">
    <p class="footer-text" id="footer-text">NetCheck — DNS & Ad Block diagnostics. All tests run locally in your browser.</p>
    <div class="footer-links">
      <a href="https://github.com/acchuang/netcheck" target="_blank" rel="noopener noreferrer" class="footer-link">
        <svg class="footer-gh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
        GitHub
      </a>
      <a href="#privacy" class="footer-link" id="footer-privacy-link">Privacy</a>
    </div>
  </div>
</footer>
```

- [ ] **Step 4: Add privacy badge and footer styling to `styles.css`**

Add at the end of the footer styles section (after `.footer-gh-icon` block, around line 1654):

```css
.footer-top {
  margin-bottom: 8px;
}

.privacy-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 510;
  color: var(--emerald);
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  letter-spacing: -0.1px;
}

.footer-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 16px;
}

.footer-links .footer-link + .footer-link::before {
  content: "·";
  color: var(--text-quaternary);
  margin-right: 16px;
}
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add index.html src/client/i18n.ts public/css/styles.css
git commit -m "feat: add privacy badge and footer privacy link"
```

---

## Chunk 3: UX Polish (Phase 3)

### Task 3: Show nav icons on desktop

**Files:**
- Modify: `public/css/styles.css:257-262`

- [ ] **Step 1: Show nav-link-icon on desktop**

In `public/css/styles.css`, change line 258 from:

```css
.nav-link-icon {
  display: none;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
```

to:

```css
.nav-link-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
```

The mobile stylesheet at `@media (max-width: 640px)` already sets `display: block`, which is now unnecessary but harmless.

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "fix: show nav link icons on desktop for visual scanning"
```

### Task 4: Differentiate brand icon from DNS tab icon

**Files:**
- Modify: `index.html:14-20` (nav-brand SVG)

- [ ] **Step 1: Replace the brand icon SVG with a checkmark+shield combo**

Replace lines 15-18 (the brand icon SVG) with:

```html
<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  <polyline points="9 12 11 14 15 10"/>
</svg>
```

This uses a shield+checkmark (security tool identity) for the brand, leaving the globe for the DNS tab.

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "fix: differentiate brand icon (shield+check) from DNS tab icon (globe)"
```

### Task 5: Collapse unreachable DNS resolvers into expandable

**Files:**
- Modify: `src/client/app.ts:215-219`
- Modify: `src/client/i18n.ts` (add keys)
- Modify: `public/css/styles.css` (add styles)

- [ ] **Step 1: Add i18n keys for collapsed resolvers**

In `src/client/i18n.ts`, add to the `en` object:

```typescript
"dns.moreUnreachable": "{0} more unreachable",
```

And to the `zhTW` object:

```typescript
"dns.moreUnreachable": "另外 {0} 個無法連線",
```

- [ ] **Step 2: Update `runDnsChecks` in `app.ts` to collapse unreachable resolvers**

In `src/client/app.ts`, replace lines 215-219:

```typescript
const unreachable = resolvers.filter((r) => !r.reachable);
unreachable.forEach((r) => {
  const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
  resolverContainer.appendChild(item);
});
```

with:

```typescript
const unreachable = resolvers.filter((r) => !r.reachable);
if (unreachable.length > 0) {
  if (unreachable.length <= 2) {
    unreachable.forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
      resolverContainer.appendChild(item);
    });
  } else {
    unreachable.slice(0, 1).forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
      resolverContainer.appendChild(item);
    });
    const details = document.createElement("details");
    details.className = "unreachable-details";
    const summary = document.createElement("summary");
    summary.className = "unreachable-summary";
    summary.textContent = t("dns.moreUnreachable", unreachable.length - 1);
    details.appendChild(summary);
    unreachable.slice(1).forEach((r) => {
      const item = createCheckItem("fail", `${r.name} (${r.ip})`, t("dns.unreachable"));
      details.appendChild(item);
    });
    resolverContainer.appendChild(details);
  }
}
```

- [ ] **Step 3: Add styles for collapsed unreachable resolvers**

In `public/css/styles.css`, add after the `.resolver-badge.filter` block (around line 638):

```css
.unreachable-details {
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.unreachable-summary {
  font-size: 12px;
  font-weight: 510;
  color: var(--text-quaternary);
  cursor: pointer;
  padding: 6px 4px;
  user-select: none;
  transition: color 0.15s;
}

.unreachable-summary:hover {
  color: var(--text-tertiary);
}
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/client/app.ts src/client/i18n.ts public/css/styles.css
git commit -m "ux: collapse unreachable DNS resolvers into expandable section"
```

### Task 6: Localize security header descriptions

**Files:**
- Modify: `src/worker/index.ts:214-225`
- Modify: `src/client/app.ts:1089-1110`
- Modify: `src/client/i18n.ts`

- [ ] **Step 1: Change worker to send i18n keys instead of hardcoded descriptions**

In `src/worker/index.ts`, replace the `SECURITY_HEADERS` array (lines 214-225) with:

```typescript
const SECURITY_HEADERS = [
  { key: "strict-transport-security", name: "headers.hsts", desc: "headers.hsts.desc" },
  { key: "content-security-policy", name: "headers.csp", desc: "headers.csp.desc" },
  { key: "x-content-type-options", name: "headers.xcto", desc: "headers.xcto.desc" },
  { key: "x-frame-options", name: "headers.xfo", desc: "headers.xfo.desc" },
  { key: "referrer-policy", name: "headers.rp", desc: "headers.rp.desc" },
  { key: "permissions-policy", name: "headers.pp", desc: "headers.pp.desc" },
  { key: "x-xss-protection", name: "headers.xxss", desc: "headers.xxss.desc" },
  { key: "cross-origin-opener-policy", name: "headers.coop", desc: "headers.coop.desc" },
  { key: "cross-origin-embedder-policy", name: "headers.coep", desc: "headers.coep.desc" },
  { key: "cross-origin-resource-policy", name: "headers.corp", desc: "headers.corp.desc" },
];
```

- [ ] **Step 2: Add header i18n keys to `i18n.ts`**

Add to the `en` object (in the headers section):

```typescript
"headers.hsts": "Strict-Transport-Security (HSTS)",
"headers.hsts.desc": "Forces HTTPS connections, preventing downgrade attacks",
"headers.csp": "Content-Security-Policy (CSP)",
"headers.csp.desc": "Controls which resources the browser can load, mitigating XSS",
"headers.xcto": "X-Content-Type-Options",
"headers.xcto.desc": "Prevents MIME type sniffing attacks",
"headers.xfo": "X-Frame-Options",
"headers.xfo.desc": "Prevents clickjacking by controlling iframe embedding",
"headers.rp": "Referrer-Policy",
"headers.rp.desc": "Controls how much referrer information is sent with requests",
"headers.pp": "Permissions-Policy",
"headers.pp.desc": "Controls which browser features the page can use",
"headers.xxss": "X-XSS-Protection",
"headers.xxss.desc": "Legacy XSS filter (mostly superseded by CSP)",
"headers.coop": "Cross-Origin-Opener-Policy (COOP)",
"headers.coop.desc": "Isolates browsing context from cross-origin popups",
"headers.coep": "Cross-Origin-Embedder-Policy (COEP)",
"headers.coep.desc": "Requires CORS/CORP for all cross-origin resources",
"headers.corp": "Cross-Origin-Resource-Policy (CORP)",
"headers.corp.desc": "Controls which origins can embed this resource",
```

Add to the `zhTW` object (in the headers section):

```typescript
"headers.hsts": "Strict-Transport-Security (HSTS)",
"headers.hsts.desc": "強制使用 HTTPS 連線，防止降級攻擊",
"headers.csp": "Content-Security-Policy (CSP)",
"headers.csp.desc": "控制瀏覽器可載入的資源，減輕 XSS 攻擊",
"headers.xcto": "X-Content-Type-Options",
"headers.xcto.desc": "防止 MIME 類型嗅探攻擊",
"headers.xfo": "X-Frame-Options",
"headers.xfo.desc": "透過控制 iframe 嵌入防止點擊劫持",
"headers.rp": "Referrer-Policy",
"headers.rp.desc": "控制請求中傳送的來源資訊量",
"headers.pp": "Permissions-Policy",
"headers.pp.desc": "控制頁面可使用的瀏覽器功能",
"headers.xxss": "X-XSS-Protection",
"headers.xxss.desc": "舊版 XSS 過濾器（多已被 CSP 取代）",
"headers.coop": "Cross-Origin-Opener-Policy (COOP)",
"headers.coop.desc": "隔離瀏覽上下文與跨來源彈出視窗",
"headers.coep": "Cross-Origin-Embedder-Policy (COEP)",
"headers.coep.desc": "要求所有跨來源資源須有 CORS/CORP",
"headers.corp": "Cross-Origin-Resource-Policy (CORP)",
"headers.corp.desc": "控制哪些來源可嵌入此資源",
```

- [ ] **Step 3: Update `runHeadersCheck` in `app.ts` to translate header names/descriptions**

In `src/client/app.ts`, in the `runHeadersCheck` function, after line 1089 where `data.checks.forEach((check) => {`, update the rendering to translate `check.name` and `check.desc`:

Change:
```typescript
      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${check.name}</span>
          <span class="check-sublabel">${check.desc}</span>
        </div>
        ${valueHtml}
      `;
```

to:

```typescript
      div.innerHTML = `
        <svg class="check-icon ${status}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
        <div class="check-label-block">
          <span class="check-label">${t(check.name)}</span>
          <span class="check-sublabel">${t(check.desc)}</span>
        </div>
        ${valueHtml}
      `;
```

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/worker/index.ts src/client/app.ts src/client/i18n.ts
git commit -m "feat: localize security header names and descriptions"
```

### Task 7: Simplify theme toggle to dark/light binary

**Files:**
- Modify: `src/client/theme.ts`

- [ ] **Step 1: Simplify theme toggle**

Replace the contents of `src/client/theme.ts` with:

```typescript
export type ThemeMode = "dark" | "light";

const STORAGE_KEY = "netcheck-theme";

const ICONS: Record<ThemeMode, string> = {
  dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  light: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
};

const CYCLE: ThemeMode[] = ["dark", "light"];

let current: ThemeMode = "dark";

function enableThemeTransition(): void {
  const style = document.createElement("style");
  style.id = "theme-transition";
  style.textContent = "*, *::before, *::after { transition: background-color 0.3s, color 0.3s, border-color 0.3s !important; }";
  document.head.appendChild(style);
  setTimeout(() => style.remove(), 350);
}

function apply(animate = false): void {
  if (animate) enableThemeTransition();
  document.documentElement.setAttribute("data-theme", current);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    const svg = btn.querySelector("svg");
    if (svg) svg.innerHTML = ICONS[current];
    btn.title = `Theme: ${current}`;
  }
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved && CYCLE.includes(saved)) current = saved;
  else {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    current = prefersLight ? "light" : "dark";
  }
  apply();

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const idx = CYCLE.indexOf(current);
    current = CYCLE[(idx + 1) % CYCLE.length];
    localStorage.setItem(STORAGE_KEY, current);
    apply(true);
  });
}
```

Note: Still respects OS preference on first visit (no saved preference), but toggle is now a simple binary.

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/client/theme.ts
git commit -m "ux: simplify theme toggle to dark/light binary"
```

### Task 8: Increase card hover shadow contrast

**Files:**
- Modify: `public/css/styles.css:460-463`

- [ ] **Step 1: Increase card hover shadow**

Change:
```css
.card:hover {
  border-color: var(--hover-border);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

to:

```css
.card:hover {
  border-color: var(--hover-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "ux: increase card hover shadow for better interactive feedback"
```

### Task 9: Add subtle background tinting to status badges

**Files:**
- Modify: `public/css/styles.css:497-517`

- [ ] **Step 1: Add background tinting to status badges**

Add `background-color` to the `.status-badge.done` and `.status-badge.error` rules:

Change:
```css
.status-badge.done {
  color: var(--emerald);
  border-color: rgba(16, 185, 129, 0.3);
}

.status-badge.error {
  color: var(--red);
  border-color: rgba(239, 68, 68, 0.3);
}
```

to:

```css
.status-badge.done {
  color: var(--emerald);
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.08);
}

.status-badge.error {
  color: var(--red);
  border-color: rgba(239, 68, 68, 0.3);
  background: rgba(239, 68, 68, 0.08);
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "ux: add subtle background tinting to status badges"
```

---

## Chunk 4: PWA & Mobile (Phase 4)

### Task 10: Create PWA manifest

**Files:**
- Create: `public/manifest.json`

- [ ] **Step 1: Create manifest.json**

```json
{
  "name": "NetCheck — DNS & Ad Block Tester",
  "short_name": "NetCheck",
  "description": "Test your DNS, ad blocker, network speed, and security headers. All tests run locally in your browser.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#08090a",
  "theme_color": "#08090a",
  "icons": [
    {
      "src": "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235e6ad2' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/%3E%3Cpolyline points='9 12 11 14 15 10'/%3E%3C/svg%3E",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

Note: Using inline SVG icon. Modern browsers support SVG in PWA manifests.

- [ ] **Step 2: Commit**

```bash
git add public/manifest.json
git commit -m "feat: add PWA manifest for Add to Home Screen support"
```

### Task 11: Add minimal service worker

**Files:**
- Create: `public/sw.js`
- Modify: `src/client/main.ts`

- [ ] **Step 1: Create service worker**

Create `public/sw.js`:

```javascript
const CACHE_NAME = "netcheck-v1";
const STATIC_ASSETS = [
  "/",
  "/public/css/styles.css",
  "/src/client/main.ts",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response("offline", { status: 503 }))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
      return cached || fetched;
    })
  );
});
```

- [ ] **Step 2: Register service worker in `main.ts`**

Update `src/client/main.ts` to:

```typescript
import { initTheme } from "./theme";
import { initI18n } from "./i18n";
import "./app";

initTheme();
initI18n();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/public/sw.js").catch(() => {});
}
```

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add public/sw.js src/client/main.ts
git commit -m "feat: add service worker for offline support"
```

### Task 12: Improve mobile speed gauge readability at ≤480px

**Files:**
- Modify: `public/css/styles.css` (480px media query)

- [ ] **Step 1: Improve mobile speed gauge layout**

In `public/css/styles.css`, replace the `@media (max-width: 480px)` block (lines 1798-1811) with:

```css
@media (max-width: 480px) {
  .display {
    font-size: 28px;
    letter-spacing: -0.6px;
  }

  .speed-gauge-row {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .speed-gauge {
    padding: 14px;
  }

  .speed-gauge-value {
    font-size: 28px;
  }

  .speed-gauge-label {
    font-size: 11px;
  }

  .speed-gauge-unit {
    font-size: 12px;
    margin-bottom: 10px;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add public/css/styles.css
git commit -m "ux: improve speed gauge readability at ≤480px"
```

---

## Task Summary

| Task | Phase | Impact | Effort | Files |
|------|-------|--------|--------|-------|
| 1 | SEO | High | Low | `index.html` |
| 2 | Trust | High | Low | `index.html`, `i18n.ts`, `styles.css` |
| 3 | UX | Medium | Low | `styles.css` |
| 4 | UX | Medium | Low | `index.html` |
| 5 | UX | Medium | Medium | `app.ts`, `i18n.ts`, `styles.css` |
| 6 | UX | Medium | Medium | `worker/index.ts`, `app.ts`, `i18n.ts` |
| 7 | UX | Low | Low | `theme.ts` |
| 8 | UX | Low | Low | `styles.css` |
| 9 | UX | Low | Low | `styles.css` |
| 10 | PWA | Medium | Low | `public/manifest.json` |
| 11 | PWA | Medium | Medium | `public/sw.js`, `main.ts` |
| 12 | PWA | Low | Low | `styles.css` |