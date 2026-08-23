# Blue Flux Dashboard

A high-performance, information-dense analytics environment for global energy markets. Built with Vanilla JS and Lightweight Charts for premium financial visualization and discrete monitoring.

---

## 💎 Design System

A curated **GitHub-dark institutional aesthetic** (the "Blue Margin" design language) tuned for information density and long sessions:

- **Layered Surfaces**: Page base `#0d1117`, cards/charts `#161b22`, raised controls `#21262d`, separated by `#30363d` borders — charts render as distinct lighter panels with faint gridlines, not black voids.
- **Blue Accent**: `#388bfd` family for interactive states, HH series, and active tabs; semantic green/red (`#3fb950` / `#f85149`) reserved for direction.
- **Typography**: Inter for UI labels, JetBrains Mono for every number.
- **Persistent Signal Strip**: A stat bar fixed beneath the navigation on every tab (see below).
- **Animated SVG Flame**: Retained brand mark on the loading screen and nav, recolored to the blue accent family.

### Signal Strip (always visible)

Six always-on market signals computed client-side, each with a full explanatory tooltip:

| Signal | Meaning |
|---|---|
| HUB FRONT | Last close of the continuous NG=F series |
| TERM STRUCTURE | Contango/backwardation % across the quoted HH forward strip |
| REALIZED VOL | 30-day annualized volatility (roll-splice guarded), regime-colored |
| ALL-TIME PCTL | Current price's percentile across all recorded sessions |
| SEASONAL Z | σ vs the same ±7-day calendar window over the last 10 years |
| FRONT EXPIRY | Days to front-month expiry (roll-pressure clock) |

Heavy stats render progressively (`…`) until full history merges, and fall back to the shipped archive when live feeds are unreachable — they never display misleading values.

---

## 📁 Repository Structure & Documentation

```
Nat-Gas-Price-His/
├── index.html                # Main application entry point & layout
├── src/                      # Source code
│   └── js/
│       └── prices-unified.js # Core financial chart & state logic
├── scripts/                  # Data pipeline scripts
│   ├── archive_contract.py   # Yahoo Finance contract ingestion & auto-archive
│   ├── build_data.py         # JSON transformer pipeline
│   └── fetch_live_quotes.py  # Parallel live quote aggregator
├── tests/                    # Test suite
│   └── test_ng_curve_depth.py# Curve depth validation script
├── docs/                     # Project documentation & engineering blueprints
│   ├── audit.md              # System audit methodology & checklists
│   ├── bugs.md               # Diagnostic bug tracking & performance analysis
│   ├── dashboard_improvements_plan.md # Historical dashboard feature specs
│   ├── errors.md             # Codebase audit category guidelines
│   ├── roadmap_chunks.md     # Feature roadmap & upgrade specifications
│   ├── step_by_step_fixes.md # Tab-by-tab enhancement tracking
│   └── tooltip_system_blueprint.md # Architecture of tooltip engine
├── data/                     # Unified data repository
│   ├── raw/                  # Offline raw archives & zip backups
│   ├── database/             # Structured CSV contracts (HH & TTF)
│   ├── hh/                   # Compiled Henry Hub JSON feeds
│   ├── ttf/                  # Compiled Dutch TTF JSON feeds
│   ├── spot/                 # Compiled EIA spot JSON feeds
│   ├── expiry_prices.json    # Settlement matrix JSON feed
│   ├── live_quotes.json      # Server-compiled live market quotes feed (< 50ms boot)
│   └── ng_continuous.json    # Continuous price series JSON feed
└── .github/workflows/        # Automated GitHub Actions pipelines
    ├── archive-contracts.yml # Daily contract archiving workflow
    ├── live-quotes.yml        # Hourly live quote refresh workflow
    ├── pages.yml             # GitHub Pages deployment workflow
    └── refresh-spot.yml      # Weekly EIA spot refresh workflow
```

---

## 📊 Dashboard Modules

### 1. Prices Tab (Market Analytics)
- **Lifecycle Traces**: Price history plotted on either a Calendar Date or T-Day axis (Day 1–519 of the contract lifecycle).
- **Next-Expiry Default**: On load, the dashboard resolves to the next expiring *active* contract (URL `?month=&year=` params still win).
- **Seasonal Band + Window Toggle**: Min/max/avg band from the last 5 completed years. Toggle to **15Y** or **All-history** bands.
- **Pre-Analysis Window**: For contracts more than 519 trading days from expiry, basic stats and candlestick charts are labeled "PRE-ANALYSIS WINDOW".
- **Asset Statistics**: Stage (with progress bar), Days to Expiry, vs Seasonal Avg, Range Position (percentile), Z-Score, High/Low/Avg, From Open %, and Status.
- **Window Metrics**: Segmented KPI grid (points, high/low/avg, spread, window Δ, vs 5Y avg, band percentile) that tracks the chart's selected window live.
- **Same Month History**: Sidebar table of all same-month contracts with final prices ranked all-time.
- **Market Switcher**: Seamlessly toggle between **Henry Hub (HUB)** and **Dutch TTF (TTF)** nodes.

### 2. Spreads Tab (Differentials)
- **Spread Builder**: Custom front/back leg calendar spread with per-year historical overlays.
- **Convergence Cone**: Finds historical analog years and shows distribution of final settlement values.
- **Butterfly Fly Builder**: 3-legged seasonal structure (Front + Back − 2×Middle) with all-time and 5Y avg reference lines.

### 3. Forward Curve Tab (Live Strip)
- **Live Strip**: Next 72 HUB months and 36 TTF months, spaced equally on a pseudo-date axis.
- **Quoted-Span Clamping**: The visible range snaps to quoted months only — sparse strips (e.g. TTF early in its listing cycle) never render mostly-empty charts.
- **Stucture Analysis**: Cal year, Summer, Winter strip averages with contango/backwardation structure metrics.
- **Compare Curve**: Overlay against 1W / 1M / 3M / 1Y ago reference curves.

### 4. Expiry Prices Tab (Settlement Matrix)
- **Settlement Matrix**: Monthly final settlement prices across 20+ years.
- **Era Drift Analysis**: Three structural era averages focusing on regime shifts: Pre-2011, 2011–2019 (Shale), 2020+ (LNG Export era).
- **Seasonal Profile**: 12-bar seasonal distribution using only settled (expired) contracts.

### 5. Daily Tracker Tab (Continuous Series)
- **Continuous HUB Series**: 9,000+ session foundation spliced with live market data.
- **HUB vs TTF Spread**: Nominal spread with live EURUSD=X conversion; hover tooltips show rolling 52W high/low and average-to-date at the hovered date.
- **Monthly Returns Heatmap**: Year × month close-to-close returns with intensity coding and per-month averages.
- **Box Plot Distributions**: Full return distribution (p5/p25/median/p75/p95) per calendar month with jittered outliers; hover any month for median, mean, IQR, and extremes.
- **Price Log Percentiles**: Each session ranked vs ALL / 10Y / 5Y / 1Y trailing windows.
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
- **Live Market Quotes Feed**: Hourly GitHub Actions workflow (`live-quotes.yml`) pre-compiles 110 active quotes into `data/live_quotes.json`, delivering instant < 50ms dashboard boot times without CORS proxy rate limits.
- **Smart Cache Policy**: Hard 3-hour `localStorage` eviction threshold ensures stale prices older than 3 hours are automatically discarded.
- **Tech Stack**: Zero-dependency frontend (Vanilla JS), Lightweight Charts (Canvas), Yahoo Finance API parallel ingestion engine.

---

## 🚀 Running Locally

```bash
python -m http.server 4173
# visit http://127.0.0.1:4173
```
