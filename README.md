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
- **Interactive Curve**: Real-time strip view of the next 48+ months of delivery.
- **Interpolation vs Quotes**: Visual distinction between live-quoted contracts and interpolated monthly slots.
- **Sentiment Badges**: Automatic detection of Contango/Backwardation regimes.
- **Quote Table**: Granular list of every contract month, its price, and expiry code.

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
- **Lifecycle Resolution Chart**: Spread value vs. trading day chart for all years, with All / Last 5Y / Current Year toggle.

### 7. Forward Curve (Live)
- **Interactive Curve**: Real-time strip view of the next 48+ months of delivery.
- **Cal Strip Averages**: Cal 2026/2027, Summer/Winter strip averages with Avg Price, vs Front, and Structure (Contango/Back) columns.
- **Compare Curve**: Dropdown to overlay the curve from 1 Week Ago, 1 Month Ago, 3 Months Ago, or 1 Year Ago as a dashed line.
- **Contract Table Navigation**: Click any contract row to jump to the Prices tab with that contract loaded.

### 8. Daily Tracker (NG=F)
- **Full History**: NG=F fetched with `range=max` — 8,500+ sessions since 1990.
- **Main Price Chart**: High-performance NG=F front-month chart with 1M/3M/1Y/All toggles.
- **Technical Annotations**: Automatic horizontal levels for 52W High, 52W Low, and 30D Moving Average.
- **NG vs TTF Spread**: Live nominal spread tracking between US and European benchmarks.
- **Weekly Returns**: Color-coded histogram of weekly performance.
- **Upcoming Expirations**: CME-rule based calendar with real-time countdown ("Expiring in X days").
- **Return Distribution**: Statistical frequency plot of historical returns.
- **Monthly Seasonality Chart**: 12-bar average monthly return chart (green/positive, red/negative) with pos/total year count per bar.
- **Annual Performance Table**: Year, Jan Price, Dec Price, Annual Delta %, and Rank for every year since 1990.
- **Paginated Price Log**: Session-by-session history paginated at 100 rows/page with Prev/Next navigation, showing all 8,500+ sessions.

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
