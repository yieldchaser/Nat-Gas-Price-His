const PRICE_INSTRUMENT_META = {
  hh: { key: 'hh', label: 'Henry Hub', stamp: 'HH futures', tone: 'hh', color: '#00d4ff', currency: '$', unit: 'USD/MMBtu', prefix: 'NG' },
  ttf: { key: 'ttf', label: 'Dutch TTF', stamp: 'TTF futures', tone: 'ttf', color: '#ff8c00', currency: 'EUR', unit: 'EUR/MWh', prefix: 'TG' },
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

  if (store[month] && store[month].contracts) {
    Object.keys(store[month].contracts).forEach(ticker => {
      const yr = parseInt(ticker.slice(3), 10);
      if (Number.isFinite(yr)) years.add(yr < 50 ? 2000 + yr : 1900 + yr);
    });
  }

  // HH live keys: NGJ26.NYM (prefix NG = 2 chars, yr at [3..5])
  // TTF live keys: TTFJ26.NYM (prefix TTF = 3 chars, yr at [4..6])
  const livePrefix = instrument === 'ttf' ? 'TTF' : 'NG';
  const yrStart = livePrefix.length + 1; // skip prefix + 1 month-code char
  Object.keys(STATE.liveData).forEach(ticker => {
    if (!ticker.startsWith(livePrefix + MONTH_CODES[month])) return;
    const yr = parseInt(ticker.slice(yrStart, yrStart + 2), 10);
    if (Number.isFinite(yr)) years.add(yr < 50 ? 2000 + yr : 1900 + yr);
  });

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

function resetPriceWindow(view = STATE.priceView) {
  view.rangeStart = 0;
  view.rangeEnd = null;
}

function getVisibleWindow(fullData, view) {
  const length = fullData.length;
  if (!length) {
    view.rangeStart = 0;
    view.rangeEnd = null;
    return {
      start: 0,
      end: -1,
      count: 0,
      filteredData: [],
      startPoint: null,
      endPoint: null,
    };
  }

  const maxIndex = length - 1;
  let start = Number.isFinite(view.rangeStart) ? clamp(view.rangeStart, 0, maxIndex) : 0;
  let end = Number.isFinite(view.rangeEnd) ? clamp(view.rangeEnd, 0, maxIndex) : maxIndex;
  if (view.rangeEnd == null) end = maxIndex;

  if (end < start) {
    const swap = start;
    start = end;
    end = swap;
  }

  if (start === end && length > 1) {
    if (end < maxIndex) end += 1;
    else start = Math.max(0, start - 1);
  }

  view.rangeStart = start;
  view.rangeEnd = end;
  return {
    start,
    end,
    count: end - start + 1,
    filteredData: fullData.slice(start, end + 1),
    startPoint: fullData[start],
    endPoint: fullData[end],
  };
}

function getRangeSelectionPercent(length, start, end) {
  if (length <= 1) return { left: 0, width: 100 };
  const left = (start / (length - 1)) * 100;
  const right = (end / (length - 1)) * 100;
  return {
    left,
    width: Math.max(right - left, 1.25),
  };
}

function getRangeLabel(length, count) {
  if (!length) return 'No data';
  return count >= length ? 'Full span' : `${count} days`;
}

function parseChartDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'object' && Number.isFinite(value.year)) {
    return new Date(Date.UTC(value.year, (value.month || 1) - 1, value.day || 1));
  }
  return null;
}

function formatRangeEdgeLabel(value) {
  if (typeof value === 'string') {
    const parts = value.split('-');
    if (parts.length === 3) {
      const year = parts[0].slice(-2);
      const monthIndex = Math.max(0, Math.min(11, parseInt(parts[1], 10) - 1));
      const day = parseInt(parts[2], 10);
      return `${MONTHS[monthIndex]} ${day} '${year}`;
    }
  }

  const date = parseChartDate(value);
  if (!date) return '--';
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = typeof date.getDate === 'function' ? date.getDate() : '';
  const year = String(typeof date.getFullYear === 'function' ? date.getFullYear() : '').slice(-2);
  return `${month} ${day} '${year}`;
}

function formatAxisDateLabel(value, tickMarkType) {
  const date = parseChartDate(value);
  if (!date) return '';
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const day = date.getUTCDate ? date.getUTCDate() : date.getDate();
  const year = date.getUTCFullYear ? date.getUTCFullYear() : date.getFullYear();
  const resolvedTick = tickMarkType != null ? tickMarkType : '';
  const yearTick = LightweightCharts.TickMarkType && LightweightCharts.TickMarkType.Year;
  const monthTick = LightweightCharts.TickMarkType && LightweightCharts.TickMarkType.Month;
  const dayTick = LightweightCharts.TickMarkType && LightweightCharts.TickMarkType.DayOfMonth;

  if (resolvedTick === yearTick) return String(year);
  if (resolvedTick === monthTick) return `${month} '${String(year).slice(-2)}`;
  if (resolvedTick === dayTick) return day === 1 ? month : String(day);
  return `${month} ${day}`;
}

function buildDateAxisFormatter(resolvePoint) {
  return (time, tickMarkType) => {
    const point = typeof resolvePoint === 'function' ? resolvePoint(time) : null;
    const dateValue = point && point.date ? point.date : time;
    return formatAxisDateLabel(dateValue, tickMarkType);
  };
}

