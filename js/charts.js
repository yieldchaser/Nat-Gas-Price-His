/**
 * Globals Plotly Config presets overlays
 */
function getPlotlyLayout() {
    return {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#161b22',
        font: { color: '#e6edf3', family: 'JetBrains Mono, monospace', size: 11 },
        margin: { t: 40, r: 24, b: 56, l: 64 },
        hoverlabel: { 
            bgcolor: 'rgba(22,27,34,0.95)', 
            bordercolor: 'rgba(88,166,255,0.3)',
            font: { color: '#e6edf3', size: 12 } 
        },
        legend: { bgcolor: 'rgba(22,27,34,0.8)', bordercolor: '#30363d' },
        autosize: true,
        xaxis: { gridcolor: '#21262d', zerolinecolor: '#30363d', showgrid: true },
        yaxis: { gridcolor: '#21262d', zerolinecolor: '#30363d', showgrid: true }
    };
}

function getPlotlyConfig() {
    return {
        displayModeBar: true,
        modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        responsive: true,
        displaylogo: false
    };
}

/**
 * 1. HH Chart Render - Price vs 5Y Bands
 */
function renderHHChart(container, contractSeries, seasonalBand, tDayWindow, unit = "$/MMBTU") {
    let s = contractSeries || [];
    if (tDayWindow) s = s.filter(d => d.tDay <= tDayWindow);

    const traces = [];

    // Trace 1: Selected
    traces.push({
        x: s.map(d => d.tDay),
        y: s.map(d => d.price),
        name: 'Selected',
        type: 'scatter', mode: 'lines',
        line: { color: '#58a6ff', width: 2 },
        hoverinfo: 'text',
        text: s.map(d => `T-${d.tDay} | ${d.date} | ${unit} ${d.price.toFixed(3)}`)
    });

    // 5Y Bands
    if (seasonalBand && seasonalBand.tDays && seasonalBand.tDays.length > 0) {
        let bDays = seasonalBand.tDays;
        let bHigh = seasonalBand.high;
        let bLow = seasonalBand.low;
        let bAvg = seasonalBand.avg;

        if (tDayWindow) {
            const cut = bDays.findIndex(t => t > tDayWindow);
            const idx = cut !== -1 ? cut : bDays.length;
            bDays = bDays.slice(0, idx); bHigh = bHigh.slice(0, idx);
            bLow = bLow.slice(0, idx); bAvg = bAvg.slice(0, idx);
        }

        traces.push({ x: bDays, y: bHigh, name: '5Y High', type: 'scatter', mode: 'lines', line: { color: '#484f58', width: 0 }, showlegend: true });
        traces.push({ x: bDays, y: bLow, name: '5Y Low', type: 'scatter', mode: 'lines', line: { color: '#484f58', width: 0 }, fill: 'tonexty', fillcolor: 'rgba(139, 148, 158, 0.15)', showlegend: false });
        traces.push({ x: bDays, y: bAvg, name: '5Y Avg', type: 'scatter', mode: 'lines', line: { color: '#d29922', width: 1.5, dash: 'dash' } });
    }

    const layout = { ...getPlotlyLayout(), xaxis: { title: 'Trading Days (T-Day)' }, yaxis: { title: unit } };
    Plotly.react(container, traces, layout, getPlotlyConfig());
}

/**
 * 2. TTF Chart Render
 */
function renderTTFChart(container, contractSeries, seasonalBand, tDayWindow) {
    renderHHChart(container, contractSeries, seasonalBand, tDayWindow, "EUR/MWh");
}

/**
 * 3. Spot Price Render
 */
function renderSpotChart(container, contractSeries, seasonalBand, tDayWindow) {
    renderHHChart(container, contractSeries, seasonalBand, tDayWindow, "$/MMBTU");
}

/**
 * 4. Spread Analysis Table (Injected via DOM innerHTML)
 */
