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

function timeToStamp(time) {
  if (!time) return 0;
  if (typeof time === 'string') return new Date(time).getTime();
  if (typeof time === 'number') return time;
  if (typeof time === 'object' && Number.isFinite(time.year)) {
    return Date.UTC(time.year, (time.month || 1) - 1, time.day || 1);
  }
  return 0;
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

function getWindowOptions(length) {
  if (!Number.isFinite(length) || length <= 0) return [0];
  const options = TDAY_STEPS.filter(step => step > 0 && step < length);
  options.push(length);
  return options;
}

function getRangeIndex(length, tdayIndex) {
  const options = getWindowOptions(length);
  return clamp(tdayIndex || 0, 0, options.length - 1);
}

function getRangeLimit(length, tdayIndex) {
  if (!length) return 0;
  const options = getWindowOptions(length);
  return options[getRangeIndex(length, tdayIndex)];
}

function getRangeLabel(length, limit) {
  if (!length) return 'No data';
  return limit >= length ? 'Full span' : `${limit} days`;
}

function getRangeEdgeLabels(length) {
  const options = getWindowOptions(length);
  const minLabel = options.length > 1 ? `${options[0]}D` : 'Current span';
  return { minLabel, maxLabel: 'Full span' };
}

function enforceVisibleRange(chart, firstTime, lastTime) {
  if (!chart || !firstTime || !lastTime) return;
  const timeScale = chart.timeScale();
  let adjusting = false;

  const clampVisibleRange = range => {
    if (!range) return;
    const minStamp = timeToStamp(firstTime);
    const maxStamp = timeToStamp(lastTime);
    const fromStamp = timeToStamp(range.from);
    const toStamp = timeToStamp(range.to);
    let nextFrom = range.from;
    let nextTo = range.to;
    let changed = false;

    if (fromStamp < minStamp) {
      nextFrom = firstTime;
      changed = true;
    }
    if (toStamp > maxStamp) {
      nextTo = lastTime;
      changed = true;
    }

    if (changed) {
      adjusting = true;
      timeScale.setVisibleRange({ from: nextFrom, to: nextTo });
      adjusting = false;
    }
  };

  timeScale.applyOptions({
    rightOffset: 0,
    fixLeftEdge: true,
    fixRightEdge: true,
    lockVisibleTimeRangeOnResize: true,
    shiftVisibleRangeOnNewBar: false,
  });
  timeScale.setVisibleRange({ from: firstTime, to: lastTime });
  timeScale.subscribeVisibleTimeRangeChange(range => {
    if (adjusting || !range) return;
    clampVisibleRange(range);
  });
}

function getPriceTicker(instrument, month, year) {
  const meta = getPriceInstrumentMeta(instrument);
  if (!year) return meta.prefix;
  const yy = year % 100;
  const pad = yy < 10 ? '0' + yy : '' + yy;
  return `${meta.prefix}${MONTH_CODES[month]}${pad}`;
}

function getPrimaryPriceSeries(view) {
  if (view.instrument === 'spot') {
    return {
      ticker: `SPOT ${view.spotYear || '--'}`,
      fullData: getSpotSeries(view.spotYear),
    };
  }
  const ticker = getPriceTicker(view.instrument, view.month, view.year);
  return {
    ticker,
    fullData: view.instrument === 'ttf' ? getTTFContractData(ticker) : getContractData(ticker),
  };
}

function getComparePriceSeries(view) {
  if (view.instrument === 'spot' || !view.compare || !view.compareYear) {
    return { compareTicker: '', compareData: [] };
  }
  const compareTicker = getPriceTicker(view.instrument, view.month, view.compareYear);
  return {
    compareTicker,
    compareData: view.instrument === 'ttf' ? getTTFContractData(compareTicker) : getContractData(compareTicker),
  };
}

function getSeasonalEntry(view, point) {
  if (!point) return null;
  if (view.instrument === 'spot') {
    return point.date ? STATE.spotSeasonalCache[point.date.slice(5)] || null : null;
  }
  const cacheBucket = view.instrument === 'ttf' ? STATE.ttfSeasonalCache[view.month] : STATE.seasonalCache[view.month];
  return cacheBucket && cacheBucket[point.d] ? cacheBucket[point.d] : null;
}

function getSeasonalPalette(instrument) {
  if (instrument === 'ttf') {
    return {
      fillTop: 'rgba(255, 140, 0, 0.08)',
      fillBottom: 'rgba(255, 140, 0, 0.015)',
      line: 'rgba(255, 140, 0, 0.2)',
      avg: 'rgba(255, 191, 105, 0.6)',
    };
  }
  if (instrument === 'spot') {
    return {
      fillTop: 'rgba(167, 139, 250, 0.08)',
      fillBottom: 'rgba(167, 139, 250, 0.015)',
      line: 'rgba(210, 186, 255, 0.18)',
      avg: 'rgba(255, 170, 237, 0.5)',
    };
  }
  return {
    fillTop: 'rgba(0, 212, 255, 0.08)',
    fillBottom: 'rgba(0, 212, 255, 0.01)',
    line: 'rgba(0, 212, 255, 0.18)',
    avg: 'rgba(0, 212, 255, 0.45)',
  };
}

function schedulePricesChartUpdate(options = {}) {
  const normalizedOptions = Object.assign({ skipDetails: false }, options);
  STATE._pricesUpdateOptions = Object.assign({}, STATE._pricesUpdateOptions || {}, normalizedOptions);
  if (STATE._pricesUpdateFrame) return;
  STATE._pricesUpdateFrame = requestAnimationFrame(() => {
    const pending = STATE._pricesUpdateOptions || {};
    STATE._pricesUpdateFrame = null;
    STATE._pricesUpdateOptions = null;
    updatePricesChart(pending);
  });
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
  schedulePricesChartUpdate();
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
          <div class="card chart-footer" style="margin-top:var(--gap);">
            <div class="range-toolbar">
              <div class="flex flex-col gap-sm">
                <span class="range-kicker">Window</span>
                <span class="range-helper" id="prices-range-helper">Anchored to latest print</span>
              </div>
              <div class="range-scale-labels">
                <span id="prices-range-min-label">25D</span>
                <span id="prices-range-max-label">Full span</span>
              </div>
            </div>
            <div class="range-input-shell">
              <input type="range" id="prices-window-slider" min="0" max="0" value="0" aria-label="Price window slider">
            </div>
            <div class="chart-readout" id="prices-range-readout">Awaiting data</div>
          </div>
          <div class="card" style="margin-top:var(--gap);padding:10px 14px;"><div class="flex gap wrap" id="prices-summary-bar" style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);"></div></div>
        </div>
        <div class="sidebar-stack">
          <div class="card" id="prices-stats"></div>
          <div class="card" style="margin-top:var(--gap);max-height:320px;overflow-y:auto;" id="prices-history-table"></div>
        </div>
      </div>
    `;

    const windowSlider = document.getElementById('prices-window-slider');
    if (windowSlider) {
      windowSlider.addEventListener('input', event => {
        STATE.priceView.tdayIndex = parseInt(event.target.value, 10) || 0;
        schedulePricesChartUpdate({ skipDetails: true });
      });
    }
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
    ${!isSpot ? `
      <button class="toggle-btn ${view.tradingDays ? 'active' : ''}" data-tone="${meta.tone}" id="prices-mode-toggle">Trading Days</button>
      <button class="toggle-btn ${view.compare ? 'active' : ''}" data-tone="${meta.tone}" id="prices-compare-toggle" ${compareYears.length ? '' : 'disabled'}>Compare Mode</button>
      ${view.compare && compareYears.length ? `<div class="flex flex-col gap-sm"><label>Compare Year</label><select id="prices-compare-year">${compareYears.map(year => `<option value="${year}" ${year === view.compareYear ? 'selected' : ''}>${year}</option>`).join('')}</select></div>` : ''}
    ` : ''}
    <div class="prices-context" style="min-height:40px;">
      ${isSpot ? `<span class="instrument-stamp"><span class="instrument-dot" style="background:${meta.color};"></span>5Y calendar band enabled</span>` : ''}
      <span class="instrument-stamp">Use bottom rail for window</span>
    </div>
  `;

  controls.querySelectorAll('.segment-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (STATE.priceView.instrument === button.dataset.instrument) return;
      STATE.priceView.instrument = button.dataset.instrument;
      syncPriceViewState();
      renderPricesControls();
      schedulePricesChartUpdate();
    });
  });

  if (isSpot) {
    document.getElementById('prices-spot-year').addEventListener('change', event => {
      STATE.priceView.spotYear = parseInt(event.target.value, 10) || null;
      renderPricesControls();
      schedulePricesChartUpdate();
    });
    document.getElementById('prices-spot-month').addEventListener('change', event => {
      STATE.priceView.spotMonth = event.target.value;
      schedulePricesChartUpdate();
    });
    return;
  }

  document.getElementById('prices-month').addEventListener('change', event => {
    STATE.priceView.month = event.target.value;
    syncPriceViewState();
    renderPricesControls();
    schedulePricesChartUpdate();
  });
  document.getElementById('prices-year').addEventListener('change', event => {
    STATE.priceView.year = parseInt(event.target.value, 10) || null;
    syncPriceViewState();
    renderPricesControls();
    schedulePricesChartUpdate();
  });
  document.getElementById('prices-mode-toggle').addEventListener('click', () => {
    STATE.priceView.tradingDays = !STATE.priceView.tradingDays;
    renderPricesControls();
    schedulePricesChartUpdate();
  });

  const compareToggle = document.getElementById('prices-compare-toggle');
  if (compareToggle) {
    compareToggle.addEventListener('click', () => {
      if (!compareYears.length) return;
      STATE.priceView.compare = !STATE.priceView.compare;
      syncPriceViewState();
      renderPricesControls();
      schedulePricesChartUpdate();
    });
  }

  const compareSelect = document.getElementById('prices-compare-year');
  if (compareSelect) {
    compareSelect.addEventListener('change', event => {
      STATE.priceView.compareYear = parseInt(event.target.value, 10) || null;
      schedulePricesChartUpdate();
    });
  }
}

