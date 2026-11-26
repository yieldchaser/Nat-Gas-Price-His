// Settlements: final settlement of every contract that traded through expiry,
// seasonal shape of settlements, and annual averages. Open contracts appear
// only as clearly marked forward prices.

import { MONTHS } from '../lib/calendar.js?v=b09a9c5d5a';
import { seasonalFactors, settlementMatrix, yearAggregates } from '../lib/compute.js?v=ec32e659e3';
import { mean } from '../lib/numeric.js?v=ef231cc822';
import { COLORS } from '../ui/charts.js?v=411f859bd3';
import { bindControls, esc, panel, segmented } from '../ui/dom.js?v=dfacef2177';
import { bars, boxPlot } from '../ui/svg.js?v=5e97ba49c2';
import * as F from '../ui/format.js?v=d7252d9aa7';

const WINDOWS = [{ value: '5', label: '5Y' }, { value: '10', label: '10Y' }, { value: '20', label: '20Y' }, { value: 'all', label: 'All' }];

function divergent(dev) {
  if (!Number.isFinite(dev)) return 'transparent';
  const a = (0.06 + Math.min(1, Math.abs(dev) / 30) * 0.6).toFixed(2);
  return dev >= 0 ? `rgba(240,160,75,${a})` : `rgba(76,154,255,${a})`;
}
function sequential(v, lo, hi) {
  if (!Number.isFinite(v)) return 'transparent';
  const t = Math.max(0, Math.min(1, (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo) || 1)));
  return `rgba(76,154,255,${(0.05 + t * 0.6).toFixed(2)})`;
}

