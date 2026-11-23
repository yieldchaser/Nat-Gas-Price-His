// Chart layer over TradingView Lightweight Charts v4 (global LightweightCharts).
//
// Three axis modes:
//   'date'  – ISO dates on a business-day time scale
//   't'     – lifecycle position: weekdays to expiry (T-n), increasing toward 0
//   'month' – delivery months of a forward curve
// Every chart gets a crosshair tooltip that lists each registered series with
// its own formatter, so values are always shown with units and precision.

import { MONTHS } from '../lib/calendar.js';
import { date as fmtDate } from './format.js';

const L = () => window.LightweightCharts;

export const COLORS = {
  bg: '#0f141b', grid: 'rgba(148,163,184,0.07)', axis: '#2a3340', text: '#8b97a8',
  crosshair: 'rgba(148,163,184,0.45)',
  hh: '#4c9aff', ttf: '#f0a04b', spot: '#b294f5', spread: '#3ec7c2',
  pos: '#3fb68b', neg: '#ef5f6b', warn: '#e0b341',
  band: 'rgba(148,163,184,0.16)', bandInner: 'rgba(148,163,184,0.20)', median: '#9aa6b8',
  ref: '#6b7686', muted: '#5b6676', white: '#e8edf4',
  years: ['#4c9aff', '#f0a04b', '#3ec7c2', '#e070b8', '#a3d65c', '#b294f5', '#f2d15c', '#ff8a65', '#5fd3f3', '#c0c8d4'],
};

const TOUCH = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const T_BASE = 2000000000;   // synthetic epoch for the T axis (seconds)
export const tToTime = t => T_BASE - t * 86400;
export const timeToT = time => Math.round((T_BASE - time) / 86400);

