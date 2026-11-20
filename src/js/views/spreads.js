// Spreads: calendar spreads and butterflies through their lives, compared with
// the same structure in prior years at the same point, plus a rich/cheap
// scanner across all month pairs.

import { MONTHS, makeTicker } from '../lib/calendar.js';
import { spreadScanner, structureAnalysis, structureLegs } from '../lib/analytics.js';
import { COLORS, Chart, timeToT } from '../ui/charts.js';
import { bindControls, esc, panel, segmented, select } from '../ui/dom.js';
import * as F from '../ui/format.js';

const WINDOWS = [{ value: '5', label: '5Y' }, { value: '10', label: '10Y' }, { value: 'all', label: 'All' }];
const monthOpts = MONTHS.map((n, i) => ({ value: i + 1, label: n }));

function defaults(market) {
  const asOf = market.lastDate;
  let y = +asOf.slice(0, 4);
  if (market.expiryOf(makeTicker(market.prefix, y, 3)) < asOf) y++;
  return { a: 3, b: 4, c: 5, year: y };   // March/April: the classic winter-to-summer spread
}

/** Diverging colour for a percentile (50 = neutral). */
function pctColor(p) {
  if (p == null) return 'transparent';
  const d = (p - 50) / 50;
  const a = (0.1 + Math.abs(d) * 0.55).toFixed(2);
  return d >= 0 ? `rgba(240,160,75,${a})` : `rgba(76,154,255,${a})`;
}

