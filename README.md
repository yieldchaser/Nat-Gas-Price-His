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

### 6. Daily Tracker (NG=F)
- **Main Price Chart**: High-performance NG=F front-month chart with 1M/3M/1Y/All toggles.
- **Technical Annotations**: Automatic horizontal levels for 52W High, 52W Low, and 30D Moving Average.
- **NG vs TTF Spread**: Live nominal spread tracking between US and European benchmarks.
- **Volatility Monitor**: Realized Volatility charts (21-day and 63-day annualized).
- **Weekly Returns**: Color-coded histogram of weekly performance.
- **Upcoming Expirations**: CME-rule based calendar with real-time countdown ("Expiring in X days").
- **Return Distribution**: Statistical frequency plot of historical returns.
- **Formatted Price Log**: Clean, sortable session-by-session history.

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
