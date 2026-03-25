const PRICE_INSTRUMENT_META = {
  hh: { key: 'hh', label: 'Henry Hub', stamp: 'HH futures', tone: 'hh', color: '#00d4ff', currency: '$', unit: 'USD/MMBtu', prefix: 'NG' },
  ttf: { key: 'ttf', label: 'Dutch TTF', stamp: 'TTF futures', tone: 'ttf', color: '#ff8c00', currency: 'EUR ', unit: 'EUR/MWh', prefix: 'TG' },
  spot: { key: 'spot', label: 'Henry Hub Spot', stamp: 'Daily spot', tone: 'spot', color: '#a78bfa', currency: '$', unit: 'USD/MMBtu', prefix: 'SPOT' },
};

function getPriceInstrumentMeta(instrument) {
  return PRICE_INSTRUMENT_META[instrument] || PRICE_INSTRUMENT_META.hh;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function timeKey(time) {
  return typeof time === 'string' ? time : JSON.stringify(time);
}

function buildTimeLookup(points, timeResolver = point => point.date) {
  const lookup = new Map();
  points.forEach(point => lookup.set(timeKey(timeResolver(point)), point));
  return lookup;
}

function getAvailableContractYears(instrument, month) {
  const years = new Set();
  const store = instrument === 'ttf' ? STATE.ttf : STATE.hh;
  const prefix = instrument === 'ttf' ? 'TG' : 'NG';

  if (store[month] && store[month].contracts) {
    Object.keys(store[month].contracts).forEach(ticker => {
      const yr = parseInt(ticker.slice(3), 10);
      if (Number.isFinite(yr)) years.add(yr < 50 ? 2000 + yr : 1900 + yr);
    });
  }

  if (instrument === 'hh') {
    Object.keys(STATE.liveData).forEach(ticker => {
      if (!ticker.startsWith(prefix + MONTH_CODES[month])) return;
      const yr = parseInt(ticker.slice(3, 5), 10);
      if (Number.isFinite(yr)) years.add(yr < 50 ? 2000 + yr : 1900 + yr);
    });
  }

  return [...years].sort((a, b) => b - a);
}

function getSpotYears() {
  const years = new Set();
  MONTHS.forEach(month => {
    const yearMap = STATE.spot[month] && STATE.spot[month].years;
    if (!yearMap) return;
    Object.keys(yearMap).forEach(year => years.add(parseInt(year, 10)));
  });
  return [...years].filter(Number.isFinite).sort((a, b) => b - a);
}

function getSpotSeries(year) {
  if (!year) return [];
  const points = [];
  MONTHS.forEach(month => {
    const series = STATE.spot[month] && STATE.spot[month].years && STATE.spot[month].years[String(year)];
    if (!series) return;
    series.forEach(point => points.push({ date: point.date, p: point.p, month, d: 0 }));
  });
  points.sort((a, b) => a.date.localeCompare(b.date));

  const deduped = [];
  const seen = new Set();
  points.forEach(point => {
    if (seen.has(point.date)) return;
    seen.add(point.date);
    deduped.push(point);
  });
  deduped.forEach((point, index) => {
    point.d = index + 1;
  });
  return deduped;
}

function getRangeLimit(length, tdayIndex) {
  const idx = clamp(tdayIndex || 0, 0, TDAY_STEPS.length - 1);
  const step = TDAY_STEPS[idx] || 0;
  return step > 0 ? Math.min(step, length) : 0;
}

function formatDisplayDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return '--';
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatInstrumentValue(instrument, value) {
  if (!Number.isFinite(value)) return '--';
  return `${getPriceInstrumentMeta(instrument).currency}${value.toFixed(3)}`;
}

function syncPriceViewState() {
  const view = STATE.priceView;
  if (!PRICE_INSTRUMENT_META[view.instrument]) view.instrument = 'hh';
  view.tdayIndex = clamp(view.tdayIndex || 0, 0, TDAY_STEPS.length - 1);
  view.compare = Boolean(view.compare);
  view.tradingDays = Boolean(view.tradingDays);

  if (view.instrument === 'spot') {
    const years = getSpotYears();
    view.spotYear = years.includes(view.spotYear) ? view.spotYear : (years[0] || null);
    view.spotMonth = MONTHS.includes(view.spotMonth) ? view.spotMonth : '';
    view.compare = false;
    view.compareYear = null;
    return;
  }

  view.month = MONTHS.includes(view.month) ? view.month : 'Jan';
  const years = getAvailableContractYears(view.instrument, view.month);
  view.year = years.includes(view.year) ? view.year : (years[0] || null);
  const compareYears = years.filter(year => year !== view.year);
  if (!compareYears.length) {
    view.compare = false;
    view.compareYear = null;
  } else if (!compareYears.includes(view.compareYear)) {
    view.compareYear = compareYears[0];
  }
}

function ensureChartTooltip(container) {
  let tooltip = container.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip hidden';
    container.appendChild(tooltip);
  }
  return tooltip;
}

