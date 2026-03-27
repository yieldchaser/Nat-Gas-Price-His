AGENT PROMPT: NG Price History Dashboard — v2.0 Upgrade
Repository: https://github.com/yieldchaser/Nat-Gas-Price-His
Live site: https://yieldchaser.github.io/Nat-Gas-Price-His/
You are upgrading an already-deployed, already-functional natural gas price history dashboard. Do NOT rebuild from scratch. Open the existing index.html and prices-unified.js, read and understand the full codebase first, then make surgical changes. Every change must be backward-compatible — nothing that currently works should break.

PHASE 0: MANDATORY — READ BEFORE TOUCHING ANYTHING
Before writing a single line, you must:

Fetch and read index.html in full
Fetch and read prices-unified.js in full
Fetch and read the data/ directory structure
Understand exactly how data flows: how Yahoo is fetched, how historical JSON is loaded, how charts are rendered, how tabs switch

Only after you have a complete mental model of the existing code should you begin changes. State your understanding before proceeding.

CRITICAL BUG #1 — DAILY TRACKER DATA DEPTH
Problem: The Daily Tracker (NG=F) currently only loads ~504 sessions (back to April 2024). Yahoo Finance has NG=F data going back to approximately 1990 — over 8,500 trading sessions.
Root cause: The Yahoo API call for NG=F almost certainly uses range=1y or a limited period. It must use range=max.
Fix:

Find the Yahoo Finance API call for NG=F in the codebase
Change it to range=max&interval=1d
The full URL should be: https://query1.finance.yahoo.com/v8/finance/chart/NG=F?interval=1d&range=max
After loading, the price chart should offer full history back to ~1990 with the existing 1M/3M/1Y/ALL toggles working correctly
The ALL toggle must now show the full ~35 years of data
The price log table must show all sessions (implement virtual scrolling / pagination if needed — do NOT truncate to recent data)
The weekly returns histogram must now span the full dataset
The return distribution histogram must recalculate on the full dataset
The NG vs TTF spread chart: TTF data starts ~2018 on Yahoo, so the spread chart naturally begins there — that is correct and expected, no change needed there

Verification: After fix, the price log header should read "NG=F · ~8,500+ SESSIONS" and the chart's ALL view should start circa 1990.

CRITICAL BUG #2 — PRICES TAB WINDOW SLIDER MODE
Problem: The window slider on the Prices tab operates in calendar date mode. The original Excel had a trading day number mode where the X-axis showed Day 1 through Day 519 regardless of calendar dates. This is essential for seasonal comparison — it aligns all contracts at the same point in their lifecycle.
Fix:

The existing "WINDOW" slider should have two modes toggled by a small button next to it: [CALENDAR DATE] ↔ [TRADING DAY]
In TRADING DAY mode:

X-axis shows "Day 1", "Day 50", "Day 100"... "Day 519"
The 5Y seasonal band and average are computed and aligned by trading day number
This makes the seasonal overlay meaningful regardless of which calendar year the contract belongs to


In CALENDAR DATE mode: behavior unchanged from current
Default: CALENDAR DATE (preserving current behavior)
The trading day slider range: 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 519 (matching the original Excel T-Day selector)


UPGRADE 1 — EXPIRY PRICES TAB: MAJOR EXPANSION
The current Expiry Prices tab is a heatmap table. It needs three new additions below the table. Do NOT change the existing table — add below it.
1A. Month Profile Chart (click-to-expand)
Add a click handler to every row header (Jan, Feb, Mar, ... Dec). When a user clicks a month label:

A chart panel slides open below the heatmap table (or replaces a dedicated chart zone below)
The chart is a line chart (using lightweight-charts) showing that month's expiry settlement price for every available year on the Y-axis
X-axis: years (1990 → 2025, each year as a point)
Each point is labeled with the price
A horizontal dashed line shows the All-Years average
A second horizontal dashed line shows the 5Y average
Chart title: "JAN EXPIRY HISTORY — 36 contracts" (or however many)
Color: cyan for the line, orange dashed for 5Y avg, white dashed for all-time avg
This is the single most important missing visualization from the Excel. The Excel had charts per month — this is the web equivalent.

