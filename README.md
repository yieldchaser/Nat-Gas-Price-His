# Natural Gas Price History Dashboard

A lightweight, information-dense analytics dashboard for Natural Gas futures and spot markets. Built with Vanilla JS and Lightweight Charts for high-performance financial visualization.

---

## 📊 Dashboard Modules

### 1. Henry Hub (HH) & Dutch TTF Contracts
- **Seasonal Contract Charts**: Overlays current contract price against historical seasonal bands.
- **Compare Mode**: Interactive multi-series comparison (Shift+Click years).
- **Contract Statistics**: Dynamic chips showing Open, High, Low, Close, and Volume delta.
- **Instrument Switcher**: Seamlessly toggle between Henry Hub (NYMEX) and Dutch TTF (ICE) benchmarks.

### 2. Spot Prices
- **Daily Cash History**: Long-term Henry Hub spot price logging.
- **Price Statistics**: Historical distribution and range analysis for any selected year.

### 3. Spreads & Seasonality
- **Spread History**: Custom front/back leg spread builder with historical data.
- **Seasonality Heatmap**: Average calendar spread matrix (Last 5 Years) for identifying contango/backwardation patterns.
- **Term Structure**: Forward curve visualization from historical closing prices.

### 4. Forward Curve (Live)
- **Interactive Curve**: Real-time strip view of the next 72 months (Henry Hub) and 36 months (Dutch TTF) of delivery.
- **Cal Strip Averages**: Cal 2026/2027, Summer/Winter strip averages with Avg Price, vs Front, and Structure (Contango/Back) columns.
- **Compare Curve**: Overlay the active curve against 1 Week, 1 Month, 3 Months, or 1 Year ago using dashed reference lines.
- **Fallback Logic**: Robust priority chain (Live -> Historical -> Missing) ensures visual continuity during Yahoo Finance throttling.
- **Status Dashboard**: Real-time `HH: X/72 · TTF: Y/36` quoted counter with a `🟡 PARTIAL DATA` badge for low-coverage events.
- **Quote Table**: Granular list of every contract month; click any row to navigate directly to the Prices tab for that contract.

### 5. Expiry Settlement Prices
- **Settlement Matrix**: Monthly final settlement prices spanning 20+ years.
- **Relative Heatmapping**: Color-coded cells comparing prices against the filtered window's average (Green = Strong, Red = Weak).
- **YoY% Analysis**: Trailing year-over-year percentage change for every contract month.
- **Averages Row**: Cross-sectional averages for the visible window, last 5 years, and last 3 years.
- **Month Profile Chart**: Click any month label (Jan–Dec) to open a line chart of that month's expiry history across all years, with all-years avg and 5Y avg dashed lines.
- **Seasonal Bar Chart**: 12-bar seasonal expiry profile below the table, color-coded by season (winter/summer/shoulder), filterable by All/10Y/5Y/3Y.
- **Per-Cell Tooltips**: Hover any settlement price cell to see rank (#X/N all time), vs 5Y avg %, and YoY % from prior year.
- **Cross-Tab Navigation**: Click any settlement price cell to jump to the Prices tab with that contract loaded.

### 6. Spreads
- **AT-Snapshot Columns**: AT-519, AT-PENULT, AT-90D, AT-10D columns in the spread history table capture spread value at key lifecycle milestones.
- **Summary Stats Row**: All-time avg and Last 5Y avg for each column at the bottom of the spread table.
- **Lifecycle Resolution Chart**: Multi-year spread vs. trading day comparison with **interactive year pills (HH 37yr / TTF 9yr)** and a custom **T-Day range slider (T-518 to T-0)**.

### 7. Daily Tracker & Data Engine (v2.0)
- **High-Fidelity History**: Built from a 9,000+ session continuous `NG=F` foundation (1990–2026).
- **Zero-Lag Seeding**: STATE.liveData['NG=F'] is pre-seeded with historical data on first paint.
- **Resilient Data Architecture**:
  - **Proxy Rotation**: Automatic failover across multiple CORS proxies (`corsproxy.io`, `allorigins`, `codetabs`).
  - **Retry Logic**: 3-layer fetch attempts with exponential backoff.
  - **Staggered Batching**: Throttling-resistant fetching of 100+ tickers in 8-contract batches with 300ms staggers.
  - **Graceful Fallback**: Active **🟡 STALE** detection and **🟡 PARTIAL DATA** badges when API availability is compromised.
- **Institutional Analytics**:
  - **Pill-Toggle Series**: Toggleable overlays for `52W High`, `52W Low`, and `360D Average`.
  - **NG vs TTF Spread (Dynamic FX)**: Real-time nominal spread using live **EURUSD=X** conversion.
  - **Extended Ranges**: Fully synchronized presets for `1M`, `3M`, `1Y`, `2Y`, `3Y`, `5Y`, `10Y`, and `ALL`.

### 8. Data Reliability & Caching
To resolve "blank-on-refresh" issues, the dashboard implements a `localStorage` caching layer:
- **Persistence**: KPI stats and contract price points are cached for **24 hours**.
- **Instant Rendering**: Charts and data chips populate immediately from cache upon page load.
- **Freshness Indicators**:
  - `🟡 CACHED (xh ago)`: Data loaded from cache, still within 24h window.
  - `⚠️ STALE CACHE (xh ago)`: Cached data is older than 24h (better than a blank screen).
- **Background Refresh**: Live Yahoo Finance fetches run silently in the background. Once resolved, the cache is updated, and status badges are cleared automatically.
- **Optimized Footprint**: Contract history is slimmed to the latest price point for caching, keeping the `localStorage` usage < 20KB.

### 9. Prices Tab
- **X-Axis Mode Toggle**: Cal Date / T-Day segment switch to view contract price history on calendar dates or by trading day number (Day 1 to Day 519).
- **Same Month History**: Clickable rows — click any year in the sidebar to instantly load that contract into the chart (highlighted in cyan/orange).
- **Cross-Tab Navigation**: Expiry price cells and Forward Curve contract rows both navigate directly to the Prices tab with the correct contract pre-loaded.

---

## 🛠 Tech Stack & Architecture

- **UI/Layout**: HTML5 & Vanilla CSS (Mobile Responsive).
- **Charts**: [Lightweight Charts](https://github.com/tradingview/lightweight-charts) (Canvas-based).
- **Data Pipeline**: 
  - `index.html` (Logic/UI)
  - `prices-unified.js` (Metadata & Ticker logic)
  - `data/` (Historical JSON storage)
  - `build_data.py` (Local processing script for CSV → JSON)
- **Live Data**: Fetched at runtime from Yahoo Finance API with proxy-first fallback.

---

## 🚀 Running Locally

The app uses `fetch()`, so it must be served over HTTP.

```powershell
# In the project root
python -m http.server 4173
```
Then visit `http://127.0.0.1:4173`.

## 📦 Deployment
Automatic deployment via GitHub Actions to GitHub Pages on every push to `main`.