function readSeriesValue(seriesPoint) {
  if (!seriesPoint) return null;
  if (Number.isFinite(seriesPoint.value)) return seriesPoint.value;
  if (Number.isFinite(seriesPoint.close)) return seriesPoint.close;
  if (Number.isFinite(seriesPoint.high)) return seriesPoint.high;
  return null;
}

function attachChartTooltip(options) {
  const { chart, container, titleColor, seriesConfigs, getTitle, getNote } = options;
  const tooltip = ensureChartTooltip(container);

  chart.subscribeCrosshairMove(param => {
    const point = param && param.point;
    if (!param || !param.time || !point || point.x < 0 || point.y < 0 || point.x > container.clientWidth || point.y > container.clientHeight) {
      tooltip.classList.add('hidden');
      return;
    }

    const rows = [];
    seriesConfigs.forEach(config => {
      if (!config || !config.series) return;
      const rawPoint = param.seriesData.get(config.series);
      const resolvedPoint = typeof config.getPoint === 'function' ? config.getPoint(param, rawPoint) : null;
      let value = readSeriesValue(rawPoint);
      if (!Number.isFinite(value) && resolvedPoint) value = Number.isFinite(resolvedPoint.value) ? resolvedPoint.value : resolvedPoint.p;
      if (!Number.isFinite(value)) return;
      rows.push({
        label: config.label,
        color: config.color,
        valueText: typeof config.formatValue === 'function' ? config.formatValue(value, resolvedPoint, param) : value.toFixed(3),
        priority: config.priority || 0,
      });
    });

    if (!rows.length) {
      tooltip.classList.add('hidden');
      return;
    }

    rows.sort((a, b) => a.priority - b.priority);
    const title = typeof getTitle === 'function' ? getTitle(param) : '';
    const note = typeof getNote === 'function' ? getNote(param) : '';
    tooltip.innerHTML = `<div class="chart-tooltip-title" style="color:${titleColor || 'var(--accent-hh)'};">${title}</div>${rows.map(row => `<div class="chart-tooltip-row"><span class="chart-tooltip-label"><span class="chart-tooltip-swatch" style="background:${row.color};"></span><span>${row.label}</span></span><span class="chart-tooltip-value">${row.valueText}</span></div>`).join('')}${note ? `<div class="chart-tooltip-note">${note}</div>` : ''}`;
    tooltip.classList.remove('hidden');

    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const padding = 16;
    let left = point.x + 18;
    let top = point.y + 18;
    if (left + width + padding > container.clientWidth) left = point.x - width - 18;
    if (top + height + padding > container.clientHeight) top = container.clientHeight - height - padding;
    tooltip.style.left = `${Math.max(padding, left)}px`;
    tooltip.style.top = `${Math.max(padding, top)}px`;
  });
}

function cyclePriceYear(direction) {
  syncPriceViewState();
  const view = STATE.priceView;
  const years = view.instrument === 'spot' ? getSpotYears() : getAvailableContractYears(view.instrument, view.month);
  const currentYear = view.instrument === 'spot' ? view.spotYear : view.year;
  const nextIndex = years.indexOf(currentYear) + direction;
  if (nextIndex < 0 || nextIndex >= years.length) return;
  if (view.instrument === 'spot') {
    view.spotYear = years[nextIndex];
  } else {
    view.year = years[nextIndex];
    const compareYears = years.filter(year => year !== view.year);
    if (view.compare && compareYears.length && !compareYears.includes(view.compareYear)) view.compareYear = compareYears[0];
  }
  renderPricesControls();
  updatePricesChart();
}

