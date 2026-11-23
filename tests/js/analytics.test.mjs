import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Market, FxSeries, decodeSpot } from '../../src/js/lib/market.js';
import * as A from '../../src/js/lib/analytics.js';
import { bdBetween } from '../../src/js/lib/calendar.js';

const root = new URL('../../', import.meta.url);
const load = p => JSON.parse(readFileSync(new URL(p, root)));
const feed = load('data/live_quotes.json');
const TODAY = '2026-11-20';
const hh = new Market('HH', load('data/hh.json'), feed.quotes, TODAY);
const ttf = new Market('TTF', load('data/ttf.json'), feed.quotes, TODAY);
const fx = new FxSeries(load('data/fx_eurusd.json'));
const spot = decodeSpot(load('data/spot.json'));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('structure legs roll later months into the next year', () => {
  assert.deepEqual(A.structureLegs('NG', 'spread', [11, 1], 2026).map(l => l.ticker), ['NGX26', 'NGF27']);
  assert.deepEqual(A.structureLegs('NG', 'fly', [10, 11, 1], 2026).map(l => [l.ticker, l.w]),
    [['NGV26', 1], ['NGX26', -2], ['NGF27', 1]]);
});

test('roll-adjusted change equals the compounded same-contract returns', () => {
  const c = hh.continuous();
  const n = c.dates.length - 1;
  const from = c.dates[n - 5];
  const expected = (Math.exp(c.r.slice(n - 4).reduce((s, x) => s + x, 0)) - 1) * 100;
  close(A.rollAdjustedChange(c, from), expected, 1e-9);
});

test('market signals are finite and internally consistent', () => {
  const s = A.marketSignals(hh, { ttf, fx, spot, today: TODAY });
  assert.equal(s.front.ticker, hh.nearbyTicker(s.asOf));
  close(s.change1d.pct, (s.price / s.front.priceOn(s.change1d.prevDate) - 1) * 100, 1e-9);
  for (const k of ['vol20', 'pctile5y', 'pctile1y', 'change1w', 'change1m', 'changeYtd']) assert.ok(Number.isFinite(s[k]), k);
  assert.ok(s.vol20 > 5 && s.vol20 < 250);
  assert.equal(s.expiry.date, s.front.expiry);
  assert.equal(s.expiry.bdays, bdBetween(s.asOf, s.front.expiry, 'NG'));   // sessions left from the data's last date
  // HH-TTF spread uses EUR/MWh × EURUSD ÷ 3.412 (≈ $8–20 for TTF €25–60)
  assert.ok(s.ttf.usd > 5 && s.ttf.usd < 40, String(s.ttf.usd));
  close(s.ttf.spread, s.ttf.usd - s.price, 1e-12);
  assert.ok(Number.isFinite(s.spot.basis));
});

test('same-season sampling draws from each prior year', () => {
  const dates = ['2024-11-15', '2024-11-20', '2025-11-21', '2025-12-30', '2026-11-20'];
  const vals = [1, 2, 3, 4, 5];
  const r = A.sameSeasonValues(dates, vals, '2026-11-20', 2, 7);
  assert.deepEqual(r.values.sort(), [1, 2, 3]);
  assert.equal(r.years, 2);
});

test('lifecycle band only uses settled prior contracts and covers T=0', () => {
  const b = A.lifecycleBand(hh, 12, 2026, 5);
  assert.deepEqual(b.years.sort(), [2021, 2022, 2023, 2024, 2025]);
  const t0 = b.rows.find(r => r.t === 0);
  assert.equal(t0.n, 5);
  assert.ok(t0.lo <= t0.p25 && t0.p25 <= t0.median && t0.median <= t0.p75 && t0.p75 <= t0.hi);
});

test('contract context compares against prior years at the same T', () => {
  const ctx = A.contractContext(hh, 'NGZ26');
  assert.equal(ctx.now.t, bdBetween(hh.get('NGZ26').lastDate, '2026-11-25', 'WD'));
  assert.ok(ctx.rows.length > 20);
  assert.ok(ctx.percentile >= 0 && ctx.percentile <= 100);
  const r = ctx.rows.find(x => x.year === 2025);
  close(r.toExpiryPct, (r.settle / r.atT - 1) * 100, 1e-12);
});

test('structure analysis: final values only for settled pairs', () => {
  const a = A.structureAnalysis(hh, 'spread', [1, 2], 2027, 5);
  const row26 = a.table.find(r => r.year === 2026);
  close(row26.final, hh.get('NGF26').last - hh.get('NGG26').priceOn(hh.get('NGF26').lastDate), 1e-12);
  assert.equal(a.table.find(r => r.year === 2027).final, null);
  assert.ok(a.stats && Number.isFinite(a.stats.pctileAll));
});

test('settlement matrix never shows unsettled contracts as settled', () => {
  const m = A.settlementMatrix(hh);
  assert.equal(m.cells.get('2027-1').kind, 'forward');   // NGF27 open until late Dec 2026
  assert.equal(m.cells.get('2026-11').kind, 'settled');
  close(m.cells.get('2026-11').value, hh.get('NGX26').last);
  const mt = A.settlementMatrix(ttf);
  assert.equal(mt.cells.get('2026-5').kind, 'incomplete');
  assert.equal(mt.cells.get('2026-5').value, null);
});

test('seasonal factors average to zero within each complete year', () => {
  const m = A.settlementMatrix(hh);
  const f = A.seasonalFactors(m, 2025, 2025);
  close(f.reduce((s, x) => s + x.mean, 0), 0, 1e-9);
});

test('curve strips require every month', () => {
  const curve = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ year: 2027, month: m, price: m }));
  const s = A.curveStrips(curve);
  close(s.find(x => x.label === 'Cal 27').value, 6.5);
  close(s.find(x => x.label === 'Sum 27').value, 7);
  assert.equal(s.find(x => x.kind === 'Winter'), undefined);   // needs Jan-Mar 2028
});

test('return grid compounds monthly and annual returns consistently', () => {
  const g = A.returnGrid(hh.continuous());
  const y = 2025;
  const prod = g.months.filter(m => m.year === y).reduce((p, m) => p * (1 + m.ret / 100), 1);
  close(g.annual.get(y).ret, (prod - 1) * 100, 1e-6);
});

test('seasonal path gives each prior year one as-of value per calendar day', () => {
  const dates = ['2024-01-05', '2024-01-08', '2025-01-03', '2025-01-06', '2026-01-05'];
  const vals = [1, 2, 3, 4, 9];
  const r = A.seasonalPath(dates, vals, 2026, 2);
  const jan7 = r.rows.find(x => x.md === '01-07');   // Sun 2024 → Fri close 1; Tue 2025 → Mon close 4
  assert.deepEqual([jan7.lo, jan7.hi, jan7.n], [1, 4, 2]);
  assert.deepEqual(r.current.map(c => c.v), [9]);
});

test('denseByT interpolates short gaps only', () => {
  const m = A.denseByT([{ t: 5, v: 1 }, { t: 3, v: 3 }, { t: 0, v: 0 }, { t: -20, v: 9 }], 2);
  assert.equal(m.get(4), 2);
  assert.equal(m.get(2), 2);       // 3 -> 0 over 3 steps
  assert.equal(m.get(-5), undefined); // 20-step gap is not filled
});
