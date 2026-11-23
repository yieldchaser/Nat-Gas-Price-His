import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Market, FxSeries, eurMwhToUsdMmbtu, monthlyReturns, mergePoints } from '../../src/js/lib/market.js';

const root = new URL('../../', import.meta.url);
const load = p => JSON.parse(readFileSync(new URL(p, root)));
const feed = load('data/live_quotes.json');
const TODAY = '2026-11-20';
const hh = new Market('HH', load('data/hh.json'), feed.quotes, TODAY);
const ttf = new Market('TTF', load('data/ttf.json'), feed.quotes, TODAY);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('unit conversion EUR/MWh -> USD/MMBtu multiplies by FX and divides by 3.412', () => {
  close(eurMwhToUsdMmbtu(30, 1.1), 30 * 1.1 / 3.412141633);
  close(eurMwhToUsdMmbtu(34.12141633, 1), 10);
  assert.equal(eurMwhToUsdMmbtu(30, null), null);
});

test('live feed overrides archive on overlapping dates and nothing after expiry is kept', () => {
  const merged = mergePoints({ dates: ['2026-01-01', '2026-01-02'], p: [1, 2] },
    [{ date: '2026-01-02', p: 2.5 }, { date: '2026-01-04', p: 2.5 }, { date: '2026-01-05', p: 3 }], '2026-01-02');
  assert.deepEqual(merged, { dates: ['2026-01-01', '2026-01-02'], p: [1, 2.5] });
  // Sunday bar (copy of Friday) and Labor Day bar from the feed are rejected.
  const m2 = mergePoints(null, [{ date: '2026-09-04', p: 3.9 }, { date: '2026-09-06', p: 3.9 },
    { date: '2026-09-07', p: 3.916 }, { date: '2026-09-08', p: 3.89 }], '2026-12-29', 'NG');
  assert.deepEqual(m2.dates, ['2026-09-04', '2026-09-08']);
});

test('front month follows the expiry schedule', () => {
  assert.equal(hh.nearbyTicker('2026-11-20'), 'NGZ26');
  assert.equal(hh.nearbyTicker('2026-11-25'), 'NGZ26');   // expiry day: still front
  assert.equal(hh.nearbyTicker('2026-11-27'), 'NGF27');
  assert.equal(hh.nearbyTicker('2026-11-20', 1), 'NGF27');
  assert.equal(ttf.nearbyTicker('2026-11-20'), 'TGZ26');   // TTF Dec expires 27 Nov
});

test('continuous returns never span a roll', () => {
  const c = hh.continuous();
  assert.ok(c.rolls.length > 400);
  for (const i of c.rolls) {
    const contract = hh.get(c.tickers[i]);
    const prev = contract.priceOn(c.dates[i - 1]);
    if (prev == null) { assert.equal(c.r[i], null); continue; }
    close(c.r[i], Math.log(c.p[i] / prev), 1e-12);
  }
  // Back-adjusted index ends at the last actual price and matches cumulative returns.
  const n = c.p.length - 1;
  close(c.adj[n], c.p[n], 1e-9);
  const i0 = n - 250;
  const sum = c.r.slice(i0 + 1).reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
  close(Math.log(c.adj[n] / c.adj[i0]), sum, 1e-9);
});

test('the roll on 2026-11-20 data is not reported as a price move', () => {
  // Yahoo NG=F had already rolled to January; its +9.6% "day change" was the
  // Dec->Jan curve gap. The contract-based front month shows NGZ26's own move.
  const c = hh.continuous();
  const i = c.index.get('2026-11-20');
  assert.equal(c.tickers[i], 'NGZ26');
  const z = hh.get('NGZ26');
  close(c.r[i], Math.log(z.priceOn('2026-11-20') / z.priceOn('2026-11-19')), 1e-12);
  assert.ok(Math.abs(c.r[i]) < 0.09);
});

test('front-month series agrees with the legacy continuous file where both exist', { skip: !existsSync(new URL('data/ng_continuous.json', root)) }, () => {
  const legacy = load('data/ng_continuous.json');
  const c = hh.continuous();
  let both = 0, same = 0;
  for (const pt of legacy) {
    const i = c.index.get(pt.date);
    if (i === undefined) continue;
    both++;
    if (Math.abs(c.p[i] - pt.p) < 1e-6) same++;
  }
  assert.ok(both > 8000);
  assert.ok(same / both > 0.98, `${same}/${both}`);
});

test('settlement status reflects repaired history', () => {
  assert.equal(hh.status(hh.get('NGV26')), 'settled');
  assert.equal(hh.status(hh.get('NGX26')), 'settled');
  const front = hh.get(hh.nearbyTicker(hh.lastDate));
  assert.equal(hh.status(front), front.expiry > hh.lastDate ? 'active' : 'settled');
  assert.ok(['incomplete', 'settled'].includes(ttf.status(ttf.get('TGK26'))));   // settled once imported
  for (const c of ttf.list) if (ttf.status(c) === 'incomplete') assert.equal(ttf.settlement(c), null);
  assert.equal(hh.settlement(hh.get('NGF27')), null);   // open until late Dec 2026
  for (const c of hh.list) {
    if (hh.status(c) === 'settled') assert.equal(c.lastDate, c.expiry, c.ticker);
  }
});

test('curve on a date uses that date\'s closes and keeps missing months as gaps', () => {
  const curve = hh.curveOn('2026-11-20');
  assert.equal(curve[0].ticker, 'NGZ26');
  close(curve[0].price, hh.get('NGZ26').priceOn('2026-11-20'));
  assert.equal(curve.length, 72);
  curve.filter(s => s.price === null).forEach(s => assert.equal(s.priceDate, null));
});

test('calendar spread is front minus back on common dates', () => {
  const s = hh.structure([{ ticker: 'NGF27', w: 1 }, { ticker: 'NGG27', w: -1 }]);
  assert.ok(s.length > 300);
  const last = s[s.length - 1];
  close(last.v, hh.get('NGF27').priceOn(last.date) - hh.get('NGG27').priceOn(last.date), 1e-12);
  assert.equal(s.find(p => p.date === '2026-12-29')?.t ?? 0, 0);
});

test('lifecycle T counts weekdays to expiry and is unique per session', () => {
  const lc = hh.lifecycle('NGX26');
  assert.equal(lc[lc.length - 1].t, 0);
  assert.equal(lc[lc.length - 1].date, '2026-10-28');
  const ts = lc.map(p => p.t);
  assert.ok(ts.every((t, i) => i === 0 || t < ts[i - 1]), 'T strictly decreasing');
});

test('monthly returns compound daily log returns', () => {
  const m = monthlyReturns(['2026-01-02', '2026-01-05', '2026-02-02'], [null, Math.log(1.1), Math.log(0.9)]);
  close(m[0].ret, 10); close(m[1].ret, -10);
});

test('FX as-of lookup', () => {
  const fx = new FxSeries({ dates: ['2026-01-02', '2026-01-05'], rate: [1.1, 1.2] });
  assert.equal(fx.on('2026-01-04'), 1.1);
  assert.equal(fx.on('2026-01-01'), null);
  assert.equal(fx.on('2026-02-01'), null);   // too stale
});