function renderPricesTab() {
  const container = document.getElementById('tab-prices');
  if (!container.dataset.built) {
    container.dataset.built = '1';
    container.innerHTML = `
      <div class="contract-header" id="prices-header">
        <span class="ticker" id="prices-ticker">--</span>
        <span class="desc" id="prices-desc">Unified Henry Hub, Dutch TTF, and spot explorer</span>
        <span class="instrument-stamp"><span class="instrument-dot" id="prices-instrument-dot"></span><span id="prices-instrument-label">Henry Hub</span></span>
        <span class="price" id="prices-price">--</span>
        <span class="change" id="prices-change">--</span>
      </div>
      <div class="card" style="margin-bottom:var(--gap);"><div id="prices-controls" class="prices-control-grid"></div></div>
      <div class="flex gap" style="flex-wrap:wrap;">
        <div class="grow" style="min-width:0;">
          <div class="card" style="padding:0;"><div class="chart-wrap" id="prices-chart-container"></div></div>
          <div class="card chart-footer" style="margin-top:var(--gap);"><div class="range-track"><div class="range-window" id="prices-range-window"></div></div><div class="chart-readout" id="prices-range-readout">Awaiting data</div></div>
          <div class="card" style="margin-top:var(--gap);padding:10px 14px;"><div class="flex gap wrap" id="prices-summary-bar" style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);"></div></div>
        </div>
        <div class="sidebar-stack">
          <div class="card" id="prices-stats"></div>
          <div class="card" style="margin-top:var(--gap);max-height:320px;overflow-y:auto;" id="prices-history-table"></div>
        </div>
      </div>
    `;
  }

  syncPriceViewState();
  renderPricesControls();
  updatePricesChart();
}

function renderPricesControls() {
  syncPriceViewState();
  const controls = document.getElementById('prices-controls');
  if (!controls) return;

  const view = STATE.priceView;
  const meta = getPriceInstrumentMeta(view.instrument);
  const isSpot = view.instrument === 'spot';
  const years = isSpot ? getSpotYears() : getAvailableContractYears(view.instrument, view.month);
  const compareYears = years.filter(year => year !== view.year);
  const rangeLimit = TDAY_STEPS[clamp(view.tdayIndex, 0, TDAY_STEPS.length - 1)] || 0;
  const rangeLabel = rangeLimit === 0 ? 'All history' : `Last ${rangeLimit}`;

  controls.innerHTML = `
    <div class="flex flex-col gap-sm" style="min-width:260px;">
      <label>Market</label>
      <div class="segment-switch" id="prices-instrument-switch">
        ${Object.values(PRICE_INSTRUMENT_META).map(entry => `<button class="segment-btn ${view.instrument === entry.key ? 'active' : ''}" data-instrument="${entry.key}" data-tone="${entry.tone}">${entry.label}</button>`).join('')}
      </div>
    </div>
    ${isSpot ? `
      <div class="flex flex-col gap-sm">
        <label>Year</label>
        <select id="prices-spot-year">${years.map(year => `<option value="${year}" ${year === view.spotYear ? 'selected' : ''}>${year}</option>`).join('')}</select>
      </div>
      <div class="flex flex-col gap-sm">
        <label>Highlight Month</label>
        <select id="prices-spot-month">
          <option value="">All Months</option>
          ${MONTHS.map(month => `<option value="${month}" ${month === view.spotMonth ? 'selected' : ''}>${month}</option>`).join('')}
        </select>
      </div>
    ` : `
      <div class="flex flex-col gap-sm">
        <label>Month</label>
        <select id="prices-month">${MONTHS.map(month => `<option value="${month}" ${month === view.month ? 'selected' : ''}>${month}</option>`).join('')}</select>
      </div>
      <div class="flex flex-col gap-sm">
        <label>Year</label>
        <select id="prices-year">${years.map(year => `<option value="${year}" ${year === view.year ? 'selected' : ''}>${year}</option>`).join('')}</select>
      </div>
    `}
    <div class="flex flex-col gap-sm" style="min-width:210px;">
      <label>${isSpot ? 'Window' : 'Range'}: <span id="prices-tday-label">${rangeLabel}</span></label>
      <input type="range" id="prices-tday" min="0" max="${TDAY_STEPS.length - 1}" value="${view.tdayIndex}">
    </div>
    ${!isSpot ? `
      <button class="toggle-btn ${view.tradingDays ? 'active' : ''}" data-tone="${meta.tone}" id="prices-mode-toggle">Trading Days</button>
      <button class="toggle-btn ${view.compare ? 'active' : ''}" data-tone="${meta.tone}" id="prices-compare-toggle" ${compareYears.length ? '' : 'disabled'}>Compare Mode</button>
      ${view.compare && compareYears.length ? `<div class="flex flex-col gap-sm"><label>Compare Year</label><select id="prices-compare-year">${compareYears.map(year => `<option value="${year}" ${year === view.compareYear ? 'selected' : ''}>${year}</option>`).join('')}</select></div>` : ''}
    ` : `<div class="prices-context" style="min-height:40px;"><span class="instrument-stamp"><span class="instrument-dot" style="background:${meta.color};"></span>Seasonality and spike markers enabled</span></div>`}
  `;

  controls.querySelectorAll('.segment-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (STATE.priceView.instrument === button.dataset.instrument) return;
      STATE.priceView.instrument = button.dataset.instrument;
      syncPriceViewState();
      renderPricesControls();
      updatePricesChart();
    });
  });

  document.getElementById('prices-tday').addEventListener('input', event => {
    STATE.priceView.tdayIndex = parseInt(event.target.value, 10) || 0;
    renderPricesControls();
    updatePricesChart();
  });

  if (isSpot) {
    document.getElementById('prices-spot-year').addEventListener('change', event => {
      STATE.priceView.spotYear = parseInt(event.target.value, 10) || null;
      updatePricesChart();
    });
    document.getElementById('prices-spot-month').addEventListener('change', event => {
      STATE.priceView.spotMonth = event.target.value;
      updatePricesChart();
    });
    return;
  }

  document.getElementById('prices-month').addEventListener('change', event => {
    STATE.priceView.month = event.target.value;
    syncPriceViewState();
    renderPricesControls();
    updatePricesChart();
  });
  document.getElementById('prices-year').addEventListener('change', event => {
    STATE.priceView.year = parseInt(event.target.value, 10) || null;
    syncPriceViewState();
    renderPricesControls();
    updatePricesChart();
  });
  document.getElementById('prices-mode-toggle').addEventListener('click', () => {
    STATE.priceView.tradingDays = !STATE.priceView.tradingDays;
    renderPricesControls();
    updatePricesChart();
  });

  const compareToggle = document.getElementById('prices-compare-toggle');
  if (compareToggle) {
    compareToggle.addEventListener('click', () => {
      if (!compareYears.length) return;
      STATE.priceView.compare = !STATE.priceView.compare;
      syncPriceViewState();
      renderPricesControls();
      updatePricesChart();
    });
  }

  const compareSelect = document.getElementById('prices-compare-year');
  if (compareSelect) {
    compareSelect.addEventListener('change', event => {
      STATE.priceView.compareYear = parseInt(event.target.value, 10) || null;
      updatePricesChart();
    });
  }
}

