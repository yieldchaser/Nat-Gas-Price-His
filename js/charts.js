const PLOT_CONFIG = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    responsive: true,
    displaylogo: false
};

function getCommonLayout(yAxisTitle) {
    return {
        paper_bgcolor: "#0d1117",
        plot_bgcolor: "#161b22",
        font: { color: "#e6edf3", family: "JetBrains Mono, monospace" },
        xaxis: { gridcolor: "#21262d", zerolinecolor: "#30363d" },
        yaxis: { gridcolor: "#21262d", zerolinecolor: "#30363d", title: yAxisTitle },
        margin: { t: 40, r: 20, b: 60, l: 60 },
        hoverlabel: { 
            bgcolor: "rgba(22,27,34,0.95)", 
            bordercolor: "rgba(88,166,255,0.3)",
            font: { color: "#e6edf3", size: 12 } 
        },
        legend: { bgcolor: "rgba(22,27,34,0.8)", bordercolor: "#30363d" }
    };
}

/**
 * 1. HH Chart Render (Linear series with band fills)
 */
function renderHHChart(containerId, contractSeries, seasonalBand) {
    const traces = [];

    if (seasonalBand && seasonalBand.length > 0) {
        const tDays = seasonalBand.map(r => r.tDay);
        // Fill band trace
        traces.push({
            x: [...tDays, ...[...tDays].reverse()],
            y: [
                ...seasonalBand.map(r => r.max), 
                ...[...seasonalBand.map(r => r.min)].reverse()
            ],
            fill: 'toself',
            fillcolor: 'rgba(139, 148, 158, 0.15)',
            line: { color: 'transparent' },
            name: '5Y High/Low',
            hoverinfo: 'skip'
        });

        traces.push({
            x: tDays,
            y: seasonalBand.map(r => r.mean),
            mode: 'lines',
            line: { color: '#d29922', width: 1.5, dash: 'dash' },
            name: '5Y Average'
        });
    }

    if (contractSeries && contractSeries.length > 0) {
        traces.push({
            x: contractSeries.map(r => r.tDay),
            y: contractSeries.map(r => r.price),
            mode: 'lines',
            line: { color: '#58a6ff', width: 2 },
            name: 'Selected Contract'
        });
    }

    const layout = getCommonLayout("$/MMBTU");
    Plotly.newPlot(containerId, traces, layout, PLOT_CONFIG);
}

/**
 * 2. TTF Chart Render (Identical trace layout, different unit)
 */
function renderTTFChart(containerId, contractSeries, seasonalBand) {
    const traces = [];

    if (seasonalBand && seasonalBand.length > 0) {
        const tDays = seasonalBand.map(r => r.tDay);
        traces.push({
            x: [...tDays, ...[...tDays].reverse()],
            y: [
                ...seasonalBand.map(r => r.max), 
                ...[...seasonalBand.map(r => r.min)].reverse()
            ],
            fill: 'toself',
            fillcolor: 'rgba(139, 148, 158, 0.15)',
            line: { color: 'transparent' },
            name: '5Y High/Low',
            hoverinfo: 'skip'
        });

        traces.push({
            x: tDays,
            y: seasonalBand.map(r => r.mean),
            mode: 'lines',
            line: { color: '#d29922', width: 1.5, dash: 'dash' },
            name: '5Y Average'
        });
    }

    if (contractSeries && contractSeries.length > 0) {
        traces.push({
            x: contractSeries.map(r => r.tDay),
            y: contractSeries.map(r => r.price),
            mode: 'lines',
            line: { color: '#d29922', width: 2 },
            name: 'Selected Contract'
        });
    }

    const layout = getCommonLayout("EUR/MWh");
    Plotly.newPlot(containerId, traces, layout, PLOT_CONFIG);
}

/**
 * 3. Spot Price Render
 */
function renderSpotChart(containerId, spotSeries) {
    const trace = {
        x: spotSeries.map(r => r.date),
        y: spotSeries.map(r => r.price),
        mode: 'lines',
        line: { color: '#58a6ff', width: 1.5 },
        name: 'Spot Price'
    };
    const layout = getCommonLayout("$/MMBTU");
    Plotly.newPlot(containerId, [trace], layout, PLOT_CONFIG);
}

/**
 * 4. Spread Table Render HTML aggregates
 */
function renderSpreadTable(containerId, spreadData, analysisYear) {
    const el = document.getElementById(containerId);
    if (!el) return;

    // Table view skeleton node placeholder
    el.innerHTML = `<div style="color: var(--text-muted); padding: 20px; text-align: center;">Spread Table Rendering Module Loaded (Analysis Year: ${analysisYear})</div>`;
}

/**
 * 5. Forward Curve trace plots overlay
 */
function renderForwardCurve(containerId, ngCurve, ttfCurve) {
    const traces = [];

    if (ngCurve && ngCurve.length > 0) {
        traces.push({
            x: ngCurve.map(c => c.ticker.replace(".NYM", "")),
            y: ngCurve.map(c => c.price),
            mode: 'lines+markers',
            line: { color: '#58a6ff' },
            name: 'Henry Hub NYMEX'
        });
    }

    if (ttfCurve && ttfCurve.length > 0) {
        traces.push({
            x: ttfCurve.map(c => c.ticker.replace(".NYM", "")),
            y: ttfCurve.map(c => c.price),
            mode: 'lines+markers',
            line: { color: '#d29922' },
            name: 'Dutch TTF',
            yaxis: 'y2'
        });
    }

    const layout = getCommonLayout("$/MMBTU");
    layout.yaxis2 = {
        title: 'EUR/MWh',
        overlaying: 'y',
        side: 'right',
        gridcolor: 'transparent',
        zerolinecolor: '#30363d'
    };

    Plotly.newPlot(containerId, traces, layout, PLOT_CONFIG);
}

/**
 * 6. Expiry Price Grid Render placeholders
 */
function renderExpiryTable(containerId, expiryData) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Expiry Price Module Grid initialized</div>';
}

/**
 * 7. Daily Log table Render
 */
function renderDailyLog(containerId, rows) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Daily Log Module table initialized</div>';
}

/**
 * 8. HH/TTF Spread Dual Overlay Render
 */
function renderCrossSpreadChart(containerId, hhSeries, ttfSeries, mode) {
    const traces = [];

    if (hhSeries && hhSeries.length > 0) {
        traces.push({
            x: hhSeries.map(r => r.date),
            y: hhSeries.map(r => r.price),
            mode: 'lines',
            line: { color: '#58a6ff' },
            name: 'Henry Hub'
        });
    }

    if (ttfSeries && ttfSeries.length > 0) {
        traces.push({
            x: ttfSeries.map(r => r.date),
            y: ttfSeries.map(r => r.price),
            mode: 'lines',
            line: { color: '#d29922' },
            name: 'Dutch TTF',
            yaxis: mode === 'USD' ? 'y' : 'y2'
        });
    }

    const layout = getCommonLayout(mode === 'USD' ? "USD Equivalent" : "$/MMBTU");
    
    if (mode !== 'USD') {
        layout.yaxis2 = {
            title: 'EUR/MWh',
            overlaying: 'y',
            side: 'right',
            gridcolor: 'transparent'
        };
    }

    Plotly.newPlot(containerId, traces, layout, PLOT_CONFIG);
}
