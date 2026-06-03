# Layout Variety Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break visual monotony across all tabs by introducing mixed-size card layout primitives (hero, compact, stat-strip, asymmetric grid) and applying them tab-by-tab in 5 phases.

**Architecture:** Add 4 CSS layout primitives to `public/css/styles.css` using existing design tokens from `public/css/tokens.css`. Then modify HTML in `index.html` and DOM-building JS in tab UI files to apply hero/compact/stat-strip patterns per tab. Each phase is independently deployable.

**Tech Stack:** Vanilla TypeScript, CSS custom properties, existing Vite build. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-03-layout-variety-design.md`

---

## Chunk 1: CSS Primitives + DNS Tab

### Task 1: Add Layout Primitives to styles.css

**Files:**
- Modify: `public/css/styles.css` (after line 497, after `.card-grade` block, before Badges & Tags section)

- [ ] **Step 1: Add card-hero styles after `.card-grade` block (after line ~497)**

Insert after `.card-grade { ... }` and before the Badges & Tags comment:

```css
/* ========================================
   Card Variants
   ======================================== */

.card-hero {
  grid-column: 1 / -1;
}

.card-hero .card-header {
  padding: var(--space-6) var(--space-6) 0;
}

.card-hero .card-title {
  font-family: var(--font-display);
  font-size: var(--text-heading);
  font-weight: 700;
  color: var(--text-primary);
  text-transform: none;
  letter-spacing: 0;
}

.card-hero .card-body {
  padding: var(--space-6);
}

.card-hero-value {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
  letter-spacing: -0.02em;
}

.card-hero-value .unit {
  font-size: var(--text-body);
  font-weight: 600;
  color: var(--text-muted);
  margin-left: var(--space-1);
}

.card-compact .card-header {
  padding: var(--space-3) var(--space-3) 0;
}

.card-compact .card-body {
  padding: var(--space-3);
}

/* ========================================
   Stat Strip
   ======================================== */

.stat-strip {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-8);
  padding: var(--space-3) 0;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.stat-label {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.stat-value {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  color: var(--text-primary);
}

/* ========================================
   Asymmetric Grid
   ======================================== */

.cards-grid--asymmetric > :first-child {
  grid-column: 1 / -1;
}
```

- [ ] **Step 2: Add responsive rules for stat-strip inside the existing `@media (max-width: 768px)` block (around line 1908)**

Inside the existing `@media (max-width: 768px) { ... }` block, add before the closing `}`:

```css
.stat-strip {
  gap: var(--space-3) var(--space-4);
}
```

- [ ] **Step 3: Add print styles inside the existing `@media print` block (around line 1984)**

Inside the existing `@media print { ... }` block, add:

```css
.card-hero,
.card-compact {
  break-inside: avoid;
}

.stat-strip {
  display: none;
}
```

- [ ] **Step 4: Verify CSS loads without errors**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit CSS primitives**

```bash
git add public/css/styles.css
git commit -m "feat: add card-hero, card-compact, stat-strip, cards-grid--asymmetric CSS primitives"
```

### Task 2: Apply hero layout to DNS IP Info card

**Files:**
- Modify: `index.html` (line ~239-280, IP Info Card)
- Modify: `src/client/dns-ui.ts` (IP rendering logic)

- [ ] **Step 1: Convert IP Info card to card-hero in index.html**

Change the IP Info card at line ~241 from:

```html
<div class="card">
```

to:

```html
<div class="card card-hero card-accent-lime">
```

Change the card-header's `<h2 class="card-title" id="dns-ip-title">Your IP Address</h2>` to keep the same element (the CSS override in `.card-hero .card-title` will restyle it automatically).

Inside the `<div class="card-body">`, wrap the existing `.info-row` elements in a `<div class="stat-strip">`. The result should look like:

```html
<div class="card card-hero card-accent-lime">
  <div class="card-header">
    <svg class="card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    </svg>
    <h2 class="card-title" id="dns-ip-title">Your IP Address</h2>
    <span class="status-badge detecting" id="ip-status">detecting...</span>
  </div>
  <div class="card-body">
    <div class="stat-strip" id="ip-stat-strip">
      <div class="stat-item">
        <span class="stat-label" id="dns-ipv4-label">IPv4</span>
        <span class="stat-value mono" id="ip-address">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-location-label">Location</span>
        <span class="stat-value" id="ip-location">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-isp-label">ISP / ASN</span>
        <span class="stat-value" id="ip-asn">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-timezone-label">Timezone</span>
        <span class="stat-value" id="ip-timezone">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-colo-label">Cloudflare PoP</span>
        <span class="stat-value mono" id="ip-colo">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-http-label">HTTP Protocol</span>
        <span class="stat-value mono" id="ip-http">—</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" id="dns-tls-label">TLS Version</span>
        <span class="stat-value mono" id="ip-tls">—</span>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Update dns-ui.ts if it references the removed `.info-row` / `.info-value` / `.info-label` classes for the IP card**

