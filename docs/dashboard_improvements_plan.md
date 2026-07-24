# Dashboard Improvements — Implementation Plan

All 9 features from `dashboard-improvements.md`, in priority order. Since everything lives in `index.html` (one monolithic file, ~7,200 lines), changes will be additive — new functions and HTML blocks appended, not overwriting existing logic. Minimal risk of regressions.

---

## Background

The dashboard is a single `index.html` with:
- **STATE** object holding all loaded data (`STATE.hh`, `STATE.liveData['NG=F']`, `STATE.seasonalCache`, `STATE.spreadCache`, etc.)
- **seasonalCache** per month, per T-day: `{ sum, count, min, max, avg }` — *no standard deviation yet*
- **`STATE.hh[month].contracts[ticker]`** — per-contract price arrays `[{d, p, date}]`
- **Daily Tracker** data: `STATE.liveData['NG=F']` — continuous front-month series `[{date, p}]`

---

## Tier 1 — Highest Priority

---

### Feature 1 — Z-Score Alongside Percentile (Prices Tab)

**Where:** `renderHHStats()` function (line ~2247), which renders the right-side stats panel on the Prices tab.

**Data needed:** Standard deviation at each T-day, computed from the same 5Y completed-year window already used by `buildSeasonalCache()`.

**Implementation:**
1. **Extend `buildSeasonalCache()`** — add `sumSq` accumulation alongside `sum/count`. After finalizing, compute `stddev = sqrt(sumSq/count - avg²)` and store it in each cache entry.  
   Same change applied to `buildTTFSeasonalCache()` and `buildSpotSeasonalCache()` for consistency.

2. **Extend `renderHHStats()`** — after computing `percentile`, compute:
   ```js
   const zScore = s.stddev > 0 ? ((last.p - s.avg) / s.stddev).toFixed(2) : null;
   ```
   Add a new `<div class="stat">` block below the existing "Range Position" stat:
   - Label: `${seasonalYLabel} Z-Score`
   - Value: `+1.8σ` format (signed, 1 decimal), colored **red** if |z| > 2, **yellow** if |z| > 1.

3. Mirror for TTF/Spot stats panels (`renderTTFStats`, `renderSpotStats`).

**Risk:** Very low — additive only, no existing logic changed.

---

### Feature 2 — Forward Return Distributions by T-Day (Prices Tab)

**Where:** New block injected into the Prices tab stats panel (`renderHHStats()`), below the existing stat rows.

**Data needed:** `STATE.hh[month].contracts` — all historical same-month contracts.

**Logic:**
```
currentDay = last.d   (current T-day of selected contract)
window = ±12 T-days
horizons = [10, 20, 60]

For each historical same-month contract (excluding currentYear):
  find the nearest data point to currentDay within ±12T
  if found, record forward returns at +10T, +20T, +60T from that point
```

**Output:** A compact stats block (3 columns for +10T / +20T / +60T), each showing: median return, % positive, and sample size *n*. If n < 5, show in muted/italic with a note.

**Label:** "T-Day Matched Historical Forward Returns" with a `(historical base rates, not forecasts)` footnote.

**Risk:** Low — read-only computation on existing data.

---

### Feature 3 — Conditional Probability / Streak Table (Daily Tracker)

**Where:** New card below `daily-annual` in the Daily Tracker tab. Rendered by a new `_renderStreakTable(data)` function called from `updateDailyTracker()`.

**Data:** `STATE.liveData['NG=F']` — 9,000+ daily sessions.

**Daily streak logic:**
```
Walk the series, compute day-over-day % change
Track consecutive up/down streaks (1–5)
For each streak length N + direction:
  count occurrences where the next day was up vs down
  record next-day returns → median, average
```

**Weekly streak logic:**
```
Aggregate daily data to weekly closes (last close of each week)
Walk weekly series, compute week-over-week changes
Track 1–4 consecutive up/down weeks
```

**Table layout:** Two sub-tables (Daily / Weekly) side-by-side. Columns: Streak, Direction, N (samples), Next ↑ %, Next ↓ %, Median Next Return, Avg Next Return.
- Cells with N < 15 get a `*` and muted styling.
- Monthly split: a month filter dropdown showing the same table scoped to a specific calendar month.

