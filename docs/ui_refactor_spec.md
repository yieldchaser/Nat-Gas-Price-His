# UI Refactor Spec — Blue Flux → "Blue Margin" Design Language

**Goal:** Port the visual design system of `mcx-margins` (Blue Margin) onto
Nat-Gas-Price-His (Blue Flux) with **zero functional change**.

**Hard constraints:**
1. No JS logic changes. Only CSS values, CSS structure, and static HTML chrome.
2. All 162 runtime-generated element IDs must keep working (they will — no ID is touched).
3. All features, charts, metrics, tabs, tooltips, keyboard shortcuts survive 1:1.
4. Categorical chart palettes (per-month / per-year series colors) are DATA, not theme.
   They stay exactly as-is.
5. The flame logo/loading animation stays (brand identity) — restyled to sit in the new
   chrome, not removed.

---

## 1. Design Token Mapping (:root)

| NG token | OLD (Blue Flux) | NEW (Blue Margin) |
|---|---|---|
| --bg-primary | #0a0a0f | #0d1117 |
| --bg-card | #111118 | #161b22 |
| --bg-card-hover | #161622 | #21262d |
| --border | #1e1e2e | #30363d |
| --border-bright | #2a2a3e | #3d444d |
| --text-primary | #e8e8f0 | #e6edf3 |
| --text-secondary | #8888aa | #8b949e |
| --text-muted | #44445a | #6e7681 |
| --accent-hh | #00d4ff (cyan) | #388bfd (blue) |
| --accent-ttf | #ff8c00 | #fb8f44 |
| --accent-spot | #a78bfa | #a371f7 |
| --accent-spread | #9d4edd | #bc8cff |
| --positive | #00ff88 | #3fb950 |
| --negative | #ff4455 | #f85149 |
| --warning | #ffcc00 | #d29922 |
| --neutral | #8888aa | #8b949e |
| --chart-band | rgba(0,212,255,.08) | rgba(56,139,253,.08) |

Additions mirroring MCX:
```
--surface2:   #21262d;
--accent:     var(--accent-hh);
```
Fonts unchanged: Inter (UI) + JetBrains Mono (numeric) — same stack Blue Margin uses.
--nav-height stays 44px (JS-free value; MCX uses 52px but our nav carries live price +
freshness + brand; 48px chosen as compromise — see §3).

## 2. Component Restyle Rules

### Header (#nav)
- Surface: var(--bg-card), border-bottom 1px var(--border). Keep fixed positioning.
- Brand text color: var(--text-primary) instead of accent cyan; flame keeps its glow
  but tuned to blue #388bfd family.
- Tab buttons: MCX style — transparent background always, bottom-border indicator only,
  padding 12px 18px equivalent within 44-48px bar, active = white text + blue underline
  (NOT cyan-tinted pill).
- Live price / freshness: unchanged semantics; colors via tokens (auto-retheme).

### Cards (.card)
MCX recipe:
```
background: var(--surface);
border-radius: 8px; padding: 20px (16 desktop→20 where safe);
box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 12px rgba(0,0,0,0.15);
```
Hover: border-color rgba(56,139,253,0.4).

### Tables (global)
Adopt MCX data-table treatment on existing element selectors:
- th: background var(--surface2); padding 9px 12px; font-size 10px; uppercase;
  letter-spacing .06em; sticky top 0; box-shadow inset 0 -1px 0 var(--border).
- td: padding 9px 12px; font-size 12px; border-bottom 1px var(--border).
- Row hover: background rgba(56,139,253,0.04) + inset 2px left accent bar on first cell.
- Zebra: tr:nth-child(even) td background rgba(33,38,45,0.5).

### Buttons
- .toggle-btn/.segment-btn/.pill-btn/.zoom-btn/.series-pill: replace cyan tints with
  blue (rgba(56,139,253,…)), radius 4-6px (drop 999px pills → 4px rectangles per MCX),
  active = solid blue fill w/ white text OR blue-tinted bg + blue border (match MCX toggle).
- Range slider selection/track: white glow → blue accent.

### Tooltips (#global-tooltip, .chart-tooltip)
Border rgba(56,139,253,0.35); background #161b22 @ 0.97; text #e6edf3.

### Loading screen
Background #0d1117; bar fill blue; logo text var(--text-primary); flame recolored
outer #1f6feb / mid #388bfd / core #ffffff.

## 3. Layout Rearrangement (static HTML only)

Current: single fixed nav row [brand | tabs | spacer | live-price | freshness].

New (mirrors MCX hierarchy):
- **Row 1 — header** (sticky): brand left; live-price + freshness right (MCX puts
  updated-stamp right).
- **Row 2 — tab strip** (below header, full-width, bordered bottom): the five .tab-btn.
- Keep ONE fixed wrapper? No — implement as two stacked fixed bars using existing
  elements: #nav becomes a flex-column wrapper containing .nav-top and .tab-strip rows.
  All tab buttons remain inside `.tab-btn` class + data-tab attrs → bindings intact.
  --nav-height: 92px total (48 header + 44 strip); #main-content margin-top uses it.
  Mobile media query: collapse back to wrap behavior (existing rules target #nav —
  they keep working since #nav still exists).

No KPI stat-strip is added globally: each tab builds its own headers/KPIs at runtime;
inventing a global strip would require new JS = violates constraint 1. Instead, runtime
headers (.contract-header etc.) inherit the restyled look via tokens/CSS.

## 4. JS String Color Edits (surgical, value-only)

Only these literal swaps inside script blocks & prices-unified.js (no logic touched):

| old | new | why |
|---|---|---|
| #00d4ff | #58a6ff | accent cyan → readable blue (chart lines/labels) |
| #101114 / #0c0d10 / #111118 literals in chart layout opts | #0d1117 / #161b22 | chart canvas backgrounds match page |
| rgba(0, 212, 255,x) / rgba(0,212,255,x) | rgba(88,166,255,x) | glows/tints |
| rgba(255,255,255,…) whites | KEEP | neutral overlays fine on both themes |
| categorical palettes (#60a5fa,#34d399,#fbbf24,#f87171,#a78bfa,#fb923c,#38bdf8,#4ade80,#facc15,#f472b6,#c084fc,#2dd4bf,#fb7185,#818cf8,#a3e635,#e879f9,#22d3ee,#86efac + month maps) | KEEP | data encoding |
| positive/negative literals #00ff88/#ff4455 | #3fb950/#f85149 | semantic tokens |
| #ffc800/#ffcc00/#fbbf24 warning ambers in status contexts | #d29922 | token alignment (only where used as warning/neutral-status, not categorical) |
| #f5f7fb near-white label text | #e6edf3 | text token |
| #2b2b31 / #26272c chip bgs | #21262d | surface2 |

Everything else in JS strings: untouched.

## 5. Verification Protocol

1. `python -m http.server 4173`; headless Chromium pass: load each of 5 tabs,
   capture console errors (must equal baseline set), screenshot every tab.
2. Screenshot diff vs `_baseline.html` served copy: same data visible (values identical),
   only styling differs. Manual review of all five.
3. `python -m unittest` (tests/test_ng_curve_depth.py) must stay green.
4. Interaction smoke: market switch HH/TTF/Spot, compare toggle, window sliders,
   command palette Ctrl+K, tooltip hover.
5. Mobile viewport 390px render check.

## 6. Rollback

Single commit on branch ui/mcx-design-refactor. main untouched until user approves.
