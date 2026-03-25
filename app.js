/**
 * APP CORE (app.js)
 * 
 * Institutional-grade pipeline:
 * - Panel-driven architecture for flexibility
 * - Origin-grade analytics: volatility, carry, correlation, seasonal, spread
 * - High-performance rendering, caching, lightweight routes
 * - Live update feed with root ticker + resiliency
 */

const appState = {
  panel: 'market', // market/curve/spread/expiry/cross/log
  choice: 'ng', // hh/ttf/spot
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  tDay: 100,
  isLoading: false,
  seriesCache: new Map(),
  curveCache: null,
  expiryCache: null,
  lastTicker: null,
  livePerf: { requests: 0, successes: 0, errors: 0 }
};

const dom = {
  ngTicker: document.getElementById('ng-ticker'),
  ttfTicker: document.getElementById('ttf-ticker'),
  eurusdTicker: document.getElementById('eurusd-ticker'),
  refreshBtn: document.getElementById('refresh-btn'),
  overlay: document.getElementById('overlay-loader'),
  globalYear: document.getElementById('global-year'),
  globalMonth: document.getElementById('global-month'),
  globalTdays: document.getElementById('global-tdays'),
  quickContracts: document.getElementById('quick-contracts'),
  statsGrid: document.getElementById('stats-grid'),
  chartContainer: document.getElementById('chart-container'),
  dataGrid: document.getElementById('data-grid'),
  tabs: Array.from(document.querySelectorAll('.tool-btn')),
  lastRefreshText: null,
};

const PANEL_MAP = {
  market: { title: 'Contract Curve', fn: renderMarketPanel },
  curve: { title: 'Forward Curve', fn: renderCurvePanel },
  spread: { title: 'Calendar Spread', fn: renderSpreadPanel },
  expiry: { title: 'Expiry Roll', fn: renderExpiryPanel },
  cross: { title: 'Cross Market', fn: renderCrossPanel },
  log: { title: 'Log Scale', fn: renderLogPanel }
};

function showLoader(show) {
  appState.isLoading = show
  dom.overlay.classList.toggle('hidden', !show)
}

function debounce(fn, wait) {
  let timeout
  return (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), wait)
  }
}

function formatPrice(v, decimals = 3) {
  if (v === null || v === undefined || Number.isNaN(v) || !Number.isFinite(v)) return '--'
  return Number(v).toFixed(decimals)
}

function pnlChange(first, last) {
  if (first === 0 || first === null || last === null) return null
  return (last - first) / Math.abs(first) * 100
}

function computeAnalytics(series) {
  const n = series.length
  if (n === 0) return { avg: 0, stdev: 0, returns: [], vol30: 0, vol90: 0 }
  const prices = series.map(r => r.price)
  const avg = prices.reduce((s, v) => s + v, 0) / n
  const stdev = Math.sqrt(prices.reduce((s, v) => s + (v - avg) ** 2, 0) / n)

  const returns = []
  for (let i = 1; i < n; i++) {
    const prev = prices[i - 1]
    const curr = prices[i]
    returns.push(Number.isFinite(prev) && prev !== 0 ? (curr - prev) / Math.abs(prev) : 0)
  }

  const rollingStd = (arr, window) => {
    if (arr.length < window) return 0
    const slice = arr.slice(arr.length - window)
    const mu = slice.reduce((s, v) => s + v, 0) / slice.length
    return Math.sqrt(slice.reduce((s, v) => s + (v - mu) ** 2, 0) / slice.length) * Math.sqrt(252)
  }

  return {
    avg, stdev, returns,
    vol30: rollingStd(returns, Math.min(30, returns.length)),
    vol90: rollingStd(returns, Math.min(90, returns.length))
  }
}

function setStatusValues(series) {
  const stats = computeAnalytics(series)
  const current = series.at(-1)?.price ?? null
  const prior = series.at(-2)?.price ?? null
  const delta = prior !== null ? current - prior : null
  const deltaPct = delta !== null && current !== 0 ? (delta / Math.abs(current)) * 100 : null
  const first = series[0]?.price ?? null
  const totalPct = pnlChange(first, current)

  const cards = [
    { label: 'Current', value: formatPrice(current) },
    { label: 'Change', value: delta !== null ? `${formatPrice(delta)} (${deltaPct !== null ? deltaPct.toFixed(2)+'%' : '--'})` : '--' },
    { label: '1m Avg', value: formatPrice(stats.avg) },
    { label: '30d Vol', value: formatPrice(stats.vol30, 2) },
    { label: '90d Vol', value: formatPrice(stats.vol90, 2) },
    { label: 'Std Dev', value: formatPrice(stats.stdev, 2) },
    { label: 'YTD', value: totalPct !== null ? `${totalPct.toFixed(2)}%` : '--' }
  ]

  dom.statsGrid.innerHTML = cards.map(c => `<div class="stat-card"><div class="label">${c.label}</div><div class="value">${c.value}</div></div>`).join('')
}

