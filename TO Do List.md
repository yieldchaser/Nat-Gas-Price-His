GENT PROMPT: Natural Gas Price History Dashboard

PROJECT OVERVIEW
Build a professional, single-file HTML/JS/CSS dashboard deployed to GitHub Pages at https://github.com/yieldchaser/Nat-Gas-Price-His. The dashboard is a web-based replacement and significant upgrade of an existing Excel workbook (NG-Price_History.xlsm) that tracks Henry Hub NYMEX natural gas futures contracts, Dutch TTF futures, Henry Hub spot prices, calendar spreads, and forward curves.
Non-negotiables on feel:

Dark theme throughout. Background #0a0a0f, card surfaces #111118, borders #1e1e2e
Zero perceived lag. Everything must compute in-memory in JavaScript. No spinners on interactions.
Data-dense but not cluttered. Every pixel earns its place.
Instant tab switching. No reloads, no fetch on tab change.
Mobile-aware but desktop-first (1280px+)
Font: JetBrains Mono or IBM Plex Mono for data, Inter for labels
Accent colors: Cyan #00d4ff for HH, Orange #ff8c00 for TTF, Green #00ff88 for positive, Red #ff4455 for negative, Purple #9d4edd for spread


TECHNICAL ARCHITECTURE
Single HTML file. All CSS, JS, chart rendering inline. No build step, no npm, no webpack. Must work as a static GitHub Pages file.
Chart library: Use lightweight-charts by TradingView (loaded from CDN https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js). It renders thousands of bars with zero lag. Do NOT use Chart.js or Plotly for the main price charts — they lag on large datasets.
Data layer:
DATA SOURCES (in priority order):

1. HISTORICAL DATA (expired + older contracts):
   - Source: User-provided CSV/JSON files committed to the repo
   - Structure: One JSON per contract month group, e.g. hh_jan.json, hh_feb.json ... hh_dec.json
   - Each file: { "NGF91": [{t: "1991-01-02", o: 2.3, h: 2.4, l: 2.2, c: 2.3}, ...], "NGF92": [...], ... }
   - Also: ttf_jan.json ... ttf_dec.json (2018+)
   - Also: spot_jan.json ... spot_dec.json (1997+, EIA Henry Hub daily)
   - Expiry prices: expiry_prices.json — { "2010": { "Jan": 5.814, "Feb": 5.274, ... }, ... }

2. LIVE/FORWARD DATA (active + forward contracts):
   - Yahoo Finance v8 API: https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}?interval=1d&range=max
   - Ticker format: NGK26.NYM (NYMEX NG futures)
   - TTF format: TGK26.NYM (verify) or use Yahoo search for confirmed TTF tickers
   - Fetch ALL currently active contracts on page load: Apr 2026 → Jun 2031 (confirmed working)
   - Merge with historical: if contract exists in JSON AND Yahoo, Yahoo data takes precedence for dates after the JSON's last date
   - CORS: Use a CORS proxy prefix if needed: https://corsproxy.io/?
   - Cache all fetched data in sessionStorage keyed by ticker

3. SPOT PRICE LIVE:
   - Yahoo Finance: NG=F (continuous front month) as a proxy for current spot reference
   - Or fetch via the Yahoo v8 endpoint for NG=F

DATA INITIALIZATION FLOW:
1. On page load: fetch all historical JSON files in parallel (Promise.all)
2. Simultaneously: fetch all active Yahoo contracts in parallel (Promise.all, max 70 concurrent)  
3. Merge datasets per contract
4. Store everything in a global DATA_STORE object in memory
5. Once complete: hide loading overlay, render default view
6. Total load time target: under 3 seconds on normal connection

NAVIGATION STRUCTURE
Top navigation bar (fixed, dark, thin):
[⚡ NG PRICE HISTORY]    [HH CONTRACTS] [TTF CONTRACTS] [SPOT] [SPREAD ANALYSIS] [FORWARD CURVE] [EXPIRY PRICES] [DAILY TRACKER]
                                                                                              [LIVE: $X.XXX ▲+0.X%] [Last Updated: HH:MM]
