# Layout Variety Design — Mixed-Size Card Grid System

**Date**: 2026-06-03
**Status**: Approved
**Goal**: Break the visual monotony of the uniform `cards-grid > card > card-header + card-body` pattern across all tabs by introducing layout variety through mixed-size cards, hero sections, stat strips, and asymmetric grids.

## Problem

Every tab uses the same card grid structure. The result is flat, undifferentiated content — no visual hierarchy, no featured content, no breathing room. The dashboard has custom layout (`dash-stat-card`, `dash-status-grid`) but every other tab is an identical card soup.

## Approach: Mixed-Size Card Grid

Add a small set of CSS layout primitives that give each tab a distinct visual shape without a full rewrite. Each tab gets a "hero" card for its primary result, compact cards or stat strips for secondary details, and asymmetric grids where appropriate.

## Layout Primitives

Four new CSS constructs added to `public/css/styles.css` (the runtime stylesheet, not `src/client/app.css`):

### `card-hero` (modifier class on `.card`)
- HTML: `class="card card-hero card-accent-lime"`
- Composed with existing `.card-accent-*` classes for the top accent border (no new pseudo-element needed)
- Full-width via `grid-column: 1 / -1` (same mechanism as existing `.card-wide`)
- Larger heading: `.card-hero .card-title` overrides to `var(--text-heading)` / 700 weight / `var(--text-primary)` color / no text-transform, no letter-spacing
- Larger padding: `.card-hero .card-header` gets `padding: var(--space-6) var(--space-6) 0` and `.card-hero .card-body` gets `padding: var(--space-6)`
- Prominent value: `.card-hero-value` for the big number display (see DOM structure below)
- Used once per tab for the primary result

### `card-compact` (modifier class on `.card`)
- HTML: `class="card card-compact"`
- Tighter padding: `.card-compact .card-header` gets `padding: var(--space-3) var(--space-3) 0` and `.card-compact .card-body` gets `padding: var(--space-3)`
- Smaller gaps between rows
- Border radius stays `var(--radius-xl)` for consistency with regular cards
- Enables 3-col grids via `cards-grid-3` (already exists) when appropriate

### `stat-strip`
- Standalone element, NOT inside a card
- HTML structure:
  ```html
  <div class="stat-strip">
    <div class="stat-item">
      <span class="stat-label">Download</span>
      <span class="stat-value">142 Mbps</span>
    </div>
    ...
  </div>
  ```
- CSS: `display: flex; flex-wrap: wrap; gap: var(--space-4) var(--space-8); padding: var(--space-3) 0;`
- `.stat-label`: `font-family: var(--font-mono); font-size: var(--text-mono-sm); font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted);`
- `.stat-value`: `font-family: var(--font-mono); font-size: var(--text-mono); color: var(--text-primary);`
- No background or border — sits inside hero cards or standalone between cards
- Can be placed inside `.card-hero .card-body` for in-hero stat rows

### `cards-grid--asymmetric` (modifier on `.cards-grid`)
- HTML: `class="cards-grid cards-grid--asymmetric"`
- CSS: `> :first-child { grid-column: 1 / -1; }` (matches existing `.card-wide` mechanism — a `card-wide` inside an asymmetric grid works naturally since both use `grid-column: 1 / -1`)
- Remaining children flow in standard 2-col grid
- On mobile (max-width: 768px), collapses to single column like existing `.cards-grid`

## Per-Tab Layout Plans

### DNS Check (Phase 2 — highest impact)
- **IP Info** → `class="card card-hero card-accent-lime"`: IP address displayed via `.card-hero-value`, location/ISP/timezone/PoP as `stat-strip` inside `.card-body`
- **DNS Resolver** → stays `card` in 2-col grid below hero
- **DNS Security** → `stat-strip` of pass/warn/fail check items (replaces the card wrapper entirely — visible inline)
- **DNSSEC / Benchmark / Lookup** → remain `card-wide` below