function updatePriceTable(series, suffix = 'Price') {
  if (!Array.isArray(series) || !series.length) {
    dom.dataGrid.innerHTML = '<div style="padding:14px;color:var(--text-muted);">No data available.</div>'
    return
  }

  const rows = series.slice(0, 120).map(r => `<tr><td style="padding:6px;border-bottom:1px solid var(--border);">${r.tDay}</td><td style="padding:6px;border-bottom:1px solid var(--border);">${r.date}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:right;">${formatPrice(r.price)}</td></tr>`).join('')

  dom.dataGrid.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);">T-Day</th><th style="text-align:left;padding:8px;border-bottom:1px solid var(--border);">Date</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);">${suffix}</th></tr></thead><tbody>${rows}</tbody></table>`
}

function activateTab(key) {
  if (!PANEL_MAP[key]) return
  appState.panel = key
  dom.tabs.forEach(b => b.classList.toggle('active', b.dataset.tab === key))
  appState.choice = (key === 'market' || key === 'curve' || key === 'spread' || key === 'expiry' || key === 'cross' || key==='log') ? appState.choice : 'ng'
}

async function fetchSeries() {
  const key = `${appState.choice}_${appState.year}_${appState.month}`
  if (appState.seriesCache.has(key)) return appState.seriesCache.get(key)

  showLoader(true)
  try {
    let series = []
    if (appState.choice === 'spot') {
      series = await getSpotPriceSeries(appState.month, appState.year)
    } else {
      const MC = ['f','g','h','j','k','m','n','q','u','v','x','z']
      const monthCode = MC[appState.month]
      const cID = `${appState.choice}${monthCode}${String(appState.year).slice(-2)}`
      const yTicker = `${appState.choice.toUpperCase()}${monthCode.toUpperCase()}${String(appState.year).slice(-2)}.NYM`
      series = await getContractSeries(appState.choice === 'ng' ? 'Henry Hub' : 'Dutch TTF', cID, yTicker)
    }

    // ensure clean numeric
    const normalized = series.map(d => ({ tDay: d.tDay, date: d.date, price: Number(d.price) }))
    appState.seriesCache.set(key, normalized)
    return normalized
  } catch (e) {
    console.error('fetchSeries', e)
    return []
  } finally {
    showLoader(false)
  }
}

async function fetchCurveData() {
  if (appState.curveCache) return appState.curveCache
  showLoader(true)
  try {
    const curve = await sweepFullCurve()
    const fixed = Object.entries(curve).reduce((acc, [k, points]) => {
      const label = k.replace(/\.NYM$/, '')
      const price = Number(points.at(-1)?.price ?? null)
      acc[label] = { price, history: points }
      return acc
    }, {})

    appState.curveCache = fixed
    return fixed
  } catch (e) {
    console.error('fetchCurveData', e)
    return {}
  } finally {
    showLoader(false)
  }
}

async function fetchExpiryData() {
  if (appState.expiryCache) return appState.expiryCache
  showLoader(true)
  try {
    const hh = await getExpiryPrices('Henry Hub')
    const ttf = await getExpiryPrices('Dutch TTF')
    appState.expiryCache = { hh, ttf }
    return appState.expiryCache
  } catch (e) {
    console.error('fetchExpiryData', e)
    return { hh: {}, ttf: {} }
  } finally {
    showLoader(false)
  }
}

function adjustNowText() {
  if (!dom.lastRefreshText) {
    dom.lastRefreshText = document.createElement('div')
    dom.lastRefreshText.style.cssText = 'color:var(--text-muted);font-size:11px;margin-left:10px;'
    dom.refreshBtn.insertAdjacentElement('afterend', dom.lastRefreshText)
  }
  dom.lastRefreshText.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`
}