function computeAxisLabels(filteredData, chartPixelWidth) {
  const count = filteredData.length;
  if (!count) return new Map();
  const pxW = Math.max(100, chartPixelWidth || 900);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function utc(s) {
    if (!s) return null;
    const p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
  }
  function isoWk(d) {
    const t = new Date(d); t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));
    const y1 = new Date(Date.UTC(t.getUTCFullYear(),0,1));
    return t.getUTCFullYear()*100 + Math.ceil(((t-y1)/864e5+1)/7);
  }

  const raw = new Map();

  if (count <= 14) {
    // Micro: every trading day; "Mon D" at month boundary, plain day number otherwise
    for (const pt of filteredData) {
      const d = utc(pt.date); if (!d) continue;
      const day = d.getUTCDate();
      raw.set(pt.date, day === 1 ? `${MONTHS[d.getUTCMonth()]} 1` : String(day));
    }
  } else if (count <= 35) {
    // Short: weekly — first trading day of each calendar week
    let lastWk = -1;
    for (const pt of filteredData) {
      const d = utc(pt.date); if (!d) continue;
      const wk = isoWk(d);
      if (wk !== lastWk) { lastWk = wk; raw.set(pt.date, `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`); }
    }
  } else if (count <= 65) {
    // Medium: biweekly — first trading day of every other calendar week
    let lastWk = -1, wkIdx = 0;
    for (const pt of filteredData) {
      const d = utc(pt.date); if (!d) continue;
      const wk = isoWk(d);
      if (wk !== lastWk) {
        lastWk = wk; wkIdx++;
        if (wkIdx % 2 === 1) raw.set(pt.date, `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`);
      }
    }
  } else {
    // Macro: month or year boundaries
    const first = utc(filteredData[0].date), last = utc(filteredData[filteredData.length-1].date);
    if (!first || !last) return new Map();
    const spanYrs = (last - first) / (365.25 * 864e5);
    const maxLbls = Math.max(2, Math.floor(pxW / 150));

    if (spanYrs > 3) {
      // Year-boundary mode (Google Finance style)
      let iv = 1;
      for (const v of [1,2,3,5,10]) { iv = v; if (Math.ceil(spanYrs/v) <= maxLbls) break; }
      let lastYr = -1;
      for (const pt of filteredData) {
        const d = utc(pt.date); if (!d) continue;
        const yr = d.getUTCFullYear();
        if (yr !== lastYr && yr % iv === 0) { lastYr = yr; raw.set(pt.date, String(yr)); }
      }
    } else {
      // Month-boundary mode; interval = 1,2,3,6,12 months
      const totalMo = Math.max(1, Math.round(spanYrs * 12));
      let mo = 12;
      for (const v of [1,2,3,6,12]) { mo = v; if (Math.ceil(totalMo/v) <= maxLbls) break; }
      const singleYr = first.getUTCFullYear() === last.getUTCFullYear();
      let lastMk = -1;
      for (const pt of filteredData) {
        const d = utc(pt.date); if (!d) continue;
        const mk = d.getUTCFullYear()*12 + d.getUTCMonth();
        if (mk !== lastMk && d.getUTCMonth() % mo === 0) {
          lastMk = mk;
          raw.set(pt.date, singleYr ? MONTHS[d.getUTCMonth()] : `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`);
        }
      }
    }
  }

  // Anti-collision: drop labels closer than 45px apart
  const pxPerPt = pxW / count;
  const minGapPts = Math.max(1, Math.ceil(45 / pxPerPt));
  const toIdx = new Map(filteredData.map((pt,i) => [pt.date, i]));
  const sorted = [...raw.entries()].map(([dt,tx]) => [dt, tx, toIdx.get(dt)??0]).sort((a,b) => a[2]-b[2]);
  const out = new Map();
  let lastI = -minGapPts - 1;
  for (const [dt, tx, i] of sorted) {
    if (i - lastI >= minGapPts) { out.set(dt, tx); lastI = i; }
  }
  return out;
}

function buildSmartAxisFormatter(filteredData, chartPixelWidth, useTradingAxis) {
  const labelMap = computeAxisLabels(filteredData, chartPixelWidth);
  if (!useTradingAxis) {
    return time => labelMap.get(typeof time === 'string' ? time : '') || '';
  }
  // In trading-day (Compare) mode the chart X axis uses pseudo-dates from dayToTime(point.d).
  // Remap labels from real-date keys to their corresponding pseudo-date keys so the
  // formatter can look up by the time value TradingView actually passes in.
  const pseudoMap = new Map();
  for (const pt of filteredData) {
    const label = labelMap.get(pt.date);
    if (label) pseudoMap.set(dayToTime(pt.d), label);
  }
  return time => pseudoMap.get(typeof time === 'string' ? time : '') || '';
}

function buildCurveAxisFormatter(resolveContract) {
  return time => {
    const point = typeof resolveContract === 'function' ? resolveContract(time) : null;
    return point ? point.label : '\u00A0';
  };
}