export function timeToIso(time) {
  if (time == null) return null;
  if (typeof time === 'string') return time;
  if (typeof time === 'number') return new Date(time * 1000).toISOString().slice(0, 10);
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function axisFormatters(axis) {
  if (axis === 't') {
    const f = time => `T−${timeToT(time)}`;
    return { timeFormatter: f, tick: f };
  }
  if (axis === 'month') {
    const f = time => { const iso = timeToIso(time); return `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(2, 4)}`; };
    return { timeFormatter: f, tick: f };
  }
  return {
    timeFormatter: time => fmtDate(timeToIso(time)),
    tick: (time, type) => {
      const iso = timeToIso(time);
      const m = MONTHS[+iso.slice(5, 7) - 1];
      // TickMarkType: 0 Year, 1 Month, 2 DayOfMonth
      if (type === 0) return iso.slice(0, 4);
      if (type === 1) return m;
      return `${m} ${+iso.slice(8, 10)}`;
    },
  };
}

// ── Shaded band custom series (historical range / percentile envelopes) ──
class BandRenderer {
  update(data, options) { this.data = data; this.options = options; }
  draw(target, priceToCoordinate) {
    target.useBitmapCoordinateSpace(scope => {
      const { context: ctx, horizontalPixelRatio: hr, verticalPixelRatio: vr } = scope;
      const d = this.data;
      if (!d || !d.bars.length || !d.visibleRange) return;
      const from = Math.max(0, d.visibleRange.from - 1), to = Math.min(d.bars.length, d.visibleRange.to + 1);
      ctx.fillStyle = this.options.fill;
      let seg = [];
      const flush = () => {
        if (seg.length > 1) {
          ctx.beginPath();
          seg.forEach((b, i) => { const y = priceToCoordinate(b.hi) * vr; i ? ctx.lineTo(b.x, y) : ctx.moveTo(b.x, y); });
          for (let i = seg.length - 1; i >= 0; i--) ctx.lineTo(seg[i].x, priceToCoordinate(seg[i].lo) * vr);
          ctx.closePath();
          ctx.fill();
        }
        seg = [];
      };
      for (let i = from; i < to; i++) {
        const b = d.bars[i], o = b.originalData;
        if (o.lo == null || o.hi == null) { flush(); continue; }
        seg.push({ x: b.x * hr, lo: o.lo, hi: o.hi });
      }
      flush();
    });
  }
}
class BandSeries {
  constructor() { this._r = new BandRenderer(); }
  priceValueBuilder(row) { return [row.lo, row.hi, row.hi]; }
  isWhitespace(row) { return row.lo == null || row.hi == null; }
  renderer() { return this._r; }
  update(data, options) { this._r.update(data, options); }
  defaultOptions() { return { ...L().customSeriesDefaultOptions, fill: COLORS.band, lastValueVisible: false, priceLineVisible: false }; }
}

/**
 * Chart wrapper.
 * opts: { axis, priceDp, unit, height, legend: true, rightOffset }
 */
export class Chart {
  constructor(container, opts = {}) {
    this.opts = { axis: 'date', priceDp: 2, ...opts };
    this.container = container;
    container.classList.add('chart');
    container.innerHTML = '';
    this.host = document.createElement('div');
    this.host.className = 'chart-host';
    this.tip = document.createElement('div');
    this.tip.className = 'chart-tip';
    container.append(this.host, this.tip);
    const fm = axisFormatters(this.opts.axis);
    this.chart = L().createChart(this.host, {
      autoSize: true,
      layout: { attributionLogo: false, background: { type: 'solid', color: 'transparent' }, textColor: COLORS.text, fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11 },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      rightPriceScale: { borderColor: COLORS.axis, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: {
        borderColor: COLORS.axis, rightOffset: opts.rightOffset ?? 4, minBarSpacing: 0.2,
        tickMarkFormatter: fm.tick, fixLeftEdge: true, fixRightEdge: opts.fixRight ?? true,
        lockVisibleTimeRangeOnResize: true,
      },
      localization: { timeFormatter: fm.timeFormatter, priceFormatter: v => this.fmtPrice(v) },
      crosshair: {
        mode: 0,
        vertLine: { color: COLORS.crosshair, labelBackgroundColor: '#273142', width: 1, style: 3 },
        horzLine: { color: COLORS.crosshair, labelBackgroundColor: '#273142', width: 1, style: 3 },
      },
      // Touch: one-finger drag scrubs the crosshair (handled below) instead of
      // panning; vertical swipes scroll the page; pinch still zooms.
      handleScroll: TOUCH ? { horzTouchDrag: false, vertTouchDrag: false, pressedMouseMove: false, mouseWheel: false } : { vertTouchDrag: false },
      handleScale: TOUCH ? { pinch: true, axisPressedMouseMove: false, mouseWheel: false } : undefined,
    });
    this.series = [];
    this.chart.subscribeCrosshairMove(p => this._onCrosshair(p));
    if (TOUCH) this._bindTouch();
  }

  fmtPrice(v) {
    const dp = this.opts.priceDp;
    return Number.isFinite(v) ? v.toFixed(dp) : '';
  }

  _register(api, meta) {
    const entry = { api, ...meta, values: new Map() };
    this.series.push(entry);
    return entry;
  }

  _time(x) { return this.opts.axis === 't' ? tToTime(x) : x; }

  /** data: [{x, y}] where x is ISO date / T / month ISO; y may be null (gap). */
  line(data, { label, color, width = 2, style = 0, fmt, visibleInLegend = true, priceLine = false, lastValue = true, step = false } = {}) {
    const api = this.chart.addLineSeries({
      color, lineWidth: width, lineStyle: style, priceLineVisible: priceLine, lastValueVisible: lastValue,
      crosshairMarkerRadius: 3, lineType: step ? 1 : 0, priceFormat: { type: 'custom', formatter: v => this.fmtPrice(v) },
    });
    const entry = this._register(api, { label, color, fmt, kind: 'line', visibleInLegend });
    this.setLine(entry, data);
    return entry;
  }

  setLine(entry, data) {
    entry.values.clear();
    const rows = data.map(d => {
      const time = this._time(d.x);
      if (d.y == null || !Number.isFinite(d.y)) return { time };
      entry.values.set(String(time), d.y);
      return { time, value: d.y };
    });
    entry.api.setData(rows);
  }

  area(data, { label, color, fmt, top, bottom }) {
    const api = this.chart.addAreaSeries({
      lineColor: color, lineWidth: 2, topColor: top || color.replace(')', ',0.18)').replace('rgb', 'rgba'),
      bottomColor: bottom || 'rgba(0,0,0,0)', priceLineVisible: false, crosshairMarkerRadius: 3,
      priceFormat: { type: 'custom', formatter: v => this.fmtPrice(v) },
    });
    const entry = this._register(api, { label, color, fmt, kind: 'line', visibleInLegend: true });
    this.setLine(entry, data);
    return entry;
  }

  histogram(data, { label, fmt, color, scaleId } = {}) {
    const api = this.chart.addHistogramSeries({
      priceLineVisible: false, lastValueVisible: false, priceScaleId: scaleId,
      priceFormat: { type: 'custom', formatter: v => this.fmtPrice(v) }, color,
    });
    const entry = this._register(api, { label, color, fmt, kind: 'hist', visibleInLegend: true });
    entry.values.clear();
    api.setData(data.map(d => {
      const time = this._time(d.x);
      if (d.y == null) return { time };
      entry.values.set(String(time), d.y);
      return { time, value: d.y, color: d.color };
    }));
    return entry;
  }

  /** data: [{x, lo, hi}] */
  band(data, { label, fill = COLORS.band, fmt } = {}) {
    const api = this.chart.addCustomSeries(new BandSeries(), { fill });
    const entry = this._register(api, { label, color: fill, fmt, kind: 'band', visibleInLegend: !!label });
    data.forEach(d => { if (d.lo != null && d.hi != null) entry.values.set(String(this._time(d.x)), [d.lo, d.hi]); });
    api.setData(data.map(d => (d.lo == null || d.hi == null ? { time: this._time(d.x) } : { time: this._time(d.x), lo: d.lo, hi: d.hi })));
    return entry;
  }

  markers(entry, list) { entry.api.setMarkers(list.map(m => ({ ...m, time: this._time(m.x) }))); }
  priceLine(entry, value, { color = COLORS.ref, title = '', style = 2 } = {}) {
    return entry.api.createPriceLine({ price: value, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
  }

  /** Visible range in axis units (ISO dates or T values). */
  setRange(from, to) {
    try { this.chart.timeScale().setVisibleRange({ from: this._time(from), to: this._time(to) }); } catch (e) { this.fit(); }
  }
  fit() { this.chart.timeScale().fitContent(); }

  _label(time) {
    if (this.opts.axis === 't') return `T−${timeToT(time)} <span>weekdays to expiry</span>`;
    if (this.opts.axis === 'month') { const iso = timeToIso(time); return `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)} delivery`; }
    return fmtDate(timeToIso(time));
  }

  /**
   * Touch scrubbing: the crosshair and tooltip follow the finger from the
   * first touch (no long-press needed). touch-action: pan-y leaves vertical
   * swipes to the browser so the page still scrolls; the tooltip stays after
   * the finger lifts until the next tap elsewhere.
   */
  _bindTouch() {
    this.host.style.touchAction = 'pan-y pinch-zoom';
    const scrub = e => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      const r = this.host.getBoundingClientRect();
      this.scrubTo(e.clientX - r.left);
    };
    this.host.addEventListener('pointerdown', scrub);
    this.host.addEventListener('pointermove', scrub);
    this._outside = e => { if (!this.container.contains(e.target)) this.clearScrub(); };
    document.addEventListener('pointerdown', this._outside);
  }

  /** Move the crosshair to the bar nearest x (CSS px within the chart) and show its tooltip. */
  scrubTo(x) {
    const ts = this.chart.timeScale();
    const width = ts.width();
    x = Math.min(Math.max(x, 0), width - 1);        // finger on the price axis -> latest bar
    const logical = ts.coordinateToLogical(x);
    if (logical == null) return;
    const main = this.series.find(s => s.kind === 'line' && !s.hidden) || this.series.find(s => !s.hidden);
    if (!main) return;
    const bar = main.api.dataByIndex(Math.round(logical), L().MismatchDirection.NearestLeft);
    if (!bar) return;
    const key = String(typeof bar.time === 'object' ? timeToIso(bar.time) : bar.time);
    const v = main.values.get(key);
    const price = Array.isArray(v) ? v[1] : v;
    const px = ts.timeToCoordinate(bar.time);
    const py = Number.isFinite(price) ? main.api.priceToCoordinate(price) : 20;
    if (Number.isFinite(price)) this.chart.setCrosshairPosition(price, bar.time, main.api);
    this._onCrosshair({ time: bar.time, point: { x: px ?? x, y: py ?? 20 } }, true);
  }

  clearScrub() {
    this.chart.clearCrosshairPosition();
    this.tip.style.display = 'none';
    if (this.onCrosshair) this.onCrosshair(null);
  }

  _onCrosshair(p, fromScrub = false) {
    if (this._suppress) return;
    // On touch the library reports "no crosshair" when the finger lifts; keep
    // the scrubbed tooltip visible until the user taps elsewhere.
    if (TOUCH && !fromScrub && (!p || !p.point) && this.tip.style.display === 'block') return;
    if (this.onCrosshair) this.onCrosshair(p);
    if (!p || !p.time || !p.point || p.point.x < 0) { this.tip.style.display = 'none'; return; }
    const key = String(typeof p.time === 'object' ? timeToIso(p.time) : p.time);
    const rows = [];
    for (const s of this.series) {
      if (!s.visibleInLegend || s.hidden) continue;
      let v = s.values.get(key);
      if (v === undefined && typeof p.time === 'object') v = s.values.get(timeToIso(p.time));
      if (v === undefined) continue;
      const text = s.fmt ? s.fmt(v, key) : Array.isArray(v) ? `${this.fmtPrice(v[0])} – ${this.fmtPrice(v[1])}` : this.fmtPrice(v);
      rows.push(`<div class="tip-row"><i style="background:${s.color}"></i><span>${s.label}</span><b>${text}</b></div>`);
    }
    if (this.extraTip) { const x = this.extraTip(key); if (x) rows.push(x); }
    if (!rows.length) { this.tip.style.display = 'none'; return; }
    this.tip.innerHTML = `<div class="tip-h">${this._label(p.time)}</div>${rows.join('')}`;
    this.tip.style.display = 'block';
    const w = this.container.clientWidth, tw = this.tip.offsetWidth;
    const left = p.point.x + 16 + tw > w - 60 ? p.point.x - tw - 16 : p.point.x + 16;
    this.tip.style.left = `${Math.max(4, left)}px`;
    this.tip.style.top = '8px';
  }

  toggle(entry, visible) { entry.hidden = !visible; entry.api.applyOptions({ visible }); }
  remove(entry) { this.chart.removeSeries(entry.api); this.series = this.series.filter(s => s !== entry); }
  destroy() {
    if (this._outside) document.removeEventListener('pointerdown', this._outside);
    try { this.chart.remove(); } catch (e) { /* already removed */ }
  }
}

/** Link visible ranges and crosshairs of charts that share identical time points. */
export function syncCharts(charts) {
  let busy = false;
  charts.forEach(c => {
    c.chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (busy || !range) return;
      busy = true;
      charts.forEach(o => { if (o !== c) o.chart.timeScale().setVisibleLogicalRange(range); });
      busy = false;
    });
    c.onCrosshair = p => {
      charts.forEach(o => {
        if (o === c) return;
        const s = o.series.find(x => x.kind === 'line' && !x.hidden);
        if (!s) return;
        o._suppress = true;
        if (p && p.time && p.point) {
          const key = String(typeof p.time === 'object' ? timeToIso(p.time) : p.time);
          const v = s.values.get(key);
          if (v !== undefined) o.chart.setCrosshairPosition(v, p.time, s.api); else o.chart.clearCrosshairPosition();
        } else o.chart.clearCrosshairPosition();
        o._suppress = false;
      });
    };
  });
}

/** Charts are owned by the current view; destroy them all on view change. */
export class ChartRegistry {
  constructor() { this.list = []; }
  add(c) { this.list.push(c); return c; }
  clear() { this.list.forEach(c => c.destroy()); this.list = []; }
}
