# Natural Gas Price History Dashboard

A lightweight, information-dense analytics dashboard for Natural Gas futures and spot markets. Built with Vanilla JS and Lightweight Charts for high-performance financial visualization.

---

## Dashboard Modules

### 1. Prices Tab — HH & TTF Contracts

- **Lifecycle Chart**: Price history plotted on either a Calendar Date or T-Day axis (Day 1–519 of the 519-trading-day contract lifecycle)
- **5Y Seasonal Band**: Min/max/avg band from the last 5 **completed** contract years (excludes current year to avoid self-reference). Dynamically shows actual contributing year count (e.g. "3Y avg") when fewer than 5 years exist
- **Pre-Window View**: Contracts more than 519 trading days from expiry are outside the lifecycle analysis window. They show a candlestick chart on a calendar-date axis with basic stats, labeled "PRE-ANALYSIS WINDOW"
- **Contract Statistics**: Trading Days (with progress bar), Days to Expiry (calendar days remaining), Trading Days Elapsed, vs NY Seasonal Avg, Range Position (percentile), High/Low/Avg, From Contract Open %, Status
- **Same Month History**: Sidebar table of all same-month contracts with expiry prices ranked all-time
- **T-Day Filter**: Slider to restrict chart and viewport to the last N trading days
- **Compare Mode**: Multi-series overlay (Shift+Click years)
- **Instrument Switcher**: Toggle between Henry Hub (NYMEX, USD/MMBtu) and Dutch TTF (ICE, EUR/MWh)

### 2. Spreads Tab

- **Spread Builder**: Custom front/back leg calendar spread with per-year historical overlays
- **Spread Statistics**: AT-519, AT-PENULT, AT-90D, AT-10D milestone columns; all-time avg and 5-completed-year avg footer rows
- **Seasonality Heatmap**: Average calendar spread matrix across the last 5 completed years for identifying contango/backwardation patterns
- **Lifecycle Resolution Chart**: Multi-year spread vs. T-Day comparison with year pills and T-Day range slider

### 3. Forward Curve Tab

- **Live Strip**: Next 72 HH months and 36 TTF months, spaced equally on a pseudo-date axis
- **Price Source**: Each slot reads directly from raw live data (bypasses the lifecycle filter so far-out pre-window contracts are correctly shown as quoted)
- **Cal Strip Averages**: Cal year, Summer, Winter strip averages with vs-front delta and contango/backwardation structure
- **Compare Curve**: Overlay against 1W / 1M / 3M / 1Y ago reference curves
- **Quote Counter**: `HH: X/72 · TTF: Y/36` with PARTIAL DATA badge on low coverage
- **Quote Table**: Every contract month listed; click to navigate to Prices tab

### 4. Expiry Prices Tab

- **Settlement Matrix**: Monthly final settlement prices across 20+ years
- **5Y / 3Y Averages**: Computed from 5 or 3 **completed** years only (excludes current year and future years). Tooltips make this explicit
- **Seasonal Bar Chart**: 12-bar seasonal profile using only settled (expired) contracts — excludes current/future year prices which are live market prices, not settlements
- **Month Profile Chart**: Click any month label to open expiry history across all years with all-years and 5Y-completed avg lines
- **Heat-map**: Cell colors relative to the visible window's average
- **Per-cell Tooltips**: Rank (all-time), vs 5Y avg %, YoY%

### 5. Daily Tracker Tab

- **Continuous NG=F**: 9,000+ session foundation (1990–present) spliced with live Yahoo Finance data
- **KPI Chips**: 52W High/Low, vs 52W High/Low %, 30D Avg, YTD Δ%
- **NG vs TTF Spread**: Nominal spread with live EURUSD=X conversion
- **Monthly Seasonality**: Average monthly return heatmap
- **Annual Returns**: Year-by-year ranked return table
- **Upcoming Expiries**: Next contracts with days-to-expiry using correct NYMEX 3-biz-day rule

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

### T-Day Lifecycle Framework

Each NYMEX HH contract trades for exactly **519 trading days** before expiry:
- **T-Day 1**: ~519 trading days (~727 calendar days) before expiry — lifecycle window opens
- **T-Day 519**: expiry day (3 business days before 1st of delivery month)

T-Day positioning is anchored to expiry via `approxTradingDaysTo(date, expiry) = round(calendarDays × 5/7)`. For **active contracts** (not yet expired), all CSV row numbers are re-anchored to this formula regardless of when or how much data Yahoo returned — this corrects for pre-window rows that Yahoo includes for far-dated contracts.

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
