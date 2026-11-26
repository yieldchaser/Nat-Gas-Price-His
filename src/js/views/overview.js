// Overview: where is the market now? Front-month level and momentum,
// volatility, seasonal context, curve shape, cross-market and cash basis.

import { addDays } from '../lib/calendar.js';
import { eurMwhToUsdMmbtu } from '../lib/market.js';
import { indexAtOrBefore } from '../lib/compute.js';
import { rollingVol, sma } from '../lib/numeric.js';
import { COLORS, Chart, syncCharts } from '../ui/charts.js';
import { bindControls, esc, kpi, panel, segmented } from '../ui/dom.js';
import * as F from '../ui/format.js';

const RANGES = [
  { value: '180', label: '6M' }, { value: '365', label: '1Y' }, { value: '730', label: '2Y' },
  { value: '1826', label: '5Y' }, { value: '3652', label: '10Y' }, { value: 'all', label: 'All' },
];

function kpis(s, live) {
  const hh = { ccy: '$', dp: 3 };
  const c1 = s.change1d;
  const tiles = [
    kpi({ label: `Front month · ${s.front.ticker} · ${live ? 'live' : `close ${F.date(s.asOf, true)}`}`, value: F.price(s.price, hh), tone: '',
      sub: c1 ? `<span class="${F.toneOf(c1.abs)}">${F.signedPrice(c1.abs, hh)} (${F.signedPct(c1.pct, 2)})</span> vs ${F.date(c1.prevDate, true)} close` : '',
      title: live ? 'Latest intraday price of the front-month contract (Yahoo Finance, NYMEX delayed ~10 min) versus the same contract\'s previous close.' : 'Latest close of the front-month contract versus the same contract\'s previous close.' }),
    kpi({ label: '1 month · roll-adjusted', value: `<span class="${F.toneOf(s.change1m)}">${F.signedPct(s.change1m)}</span>`,
      sub: `1 week <span class="${F.toneOf(s.change1w)}">${F.signedPct(s.change1w)}</span>`,
      title: 'Compounded same-contract daily returns of the front month over the window. Contract rolls are not counted as price moves.' }),
    kpi({ label: 'Year to date · roll-adjusted', value: `<span class="${F.toneOf(s.changeYtd)}">${F.signedPct(s.changeYtd)}</span>`,
      sub: `since the ${s.asOf.slice(0, 4) - 1} year-end close`,
      title: 'Compounded same-contract daily returns since the last close of the previous year. Differs from the change in the nearby price, which also includes roll gaps.' }),
    kpi({ label: 'Realised vol · 20D', value: F.pct(s.vol20), tone: s.volPctile5y > 80 ? 'warn' : '',
      sub: `${F.ordinal(s.volPctile5y)} pctile of 5Y`,
      title: 'Annualised standard deviation of the last 20 same-contract daily log returns (×√252), ranked against the daily 20D series over five years.' }),
    kpi({ label: 'Price percentile · 5Y', value: F.ordinal(s.pctile5y),
      sub: `1Y ${F.ordinal(s.pctile1y)} · range ${F.price(s.range1y && s.range1y.min, hh)}–${F.price(s.range1y && s.range1y.max, hh)}`,
      title: 'Mid-rank percentile of the current front-month close among all daily front-month closes in the window (nominal prices).' }),
    s.seasonal ? kpi({ label: 'vs 5Y same-season avg', value: `<span class="${F.toneOf(s.seasonal.devPct)}">${F.signedPct(s.seasonal.devPct)}</span>`,
      sub: `avg ${F.price(s.seasonal.mean, hh)} · ${F.price(s.seasonal.min, hh)}–${F.price(s.seasonal.max, hh)}`,
      title: `Front-month closes within ±7 calendar days of ${F.date(s.asOf, true)} in each of the previous ${s.seasonal.years} years.` }) : '',
    kpi({ label: `Prompt spread · ${s.curve.m1.label}/${s.curve.m2.label}`, value: F.signedPrice(s.curve.m1m2, hh),
      sub: s.curve.m1m2 == null ? '' : s.curve.m1m2 < 0 ? 'front below next month' : 'front above next month',
      title: 'Front contract minus second contract. Negative: the next month is priced higher.' }),
    kpi({ label: '12-month carry', value: F.signedPct(s.curve.carry12),
      sub: `${s.curve.m13.label} ${F.price(s.curve.m13.price, hh)} · strip ${F.price(s.curve.strip12, hh)}`,
      title: 'Same delivery month one year forward versus the front (M13 / M1 − 1). Compares like-for-like seasons, so it isolates carry from seasonality. Strip = average of the next 12 contracts.' }),
    kpi({ label: `Expiry · ${s.front.ticker}`, value: `${s.expiry.bdays} <small>sessions</small>`,
      tone: s.expiry.bdays <= 3 ? 'warn' : '',
      sub: `last trade ${F.date(s.expiry.date, true)} · then ${s.expiry.next}`,
      title: 'NYMEX business days remaining until the front contract\'s last trading day (3 business days before the delivery month).' }),
  ];
  if (s.ttf) {
    tiles.push(kpi({ label: `TTF front · ${s.ttf.ticker}`, value: s.ttf.usd != null ? `${F.price(s.ttf.usd, hh)}<small>/MMBtu</small>` : `€${F.num(s.ttf.eur, 2)}`,
      sub: `€${F.num(s.ttf.eur, 2)}/MWh${s.ttf.fx ? ` @ ${F.num(s.ttf.fx, 4)}` : ' · FX n/a'} · ${F.signedPrice(s.ttf.spread, hh)} vs HH`,
      title: 'Dutch TTF front month converted at the EURUSD close of the same date: EUR/MWh × EURUSD ÷ 3.412 MMBtu/MWh.' }));
  }
  if (s.spot) {
    tiles.push(kpi({ label: 'Cash basis · EIA spot − front', value: F.signedPrice(s.spot.basis, hh),
      sub: `${F.price(s.spot.p, hh)} vs ${s.spot.futuresTicker} ${F.price(s.spot.futures, hh)} · ${F.date(s.spot.date, true)}`,
      title: 'EIA Henry Hub daily spot minus the front-month futures close on the same date. EIA publishes weekly, so this lags the futures data.' }));
  }
  return `<div class="kpis">${tiles.join('')}</div>`;
}