Search `dns-ui.ts` for any references to the IP info card's `.info-row`, `.info-value`, or `.info-label` elements. If it sets `textContent` on the IDs (`ip-address`, `ip-location`, etc.), those still work — they're now inside `.stat-item > .stat-value` instead of `.info-row > .info-value`, but the IDs are unchanged so JS still finds them.

Verify no JS changes are needed by checking:

Run: `grep -n "info-row\|info-value\|info-label" /Users/acchuang/Project/netcheck-site/src/client/dns-ui.ts`
Expected: No references to these classes in the IP card rendering (they use IDs to set text).

- [ ] **Step 3: Build and verify DNS tab renders correctly with hero card**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run dev`
Open the DNS tab in the browser. Verify:
- IP Info card spans full width with accent lime top border
- Card title "Your IP Address" is larger (heading size, not mono uppercase)
- IP fields display as row of stat items with labels above values
- DNS Resolver and DNS Security cards remain in 2-col grid below

- [ ] **Step 4: Commit DNS IP Info hero**

```bash
git add index.html
git commit -m "feat: convert DNS IP Info card to card-hero with stat-strip layout"
```

### Task 3: Convert DNS Security checks to stat-strip

**Files:**
- Modify: `src/client/dns-ui.ts` (security checks rendering)

- [ ] **Step 1: Find the DNS security rendering code in dns-ui.ts**

Search for the function that renders DNS security check results. It likely builds HTML with `.info-row` or similar patterns for each check item.

Run: `grep -n "security-results\|securityCheck\|security-check\|dns-security" /Users/acchuang/Project/netcheck-site/src/client/dns-ui.ts`

Read the relevant function to understand the current HTML structure being generated.

- [ ] **Step 2: Modify the DNS security rendering to use stat-strip**

Change the generated HTML from card-based or info-row-based layout to a `stat-strip` pattern. The security checks should render as:

```html
<div class="stat-strip" id="dns-security-results">
  <div class="stat-item">
    <span class="stat-label">Check Name</span>
    <span class="stat-value status-pass">✓ Pass</span>
  </div>
  ...