async function renderMarketPanel() {
  const series = await fetchSeries()
  setStatusValues(series)

  const band = await getSeasonalBand(appState.choice === 'spot' ? 'Spot Price' : (appState.choice === 'ng' ? 'Henry Hub' : 'Dutch TTF'), appState.month, appState.year, appState.tDay)
  renderContractChart('chart-container', series, band, appState.tDay, `${appState.choice.toUpperCase()} ${appState.month + 1}/${appState.year}`, appState.choice === 'ttf' ? '€/MWh' : '$/MMBTU')

  updatePriceTable(series)
}

async function renderCurvePanel() {
  const curve = await fetchCurveData()
  const ng = Object.entries(curve).filter(([k]) => /^NG/.test(k)).map(([k, v]) => ({ label: k, price: v.price }))
  const ttf = Object.entries(curve).filter(([k]) => /^TTF/.test(k)).map(([k, v]) => ({ label: k, price: v.price }))

  setStatusValues([])
  renderForwardCurve('chart-container', ng, ttf)

  const headers = ['Ticker', 'Last Price']
  const rows = [...ng, ...ttf].sort((a, b) => b.price - a.price)
  dom.dataGrid.innerHTML = `<div style="padding:10px;max-height:280px;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="color:var(--text-muted);text-align:left;padding:8px;border-bottom:1px solid var(--border);">${headers[0]}</th><th style="text-align:right;padding:8px;border-bottom:1px solid var(--border);">${headers[1]}</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:6px;border-bottom:1px solid var(--border);">${r.label}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:right;">${formatPrice(r.price,2)}</td></tr>`).join('')}</tbody></table></div>`
}

async function renderSpreadPanel() {
  const front = appState.month
  const back = (appState.month + 1) % 12
  const spreadSeries = await getSpreadSeries('Henry Hub', front, back, appState.year)
  const band = await getSeasonalBand('Henry Hub', front, appState.year, appState.tDay)

  setStatusValues(spreadSeries.map(r => ({ price: r.spread })))
  renderSpreadChart('chart-container', spreadSeries, band)

  const spreadTable = spreadSeries.map(d => ({ tDay: d.tDay, date: d.date, price: d.spread }))
  updatePriceTable(spreadTable, 'Spread')
}

async function renderExpiryPanel() {
  const expiry = await fetchExpiryData()
  const dataset = appState.choice === 'ttf' ? expiry.ttf : expiry.hh
  const rows = Object.entries(dataset).map(([contract, info]) => ({ contract, price: info.price, date: info.date }))
  rows.sort((a, b) => new Date(a.date) - new Date(b.date))

  const ngCurve = rows.map(r => ({ label: r.contract, price: r.price }))
  const layout = buildBaseLayout('Expiry Curve', appState.choice === 'ttf' ? '€/MWh' : '$/MMBTU')
  layout.xaxis.tickangle = -45

  Plotly.react('chart-container', [{ x: ngCurve.map(x => x.label), y: ngCurve.map(x => x.price), type: 'bar', marker: { color: '#58a6ff' } }], layout, PLOTLY_CONFIG)

  setStatusValues(rows.map(r => ({ price: r.price })))
  dom.dataGrid.innerHTML = `<div style="padding:10px;max-height:260px;overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:7px;border-bottom:1px solid var(--border);">Contract</th><th style="text-align:left;padding:7px;border-bottom:1px solid var(--border);">Expiry</th><th style="text-align:right;padding:7px;border-bottom:1px solid var(--border);">Price</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="padding:6px;border-bottom:1px solid var(--border);">${r.contract}</td><td style="padding:6px;border-bottom:1px solid var(--border);">${r.date}</td><td style="padding:6px;border-bottom:1px solid var(--border);text-align:right;">${formatPrice(r.price)}</td></tr>`).join('')}</tbody></table></div>`
}

async function renderLogPanel() {
  const series = await fetchSeries()
  setStatusValues(series)
  const trace = { x: series.map(r => r.tDay), y: series.map(r => r.price), mode: 'lines', type: 'scatter', line: { color: '#8be9fd' } }
  const layout = buildBaseLayout('Log-Scaled Contract', appState.choice === 'ttf' ? '€/MWh' : '$/MMBTU')
  layout.yaxis.type = 'log'
  Plotly.react('chart-container', [trace], layout, PLOTLY_CONFIG)
  updatePriceTable(series)
}

