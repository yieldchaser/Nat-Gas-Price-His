# Blue Flux Dashboard

A high-performance, information-dense analytics environment for global energy markets. Built with Vanilla JS and Lightweight Charts for premium financial visualization and discrete monitoring.

---

## 💎 Visual Identity: "The Blue Flame"

The dashboard features a curated **Blue Flux** aesthetic designed for institutional-grade reliability and discretion:

- **Animated SVG Flames**: A large, floating blue flame on the loading screen and a subtle indicator in the navigation bar symbolize the energy markets without being overtly obvious to novices.
- **Dynamic Glows**: Custom-layered SVG paths with CSS filter glows (`drop-shadow`) simulate the intense heat and stability of a natural gas burner.
- **Glassmorphism**: A dark, premium UI with blurred overlays, muted borders (`#111118`), and high-contrast typography (Inter & JetBrains Mono).
- **Custom Favicon**: A high-fidelity blue burning gas flame icon for professional tab management.

---

## 📊 Dashboard Modules

### 1. Prices Tab (Market Analytics)
- **Lifecycle Traces**: Price history plotted on either a Calendar Date or T-Day axis (Day 1–519 of the contract lifecycle).
- **Seasonal Band + Window Toggle**: Min/max/avg band from the last 5 completed years. Toggle to **15Y** or **All-history** bands.
- **Pre-Analysis Window**: For contracts more than 519 trading days from expiry, basic stats and candlestick charts are labeled "PRE-ANALYSIS WINDOW".
- **Asset Statistics**: Stage (with progress bar), Days to Expiry, vs Seasonal Avg, Range Position (percentile), Z-Score, High/Low/Avg, From Open %, and Status.
- **Same Month History**: Sidebar table of all same-month contracts with final prices ranked all-time.
- **Market Switcher**: Seamlessly toggle between **Henry Hub (HUB)** and **Dutch TTF (TTF)** nodes.

### 2. Spreads Tab (Differentials)
- **Spread Builder**: Custom front/back leg calendar spread with per-year historical overlays.
- **Convergence Cone**: Finds historical analog years and shows distribution of final settlement values.
- **Butterfly Fly Builder**: 3-legged seasonal structure (Front + Back − 2×Middle) with all-time and 5Y avg reference lines.

### 3. Forward Curve Tab (Live Strip)
- **Live Strip**: Next 72 HUB months and 36 TTF months, spaced equally on a pseudo-date axis.
- **Stucture Analysis**: Cal year, Summer, Winter strip averages with contango/backwardation structure metrics.
- **Compare Curve**: Overlay against 1W / 1M / 3M / 1Y ago reference curves.

### 4. Expiry Prices Tab (Settlement Matrix)
- **Settlement Matrix**: Monthly final settlement prices across 20+ years.
- **Era Drift Analysis**: Three structural era averages focusing on regime shifts: Pre-2011, 2011–2019 (Shale), 2020+ (LNG Export era).
- **Seasonal Profile**: 12-bar seasonal distribution using only settled (expired) contracts.

### 5. Daily Tracker Tab (Continuous Series)
- **Continuous HUB Series**: 9,000+ session foundation spliced with live market data.
- **HUB vs TTF Spread**: Nominal spread with live EURUSD=X conversion.
- **Box Plot Distributions**: Full return distribution (p5/p25/median/p75/p95) per calendar month.
- **Conditional Streak Table**: After N consecutive up/down days, shows historical probability of the next period's direction.

---

## 🛠️ Statistical Features

- **Seasonality Z-Score**: Distance from the seasonal mean in standard deviation units.
- **T-Day Matched Returns**: Records historical forward returns at +10T, +20T, and +60T horizons based on current lifecycle position.
- **Analog Year Clustering**: Top historical years ranked by path similarity (RMSE), with composite median projection.
- **Drawdown-by-T-Day Heatmap**: Reveals which lifecycle windows have historically been the most dangerous for long positions.

---

## 🛰️ Data & Performance

- **Automated Pipeline**: Daily GitHub Actions workflow (`archive-contracts.yml`) auto-detects missing data and re-archives expired contracts.
- **Caching**: Multi-layered `localStorage` cache for per-ticker performance and live curve stability.
- **Tech Stack**: Zero-dependency frontend (Vanilla JS), Lightweight Charts (Canvas), Yahoo Finance v8 API integration.

## 🚀 Running Locally

```bash
python -m http.server 4173
# visit http://127.0.0.1:4173
```