function applyChartTimeScaleOptions(chart, options = {}) {
  if (!chart) return;
  const {
    formatter,
    barSpacing = 9,
    minBarSpacing = 0.45,
    rightOffset = 0,
    fixLeftEdge = true,
    fixRightEdge = true,
    lockVisibleTimeRangeOnResize = true,
  } = options;
  chart.timeScale().applyOptions({
    borderColor: '#2b2b31',
    timeVisible: false,
    secondsVisible: false,
    rightOffset,
    barSpacing,
    minBarSpacing,
    fixLeftEdge,
    fixRightEdge,
    lockVisibleTimeRangeOnResize,
    shiftVisibleRangeOnNewBar: false,
    tickMarkFormatter: formatter,
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

function finalizePriceSeasonalBucket(cache) {
  Object.keys(cache).forEach(key => {
    const entry = cache[key];
    entry.avg = entry.sum / entry.count;
    if (entry.min === Infinity) entry.min = 0;
    if (entry.max === -Infinity) entry.max = 0;
  });
  return cache;
}

function getPriceSeasonalRoot(instrument) {
  if (instrument === 'ttf') {
    if (!STATE.priceTtfSeasonalCache) STATE.priceTtfSeasonalCache = {};
    return STATE.priceTtfSeasonalCache;
  }
  if (!STATE.priceSeasonalCache) STATE.priceSeasonalCache = {};
  return STATE.priceSeasonalCache;
}

function getPriceFuturesSeasonalBucket(instrument, month, anchorYear) {
  if (!anchorYear || !MONTHS.includes(month)) return {};
  const root = getPriceSeasonalRoot(instrument);
  if (!root[month]) root[month] = {};
  if (root[month][anchorYear]) return root[month][anchorYear];

  const prefix = instrument === 'ttf' ? 'TG' : 'NG';
  const getSeries = instrument === 'ttf' ? getTTFContractData : getContractData;
  const cache = {};

  for (let year = anchorYear - 5; year < anchorYear; year++) {
    const ticker = `${prefix}${MONTH_CODES[month]}${String(year % 100).padStart(2, '0')}`;
    const data = getSeries(ticker);
    if (!data.length) continue;
    data.forEach(point => {
      if (!Number.isFinite(point.d) || !Number.isFinite(point.p)) return;
      if (!cache[point.d]) cache[point.d] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
      cache[point.d].sum += point.p;
      cache[point.d].count++;
      cache[point.d].min = Math.min(cache[point.d].min, point.p);
      cache[point.d].max = Math.max(cache[point.d].max, point.p);
    });
  }

  root[month][anchorYear] = finalizePriceSeasonalBucket(cache);
  return root[month][anchorYear];
}

function getPriceSpotSeasonalBucket(anchorYear) {
  if (!anchorYear) return {};
  if (!STATE.priceSpotSeasonalCache) STATE.priceSpotSeasonalCache = {};
  if (STATE.priceSpotSeasonalCache[anchorYear]) return STATE.priceSpotSeasonalCache[anchorYear];

  const cache = {};
  for (let year = anchorYear - 5; year < anchorYear; year++) {
    MONTHS.forEach(month => {
      const series = STATE.spot[month] && STATE.spot[month].years && STATE.spot[month].years[String(year)];
      if (!series) return;
      series.forEach(point => {
        if (!point.date || !Number.isFinite(point.p)) return;
        const key = point.date.slice(5);
        if (!cache[key]) cache[key] = { sum: 0, count: 0, min: Infinity, max: -Infinity };
        cache[key].sum += point.p;
        cache[key].count++;
        cache[key].min = Math.min(cache[key].min, point.p);
        cache[key].max = Math.max(cache[key].max, point.p);
      });
    });
  }

  STATE.priceSpotSeasonalCache[anchorYear] = finalizePriceSeasonalBucket(cache);
  return STATE.priceSpotSeasonalCache[anchorYear];
}

function getSeasonalEntry(view, point) {
  if (!point) return null;
  if (view.instrument === 'spot') {
    const bucket = getPriceSpotSeasonalBucket(view.spotYear);
    return point.date ? bucket[point.date.slice(5)] || null : null;
  }
  const cacheBucket = getPriceFuturesSeasonalBucket(view.instrument, view.month, view.year);
  return cacheBucket && cacheBucket[point.d] ? cacheBucket[point.d] : null;
}

function getNeutralChartPalette() {
  return {
    main: '#f5f7fb',
    compare: 'rgba(160, 165, 176, 0.9)',
    contrast: 'rgba(228, 232, 237, 0.76)',
    historical: 'rgba(142, 146, 156, 0.22)',
    zero: 'rgba(255, 255, 255, 0.16)',
    fillTop: 'rgba(255, 255, 255, 0.26)',
    fillBottom: 'rgba(255, 255, 255, 0.00)',
    line: 'rgba(255, 255, 255, 0.18)',
    avg: 'rgba(196, 199, 206, 0.62)',
    highlight: 'rgba(255, 255, 255, 0.72)',
  };
}

function getSeasonalPalette(instrument) {
  return getNeutralChartPalette();
}

function getChartBarSpacing(length) {
  if (length > 220) return 4.5;
  if (length > 140) return 5.75;
  if (length > 90) return 7;
  if (length > 45) return 8.5;
  return 11;
}

function getSeasonalRangePosition(value, seasonal) {
  if (!Number.isFinite(value) || !seasonal) return null;
  if (!Number.isFinite(seasonal.min) || !Number.isFinite(seasonal.max)) return null;
  if (seasonal.max === seasonal.min) return { percentile: 50, status: 'flat' };

  const raw = ((value - seasonal.min) / (seasonal.max - seasonal.min)) * 100;
  let status = 'within';
  if (value < seasonal.min) status = 'below';
  else if (value > seasonal.max) status = 'above';

  return {
    raw,
    percentile: clamp(Math.round(raw), 0, 100),
    status,
  };
}

function formatOrdinal(value) {
  if (!Number.isFinite(value)) return '--';
  const rounded = Math.round(value);
  const abs = Math.abs(rounded);
  const mod100 = abs % 100;
  let suffix = 'th';
  if (mod100 < 11 || mod100 > 13) {
    if (abs % 10 === 1) suffix = 'st';
    else if (abs % 10 === 2) suffix = 'nd';
    else if (abs % 10 === 3) suffix = 'rd';
  }
  return `${rounded}${suffix}`;
}

function formatPercentileLabel(position, options = {}) {
  const { compact = false, includeStatus = false } = options;
  if (!position) return '--';

  const base = compact
    ? `${formatOrdinal(position.percentile)} pct`
    : `${formatOrdinal(position.percentile)} percentile`;
  if (!includeStatus || position.status === 'within' || position.status === 'flat') return base;
  return `${base} (${position.status === 'above' ? 'above range' : 'below range'})`;
}

function getTooltipMetricContext(point, fallbackStats, seasonalMatch) {
  const seasonal = seasonalMatch && seasonalMatch.seasonal ? seasonalMatch.seasonal : null;
  if (seasonal && Number.isFinite(seasonal.min) && Number.isFinite(seasonal.max) && Number.isFinite(seasonal.avg)) {
    return {
      maxLabel: '5Y Max',
      maxValue: seasonal.max,
      minLabel: '5Y Min',
      minValue: seasonal.min,
      avgLabel: '5Y Avg',
      avgValue: seasonal.avg,
    };
  }
  if (Number.isFinite(point && point.h) && Number.isFinite(point && point.l)) {
    return {
      maxLabel: 'Day High',
      maxValue: point.h,
      minLabel: 'Day Low',
      minValue: point.l,
      avgLabel: 'Window Avg',
      avgValue: fallbackStats.avg,
    };
  }
  return {
    maxLabel: 'Window Max',
    maxValue: fallbackStats.max,
    minLabel: 'Window Min',
    minValue: fallbackStats.min,
    avgLabel: 'Window Avg',
    avgValue: fallbackStats.avg,
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
  view.compare = Boolean(view.compare);
  if (!Number.isFinite(view.rangeStart)) view.rangeStart = 0;
  if (view.rangeEnd != null && !Number.isFinite(view.rangeEnd)) view.rangeEnd = null;

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
  const { chart, container, titleColor, seriesConfigs, getTitle, getSubtitle, getNote, getMetrics } = options;
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
        emphasis: Boolean(config.emphasis),
      });
    });

    if (!rows.length) {
      tooltip.classList.add('hidden');
      return;
    }

    rows.sort((a, b) => a.priority - b.priority);
    const title = typeof getTitle === 'function' ? getTitle(param) : '';
    const subtitle = typeof getSubtitle === 'function' ? getSubtitle(param) : '';
    const note = typeof getNote === 'function' ? getNote(param) : '';
    const metrics = typeof getMetrics === 'function' ? (getMetrics(param) || []) : [];
    tooltip.innerHTML = `
      <div class="chart-tooltip-head">
        <div class="chart-tooltip-title" style="color:${titleColor || '#f5f7fb'};">${title}</div>
        ${subtitle ? `<div class="chart-tooltip-subtitle">${subtitle}</div>` : ''}
      </div>
      <div class="chart-tooltip-section">
        ${rows.map(row => `<div class="chart-tooltip-row ${row.emphasis ? 'emphasis' : ''}"><span class="chart-tooltip-label"><span class="chart-tooltip-swatch" style="background:${row.color};"></span><span>${row.label}</span></span><span class="chart-tooltip-value">${row.valueText}</span></div>`).join('')}
      </div>
      ${metrics.length ? `<div class="chart-tooltip-metrics">${metrics.map(metric => `<div class="chart-tooltip-metric"><span class="chart-tooltip-metric-label">${metric.label}</span><span class="chart-tooltip-metric-value">${metric.value}</span></div>`).join('')}</div>` : ''}
      ${note ? `<div class="chart-tooltip-note">${note}</div>` : ''}
    `;
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
  resetPriceWindow(view);
  renderPricesControls();
  schedulePricesChartUpdate();
}