function updatePricesRangeFooter(fullData, filteredData) {
  const windowSlider = document.getElementById('prices-window-slider');
  const rangeReadout = document.getElementById('prices-range-readout');
  const minLabelEl = document.getElementById('prices-range-min-label');
  const maxLabelEl = document.getElementById('prices-range-max-label');
  const helperEl = document.getElementById('prices-range-helper');
  if (!windowSlider || !rangeReadout || !fullData.length || !filteredData.length) return;

  const rangeIndex = getRangeIndex(fullData.length, STATE.priceView.tdayIndex);
  const rangeLimit = getRangeLimit(fullData.length, rangeIndex);
  const windowOptions = getWindowOptions(fullData.length);
  const edgeLabels = getRangeEdgeLabels(fullData.length);
  STATE.priceView.tdayIndex = rangeIndex;

  windowSlider.min = '0';
  windowSlider.max = String(Math.max(windowOptions.length - 1, 0));
  windowSlider.value = String(rangeIndex);
  windowSlider.disabled = windowOptions.length <= 1;
  if (minLabelEl) minLabelEl.textContent = edgeLabels.minLabel;
  if (maxLabelEl) maxLabelEl.textContent = edgeLabels.maxLabel;
  if (helperEl) helperEl.textContent = `${getRangeLabel(fullData.length, rangeLimit)} anchored to latest print`;

  const start = filteredData[0];
  const end = filteredData[filteredData.length - 1];
  const label = getRangeLabel(fullData.length, filteredData.length);
  rangeReadout.innerHTML = `<span>${formatDisplayDate(start.date)}</span><span style="color:var(--text-muted);">to</span><span>${formatDisplayDate(end.date)}</span><span style="color:var(--text-muted);">|</span><span>${label}</span><span style="color:var(--text-muted);">|</span><span>${filteredData.length}/${fullData.length} points</span>`;
}