</div>
```

This replaces the current `<div id="dns-security-results">` content that's inside a card. The card wrapper for DNS Security should remain but become more compact — change it to `class="card card-compact"` in `index.html` at line ~299.

- [ ] **Step 3: Update the DNS Security card HTML in index.html**

At line ~299, change:

```html
<div class="card">
```

to:

```html
<div class="card card-compact">
```

Keep the rest of the structure (card-header, card-title, status-badge, card-body).

- [ ] **Step 4: Build and verify DNS Security renders as stat-strip**

Run: `npm run dev` and test the DNS tab. Verify security checks display as a horizontal strip of label+value pairs inside a compact card.

- [ ] **Step 5: Commit DNS Security stat-strip**

```bash
git add index.html src/client/dns-ui.ts
git commit -m "feat: convert DNS Security checks to stat-strip inside compact card"
```

---

## Chunk 2: Security Headers + TLS Tabs

### Task 4: Apply hero layout to Headers Grade card

**Files:**
- Modify: `index.html` (line ~671-724, Headers Grade Card)
- Modify: `src/client/headers-ui.ts`

- [ ] **Step 1: Convert Headers Grade card to card-hero in index.html**

At line ~671, the Grade Card is inside `<div class="cards-grid cards-grid-2">`. Change the Grade Card from:

```html
<div class="card">
```

to:

```html
<div class="card card-hero card-accent-cyan">
```

Change the Info Card (the second card in that grid) from:

```html
<div class="card">
```

to:

```html
<div class="card card-compact">
```

- [ ] **Step 2: Convert the `cards-grid-2` to an asymmetric grid**

Change the grid wrapper at line ~671 from:

```html
<div class="cards-grid cards-grid-2">
```

to:

```html
<div class="cards-grid cards-grid--asymmetric">
```

This makes the first child (the hero card) span full width, and the Info card flows normally below.

- [ ] **Step 3: Add stat-strip inside the Grade card for score/pass/warn/fail counts**

Inside the Grade card's `<div class="card-body">`, after the `headers-grade-display` div, add a stat-strip for score breakdown:

```html
<div class="stat-strip" id="headers-score-strip">
  <div class="stat-item">
    <span class="stat-label">Score</span>
    <span class="stat-value" id="headers-strip-score">—</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">Pass</span>
    <span class="stat-value status-pass" id="headers-strip-pass">—</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">Warn</span>
    <span class="stat-value status-warn" id="headers-strip-warn">—</span>
  </div>
  <div class="stat-item">
    <span class="stat-label">Fail</span>
    <span class="stat-value status-fail" id="headers-strip-fail">—</span>
  </div>
</div>
```

- [ ] **Step 4: Update headers-ui.ts to populate the new stat-strip fields**

In the headers result rendering function, after setting the grade, also populate the new stat-strip values:

```typescript
document.getElementById('headers-strip-score')!.textContent = `${data.score.present}/${data.score.total}`;
document.getElementById('headers-strip-pass')!.textContent = `${data.checks.filter(c => c.present).length}`;
document.getElementById('headers-strip-warn')!.textContent = '—';
document.getElementById('headers-strip-fail')!.textContent = `${data.checks.filter(c => !c.present).length}`;
```

Adjust the logic based on how `headers-ui.ts` currently processes the response data.

- [ ] **Step 5: Build and verify Headers tab**

Run: `npm run dev`, navigate to the Headers tab, run a scan. Verify:
- Grade card spans full width with cyan accent border
- Grade letter is prominent (using existing `.speed-grade` style)
- Stat strip shows Score/Pass/Fail below the grade
- Info card is compact
- Header Analysis remains `card-wide` below

- [ ] **Step 6: Commit Headers hero layout**

```bash
git add index.html src/client/headers-ui.ts
git commit -m "feat: convert Headers Grade card to card-hero with stat-strip"
```

### Task 5: Apply hero layout to TLS Inspector

**Files:**
- Modify: `src/client/tabs/tls-tab.ts`
- Note: TLS section HTML is empty (`<div id="tls-content">`) — all content is JS-rendered

- [ ] **Step 1: Find TLS rendering code**

Run: `grep -n "tls-content\|renderTls\|card\|card-header\|card-title" /Users/acchuang/Project/netcheck-site/src/client/tabs/tls-tab.ts | head -30`

Read the rendering logic to understand how TLS results are built.

- [ ] **Step 2: Modify TLS rendering to use card-hero for the grade/protocol card**

Change the main TLS result card (the one showing grade + protocol) to use classes `card card-hero card-accent-green`. Add a stat-strip for cipher suite/key exchange info beneath the grade.

The hero card should have this pattern:

```html
<div class="card card-hero card-accent-green">
  <div class="card-header">
    <h2 class="card-title">TLS Security</h2>
    <span class="card-grade">A+</span>
  </div>
  <div class="card-body">
    <div class="stat-strip">
      <div class="stat-item">
        <span class="stat-label">Protocol</span>
        <span class="stat-value">TLSv1.3</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Cipher</span>
        <span class="stat-value">AES-256-GCM</span>
      </div>
      ...
    </div>
  </div>
