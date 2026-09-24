---
name: NetCheck
description: A black command wall that reads one connection, hop by hop, and says only what it observed.
colors:
  wall-black: "#000000"
  stealth-panel: "#0b0b0b"
  surface: "#121212"
  surface-elevated: "#1c1c1c"
  ink-primary: "#fff3e8"
  ink-secondary: "#e6d8ca"
  ink-tertiary: "#bfae9d"
  ink-quaternary: "#a08f7e"
  phosphor-orange: "#ff5a00"
  phosphor-orange-hover: "#ff7a33"
  rule-subtle: "rgba(255, 90, 0, 0.16)"
  rule-standard: "rgba(255, 90, 0, 0.34)"
  rule-deep: "#4a2a14"
  acid-green: "#39ff14"
  hazard-yellow: "#ffe600"
  alarm-red: "#ff003c"
  grade-mid-green: "#b4f59a"
  standby-grey: "#8a7d71"
typography:
  display:
    fontFamily: "Chakra Petch, Noto Sans TC Display, PingFang TC, Noto Sans TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "clamp(34px, 4.6vw, 60px)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "0.06em"
  display-en:
    fontFamily: "Chakra Petch, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "clamp(12px, 1.1vw, 15px)"
    fontWeight: 700
    letterSpacing: "0.42em"
  readout:
    fontFamily: "DSEG7, JetBrains Mono, ui-monospace, monospace"
    fontSize: "52px"
    fontWeight: 700
    lineHeight: 1.1
  readout-sm:
    fontFamily: "DSEG7, JetBrains Mono, ui-monospace, monospace"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
  title-zh:
    fontFamily: "PingFang TC, Noto Sans TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.04em"
  title-en:
    fontFamily: "Chakra Petch, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.24em"
  wordmark:
    fontFamily: "Chakra Petch, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    letterSpacing: "0.28em"
  body:
    fontFamily: "Chakra Petch, PingFang TC, Noto Sans TC, Microsoft JhengHei, Heiti TC, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.55
    fontFeature: "\"tnum\", \"zero\""
  label:
    fontFamily: "Chakra Petch, PingFang TC, Noto Sans TC, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.14em"
  data:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, PingFang TC, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0"
  cut: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
  4xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.phosphor-orange}"
    textColor: "{colors.wall-black}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 30px 8px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.phosphor-orange-hover}"
    textColor: "{colors.wall-black}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px 16px"
    height: "40px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-tertiary}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
    height: "28px"
  input:
    backgroundColor: "{colors.wall-black}"
    textColor: "{colors.ink-primary}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "9px 12px"
    height: "40px"
  status-badge:
    backgroundColor: "transparent"
    textColor: "{colors.ink-tertiary}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "3px 8px"
  nav-link-active:
    backgroundColor: "rgba(57, 255, 20, 0.06)"
    textColor: "{colors.acid-green}"
    padding: "0 16px"
    height: "60px"
  hop-card:
    backgroundColor: "{colors.stealth-panel}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.none}"
    padding: "12px 8px"
  hop-node:
    backgroundColor: "{colors.wall-black}"
    size: "20px"
  frame:
    backgroundColor: "{colors.stealth-panel}"
    rounded: "{rounded.cut}"
    padding: "16px 20px"
---

# Design System: NetCheck

## Overview

**Creative North Star: "The Crisis Command Wall"**

NetCheck is a challenger-anime command wall reading one connection. Every tab is a station: a schematic of the path on the left, a readout panel on the right, both hung in cut-corner frames on absolute black. Phosphor-orange rules draw the structure; state colour is the only other voice, and it is earned. Green means a reading passed or a station is active, yellow means warn, red means a failure that was actually observed. Anything the page cannot see sits in 待機 STANDBY: dim, hatched, never red.

The wall is dense but ordered. Headline readings are seven-segment digits, labels stack zh-TW over tracked roman caps, data is monospace. Motion is an instrument's: linear steps and short ease-outs, a scan cursor that ticks hop to hop and locks each hop to its state colour on arrival, never a bounce. Under reduced motion every animation collapses to an instant.