### Security Headers (Phase 3)
- **Grade summary** → `class="card card-hero card-accent-cyan"`: large grade letter, score fraction, pass/warn/fail counts as `stat-strip`
- **Individual header results** → `class="card card-compact"` in `cards-grid-3` grid
- **CSP Analysis** → stays `card-wide` below

### TLS Inspector (Phase 3)
- **TLS grade + protocol** → `class="card card-hero card-accent-green"` with large grade letter
- **Cipher suites / key exchange** → `stat-strip` beneath hero
- **Certificate chain** → `class="card card-compact"` list

### Ad Block Test (Phase 4)
- **Score ring** → `class="card card-hero card-accent-lime"`: enlarged ring, score in display font
- **Category tests** → `cards-grid cards-grid--asymmetric`: first category spans full width, rest in 2-col

### Fingerprint (Phase 4)
- **Uniqueness score** → `class="card card-hero card-accent-rose"` with large score ring
- **Individual tests** → `class="card card-compact"` in `cards-grid-3`

### Email Security / Cookie Audit / Breach Check / HTTP/3 / Cert Transparency (Phase 5)
- Same pattern: **main result** → `card-hero`, **detail items** → `card-compact` or `stat-strip`

### Tabs NOT modified
- **Dashboard** — already custom layout, no changes
- **Speed Test** — already has custom gauge layout, no changes
- **Network Map** — already custom (Leaflet), no changes

## CSS Specifications

All new rules go in `public/css/styles.css`, in the existing Components section (after line ~500, before the tab-specific styles).

### card-hero
```css
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
```

### card-compact
```css
.card-compact .card-header {
  padding: var(--space-3) var(--space-3) 0;
}

.card-compact .card-body {
  padding: var(--space-3);
}
```

### stat-strip
```css
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
```

### cards-grid--asymmetric
```css
.cards-grid--asymmetric > :first-child {
  grid-column: 1 / -1;
}
```

### Responsive (add to existing @media block)
```css
@media (max-width: 768px) {
  .stat-strip {
    gap: var(--space-3) var(--space-4);
  }
}
```

### Hover states
```css
.card-hero:hover {
  border-color: var(--border-hover);
}

.card-compact:hover {
  border-color: var(--border-hover);
}
```

### Print styles (add to existing @media print block)
```css
.card-hero,
.card-compact {
  break-inside: avoid;
}

.stat-strip {
  display: none;
}
```

## Implementation Phases

| Phase | Scope | Files touched |
|---|---|---|
| 1 | CSS primitives | `public/css/styles.css` |
| 2 | DNS Check tab | `index.html`, `dns-ui.ts` |
| 3 | Headers + TLS tabs | `index.html`, `headers-ui.ts`, `src/client/tabs/tls-tab.ts` |
| 4 | Ad Block + Fingerprint | `index.html`, `adblock-ui.ts`, `fingerprint-ui.ts` |
| 5 | Remaining tabs | `index.html`, tab-specific UI files |

Each phase is independently deployable. No phase touches dashboard, speed, or network map.

## Constraints
- No new CSS files — everything in `public/css/styles.css` using existing design tokens from `public/css/tokens.css`
- All CSS custom property references use the runtime tokens (`--surface-secondary`, `--border-default`, `--accent-lime`, `--space-6`, etc.), NOT the `app.css` Tailwind theme tokens
- No new JS dependencies
- Maintain i18n support (all new text uses `t()`)
- Preserve accessibility (aria attributes on new elements)
- Preserve light mode (`data-theme="light"`) — all new primitives use semantic CSS custom properties that have light-mode overrides in `tokens.css`
- Mobile responsive — stat strips wrap on mobile, asymmetric grid collapses to 1-col (existing behavior)
- Phase 1 must be deployable standalone (just CSS additions, no HTML/JS changes needed yet; existing cards render identically since new classes are additive)
- `card-hero` combines with existing `.card-accent-*` classes — no new pseudo-element needed
- `cards-grid--asymmetric` uses `grid-column: 1 / -1` for first child, consistent with existing `.card-wide` mechanism