# Natural Gas Price History Dashboard

A lightweight, information-dense analytics dashboard for Natural Gas futures and spot markets. Built with Vanilla JS and Lightweight Charts for high-performance financial visualization.

---

## Dashboard Modules

### 1. Prices Tab — HH & TTF Contracts

- **Lifecycle Chart**: Price history plotted on either a Calendar Date or T-Day axis (Day 1–519 of the 519-trading-day contract lifecycle)
- **Seasonal Band + Window Toggle**: Min/max/avg band from the last 5 completed contract years. Toggle to **15Y** or **All-history** bands (lazy-built on first click). Dynamically shows actual contributing year count when fewer years are available
- **Pre-Window View**: Contracts more than 519 trading days from expiry show a candlestick chart on a calendar-date axis with basic stats, labeled "PRE-ANALYSIS WINDOW"
- **Contract Statistics**: Trading Days (with progress bar showing **Lifecycle Stage** vs 519-day total), Days to Expiry, Trading Days Elapsed, vs Seasonal Avg, Range Position (percentile), Z-Score, High/Low/Avg, From Contract Open %, Status
- **Same Month History**: Sidebar table of all same-month contracts with expiry prices ranked all-time
- **T-Day Filter**: Slider to restrict chart and viewport to the last N trading days
- **Compare Mode**: Multi-series overlay (Shift+Click years)
- **Instrument Switcher**: Toggle between Henry Hub (NYMEX, USD/MMBtu) and Dutch TTF (ICE, EUR/MWh)
- **Forward Return Distributions**: T-Day matched historical forward returns at +10T / +20T / +60T horizons (active contracts only)
- **Analog Year Clustering**: Top historical same-month years by normalized path similarity (RMSE), with composite median projection
- **Drawdown-by-T-Day Heatmap**: 50-T-day bucket breakdown of where historical contracts concentrated their deepest drawdowns

### 2. Spreads Tab

- **Spread Builder**: Custom front/back leg calendar spread with per-year historical overlays
- **Spread Statistics**: AT-519, AT-PENULT, AT-90D, AT-10D milestone columns; all-time avg and 5-completed-year avg footer rows
- **Seasonality Heatmap**: Average calendar spread matrix across the last 5 completed years for identifying contango/backwardation patterns
- **Lifecycle Resolution Chart**: Multi-year spread vs. T-Day comparison with year pills and T-Day range slider
- **Spread Convergence Cone**: Finds historical analog years (matching T-Day position ± price window) and shows distribution of where those analogs settled at expiry
- **Butterfly Spread Builder**: 3-legged seasonal structure (Front + Back − 2×Middle) with per-year history and all-time / 5Y avg reference lines

### 3. Forward Curve Tab

- **Live Strip**: Next 72 HH months and 36 TTF months, spaced equally on a pseudo-date axis
- **Price Source**: Each slot reads directly from raw live data (bypasses the lifecycle filter so far-out pre-window contracts are correctly shown as quoted)
- **Cal Strip Averages**: Cal year, Summer, Winter strip averages with vs-front delta and contango/backwardation structure
- **Compare Curve**: Overlay against 1W / 1M / 3M / 1Y ago reference curves
- **Quote Counter**: `HH: X/72 · TTF: Y/36` with PARTIAL DATA badge on low coverage
- **Quote Table**: Every contract month listed; click to navigate to Prices tab

### 4. Expiry Prices Tab

- **Settlement Matrix**: Monthly final settlement prices across 20+ years
- **5Y / 3Y Averages**: Computed from 5 or 3 **completed** years only (excludes current year and future years)
- **Era Drift Columns**: Three structural era averages per month — Pre-2011 (pre-shale), 2011–2019 (shale revolution), 2020+ (LNG export era) — color-coded vs the overall average to surface regime shifts
- **Seasonal Bar Chart**: 12-bar seasonal profile using only settled (expired) contracts — excludes current/future year prices which are live market prices, not settlements
- **Month Profile Chart**: Click any month label to open expiry history across all years with all-years and 5Y-completed avg lines
- **Heat-map**: Cell colors relative to the visible window's average
- **Per-cell Tooltips**: Rank (all-time), vs 5Y avg %, YoY%
- **Time Window Filter**: All / 10Y / 5Y / 3Y — adjusts both visible years and heatmap coloring baseline

### 5. Daily Tracker Tab