export default {
  id: 'overview',
  title: 'Overview',

  render(root, ctx, params) {
    const { hh, ttf, fx, spot, signals: s } = ctx;
    const range = params.range || '365';
    root.innerHTML = `
      <div class="view-h"><div><h1>Market overview</h1><p>Henry Hub futures as of ${F.date(s.asOf)}${ctx.state && ctx.state.live ? ' (intraday, delayed ~10 min; refreshes automatically)' : ' close'}. Every change figure is measured within a single contract; rolls between delivery months are never counted as price moves.</p></div></div>
      ${kpis(s, ctx.state && ctx.state.live)}
      <div class="grid" style="margin-top:var(--gap)">
        ${panel({ id: 'ov-front', cls: 's8', title: 'Front-month price and realised volatility',
          sub: 'Nearby contract close (rolls at each last trading day) with its 200-session average; lower pane: 20- and 60-session realised volatility.',
          controls: segmented('range', RANGES, range),
          body: '<div id="ov-legend" class="legend"></div><div id="ov-price" class="chart"></div><div id="ov-vol" class="chart h160" style="margin-top:6px"></div>',
          note: '<b>Method.</b> Volatility = sample stdev of same-contract daily log returns × √252, shown only when ≥80% of the window has returns. Price is the actual nearby close (not back-adjusted).' })}
        ${panel({ id: 'ov-curve', cls: 's4', title: 'Forward curve',
          sub: 'Henry Hub strip today versus one week and one month earlier.',
          body: '<div id="ov-curve-legend" class="legend"></div><div id="ov-curve-chart" class="chart h280"></div><div class="sub-h">Next expiries</div><div id="ov-exp"></div>',
          note: '<a href="#/curve">Open curve analysis →</a>' })}
        ${ttf ? panel({ id: 'ov-ttf', cls: 's6', title: 'Henry Hub vs Dutch TTF (USD/MMBtu)',
          sub: 'Front months in a common unit; TTF converted at each date\'s EURUSD close.',
          body: '<div class="legend" id="ov-ttf-legend"></div><div id="ov-ttf-chart" class="chart h220"></div><div id="ov-ttf-spread" class="chart h160" style="margin-top:6px"></div>',
          note: `<b>Conversion.</b> EUR/MWh × EURUSD ÷ 3.412 MMBtu/MWh. ${fx.available ? `Daily EURUSD ${F.date(fx.first)} – ${F.date(fx.last)}: Yahoo close where available, else the Fed H.10 New York noon rate, else the ECB reference rate (sources agree to ~0.15% on a typical day). Dates without a rate are omitted, never converted at today's rate.` : 'EURUSD history unavailable — conversion disabled.'}` }) : ''}
        ${spot.dates.length ? panel({ id: 'ov-basis', cls: ttf ? 's6' : 's12', title: 'Cash vs futures',
          sub: 'EIA Henry Hub daily spot against the front-month futures close on the same day, and their difference.',
          body: '<div class="legend" id="ov-basis-legend"></div><div id="ov-basis-chart" class="chart h220"></div><div id="ov-basis-diff" class="chart h160" style="margin-top:6px"></div>',
          note: `<b>Source.</b> EIA RNGWHHD, published weekly (latest ${F.date(spot.dates[spot.dates.length - 1])}). Basis = spot − front futures; spot is next-day gas, futures are the next delivery month, so the basis also carries the prompt spread.` }) : ''}
      </div>`;

    this.renderFront(ctx, range);
    this.renderCurve(ctx);
    if (ttf) this.renderTtf(ctx);
    if (spot.dates.length) this.renderBasis(ctx);
    bindControls(root, { range: v => { ctx.setParams({ range: v }); this.applyRange(v); } });
  },

  renderFront(ctx, range) {
    const c = ctx.hh.continuous();
    const ma = sma(c.p, 200);
    const v20 = rollingVol(c.r, 20), v60 = rollingVol(c.r, 60);
    const px = new Chart(document.getElementById('ov-price'), { priceDp: 2 });
    const vol = new Chart(document.getElementById('ov-vol'), { priceDp: 1 });
    ctx.charts.add(px); ctx.charts.add(vol);
    const $ = v => F.price(v);
    px.line(c.dates.map((d, i) => ({ x: d, y: c.p[i] })), { label: 'Front month', color: COLORS.hh, width: 2, fmt: $ });
    px.line(c.dates.map((d, i) => ({ x: d, y: ma[i] })), { label: '200-session avg', color: '#8792a3', width: 1, style: 2, fmt: $, lastValue: false });
    px.extraTip = key => { const i = c.index.get(key); return i === undefined ? '' : `<div class="tip-row"><i></i><span>Contract</span><b>${c.tickers[i]}</b></div>`; };
    vol.line(c.dates.map((d, i) => ({ x: d, y: v20[i] })), { label: '20D vol', color: COLORS.warn, width: 1.5, fmt: v => F.pct(v) });
    vol.line(c.dates.map((d, i) => ({ x: d, y: v60[i] })), { label: '60D vol', color: COLORS.spot, width: 1.5, fmt: v => F.pct(v) });
    document.getElementById('ov-legend').innerHTML =
      `<span><i style="background:${COLORS.hh}"></i>Front month (USD/MMBtu)</span><span style="color:${COLORS.ref}"><i class="dash"></i><span class="dim">200-session average</span></span>` +
      `<span><i style="background:${COLORS.warn}"></i>20D realised vol (%)</span><span><i style="background:${COLORS.spot}"></i>60D realised vol (%)</span>`;
    syncCharts([px, vol]);
    this.front = { px, vol, c };
    this.applyRange(range);
  },

  applyRange(range) {
    const { px, c } = this.front;
    const last = c.dates[c.dates.length - 1];
    if (range === 'all') { px.fit(); return; }
    px.setRange(addDays(last, -Number(range)), last);
  },

  renderCurve(ctx) {
    const { hh, signals: s } = ctx;
    const asOf = s.asOf;
    const curves = [
      { label: F.date(asOf, true), date: asOf, color: COLORS.hh, width: 2 },
      { label: '1 week earlier', date: hh.dates[indexAtOrBefore(hh.dates, addDays(asOf, -7))], color: COLORS.ref, width: 1 },
      { label: '1 month earlier', date: hh.dates[indexAtOrBefore(hh.dates, addDays(asOf, -30))], color: COLORS.muted, width: 1, style: 2 },
    ];
    const base = hh.curveOn(asOf, 36);
    const ch = new Chart(document.getElementById('ov-curve-chart'), { axis: 'month', priceDp: 2, rightOffset: 1 });
    ctx.charts.add(ch);
    curves.forEach(cv => {
      const pts = hh.curveOn(cv.date, 40);
      const byDelivery = new Map(pts.map(p => [p.delivery, p.price]));
      ch.line(base.map(b => ({ x: b.delivery, y: byDelivery.get(b.delivery) ?? null })),
        { label: cv.label, color: cv.color, width: cv.width, style: cv.style || 0, fmt: v => F.price(v), lastValue: false });
    });
    ch.fit();
    document.getElementById('ov-curve-legend').innerHTML = curves.map(cv =>
      `<span><i style="background:${cv.color}"></i>${esc(cv.label)}${cv.date !== asOf ? ` <span class="muted">(${F.date(cv.date, true)})</span>` : ''}</span>`).join('');
    const rows = base.slice(0, 5).map(b => {
      const exp = hh.expiryOf(b.ticker);
      return `<tr class="click" data-c="${b.ticker}"><td>${b.ticker} <span class="muted">${b.label}</span></td><td class="n">${F.date(exp, true)}</td><td class="n">${F.price(b.price)}</td></tr>`;
    }).join('');
    const exp = document.getElementById('ov-exp');
    exp.innerHTML = `<table class="tbl"><thead><tr><th>Contract</th><th>Last trade</th><th>Last</th></tr></thead><tbody>${rows}</tbody></table>`;
    exp.addEventListener('click', e => { const tr = e.target.closest('tr[data-c]'); if (tr) ctx.navigate('contracts', { c: tr.dataset.c }); });
  },

  renderTtf(ctx) {
    const { hh, ttf, fx } = ctx;
    const tc = ttf.continuous(), hc = hh.continuous();
    const rows = [];
    tc.dates.forEach((d, i) => {
      const rate = fx.on(d);
      const usd = eurMwhToUsdMmbtu(tc.p[i], rate);
      const j = hc.index.get(d);
      if (usd == null || j === undefined) return;
      rows.push({ d, ttf: usd, hh: hc.p[j], spread: usd - hc.p[j], tt: tc.tickers[i], ht: hc.tickers[j] });
    });
    const legend = document.getElementById('ov-ttf-legend');
    if (rows.length < 20) {
      document.getElementById('ov-ttf-chart').innerHTML = '<div class="empty">Not enough overlapping TTF, Henry Hub and EURUSD history to plot.</div>';
      document.getElementById('ov-ttf-spread').remove();
      return;
    }
    const a = new Chart(document.getElementById('ov-ttf-chart'), { priceDp: 2 });
    const b = new Chart(document.getElementById('ov-ttf-spread'), { priceDp: 2 });
    ctx.charts.add(a); ctx.charts.add(b);
    const $ = v => F.price(v, { ccy: '$', dp: 2 });
    a.line(rows.map(r => ({ x: r.d, y: r.ttf })), { label: 'TTF front', color: COLORS.ttf, fmt: $ });
    a.line(rows.map(r => ({ x: r.d, y: r.hh })), { label: 'HH front', color: COLORS.hh, fmt: $ });
    b.area(rows.map(r => ({ x: r.d, y: r.spread })), { label: 'TTF − HH', color: 'rgb(62,199,194)', fmt: $ });
    a.extraTip = key => { const r = rows.find(x => x.d === key); return r ? `<div class="tip-row"><i></i><span>Contracts</span><b>${r.tt} · ${r.ht}</b></div>` : ''; };
    syncCharts([a, b]);
    a.fit();
    legend.innerHTML = `<span><i style="background:${COLORS.ttf}"></i>TTF front (USD/MMBtu)</span><span><i style="background:${COLORS.hh}"></i>Henry Hub front</span><span><i style="background:${COLORS.spread}"></i>TTF premium over HH</span>`;
  },

  renderBasis(ctx) {
    const { hh, spot } = ctx;
    const last = spot.dates[spot.dates.length - 1];
    const from = addDays(last, -3 * 365);
    const rows = [];
    for (let i = indexAtOrBefore(spot.dates, from) + 1; i < spot.dates.length; i++) {
      const d = spot.dates[i];
      const fut = hh.nearby(d);
      const fp = fut ? fut.priceOn(d) : null;
      if (fp == null) continue;
      rows.push({ d, spot: spot.p[i], fut: fp, basis: spot.p[i] - fp, t: fut.ticker });
    }
    const a = new Chart(document.getElementById('ov-basis-chart'), { priceDp: 2 });
    const b = new Chart(document.getElementById('ov-basis-diff'), { priceDp: 2 });
    ctx.charts.add(a); ctx.charts.add(b);
    const $ = v => F.price(v);
    a.line(rows.map(r => ({ x: r.d, y: r.spot })), { label: 'EIA spot', color: COLORS.spot, width: 1.5, fmt: $ });
    a.line(rows.map(r => ({ x: r.d, y: r.fut })), { label: 'Front futures', color: COLORS.hh, width: 1.5, fmt: $ });
    b.histogram(rows.map(r => ({ x: r.d, y: r.basis, color: r.basis >= 0 ? 'rgba(63,182,139,0.7)' : 'rgba(239,95,107,0.7)' })), { label: 'Basis (spot − futures)', color: COLORS.spread, fmt: v => F.signedPrice(v) });
    a.extraTip = key => { const r = rows.find(x => x.d === key); return r ? `<div class="tip-row"><i></i><span>Futures contract</span><b>${r.t}</b></div>` : ''; };
    syncCharts([a, b]);
    a.setRange(addDays(last, -365), last);
    document.getElementById('ov-basis-legend').innerHTML = `<span><i style="background:${COLORS.spot}"></i>EIA spot</span><span><i style="background:${COLORS.hh}"></i>Front futures</span><span><i class="box" style="background:rgba(63,182,139,0.7)"></i><i class="box" style="background:rgba(239,95,107,0.7);margin-left:-3px"></i>Basis</span>`;
  },
};
