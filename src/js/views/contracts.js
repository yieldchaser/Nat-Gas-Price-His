// Contracts: one contract's life against the same delivery month in prior
// years, aligned by weekdays to expiry (or mapped onto calendar dates).

import { MONTHS, addBusinessDays, bdBetween, makeTicker, parseTicker } from '../lib/calendar.js';
import { contractContext, lifecycleBand } from '../lib/analytics.js';
import { COLORS, Chart, timeToT } from '../ui/charts.js';
import { bindControls, esc, panel, segmented, select } from '../ui/dom.js';
import * as F from '../ui/format.js';

const BANDS = [{ value: '5', label: '5Y' }, { value: '10', label: '10Y' }, { value: 'all', label: 'All' }];

function resolve(ctx, params) {
  const key = params.m === 'TTF' && ctx.ttf ? 'TTF' : 'HH';
  const market = key === 'TTF' ? ctx.ttf : ctx.hh;
  let ticker = (params.c || '').toUpperCase();
  const info = parseTicker(ticker);
  if (!info || info.prefix !== market.prefix || !market.get(ticker)) ticker = market.nearbyTicker(market.lastDate);
  return { key, market, ticker };
}

export default {
  id: 'contracts',
  title: 'Contracts',

  render(root, ctx, params) {
    const { key, market, ticker } = resolve(ctx, params);
    const c = market.get(ticker);
    const m = market.meta;
    const axis = params.axis === 'date' ? 'date' : 't';
    const bandSel = BANDS.some(b => b.value === params.band) ? params.band : '5';
    const bandYears = bandSel === 'all' ? Infinity : Number(bandSel);
    const years = market.yearsFor(c.month).slice().reverse();
    const overlayYears = (params.cmp || '').split(',').map(Number).filter(y => years.includes(y) && y !== c.year);

    const status = market.status(c);
    const statusTag = status === 'active' ? '<span class="tag live">active</span>'
      : status === 'settled' ? '<span class="tag">settled</span>' : '<span class="tag warn">history incomplete</span>';

    const controls = [
      ctx.ttf ? segmented('market', [{ value: 'HH', label: 'Henry Hub' }, { value: 'TTF', label: 'Dutch TTF' }], key) : '',
      select('month', MONTHS.map((n, i) => ({ value: i + 1, label: n })), c.month, { label: 'Month' }),
      select('year', years.map(y => ({ value: y, label: y })), c.year, { label: 'Year' }),
      `<label class="ctl"><span class="ctl-label">Ticker</span><input type="text" id="ct-jump" size="7" placeholder="${esc(ticker)}" aria-label="Jump to ticker"></label>`,
      segmented('axis', [{ value: 't', label: 'Weekdays to expiry' }, { value: 'date', label: 'Calendar date' }], axis),
      segmented('band', BANDS, bandSel, { label: 'History' }),
    ].join('');

    root.innerHTML = `
      <div class="view-h"><div><h1>${esc(c.label)} · ${esc(m.name)} ${statusTag}</h1>
      <p>${esc(ticker)} — last trading day ${F.date(c.expiry)}. Prior ${esc(MONTHS[c.month - 1])} contracts are aligned by weekdays remaining to their own expiry, so the same point in each contract's life is compared.</p></div>
      <div class="panel-c">${controls}</div></div>
      <div class="split">
        ${panel({ id: 'ct-main', title: 'Price through the contract\'s life', sub: `${esc(m.unit)}. Shaded: range and interquartile band of prior ${bandYears === Infinity ? 'all' : bandYears} years' ${esc(MONTHS[c.month - 1])} contracts at the same lifecycle point; dashed: their median.`,
          body: '<div class="legend" id="ct-legend"></div><div id="ct-chart" class="chart h420"></div><div class="sub-h">Overlay prior years</div><div class="chips" id="ct-chips"></div>',
          note: '<b>Reading the band.</b> It summarises where prior contracts traded at each point of their lives — it is a historical range, not a forecast. Only contracts that traded through expiry are included.' })}
        <div style="display:flex;flex-direction:column;gap:var(--gap)">
          ${panel({ id: 'ct-stats', title: 'Snapshot', body: '' })}
          ${panel({ id: 'ct-next', title: 'From this point to expiry', sub: 'Prior same-month contracts, from the same lifecycle point to their final settlement.', body: '' })}
        </div>
      </div>
      <div style="margin-top:var(--gap)">
        ${panel({ id: 'ct-hist', title: `${esc(MONTHS[c.month - 1])} contracts by year`, sub: 'Price at the same lifecycle point, final settlement and the move in between. Click a row to open that contract.', body: '' })}
      </div>`;

    const ctxStats = contractContext(market, ticker);
    const band = lifecycleBand(market, c.month, c.year, bandYears);
    this.renderChart(ctx, market, c, band, axis, overlayYears);
    this.renderStats(market, c, ctxStats, band);
    this.renderTable(ctx, market, c, ctxStats, key);
    this.renderChips(ctx, years.filter(y => y !== c.year && y < c.year).slice(0, 12), overlayYears);

    const go = p => ctx.navigate('contracts', { m: key, c: ticker, axis, band: bandSel, ...p });
    bindControls(root, {
      market: v => ctx.navigate('contracts', { m: v, axis, band: bandSel }),
      month: v => {
        // Switch to the next contract of that month that is still trading (or the latest one).
        const mo = Number(v);
        const list = market.sameMonth(mo).map(x => x.contract);
        const live = list.filter(x => x.expiry >= market.lastDate).sort((p, q) => (p.expiry < q.expiry ? -1 : 1));
        const target = live[0] || list[list.length - 1];
        go({ c: target.ticker, cmp: '' });
      },
      year: v => go({ c: makeTicker(market.prefix, Number(v), c.month), cmp: '' }),
      axis: v => go({ axis: v, cmp: overlayYears.join(',') }),
      band: v => go({ band: v, cmp: overlayYears.join(',') }),
    });
    const jump = document.getElementById('ct-jump');
    jump.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const t = jump.value.trim().toUpperCase().replace(/^TTF/, 'TG');
      const info = parseTicker(t);
      if (!info) { jump.value = ''; jump.placeholder = 'e.g. NGZ26'; return; }
      ctx.navigate('contracts', { m: info.prefix === 'TG' ? 'TTF' : 'HH', c: t, axis, band: bandSel });
    });
  },

  renderChart(ctx, market, c, band, axis, overlayYears) {
    const m = market.meta;
    const chart = ctx.charts.add(new Chart(document.getElementById('ct-chart'), { axis, priceDp: m.dp - 1 }));
    const fmt = v => F.price(v, m);
    const lc = market.lifecycle(c.ticker);
    const xOf = t => (axis === 't' ? t : addBusinessDays(c.expiry, -t, 'WD'));
    // T range shown: from the contract's first observation (or band start) to expiry.
    const tMax = Math.max(lc.length ? lc[0].t : 0, 0);
    const rows = band.rows.filter(r => r.t <= Math.max(tMax, 260));
    if (rows.length) {
      chart.band(rows.map(r => ({ x: xOf(r.t), lo: r.lo, hi: r.hi })), { label: 'Prior-year range', fill: 'rgba(148,163,184,0.10)', fmt: v => `${fmt(v[0])} – ${fmt(v[1])}` });
      chart.band(rows.map(r => ({ x: xOf(r.t), lo: r.p25, hi: r.p75 })), { label: 'Interquartile', fill: 'rgba(148,163,184,0.17)', fmt: v => `${fmt(v[0])} – ${fmt(v[1])}` });
      chart.line(rows.map(r => ({ x: xOf(r.t), y: r.median })), { label: 'Prior-year median', color: COLORS.median, width: 1, style: 2, fmt, lastValue: false });
    }
    overlayYears.forEach((y, i) => {
      const t = makeTicker(market.prefix, y, c.month);
      const pts = market.lifecycle(t).filter(p => p.t <= Math.max(tMax, 0) || axis === 't');
      chart.line(pts.map(p => ({ x: xOf(p.t), y: p.p })), { label: t, color: COLORS.years[(i + 1) % COLORS.years.length], width: 1, fmt, lastValue: false });
    });
    chart.line(lc.map(p => ({ x: xOf(p.t), y: p.p })), { label: c.ticker, color: market.key === 'TTF' ? COLORS.ttf : COLORS.white, width: 2, fmt });
    if (axis === 't') {
      const byT = new Map(lc.map(p => [p.t, p]));
      chart.extraTip = key => {
        const d = byT.get(timeToT(Number(key)));
        return d ? `<div class="tip-row"><i></i><span>${c.ticker} date</span><b>${F.date(d.date)}</b></div>` : '';
      };
    }
    chart.setRange(xOf(tMax), xOf(0));
    document.getElementById('ct-legend').innerHTML = `
      <span><i style="background:${market.key === 'TTF' ? COLORS.ttf : COLORS.white}"></i>${esc(c.ticker)}</span>
      <span><i class="box" style="background:rgba(148,163,184,0.22)"></i>Prior-year interquartile · range (${band.years.length} contracts${band.years.length ? `, ${Math.min(...band.years)}–${Math.max(...band.years)}` : ''})</span>
      <span style="color:${COLORS.median}"><i class="dash"></i><span class="dim">Median</span></span>`;
  },

  renderStats(market, c, s, band) {
    const m = market.meta;
    const p = v => F.price(v, m);
    const st = market.status(c);
    const nb = bdBetween(s.now.date, c.expiry, market.prefix);
    const yearsTxt = band.years.length ? `${s.rows.length} prior years` : 'no prior years';
    document.getElementById('ct-stats-body').innerHTML = `
      <dl class="stat-list">
        <dt>${st === 'settled' ? 'Final settlement' : 'Last close'}</dt><dd>${p(s.now.p)} <span class="muted">${F.date(s.now.date, true)}</span></dd>
        <dt>Sessions to expiry</dt><dd>${st === 'active' ? nb : '—'}</dd>
        <dt>Change since first trade</dt><dd class="${F.toneOf(s.fromOpenPct)}">${F.signedPct(s.fromOpenPct)}</dd>
        <dt>Life high</dt><dd>${p(s.high)}</dd>
        <dt>Life low</dt><dd>${p(s.low)}</dd>
        <dt>Percentile vs ${yearsTxt}</dt><dd>${F.ordinal(s.percentile)}</dd>
        <dt>vs prior-year mean at T−${s.now.t}</dt><dd class="${F.toneOf(s.vsMeanPct)}">${F.signedPct(s.vsMeanPct)}</dd>
        <dt>z-score (same point, all years)</dt><dd>${s.z == null ? '—' : F.signed(s.z, 2)}</dd>
      </dl>`;
    const o = s.outcomes;
    document.getElementById('ct-next-body').innerHTML = st !== 'active'
      ? `<div class="empty">${st === 'settled' ? `Settled at ${p(c.last)} on ${F.date(c.expiry)}. The table below compares it with prior ${MONTHS[c.month - 1]} settlements.` : 'History for this contract stops before its last trading day.'}</div>`
      : !o ? '<div class="empty">No settled prior contracts at this lifecycle point.</div>' : `
      <dl class="stat-list">
        <dt>Contracts</dt><dd>${o.n}</dd>
        <dt>Median move to expiry</dt><dd class="${F.toneOf(o.median)}">${F.signedPct(o.median)}</dd>
        <dt>10th – 90th percentile</dt><dd>${F.signedPct(o.p10)} to ${F.signedPct(o.p90)}</dd>
        <dt>Settled higher</dt><dd>${o.up} of ${o.n}</dd>
      </dl>
      <p class="muted" style="margin-top:8px;font-size:11.5px">Distribution of realised outcomes, not a forecast: sample sizes are small and regimes differ.</p>`;
  },

  renderTable(ctx, market, c, s, key) {
    const m = market.meta;
    const p = v => F.price(v, m);
    const showT = s.now.t > 0;   // at T−0 the "same point" is the settlement itself
    const curRow = `<tr class="hl"><td>${c.year} <span class="muted">${c.ticker}</span></td>${showT ? `<td class="n">${p(s.now.p)}</td>` : ''}<td class="n">${market.status(c) === 'settled' ? p(c.last) : '<span class="muted">—</span>'}</td>${showT ? '<td class="n">—</td>' : ''}<td class="n">${p(s.high)}</td><td class="n">${p(s.low)}</td></tr>`;
    const body = s.rows.map(r => `<tr class="click" data-c="${r.ticker}"><td>${r.year} <span class="muted">${r.ticker}</span></td>
      ${showT ? `<td class="n">${p(r.atT)} <span class="muted">${r.atDate ? F.date(r.atDate, true) : ''}</span></td>` : ''}<td class="n">${p(r.settle)}</td>
      ${showT ? `<td class="n ${F.toneOf(r.toExpiryPct)}">${F.signedPct(r.toExpiryPct)}</td>` : ''}<td class="n">${p(r.high)}</td><td class="n">${p(r.low)}</td></tr>`).join('');
    const el = document.getElementById('ct-hist-body');
    el.innerHTML = `<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>Delivery year</th>${showT ? `<th>At T−${s.now.t}</th>` : ''}<th>Final settlement</th>${showT ? '<th>Move to expiry</th>' : ''}<th>Life high</th><th>Life low</th></tr></thead><tbody>${curRow}${body}</tbody></table></div>`;
    el.addEventListener('click', e => { const tr = e.target.closest('tr[data-c]'); if (tr) ctx.navigate('contracts', { m: key, c: tr.dataset.c }); });
  },

  renderChips(ctx, years, selected) {
    const el = document.getElementById('ct-chips');
    el.innerHTML = years.map((y, i) => {
      const on = selected.includes(y);
      const color = COLORS.years[(selected.indexOf(y) + 1) % COLORS.years.length];
      return `<button type="button" class="chip ${on ? 'on' : ''}" data-y="${y}" style="${on ? `color:${color}` : ''}"><i></i>${y}</button>`;
    }).join('') + (selected.length ? '<button type="button" class="linkbtn" data-y="clear">clear</button>' : '');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-y]');
      if (!b) return;
      const y = b.dataset.y;
      const next = y === 'clear' ? [] : selected.includes(Number(y)) ? selected.filter(x => x !== Number(y)) : [...selected, Number(y)];
      ctx.setParams({ cmp: next.join(',') });
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  },
};