It rejects the category default, a stack of rounded result cards under a score donut. There are no rounded corners anywhere in the system and no light theme.

**Key Characteristics:**
- Absolute black ground, stealth panels, 1px phosphor-orange rules.
- Chamfered frames with a bright corner tick; zero border radius.
- One shared state scale (pass, warn, fail, seen, scan, standby) on every tab.
- Bilingual station labels: zh-TW over EN caps.
- Seven-segment digits for headline readings; mono for raw data.
- Two themes only: Wall and High Contrast.

## Colors

A black-glass wall with one ink (phosphor orange) and three signal colours that only ever report state.

### Primary
- **Phosphor Orange** (`phosphor-orange`): the wall's ink. Every rule, frame border, corner tick, track line, EN caps label, link, idle segment readout and the primary button slab. It also marks a hop that was observed but not judged (`seen`). Hover lifts it to `phosphor-orange-hover`.

### Secondary
- **Acid Green** (`acid-green`): pass, the active nav station, the running speed-route chaser, the scan cursor bracket, the active-metric rail, and the single focus ring for every control.
- **Hazard Yellow** (`hazard-yellow`): warn. Warn verdict frame, warn hop edge and node, warn condition lamp.

### Tertiary
- **Alarm Red** (`alarm-red`): an observed failure only. Fail hop, fail verdict and its hazard band, error messages, leak badges.
- **Grade-Mid Green** (`grade-mid-green`): the B grade on the bufferbloat readout, between green A and yellow C.

### Neutral
- **Wall Black** (`wall-black`): page ground, nav strip, inputs, empty node fill. Also the ink on the orange slab.
- **Stealth Panel** (`stealth-panel`): every frame and hop card fill.
- **Surface / Surface Elevated** (`surface`, `surface-elevated`): skeleton shimmer and the tooltip only.
- **Ink tiers** (`ink-primary` to `ink-quaternary`): warm off-white text, stepped down for secondary copy, labels, and placeholders.
- **Rules** (`rule-subtle`, `rule-standard`, `rule-deep`): orange at 16% for dividers and dashed row rules, 34% for frame borders and buttons, solid deep brown for scrollbar thumbs and tag outlines.
- **Standby Grey** (`standby-grey`): unobservable readings, always paired with the 135° hatch.

### High Contrast theme
`[data-theme="contrast"]` keeps the wall and lifts it: ink tiers go to #ffffff through #dcdcdc, rules become opaque greys (#6b6b6b subtle, #b5b5b5 standard, #ffffff solid), orange brightens (brand #ff7a1a, accent #ff8a33), standby goes to #d0d0d0, panels drop to pure black, scanlines turn off and the hatch goes opaque. Green, yellow and red do not change. No other theme exists; any stored value other than `contrast` resolves to the Wall.

### Named Rules
**The Earned Red Rule.** Red appears only on a failure that was observed. Unknown is standby grey with a hatch, never red, never yellow.

**The One Ink Rule.** Structure is orange. Green, yellow and red are reserved for state and focus; no decorative use.

## Typography

**Display Font:** Chakra Petch 500/700 (falls back to the CJK stack)
**CJK Title Face:** "Noto Sans TC Display" 900, a 4 KB subset of the tab-title glyphs only
**Data Font:** JetBrains Mono 400/700
**Readout Font:** DSEG7 Classic Bold (falls back to JetBrains Mono)

**Character:** A squared, techno sans for the wall's voice, a hard mono for raw data, and a seven-segment face for the numbers that matter. Chinese sets in the system CJK face, except the tab titles, which use the heavy subset.