export default {
  id: 'settlements',
  title: 'Settlements',

  render(root, ctx, params) {
    const key = params.m === 'TTF' && ctx.ttf ? 'TTF' : 'HH';
    const market = key === 'TTF' ? ctx.ttf : ctx.hh;
    const m = market.meta;
    const mode = params.c === 'level' ? 'level' : 'season';
    const fwd = ['none', 'all'].includes(params.f) ? params.f : 'next';
    const win = WINDOWS.some(w => w.value === params.w) ? params.w : '10';
    const mx = settlementMatrix(market);
    const settledYears = mx.years.filter(y => MONTHS.every((_, i) => { const c = mx.cells.get(`${y}-${i + 1}`); return c && c.kind === 'settled'; }));
    const lastFull = settledYears.length ? Math.max(...settledYears) : null;
    const fromYear = win === 'all' ? 0 : lastFull - Number(win) + 1;
    const incomplete = market.list.filter(c => market.status(c) === 'incomplete').map(c => c.ticker);

    root.innerHTML = `
      <div class="view-h"><div><h1>${esc(m.name)} settlement history</h1>
      <p>Final settlement = the contract's close on its last trading day (${esc(m.unit)}). Only contracts whose history reaches their last trading day are shown as settled; open contracts appear in italics at their latest price.</p></div>
      <div class="panel-c">${ctx.ttf ? segmented('market', [{ value: 'HH', label: 'Henry Hub' }, { value: 'TTF', label: 'Dutch TTF' }], key) : ''}
        ${segmented('mode', [{ value: 'season', label: 'vs year average' }, { value: 'level', label: 'Price level' }], mode, { label: 'Colour' })}
        ${segmented('fwd', [{ value: 'none', label: 'None' }, { value: 'next', label: 'To next Dec' }, { value: 'all', label: 'All' }], fwd, { label: 'Open contracts' })}</div></div>
      ${incomplete.length ? `<div class="banner"><b>${incomplete.length} expired contract${incomplete.length > 1 ? 's' : ''} without a final settlement</b> (${esc(incomplete.join(', '))}): archived history stops before the last trading day, so no settlement is shown rather than a stale price.</div>` : ''}
      <div class="grid">
        ${panel({ id: 'st-matrix', cls: 's12', title: 'Final settlements by delivery month', sub: mode === 'season'
          ? 'Colour: settlement relative to the average of the same calendar year (orange above, blue below) — highlights each year\'s seasonal shape.'
          : 'Colour: price level on a log scale across the whole table.',
          body: '', note: '<b>Columns.</b> Avg = mean of 12 settlements (only when all 12 settled). Summer = Apr–Oct. Winter = Nov–Mar starting in that year\'s November. Click a cell to open the contract.' })}
        ${panel({ id: 'st-factors', cls: 's7', title: 'Seasonal settlement premium', sub: 'Each month\'s settlement relative to its calendar-year average, across complete years. Box: interquartile · whiskers: 10th–90th percentile · line: median · dot: mean.',
          controls: segmented('w', WINDOWS, win, { label: 'Years' }), body: '' })}
        ${panel({ id: 'st-annual', cls: 's5', title: 'Annual average settlement', sub: 'Mean of the 12 monthly settlements per complete calendar year.', body: '' })}
      </div>`;

    const go = p => ctx.navigate('settlements', { m: key, c: mode === 'level' ? 'level' : '', w: win, f: fwd === 'next' ? '' : fwd, ...p });
    bindControls(root, {
      market: v => go({ m: v }),
      mode: v => go({ c: v === 'level' ? 'level' : '' }),
      w: v => go({ w: v }),
      fwd: v => go({ f: v === 'next' ? '' : v }),
    });

    // Open contracts are shown (as forwards) only within the chosen horizon.
    const lastYear = +market.lastDate.slice(0, 4);
    const maxYear = fwd === 'all' ? Infinity : fwd === 'next' ? lastYear + 1 : lastYear;
    const shown = { years: mx.years.filter(y => y <= maxYear), cells: new Map([...mx.cells].filter(([, c]) => fwd !== 'none' || c.kind !== 'forward')) };
    this.renderMatrix(ctx, market, shown, mode, key);
    const factors = seasonalFactors(mx, Math.max(fromYear, 0), lastFull || 0);
    const el = document.getElementById('st-factors-body');
    const n = factors.find(f => f.n) ? factors.find(f => f.n).n : 0;
    el.innerHTML = boxPlot(factors.map(f => ({ ...f, note: f.n ? F.signedPct(f.median, 0) : '' })), { width: el.clientWidth, height: 260, fmt: v => `${v.toFixed(0)}%`, color: market.key === 'TTF' ? COLORS.ttf : COLORS.hh,
      title: it => `${it.label}: median ${F.signedPct(it.median)} vs year average, IQR ${F.signedPct(it.p25)} to ${F.signedPct(it.p75)} (${it.n} years)` })
      + `<p class="muted" style="font-size:11.5px;margin-top:4px">${n} complete years${lastFull ? ` (${Math.max(fromYear, Math.min(...settledYears))}–${lastFull})` : ''}. Labels: median premium.</p>`;
    const ann = settledYears.slice().sort((a, b) => a - b).map(y => ({ label: String(y).slice(2), value: yearAggregates(mx, y).cal, title: `${y}: ${F.price(yearAggregates(mx, y).cal, m)}` }));
    const ae = document.getElementById('st-annual-body');
    ae.innerHTML = bars(ann, { width: ae.clientWidth, height: 260, fmt: v => `${m.ccy}${Number.isInteger(v) ? v : v.toFixed(1)}`, pos: market.key === 'TTF' ? COLORS.ttf : COLORS.hh, labelEvery: ann.length > 20 ? 3 : 1 });
  },

  renderMatrix(ctx, market, mx, mode, key) {
    const m = market.meta;
    const all = [...mx.cells.values()].map(c => c.value).filter(Number.isFinite);
    const lo = Math.min(...all), hi = Math.max(...all);
    const val = (y, mo) => mx.cells.get(`${y}-${mo}`);
    const head = `<tr><th class="row">Year</th>${MONTHS.map(n => `<th>${n}</th>`).join('')}<th>Avg</th><th>Summer</th><th>Winter</th></tr>`;
    const rows = mx.years.map(y => {
      const vs = MONTHS.map((_, i) => val(y, i + 1)).filter(c => c && Number.isFinite(c.value)).map(c => c.value);
      const ym = vs.length ? mean(vs) : null;
      const cells = MONTHS.map((_, i) => {
        const c = val(y, i + 1);
        if (!c) return '<td class="na"></td>';
        if (c.kind === 'incomplete') return `<td class="na" title="${c.ticker}: history ends ${c.date}, before its last trading day — no settlement">n/a</td>`;
        const bg = mode === 'season' ? divergent(ym ? (c.value / ym - 1) * 100 : null) : sequential(c.value, lo, hi);
        const tip = c.kind === 'settled' ? `${c.ticker} settled ${F.price(c.value, m)} on ${F.date(c.date)}` : `${c.ticker} open — latest ${F.price(c.value, m)} (${F.date(c.date)}), not a settlement`;
        return `<td class="click ${c.kind === 'forward' ? 'fwd' : ''}" data-c="${c.ticker}" style="background:${bg}" title="${esc(tip)}">${F.num(c.value, m.dp)}</td>`;
      }).join('');
      const ag = yearAggregates(mx, y);
      const win = [[y, 11], [y, 12], [y + 1, 1], [y + 1, 2], [y + 1, 3]].map(([yy, mo]) => val(yy, mo));
      const winter = win.every(c => c && c.kind === 'settled') ? mean(win.map(c => c.value)) : null;
      return `<tr><th class="row">${y}</th>${cells}<td>${F.num(ag.cal, m.dp)}</td><td>${F.num(ag.summer, m.dp)}</td><td>${F.num(winter, m.dp)}</td></tr>`;
    }).join('');
    const el = document.getElementById('st-matrix-body');
    el.innerHTML = `<div class="tbl-wrap" style="max-height:640px"><table class="heat"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="scale">${mode === 'season'
        ? '<span>below year avg</span><span class="bar" style="background:linear-gradient(90deg,rgba(76,154,255,0.66),rgba(76,154,255,0.06),rgba(240,160,75,0.06),rgba(240,160,75,0.66))"></span><span>above (±30%)</span>'
        : `<span>${F.price(lo, m)}</span><span class="bar" style="background:linear-gradient(90deg,rgba(76,154,255,0.05),rgba(76,154,255,0.65))"></span><span>${F.price(hi, m)} (log scale)</span>`}
        <span style="margin-left:16px"><i>italic</i> = open contract, latest price</span></div>`;
    el.addEventListener('click', e => { const td = e.target.closest('td[data-c]'); if (td) ctx.navigate('contracts', { m: key, c: td.dataset.c }); });
  },
};
