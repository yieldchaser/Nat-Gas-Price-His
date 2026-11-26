// Small SVG charts for categorical data (box plots, bars, histograms) where a
// time-series library is the wrong tool. Pure string builders; they size to
// the width passed in (the container's pixel width) so text is never stretched.

import { esc } from './dom.js?v=dfacef2177';

const niceTicks = (lo, hi, n = 5) => {
  const span = hi - lo || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
};

function frame(w, h, pad, lo, hi, fmt) {
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - lo) / (hi - lo || 1));
  const ticks = niceTicks(lo, hi, Math.max(3, Math.min(6, Math.floor((h - pad.t - pad.b) / 40))));
  const grid = ticks.map(t => `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 3.5}" text-anchor="end">${esc(fmt(t))}</text>`).join('');
  return { y, grid };
}

/**
 * Box plots. items: [{label, p10, p25, median, p75, p90, mean, n, note}]
 * Whiskers span p10–p90; box p25–p75; line = median; dot = mean.
 */
export function boxPlot(items, { fmt = v => v.toFixed(1), height = 260, color = '#4c9aff', zero = true, title = () => '', width = 720 } = {}) {
  const valid = items.filter(i => i && i.n);
  if (!valid.length) return '<div class="empty">Not enough data.</div>';
  const w = Math.max(320, Math.round(width)), pad = { t: 10, r: 8, b: 34, l: 46 };
  let lo = Math.min(...valid.map(i => i.p10)), hi = Math.max(...valid.map(i => i.p90));
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  const m = (hi - lo) * 0.06; lo -= m; hi += m;
  const { y, grid } = frame(w, height, pad, lo, hi, fmt);
  const bw = (w - pad.l - pad.r) / items.length;
  const body = items.map((it, i) => {
    const cx = pad.l + bw * (i + 0.5);
    const label = `<text x="${cx}" y="${height - 18}" text-anchor="middle">${esc(it.label)}</text>`;
    if (!it || !it.n) return label;
    const bx = cx - bw * 0.28, bwid = bw * 0.56;
    return `<g><title>${esc(title(it))}</title>
      <line x1="${cx}" x2="${cx}" y1="${y(it.p90)}" y2="${y(it.p10)}" stroke="${color}" stroke-opacity="0.55"/>
      <rect x="${bx}" y="${y(it.p75)}" width="${bwid}" height="${Math.max(1, y(it.p25) - y(it.p75))}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-opacity="0.7" rx="1.5"/>
      <line x1="${bx}" x2="${bx + bwid}" y1="${y(it.median)}" y2="${y(it.median)}" stroke="#e6ebf2" stroke-width="1.6"/>
      <circle cx="${cx}" cy="${y(it.mean)}" r="2.4" fill="#e6ebf2" fill-opacity="0.9"/>
      ${it.note ? `<text x="${cx}" y="${height - 5}" text-anchor="middle" style="fill:#8b97a8">${esc(it.note)}</text>` : ''}
      <rect x="${pad.l + bw * i}" y="${pad.t}" width="${bw}" height="${height - pad.t - pad.b}" fill="transparent"/>
    </g>${label}`;
  }).join('');
  const zl = zero && lo < 0 && hi > 0 ? `<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(0)}" y2="${y(0)}" stroke-width="1"/>` : '';
  return `<svg class="viz" viewBox="0 0 ${w} ${height}" style="height:${height}px">${grid}${zl}${body}</svg>`;
}