### Hierarchy
- **Display** (900, clamp(34px, 4.6vw, 60px), 1.05): the zh-TW tab title only. Its glyphs come from the Noto Sans TC Display subset; a new character in a title falls back to the system CJK face (`--font-cjk`), so re-subset the font when a title changes.
- **Display EN** (700, clamp(12px, 1.1vw, 15px), 0.42em, uppercase, orange): the English line under the tab title.
- **Readout** (DSEG7 700, 52px; 28px small, 22px under 720px): headline readings such as fastest resolver latency, download, upload, grades. Placeholder is `---` in standby grey, never zeros.
- **Title** (zh 700 16px over EN 700 11px 0.24em caps): frame titles. Hop and route keys use 18px zh over 11px EN; readout labels 13px over 11px.
- **Body** (Chakra Petch, 14px, 1.55, tabular and slashed-zero numerals): prose, capped at 68 to 72ch.
- **Label** (700, 11 to 13px, 0.12 to 0.16em, uppercase): badges, state lamps, info labels, buttons, units.
- **Data** (JetBrains Mono 400, 12 to 13px): IPs, ASNs, hop readings, header values, inputs.

### Named Rules
**The Stacked Station Label Rule.** Titles, nav tabs, frame titles, hop and route keys and readout labels always show both languages, zh-TW set large over tracked EN caps, built by `setBilingual` into `.bi-zh` / `.bi-en`. Only the active language is exposed to assistive tech.

**The One Locale Rule.** Badges, state lamps, status tags and buttons show only the active locale via `t()` and re-render on locale change. CSS-generated text switches with `:lang(zh-TW)`.

## Layout

A 1320px max container, 24px gutters (16px under 768px). Each tab opens with a bilingual title block over a subtle rule (32px below), then a station: a two-column grid, schematic 2fr and readout panel 1fr (min 300px), 16px gap. Supporting frames follow in an auto-fit grid of min 340px columns, 16px gap. Inside frames, the rhythm is 16px by 20px padding with 1px subtle dividers between sections.

**DNS path.** Five hops (You, Router, ISP, Resolver, Edge) share a three-row grid: labels above, a 40px track row, labels below. Hops alternate: odd hops hang their card above the track, even hops below, each tied to its 20px node by a 36px leader line in the hop colour. The track is a 1px orange line from first node to last.

**Speed route.** The same grammar with two ends (You, Server): 20px nodes on a 1px track, keys hanging below, distance printed mid-track.

**Responsive.** At 1024px and below the station stacks and the readout panel moves first, so the verdict and the Run button precede the path. At 1000px and below the nav tabs become a fixed bottom bar. At 720px and below the path becomes a vertical rail: nodes in a 28px left column, every hop card to the right with a left state edge, leader lines removed; the scan cursor travels vertically. Touch targets are 44px minimum under 768px.

## Elevation & Depth

Flat. Depth comes from layering black on stealth panels, orange rules, and texture, not from shadows. The only shadow in use is a large black drop (`0 12px 32px rgba(0,0,0,0.75)`) under floating layers: the export menu and the tooltip.

Texture carries the atmosphere: a scanline glass (orange at 5%, 1px every 3px) on the schematic, route, ad-block categories and header list; a 135° hatch on anything standby, disabled, or empty.

### Named Rules
**The Flat Wall Rule.** Frames sit flat on the wall. Shadows exist only for things that float above it.

## Shapes

No radius anywhere; every radius token is 0. Frames (cards, schematic, readout panel, suggestion cards) are chamfered: a 12px cut at top-right and bottom-left via clip-path, the cut drawn back in with a 1px diagonal so the rule stays continuous, and a 14px orange corner tick (2px) in the square top-left corner. Nodes, dots and lamps are squares. The primary button has an 8px cut at the bottom-right and a hazard-stripe tab at its right end.

## Components

### Buttons
Bracketed, uppercase, tracked labels.
- **Shape:** square, 40px min height (44px on touch widths).
- **Primary:** the launch key. A solid orange slab with black label, 8px bottom-right cut, and a 14px black diagonal-stripe tab on the right edge. Used for Run on each station.
- **Secondary:** transparent with a 1px standard orange-tinted rule; hover brings a full orange rule and a 7% orange wash.
- **Ghost:** borderless, tertiary ink, 28px.
- **Disabled:** quaternary ink, subtle rule, hatched.
- **Focus:** a 2px acid-green outline, offset 2px, on every control.