</div>
```

Subsequent detail cards should use `card-compact`.

- [ ] **Step 3: Build and verify TLS tab**

Run: `npm run dev`, click "Check TLS" on the TLS tab. Verify:
- Grade card spans full width with green accent
- Protocol/cipher shown as stat-strip items
- Detail cards below are compact

- [ ] **Step 4: Commit TLS hero layout**

```bash
git add src/client/tabs/tls-tab.ts
git commit -m "feat: convert TLS Inspector to card-hero with stat-strip"
```

---

## Chunk 3: Ad Block + Fingerprint Tabs

### Task 6: Apply hero layout to Ad Block Test

**Files:**
- Modify: `index.html` (line ~579-645)
- Modify: `src/client/adblock-ui.ts`

- [ ] **Step 1: Convert the adblock score-card to card-hero**

The adblock section has a `.score-card` (not a `.card`) with a score ring. Wrap it in a card-hero structure. In `index.html`, change the score-card section to:

```html
<div class="card card-hero card-accent-lime">
  <div class="card-header">
    <h2 class="card-title" id="adblock-score-title">Ad Block Score</h2>
  </div>
  <div class="card-body">
    <div class="score-card">
      ...existing score ring and meta...
    </div>
  </div>
</div>
```

Move the existing `.score-card` content inside the card-body. The score ring and meta stay as-is.

- [ ] **Step 2: Convert test-categories section to asymmetric grid**

The `test-categories` div is populated by JS. In `adblock-ui.ts`, find where category test items are rendered and wrap them in `cards-grid cards-grid--asymmetric` so the first category (ads) spans full width.

Alternatively, if the categories use a different layout system, add the asymmetric grid class to the parent `test-categories` div.

- [ ] **Step 3: Build and verify Ad Block tab**

Run: `npm run dev`, test adblock. Verify:
- Score ring is inside a hero card with lime accent
- Categories render with first category spanning full width

- [ ] **Step 4: Commit Ad Block hero layout**

```bash
git add index.html src/client/adblock-ui.ts
git commit -m "feat: convert Ad Block score to card-hero with asymmetric categories"
```

### Task 7: Apply hero layout to Fingerprint

**Files:**
- Modify: `index.html` (line ~750-792)
- Modify: `src/client/fingerprint-ui.ts`

- [ ] **Step 1: Convert the fp-score-card to card-hero**

The fingerprint section has a `.fp-score-card` with a score ring. Wrap it in a hero card structure similar to adblock:

```html
<div class="card card-hero card-accent-rose" id="fp-score-card" style="display:none">
  <div class="card-header">
    <h2 class="card-title" id="fp-score-title">Fingerprint Uniqueness</h2>
  </div>
  <div class="card-body">
    <div class="score-ring">
      ...existing score ring...
    </div>
    <div class="score-meta">
      ...existing meta...
    </div>
  </div>
