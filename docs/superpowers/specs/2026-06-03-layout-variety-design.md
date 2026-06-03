# Layout Variety Design — Mixed-Size Card Grid System

**Date**: 2026-06-03
**Status**: Approved
**Goal**: Break the visual monotony of the uniform `cards-grid > card > card-header + card-body` pattern across all tabs by introducing layout variety through mixed-size cards, hero sections, stat strips, and asymmetric grids.

## Problem

Every tab uses the same card grid structure. The result is flat, undifferentiated content — no visual hierarchy, no featured content, no breathing room. The dashboard has custom layout (`dash-stat-card`, `dash-status-grid`) but every other tab is an identical card soup.

## Approach: Mixed-Size Card Grid

Add a small set of CSS layout primitives that give each tab a distinct visual shape without a full rewrite. Each tab gets a "hero" card for its primary result, compact cards or stat strips for secondary details, and asymmetric grids where appropriate.

## Layout Primitives

Four new CSS constructs added to `app.css`:

### `card-hero`
- Full-width card with accent top border (using `card-accent-top` pattern already in the design system)
- Larger heading: display font instead of card-title
- More vertical padding (1.5x normal card)
- Prominent value display (large number + unit)
- Used once per tab for the primary result

### `card-compact`
- Tighter padding (0.5x normal card)
- Smaller font size
- Reduced gaps between rows
- For secondary items that just show key-value pairs
- Enables 3-col grids instead of 2-col where appropriate

### `stat-strip`
- Horizontal flex row of label+value pairs
- Replaces cards that are just 3-5 key-value rows
- No card wrapper — sits inline inside hero or standalone
- Uses mono font for values, label font for labels

### `cards-grid--asymmetric`
- Grid variant where first child spans 2 columns
- Remaining children flow normally in 1-col
- Creates visual hierarchy without breaking the grid

## Per-Tab Layout Plans

### DNS Check (Phase 2 — highest impact)
- **IP Info** → `card-hero`: IP displayed in display font, location/ISP/timezone as `stat-strip` beneath
- **DNS Resolver** → stays `card` in 2-col grid below hero
- **DNS Security** → `stat-strip` of pass/warn/fail check items (no card wrapper, scannable row)
- **DNSSEC / Benchmark / Lookup** → remain `card-wide` below

### Security Headers (Phase 3)
- **Grade summary** → `card-hero`: large grade letter, score fraction, pass/warn/fail counts as `stat-strip`
- **Individual header results** → `card-compact` in tighter 3-col grid
- **CSP Analysis** → stays `card-wide` below

### TLS Inspector (Phase 3)
- **TLS grade + protocol** → `card-hero` with large grade letter
- **Cipher suites / key exchange** → `stat-strip` beneath hero
- **Certificate chain** → `card-compact` list

### Ad Block Test (Phase 4)
- **Score ring** → `card-hero`: enlarged ring, score in display font
- **Category tests** → `cards-grid--asymmetric`: first category spans 2 cols, rest in 1-col

### Fingerprint (Phase 4)
- **Uniqueness score** → `card-hero` with large score ring
- **Individual tests** → `card-compact` in 3-col grid

### Email Security / Cookie Audit / Breach Check / HTTP/3 / Cert Transparency (Phase 5)
- Same pattern: **main result** → `card-hero`, **detail items** → `card-compact` or `stat-strip`

### Tabs NOT modified
- **Dashboard** — already custom layout, no changes
- **Speed Test** — already has custom gauge layout, no changes
- **Network Map** — already custom (Leaflet), no changes

## CSS Specifications

### card-hero
```
card-hero extends card
- width: 100% (spans full grid)
- position: relative (for accent border pseudo-element)
- background: var(--color-bg-surface)
- border: 1px solid var(--color-border)
- border-radius: var(--radius-xl)
- padding: 1.5rem (vs 1rem for card)
- accent top border: 2px solid var(--color-accent)
- heading: var(--text-heading) font, 700 weight
- value: var(--text-hero) font, 800 weight, color: var(--color-accent)
```

### card-compact
```
card-compact extends card
- padding: 0.75rem (vs 1rem for card)
- gap: 0.25rem between rows
- heading: var(--text-body) font
- border-radius: var(--radius-md)
```

### stat-strip
```
stat-strip
- display: flex, flex-wrap: wrap, gap: 1rem 2rem
- each item: label (var(--text-mono-sm), uppercase, muted color) + value (var(--text-body), mono)
- no background/border — sits inside hero or standalone
- padding: 0.75rem 0
```

### cards-grid--asymmetric
```
cards-grid--asymmetric extends cards-grid
- grid-template-columns: repeat(2, 1fr) (same as base)
- > :first-child: grid-column: span 2
- > :nth-child(n+2): normal 1-col flow
```

## Implementation Phases

| Phase | Scope | Files touched |
|---|---|---|
| 1 | CSS primitives | `app.css` |
| 2 | DNS Check tab | `index.html`, `dns-ui.ts` |
| 3 | Headers + TLS tabs | `index.html`, `headers-ui.ts`, `tls-tab.ts` |
| 4 | Ad Block + Fingerprint | `index.html`, `adblock-ui.ts`, `fingerprint-ui.ts` |
| 5 | Remaining tabs | `index.html`, tab-specific UI files |

Each phase is independently deployable. No phase touches dashboard, speed, or network map.

## Constraints
- No new CSS files — everything in `app.css`
- No new JS dependencies
- Maintain i18n support (all new text uses `t()`)
- Preserve accessibility (aria attributes on new elements)
- Preserve light mode (`data-theme="light"`) — new primitives use CSS custom properties
- Mobile responsive — hero cards stack naturally, stat strips wrap, asymmetric grid collapses to 1-col on mobile
- Phase 1 must be deployable standalone (just CSS additions, no HTML/JS changes needed yet; existing cards render identically)