All tabs render into a single #main-content div. Tab switching is pure JS classList toggle — no fetch, no delay.

TAB 1: HH CONTRACTS (Default tab)
This is the core feature. Mirrors the HH Chart sheet but massively upgraded.
Layout:
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTRACT SELECTOR                                                           │
│  [Year dropdown: 1991–2033] [Month dropdown: Jan–Dec] [T-Day Range: slider] │
│                                                                              │
│  NGZ26 — DEC 2026 ──────────────────────── $4.722 │ +2.3% from open        │
│  High: $5.12  Low: $1.89  Avg: $3.44  │  5Y Avg: $3.91  5Y Max: $5.60  5Y Min: $2.11 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────── 70% ─┐
│                                                                              │
│   PRICE CHART (TradingView lightweight-charts, candlestick or line toggle)  │
│                                                                              │
│   • Selected contract: colored line (cyan #00d4ff)                          │
│   • 5-Year Seasonal Range: shaded band (min to max across same trading days │
│     for past 5 years of same month contract)                                │
│   • 5-Year Average: dashed line through the band                            │
│   • X-axis: Trading Day Number (1 to 519) OR Calendar Date (toggle)         │
│   • Y-axis: Price in $/MMBtu                                                │
│   • Crosshair tooltip: Day #, Date, Price, vs 5Y avg (delta + %)           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──── 30% ──────────────────────────┐
│  CONTRACT STATISTICS              │
│                                   │
│  Trading Days Elapsed: 243 / 519  │
│  Progress bar (cyan fill)         │
│                                   │
│  Current vs 5Y Average:           │
│  ▲ +8.2% above seasonal avg      │
│                                   │
│  Current vs 5Y Range:             │
│  ▓▓▓▓▓▓░░░░  62nd percentile     │
│                                   │
│  Days to Expiry: 247              │
│  Expiry Date: Nov 26, 2026        │
│                                   │
│  YTD Change: +18.3%               │
│  From Contract Open: +142%        │
│                                   │
│  CONTRACT STATUS:                 │
│  [ACTIVE - LIVE DATA]             │
│  or [EXPIRED - HISTORICAL]        │
│                                   │
│  ─────────────────────────────    │
│  QUICK CYCLE NAVIGATOR            │
│  [◀ Prev Contract] [▶ Next]       │
│                                   │
│  SAME MONTH HISTORY TABLE         │
│  Year │ Expiry $ │ Δ vs Prior     │
│  2026 │ (live)   │  -             │
│  2025 │ $3.514   │ +12.3%        │
│  2024 │ $3.431   │ -3.2%         │
│  2023 │ $2.706   │ -             │
│  ... (all years, scrollable)      │
└───────────────────────────────────┘
T-Day Range Selector: A horizontal slider (25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 518) that zooms the chart to show only the last N trading days of the series. Updates chart instantly on slider move.
Trading Day vs Calendar Date toggle: Toggle button top-right of chart. When in Trading Day mode, X-axis shows "Day 1, Day 2..." allowing perfect seasonal overlay across years regardless of weekends/holidays.
Year/Month change: When user changes year or month, chart re-renders in <50ms from memory. No fetch.

TAB 2: TTF CONTRACTS
Identical structure to Tab 1 but for Dutch TTF. Same controls, same chart layout.

Data available from 2018 (historical JSON) + active contracts from Yahoo
Price in EUR/MWh (note unit difference from HH which is USD/MMBtu)
Accent color: Orange #ff8c00
5Y range only computes where data exists (2018+), clearly labeled


TAB 3: SPOT PRICE
EIA Henry Hub daily spot price. Source: historical JSON + Yahoo NG=F as live proxy.
Layout:
Same chart structure as Tab 1 but:
- No contract selector (spot is continuous)
- Year selector only (show full year at a time)
- Month selector = highlight that month's data on the full-year chart
- 5Y seasonal range computed the same way
- Additional panel: Rolling 30D, 90D, 1Y averages shown as horizontal lines
- Spike detection: Any day >2 std deviations highlighted with a dot on the chart
Notable spike annotation: The Jan 2024 Polar Vortex spike ($14+ spot) should be auto-annotated. Any reading >3x 5Y avg gets a flame emoji annotation on the chart.

TAB 4: SPREAD ANALYSIS
This is the crown jewel. Mirrors and upgrades the Spread Info sheet.
Layout:
┌─────────────────────────────────────────────────────────────────┐
│  SPREAD SELECTOR                                                 │
│  Front Month: [Jan ▼]  Back Month: [Feb ▼]  → "JAN / FEB SPREAD"│
│  Analysis Year: [2026 ▼]  Reference: T-Day [489]               │
│                                                                  │
│  SPREAD TYPE: [Calendar ▼] [Cross-Market: HH vs TTF] (toggle)  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────── SPREAD CHART (70%) ─────────────────┐
│  Line chart of spread value (front - back) over trading days    │
│  Show: Selected Year + All historical years (thin gray lines)   │
│  Highlight: Selected year in cyan, current year in white        │
│  Zero line: dashed white                                        │
│  Backwardation zone: above 0, shaded green                      │
│  Contango zone: below 0, shaded red                             │
└─────────────────────────────────────────────────────────────────┘

┌──── HISTORICAL SPREAD TABLE (30%) ──────────────────────────────┐
│  Year │ T-Day │ 90D │ 10D │ Penult │ Max  │ Min  │ Avg          │
│  2026 │  0.18 │0.22 │0.15 │  0.09  │ 0.45 │-0.12 │ 0.21        │
│  2025 │  0.31 │0.28 │0.19 │  0.14  │ 0.67 │ 0.02 │ 0.33        │
│  ... (all years 1999-2026)                                       │
│                                                                  │
│  ─────────────────────────────────────────────────────────────  │
│  AVERAGES ROW (bold):                                            │
│  All Yrs │ Last 10Y │ Last 5Y │ Last 3Y                         │
└─────────────────────────────────────────────────────────────────┘

┌──── SPREAD HEATMAP ─────────────────────────────────────────────┐
│  12x12 grid: All month pairs (Jan/Feb, Jan/Mar, ..., Nov/Dec)   │
│  Color: Green = backwardation avg, Red = contango avg           │
│  Click any cell → loads that spread into the main chart         │
│  This is a NEW feature not in the Excel                         │
└─────────────────────────────────────────────────────────────────┘
Cross-Market Spread (NEW — not in Excel):
Toggle switches from Calendar Spread to HH vs TTF Spread. Shows the arbitrage spread between Henry Hub and TTF for equivalent contract months. Unit conversion auto-applied ($/MMBtu ↔ EUR/MWh using approximate factor of 3.412 * EUR/USD). Shows where the spread is historically wide or tight.

TAB 5: FORWARD CURVE
Visual representation of the full futures curve, updated live.
Layout:
┌─────────────────────────────────────────────────────────────────────────────┐
│  AS OF: [Date] ──── LIVE FORWARD CURVE ────────────────────────────────────│
│                                                                              │
│  Bar/Line chart: All 69 active contracts (Apr 2026 → Jun 2031)             │
│  X-axis: Contract month                                                      │
│  Y-axis: Price $/MMBtu                                                       │
│                                                                              │
│  Color coding:                                                               │
│  • Winter contracts (Nov/Dec/Jan/Feb): Blue bars                            │
│  • Summer contracts (May/Jun/Jul/Aug): Orange bars                          │
│  • Shoulder (Mar/Apr/Sep/Oct): Gray bars                                    │
│                                                                              │
│  Overlay: Same-date curve from [1 week ago / 1 month ago / custom date]    │
│  This shows curve shifts over time — NEW feature                            │
│                                                                              │
│  Tooltip: Contract name, price, vs prior snapshot delta                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  CURVE SHAPE METRICS:                                                        │
│  Contango Level: [Mar26/Dec26 spread: +$1.50]                               │
│  Winter Premium: [Dec26 vs Summer avg: +$1.43]                              │
│  Curve Steepness: [1Y slope]                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
Below the main curve, a secondary panel: Curve History — shows how today's full curve compares to the curve at same time last year. Line chart with two curves overlaid.

TAB 6: EXPIRY PRICES
Clean reference table. Mirrors Expiry Price sheet.
Layout:
┌─────────────────────────────────────────────────────────────────────────────┐
│  HH CONTRACT EXPIRY SETTLEMENT PRICES  [$/ MMBtu]                          │
│                                                                              │
│  Reference Period: [All Years ▼] [Last 5Y ▼] [Last 3Y ▼] (filter buttons) │
└─────────────────────────────────────────────────────────────────────────────┘

        2010   2011   2012  ...  2025   2026   AllYr  5Y Avg  3Y Avg
Jan     5.81   4.22   3.08  ...  3.51   4.69*   3.71   3.29    3.60
Feb     5.27   4.32   2.68  ...  3.54   7.46*   3.82   3.41    3.72
...
Dec     4.27   3.36   3.70  ...  4.42   (live)  3.95   3.56    3.71

Avg Yr  4.18   3.97   2.89  ...  3.38   —

* = current year, in-progress (lighter text)
Color coding per cell: Green if above 5Y avg, Red if below. The delta is subtle — background tint, not garish.
Click any cell: opens a mini modal with a sparkline showing that specific month's expiry price history across all years.

TAB 7: DAILY TRACKER
Mirrors the Daily NG Prices sheet. Live front-month tracker.
Layout:
┌──────────────────────────────────────────────────────────────────────────────┐
│  FRONT MONTH DAILY TRACKER                                                   │
│  Current Contract: NGK26 (May 2026) │ Expiry: Apr 28, 2026 │ 34 days left  │
│  Open: $2.904  │  Last: $2.919  │  Day Δ: +0.5%  │  Week Δ: -2.3%         │
└──────────────────────────────────────────────────────────────────────────────┘

┌──── PRICE LOG TABLE ────────────────────────────────────────────────────────┐
│  Date       │ Open   │ Close  │ Day Δ%  │ Week Δ%  │ Week# │ Contract      │
│  2026-03-24 │ 2.904  │ 2.919  │ +0.52%  │  -2.31%  │  49   │ NGK26        │
│  2026-03-23 │ 2.880  │ 2.904  │ +0.83%  │   —      │   —   │ NGK26        │
│  ... (scrollable, most recent first)                                        │
│  (Weekend rows: grayed out, marked "CLOSED")                                │
└─────────────────────────────────────────────────────────────────────────────┘

│  CONTRACT EXPIRY CALENDAR (sidebar)                                          │
│  ─────────────────────────────────                                           │
│  NGK26  May 2026  → Exp Apr 28                                               │
│  NGM26  Jun 2026  → Exp May 28                                               │
│  NGN26  Jul 2026  → Exp Jun 26                                               │
│  ... (next 24 contracts with expiry dates)                                   │
│  + Month Code Reference: F=Jan G=Feb H=Mar J=Apr K=May M=Jun                │
│                          N=Jul Q=Aug U=Sep V=Oct X=Nov Z=Dec                │
This tab auto-fetches the latest NGK26 price from Yahoo on load and displays it live. A small "🔴 LIVE" indicator pulses when data is fresh (<1 hour old).

NEW FEATURES (not in Excel, add these)
1. Contract Comparison Mode (NEW)
On the HH Contracts tab, add a toggle: "Compare Mode". When on, user can select a second contract (different year, same month) and both plot on the same chart with different colors. Useful for comparing e.g. Dec 2026 vs Dec 2025 trajectories.
2. Spread Heatmap (NEW — described in Tab 4)
3. Cross-Market HH vs TTF Spread (NEW — described in Tab 4)
4. Curve Shift Overlay (NEW — described in Tab 5)
5. Seasonal Stats Bar (NEW)
On every chart tab, below the main chart, show a compact row:
This contract vs same-month contracts: [Percentile rank] | [Std deviations from avg] | [Historical extremes]
6. Search / Jump (NEW)
Keyboard shortcut Ctrl+K or / opens a command palette. Type "Dec 2026" or "NGZ26" → instantly jumps to that contract. Type "Jan/Mar spread" → goes to Spread Analysis with those months pre-selected.
7. Data Freshness Indicator (NEW)
Top right corner: shows timestamp of last Yahoo fetch. Color: Green (<1h), Yellow (1-6h), Red (>6h or stale).

PERFORMANCE REQUIREMENTS
CRITICAL — these are non-negotiable:

1. All JSON data files MUST be fetched once on load and stored in memory.
   Never re-fetch on tab switch or contract change.

2. Chart renders MUST complete in <100ms after user selection change.
   Pre-compute 5Y seasonal averages for ALL contracts at initialization.
   Store as: SEASONAL_CACHE[month][tradingDay] = {avg, min, max}
   This computation happens once during load, in a Web Worker if needed.

3. Use requestAnimationFrame for any animations.

4. The table in Spread Analysis (all years × all T-day metrics) must be 
   pre-computed and stored in a flat lookup object, not computed on render.

5. Lightweight-charts renders at 60fps natively. Don't fight it.
   Set autoSize: true and let it fill containers.

6. Tab switching: pure CSS display:none / display:block. No re-render.
   Exception: Lightweight-charts needs resize() called on tab show.

7. JSON data files: gzip them if possible. GitHub Pages serves gzipped.
   Target: each monthly JSON <500KB uncompressed.

FILE STRUCTURE FOR THE REPO
/
├── index.html              ← Main dashboard (everything inline except data)
├── data/
│   ├── hh/
│   │   ├── hh_jan.json    ← All Jan contracts, all years (1991-2025)
│   │   ├── hh_feb.json
│   │   ├── ...
│   │   └── hh_dec.json
│   ├── ttf/
│   │   ├── ttf_jan.json   ← All Jan contracts, years 2018-2025
│   │   └── ...
│   ├── spot/
│   │   ├── spot_jan.json  ← EIA spot, Jan, years 1997-2025
│   │   └── ...
│   └── expiry_prices.json ← Settlement prices table
├── README.md
└── .github/
    └── workflows/
        └── pages.yml      ← GitHub Pages deployment (auto-deploy on push to main)
The index.html imports lightweight-charts from CDN. Everything else is self-contained.

DESIGN SYSTEM (tell the agent exactly this)
css/* COLOR PALETTE */
--bg-primary:    #0a0a0f;
--bg-card:       #111118;
--bg-card-hover: #161622;
--border:        #1e1e2e;
--border-bright: #2a2a3e;

--text-primary:  #e8e8f0;
--text-secondary:#8888aa;
--text-muted:    #44445a;

--accent-hh:     #00d4ff;   /* Henry Hub cyan */
--accent-ttf:    #ff8c00;   /* TTF orange */
--accent-spot:   #a78bfa;   /* Spot purple */
--accent-spread: #9d4edd;   /* Spread violet */

--positive:      #00ff88;
--negative:      #ff4455;
--warning:       #ffcc00;
--neutral:       #8888aa;

--chart-band:    rgba(0, 212, 255, 0.08);  /* 5Y range band fill */

/* TYPOGRAPHY */
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;  /* All data values */
--font-ui:   'Inter', system-ui, sans-serif;             /* Labels, nav */

/* SPACING */
--card-padding: 16px;
--gap: 12px;

/* CARD STYLE */
border: 1px solid var(--border);
border-radius: 8px;
background: var(--bg-card);
transition: border-color 0.15s ease;

/* CARDS ON HOVER */
border-color: var(--border-bright);

/* NO BOX SHADOWS. Flat, dense, sharp. Like a terminal. */
Nav bar: 40px tall. Left: logo + title. Center: tab buttons (pill-style, active = cyan underline + slight bg). Right: live price + timestamp. No hamburger menu — all tabs always visible.
Chart area: Always fills available width. Height 60vh on desktop, never less than 400px.
Dropdowns: Custom-styled, dark, monospace. No browser default select styling.
Sliders: Custom CSS range inputs. Cyan thumb, dark track.
Tables: Monospace numbers right-aligned. Headers left-aligned. Row hover = subtle bg shift. Sticky header.
Loading state: Minimal — just a centered pulsing "INITIALIZING DATA..." text in the primary accent color. No spinners, no skeleton loaders.

DATA JSON FORMAT SPECIFICATION
Tell the agent the exact shape of the JSON it should expect (you will provide these files separately, but the agent must code against this schema):
json// hh_dec.json example
{
  "meta": {
    "month": "Dec",
    "month_code": "Z",
    "unit": "USD/MMBtu",
    "source": "Barchart"
  },
  "contracts": {
    "NGZ91": [
      {"d": 1, "p": 2.17},
      {"d": 2, "p": 2.34},
      ...
      {"d": 519, "p": 3.36}
    ],
    "NGZ92": [...],
    ...
    "NGZ25": [...]
  }
}
// d = trading day number (1-519)
// p = close price
// Active contracts come from Yahoo, not this file
json// expiry_prices.json
{
  "2010": {"Jan": 5.814, "Feb": 5.274, "Mar": 4.816, ...},
  "2011": {"Jan": 4.216, ...},
  ...
  "2025": {"Jan": 3.514, "Feb": 3.535, ...},
  "2026": {"Jan": 4.687, "Feb": 7.460, "Mar": null, ...}
}
json// spot_jan.json
{
  "meta": {"month": "Jan", "unit": "USD/MMBtu", "source": "EIA"},
  "years": {
    "1997": [{"d": 1, "p": 3.82}, {"d": 2, "p": 3.80}, ...],
    "1998": [...],
    ...
    "2025": [...]
  }
}

GITHUB PAGES SETUP
The agent must include a .github/workflows/pages.yml:
yamlname: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - id: deployment
        uses: actions/deploy-pages@v4

WHAT THE AGENT MUST DELIVER

index.html — Complete, functional dashboard. All CSS and JS inline. Loads from CDN only: lightweight-charts + Google Fonts + JetBrains Mono.
Data loading layer — Fetches all /data/**/*.json files on load. Falls back gracefully if a file is 404 (some months may not have JSON yet — show "Historical data pending" for those contracts, still show live Yahoo data if available).
Yahoo Finance integration — Fetches NGK26.NYM through NGM31.NYM (and equivalent TTF) on load. Handles CORS with corsproxy.io fallback. Merges with historical JSON. Stores in window.LIVE_DATA.
All 7 tabs functional — Even if data files aren't provided yet, the UI renders with "No data" states gracefully. The framework must be complete.
README.md — Explains the data file format, how to add new historical data, how to update expiry prices.
.github/workflows/pages.yml — Auto-deploy on push.


FINAL INSTRUCTION TO AGENT
Study the reference screenshots provided. The shipping dashboard (yieldchaser.github.io/Shipping), the Stratum Meridian ETF dashboards — note the density, the dark palette, the instant responsiveness. That is the bar. The natural gas dashboard must feel like it belongs in the same family of tools.
Do not cut corners on the chart interactions. Crosshair tooltips must show precise values. The 5Y seasonal band must render correctly with proper transparency. Contract switching must be imperceptible in speed.
This is a professional trading tool. It will be used for live trading decisions. Build it accordingly.
Repo: https://github.com/yieldchaser/Nat-Gas-Price-His
Deployment target: https://yieldchaser.github.io/Nat-Gas-Price-His/
Start with index.html. Make it complete. Make it fast. Make it beautiful.