1B. Seasonal Bar Chart
Below the month profile chart zone, add a permanent section titled "SEASONAL EXPIRY PROFILE":

A bar chart (12 bars, one per month: Jan–Dec)
Bar height = average expiry price for that month across the selected time window (All Years / 10Y / 5Y / 3Y — use the same filter buttons already at the top of the tab)
Color bars by season: blue = winter (Nov/Dec/Jan/Feb), orange = summer (Jun/Jul/Aug), gray = shoulder (Mar/Apr/May/Sep/Oct)
This immediately shows which months historically command a price premium (winter spike pattern)
Below each bar: show the average price value
Click any bar → triggers the Month Profile Chart for that month (same as clicking the row header)

1C. Per-Cell Enhancements
For each price cell in the existing heatmap table:

Add a tiny rank superscript: e.g. $9.980 ¹ where ¹ means it's the highest all-time for that month
On hover tooltip: show "Rank #1/36 all time | +340% vs 5Y avg | YoY: +62% from prior year"
Add a YoY% row at the bottom of the table (below "Year Avg"): shows year-over-year percentage change of the full-year average


UPGRADE 2 — SPREADS TAB: T-DAY SNAPSHOT COLUMNS
Context: The original Excel tracked spreads not just at their final value, but at specific points in the front leg's contract life: T-Day (day 519, final), Penultimate (day 518), 10-Day remaining, 90-Day remaining. This shows how the spread "resolves" as the front leg approaches expiry — crucial for spread trading.
What to add:
In the existing spread history table (the one showing YEAR / LAST / RANK / MAX / MIN / AVG), add these additional columns:
YEARAT-519AT-PENULTAT-10DAT-90DMAXMINAVGRANK

AT-519 (T-Day): The spread value on trading day 519 of the front-leg contract (the final day before expiry) — this is the "expiry-day spread"
AT-PENULT: The spread value on trading day 518 (penultimate day)
AT-10D: The spread value when the front leg was at trading day 509 (≈10 trading days before expiry)
AT-90D: The spread value when the front leg was at trading day 429 (≈90 trading days before expiry)

These values should be computable from the historical JSON data (which stores prices by trading day number). For each year, look up front_leg_price[day_X] - back_leg_price[same_calendar_date].
Below the per-year table, add a SUMMARY STATISTICS row showing the average of each column across all available years and across the last 5 years:
              AT-519   AT-PENULT   AT-10D   AT-90D   AVG
All Years:    +0.237    +0.241     +0.198   +0.089   +0.254
Last 5Y:     -0.165    -0.160     -0.089   +0.021  -0.002
This is a direct port of the Excel's most analytically powerful spread feature.

UPGRADE 3 — FORWARD CURVE TAB: CAL STRIP AVERAGES
Add a new section below the existing curve chart and contract table:
Strip Averages Panel
A compact table showing:
STRIPCONTRACTSAVG PRICEVS FRONTSTRUCTURECal 2026Jan–Dec$X.XXX-$0.05ContangoCal 2027Jan–Dec$X.XXX+$0.12—Cal 2028Jan–Dec$X.XXX+$0.08—Summer 26Apr–Oct$X.XXX-$1.04—Winter 26/27Nov–Mar$X.XXX+$1.44—Summer 27Apr–Oct$X.XXX-$0.98—Winter 27/28Nov–Mar$X.XXX+$1.22—

Cal strips: compute average of all 12 quoted months for a given calendar year
If some months in the Cal are missing/unquoted, show (X/12 quoted) next to the avg
Summer: Apr through Oct (7 months)
Winter: Nov through following Mar (5 months: Nov, Dec, Jan, Feb, Mar)
W/S Premium already shown in the header stats — keep it, just also break it out per year in this table
This is the institutional standard way to read a forward curve and is completely missing from the current dashboard

Historical Curve Overlay
In the forward curve chart controls area, add a button: [COMPARE CURVE]
When clicked, a small dropdown appears:

1 Week Ago
1 Month Ago
3 Months Ago
1 Year Ago