- **Continuous NG=F**: 9,000+ session foundation (1990–present) spliced with live Yahoo Finance data
- **KPI Chips**: 52W High/Low, vs 52W High/Low %, 30D Avg, YTD Δ%
- **NG vs TTF Spread**: Nominal spread with live EURUSD=X conversion
- **Monthly Seasonality**: Average monthly return bar chart with toggle to full **Box Plot** view (p5/p25/median/p75/p95 + outliers per calendar month)
- **Annual Returns**: Year-by-year ranked return table
- **Conditional Streak Probability Table**: After N consecutive up/down days or weeks, shows historical % next-period up, median return, and sample size — filterable by calendar month
- **Upcoming Expiries**: Next contracts with days-to-expiry using correct NYMEX 3-biz-day rule
---

## Statistical Analysis Features

All 9 features are fully implemented.

- **Seasonality Z-Score** (Prices tab): Distance of the current price from the seasonal mean in standard deviation units at the exact T-Day position. Color-coded: within 1σ = normal, ±1–2σ = notable (amber), beyond ±2σ = extreme (red). Respects the active 5Y / 15Y / All seasonal window.
- **T-Day Matched Forward Returns** (Prices tab): For each historical same-month contract, finds the price at the current T-Day (±12T window) and records forward returns at +10T, +20T, and +60T horizons. Shows median return, % positive, and sample size. Active contracts only — historical base rates, not a forecast.
- **Conditional Probability / Streak Table** (Daily Tracker tab): After N consecutive up/down days (1–5) or weeks (1–4), shows historical probability of the next period being up, median return, and sample size. Filterable by calendar month.
- **Box Plot Distributions** (Daily Tracker tab): Full return distribution (p5, p25, median, p75, p95) per calendar month with outlier dots — toggle from bar chart view with the BAR/BOX control.
- **Spread Convergence Cone** (Spreads tab): Finds historical years where the same spread traded near the current value at the same T-Day (±20T, ±$0.15 window). Shows analog year trajectories and distribution of final settlement values.
- **Seasonality Drift Detection / Era Drift** (Prices tab + Expiry tab): 5Y / 15Y / All seasonal band toggle on the lifecycle chart (lazily built). Era Drift columns on the Expiry table showing pre-shale (<2011), shale era (2011–2019), and LNG export era (2020+) averages per delivery month.
- **Analog Year Clustering** (Prices tab): Top historical same-month contract years ranked by normalized path similarity (RMSE vs trailing 90-day trajectory). Renders a lifecycle chart with faded analog overlays and a bold composite median path.
- **Butterfly Spread Builder** (Spreads tab): 3-legged seasonal structure (Front + Back − 2×Middle) with per-year lifecycle chart and all-time / 5Y avg reference lines. Defaults to Jan + Mar − 2×Feb (classic HH winter fly).
- **Drawdown-by-T-Day Heatmap** (Prices tab): 50-T-day lifecycle buckets showing average drawdown depth and concentration of max-drawdown events — reveals which lifecycle windows have historically been the most dangerous.

---

## Tooltip System

A global `data-tooltip` system covers all interactive and informational elements across every tab. Implementation uses a **single event listener** on `document` (zero per-element listeners) for minimal memory overhead and automatic support for dynamically-rendered content.

- **Architecture**: Single `#global-tooltip` div + `mouseover` delegation. Boundary-aware positioning (flips below element if no room above, clamps to viewport edges).
- **Styling**: Glassmorphism (dark background, `backdrop-filter: blur`), 0.13s fade transition, 80ms hide delay for smooth feel.
- **Coverage**: Tab navigation, all Prices/TTF/Spot stat labels (vs seasonal avg, range position, Z-score, high/low/avg, from open, status), all control buttons and segment switches across every tab, AT-519/AT-PENULT/AT-90D/AT-10D milestone headers, Forward Returns horizon columns, Drawdown Heatmap column headers, Era Drift columns, card titles for all 9 statistical features.
- **Content**: Expert-level contextual explanations — not just labels, but what each metric *means* and when it matters.

---

## Data Pipeline

### Automated Archiving (GitHub Actions)

A daily workflow (`.github/workflows/archive-contracts.yml`) keeps the contract database current with no manual steps:

1. Runs `python archive_contract.py --update` at 06:00 UTC daily
2. **Missing contracts**: auto-detects any HH or TTF contract in the 2.5-year window not yet in `Cleaned_Database/` and fetches from Yahoo
3. **Stale contracts**: detects expired HH and TTF contracts archived before expiry (fewer than 519 rows) and re-fetches now-complete history from Yahoo
4. Rebuilds all `data/` JSON files via `build_data.py`
5. Commits and pushes only if data changed

