// Seasonality & risk of the front month: seasonal price path, roll-adjusted
// monthly/annual returns, return and volatility distributions by month.

import { MONTHS } from '../lib/calendar.js';
import { monthlyVol, returnGrid, seasonalPath } from '../lib/analytics.js';
import { boxStats, histogram, moments, quantile } from '../lib/stats.js';
import { COLORS, Chart } from '../ui/charts.js';
import { bindControls, esc, panel, segmented } from '../ui/dom.js';
import { bars, boxPlot, histogramSvg } from '../ui/svg.js';
import * as F from '../ui/format.js';

const WINDOWS = [{ value: 'all', label: 'All' }, { value: '2010', label: 'Since 2010' }, { value: '10', label: '10Y' }];

function heatColor(v, scale = 20) {
  if (!Number.isFinite(v)) return 'transparent';
  const a = (0.08 + Math.min(1, Math.abs(v) / scale) * 0.6).toFixed(2);
  return v >= 0 ? `rgba(63,182,139,${a})` : `rgba(239,95,107,${a})`;
}

export default {
  id: 'seasonality',
  title: 'Seasonality',

  render(root, ctx, params) {
    const key = params.m === 'TTF' && ctx.ttf ? 'TTF' : 'HH';
    const market = key === 'TTF' ? ctx.ttf : ctx.hh;
    const cont = market.continuous();
    const lastYear = +market.lastDate.slice(0, 4);
    const win = WINDOWS.some(w => w.value === params.w) ? params.w : 'all';
    const fromYear = win === 'all' ? 0 : win === '2010' ? 2010 : lastYear - 10;
    const pathYears = params.py === '10' ? 10 : 5;

    root.innerHTML = `
      <div class="view-h"><div><h1>${esc(market.meta.name)} seasonality and risk</h1>
      <p>Front-month series rolled at each last trading day. Returns are compounded same-contract daily returns, so the price gap between expiring and next contracts is never treated as performance. ${key === 'TTF' ? 'TTF history starts in 2016.' : ''}</p></div>
      <div class="panel-c">${ctx.ttf ? segmented('market', [{ value: 'HH', label: 'Henry Hub' }, { value: 'TTF', label: 'Dutch TTF' }], key) : ''}${segmented('w', WINDOWS, win, { label: 'Statistics window' })}</div></div>
      <div class="grid">
        ${panel({ id: 'se-path', cls: 's12', title: `Seasonal price path · ${lastYear}`, sub: `Front-month close by calendar day this year against the range and average of the previous ${pathYears} years on the same day.`,
          controls: segmented('py', [{ value: '5', label: '5Y' }, { value: '10', label: '10Y' }], String(pathYears), { label: 'Compare' }),
          body: '<div class="legend" id="se-path-legend"></div><div id="se-path-chart" class="chart h280"></div>',
          note: '<b>Note.</b> Nominal prices; the contract in front changes through the year, so the line includes roll gaps. Days are matched by month and day (29 Feb folded into 28 Feb).' })}
        ${panel({ id: 'se-heat', cls: 's7', title: 'Monthly returns (roll-adjusted, %)', sub: 'Compounded same-contract daily returns within each calendar month; Year = compounded over the year. The current month is month-to-date.', body: '' })}
        <div class="s5" style="display:flex;flex-direction:column;gap:var(--gap);min-width:0">
          ${panel({ id: 'se-box', title: 'Monthly return distribution', sub: 'Box: 25th–75th percentile · whiskers: 10th–90th · line: median · dot: mean. Below each month: share of positive months.', body: '' })}
          ${panel({ id: 'se-vol', title: 'Realised volatility by calendar month', sub: 'Annualised volatility of daily returns within each month (×√252), distribution across years.', body: '' })}
        </div>
        ${panel({ id: 'se-annual', cls: 's6', title: 'Annual returns (roll-adjusted)', sub: 'Compounded same-contract returns per calendar year. Faded bar = year to date.', body: '' })}
        ${panel({ id: 'se-dist', cls: 's6', title: 'Daily return distribution', sub: 'Same-contract daily log returns in the statistics window; dashed curve: normal distribution with the same mean and standard deviation.', body: '' })}
      </div>`;

    bindControls(root, {
      market: v => ctx.navigate('seasonality', { m: v, w: win }),
      w: v => ctx.navigate('seasonality', { m: key, w: v, py: pathYears }),
      py: v => ctx.navigate('seasonality', { m: key, w: win, py: v }),
    });

    this.renderPath(ctx, market, cont, lastYear, pathYears);
    const grid = returnGrid(cont);
    this.renderHeat(grid, fromYear, lastYear);
    this.renderBoxes(grid, cont, fromYear);
    this.renderAnnual(grid, fromYear, lastYear);
    this.renderDist(cont, fromYear);
  },

  renderPath(ctx, market, cont, year, years) {
    const m = market.meta;
    const { rows, current } = seasonalPath(cont.dates, cont.p, year, years);
    const prev = seasonalPath(cont.dates, cont.p, year - 1, 0).current;
    const ch = ctx.charts.add(new Chart(document.getElementById('se-path-chart'), { priceDp: m.dp - 1, fixRight: true }));
    const fmt = v => F.price(v, m);
    const x = md => `${year}-${md}`;
    ch.band(rows.map(r => ({ x: x(r.md), lo: r.lo, hi: r.hi })), { label: `${years}Y range`, fill: 'rgba(148,163,184,0.15)', fmt: v => `${fmt(v[0])} – ${fmt(v[1])}` });
    ch.line(rows.map(r => ({ x: x(r.md), y: r.mean })), { label: `${years}Y average`, color: COLORS.median, width: 1, style: 2, fmt, lastValue: false });
    const prevMap = new Map(prev.map(p => [p.md, p.v]));
    ch.line(rows.map(r => ({ x: x(r.md), y: prevMap.get(r.md) ?? null })), { label: String(year - 1), color: COLORS.ref, width: 1, fmt, lastValue: false });
    ch.line(current.map(p => ({ x: x(p.md), y: p.v })), { label: String(year), color: market.key === 'TTF' ? COLORS.ttf : COLORS.hh, width: 2, fmt });
    ch.fit();
    document.getElementById('se-path-legend').innerHTML = `<span><i style="background:${market.key === 'TTF' ? COLORS.ttf : COLORS.hh}"></i>${year}</span><span><i style="background:${COLORS.ref}"></i>${year - 1}</span><span style="color:${COLORS.median}"><i class="dash"></i><span class="dim">${years}Y average</span></span><span><i class="box" style="background:rgba(148,163,184,0.25)"></i>${years}Y range (${year - years}–${year - 1})</span>`;
  },

  renderHeat(grid, fromYear, lastYear) {
    const head = `<tr><th class="row"></th>${MONTHS.map(n => `<th>${n}</th>`).join('')}<th>Year</th></tr>`;
    const rows = grid.years.map(y => {
      const cells = MONTHS.map((_, i) => {
        const c = grid.cell.get(`${y}-${i + 1}`);
        if (!c) return '<td class="na"></td>';
        const partial = y === lastYear && i + 1 === +grid.months[grid.months.length - 1].month && c === grid.months[grid.months.length - 1];
        return `<td style="background:${heatColor(c.ret)}" title="${MONTHS[i]} ${y}: ${F.signedPct(c.ret, 1)}${partial ? ' (month to date)' : ''} · ${c.n} sessions">${F.num(c.ret, 1)}${partial ? '*' : ''}</td>`;
      }).join('');
      const a = grid.annual.get(y);
      return `<tr><th class="row">${y}</th>${cells}<td style="background:${heatColor(a.ret, 60)};font-weight:500" title="${y}: ${F.signedPct(a.ret)}${y === lastYear ? ' (year to date)' : ''}">${F.num(a.ret, 0)}${y === lastYear ? '*' : ''}</td></tr>`;
    }).join('');
    // Summary rows over the statistics window, complete months only
    const inWin = grid.months.filter(c => c.year >= fromYear && !(c === grid.months[grid.months.length - 1]));
    const stat = (fn, fmtv) => MONTHS.map((_, i) => {
      const xs = inWin.filter(c => c.month === i + 1).map(c => c.ret);
      return `<td class="muted">${xs.length ? fmtv(fn(xs)) : '—'}</td>`;
    }).join('');
    const summary = `
      <tr><th class="row muted">Mean</th>${stat(xs => xs.reduce((s, v) => s + v, 0) / xs.length, v => F.num(v, 1))}<td></td></tr>
      <tr><th class="row muted">Median</th>${stat(xs => quantile(xs, 0.5), v => F.num(v, 1))}<td></td></tr>
      <tr><th class="row muted">% up</th>${stat(xs => xs.filter(v => v > 0).length / xs.length * 100, v => F.num(v, 0))}<td></td></tr>`;
    document.getElementById('se-heat-body').innerHTML = `<div class="tbl-wrap" style="max-height:610px"><table class="heat"><thead>${head}</thead><tbody>${summary}<tr><td colspan="14" style="height:6px"></td></tr>${rows}</tbody></table></div>
      <p class="muted" style="font-size:11.5px;margin-top:6px">* partial period. Summary rows use complete months in the statistics window${fromYear ? ` (${fromYear}+)` : ''}.</p>`;
  },

  renderBoxes(grid, cont, fromYear) {
    const months = grid.months.slice(0, -1).filter(c => c.year >= fromYear);   // drop the partial current month
    const el = document.getElementById('se-box-body');
    const items = MONTHS.map((n, i) => {
      const b = boxStats(months.filter(c => c.month === i + 1).map(c => c.ret));
      return b ? { label: n, ...b, note: `${Math.round(b.pctPositive)}%` } : { label: n, n: 0 };
    });
    el.innerHTML = boxPlot(items, { width: el.clientWidth, height: 250, fmt: v => `${v.toFixed(0)}%`, color: COLORS.hh,
      title: it => `${it.label}: median ${F.signedPct(it.median)}, mean ${F.signedPct(it.mean)}, IQR ${F.signedPct(it.p25)} to ${F.signedPct(it.p75)}, ${it.n} years, ${Math.round(it.pctPositive)}% positive` });
    const vols = monthlyVol(cont).filter(v => v.year >= fromYear);
    const lastKey = cont.dates[cont.dates.length - 1].slice(0, 7);
    const vitems = MONTHS.map((n, i) => {
      const b = boxStats(vols.filter(v => v.month === i + 1 && `${v.year}-${String(v.month).padStart(2, '0')}` !== lastKey).map(v => v.vol));
      return b ? { label: n, ...b } : { label: n, n: 0 };
    });
    const ve = document.getElementById('se-vol-body');
    ve.innerHTML = boxPlot(vitems, { width: ve.clientWidth, height: 220, zero: false, fmt: v => `${v.toFixed(0)}%`, color: COLORS.warn,
      title: it => `${it.label}: median ${F.pct(it.median)}, IQR ${F.pct(it.p25)}–${F.pct(it.p75)}, ${it.n} years` });
  },

  renderAnnual(grid, fromYear, lastYear) {
    const years = grid.years.filter(y => y >= fromYear).slice().reverse();
    const el = document.getElementById('se-annual-body');
    const items = years.map(y => ({ label: String(y).slice(2), value: grid.annual.get(y).ret, dim: y === lastYear, title: `${y}: ${F.signedPct(grid.annual.get(y).ret)}${y === lastYear ? ' (YTD)' : ''}` }));
    el.innerHTML = bars(items, { width: el.clientWidth, height: 240, fmt: v => `${v.toFixed(0)}%`, labelEvery: years.length > 24 ? 2 : 1 });
  },

  renderDist(cont, fromYear) {
    const r = cont.r.filter((x, i) => Number.isFinite(x) && +cont.dates[i].slice(0, 4) >= fromYear).map(x => x * 100);
    const mo = moments(r);
    const el = document.getElementById('se-dist-body');
    if (!mo) { el.innerHTML = '<div class="empty">Not enough data.</div>'; return; }
    const lim = Math.max(Math.abs(quantile(r, 0.002)), Math.abs(quantile(r, 0.998)));
    const bins = histogram(r, 60, -lim, lim);
    const pdf = x => Math.exp(-0.5 * ((x - mo.mean) / mo.sd) ** 2) / (mo.sd * Math.sqrt(2 * Math.PI));
    const v95 = quantile(r, 0.05), v99 = quantile(r, 0.01);
    el.innerHTML = histogramSvg(bins, { width: el.clientWidth, height: 220, fmt: v => `${v.toFixed(0)}%`, density: pdf,
      markers: [{ value: v95, label: '5%', color: COLORS.warn }, { value: v99, label: '1%', color: COLORS.neg }] }) + `
      <div class="kpis" style="margin-top:10px;grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="kpi"><div class="kpi-l">Daily stdev · annualised</div><div class="kpi-v">${F.num(mo.sd, 2)}% <small>${F.pct(mo.sd * Math.sqrt(252), 0)}</small></div></div>
        <div class="kpi"><div class="kpi-l">5% / 1% daily quantile</div><div class="kpi-v">${F.signedPct(v95, 1)} <small>${F.signedPct(v99, 1)}</small></div></div>
        <div class="kpi"><div class="kpi-l">Skew · excess kurtosis</div><div class="kpi-v">${F.signed(mo.skew, 2)} <small>${F.num(mo.kurt, 1)}</small></div></div>
      </div>
      <p class="muted" style="font-size:11.5px;margin-top:6px">${F.int(mo.n)} sessions. Bins clipped at the 0.2/99.8 percentiles; extreme days are counted in the end bins. Excess kurtosis above 0 means fatter tails than the normal curve.</p>`;
  },
};