</div>
```

Note: The existing `fp-score-card` has `style="display:none"`. Keep this on the outer wrapper.

- [ ] **Step 2: Convert fp-categories to compact grid**

Find where fingerprint categories are rendered in `fingerprint-ui.ts`. The `fp-categories` div uses `test-categories` class. After categories render, add `cards-grid-3` class for a 3-column compact layout, and use `card-compact` for each category card.

- [ ] **Step 3: Build and verify Fingerprint tab**

Run: `npm run dev`, click "Run Fingerprint Scan". Verify:
- Score ring is inside a hero card with rose accent
- Category test items render in a 3-column compact grid

- [ ] **Step 4: Commit Fingerprint hero layout**

```bash
git add index.html src/client/fingerprint-ui.ts
git commit -m "feat: convert Fingerprint score to card-hero with compact categories"
```

---

## Chunk 4: Remaining Tabs (Phase 5)

### Task 8: Apply hero layout to Connection Quality

**Files:**
- Modify: `index.html` (line ~792-898)
- Modify: `src/client/connection-quality-ui.ts`

- [ ] **Step 1: Convert the quality score card to card-hero**

The Quality section at line ~798 has `<div class="cards-grid">` with a `<div class="card score-card" id="quality-score-card">`. Change this to:

```html
<div class="card card-hero card-accent-cyan" id="quality-score-card">
```

- [ ] **Step 2: Build and verify Quality tab**

Run: `npm run dev`, navigate to Quality tab, run the test. Verify the score ring card spans full width with cyan accent.

- [ ] **Step 3: Commit Quality hero**

```bash
git add index.html src/client/connection-quality-ui.ts
git commit -m "feat: convert Connection Quality score to card-hero"
```

### Task 9: Apply hero layout to Email Security / Cert Transparency / Cookie Audit / Breach Check / HTTP/3

These 5 tabs are all JS-rendered (empty `<div id="xxx-content">`). Each one needs its UI file updated.

**Files:**
- Modify: `src/client/tabs/email-tab.ts`
- Modify: `src/client/cert-transparency.ts`
- Modify: `src/client/tabs/cookie-tab.ts`
- Modify: `src/client/breach-check.ts`
- Modify: `src/client/tabs/http3-tab.ts`

- [ ] **Step 1: Identify the main result card in each tab's rendering function**

For each tab, find where the primary result card is built in JS. It will be the HTML template string that shows the main result (e.g., SPF/DKIM/DMARC results for email, certificate list for cert-transparency, cookie count for cookies, breach status for breach, HTTP/3 result for http3).

Run these commands to find the card rendering code:
```
grep -n "card-header\|result-card\|class=\"card" src/client/tabs/email-tab.ts
grep -n "card-header\|result-card\|class=\"card" src/client/cert-transparency.ts
grep -n "card-header\|result-card\|class=\"card" src/client/tabs/cookie-tab.ts
grep -n "card-header\|result-card\|class=\"card" src/client/breach-check.ts
grep -n "card-header\|result-card\|class=\"card" src/client/tabs/http3-tab.ts
```

- [ ] **Step 2: For Email Security, convert the main result to card-hero with card-accent-cyan**

In the rendering function, change the primary result card's class to `card card-hero card-accent-cyan`. Secondary detail cards get `card card-compact`.

- [ ] **Step 3: For Cert Transparency, convert to card-hero with card-accent-purple**

- [ ] **Step 4: For Cookie Audit, convert to card-hero with card-accent-amber**

- [ ] **Step 5: For Breach Check, convert to card-hero with card-accent-rose**

- [ ] **Step 6: For HTTP/3, convert to card-hero with card-accent-green**

- [ ] **Step 7: Build and verify all 5 tabs**

Run: `npm run dev`. Visit each tab and run its test. Verify the hero card spans full width with the correct accent color, and secondary cards are compact.

- [ ] **Step 8: Commit all remaining tabs**

```bash
git add src/client/tabs/email-tab.ts src/client/cert-transparency.ts src/client/tabs/cookie-tab.ts src/client/breach-check.ts src/client/tabs/http3-tab.ts
git commit -m "feat: apply card-hero to Email, Cert, Cookie, Breach, HTTP/3 tabs"
```

---

## Chunk 5: Final Verification

### Task 10: Cross-browser and responsive verification

- [ ] **Step 1: Run the full build**

Run: `cd /Users/acchuang/Project/netcheck-site && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Run existing tests**

Run: `cd /Users/acchuang/Project/netcheck-site && npm test 2>&1 | tail -30`
Expected: All tests pass.

- [ ] **Step 3: Check mobile responsive behavior**

Run: `npm run dev` and test at 375px width. Verify:
- `card-hero` stacks full-width (already `grid-column: 1 / -1`)
- `stat-strip` items wrap into fewer columns
- `cards-grid--asymmetric` collapses to single column
- `card-compact` items stack vertically
- All existing card layouts still work

- [ ] **Step 4: Check light mode**

Toggle to light mode. Verify:
- `card-hero` accent borders use light-mode accent colors (via `--accent-lime` override)
- `stat-strip` label colors use `--text-muted` which adapts in light mode
- `card-compact` backgrounds use `--surface-secondary` which adapts

- [ ] **Step 5: Check print layout**

Open print preview. Verify:
- `card-hero` and `card-compact` don't break awkwardly
- `stat-strip` is hidden (per print styles)

- [ ] **Step 6: Run Lighthouse accessibility check**

Run: `npm run dev` then use Lighthouse to check for accessibility regressions. The hero/compact/stat-strip changes use semantic HTML (heading levels, labels, values) so there should be no regressions.

- [ ] **Step 7: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: responsive and accessibility adjustments for layout variety"
```