function renderPricesTab() {
  const container = document.getElementById('tab-prices');
  if (!container.dataset.built) {
    container.dataset.built = '1';
    container.innerHTML = `
      <div class="contract-header" id="prices-header">
        <div class="ch-left">
          <div class="ch-top">
            <span class="ticker" id="prices-ticker">--</span>
            <span class="instrument-stamp"><span class="instrument-dot" id="prices-instrument-dot"></span><span id="prices-instrument-label">Henry Hub</span></span>
          </div>
          <span class="desc" id="prices-desc">Select an instrument to explore price history</span>
        </div>
        <div class="ch-right">
          <span class="price" id="prices-price">--</span>
          <span class="change" id="prices-change">--</span>
        </div>
      </div>
      <div class="card" style="margin-bottom:var(--gap);"><div id="prices-controls" class="ctrl-toolbar"></div></div>
      <div class="flex gap" style="flex-wrap:wrap;">
        <div class="grow" style="min-width:0;">
          <div class="card" style="padding:0;"><div class="chart-wrap" id="prices-chart-container"></div></div>
          <div class="card chart-footer" style="margin-top:var(--gap);">
            <div class="range-toolbar">
              <div class="flex flex-col gap-sm">
                <span class="range-kicker">Window</span>
                <span class="range-helper" id="prices-range-helper">Drag handles to move and resize the visible range</span>
              </div>
              <div class="range-scale-labels">
                <span id="prices-range-min-label">--</span>
                <span id="prices-range-max-label">--</span>
              </div>
            </div>
            <div class="range-input-shell">
              <div class="range-selection" id="prices-range-selection"></div>
              <input type="range" id="prices-window-start" min="0" max="0" value="0" aria-label="Price window start">
              <input type="range" id="prices-window-end" min="0" max="0" value="0" aria-label="Price window end">
            </div>
            <div class="chart-readout" id="prices-range-readout">Awaiting data</div>
          </div>
          <div class="card" style="margin-top:var(--gap);padding:12px 16px;" id="prices-summary-bar"></div>
        </div>
        <div class="sidebar-stack">
          <div class="card" id="prices-stats"></div>
          <div class="card" style="margin-top:var(--gap);" id="prices-history-table"></div>
        </div>
      </div>
    `;

    const startSlider = document.getElementById('prices-window-start');
    const endSlider = document.getElementById('prices-window-end');
    if (startSlider && endSlider) {
      startSlider.addEventListener('input', event => {
        const length = parseInt(event.target.dataset.length || '0', 10);
        if (!length) return;
        const nextStart = clamp(parseInt(event.target.value, 10) || 0, 0, Math.max(0, (STATE.priceView.rangeEnd ?? (length - 1)) - 1));
        STATE.priceView.rangeStart = nextStart;
        schedulePricesChartUpdate({ skipDetails: true });
      });
      endSlider.addEventListener('input', event => {
        const length = parseInt(event.target.dataset.length || '0', 10);
        if (!length) return;
        const nextEnd = clamp(parseInt(event.target.value, 10) || 0, Math.min(length - 1, (STATE.priceView.rangeStart || 0) + 1), length - 1);
        STATE.priceView.rangeEnd = nextEnd;
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
    <div class="ctrl-group">
      <div class="ctrl-group-label">Market</div>
      <div class="segment-switch" id="prices-instrument-switch">
        ${Object.values(PRICE_INSTRUMENT_META).map(entry => `<button class="segment-btn ${view.instrument === entry.key ? 'active' : ''}" data-instrument="${entry.key}" data-tone="${entry.tone}">${entry.label}</button>`).join('')}
      </div>
    </div>
    <div class="ctrl-sep"></div>
    ${isSpot ? `
      <div class="ctrl-group">
        <div class="ctrl-group-label">Year</div>
        <select id="prices-spot-year">${years.map(year => `<option value="${year}" ${year === view.spotYear ? 'selected' : ''}>${year}</option>`).join('')}</select>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-group-label">Highlight</div>
        <select id="prices-spot-month">
          <option value="">All Months</option>
          ${MONTHS.map(month => `<option value="${month}" ${month === view.spotMonth ? 'selected' : ''}>${month}</option>`).join('')}
        </select>
      </div>
      <div class="ctrl-sep"></div>
      <div class="ctrl-group">
        <div class="ctrl-group-label">Band</div>
        <span class="instrument-stamp" style="padding-top:2px;"><span class="instrument-dot" style="background:${meta.color};"></span>5Y Seasonal Active</span>
      </div>
    ` : `
      <div class="ctrl-group">
        <div class="ctrl-group-label">Month</div>
        <select id="prices-month">${MONTHS.map(month => `<option value="${month}" ${month === view.month ? 'selected' : ''}>${month}</option>`).join('')}</select>
      </div>
      <div class="ctrl-group">
        <div class="ctrl-group-label">Year</div>
        <select id="prices-year">${years.map(year => `<option value="${year}" ${year === view.year ? 'selected' : ''}>${year}</option>`).join('')}</select>
      </div>
      <div class="ctrl-sep"></div>
      <div class="ctrl-group">
        <div class="ctrl-group-label">Options</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="toggle-btn ${view.compare ? 'active' : ''}" data-tone="${meta.tone}" id="prices-compare-toggle" ${compareYears.length ? '' : 'disabled'}>Compare</button>
          ${view.compare && compareYears.length ? `<select id="prices-compare-year">${compareYears.map(year => `<option value="${year}" ${year === view.compareYear ? 'selected' : ''}>${year}</option>`).join('')}</select>` : ''}
        </div>
      </div>
      <div class="ctrl-sep"></div>
      <div class="ctrl-group">
        <div class="ctrl-group-label">X-Axis</div>
        <div class="segment-switch" id="prices-axis-mode-switch">
          <button class="segment-btn ${!view.tradingDays ? 'active' : ''}" data-axismode="cal" data-tone="${meta.tone}">Cal Date</button>
          <button class="segment-btn ${view.tradingDays ? 'active' : ''}" data-axismode="tday" data-tone="${meta.tone}">T-Day</button>
        </div>
      </div>
    `}
    <div class="ctrl-hint-badge">
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><polyline points="7,3 10,5.5 7,8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="4,3 1,5.5 4,8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Drag rail · set window
    </div>
  `;

  controls.querySelectorAll('.segment-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (STATE.priceView.instrument === button.dataset.instrument) return;
      STATE.priceView.instrument = button.dataset.instrument;
      resetPriceWindow(STATE.priceView);
      syncPriceViewState();
      renderPricesControls();
      schedulePricesChartUpdate();
    });
  });

  if (isSpot) {
    document.getElementById('prices-spot-year').addEventListener('change', event => {
      STATE.priceView.spotYear = parseInt(event.target.value, 10) || null;
      resetPriceWindow(STATE.priceView);
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
    resetPriceWindow(STATE.priceView);
    syncPriceViewState();
    renderPricesControls();
    schedulePricesChartUpdate();
  });
  document.getElementById('prices-year').addEventListener('change', event => {
    STATE.priceView.year = parseInt(event.target.value, 10) || null;
    resetPriceWindow(STATE.priceView);
    syncPriceViewState();
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

  const axisModeSwitch = document.getElementById('prices-axis-mode-switch');
  if (axisModeSwitch) {
    axisModeSwitch.addEventListener('click', e => {
      const btn = e.target.closest('.segment-btn[data-axismode]');
      if (!btn) return;
      const newMode = btn.dataset.axismode === 'tday';
      if (STATE.priceView.tradingDays === newMode) return;
      STATE.priceView.tradingDays = newMode;
      renderPricesControls();
      schedulePricesChartUpdate();
    });
  }
}

function updatePricesRangeFooter(fullData, filteredData) {
  const startSlider = document.getElementById('prices-window-start');
  const endSlider = document.getElementById('prices-window-end');
  const selection = document.getElementById('prices-range-selection');
  const rangeReadout = document.getElementById('prices-range-readout');
  const minLabelEl = document.getElementById('prices-range-min-label');
  const maxLabelEl = document.getElementById('prices-range-max-label');
  const helperEl = document.getElementById('prices-range-helper');
  if (!startSlider || !endSlider || !selection || !rangeReadout || !fullData.length || !filteredData.length) return;

  const visibleWindow = getVisibleWindow(fullData, STATE.priceView);
  const label = getRangeLabel(fullData.length, visibleWindow.count);
  const percent = getRangeSelectionPercent(fullData.length, visibleWindow.start, visibleWindow.end);
  const rangeMax = Math.max(fullData.length - 1, 0);

  [startSlider, endSlider].forEach(slider => {
    slider.min = '0';
    slider.max = String(rangeMax);
    slider.dataset.length = String(fullData.length);
    slider.disabled = fullData.length <= 1;
  });
  startSlider.value = String(visibleWindow.start);
  endSlider.value = String(visibleWindow.end);
  selection.style.left = `${percent.left}%`;
  selection.style.width = `${percent.width}%`;

  if (minLabelEl) minLabelEl.textContent = formatRangeEdgeLabel(fullData[0].date);
  if (maxLabelEl) maxLabelEl.textContent = formatRangeEdgeLabel(fullData[fullData.length - 1].date);
  if (helperEl) helperEl.textContent = visibleWindow.count >= fullData.length
    ? 'Full span across available history'
    : `${visibleWindow.count} days selected • drag handles to move or resize`;

  const start = visibleWindow.startPoint;
  const end = visibleWindow.endPoint;
  rangeReadout.innerHTML = `<span>${formatDisplayDate(start.date)}</span><span style="color:var(--text-muted);">to</span><span>${formatDisplayDate(end.date)}</span><span style="color:var(--text-muted);">|</span><span>${label}</span><span style="color:var(--text-muted);">|</span><span>${visibleWindow.count}/${fullData.length} points</span>`;
  if (helperEl && visibleWindow.count < fullData.length) {
    helperEl.textContent = `${visibleWindow.count} days selected | drag handles to move or resize`;
  }
}

function renderPricesSummaryBar(context) {
  const summaryBar = document.getElementById('prices-summary-bar');
  if (!summaryBar) return;

  const { instrument, fullData, filteredData, stats, focusPoint, seasonal } = context;
  const fmt = v => formatInstrumentValue(instrument, v);

  // Window-specific change: first → last point in the visible window
  const wFirst = filteredData[0];
  const wLast  = filteredData[filteredData.length - 1];
  const windowDelta = wFirst && wLast && wFirst.p
    ? ((wLast.p - wFirst.p) / wFirst.p) * 100
    : null;

  // Price spread (high − low within window)
  const spread = Number.isFinite(stats.max) && Number.isFinite(stats.min)
    ? stats.max - stats.min : null;

  // Seasonal position
  let seasonalDelta = null;
  let rangePosition = null;
  if (focusPoint && seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    seasonalDelta = ((focusPoint.p - seasonal.avg) / seasonal.avg) * 100;
    rangePosition = getSeasonalRangePosition(focusPoint.p, seasonal);
  }

  const col = v => v >= 0 ? 'var(--positive)' : 'var(--negative)';
  const bandColor = rangePosition
    ? (rangePosition.percentile >= 80 ? 'var(--negative)' : rangePosition.percentile <= 20 ? 'var(--positive)' : 'var(--text-secondary)')
    : 'var(--text-secondary)';

  const metrics = [
    {
      label: 'POINTS',
      html: `<span style="color:var(--text-primary);">${filteredData.length}</span><span style="color:var(--text-muted);font-size:11px;margin-left:3px;">/ ${fullData.length}</span>`,
    },
    { label: 'HIGH',   html: `<span style="color:var(--text-primary);">${fmt(stats.max)}</span>` },
    { label: 'LOW',    html: `<span style="color:var(--text-primary);">${fmt(stats.min)}</span>` },
    { label: 'AVG',    html: `<span style="color:var(--text-secondary);">${fmt(stats.avg)}</span>` },
    spread != null
      ? { label: 'SPREAD', html: `<span style="color:var(--text-secondary);">${fmt(spread)}</span>` }
      : null,
    windowDelta != null
      ? { label: 'WINDOW \u0394', html: `<span style="color:${col(windowDelta)};">${formatPercent(windowDelta)}</span>` }
      : null,
    seasonalDelta != null
      ? { label: 'vs 5Y AVG', html: `<span style="color:${col(seasonalDelta)};">${formatPercent(seasonalDelta)}</span>` }
      : null,
    rangePosition
      ? { label: '5Y BAND', html: `<span style="color:${bandColor};">${formatPercentileLabel(rangePosition, { compact: true })}</span>` }
      : null,
  ].filter(Boolean);

  const DIVIDER = `<div style="width:1px;background:var(--border);align-self:stretch;margin:0 14px;flex-shrink:0;"></div>`;
  const LABEL_STYLE = `font-family:var(--font-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:var(--text-muted);margin-bottom:4px;`;
  const VALUE_STYLE = `font-family:var(--font-mono);font-size:13px;`;

  summaryBar.innerHTML = `
    <div style="font-family:var(--font-ui);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted);margin-bottom:10px;text-align:center;">Window Metrics</div>
    <div style="display:flex;align-items:center;justify-content:center;overflow-x:auto;padding-bottom:2px;">
      ${metrics.map((m, i) => `
        ${i > 0 ? DIVIDER : ''}
        <div style="display:flex;flex-direction:column;flex-shrink:0;align-items:center;text-align:center;">
          <div style="${LABEL_STYLE}">${m.label}</div>
          <div style="${VALUE_STYLE}">${m.html}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderPricesStats(context) {
  const statsEl = document.getElementById('prices-stats');
  if (!statsEl) return;

  const { instrument, meta, fullData, changePct, currentPoint, stats, ticker, view, seasonal } = context;
  let extraBlock = '';

  if (seasonal && Number.isFinite(seasonal.avg) && seasonal.avg !== 0) {
    const seasonalDelta = ((currentPoint.p - seasonal.avg) / seasonal.avg) * 100;
    const rangePosition = getSeasonalRangePosition(currentPoint.p, seasonal);
    const statusBlock = instrument === 'hh'
      ? `<div class="stat"><div class="stat-label">Status</div><div style="font-family:var(--font-mono);font-size:12px;padding:3px 8px;border-radius:4px;display:inline-block;background:${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'rgba(0,255,136,0.1)' : 'rgba(136,136,170,0.1)'};color:${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'var(--positive)' : 'var(--text-muted)'};">${Boolean(STATE.liveData[`${ticker}.NYM`]) ? 'ACTIVE - LIVE DATA' : 'HISTORICAL'}</div></div>`
      : '';
    extraBlock = `
      <div class="stat"><div class="stat-label">vs 5Y Seasonal Avg</div><div style="font-family:var(--font-mono);font-size:14px;" class="${seasonalDelta >= 0 ? 'positive' : 'negative'}">${formatPercent(seasonalDelta)}</div></div>
      <div class="stat"><div class="stat-label">5Y Range Position</div><div style="font-family:var(--font-mono);font-size:13px;color:var(--text-secondary);">${formatPercentileLabel(rangePosition, { includeStatus: true })}</div></div>
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

  // Inner scroll wrapper — overflow lives here, NOT on the outer card
  // This keeps the card title + subtitle always visible and prevents th sticky from escaping
  const SCROLL_WRAP = (inner) =>
    `<div style="max-height:268px;overflow-y:auto;overflow-x:auto;margin:8px -16px 0;padding:0 16px;">` +
    inner + `</div>`;

  if (instrument === 'hh') {
    const sortedYears = Object.keys(STATE.expiry).sort((a, b) => b - a);
    const rowData = [];
    sortedYears.forEach(year => {
      const price = STATE.expiry[year] && STATE.expiry[year][view.month];
      if (price == null) return;
      rowData.push({ year, price });
    });

    const allPrices = rowData.map(r => r.price).filter(Number.isFinite);
    const priceMin = Math.min(...allPrices);
    const priceMax = Math.max(...allPrices);
    const priceRange = priceMax - priceMin || 1;
    const sortedDesc = [...allPrices].sort((a, b) => b - a);
    rowData.forEach(r => { r.rank = Number.isFinite(r.price) ? sortedDesc.indexOf(r.price) + 1 : null; });
    const total = allPrices.length;

    const posBar = (price) => {
      if (!Number.isFinite(price)) return '';
      const w = ((price - priceMin) / priceRange * 44).toFixed(1);
      return `<span style="display:inline-block;width:${w}px;height:3px;background:var(--accent-hh);border-radius:2px;vertical-align:middle;opacity:0.6;"></span>`;
    };

    const badge = `<span style="font-family:var(--font-mono);font-size:10px;font-weight:600;color:var(--accent-hh);background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);border-radius:4px;padding:1px 7px;letter-spacing:0.06em;">${view.month.toUpperCase()} · HH</span>`;
    const subtitle = `<div style="font-family:var(--font-ui);font-size:11px;color:var(--text-muted);margin-top:4px;">${total} contracts</div>`;

    const rows = rowData.map((r, i) => {
      const isNewest = i === 0;
      const rowBg = isNewest ? 'background:rgba(255,255,255,0.03);' : '';
      const isActive = String(r.year) === String(view.year);
      const activeBg = isActive ? 'background:rgba(0,212,255,0.12);outline:1px solid rgba(0,212,255,0.3);' : rowBg;
      const dot = isActive ? `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent-hh);margin-right:5px;vertical-align:middle;"></span>` : '';
      return `<tr style="${activeBg}cursor:pointer;" title="Load ${r.year} contract" onclick="(function(){STATE.priceView.month='${view.month}';STATE.priceView.year=${r.year};STATE.priceView.instrument='hh';resetPriceWindow(STATE.priceView);renderPricesControls();schedulePricesChartUpdate();})()">
        <td style="text-align:left;color:${isActive ? 'var(--accent-hh)' : isNewest ? 'var(--text-primary)' : 'var(--text-secondary)'};">${dot}${r.year}</td>
        <td>${formatInstrumentValue('hh', r.price)}</td>
        <td style="color:var(--text-secondary);font-size:12px;">${r.rank != null ? `#${r.rank}` : '--'}</td>
        <td style="padding:6px 10px 6px 4px;">${posBar(r.price)}</td>
      </tr>`;
    }).join('');

    tableEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="card-title" style="margin-bottom:0;">Same Month HH History</div>
        ${badge}
      </div>
      ${subtitle}
      ${SCROLL_WRAP(`<table><thead><tr>
        <th style="text-align:left;">Year</th>
        <th>Last Print</th>
        <th>Rank</th>
        <th style="width:52px;"></th>
      </tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">No expiry data</td></tr>`}</tbody></table>`)}`;
    return;
  }

  if (instrument === 'ttf') {
    const years = getAvailableContractYears('ttf', view.month);
    const rowData = [];
    years.forEach(year => {
      const data = getTTFContractData(getPriceTicker('ttf', view.month, year));
      if (!data.length) return;
      rowData.push({ year, price: data[data.length - 1].p });
    });

    const allPrices = rowData.map(r => r.price).filter(Number.isFinite);
    const priceMin = Math.min(...allPrices);
    const priceMax = Math.max(...allPrices);
    const priceRange = priceMax - priceMin || 1;
    const sortedDesc = [...allPrices].sort((a, b) => b - a);
    rowData.forEach(r => { r.rank = Number.isFinite(r.price) ? sortedDesc.indexOf(r.price) + 1 : null; });
    const total = allPrices.length;

    const posBar = (price) => {
      if (!Number.isFinite(price)) return '';
      const w = ((price - priceMin) / priceRange * 44).toFixed(1);
      return `<span style="display:inline-block;width:${w}px;height:3px;background:var(--accent-ttf);border-radius:2px;vertical-align:middle;opacity:0.6;"></span>`;
    };

    const badge = `<span style="font-family:var(--font-mono);font-size:10px;font-weight:600;color:var(--accent-ttf);background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.2);border-radius:4px;padding:1px 7px;letter-spacing:0.06em;">${view.month.toUpperCase()} · TTF</span>`;
    const subtitle = `<div style="font-family:var(--font-ui);font-size:11px;color:var(--text-muted);margin-top:4px;">${total} contracts</div>`;

    const rows = rowData.map((r, i) => {
      const isNewest = i === 0;
      const isActive = String(r.year) === String(view.year);
      const activeBg = isActive ? 'background:rgba(255,140,0,0.12);outline:1px solid rgba(255,140,0,0.3);' : (isNewest ? 'background:rgba(255,255,255,0.03);' : '');
      const dot = isActive ? `<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--accent-ttf);margin-right:5px;vertical-align:middle;"></span>` : '';
      return `<tr style="${activeBg}cursor:pointer;" title="Load ${r.year} contract" onclick="(function(){STATE.priceView.month='${view.month}';STATE.priceView.year=${r.year};STATE.priceView.instrument='ttf';resetPriceWindow(STATE.priceView);renderPricesControls();schedulePricesChartUpdate();})()">
        <td style="text-align:left;color:${isActive ? 'var(--accent-ttf)' : isNewest ? 'var(--text-primary)' : 'var(--text-secondary)'};">${dot}${r.year}</td>
        <td>${formatInstrumentValue('ttf', r.price)}</td>
        <td style="color:var(--text-secondary);font-size:12px;">${r.rank != null ? `#${r.rank}` : '--'}</td>
        <td style="padding:6px 10px 6px 4px;">${posBar(r.price)}</td>
      </tr>`;
    }).join('');

    tableEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="card-title" style="margin-bottom:0;">Same Month TTF History</div>
        ${badge}
      </div>
      ${subtitle}
      ${SCROLL_WRAP(`<table><thead><tr>
        <th style="text-align:left;">Year</th>
        <th>Last Print</th>
        <th>Rank</th>
        <th style="width:52px;"></th>
      </tr></thead><tbody>${rows || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:16px;">No TTF data</td></tr>`}</tbody></table>`)}`;
    return;
  }

  // Spot: monthly breakdown for selected year
  const badge = `<span style="font-family:var(--font-mono);font-size:10px;font-weight:600;color:var(--accent-spot);background:rgba(167,139,250,0.08);border:1px solid rgba(167,139,250,0.2);border-radius:4px;padding:1px 7px;letter-spacing:0.06em;">${view.spotYear} · SPOT</span>`;
  const yearSeries = [];
  const rowData = MONTHS.map(month => {
    const series = STATE.spot[month]?.years?.[String(view.spotYear)];
    if (!series || !series.length) return { month, avg: null, max: null, min: null };
    yearSeries.push(...series);
    const s = getSeriesStats(series);
    return { month, avg: s.avg, max: s.max, min: s.min };
  });
  const yearAvg = yearSeries.length ? getSeriesStats(yearSeries).avg : null;
  const subtitle = `<div style="font-family:var(--font-ui);font-size:11px;color:var(--text-muted);margin-top:4px;">Monthly breakdown${yearAvg != null ? ` &nbsp;·&nbsp; year avg <span style="color:var(--text-secondary);">${formatInstrumentValue('spot', yearAvg)}</span>` : ''}</div>`;

  const rows = rowData.map(r => {
    const hasData = r.avg != null;
    return `<tr>
      <td style="text-align:left;color:${hasData ? 'var(--text-primary)' : 'var(--text-muted)'};">${r.month}</td>
      <td>${hasData ? formatInstrumentValue('spot', r.avg) : '--'}</td>
      <td>${hasData ? formatInstrumentValue('spot', r.max) : '--'}</td>
      <td>${hasData ? formatInstrumentValue('spot', r.min) : '--'}</td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div class="card-title" style="margin-bottom:0;">Monthly Spot Summary</div>
      ${badge}
    </div>
    ${subtitle}
    ${SCROLL_WRAP(`<table><thead><tr>
      <th style="text-align:left;">Month</th>
      <th>Avg</th>
      <th>High</th>
      <th>Low</th>
    </tr></thead><tbody>${rows}</tbody></table>`)}`;
}

function updatePricesChart({ skipDetails = false } = {}) {
  syncPriceViewState();
  const view = STATE.priceView;
  const meta = getPriceInstrumentMeta(view.instrument);
  const isSpot = view.instrument === 'spot';
  const useTradingAxis = !isSpot && (view.compare || view.tradingDays);
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

    // Cache status badge
    let cacheBadge = '';
    const isHH = view.instrument === 'hh';
    const isTTF = view.instrument === 'ttf';
    if ((isHH && STATE.hhCacheUsed) || (isTTF && STATE.ttfCacheUsed)) {
      const isStale = isHH ? STATE.hhCacheStale : STATE.ttfCacheStale;
      const age = isHH ? STATE.hhCacheAge : STATE.ttfCacheAge;
      cacheBadge = isStale 
        ? `<span class="ctrl-hint-badge" style="color:var(--warning);border-color:var(--warning);margin-left:8px;">⚠️ STALE CACHE (${age}h ago)</span>`
        : `<span class="ctrl-hint-badge" style="color:var(--warning);border-color:var(--warning);margin-left:8px;">🟡 CACHED (${age}h ago)</span>`;
    }
    // Remove old badge if exists and append new
    const oldBadge = tickerEl.parentElement.querySelector('.ctrl-hint-badge');
    if (oldBadge) oldBadge.remove();
    if (cacheBadge) {
      const temp = document.createElement('div');
      temp.innerHTML = cacheBadge;
      tickerEl.parentElement.appendChild(temp.firstElementChild);
    }

  if (!fullData.length) {
    removeChart('prices');
    descEl.textContent = 'No data available for the selected view';
    priceEl.textContent = 'No data';
    changeEl.textContent = '';
    const startSlider = document.getElementById('prices-window-start');
    const endSlider = document.getElementById('prices-window-end');
    const selection = document.getElementById('prices-range-selection');
    const helperEl = document.getElementById('prices-range-helper');
    const minLabelEl = document.getElementById('prices-range-min-label');
    const maxLabelEl = document.getElementById('prices-range-max-label');
    const readoutEl = document.getElementById('prices-range-readout');
    [startSlider, endSlider].forEach(slider => {
      if (!slider) return;
      slider.min = '0';
      slider.max = '0';
      slider.value = '0';
      slider.disabled = true;
      slider.dataset.length = '0';
    });
    if (selection) {
      selection.style.left = '0%';
      selection.style.width = '100%';
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

  const visibleWindow = getVisibleWindow(fullData, view);
  const filteredData = visibleWindow.filteredData;
  const currentPoint = fullData[fullData.length - 1];
  const focusPoint = visibleWindow.endPoint || currentPoint;
  const openPoint = fullData[0];
  const changePct = openPoint && openPoint.p ? ((currentPoint.p - openPoint.p) / openPoint.p) * 100 : 0;
  const fullStats = getSeriesStats(fullData);
  const windowStats = getSeriesStats(filteredData);
  const neutralPalette = getNeutralChartPalette();
  const currentSeasonalPoint = getSeasonalEntry(view, currentPoint);
  const focusSeasonalPoint = getSeasonalEntry(view, focusPoint);

  descEl.textContent = isSpot
    ? `${view.spotYear} daily spot history - ${meta.unit}`
    : `${view.month.toUpperCase()} ${view.year} contract - ${meta.unit}`;
  priceEl.textContent = formatInstrumentValue(view.instrument, currentPoint.p);
  changeEl.innerHTML = `${formatPercent(changePct)} <span style="font-size:11px;color:var(--text-muted);font-weight:400;">from open</span>`;
  changeEl.className = 'change ' + (changePct >= 0 ? 'positive' : 'negative');

  const chartContainer = document.getElementById('prices-chart-container');
  const chart = createManagedChart('prices', 'main', chartContainer);
  const timeResolver = point => useTradingAxis ? dayToTime(point.d) : point.date;
  const mainLookup = buildTimeLookup(filteredData, timeResolver);

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
      topColor: '#101114',
      bottomColor: '#101114',
      lineColor: 'rgba(255, 255, 255, 0.18)',
      lineWidth: 1.25,
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
  }

  const mainSeries = chart.addLineSeries({
    color: neutralPalette.main,
    lineWidth: 2.5,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
  });
  mainSeries.setData(filteredData.map(point => ({ time: timeResolver(point), value: point.p })));

  let compareSeries = null;
  let compareLookup = new Map();
  if (compareTicker && compareData.length) {
    const startDay = visibleWindow.startPoint && Number.isFinite(visibleWindow.startPoint.d) ? visibleWindow.startPoint.d : null;
    const endDay = visibleWindow.endPoint && Number.isFinite(visibleWindow.endPoint.d) ? visibleWindow.endPoint.d : null;
    const compareWindow = useTradingAxis && startDay != null && endDay != null
      ? compareData.filter(point => Number.isFinite(point.d) && point.d >= startDay && point.d <= endDay)
      : compareData.slice(visibleWindow.start, Math.min(compareData.length, visibleWindow.end + 1));
    compareSeries = chart.addLineSeries({
      color: neutralPalette.compare,
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
    });
    compareSeries.setData(compareWindow.map(point => ({ time: timeResolver(point), value: point.p })));
    compareLookup = buildTimeLookup(compareWindow, timeResolver);
  }

  let highlightSeries = null;
  let highlightLookup = new Map();
  if (isSpot && view.spotMonth) {
    const focusedPoints = filteredData.filter(point => point.month === view.spotMonth);
    if (focusedPoints.length) {
      highlightSeries = chart.addLineSeries({
        color: neutralPalette.highlight,
        lineWidth: 1.6,
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

  const chartPixelWidth = Math.max(100, (chartContainer.clientWidth || 900) - 72);
  applyChartTimeScaleOptions(chart, {
    formatter: buildSmartAxisFormatter(filteredData, chartPixelWidth, useTradingAxis),
    barSpacing: getChartBarSpacing(filteredData.length),
  });
  chart.timeScale().fitContent();

  attachChartTooltip({
    chart,
    container: chartContainer,
    titleColor: '#f5f7fb',
    seriesConfigs: [
      { series: mainSeries, label: meta.label, color: neutralPalette.main, priority: 0, emphasis: true, getPoint: param => mainLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) },
      seasonalAvgSeries ? { series: seasonalAvgSeries, label: '5Y Avg', color: seasonalPalette.avg, priority: 1, getPoint: param => seasonalLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) } : null,
      compareSeries ? { series: compareSeries, label: compareTicker, color: neutralPalette.compare, priority: 2, getPoint: param => compareLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue(view.instrument, value) } : null,
      highlightSeries ? { series: highlightSeries, label: `${view.spotMonth} Focus`, color: neutralPalette.highlight, priority: 3, getPoint: param => highlightLookup.get(timeKey(param.time)), formatValue: value => formatInstrumentValue('spot', value) } : null,
    ].filter(Boolean),
    getTitle: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      return point ? formatDisplayDate(point.date) : 'Price detail';
    },
    getSubtitle: () => {
      const parts = [`${meta.label} | ${ticker}`];
      if (compareSeries && compareTicker) parts.push(`vs ${compareTicker}`);
      return parts.join(' | ');
    },
    getMetrics: param => {
      const point = mainLookup.get(timeKey(param.time)) || compareLookup.get(timeKey(param.time));
      if (!point) return [];
      const seasonalMatch = seasonalLookup.get(timeKey(param.time));
      const metricContext = getTooltipMetricContext(point, windowStats, seasonalMatch);
      return [
        { label: metricContext.maxLabel, value: formatInstrumentValue(view.instrument, metricContext.maxValue) },
        { label: metricContext.minLabel, value: formatInstrumentValue(view.instrument, metricContext.minValue) },
        { label: metricContext.avgLabel, value: formatInstrumentValue(view.instrument, metricContext.avgValue) },
        { label: isSpot ? 'Point' : 'T-Day', value: isSpot ? String(point.d || filteredData.indexOf(point) + 1) : String(point.d || '--') },
      ];
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
  renderPricesSummaryBar({ instrument: view.instrument, fullData, filteredData, changePct, stats: windowStats, focusPoint, seasonal: focusSeasonalPoint });
  if (!skipDetails) {
    renderPricesStats({ instrument: view.instrument, meta, fullData, changePct, currentPoint, stats: fullStats, ticker, view, seasonal: currentSeasonalPoint });
    renderPricesHistoryTable({ instrument: view.instrument, view });
  }
}