Can also be triggered manually via GitHub Actions → `workflow_dispatch`.

```
archive_contract.py --update    # full automated update (CI uses this)
archive_contract.py --auto      # archive missing contracts only
archive_contract.py NGK26       # archive a specific ticker
archive_contract.py --force NGK26  # overwrite existing CSV
```

### EIA Spot Refresh

A separate workflow (`.github/workflows/refresh-spot.yml`) runs every Wednesday and Thursday at 18:00 UTC to pull the latest EIA Henry Hub daily spot prices. The download uses a 4-attempt exponential-backoff retry to handle transient network failures.

### Build Pipeline

```
Cleaned_Database/               # raw CSVs from Yahoo Finance
  Henry Hub/Monthwise/          # NGK26.csv, NGM26.csv, etc.
  Dutch TTF/Monthwise/          # TGFK26.csv, etc.
  Henry Hub/Yearwise/           # for continuous NG=F series

build_data.py                   # CSV → JSON
  data/hh/hh_jan.json           # contract price history per month
  data/ttf/ttf_jan.json
  data/spot/spot_jan.json       # EIA Henry Hub daily spot
  data/expiry_prices.json       # last price per contract (settlement for expired, current for active)
  data/ng_continuous.json       # continuous front-month NG=F series
```

T-Day positioning is anchored to expiry via `approxTradingDaysTo(date, expiry) = round(calendarDays × 5/7)`. 

- **Anchoring Rule**: For **active contracts** and **recently expired contracts** (within a 365-day grace period), all data points are re-anchored to this formula. This ensures that T-Day 519 always represents the final settlement/expiry day, correcting for variable Yahoo data density.
- **Strict Filtering**: All contract views are strictly filtered to the **1–519 T-Day window**. This prevents "pre-window" history or post-expiry leakage from skewing the chart or statistics.
- **Legacy Contracts**: Contracts expired more than one year ago maintain their authoritative historical CSV day-counts.

---

## Caching Architecture

### Per-Ticker localStorage Cache
- Key: `live_px_v1_{ticker}` (e.g. `live_px_v1_NGK26.NYM`)
- Pre-populates `STATE.liveData` on page load so charts render immediately from cache
- Updated after each successful Yahoo fetch; `STATE.contractCache` invalidated on update
- NG=F cached separately as `live_px_v1_NG=F` (Yahoo portion only; historical foundation loaded from JSON)
- TTL: 24 hours

### Forward Curve Cache
- `fc_cache_hh` / `fc_cache_ttf`: last quoted price per ticker for the curve display

### Status Badges
- `ACTIVE — LIVE DATA`: fresh Yahoo data loaded
- `CACHED (Xh ago)`: served from localStorage, within 24h
- `STALE CACHE (Xh ago)`: cached data older than 24h

---

## Technical Notes

### NYMEX Expiry Rule
3 business days before the 1st calendar day of the delivery month. Both `estimateContractExpiry()` (T-Day anchoring) and `computeNGExpiry()` (Days to Expiry display) implement this consistently.

### 5Y Seasonal Band Definition
"5Y" always means the last **5 completed contract years** (`currentYear-5` through `currentYear-1` inclusive). The current running year is excluded to prevent the band from being self-referential — the contract being analyzed would be pulling the band toward its own trajectory. This definition is applied consistently across:
- Seasonal band chart and stats panel
- Expiry table 5Y/3Y avg columns
- Spread table 5-year avg footer row
- Lifecycle Resolution 5Y filter
- Expiry seasonal bar

### Spread T-Day Axis
The spread chart X-axis uses the **front leg's** T-Day position. Both legs are priced on the same calendar date (joined by date), ensuring no mixing of different settlement days. The crosshair label says "T-Day (front leg)" to make this explicit.

---

## Tech Stack

- **UI**: HTML5, Vanilla CSS, mobile responsive
- **Charts**: [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Canvas-based, TradingView)
- **Live Data**: Yahoo Finance v8 API, fetched at runtime with proxy-first CORS fallback and retry logic
- **No build step**: single `index.html` + static JSON files

## Running Locally

```bash
python -m http.server 4173
# visit http://127.0.0.1:4173
```

## Deployment

GitHub Actions deploys to GitHub Pages on every push to `main`. The daily archive workflow also pushes updated data to `main` automatically.