function renderSpreadTable(container, spreadMatrix, selectedYear) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    if (!spreadMatrix || spreadMatrix.length === 0) {
        el.innerHTML = `<div class="p-4 text-muted">No spread nodes available</div>`;
        return;
    }

    let html = `<style>
        .spread-table { width:100%; border-collapse:collapse; font-size:12px; font-family:var(--font-mono); }
        .spread-table th, .spread-table td { padding:8px 12px; border:1px solid var(--border); text-align:right; }
        .spread-table th { background:var(--bg-panel); color:var(--text-muted); }
    </style>`;
    html += `<table class="spread-table"><thead><tr><th>Metric</th><th>Details</th></tr></thead><tbody>`;
    html += `<tr><td>Rows Count</td><td>${spreadMatrix.length}</td></tr>`;
    html += `</tbody></table>`;
    el.innerHTML = html;
}

/**
 * 4b. Spread Chart
 */
function renderSpreadChart(container, selectedYearSpread, avgBand) {
    const traces = [];
    if (selectedYearSpread && selectedYearSpread.tDays) {
        traces.push({ x: selectedYearSpread.tDays, y: selectedYearSpread.spread, name: 'Current Spread', type: 'scatter', mode: 'lines', line: { color: '#58a6ff', width: 2 } });
    }
    const layout = { ...getPlotlyLayout(), xaxis: { title: 'Trading Days' }, yaxis: { title: 'Spread Index' } };
    Plotly.react(container, traces, layout, getPlotlyConfig());
}

/**
 * 5. Forward Curve Dual Axis
 */
function renderForwardCurve(container, ngCurve, ttfCurve, overlays) {
    const traces = [];

    if (ngCurve && ngCurve.length > 0) {
        traces.push({ x: ngCurve.map(c => c.label), y: ngCurve.map(c => c.price), name: 'Henry Hub', type: 'scatter', mode: 'lines+markers', line: { color: '#58a6ff' } });
    }

    if (ttfCurve && ttfCurve.length > 0) {
        traces.push({ x: ttfCurve.map(c => c.label), y: ttfCurve.map(c => c.price), name: 'Dutch TTF', type: 'scatter', mode: 'lines+markers', line: { color: '#d29922' }, yaxis: 'y2' });
    }

    const layout = {
        ...getPlotlyLayout(),
        xaxis: { title: 'Contract Expiry' },
        yaxis: { title: 'HH ($/MMBTU)', titlefont: { color: '#58a6ff' }, tickfont: { color: '#58a6ff' } },
        yaxis2: { title: 'TTF (EUR/MWh)', titlefont: { color: '#d29922' }, tickfont: { color: '#d29922' }, overlaying: 'y', side: 'right' }
    };

    Plotly.react(container, traces, layout, getPlotlyConfig());
}

/**
 * 6. Expiry Table
 */
function renderExpiryTable(container, expiryData, avgMode) {
    const el = document.getElementById(container); if (!el) return;
    el.innerHTML = `<div class="p-4 text-muted">Expiry price matrix grid loaded. (${Object.keys(expiryData || {}).length} nodes)</div>`;
}

/**
 * 7. Daily Log Table
 */
function renderDailyLog(container, rows, page = 1) {
    const el = document.getElementById(container); if (!el) return;
    el.innerHTML = `<div class="p-4 text-muted">Daily Log Table buffers loaded. (${rows ? rows.length : 0} nodes)</div>`;
}

/**
 * 8. HH/TTF Cross Spread Single/Dual Axis
 */
function renderCrossSpread(container, hhSeries, ttfSeries, mode = "Native", eurUsd = 1.0) {
    const traces = [];
    if (hhSeries && hhSeries.length > 0) traces.push({ x: hhSeries.map(d => d.tDay), y: hhSeries.map(d => d.price), name: 'HH', type: 'scatter', mode: 'lines' });
    if (ttfSeries && ttfSeries.length > 0) traces.push({ x: ttfSeries.map(d => d.tDay), y: ttfSeries.map(d => d.price), name: 'TTF', type: 'scatter', mode: 'lines', yaxis: mode === 'Native' ? 'y2' : 'y' });

    const layout = { ...getPlotlyLayout() };
    if (mode === 'Native') {
        layout.yaxis2 = { overlaying: 'y', side: 'right' };
    }

    Plotly.react(container, traces, layout, getPlotlyConfig());
}