**Risk:** Medium — complex computation but purely read-only on existing data. Output is HTML table, no chart library needed.

---

## Tier 2 — Second Priority

---

### Feature 4 — Monthly Return Box Plots (Daily Tracker)

**Where:** Replace the existing `_renderMonthlySeasonality()` bar chart rendering with a box plot, preserving the current average line as an overlay. A toggle button switches between "Bar" and "Box" view.

**Data:** Same `monthReturns[i]` arrays already computed in `_renderMonthlySeasonality()`.

**Box plot computation** (pure JS, no D3 needed):
```
sort returns per month
p5  = returns[floor(0.05 * n)]
p25 = returns[floor(0.25 * n)]
p50 = returns[floor(0.50 * n)]
p75 = returns[floor(0.75 * n)]
p95 = returns[floor(0.95 * n)]
outliers = points < p5 or > p95
```

**Rendering:** Pure CSS/SVG inline. Each column gets a vertical box (p25–p75 rect, median line, whiskers to p5/p95, individual outlier dots). The average bar from the current chart overlaid as a semi-transparent line.

**Risk:** Medium — complex SVG rendering but self-contained.

---

### Feature 5 — Spread Convergence Cone (Spreads Tab)

**Where:** New card appended below the existing Spreads tab history chart.

**Data:** `STATE.spreadCache` and all historical spread computations for the same pair.

**Logic:**
```
For current spread pair (frontMonth / backMonth):
  currentTDay = last.d of the current spread series
  currentValue = last spread value
  
  For each historical year of the same pair:
    find the point at currentTDay ± 20 trading days
    if spread value at that point is within ±0.15 of currentValue:
      this year is an analog
      record: (a) its trajectory from currentTDay to expiry, (b) its final settlement value
```

**Output:**
- Histogram / distribution of final settlement values for analog years
- Median settlement highlighted
- Analog year trajectories as faded overlay lines on a small lifecycle chart (using LightweightCharts)
- "$X of $Y value window, ±Z T-day window, N analogs found" displayed prominently
- If N < 4, auto-widen the window and show a note

**Risk:** Medium — requires iterating over all historical spread data, but it's already in cache.

---

### Feature 6 — Seasonality Drift Detection (Prices Tab)

**Where:**
- **Prices tab:** A new toggle in the existing chart controls: `5Y ▪ 15Y ▪ All`. Switching adds/replaces the seasonal band series on the lifecycle chart.
- **Expiry tab:** A new "Era Drift" column in the expiry table showing three era averages.

**Data needed:** Extend `buildSeasonalCache()` to build parallel 15Y and All-history seasonal caches alongside the existing 5Y one.

> [!IMPORTANT]
> The 15Y and All-history caches are expensive to compute. They will be built lazily — only when the user first clicks the toggle — and cached in `STATE.seasonalCache15y[month]` and `STATE.seasonalCacheAll[month]`.

**Drift Detection Eras:**
- Pre-2011 (pre-shale)
- 2011–2019 (shale era)
- 2020–present (LNG export era)

**Risk:** Medium — requires structural changes to the seasonal band rendering path.

---

## Tier 3 — Third Priority

---

### Feature 7 — Analog Year Clustering (Prices Tab)

**Where:** New card below the existing price chart, inside the Prices tab.

**Data:** `STATE.hh[month].contracts` — all same-month historical contracts.

**Logic:**
```
Take current contract's path: T-day 1 to currentDay, normalize: each point = (p / openPrice) * 100
For each historical same-month contract (exclude currentYear):
  normalize same T-day range
  compute correlation (or MSE) of the normalized path against current
Sort by similarity (highest correlation / lowest MSE)
Select top 3–5 analog years
```

**Output:** 
- A LightweightCharts lifecycle chart showing faded overlay lines for analog years from currentDay → T-519, plus a bold "composite median" path
- A table listing the analog years, their similarity score, and their final settlement value
- Labels on chart for each analog year
- Clear "Analog Year Composite (Historical)" disclaimer