async function renderCrossPanel() {
  const MC = ['f','g','h','j','k','m','n','q','u','v','x','z']
  const m = appState.month
  const yy = String(appState.year).slice(-2)
  const hhID = `ng${MC[m]}${yy}`
  const ttfID = `ttf${MC[m]}${yy}`

  const [hhSeries, ttfSeries] = await Promise.all([
    getContractSeries('Henry Hub', hhID, `NG${MC[m].toUpperCase()}${yy}.NYM`),
    getContractSeries('Dutch TTF', ttfID, `TTF${MC[m].toUpperCase()}${yy}.NYM`)
  ])

  const minLen = Math.min(hhSeries.length, ttfSeries.length, appState.tDay)
  const x = hhSeries.slice(0, minLen).map(r => r.price)
  const y = ttfSeries.slice(0, minLen).map(r => r.price)

  const corr = (() => {
    if (x.length < 2) return 0
    const xm = x.reduce((s, v) => s + v, 0) / x.length
    const ym = y.reduce((s, v) => s + v, 0) / y.length
    const num = x.reduce((s, v, i) => s + (v - xm) * (y[i] - ym), 0)
    const den = Math.sqrt(x.reduce((s, v) => s + (v - xm) ** 2, 0) * y.reduce((s, v) => s + (v - ym) ** 2, 0))
    return den !== 0 ? num / den : 0
  })()

  Plotly.react('chart-container', [{ x, y, mode: 'markers', type: 'scatter', marker: { color: '#ffa657', size: 6 } }], { ...buildBaseLayout('HH vs TTF Cross', ''), xaxis: { ...buildBaseLayout().xaxis, title: { text: '$/MMBTU (HH)' } }, yaxis: { ...buildBaseLayout().yaxis, title: { text: '€/MWh (TTF)' } } }, PLOTLY_CONFIG)

  setStatusValues([])
  dom.dataGrid.innerHTML = `<div style="padding:12px;color:var(--text-muted);">Cross correlation: <strong>${corr.toFixed(4)}</strong><br />Observations: ${minLen} exposures, contract: ${hhID} vs ${ttfID}</div>`
}

async function updatePanel() {
  const panel = appState.panel
  const def = PANEL_MAP[panel]
  if (def && typeof def.fn === 'function') {
    document.title = `NatGas Pro Terminal - ${def.title}`
    await def.fn()
  }
}

const updateChart = debounce(async () => {
  await updatePanel()
  adjustNowText()
}, 120)

async function updateLiveTickers() {
  const tickers = ['NG=F', 'TTF=F', 'EURUSD=X']
  appState.livePerf.requests += tickers.length

  const results = await Promise.allSettled(tickers.map(t => fetchContinuous(t)))
  results.forEach((res, i) => {
    const key = [dom.ngTicker, dom.ttfTicker, dom.eurusdTicker][i]
    if (res.status === 'fulfilled' && res.value) {
      appState.livePerf.successes++
      key.textContent = `${tickers[i]}: ${res.value.price.toFixed(4)} ${res.value.change >= 0 ? '▲' : '▼'} ${Math.abs(res.value.changePct).toFixed(2)}%`
    } else {
      appState.livePerf.errors++
      key.textContent = `${tickers[i]}: --`;
    }
  })

  appState.lastTicker = Date.now()
}

function initPanelNavigation() {
  dom.tabs.forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.choice) {
        appState.choice = button.dataset.choice
      }
      activateTab(button.dataset.tab)
      updateChart()
    })
  })
}

function setInitialContractButtons() {
  const chain = ['ng', 'ttf', 'spot']
  dom.quickContracts.innerHTML = chain.map(id => `<button class="contract-btn" data-prefix="${id}">${id.toUpperCase()}</button>`).join('')
  dom.quickContracts.querySelectorAll('.contract-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.choice = btn.dataset.prefix
      if (appState.choice === 'ng') activateTab('market')
      if (appState.choice === 'ttf') activateTab('market')
      if (appState.choice === 'spot') activateTab('market')
      updateChart()
    })
  })
}

async function initApp() {
  initPanelNavigation()
  setInitialContractButtons()
  dom.globalYear.value = appState.year
  dom.globalMonth.value = appState.month
  setControlInputs()
  activateTab('market')
  updateChart()
  updateLiveTickers()
  setInterval(updateLiveTickers, 90_000)
  dom.refreshBtn.addEventListener('click', () => {
    appState.seriesCache.clear()
    appState.curveCache = null
    appState.expiryCache = null
    updateChart()
  })
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initTooltips === 'function') initTooltips()
  initApp()
})