export default {
  id: 'spreads',
  title: 'Spreads',

  render(root, ctx, params) {
    const key = params.m === 'TTF' && ctx.ttf ? 'TTF' : 'HH';
    const market = key === 'TTF' ? ctx.ttf : ctx.hh;
    const m = market.meta;
    const d = defaults(market);
    const kind = params.k === 'fly' ? 'fly' : 'spread';
    const a = +params.a || d.a, b = +params.b || d.b, c = +params.c || d.c;
    const months = kind === 'fly' ? [a, b, c] : [a, b];
    const valid = kind === 'fly' ? new Set(months).size === 3 : a !== b;
    const years = market.yearsFor(a);
    const year = years.includes(+params.y) ? +params.y : d.year;
    const win = WINDOWS.some(w => w.value === params.w) ? params.w : '5';
    const bandYears = win === 'all' ? Infinity : +win;
    const cmp = (params.cmp || '').split(',').map(Number).filter(Boolean);

    const controls = [
      ctx.ttf ? segmented('market', [{ value: 'HH', label: 'Henry Hub' }, { value: 'TTF', label: 'Dutch TTF' }], key) : '',
      segmented('kind', [{ value: 'spread', label: 'Calendar spread' }, { value: 'fly', label: 'Butterfly' }], kind),
      select('a', monthOpts, a, { label: kind === 'fly' ? 'Wing 1' : 'Front' }),
      select('b', monthOpts, b, { label: kind === 'fly' ? 'Body' : 'Back' }),
      kind === 'fly' ? select('c', monthOpts, c, { label: 'Wing 2' }) : '',
      select('y', years.slice().reverse().map(y => ({ value: y, label: y })), year, { label: 'Front year' }),
      segmented('w', WINDOWS, win, { label: 'History' }),
    ].join('');

    const legs = structureLegs(market.prefix, kind, months, year);
    const name = legs.map(l => l.ticker).join(kind === 'fly' ? ' · ' : ' / ');
    const formula = kind === 'fly' ? `${legs[0].ticker} − 2×${legs[1].ticker} + ${legs[2].ticker}` : `${legs[0].ticker} − ${legs[1].ticker}`;

    root.innerHTML = `
      <div class="view-h"><div><h1>${esc(m.name)} ${kind === 'fly' ? 'butterfly' : 'calendar spread'} · ${esc(name)}</h1>
      <p>Value = ${esc(formula)} (${esc(m.unit)}). Positive means the ${kind === 'fly' ? 'wings are priced above the body' : 'front month is priced above the back month'}. Prior years are aligned by weekdays to the front leg's expiry.</p></div>
      <div class="panel-c">${controls}</div></div>
      ${valid ? `<div class="split">
        ${panel({ id: 'sp-main', title: 'Structure through its life', sub: `Shaded: range and interquartile band of the prior ${bandYears === Infinity ? 'all' : bandYears} years at the same point; dashed: their median.`,
          body: '<div class="legend" id="sp-legend"></div><div id="sp-chart" class="chart h420"></div><div class="sub-h">Overlay prior years</div><div class="chips" id="sp-chips"></div>',
          note: '<b>Method.</b> Legs are joined on common trading dates only; short holiday gaps are interpolated when building the historical band.' })}
        ${panel({ id: 'sp-stats', title: 'Current reading', body: '' })}
      </div>
      <div class="grid" style="margin-top:var(--gap)">
        ${panel({ id: 'sp-table', cls: kind === 'spread' ? 's5' : 's12', title: 'History by year', sub: 'Value at the same lifecycle point, at the front leg\'s expiry, and the range over each structure\'s life. Click a row to load that year.', body: '' })}
        ${kind === 'spread' ? panel({ id: 'sp-scan', cls: 's7', title: 'Rich / cheap scanner', sub: 'Current value of every front/back calendar spread (front leg = next unexpired delivery of the row month), coloured by its percentile versus all prior years at the same point in life.',
          body: '<div id="sp-scan-grid"></div>', note: '<b>Reading.</b> Orange: wide versus history (front rich to back); blue: narrow. Cells need at least 5 prior years. Click a cell to analyse it.' }) : ''}
      </div>` : '<div class="banner">Choose distinct months for each leg.</div>'}`;

    const go = p => ctx.navigate('spreads', { m: key, k: kind, a, b, c: kind === 'fly' ? c : '', y: year, w: win, ...p });
    bindControls(root, {
      market: v => ctx.navigate('spreads', { m: v, k: kind }),
      kind: v => go({ k: v, c: v === 'fly' ? ((b % 12) + 1) : '', cmp: '' }),
      a: v => go({ a: v, cmp: '' }), b: v => go({ b: v, cmp: '' }), c: v => go({ c: v, cmp: '' }),
      y: v => go({ y: v, cmp: '' }), w: v => go({ w: v, cmp: cmp.join(',') }),
    });
    if (!valid) return;

    const res = structureAnalysis(market, kind, months, year, bandYears);
    this.renderChart(ctx, market, res, year, cmp);
    this.renderStats(market, res, year, bandYears, legs);
    this.renderTable(ctx, market, res, year, go);
    if (kind === 'spread') this.renderScanner(ctx, market, a, b, go);
    this.renderChips(ctx, [...res.byYear.keys()].filter(y => y < year).sort((x, z) => z - x).slice(0, 15), cmp);
  },

  renderChart(ctx, market, res, year, cmp) {
    const m = market.meta;
    const fmt = v => F.signedPrice(v, m);
    const chart = ctx.charts.add(new Chart(document.getElementById('sp-chart'), { axis: 't', priceDp: m.dp }));
    const cur = res.byYear.get(year) || [];
    const tMax = cur.length ? cur[0].t : 260;
    const band = res.band.filter(r => r.t <= Math.max(tMax, 120));
    if (band.length) {
      chart.band(band.map(r => ({ x: r.t, lo: r.lo, hi: r.hi })), { label: 'Prior-year range', fill: 'rgba(148,163,184,0.10)', fmt: v => `${fmt(v[0])} … ${fmt(v[1])}` });
      chart.band(band.map(r => ({ x: r.t, lo: r.p25, hi: r.p75 })), { label: 'Interquartile', fill: 'rgba(148,163,184,0.17)', fmt: v => `${fmt(v[0])} … ${fmt(v[1])}` });
      chart.line(band.map(r => ({ x: r.t, y: r.median })), { label: 'Prior-year median', color: COLORS.median, width: 1, style: 2, fmt, lastValue: false });
    }
    cmp.forEach((y, i) => {
      const s = res.byYear.get(y);
      if (s) chart.line(s.filter(p => p.t <= Math.max(tMax, 120)).map(p => ({ x: p.t, y: p.v })), { label: String(y), color: COLORS.years[(i + 1) % COLORS.years.length], width: 1, fmt, lastValue: false });
    });
    const main = chart.line(cur.map(p => ({ x: p.t, y: p.v })), { label: String(year), color: COLORS.spread, width: 2, fmt });
    chart.priceLine(main, 0, { color: COLORS.ref, style: 0 });
    const byT = new Map(cur.map(p => [p.t, p]));
    chart.extraTip = k => { const p = byT.get(timeToT(Number(k))); return p ? `<div class="tip-row"><i></i><span>${year} date</span><b>${F.date(p.date)}</b></div>` : ''; };
    if (cur.length) chart.setRange(tMax, 0); else chart.fit();
    document.getElementById('sp-legend').innerHTML = `<span><i style="background:${COLORS.spread}"></i>${year}${cur.length ? '' : ' (no data yet)'}</span>
      <span><i class="box" style="background:rgba(148,163,184,0.22)"></i>Prior-year interquartile · range</span><span style="color:${COLORS.median}"><i class="dash"></i><span class="dim">Median</span></span>`;
  },

  renderStats(market, res, year, bandYears, legs) {
    const m = market.meta;
    const s = res.stats;
    const el = document.getElementById('sp-stats-body');
    if (!s) { el.innerHTML = `<div class="empty">No common trading dates yet for ${esc(legs.map(l => l.ticker).join(' / '))}.</div>`; return; }
    const front = market.get(legs[0].ticker);
    const settled = front && market.status(front) === 'settled';
    el.innerHTML = `
      <div class="kpi-v" style="font-size:24px">${F.signedPrice(s.value, m)}</div>
      <div class="muted" style="margin:2px 0 12px;font-size:12px">${settled ? 'final value at front-leg expiry' : `T−${s.t} · ${F.date(s.date)}`}</div>
      <dl class="stat-list">
        <dt>Percentile vs ${s.nAll} prior years</dt><dd>${F.ordinal(s.pctileAll)}</dd>
        <dt>Mean of prior ${bandYears === Infinity ? s.nBand : Math.min(bandYears, s.nBand)}Y at T−${s.t}</dt><dd>${F.signedPrice(s.meanBand, m)}</dd>
        <dt>z-score vs that window</dt><dd>${s.z == null ? '—' : F.signed(s.z, 2)}</dd>
        <dt>Mean final value (${s.nFinal}Y)</dt><dd>${F.signedPrice(s.finalMean, m)}</dd>
        <dt>Median final value</dt><dd>${F.signedPrice(s.finalMedian, m)}</dd>
      </dl>
      <div class="sub-h">Legs</div>
      <dl class="stat-list">${legs.map(l => { const c = market.get(l.ticker); return `<dt>${l.w > 0 ? '+' : '−'}${Math.abs(l.w) > 1 ? Math.abs(l.w) + '×' : ''}${l.ticker}</dt><dd>${c ? F.price(c.priceOn(s.date), m) : '—'}</dd>`; }).join('')}</dl>`;
  },

  renderTable(ctx, market, res, year, go) {
    const m = market.meta;
    const f = v => F.signedPrice(v, m);
    const tNow = res.stats ? res.stats.t : null;
    const rows = res.table.map(r => `<tr class="${r.year === year ? 'hl' : 'click'}" data-y="${r.year}"><td>${r.year} <span class="muted">${esc(r.label)}</span></td>
      <td class="n">${f(r.atT)}</td><td class="n">${r.settled ? f(r.final) : '<span class="muted">open</span>'}</td>
      <td class="n">${f(r.min)}</td><td class="n">${f(r.max)}</td></tr>`).join('');
    const el = document.getElementById('sp-table-body');
    el.innerHTML = `<div class="tbl-wrap" style="max-height:440px"><table class="tbl"><thead><tr><th>Front year</th><th>At T−${tNow ?? '—'}</th><th>At expiry</th><th>Life min</th><th>Life max</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    el.addEventListener('click', e => { const tr = e.target.closest('tr.click[data-y]'); if (tr) go({ y: tr.dataset.y, cmp: '' }); });
  },

  renderScanner(ctx, market, a, b, go) {
    const cells = spreadScanner(market, market.lastDate);
    const get = (i, j) => cells.find(x => x.front === i && x.back === j);
    let html = '<div class="tbl-wrap"><table class="heat"><thead><tr><th class="row">Front ↓ Back →</th>' + MONTHS.map(n => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
    for (let i = 1; i <= 12; i++) {
      html += `<tr><th class="row">${MONTHS[i - 1]}</th>`;
      for (let j = 1; j <= 12; j++) {
        if (i === j) { html += '<td class="sep"></td>'; continue; }
        const x = get(i, j);
        const title = x && x.value != null
          ? `${MONTHS[i - 1]} ${x.year} / ${MONTHS[j - 1]}: ${F.signedPrice(x.value, market.meta)} at T−${x.t}; ${x.pctile == null ? `only ${x.n} prior years` : `${F.ordinal(x.pctile)} percentile of ${x.n} prior years (mean ${F.signedPrice(x.mean, market.meta)})`}`
          : 'No current quote';
        html += `<td class="click ${i === a && j === b ? 'sel' : ''} ${x && x.value == null ? 'na' : ''}" data-a="${i}" data-b="${j}" style="background:${pctColor(x && x.pctile)}" title="${esc(title)}">${x && x.value != null ? F.num(x.value, 2) : '—'}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div><div class="scale"><span>narrow</span><span class="bar" style="background:linear-gradient(90deg,rgba(76,154,255,0.65),rgba(76,154,255,0.1),rgba(240,160,75,0.1),rgba(240,160,75,0.65))"></span><span>wide vs history</span></div>';
    const el = document.getElementById('sp-scan-grid');
    el.innerHTML = html;
    el.addEventListener('click', e => {
      const td = e.target.closest('td[data-a]');
      if (!td) return;
      const x = get(+td.dataset.a, +td.dataset.b);
      go({ a: td.dataset.a, b: td.dataset.b, y: x ? x.year : '', cmp: '' });
    });
  },

  renderChips(ctx, years, selected) {
    const el = document.getElementById('sp-chips');
    el.innerHTML = years.map(y => {
      const on = selected.includes(y);
      const color = COLORS.years[(selected.indexOf(y) + 1) % COLORS.years.length];
      return `<button type="button" class="chip ${on ? 'on' : ''}" data-y="${y}" style="${on ? `color:${color}` : ''}"><i></i>${y}</button>`;
    }).join('') + (selected.length ? '<button type="button" class="linkbtn" data-y="clear">clear</button>' : '');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-y]');
      if (!b) return;
      const y = b.dataset.y;
      const next = y === 'clear' ? [] : selected.includes(+y) ? selected.filter(x => x !== +y) : [...selected, +y];
      ctx.setParams({ cmp: next.join(',') });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  },
};
