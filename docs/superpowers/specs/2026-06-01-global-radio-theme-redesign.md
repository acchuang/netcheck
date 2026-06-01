# NetCheck Global Radio Theme Redesign

**Date:** 2026-06-01
**Reference:** https://global-radio.oilygold.xyz

## Summary

Full visual redesign of NetCheck to adopt the Global Radio design aesthetic: lime accent (#C8FF00) on near-black (#0A0A0A) background, mono+display typography, outlined pill components, flat cards with colored accent top borders. Token-first migration strategy.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Full redesign | Layout, components, interactions all refreshed |
| Theme mode | Keep dark/light toggle | User preference; light theme adapted for lime |
| Fonts | Match Global Radio exactly | Inter Variable + mono stack replace Geist + Berkeley Mono |
| Navigation | Sidebar (restyled) | 15+ tabs need sidebar; restyle to match terminal aesthetic |
| Color palette | Match Global Radio | Lime primary accent, category-colored cards |
| Execution | Token-first swap | Fastest path; most components inherit new look from tokens |

## Color Palette

### Primary Accent

| Token | Value | Usage |
|---|---|---|
| `--accent` / lime | `#C8FF00` | Primary brand, pass status, active indicators, focus rings |
| `--accent-glow` | `rgba(200, 255, 0, 0.15)` | Hover glow, focus shadows, subtle highlights |

### Backgrounds (Dark)

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0A` | Page background |
| `--bg-surface` | `#0D0D0D` | Cards, panels, sidebar |
| `--bg-elevated` | `#111111` | Hover states, elevated panels |
| `--bg-tertiary` | `#0f0f0f` | Table row dividers, subtle separators |

### Backgrounds (Light)

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#F5F5F0` | Page background (cream tint) |
| `--bg-surface` | `#FFFFFF` | Cards, panels |
| `--bg-elevated` | `#F0F0EB` | Hover states |
| `--bg-tertiary` | `#E8E8E3` | Table row dividers |

### Text (Dark)

| Token | Value | Usage |
|---|---|---|
| `--text-primary` / cream | `#E3E3D3` | Primary content, headings |
| `--text-secondary` | `#666666` | Secondary text, descriptions |
| `--text-muted` | `#4a4a4a` | Metadata, disabled text, category headers |

### Text (Light)

| Token | Value | Usage |
|---|---|---|
| `--text-primary` | `#0A0A0A` | Primary content |
| `--text-secondary` | `#555555` | Secondary text |
| `--text-muted` | `#888888` | Metadata |

### Borders

| Token | Value | Usage |
|---|---|---|
| `--border-default` | `#1a1a1a` (dark), `#e0e0d8` (light) | Card borders, sidebar borders, dividers |
| `--border-accent` | lime at varying opacity | Active indicators, category card tops |

### Category Accent Colors

Inspired by Global Radio's region cards — each feature category gets a distinct accent:

| Category | Color | Hex |
|---|---|---|
| DNS | Lime (base) | `#C8FF00` |
| TLS / Encryption | Cyan | `#00C2FF` |
| Speed / Performance | Orange | `#FF6B35` |
| Privacy / Fingerprint | Rose | `#FF4D6A` |
| Email | Purple | `#A855F7` |
| Network / Connectivity | Green | `#22C55E` |
| Security / Headers | Amber | `#FFB800` |

### Status Colors

| Status | Color | Hex |
|---|---|---|
| Pass / Good | Lime | `#C8FF00` |
| Warn / Partial | Amber | `#FFB800` |
| Fail / Bad | Rose | `#FF4D6A` |
| Info / Neutral | Muted gray | `#4a4a4a` |

## Typography

### Font Stacks

```css
--font-display: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;
--font-body: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
```

### Type Scale

| Token | Size | Weight | Usage |
|---|---|---|---|
| `--text-hero` | 3.5rem | 800 | Page hero headings (desktop: 4.5rem at 768px+, mobile: 3rem at <768px) |
| `--text-display` | 2.5rem | 800 | Section titles, large metrics (mobile: 2rem) |
| `--text-heading` | 1.5rem | 700 | Card headings (mobile: 1.25rem) |
| `--text-body` | 0.875rem | 400 | Body text |
| `--text-mono` | 0.75rem | 500 | Labels, metadata, tags (0.625rem for tiny badges) |
| `--text-label` | 0.625rem | 600 | Uppercase category labels |

### Typography Rules

- Uppercase + letter-spacing (0.06em–0.08em) on section labels and category headers
- Mono font for all metadata, labels, tags, and secondary information
- Display/inter font for headings and primary content
- Dramatic contrast between hero sizes and body sizes
- Drop all Geist-specific `font-feature-settings` — Inter uses standard kerning/ligatures via `font-variant-ligatures`

## Layout

### Structure

```
+--------------------------------------------------+
| TOP HEADER (48px, fixed, border-bottom)           |
| [logo] NETCHECK          EN  THEME  EXPORT  SHARE |
+--------+-----------------------------------------+
| SIDEBAR| MAIN CONTENT AREA                       |
| 180px  |                                         |
|        | [Hero Section]                          |
| [nav]  | [Score Cards Grid]                      |
| [nav]  | [Security Checks Grid]                  |
| [nav]  | [Detail Sections...]                     |
|        |                                         |
+--------+-----------------------------------------+
```

### Top Header
- Fixed position, `z-index: 50`
- Background: `#0A0A0A` (solid, no blur)
- Height: 48px
- Bottom border: 1px solid `#1a1a1a`
- Left: Logo (lime circle icon, 28px, SVG globe) + "NETCHECK" in mono, uppercase, lime color
- Right: Toolbar items in mono, muted color, 10px: language selector, theme toggle, export, share

### Sidebar
- Width: 180px
- Background: `#0D0D0D`
- Right border: 1px solid `#1a1a1a`
- Category headers: mono, uppercase, 8px, muted color, tracked out
- Nav items: mono, 10px, muted by default
- Active item: lime left border (2px), slight lime background tint, cream text color
- No icons — mono text labels only
- No glass, no blur, no spring animations

### Main Content
- Padding: 24px
- Grid gaps: 12px (reduced from current larger gaps)
- Vertical sections with uppercase mono section headings

## Component Specifications

### Cards

```
+-- lime 2px top border ----+
| [mono label]  DNS SECURITY|
|                            |
| [display] A+              |
| [thin progress bar]       |
| [mono metadata row]       |
+----------------------------+
```

- Background: `#0D0D0D` (dark), `#FFFFFF` (light)
- Border: 1px solid `#1a1a1a`, border-radius: 16px
- Top accent: 2px colored border matching category accent
- Padding: 20px
- No glass, no blur, no noise, no inset shadows
- Header label: mono, uppercase, 9px, muted color
- Content: display font for values, mono for metadata

### Badges / Tags / Pills

```
[ ALL CLEAR ]  [ MODERN ]  [ WARN ]
  lime border    muted       amber
```

- `border-radius: 9999px` (fully pill-shaped)
- Border: 1px solid accent color or muted
- Text: accent color or muted, mono font, 8–9px, uppercase
- Padding: 3px 10px
- No background fill (outlined style)
- Hover: subtle background tint (accent at 10% opacity)

### Progress Bars

```
[===========-------]  3px height
 lime fill    track (#1a1a1a)
```

- Height: 3px
- Border-radius: 3px
- Track: `#1a1a1a` (dark), `#e0e0d8` (light)
- Fill: category accent color (solid, no gradient)
- No glow animation on fill

### Score Rings

```
   ╭───╮
  ╱     ╲  thick border (3px)
 │  95   │  display font center number
  ╲     ╱  accent color
   ╰───╯
```

- Border thickness: 3px
- Color: category accent
- Center number: display font, 700 weight
- No gradient fill, no continuous animation — score appears with a single ease-out scale transition on mount

### Buttons

**Primary:**
- Background: `#C8FF00` (lime filled)
- Text: `#0A0A0A` (dark)
- Border: none
- Border-radius: 9999px
- Font: mono, 11px, 600 weight
- Hover: glow shadow `0 0 20px rgba(200, 255, 0, 0.3)`

**Secondary / Outline:**
- Background: transparent
- Border: 1px solid `#1a1a1a`
- Text: `#E3E3D3` (dark) or `#0A0A0A` (light)
- Border-radius: 9999px
- Font: mono, 11px
- Hover: border and text shift to lime

### Data Tables / Results

- Header row: mono, uppercase, 8px, muted, border-bottom
- Data rows: mono, 10px, cream text for values, muted for metadata
- Row separators: 1px solid `#0f0f0f` (dark), `#e8e8e3` (light)
- Status indicators: small colored pill badges

### Forms / Inputs

- Background: `#0D0D0D`
- Border: 1px solid `#1a1a1a`
- Border-radius: 9999px (pill)
- Text: Inter, cream
- Placeholder: muted
- Focus: lime border + subtle lime ring

## What Gets Removed

The following current design elements are dropped:

- **Noise texture overlay** (body::before SVG fractal noise)
- **Glass/frosted effects** (backdrop-filter: blur on cards, sidebar)
- **Violet ambient glow** (brand-colored radial gradients on body)
- **Gradient text** (.gradient-text utility)
- **Gradient progress bars** (flat solid fills instead)
- **Inset shadows** on cards
- **Translucent borders** (color-mix approach → solid #1a1a1a)
- **Spring animation** on sidebar indicator (simple border-color transition)
- **Staggered card animations** — removed (cards appear immediately, no incremental delays)
- **Geist font** CDN link

## File Changes

### Full Rewrite

| File | Lines | Changes |
|---|---|---|
| `public/css/tokens.css` | ~242 → ~200 | All design tokens rewritten: colors, spacing, radii, shadows, typography |
| `public/css/styles.css` | ~3,978 → TBD | Full component CSS rewrite (cards, sidebar, badges, progress, rings, buttons, layout, tabs) |
| `src/client/app.css` | ~611 → ~400 | Tailwind @theme block, base styles, utilities rewritten |

### Partial Edit

| File | Changes |
|---|---|
| `index.html` | Font CDN links updated (Inter + JetBrains Mono), header markup restructured |
| `src/client/theme.ts` | Light/dark token toggling adapted for new token structure |
| `src/client/app.ts` | Toolbar repositioning from bottom → top header, sidebar restyling logic |
| `src/client/components/badge.ts` | Status badge class names and color references updated per new tokens |
| `src/client/components/card.ts` | Card class names and structure updated per new card spec |
| `src/client/components/progress.ts` | Progress bar class names updated for 3px flat bars |
| `src/client/ui-utils.ts` | Animation/dom helpers adapted |

### No Changes

All files not listed above, including:
- Worker code (`src/worker/index.ts`)
- State management (`src/client/state/*`)
- Feature logic (`dns-check.ts`, `speed-test.ts`, `tls-tab.ts`, etc.)
- i18n (`src/client/locales/*`, `src/client/i18n.ts`)
- Testing (`**/__tests__/*`)
- PWA (`public/sw.js`, `public/manifest.json`)
- Config (`wrangler.toml`, `vite.config.ts`, `eslint.config.js`)

## Migration Strategy

1. **Rewrite `tokens.css`** — all design tokens in new palette
2. **Rewrite Tailwind `@theme` in `app.css`** — sync Tailwind tokens with CSS custom properties
3. **Rewrite `app.css` base styles** — remove noise/glass/glow, add new base typography
4. **Rewrite `styles.css` section by section** — layout/nav first, then cards, then badges, then forms
5. **Update `index.html`** — font CDN links, header structure
6. **Update TypeScript** — `app.ts` toolbar logic, `theme.ts`, component class names
7. **Verify each tab** — Dashboard, DNS, TLS, Speed, Email, HTTP/3, Cookie, History, AI, etc.

## Light Theme

Light theme mirrors dark with inverted surfaces:
- Cream page background (`#F5F5F0`)
- White cards (`#FFFFFF`)
- Dark text (`#0A0A0A`)
- Lime accent works unchanged on light backgrounds
- Status colors remain consistent across themes
- Category accent colors remain consistent

## Print Styles

Print styles are updated to match the new flat design:
- Hide lime accent borders and background colors
- Use black-on-white text with mono font for data tables
- Hide interactive elements (top header buttons, sidebar)
- Show full card data in simplified linear layout

## Reduced Motion

Motion support adapted for the new design:
- `prefers-reduced-motion: reduce` disables all card mount animations and score ring transitions
- Removes button hover glow transitions
- Progress bars and status indicators appear at final state without transitions