function updatePricesRangeFooter(fullData, filteredData) {
  const rangeWindow = document.getElementById('prices-range-window');
  const rangeReadout = document.getElementById('prices-range-readout');
  if (!rangeWindow || !rangeReadout || !fullData.length || !filteredData.length) return;

  const startIndex = Math.max(0, fullData.length - filteredData.length);
  const left = fullData.length > 1 ? (startIndex / (fullData.length - 1)) * 100 : 0;
  const width = fullData.length > 1 ? (filteredData.length / fullData.length) * 100 : 100;
  rangeWindow.style.left = `${left}%`;
  rangeWindow.style.width = `${Math.max(width, 8)}%`;

  const start = filteredData[0];
  const end = filteredData[filteredData.length - 1];
  rangeReadout.innerHTML = `<span>${formatDisplayDate(start.date)}</span><span style="color:var(--text-muted);">to</span><span>${formatDisplayDate(end.date)}</span><span style="color:var(--text-muted);">|</span><span>${filteredData.length}/${fullData.length} points</span>`;
}

function renderPricesSummaryBar(context) {
  const summaryBar = document.getElementById('prices-summary-bar');
  if (!summaryBar) return;

  const { instrument, fullData, filteredData, changePct, stats, currentPoint, seasonal, spikeCount } = context;
  const items = [
    `Window <span style="color:var(--text-primary);">${filteredData.length}/${fullData.length}</span>`,
    `High / Low <span style="color:var(--text-primary);">${formatInstrumentValue(instrument, stats.max)} / ${formatInstrumentValue(instrument, stats.min)}</span>`,
    `From Open <span class="${changePct >= 0 ? 'positive' : 'negative'}">${formatPercent(changePct)}</span>`,
  ];

  if (instrument === 'hh' && seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    const seasonalDelta = ((currentPoint.p - seasonal.avg) / seasonal.avg) * 100;
    items.push(`vs 5Y Avg <span class="${seasonalDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(seasonalDelta)}</span>`);
  } else if (instrument === 'spot') {
    items.push(`Spike Markers <span style="color:var(--accent-spot);">${spikeCount}</span>`);
  } else {
    items.push(`Average <span style="color:var(--text-primary);">${formatInstrumentValue(instrument, stats.avg)}</span>`);
  }

  summaryBar.innerHTML = items.map(item => `<span>${item}</span>`).join('<span style="color:var(--text-muted);">|</span>');
}

