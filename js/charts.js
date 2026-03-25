/**
 * CHARTS (charts.js)
 * 
 * Plotly.js chart rendering and updates.
 * Uses Plotly.react() for efficient updates (no flicker).
 */

const PLOTLY_CONFIG = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
    responsive: true,
    displaylogo: false
}

/**
 * Build base Plotly layout with dark theme
 * @param {string} title - Chart title
 * @param {string} yLabel - Y-axis label
 * @returns {Object} Plotly layout configuration
 */
function buildBaseLayout(title, yLabel) {
    return {
        paper_bgcolor: '#0d1117',
        plot_bgcolor: '#161b22',
        font: {
            color: '#e6edf3',
            family: 'JetBrains Mono, monospace',
            size: 11
        },
        title: {
            text: title,
            font: { size: 13, color: '#8b949e' },
            x: 0.01
        },
        xaxis: {
            gridcolor: '#21262d',
            zerolinecolor: '#30363d',
            title: { text: 'Trading Day (T)', font: { size: 11 } }
        },
        yaxis: {
            gridcolor: '#21262d',
            zerolinecolor: '#30363d',
            title: { text: yLabel, font: { size: 11 } }
        },
        margin: { t: 40, r: 24, b: 56, l: 64 },
        hoverlabel: {
            bgcolor: 'rgba(22,27,34,0.95)',
            bordercolor: 'rgba(88,166,255,0.3)',
            font: { color: '#e6edf3', size: 12 }
        },
        legend: {
            bgcolor: 'rgba(22,27,34,0.8)',
            bordercolor: '#30363d'
        },
        autosize: true
    }
}

/**
 * Render single contract chart with 5-year seasonal band overlay
 * @param {string} containerID - Chart div ID
 * @param {Array} series - T-Day series: {tDay, date, price}
 * @param {Object} band - Seasonal band: {avg, high, low, tDays}
 * @param {number} tDayWindow - How many T-Days to display
 * @param {string} title - Chart title
 * @param {string} unit - Unit label (e.g. "$/MMBTU")
 */
function renderContractChart(containerID, series, band, tDayWindow, title, unit) {
    const sliced = series.slice(0, tDayWindow)
    const tDays = sliced.map(d => d.tDay)
    const prices = sliced.map(d => d.price)
    const hovers = sliced.map(
        d => `T-${d.tDay} | ${d.date} | ${d.price.toFixed(3)} ${unit}`
    )

    const traces = [
        {
            // 5Y High (top of band) — invisible line
            x: band.tDays,
            y: band.high,
            name: '5Y High',
            mode: 'lines',
            line: { width: 0 },
            showlegend: false,
            hoverinfo: 'skip'
        },
        {
            // 5Y Low (bottom of band) — fills to trace above
            x: band.tDays,
            y: band.low,
            name: '5Y Range',
            mode: 'lines',
            line: { width: 0 },
            fill: 'tonexty',
            fillcolor: 'rgba(139,148,158,0.15)',
            hoverinfo: 'skip'
        },
        {
            // 5Y Average
            x: band.tDays,
            y: band.avg,
            name: '5Y Avg',
            mode: 'lines',
            line: { color: '#d29922', width: 1.5, dash: 'dash' }
        },
        {
            // Selected contract
            x: tDays,
            y: prices,
            name: title,
            text: hovers,
            mode: 'lines',
            line: { color: '#58a6ff', width: 2 },
            hovertemplate: '%{text}<extra></extra>'
        }
    ]

    const layout = buildBaseLayout(title, unit)
    const el = document.getElementById(containerID)

    if (el._plotlyRendered) {
        Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    } else {
        Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG)
        el._plotlyRendered = true
    }
}

/**
 * Render forward curve with dual Y-axes (HH left, TTF right)
 * @param {string} containerID - Chart div ID
 * @param {Array} ngCurve - Array of {label, price}
 * @param {Array} ttfCurve - Array of {label, price}
 */
function renderForwardCurve(containerID, ngCurve, ttfCurve) {
    const traces = [
        {
            x: ngCurve.map(d => d.label),
            y: ngCurve.map(d => d.price),
            name: 'HH ($/MMBTU)',
            mode: 'lines+markers',
            line: { color: '#58a6ff', width: 2 },
            marker: { size: 5 },
            yaxis: 'y'
        },
        {
            x: ttfCurve.map(d => d.label),
            y: ttfCurve.map(d => d.price),
            name: 'TTF (€/MWh)',
            mode: 'lines+markers',
            line: { color: '#d29922', width: 2 },
            marker: { size: 5 },
            yaxis: 'y2'
        }
    ]

    const baseLayout = buildBaseLayout('Forward Curve', '')
    const layout = {
        ...baseLayout,
        yaxis: {
            ...baseLayout.yaxis,
            title: { text: '$/MMBTU' },
            side: 'left'
        },
        yaxis2: {
            title: { text: '€/MWh', font: { size: 11 } },
            overlaying: 'y',
            side: 'right',
            gridcolor: '#21262d',
            color: '#d29922'
        }
    }

    const el = document.getElementById(containerID)
    if (el._plotlyRendered) {
        Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    } else {
        Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG)
        el._plotlyRendered = true
    }
}

/**
 * Render calendar spread chart with historical band
 * Includes zero-line reference
 * @param {string} containerID - Chart div ID
 * @param {Array} spreadSeries - T-Day spread series: {tDay, date, spread}
 * @param {Object} avgBand - Historical band: {avg, high, low, tDays}
 */
function renderSpreadChart(containerID, spreadSeries, avgBand) {
    const traces = [
        {
            x: avgBand.tDays,
            y: avgBand.high,
            mode: 'lines',
            line: { width: 0 },
            showlegend: false,
            hoverinfo: 'skip'
        },
        {
            x: avgBand.tDays,
            y: avgBand.low,
            name: 'Hist. Range',
            mode: 'lines',
            line: { width: 0 },
            fill: 'tonexty',
            fillcolor: 'rgba(139,148,158,0.12)',
            hoverinfo: 'skip'
        },
        {
            x: avgBand.tDays,
            y: avgBand.avg,
            name: 'Hist. Avg',
            mode: 'lines',
            line: { color: '#d29922', width: 1.5, dash: 'dash' }
        },
        {
            x: spreadSeries.map(d => d.tDay),
            y: spreadSeries.map(d => d.spread),
            name: 'Selected Year',
            mode: 'lines',
            line: { color: '#58a6ff', width: 2 },
            hovertemplate: 'T-%{x} | %{y:.3f}<extra></extra>'
        }
    ]

    const layout = buildBaseLayout('Calendar Spread', '$/MMBTU')
    layout.shapes = [
        {
            type: 'line',
            x0: 0,
            x1: 1,
            xref: 'paper',
            y0: 0,
            y1: 0,
            yref: 'y',
            line: { color: '#30363d', width: 1, dash: 'dot' }
        }
    ]

    const el = document.getElementById(containerID)
    if (el._plotlyRendered) {
        Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    } else {
        Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG)
        el._plotlyRendered = true
    }
}