function renderPricesSummaryBar(context) {
  const summaryBar = document.getElementById('prices-summary-bar');
  if (!summaryBar) return;

  const { instrument, fullData, filteredData, changePct, stats, currentPoint, seasonal } = context;
  const items = [
    `Window <span style="color:var(--text-primary);">${filteredData.length}/${fullData.length}</span>`,
    `High / Low <span style="color:var(--text-primary);">${formatInstrumentValue(instrument, stats.max)} / ${formatInstrumentValue(instrument, stats.min)}</span>`,
    `From Open <span class="${changePct >= 0 ? 'positive' : 'negative'}">${formatPercent(changePct)}</span>`,
  ];

  if (seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    const seasonalDelta = ((currentPoint.p - seasonal.avg) / seasonal.avg) * 100;
    items.push(`vs 5Y Avg <span class="${seasonalDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(seasonalDelta)}</span>`);
  } else {
    items.push(`Average <span style="color:var(--text-primary);">${formatInstrumentValue(instrument, stats.avg)}</span>`);
  }

  summaryBar.innerHTML = items.map(item => `<span>${item}</span>`).join('<span style="color:var(--text-muted);">|</span>');
}

function renderPricesStats(context) {
  const statsEl = document.getElementById('prices-stats');
  if (!statsEl) return;

  const { instrument, meta, fullData, changePct, currentPoint, stats, ticker, view, seasonal } = context;
  let extraBlock = '';

  if (seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    const seasonalDelta = ((currentPoint.p - seasonal.avg) / seasonal.avg) * 100;
    const percentile = seasonal.max !== seasonal.min ? Math.round(((currentPoint.p - seasonal.min) / (seasonal.max - seasonal.min)) * 100) : 50;
    const statusBlock = instrument === 'hh'
      ? `<div class="stat"><div class="stat-label">Status</div><div style="font-family:var(--font-mono);font-size:12px;padding:3px 8px;border-radius:4px;display:inline-block;background:${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'rgba(0,255,136,0.1)' : 'rgba(136,136,170,0.1)'};color:${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'var(--positive)' : 'var(--text-muted)'};">${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'ACTIVE - LIVE DATA' : 'HISTORICAL'}</div></div>`
      : '';
    extraBlock = `
      <div class="stat"><div class="stat-label">vs 5Y Seasonal Avg</div><div style="font-family:var(--font-mono);font-size:14px;" class="${seasonalDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(seasonalDelta)}</div></div>
      <div class="stat"><div class="stat-label">5Y Range Position</div><div style="font-family:var(--font-mono);font-size:13px;color:var(--text-secondary);">${percentile}th percentile</div></div>
      <div class="stat"><div class="stat-label">5Y Range</div><div style="font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);">${formatInstrumentValue(instrument, seasonal.min)} / ${formatInstrumentValue(instrument, seasonal.max)}</div></div>
      ${statusBlock}
    `;
  } else if (instrument === 'spot') {
    const globalAvg = STATE.spotStats.avg;
    const globalStd = STATE.spotStats.stddev;
    const avgDelta = globalAvg ? ((stats.avg - globalAvg) / globalAvg) * 100 : 0;
    extraBlock = `
      <div class="stat"><div class="stat-label">Year vs Global Avg</div><div style="font-family:var(--font-mono);font-size:14px;" class="${avgDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(avgDelta)}</div></div>
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
    const years = getAvailableContractYears('ttf', view.month).slice(0, 12);
    const rows = years.map((year, index) => {
      const ticker = getPriceTicker('ttf', view.month, year);
      const data = getTTFContractData(ticker);
      if (!data.length) return '';
      const lastPrice = data[data.length - 1].p;
      const priorYear = years[index + 1];
      const priorData = priorYear ? getTTFContractData(getPriceTicker('ttf', view.month, priorYear)) : [];
      const priorPrice = priorData.length ? priorData[priorData.length - 1].p : null;
      const delta = Number.isFinite(priorPrice) && priorPrice !== 0 ? ((lastPrice - priorPrice) / priorPrice) * 100 : null;
      return `<tr><td style="text-align:left;">${year}</td><td>${formatInstrumentValue('ttf', lastPrice)}</td><td class="${delta !== null ? (delta >= 0 ? 'positive' : 'negative') : ''}">${delta !== null ? formatPercent(delta) : '--'}</td></tr>`;
    }).join('');
    tableEl.innerHTML = `<div class="card-title">Same Month TTF History</div><table><thead><tr><th style="text-align:left;">Year</th><th>Last Print</th><th>Delta vs Prior</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No TTF contracts found</td></tr>'}</tbody></table>`;
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

function updatePricesChart({ skipDetails = false } = {}) {
  syncPriceViewState();
  const view = STATE.priceView;
  const meta = getPriceInstrumentMeta(view.instrument);
  const isSpot = view.instrument === 'spot';
  const useTradingAxis = !isSpot && (view.tradingDays || view.compare);
  const primary = getPrimaryPriceSeries(view);
  const compare = getComparePriceSeries(view);
  const ticker = primary.ticker;
  const fullData = primary.fullData;
  const compareTicker = compare.compareTicker;
  const compareData = compare.compareData;

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
    const windowSlider = document.getElementById('prices-window-slider');
    const helperEl = document.getElementById('prices-range-helper');
    const minLabelEl = document.getElementById('prices-range-min-label');
    const maxLabelEl = document.getElementById('prices-range-max-label');
    const readoutEl = document.getElementById('prices-range-readout');
    if (windowSlider) {
      windowSlider.min = '0';
      windowSlider.max = '0';
      windowSlider.value = '0';
      windowSlider.disabled = true;
    }
    if (helperEl) helperEl.textContent = 'Awaiting data';
    if (minLabelEl) minLabelEl.textContent = '--';
    if (maxLabelEl) maxLabelEl.textContent = '--';
    if (readoutEl) readoutEl.textContent = 'Awaiting data';
    document.getElementById('prices-summary-bar').innerHTML = '';
    document.getElementById('prices-stats').innerHTML = '';
    document.getElementById('prices-history-table').innerHTML = '';
    return;
  }

  const rangeIndex = getRangeIndex(fullData.length, view.tdayIndex);
  const rangeLimit = getRangeLimit(fullData.length, rangeIndex);
  view.tdayIndex = rangeIndex;
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
  const seasonalPalette = getSeasonalPalette(view.instrument);
  const bandUpper = [];
  const bandLower = [];
  const avgLine = [];

  filteredData.forEach(point => {
    const seasonalStats = getSeasonalEntry(view, point);
    if (!seasonalStats) return;
    const time = timeResolver(point);
    bandUpper.push({ time, value: seasonalStats.max });
    bandLower.push({ time, value: seasonalStats.min });
    avgLine.push({ time, value: seasonalStats.avg });
    seasonalLookup.set(timeKey(time), { value: seasonalStats.avg, seasonal: seasonalStats, d: point.d, date: point.date });
  });

  if (bandUpper.length) {
    const upperSeries = chart.addAreaSeries({
      topColor: seasonalPalette.fillTop,
      bottomColor: seasonalPalette.fillBottom,
      lineColor: seasonalPalette.line,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    upperSeries.setData(bandUpper);

    const lowerSeries = chart.addAreaSeries({
      topColor: 'transparent',
      bottomColor: 'transparent',
      lineColor: seasonalPalette.line,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    lowerSeries.setData(bandLower);

    seasonalAvgSeries = chart.addLineSeries({
      color: seasonalPalette.avg,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    seasonalAvgSeries.setData(avgLine);
    seasonalPoint = getSeasonalEntry(view, currentPoint);
  }

  const mainSeries = chart.addLineSeries({
    color: meta.color,
    lineWidth: 2.5,
    priceLineVisible: true,
    lastValueVisible: true,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
  });
  mainSeries.setData(filteredData.map(point => ({ time: timeResolver(point), value: point.p })));

  let compareSeries = null;
  let compareLookup = new Map();
  if (compareTicker && compareData.length) {
    const compareWindow = rangeLimit > 0 && compareData.length > rangeLimit ? compareData.slice(compareData.length - rangeLimit) : compareData.slice();
    compareSeries = chart.addLineSeries({
      color: '#ffcc66',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });
    compareSeries.setData(compareWindow.map(point => ({ time: useTradingAxis ? dayToTime(point.d) : point.date, value: point.p })));
    compareLookup = buildTimeLookup(compareWindow, point => useTradingAxis ? dayToTime(point.d) : point.date);
  }

  let highlightSeries = null;
  let highlightLookup = new Map();
  if (isSpot && view.spotMonth) {
    const focusedPoints = filteredData.filter(point => point.month === view.spotMonth);
    if (focusedPoints.length) {
      highlightSeries = chart.addLineSeries({
        color: 'rgba(255, 170, 237, 0.92)',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      });
      highlightSeries.setData(focusedPoints.map(point => ({ time: point.date, value: point.p })));
      highlightLookup = buildTimeLookup(focusedPoints, point => point.date);
    }
  }

  if (filteredData.length > 1) {
    enforceVisibleRange(chart, timeResolver(filteredData[0]), timeResolver(filteredData[filteredData.length - 1]));
  } else {
    chart.timeScale().fitContent();
  }

  attachChartTooltip({
    chart,
    container: chartContainer,
    titleColor: meta.color,
    seriesConfigs: [
      { series: mainSeries, label: meta.label, color: meta.color, priority: 0, getPoint: param => mainLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) },
      seasonalAvgSeries ? { series: seasonalAvgSeries, label: '5Y Avg', color: seasonalPalette.avg, priority: 1, getPoint: param => seasonalLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) } : null,
      compareSeries ? { series: compareSeries, label: compareTicker, color: '#ffcc66', priority: 2, getPoint: param => compareLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) } : null,
      highlightSeries ? { series: highlightSeries, label: `${view.spotMonth} Focus`, color: 'rgba(255, 170, 237, 0.92)', priority: 3, getPoint: param => highlightLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue('spot', value) } : null,
    ].filter(Boolean),
    getTitle: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      return point ? formatDisplayDate(point.date) : 'Price detail';
    },
    getNote: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      if (!point) return '';
      const seasonalMatch = seasonalLookup.get(timeKey(param.time));
      if (view.instrument === 'spot') {
        const noteParts = [`${point.month} ${view.spotYear}`, `observation ${point.d}`];
        if (seasonalMatch && seasonalMatch.seasonal && seasonalMatch.seasonal.avg) {
          const delta = ((point.p - seasonalMatch.seasonal.avg) / seasonalMatch.seasonal.avg) * 100;
          noteParts.push(`vs 5Y ${formatPercent(delta)}`);
        }
        return noteParts.join(' | ');
      }
      const noteParts = [`T-Day ${point.d}`];
      if (view.compare) noteParts.push('compare aligned');
      if (seasonalMatch && seasonalMatch.seasonal && seasonalMatch.seasonal.avg) {
        const delta = ((point.p - seasonalMatch.seasonal.avg) / seasonalMatch.seasonal.avg) * 100;
        noteParts.push(`vs 5Y ${formatPercent(delta)}`);
      }
      if (Number.isFinite(point.o) && Number.isFinite(point.h) && Number.isFinite(point.l)) noteParts.push(`O ${point.o.toFixed(3)} / H ${point.h.toFixed(3)} / L ${point.l.toFixed(3)}`);
      return noteParts.join(' | ');
    },
  });

  updatePricesRangeFooter(fullData, filteredData);
  renderPricesSummaryBar({ instrument: view.instrument, fullData, filteredData, changePct, stats, currentPoint, seasonal: seasonalPoint });
  if (!skipDetails) {
    renderPricesStats({ instrument: view.instrument, meta, fullData, changePct, currentPoint, stats, ticker, view, seasonal: seasonalPoint });
    renderPricesHistoryTable({ instrument: view.instrument, view });
  }
}
