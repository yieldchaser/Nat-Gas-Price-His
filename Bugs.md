I have a complete picture now. Here's the full diagnostic:

Audit Report
🔴 CRITICAL — Charts still blank after fix
Root cause: baseChartOptions() passes width: container.clientWidth and height: container.clientHeight. When tab panels use display:none (all tabs except the active one), clientWidth and clientHeight are both 0. The chart is created at 0×0 and renders nothing.

All 7 tabs get their renderTab() called during init — but only tab-hh is visible. Tabs 2-7 are display:none so their containers report 0px dimensions.

Secondary issue: Even for Tab 1 (HH), the chart-wrap is inside a flex container that may not have a computed height yet at init time — CSS height: 60vh requires the DOM to be painted first.

Fix needed: Remove explicit width/height from chart options and use autoSize: true instead (lightweight-charts v4 supports this), OR call chart.resize() after the container is visible.

🔴 CRITICAL — buildSeasonalCache() is synchronous and blocks the main thread
It loops over 12 months × 5 years × 519 data points inline during init. On slow devices this freezes the UI for hundreds of ms before the loading screen even hides.

🔴 CRITICAL — buildSpreadHeatmap() computes 144 spreads × 5 years on the main thread
Called synchronously in renderSpreadTab(). 144 × 5 = 720 computeSpread() calls, each doing O(n) loops. Will freeze the browser for 1–3 seconds when spread tab first opens.

🟠 HIGH — Spread tab: all historical years create separate addLineSeries() calls
Up to 36 separate series added to one chart (one per year of history). Each is a separate DOM/canvas operation. This is the correct lightweight-charts pattern but without debouncing, changing front/back month triggers full teardown and rebuild of 36+ series.

🟠 HIGH — init() renders ALL 7 tabs upfront
if (typeof renderHHTab === 'function') renderHHTab();
if (typeof renderTTFTab === 'function') renderTTFTab();  // display:none → 0px chart
// ... all 7

All tabs render while hidden. Charts are sized to 0. This is wasted work AND broken — charts need dimensions to render.

Fix: Only render the active tab on init. Render other tabs lazily on first click.

🟠 HIGH — Spot updateSpotChart() recomputes global stats on every call
MONTHS.forEach(m => {
  Object.values(STATE.spot[m].years).forEach(arr => arr.forEach(pt => allPrices.push(pt.p)));
});

Iterates every spot data point (30 years × 12 months × ~22 days = ~8000 points) just to get global avg/std. Should be computed once at init and cached.

🟡 MEDIUM — Math.max(...data.map(...)) spread operator on 519 elements
Used in renderHHStats, updateTTFChart, updateSpotChart. Spread into Math.max is fine at 519, but called on every contract switch. Minor — use reduce instead.

🟡 MEDIUM — Chart container height: 60vh from CSS, but chart created with clientHeight
The CSS height: 60vh is computed by the browser, but container.clientHeight at creation time may be 0 (if tab is hidden) or the wrong value (if layout hasn't reflowed). The autoSize: true option in lightweight-charts handles this correctly.

🟡 MEDIUM — populateHHYears() called on every renderHHTab() call
renderHHTab() is called again after live data loads. It re-populates the year dropdown, losing the user's selection.

🟡 MEDIUM — getContractData() does O(n) merge every call
Called multiple times per chart render (main series + seasonal band + compare mode). Should memoize by ticker.

🟡 MEDIUM — Spread tab uses dayToTime(pt.d) for ALL historical overlays
All 36 years of spread data map to the same pseudo-date range (day 1 → ~519). This is intentional for overlay, but dayToTime is called thousands of times per render with the cache helping, but the spread tab calls computeSpread() per year without caching — same contract pairs are recomputed on every updateSpreadChart() call.

🟡 MEDIUM — Forward Curve: getContractData() called 72 times in a loop
The forward curve iterates 72 months and calls getContractData() for each — which does live data lookup + merge each time. No caching.

🔵 LOW — renderHHTab() is called twice on load if active tab is HH
Once during init, once after loadLiveData() resolves. Second call re-runs populateHHYears() and updateHHChart() causing full chart redraw.

🔵 LOW — Tab switching does not call chart.resize()
if (STATE.charts[tab]) {
  requestAnimationFrame(() => {
    Object.values(STATE.charts[tab]).forEach(c => { if (c.resize) c.resize(); });
  });
}

STATE.charts.hh is an object { main: chart }, not an array. Object.values() is correct here. But c.resize without args resizes to the container — which only works if the chart was created with autoSize: true or if proper dimensions are passed.

🔵 LOW — init() renders all tabs but only hh is active — others are hidden with display:none via .tab-panel
The CSS .tab-panel { display: none } means all charts except tab-hh are 0×0 when created.

Summary Priority Matrix
#	Issue	Severity	Impact
1	Charts sized 0×0 because tabs are display:none	CRITICAL	All tabs blank
2	All tabs rendered on init (hidden)	CRITICAL	Charts broken + wasted work
3	buildSeasonalCache blocks main thread	HIGH	Load freeze
4	Spread heatmap: 720 sync computations	HIGH	Tab freeze
5	Spread: 36+ series rebuilt on every change	HIGH	Chart stutter
6	Spot stats recomputed from scratch each call	MEDIUM	Unnecessary CPU
7	getContractData() not memoized	MEDIUM	Redundant work
8	renderHHTab() called twice on load	LOW	Double render
Recommended Fixes (not implementing yet)
Use autoSize: true in chart options — removes width/height dependency on container dimensions
Lazy tab rendering — only render a tab when it's first clicked, not all at init
Pre-compute and cache spread data, global spot stats, contract data merges at init
Debounce slider input events (T-Day range) to avoid chart rebuilds on every tick