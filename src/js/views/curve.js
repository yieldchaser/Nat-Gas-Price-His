// Curve: forward strip on the latest date against a comparison date, how each
// contract moved, seasonal strips, and the history of the prompt premium.

import { addDays } from '../lib/calendar.js';
import { eurMwhToUsdMmbtu } from '../lib/market.js';
import { curveStrips, indexAtOrBefore, promptPremiumHistory } from '../lib/analytics.js';
import { COLORS, Chart, syncCharts } from '../ui/charts.js';
import { bindControls, esc, panel, segmented } from '../ui/dom.js';
import * as F from '../ui/format.js';

const CMP = [
  { value: '7', label: '1W' }, { value: '30', label: '1M' }, { value: '91', label: '3M' },
  { value: '182', label: '6M' }, { value: '365', label: '1Y' },
];
const HORIZON = [{ value: '24', label: '24M' }, { value: '36', label: '36M' }, { value: '72', label: '72M' }];

export default {
  id: 'curve',
  title: 'Curve',

  render(root, ctx, params) {
    const key = params.m === 'TTF' && ctx.ttf ? 'TTF' : 'HH';
    const market = key === 'TTF' ? ctx.ttf : ctx.hh;
    const usd = key === 'TTF' && params.u === 'usd' && ctx.fx.available;
    const unitMeta = usd ? { ccy: '$', dp: 2, unit: 'USD/MMBtu' } : market.meta;
    const horizon = HORIZON.some(h => h.value === params.h) ? Number(params.h) : (key === 'TTF' ? 36 : 36);
    const asOf = market.lastDate;
    let cmpDate = params.d && /^\d{4}-\d{2}-\d{2}$/.test(params.d) ? params.d : null;
    const cmpPreset = cmpDate ? '' : (CMP.some(c => c.value === params.cmp) ? params.cmp : '30');
    if (!cmpDate) cmpDate = addDays(asOf, -Number(cmpPreset));
    const ci = indexAtOrBefore(market.dates, cmpDate);
    cmpDate = ci >= 0 ? market.dates[ci] : market.firstDate;

    const conv = (price, date) => (usd ? eurMwhToUsdMmbtu(price, ctx.fx.on(date)) : price);
    const now = market.curveOn(asOf, horizon).map(s => ({ ...s, price: s.price == null ? null : conv(s.price, s.priceDate) }));
    const then = new Map(market.curveOn(cmpDate, horizon + 14).map(s => [s.ticker, s.price == null ? null : conv(s.price, s.priceDate)]));
    const quoted = now.filter(s => s.price != null);
    const missing = now.filter(s => s.price == null);

    const controls = [
      ctx.ttf ? segmented('market', [{ value: 'HH', label: 'Henry Hub' }, { value: 'TTF', label: 'Dutch TTF' }], key) : '',
      key === 'TTF' ? segmented('units', [{ value: 'eur', label: 'EUR/MWh' }, { value: 'usd', label: 'USD/MMBtu', disabled: !ctx.fx.available }], usd ? 'usd' : 'eur') : '',
      segmented('horizon', HORIZON, String(horizon), { label: 'Horizon' }),
      segmented('cmp', CMP, cmpPreset, { label: 'Compare' }),
      `<label class="ctl"><input type="date" id="cv-date" value="${cmpDate}" min="${market.firstDate}" max="${asOf}" aria-label="Comparison date"></label>`,
    ].join('');

    root.innerHTML = `
      <div class="view-h"><div><h1>${esc(market.meta.name)} forward curve</h1>
      <p>Closes on ${F.date(asOf)} against ${F.date(cmpDate)}. ${quoted.length} of ${now.length} months quoted${missing.length ? ` — unquoted months are left as gaps, not interpolated` : ''}.</p></div>
      <div class="panel-c">${controls}</div></div>
      <div class="grid">
        ${panel({ id: 'cv-main', cls: 's8', title: 'Curve and change by contract', sub: `${esc(unitMeta.unit)}. Lower pane: change in each contract since the comparison date (same contract, not same tenor).`,
          body: '<div class="legend" id="cv-legend"></div><div id="cv-chart" class="chart h420"></div><div id="cv-chg" class="chart h160" style="margin-top:6px"></div>',
          note: usd ? '<b>Units.</b> Each curve converted at the EURUSD close of its own date.' : '' })}
        ${panel({ id: 'cv-strips', cls: 's4', title: 'Strips', sub: 'Averages of complete delivery groups: calendar year, summer (Apr–Oct) and winter (Nov–Mar).', body: '' })}
        ${panel({ id: 'cv-table', cls: 's12', title: 'Contracts', sub: 'Month-on-month spread is this contract minus the previous delivery month.', body: '' })}
        ${panel({ id: 'cv-prem', cls: 's12', title: 'Prompt premium history', sub: 'Front month minus the average of the next 12 contracts on each date. Positive values mean the prompt trades above the 12-month strip (near-term tightness); negative values mean the market pays to defer.',
          body: '<div id="cv-prem-chart" class="chart h280"></div>', note: `<b>Method.</b> Uses only dates where all 12 contracts have a close. ${key === 'TTF' ? 'TTF history is limited to contracts in the archive (from 2016).' : ''}` })}
      </div>`;

    this.renderCurve(ctx, market, now, then, unitMeta, asOf, cmpDate);
    this.renderStrips(now, then, unitMeta, cmpDate);
    this.renderTable(ctx, market, key, now, then, unitMeta, asOf);
    this.renderPremium(ctx, market);

    const go = p => ctx.navigate('curve', { m: key, u: usd ? 'usd' : '', h: horizon, cmp: cmpPreset, d: params.d, ...p });
    bindControls(root, {
      market: v => ctx.navigate('curve', { m: v, h: horizon }),
      units: v => go({ u: v === 'usd' ? 'usd' : '' }),
      horizon: v => go({ h: v }),
      cmp: v => go({ cmp: v, d: '' }),
    });
    document.getElementById('cv-date').addEventListener('change', e => { if (e.target.value) go({ d: e.target.value, cmp: '' }); });
  },

  renderCurve(ctx, market, now, then, m, asOf, cmpDate) {
    const a = ctx.charts.add(new Chart(document.getElementById('cv-chart'), { axis: 'month', priceDp: m.dp, rightOffset: 1 }));
    const b = ctx.charts.add(new Chart(document.getElementById('cv-chg'), { axis: 'month', priceDp: m.dp, rightOffset: 1 }));
    const fmt = v => F.price(v, m);
    const color = market.key === 'TTF' ? COLORS.ttf : COLORS.hh;
    a.line(now.map(s => ({ x: s.delivery, y: then.get(s.ticker) ?? null })), { label: F.date(cmpDate), color: COLORS.ref, width: 1.5, style: 2, fmt, lastValue: false });
    const main = a.line(now.map(s => ({ x: s.delivery, y: s.price })), { label: F.date(asOf), color, width: 2, fmt });
    main.api.applyOptions({ pointMarkersVisible: true, pointMarkersRadius: 2 });
    a.extraTip = key => {
      const s = now.find(x => x.delivery === key);
      if (!s) return '';
      const p0 = then.get(s.ticker);
      const ch = s.price != null && p0 != null ? s.price - p0 : null;
      return `<div class="tip-row"><i></i><span>${s.ticker}${s.stale ? ' (stale)' : ''}</span><b class="${F.toneOf(ch)}">${F.signedPrice(ch, m)}</b></div>`;
    };
    b.histogram(now.map(s => {
      const p0 = then.get(s.ticker);
      const ch = s.price != null && p0 != null ? s.price - p0 : null;
      return { x: s.delivery, y: ch, color: ch >= 0 ? 'rgba(63,182,139,0.75)' : 'rgba(239,95,107,0.75)' };
    }), { label: 'Change', fmt: v => F.signedPrice(v, m), color: COLORS.spread });
    syncCharts([a, b]);
    a.fit();
    document.getElementById('cv-legend').innerHTML = `<span><i style="background:${color}"></i>${F.date(asOf)}</span><span style="color:${COLORS.ref}"><i class="dash"></i><span class="dim">${F.date(cmpDate)}</span></span>`;
  },

  renderStrips(now, then, m, cmpDate) {
    const thenCurve = now.map(s => ({ ...s, price: then.get(s.ticker) ?? null }));
    const a = curveStrips(now), b = new Map(curveStrips(thenCurve).map(s => [s.label, s.value]));
    const row = s => {
      const p0 = b.get(s.label);
      const ch = p0 != null ? s.value - p0 : null;
      return `<tr><td>${s.label}</td><td class="n">${F.price(s.value, m)}</td><td class="n ${F.toneOf(ch)}">${F.signedPrice(ch, m)}</td></tr>`;
    };
    const group = kind => a.filter(s => s.kind === kind);
    const winters = group('Winter'), summers = group('Summer');
    const ws = winters.map(w => {
      const sNext = summers.find(su => su.year === w.year + 1);
      return sNext ? { label: `${w.label.replace('Win ', 'W')} − S${String(w.year + 1).slice(2)}`, value: w.value - sNext.value } : null;
    }).filter(Boolean);
    document.getElementById('cv-strips-body').innerHTML = !a.length ? '<div class="empty">No complete strips in the quoted horizon.</div>' : `
      <table class="tbl"><thead><tr><th>Strip</th><th>Price</th><th>Δ since ${F.date(cmpDate, true)}</th></tr></thead><tbody>
      ${['Cal', 'Winter', 'Summer'].map(k => group(k).map(row).join('')).join('')}</tbody></table>
      ${ws.length ? `<div class="sub-h">Winter premium over following summer</div><table class="tbl"><tbody>${ws.map(x => `<tr><td>${x.label}</td><td class="n">${F.signedPrice(x.value, m)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  },

  renderTable(ctx, market, key, now, then, m, asOf) {
    const rows = now.map((s, i) => {
      const p0 = then.get(s.ticker);
      const ch = s.price != null && p0 != null ? s.price - p0 : null;
      const chp = ch != null && p0 ? (ch / p0) * 100 : null;
      const prev = i > 0 ? now[i - 1].price : null;
      const mm = s.price != null && prev != null ? s.price - prev : null;
      return `<tr class="click" data-c="${s.ticker}"><td>${s.ticker} <span class="muted">${s.label}</span></td>
        <td class="n">${F.date(market.expiryOf(s.ticker), true)}</td>
        <td class="n">${F.price(s.price, m)}${s.stale ? ` <span class="tag warn" title="Last close ${s.priceDate}">${F.date(s.priceDate, true)}</span>` : ''}</td>
        <td class="n ${F.toneOf(ch)}">${F.signedPrice(ch, m)}</td><td class="n ${F.toneOf(chp)}">${F.signedPct(chp)}</td>
        <td class="n">${F.signedPrice(mm, m)}</td></tr>`;
    }).join('');
    const el = document.getElementById('cv-table-body');
    el.innerHTML = `<div class="tbl-wrap" style="max-height:440px"><table class="tbl"><thead><tr><th>Contract</th><th>Last trade</th><th>Close ${F.date(asOf, true)}</th><th>Change</th><th>Change %</th><th>vs previous month</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    el.addEventListener('click', e => { const tr = e.target.closest('tr[data-c]'); if (tr) ctx.navigate('contracts', { m: key, c: tr.dataset.c }); });
  },

  renderPremium(ctx, market) {
    const hist = promptPremiumHistory(market, '1990-01-01');
    const el = document.getElementById('cv-prem-chart');
    if (hist.length < 20) { el.innerHTML = '<div class="empty">Not enough history with 12 consecutive quoted contracts.</div>'; return; }
    const ch = ctx.charts.add(new Chart(el, { priceDp: market.meta.dp }));
    const fmt = v => F.signedPrice(v, market.meta);
    const s = ch.area(hist.map(h => ({ x: h.date, y: h.premium })), { label: 'M1 − 12M strip', color: 'rgb(62,199,194)', fmt });
    ch.priceLine(s, 0, { color: COLORS.ref, style: 0 });
    ch.extraTip = k => { const h = hist.find(x => x.date === k); return h ? `<div class="tip-row"><i></i><span>M1 / strip</span><b>${F.price(h.m1, market.meta)} / ${F.price(h.strip, market.meta)}</b></div>` : ''; };
    const last = hist[hist.length - 1].date;
    ch.setRange(addDays(last, -10 * 365), last);
  },
};