function renderPricesStats(context) {
  const statsEl = document.getElementById('prices-stats');
  if (!statsEl) return;

  const { instrument, meta, fullData, changePct, currentPoint, stats, ticker, view, seasonal, spikeCount } = context;
  let extraBlock = '';

  if (instrument === 'hh' && seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    const seasonalDelta = ((currentPoint.p - seasonal.avg) / seasonal.avg) * 100;
    const percentile = seasonal.max !== seasonal.min ? Math.round(((currentPoint.p - seasonal.min) / (seasonal.max - seasonal.min)) * 100) : 50;
    const isLive = Boolean(STATE.liveData[`${ticker}.NYM`]);
    extraBlock = `
      <div class="stat"><div class="stat-label">vs 5Y Seasonal Avg</div><div style="font-family:var(--font-mono);font-size:14px;" class="${seasonalDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(seasonalDelta)}</div></div>
      <div class="stat"><div class="stat-label">5Y Range Position</div><div style="font-family:var(--font-mono);font-size:13px;color:var(--text-secondary);">${percentile}th percentile</div></div>
      <div class="stat"><div class="stat-label">Status</div><div style="font-family:var(--font-mono);font-size:12px;padding:3px 8px;border-radius:4px;display:inline-block;background:${isLive ? 'rgba(0,255,136,0.1)' : 'rgba(136,136,170,0.1)'};color:${isLive ? 'var(--positive)' : 'var(--text-muted)'};">${isLive ? 'ACTIVE - LIVE DATA' : 'HISTORICAL'}</div></div>
    `;
  } else if (instrument === 'spot') {
    const globalAvg = STATE.spotStats.avg;
    const globalStd = STATE.spotStats.stddev;
    const avgDelta = globalAvg ? ((stats.avg - globalAvg) / globalAvg) * 100 : 0;
    extraBlock = `
      <div class="stat"><div class="stat-label">Year vs Global Avg</div><div style="font-family:var(--font-mono);font-size:14px;" class="${avgDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(avgDelta)}</div></div>
      <div class="stat"><div class="stat-label">Spike Markers</div><div class="stat-value" style="color:var(--accent-spot);">${spikeCount}</div></div>
      <div class="stat"><div class="stat-label">Global Avg / Sigma</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${formatInstrumentValue('spot', globalAvg)} / ${formatInstrumentValue('spot', globalStd)}</div></div>
    `;
  } else {
    extraBlock = `
      <div class="stat"><div class="stat-label">Instrument</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${meta.label} contract</div></div>
      <div class="stat"><div class="stat-label">Compare Mode</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${view.compare ? `Enabled vs ${view.compareYear}` : 'Off'}</div></div>
    `;
  }

  statsEl.innerHTML = `
    <div class="card-title">${meta.label} Snapshot</div>
    <div class="stat">
      <div class="stat-label">${instrument === 'spot' ? 'Observations' : 'Trading Days'}</div>
      <div class="stat-value">${fullData.length} <span style="font-size:13px;color:var(--text-muted)">/ ${instrument === 'spot' ? fullData.length : 519}</span></div>
      ${instrument === 'spot' ? '' : `<div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${Math.round(fullData.length / 519 * 100)}%;background:${meta.color};"></div></div>`}
    </div>
    <div class="stat"><div class="stat-label">High / Low / Avg</div><div style="font-family:var(--font-mono);font-size:13px;">${formatInstrumentValue(instrument, stats.max)} / ${formatInstrumentValue(instrument, stats.min)} / ${formatInstrumentValue(instrument, stats.avg)}</div></div>
    <div class="stat"><div class="stat-label">From Open</div><div style="font-family:var(--font-mono);font-size:13px;" class="${changePct >= 0 ? 'positive' : 'negative'}">${formatPercent(changePct)}</div></div>
    <div class="stat"><div class="stat-label">Last Print</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${formatDisplayDate(currentPoint.date)}</div></div>
    ${extraBlock}
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="toggle-btn" onclick="cyclePriceYear(1)">Prev Year</button>
      <button class="toggle-btn" onclick="cyclePriceYear(-1)">Next Year</button>
    </div>
  `;
}

function renderPricesHistoryTable(context) {
  const tableEl = document.getElementById('prices-history-table');
  if (!tableEl) return;
  const { instrument, view } = context;

  if (instrument === 'hh') {
    let rows = '';
    Object.keys(STATE.expiry).sort((a, b) => b - a).forEach(year => {
      const price = STATE.expiry[year] && STATE.expiry[year][view.month];
      if (price == null) return;
      const priorYear = String(parseInt(year, 10) - 1);
      const prior = STATE.expiry[priorYear] ? STATE.expiry[priorYear][view.month] : null;
      const delta = prior ? ((price - prior) / prior) * 100 : null;
      rows += `<tr><td style="text-align:left;">${year}</td><td>${formatInstrumentValue('hh', price)}</td><td class="${delta !== null ? (delta >= 0 ? 'positive' : 'negative') : ''}">${delta !== null ? formatPercent(delta) : '--'}</td></tr>`;
    });
    tableEl.innerHTML = `<div class="card-title">Same Month Expiry History</div><table><thead><tr><th style="text-align:left;">Year</th><th>Expiry</th><th>Delta vs Prior</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No expiry data</td></tr>'}</tbody></table>`;
    return;
  }

  if (instrument === 'ttf') {
    const rows = getAvailableContractYears('ttf', view.month).slice(0, 12).map(year => {
      const yy = year % 100;
      const pad = yy < 10 ? '0' + yy : '' + yy;
      const ticker = `TG${MONTH_CODES[view.month]}${pad}`;
      const data = getTTFContractData(ticker);
      if (!data.length) return '';
      const stats = getSeriesStats(data);
      const change = data[0].p ? ((data[data.length - 1].p - data[0].p) / data[0].p) * 100 : 0;
      return `<tr><td style="text-align:left;">${ticker}</td><td>${formatInstrumentValue('ttf', data[data.length - 1].p)}</td><td>${formatInstrumentValue('ttf', stats.avg)}</td><td class="${change >= 0 ? 'positive' : 'negative'}">${formatPercent(change)}</td></tr>`;
    }).join('');
    tableEl.innerHTML = `<div class="card-title">TTF Contract Ladder</div><table><thead><tr><th style="text-align:left;">Contract</th><th>Last</th><th>Avg</th><th>From Open</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No TTF contracts found</td></tr>'}</tbody></table>`;
    return;
  }

  const rows = MONTHS.map(month => {
    const series = STATE.spot[month] && STATE.spot[month].years && STATE.spot[month].years[String(view.spotYear)];
    if (!series || !series.length) return `<tr><td style="text-align:left;">${month}</td><td>--</td><td>--</td><td>--</td></tr>`;
    const stats = getSeriesStats(series);
    return `<tr><td style="text-align:left;">${month}</td><td>${formatInstrumentValue('spot', stats.avg)}</td><td>${formatInstrumentValue('spot', stats.max)}</td><td>${formatInstrumentValue('spot', stats.min)}</td></tr>`;
  }).join('');
  tableEl.innerHTML = `<div class="card-title">Monthly Spot Summary</div><table><thead><tr><th style="text-align:left;">Month</th><th>Average</th><th>High</th><th>Low</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function updatePricesChart() {
  syncPriceViewState();
  const view = STATE.priceView;
  const meta = getPriceInstrumentMeta(view.instrument);
  const isSpot = view.instrument === 'spot';
  const useTradingAxis = !isSpot && (view.tradingDays || view.compare);

  let ticker = meta.prefix;
  let fullData = [];
  let compareData = [];
  let compareTicker = '';

  if (isSpot) {
    fullData = getSpotSeries(view.spotYear);
    ticker = `SPOT ${view.spotYear || '--'}`;
  } else {
    const yy = view.year % 100;
    const pad = yy < 10 ? '0' + yy : '' + yy;
    ticker = `${meta.prefix}${MONTH_CODES[view.month]}${pad}`;
    fullData = view.instrument === 'ttf' ? getTTFContractData(ticker) : getContractData(ticker);
    if (view.compare && view.compareYear) {
      const compareYY = view.compareYear % 100;
      const comparePad = compareYY < 10 ? '0' + compareYY : '' + compareYY;
      compareTicker = `${meta.prefix}${MONTH_CODES[view.month]}${comparePad}`;
      compareData = view.instrument === 'ttf' ? getTTFContractData(compareTicker) : getContractData(compareTicker);
    }
  }

  const tickerEl = document.getElementById('prices-ticker');
  const descEl = document.getElementById('prices-desc');
  const priceEl = document.getElementById('prices-price');
  const changeEl = document.getElementById('prices-change');
  const labelEl = document.getElementById('prices-instrument-label');
  const dotEl = document.getElementById('prices-instrument-dot');

  labelEl.textContent = meta.stamp;
  dotEl.style.background = meta.color;
  tickerEl.style.color = meta.color;
  tickerEl.textContent = ticker;

  if (!fullData.length) {
    removeChart('prices');
    descEl.textContent = 'No data available for the selected view';
    priceEl.textContent = 'No data';
    changeEl.textContent = '';
    document.getElementById('prices-summary-bar').innerHTML = '';
    document.getElementById('prices-stats').innerHTML = '';
    document.getElementById('prices-history-table').innerHTML = '';
    return;
  }

  const rangeLimit = getRangeLimit(fullData.length, view.tdayIndex);
  const filteredData = rangeLimit > 0 && fullData.length > rangeLimit ? fullData.slice(fullData.length - rangeLimit) : fullData.slice();
  const currentPoint = fullData[fullData.length - 1];
  const openPoint = fullData[0];
  const changePct = openPoint && openPoint.p ? ((currentPoint.p - openPoint.p) / openPoint.p) * 100 : 0;
  const stats = getSeriesStats(fullData);

  descEl.textContent = isSpot
    ? `${view.spotYear} daily spot history - ${meta.unit}`
    : `${view.month.toUpperCase()} ${view.year} contract - ${meta.unit}${useTradingAxis ? ' - trading-day aligned' : ''}`;
  priceEl.textContent = formatInstrumentValue(view.instrument, currentPoint.p);
  changeEl.textContent = `${formatPercent(changePct)} from open`;
  changeEl.className = 'change ' + (changePct >= 0 ? 'positive' : 'negative');

  const chartContainer = document.getElementById('prices-chart-container');
  const chart = createManagedChart('prices', 'main', chartContainer);
  const timeResolver = point => useTradingAxis ? dayToTime(point.d) : point.date;
  const mainLookup = buildTimeLookup(filteredData, timeResolver);

  let seasonalPoint = null;
  let seasonalAvgSeries = null;
  let seasonalLookup = new Map();

  if (view.instrument === 'hh') {
    const seasonal = STATE.seasonalCache[view.month];
    if (seasonal) {
      const bandUpper = [];
      const bandLower = [];
      const avgLine = [];
      filteredData.forEach(point => {
        const seasonalStats = seasonal[point.d];
        if (!seasonalStats) return;
        const time = timeResolver(point);
        bandUpper.push({ time, value: seasonalStats.max });
        bandLower.push({ time, value: seasonalStats.min });
        avgLine.push({ time, value: seasonalStats.avg });
        seasonalLookup.set(timeKey(time), { value: seasonalStats.avg, seasonal: seasonalStats, d: point.d, date: point.date });
      });

      if (bandUpper.length) {
        const upperSeries = chart.addAreaSeries({ topColor: 'rgba(0, 212, 255, 0.08)', bottomColor: 'rgba(0, 212, 255, 0.01)', lineColor: 'rgba(0, 212, 255, 0.18)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        upperSeries.setData(bandUpper);
        const lowerSeries = chart.addAreaSeries({ topColor: 'transparent', bottomColor: 'transparent', lineColor: 'rgba(0, 212, 255, 0.18)', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        lowerSeries.setData(bandLower);
        seasonalAvgSeries = chart.addLineSeries({ color: 'rgba(0, 212, 255, 0.45)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        seasonalAvgSeries.setData(avgLine);
        seasonalPoint = seasonal[currentPoint.d] || null;
      }
    }
  }

  const mainSeries = chart.addLineSeries({ color: meta.color, lineWidth: 2.5, priceLineVisible: true, lastValueVisible: true, crosshairMarkerVisible: true, crosshairMarkerRadius: 4 });
  mainSeries.setData(filteredData.map(point => ({ time: timeResolver(point), value: point.p })));

  let compareSeries = null;
  let compareLookup = new Map();
  if (compareTicker && compareData.length) {
    const compareWindow = rangeLimit > 0 && compareData.length > rangeLimit ? compareData.slice(compareData.length - rangeLimit) : compareData.slice();
    compareSeries = chart.addLineSeries({ color: '#ffcc66', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true });
    compareSeries.setData(compareWindow.map(point => ({ time: useTradingAxis ? dayToTime(point.d) : point.date, value: point.p })));
    compareLookup = buildTimeLookup(compareWindow, point => useTradingAxis ? dayToTime(point.d) : point.date);
  }
  let rollingSeries = null;
  let rollingLookup = new Map();
  let highlightSeries = null;
  let highlightLookup = new Map();
  let spikeCount = 0;

  if (isSpot) {
    if (filteredData.length > 20) {
      const rollingData = [];
      for (let index = 19; index < filteredData.length; index++) {
        const slice = filteredData.slice(index - 19, index + 1);
        rollingData.push({ time: filteredData[index].date, value: slice.reduce((sum, point) => sum + point.p, 0) / slice.length });
      }
      rollingSeries = chart.addLineSeries({ color: 'rgba(255, 204, 102, 0.7)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      rollingSeries.setData(rollingData);
      rollingLookup = new Map(rollingData.map(point => [timeKey(point.time), point]));
    }

    if (view.spotMonth) {
      const focusedPoints = filteredData.filter(point => point.month === view.spotMonth);
      if (focusedPoints.length) {
        highlightSeries = chart.addLineSeries({ color: '#ff9ff3', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: true });
        highlightSeries.setData(focusedPoints.map(point => ({ time: point.date, value: point.p })));
        highlightLookup = buildTimeLookup(focusedPoints, point => point.date);
      }
    }

    const spikeThreshold = STATE.spotStats.avg + 2 * STATE.spotStats.stddev;
    const spikeMarkers = filteredData.filter(point => Number.isFinite(point.p) && Number.isFinite(spikeThreshold) && point.p > spikeThreshold).map(point => ({
      time: point.date,
      position: 'aboveBar',
      color: point.p > STATE.spotStats.avg * 3 ? '#ff4455' : '#ffcc00',
      shape: 'circle',
      text: point.p > STATE.spotStats.avg * 3 ? formatInstrumentValue('spot', point.p) : '',
    }));
    spikeCount = spikeMarkers.length;
    if (spikeMarkers.length) mainSeries.setMarkers(spikeMarkers);
  }

  chart.timeScale().fitContent();

  attachChartTooltip({
    chart,
    container: chartContainer,
    titleColor: meta.color,
    seriesConfigs: [
      { series: mainSeries, label: meta.label, color: meta.color, priority: 0, getPoint: param => mainLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) },
      seasonalAvgSeries ? { series: seasonalAvgSeries, label: '5Y Avg', color: 'rgba(0, 212, 255, 0.45)', priority: 1, getPoint: param => seasonalLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue('hh', value) } : null,
      compareSeries ? { series: compareSeries, label: compareTicker, color: '#ffcc66', priority: 2, getPoint: param => compareLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) } : null,
      rollingSeries ? { series: rollingSeries, label: '20D Avg', color: 'rgba(255, 204, 102, 0.7)', priority: 3, getPoint: param => rollingLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue('spot', value) } : null,
      highlightSeries ? { series: highlightSeries, label: `${view.spotMonth} Focus`, color: '#ff9ff3', priority: 4, getPoint: param => highlightLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue('spot', value) } : null,
    ].filter(Boolean),
    getTitle: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      return point ? formatDisplayDate(point.date) : 'Price detail';
    },
    getNote: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      if (!point) return '';
      if (view.instrument === 'spot') return `${point.month} ${view.spotYear} | observation ${point.d}`;
      const noteParts = [`T-Day ${point.d}`];
      if (view.compare) noteParts.push('compare aligned');
      if (Number.isFinite(point.o) && Number.isFinite(point.h) && Number.isFinite(point.l)) noteParts.push(`O ${point.o.toFixed(3)} / H ${point.h.toFixed(3)} / L ${point.l.toFixed(3)}`);
      return noteParts.join(' | ');
    },
  });

  updatePricesRangeFooter(fullData, filteredData);
  renderPricesSummaryBar({ instrument: view.instrument, fullData, filteredData, changePct, stats, currentPoint, seasonal: seasonalPoint, spikeCount });
  renderPricesStats({ instrument: view.instrument, meta, fullData, changePct, currentPoint, stats, ticker, view, seasonal: seasonalPoint, spikeCount });
  renderPricesHistoryTable({ instrument: view.instrument, view });
}