When a period is selected:

A second, lighter line (dashed, 50% opacity) is overlaid on the forward curve chart showing where each contract was trading on that historical date
This data is available from the historical JSON files — for each contract (e.g., NGZ26), look up its price on the specific historical date
Add a legend: — Today's Curve  - - 1M Ago Curve  ▲ +$0.22 avg shift
This shows whether the market has shifted up or down the entire curve or just specific tenors


UPGRADE 4 — PRICES TAB: SAME-MONTH HISTORY IMPROVEMENTS
The "SAME MONTH HH HISTORY" panel on the right sidebar currently shows limited data. Improve it:

Show ALL available years — The panel should list every year for which that contract month exists (Jan contracts go back to 1991 = ~36 contracts). Currently appears truncated. Make it scrollable and show all years.
Add columns:

YEAR | LAST PRINT | RANK | YoY Δ%
Where YoY Δ% = (this year's expiry price / prior year's expiry price) - 1
Rank is out of total available years for that month


Click to navigate: Clicking any row in the Same Month History panel loads that year's contract into the main chart. This is the most important cross-tab/cross-contract navigation feature. The selected year in the table should highlight in cyan, making it clear which contract is being displayed.
Lifecycle Position for Active Contracts: When viewing an active/live contract, the snapshot panel should show a more prominent countdown:

   DAYS TO EXPIRY    TRADING DAYS ELAPSED
        34d                243 / 519
                    ████████████░░░░░ 47%

UPGRADE 5 — CROSS-TAB NAVIGATION (DEEP LINKS)
Every major data point in the dashboard should be clickable and navigate to the relevant view. Implement the following:
From Expiry Prices → Prices Tab:

Clicking any price cell (e.g., 2022 / Jan = $4.024) loads the NGF22 contract in the Prices tab
The cell should show a subtle hover cursor-pointer effect
On click: switch to Prices tab, set market=HH, month=Jan, year=2022, render the chart

From Forward Curve contract table → Prices Tab:

Clicking any contract row (e.g., NGZ26) loads that contract in the Prices tab
Switch to Prices tab, set contract = NGZ26, render

From Spread History table → Prices Tab:

Clicking any year row in the spread history table loads the FRONT LEG contract for that year in the Prices tab
For example, in Jan/Feb spread, clicking year 2022 → loads NGF22 (Jan 2022 contract)

From Daily Tracker Upcoming Expirations → Prices Tab:

Clicking any contract row in the upcoming expirations list loads that contract in the Prices tab

Implementation: Use a global navigateTo(tab, params) function. All clicks call this. Params object: {tab: 'prices', market: 'hh', month: 'Jan', year: 2022}. The Prices tab reads URL hash or internal state to restore the requested contract.