/** Vertical bars with signed colouring. items: [{label, value, title}] */
export function bars(items, { fmt = v => v.toFixed(1), height = 220, pos = '#3fb68b', neg = '#ef5f6b', labelEvery = 1, width = 720 } = {}) {
  const vals = items.map(i => i.value).filter(Number.isFinite);
  if (!vals.length) return '<div class="empty">Not enough data.</div>';
  const w = Math.max(320, Math.round(width)), pad = { t: 10, r: 8, b: 24, l: 46 };
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const m = (hi - lo) * 0.06; lo -= m; hi += m;
  const { y, grid } = frame(w, height, pad, lo, hi, fmt);
  const bw = (w - pad.l - pad.r) / items.length;
  const body = items.map((it, i) => {
    const x = pad.l + bw * i;
    const lab = i % labelEvery === 0 ? `<text x="${x + bw / 2}" y="${height - 8}" text-anchor="middle">${esc(it.label)}</text>` : '';
    if (!Number.isFinite(it.value)) return lab;
    const y0 = y(0), y1 = y(it.value);
    return `<g><title>${esc(it.title || `${it.label}: ${fmt(it.value)}`)}</title><rect x="${x + bw * 0.15}" y="${Math.min(y0, y1)}" width="${bw * 0.7}" height="${Math.max(1, Math.abs(y1 - y0))}" fill="${it.value >= 0 ? pos : neg}" fill-opacity="${it.dim ? 0.35 : 0.8}" rx="1"/><rect x="${x}" y="${pad.t}" width="${bw}" height="${height - pad.t - pad.b}" fill="transparent"/></g>${lab}`;
  }).join('');
  return `<svg class="viz" viewBox="0 0 ${w} ${height}" style="height:${height}px">${grid}<line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(0)}" y2="${y(0)}"/>${body}</svg>`;
}

/** Histogram with an optional reference density curve. bins: [{lo, hi, count}] */
export function histogramSvg(bins, { fmt = v => v.toFixed(1), height = 220, color = '#4c9aff', density = null, markers = [], width = 720 } = {}) {
  if (!bins.length) return '<div class="empty">Not enough data.</div>';
  const w = Math.max(320, Math.round(width)), pad = { t: 10, r: 8, b: 24, l: 46 };
  const total = bins.reduce((s, b) => s + b.count, 0) || 1;
  const binW = bins[0].hi - bins[0].lo;
  const dens = bins.map(b => b.count / total / binW);
  const curve = density ? bins.map(b => density((b.lo + b.hi) / 2)) : [];
  const top = Math.max(...dens, ...curve) * 1.08;
  const lo = bins[0].lo, hi = bins[bins.length - 1].hi;
  const x = v => pad.l + (w - pad.l - pad.r) * (v - lo) / (hi - lo);
  const y = v => pad.t + (height - pad.t - pad.b) * (1 - v / top);
  const rects = bins.map((b, i) => `<g><title>${esc(`${fmt(b.lo)} to ${fmt(b.hi)}: ${b.count} (${(b.count / total * 100).toFixed(1)}%)`)}</title><rect x="${x(b.lo) + 0.5}" y="${y(dens[i])}" width="${Math.max(0.5, x(b.hi) - x(b.lo) - 1)}" height="${y(0) - y(dens[i])}" fill="${color}" fill-opacity="0.55"/><rect x="${x(b.lo)}" y="${pad.t}" width="${Math.max(1, x(b.hi) - x(b.lo))}" height="${y(0) - pad.t}" fill="transparent"/></g>`).join('');
  const path = density ? `<path d="${bins.map((b, i) => `${i ? 'L' : 'M'}${x((b.lo + b.hi) / 2)},${y(curve[i])}`).join('')}" fill="none" stroke="#e6ebf2" stroke-opacity="0.7" stroke-width="1.2" stroke-dasharray="3 3"/>` : '';
  const ticks = niceTicks(lo, hi, 8).map(t => `<text x="${x(t)}" y="${height - 8}" text-anchor="middle">${esc(fmt(t))}</text>`).join('');
  const mk = markers.map(mk => `<line x1="${x(mk.value)}" x2="${x(mk.value)}" y1="${pad.t}" y2="${y(0)}" stroke="${mk.color}" stroke-dasharray="2 3"/><text x="${x(mk.value) + 3}" y="${pad.t + 10}" style="fill:${mk.color}">${esc(mk.label)}</text>`).join('');
  return `<svg class="viz" viewBox="0 0 ${w} ${height}" style="height:${height}px"><line class="axis" x1="${pad.l}" x2="${w - pad.r}" y1="${y(0)}" y2="${y(0)}"/>${rects}${path}${mk}${ticks}</svg>`;
}