**Risk:** Higher — requires careful normalization and chart composition.

---

### Feature 8 — Butterfly Spread Builder (Spreads Tab)

**Where:** New section in the Spreads tab (new "FLY" segment-btn alongside the existing "CALENDAR" mode).

**Data:** Reuses `getContractData()` / `getTTFContractData()` already in the system.

**Logic:**
```
Fly = Front + Back − 2×Middle
Computed per T-day using same date-matching logic as computeSpread()
```

**UI:** Three dropdowns (front / middle / back month) + year selector. Renders a lifecycle chart using the same T-day axis. Same stats panel as existing spreads: all-time avg, 5Y avg, milestones AT-519 and AT-PENULT, per-year ranking table.

Default: Jan + Mar − 2×Feb (the classic HH winter fly).

**Risk:** Medium — reuses existing spread infrastructure.

---

### Feature 9 — Drawdown-by-T-Day Heatmap (Prices Tab)

**Where:** New card below the Forward Return Distributions block in the Prices tab stats panel.

**Data:** `STATE.hh[month].contracts`.

**Logic:**
```
For each historical same-month contract:
  walk the series tracking runningPeak = max(p seen so far)
  drawdown[d] = (p - runningPeak) / runningPeak * 100
  record maxDrawdown = min(drawdown[d]) and at which T-day it occurred

Aggregate across all contracts:
  for each T-day bucket (T1-50, T51-100, T101-150, ..., T451-519):
    avgDrawdownDepth = mean of drawdown[d] values at that bucket
    pctContractsMaxHere = % of contracts whose maxDrawdown T-day falls in this bucket
```

**Output:** A horizontal bar chart (pure CSS, no library) with 10 T-day buckets. Each bar shows avg drawdown depth; color intensity = pct of contracts with max drawdown in that bucket. Tooltip on hover.

**Risk:** Medium — computationally simple but rendering needs care.

---

## Execution Order

| Order | Feature | Reason |
|-------|---------|--------|
| 1 | Z-Score (Tier 1 #2) | Simplest change, touches `buildSeasonalCache` which everything else benefits from |
| 2 | Forward Return Distributions (Tier 1 #3) | Self-contained, uses existing contract data |
| 3 | Streak Table (Tier 1 #1) | Uses `NG=F` live series, independent of above |
| 4 | Box Plots (Tier 2 #4) | Extends existing `_renderMonthlySeasonality`, low risk |
| 5 | Seasonality Drift (Tier 2 #6) | Extends seasonal cache building |
| 6 | Spread Convergence Cone (Tier 2 #5) | Heavier but isolated |
| 7 | Analog Year Clustering (Tier 3 #7) | Complex chart overlay |
| 8 | Butterfly Builder (Tier 3 #8) | New Spreads tab section |
| 9 | Drawdown Heatmap (Tier 3 #9) | Final Prices tab addition |

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Scope for this session:** Do you want all 9 features built now, or should we focus on Tier 1 only and review before continuing?

> [!IMPORTANT]
> **Q2 — Z-Score thresholds:** The spec says "beyond ±2σ should be visually distinct." Should ±1σ also get a color (amber), or only ±2σ (red)?

> [!NOTE]  
> **Q3 — Box plot rendering:** The spec says "replace or toggle." Since the current bar chart is a compact 140px element, I'll default to adding a toggle button ("BAR ▪ BOX") which swaps the view. If you'd prefer box plot as the default, just say so.

> [!NOTE]
> **Q4 — Seasonal drift lazy-loading:** The 15Y / All-history caches will be built on first toggle click (not at startup) to keep page load fast. This means there will be a ~0.5s compute delay on first click. Is that acceptable, or should we precompute them at startup alongside the existing 5Y cache?

---

## Verification Plan

After each feature:
- Open the dashboard in a browser (GitHub Pages or local file)
- Navigate to the relevant tab
- Visually verify the new element renders (non-empty, correct labels)
- For computed values: manually cross-check 1–2 values with hand calculations on the known data
- Commit each Tier's features as a separate commit for clean rollback