UPGRADE 6 — DAILY TRACKER: ADDITIONAL SECTIONS
After fixing the data depth (Bug #1), add two new sections to the Daily Tracker tab below the existing Weekly Returns + Return Distribution row:
6A. Monthly Return Seasonality
A 12-bar chart showing average monthly return by calendar month across all available history:

X-axis: Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
Y-axis: average % return for sessions in that calendar month
Color: green if positive avg, red if negative
Bar label: the avg % value
Below each bar: "X of Y months positive" (e.g., "18 of 35 years positive")
Title: "AVERAGE MONTHLY RETURN — NG=F SINCE 1990"
This is a price-only seasonal analysis feature that is entirely absent from the current dashboard and directly relevant to trading decisions

6B. Year-Over-Year Annual Performance Table
A compact table showing annual performance:
YEARJAN PRICEDEC PRICEANNUAL Δ%RANK2025$3.71$3.88+4.5%#182024$2.56$3.71+45.1%#42023$3.39$2.56-24.5%#28...

Jan price = first session of that year
Dec price = last session of that year
Annual Δ% = year's performance
Rank = ranked among all years by annual performance
Color code the Δ% column: green/red
Show from 1990 to present
Bottom row: All-time stats: Avg annual return, Best year, Worst year, % of years positive


UPGRADE 7 — SPREADS TAB: LIFECYCLE RESOLUTION CHART (NEW)
Add a new chart below the existing multi-year overlay chart in the Spreads tab:
Title: "SPREAD RESOLUTION PATH — HOW THIS SPREAD RESOLVES OVER THE FRONT LEG LIFECYCLE"

X-axis: Trading days of the front-leg contract (Day 1 → Day 519)
Y-axis: Spread value
One line per year (same color coding as the existing overlay chart)
This shows: for the Jan/Feb spread, how does the spread move as January approaches expiry, across all historical years?
The user can immediately see: "Does this spread tend to widen or narrow in the final 90 days? In the final 10 days?"
This is computed from the historical data using trading day alignment (not calendar dates)
Toggle: show ALL years | show last 5Y only | show current year only
Hovering shows the spread value at that trading day for each year

This is the most analytically sophisticated feature requested. It directly ports the Excel's T-Day/90-Day/10-Day/Penultimate logic into a visual format that's far more powerful than the table alone.

DESIGN & PERFORMANCE RULES (NON-NEGOTIABLE)

Zero regressions. Every feature that works now must continue working identically after your changes.
No additional CDN dependencies unless absolutely required. Use what's already loaded.
Performance budget: The additional data from NG=F full history (~8500 rows) is small by JS standards. Store it in the same window.LIVE_DATA pattern. The monthly seasonality calculations must be pre-computed once on load, not on every render.
Visual consistency: All new charts must use the same lightweight-charts library already in use. Same color palette: cyan #00d4ff primary, orange #ff8c00 TTF, green #00ff88 positive, red #ff4455 negative. Same card style: background: #111118, border: 1px solid #1e1e2e. Same monospace font for all price values.
New tables: Same style as existing tables. Monospace numbers, right-aligned. Sticky header. Row hover = subtle background shift. No box shadows.
The Expiry Prices bar chart and month profile chart: Use lightweight-charts for the line chart (month history over years). For the seasonal bar chart (12 bars), implement it as a clean canvas-rendered bar chart or use lightweight-charts histogram series — whichever is already available and consistent with the codebase.
Cross-tab navigation must be instant. No fetch triggered by clicking a cell. If the data is already in memory, the navigation should be imperceptible.
Mobile: Do not break mobile layout. New sections can be scrollable on mobile.


DELIVERY CHECKLIST
Before submitting, verify each item:

 NG=F loads full history back to ~1990, range=max confirmed in API call
 Daily Tracker price log shows 8000+ sessions (paginated or virtually scrolled)
 Weekly returns histogram spans full dataset
 Monthly seasonality chart renders correctly with all 12 months
 Annual performance table shows all years from 1990
 Prices tab Trading Day mode toggle works, aligns seasonal band correctly
 Same Month History shows ALL available years, all are clickable
 Expiry Prices month profile chart renders when clicking any month label
 Expiry Prices seasonal bar chart renders below the table
 Per-cell hover tooltip shows rank + YoY info
 YoY% row added to expiry table
 Spread history table has AT-519 / AT-PENULT / AT-10D / AT-90D columns
 Spread summary stats row (all years avg + last 5Y avg) renders below spread table
 Spread lifecycle resolution chart renders below the multi-year overlay chart
 Forward curve Cal strip averages panel renders below the contract table
 Forward curve Compare Curve overlay works for all 4 time periods
 Clicking expiry price cell → navigates to Prices tab with correct contract
 Clicking forward curve contract row → navigates to Prices tab
 Clicking spread history year row → navigates to Prices tab (front leg)
 Clicking upcoming expiration → navigates to Prices tab
 No existing features broken
 No console errors


PRIORITY ORDER (if time-constrained, do in this order)

Bug #1: NG=F full history — this is the most embarrassing gap, fix first
Expiry Prices month profile chart — most important missing Excel feature
Spreads T-Day snapshot columns — direct Excel port, high analytical value
Cross-tab navigation — connects the whole dashboard
Same Month History: all years + clickable
Daily Tracker monthly seasonality chart
Forward Curve Cal strip averages
Spread lifecycle resolution chart — most complex, do last
Forward Curve historical overlay
All remaining enhancements