### Chips / Badges
- **Status badge:** square readout tag, 1px rule, uppercase label type. With `data-state`, both text and rule take the state colour. Standby is grey and hatched.
- **Weight tag:** outline only so it never reads as a state; high weight is orange.

### Cards / Containers
- **Corner Style:** chamfered, 12px cut, corner tick.
- **Background:** stealth panel.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px standard rule; headers divided by a 1px subtle rule.
- **Internal Padding:** 14 to 16px by 20px.

### Inputs / Fields
- **Style:** black field, 1px standard rule, mono text, block caret in acid green.
- **Focus:** the rule turns full orange; the green focus ring applies on keyboard focus.
- **Select:** same field with an orange chevron.

### Navigation
A sticky black strip with an orange bottom rule, 60px tall. Wordmark in 700 caps at 0.28em. Tabs are bilingual station keys separated by subtle vertical rules. Hover washes orange; the active tab turns green with a 3px green bar on the rule. Under 1000px the tabs move to a fixed bottom bar with icons, and the active bar sits on top.

### Hop Card and Node (signature)
Each hop is a framed card: stealth fill, 1px subtle rule, and a 2px edge in the state colour facing the track, on top for the upper row and on the bottom for the lower row. It holds the bilingual key, a mono reading, and a state tag. The 20px square node on the track is filled with the state colour once locked. Unread and standby hops share one state: black, hatched, dashed node. On mobile the cards sit on a vertical rail with a 2px left state edge.

### State Scale (signature)
`[data-state]` sets `--hop-color` everywhere: pass → green, warn → yellow, fail → red, seen → orange, scan → primary ink, standby → standby grey. Hop cards and nodes, condition lamps, test dots, readouts, status badges, route and snapshot scores all read it. There is no per-tab palette.

### Scan Cursor
A 40px four-corner bracket in acid green that steps hop to hop (`steps(4)`, 280ms) and blinks in two steps. Hops lock strictly in path order, and the cursor leaves when every hop has locked. The speed route marches a green chaser in hard steps while bytes are in flight.

### Readout and Condition Row
A readout is a bilingual label over a seven-segment value and a unit in label caps; with a state it takes the state colour, standby hatched. A condition row is a label, a segmented bar (ten 4px cells; a three-cell lamp for pass/warn/fail checks) and a state tag.

### Verdict Panel
The answer before the evidence: a panel whose rule, icon box and grade take the verdict colour. Only a fail verdict carries the red/black hazard band along its top.

## Do's and Don'ts

### Do:
- **Do** route every state through `[data-state]` and `--hop-color`; the same six states on every tab.
- **Do** mark anything unobservable as standby: grey, hatched, dashed, with `---` placeholders rather than zeros.
- **Do** stack zh-TW over EN caps on titles, tabs, frame titles, hop/route keys and readout labels via `setBilingual`, and show badges, lamps and buttons in the active locale only via `t()`.
- **Do** write zh-TW copy with 您, without em dashes, using 解析器, 探測, 公共解析器, 觀察 and 本站.
- **Do** keep motion to linear steps and short ease-outs, and let reduced motion collapse it.
- **Do** re-subset "Noto Sans TC Display" when a tab title gains a new character.
- **Do** keep High Contrast working for every new component; it is one of only two themes.

### Don't:
- **Don't** use red for anything but an observed failure, and don't use the red hazard band outside a fail verdict (the black stripe tab on the primary button is a separate device).
- **Don't** round a corner. Radius is 0; frames are cut, not curved.
- **Don't** add a third theme or a light mode.
- **Don't** give a component its own state palette.
- **Don't** use bounce or overshoot easing.
- **Don't** load Chakra Petch weights other than 500 and 700; other weights synthesize.
