// Market data model: contracts (archive merged with the live feed), front-month
// continuous series with roll-adjusted returns, forward curves, lifecycle
// (T-day) alignment, spreads and settlements.

import {
  CODES, MONTHS, addDays, bdBetween, contractExpiry, fromDayNum, isSession, makeTicker,
  parseTicker, toDayNum,
} from './calendar.js';
import { logReturn } from './stats.js';

export const MMBTU_PER_MWH = 3.412141633;   // 1 MWh = 3.412141633 MMBtu
/** EUR/MWh → USD/MMBtu at a EURUSD rate (USD per EUR). */
export const eurMwhToUsdMmbtu = (eurPerMwh, eurusd) =>
  Number.isFinite(eurPerMwh) && Number.isFinite(eurusd) ? (eurPerMwh * eurusd) / MMBTU_PER_MWH : null;

export const MARKETS = {
  HH: { key: 'HH', prefix: 'NG', name: 'Henry Hub', unit: 'USD/MMBtu', ccy: '$', dp: 3 },
  TTF: { key: 'TTF', prefix: 'TG', name: 'Dutch TTF', unit: 'EUR/MWh', ccy: '€', dp: 2 },
};

/** Delta-encoded series {d0, dt[], p[]} → {dates[], p[]}. */
export function decodeSeries(d0, dt, p) {
  const dates = new Array(dt.length);
  let n = toDayNum(d0);
  for (let i = 0; i < dt.length; i++) { n += dt[i]; dates[i] = fromDayNum(n); }
  return { dates, p: p.slice() };
}

/**
 * Merge archive and live points (live wins on overlap), drop rows after expiry
 * and live rows on non-session dates (weekend/holiday bars from the feed).
 */
export function mergePoints(archive, live, expiry, prefix = 'NG') {
  const m = new Map();
  if (archive) archive.dates.forEach((d, i) => m.set(d, archive.p[i]));
  if (live) live.forEach(pt => { if (pt && pt.date && pt.p > 0 && isSession(prefix, pt.date)) m.set(pt.date, pt.p); });
  const dates = [...m.keys()].filter(d => !expiry || d <= expiry).sort();
  return { dates, p: dates.map(d => m.get(d)) };
}

export class Contract {
  constructor(ticker, expiry, series, { archivedStatus = null, source = 'archive' } = {}) {
    const info = parseTicker(ticker);
    this.ticker = ticker;
    this.year = info.year;
    this.month = info.month;
    this.label = `${MONTHS[info.month - 1]} ${info.year}`;
    this.short = `${MONTHS[info.month - 1]} ${String(info.year).slice(2)}`;
    this.expiry = expiry;
    this.dates = series.dates;
    this.p = series.p;
    this.source = source;
    this.archivedStatus = archivedStatus;
    this.index = new Map(this.dates.map((d, i) => [d, i]));
  }
  get first() { return this.dates[0]; }
  get lastDate() { return this.dates[this.dates.length - 1]; }
  get last() { return this.p[this.p.length - 1]; }
  priceOn(date) { const i = this.index.get(date); return i === undefined ? null : this.p[i]; }
  /** Last price on or before `date`, at most `maxDays` calendar days old. */
  priceAsOf(date, maxDays = 5) {
    let lo = 0, hi = this.dates.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (this.dates[mid] <= date) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 0) return null;
    if (toDayNum(date) - toDayNum(this.dates[k]) > maxDays) return null;
    return { date: this.dates[k], p: this.p[k] };
  }
}

export class Market {
  /**
   * @param {'HH'|'TTF'} key
   * @param {object} payload  data/hh.json | data/ttf.json
   * @param {object} feedQuotes  live_quotes.json "quotes" (may be null)
   * @param {string} today  ISO date used to classify contracts
   */
  constructor(key, payload, feedQuotes, today) {
    this.meta = MARKETS[key];
    this.key = key;
    this.prefix = this.meta.prefix;
    this.cal = 'WD';                     // lifecycle alignment: weekdays to expiry
    this.today = today;
    this.contracts = new Map();
    const archived = (payload && payload.contracts) || {};
    const live = {};
    Object.entries(feedQuotes || {}).forEach(([sym, pts]) => {
      if (!sym.endsWith('.NYM')) return;
      const info = parseTicker(sym);
      if (info && info.prefix === this.prefix) live[makeTicker(info.prefix, info.year, info.month)] = pts;
    });
    const tickers = new Set([...Object.keys(archived), ...Object.keys(live)]);
    for (const t of tickers) {
      const a = archived[t];
      const expiry = a ? a.x : contractExpiry(t);
      const series = mergePoints(a ? decodeSeries(a.d0, a.dt, a.p) : null, live[t], expiry, this.prefix);
      if (!series.dates.length) continue;
      const source = a && live[t] ? 'archive+feed' : a ? 'archive' : 'feed';
      this.contracts.set(t, new Contract(t, expiry, series, { archivedStatus: a ? a.s : null, source }));
    }
    this.list = [...this.contracts.values()].sort((x, y) => (x.expiry < y.expiry ? -1 : 1));
    const all = new Set();
    this.list.forEach(c => c.dates.forEach(d => all.add(d)));
    this.dates = [...all].sort();
    this.lastDate = this.dates[this.dates.length - 1];
    this.firstDate = this.dates[0];
    this._cont = {};
    this._expiryCache = new Map();
  }

  get(ticker) { return this.contracts.get(ticker) || null; }
  expiryOf(ticker) {
    const c = this.contracts.get(ticker);
    if (c) return c.expiry;
    if (!this._expiryCache.has(ticker)) this._expiryCache.set(ticker, contractExpiry(ticker));
    return this._expiryCache.get(ticker);
  }

  /**
   * settled: the contract has traded through its last trading day and that
   *          day is in the past relative to the market's latest data.
   * incomplete: expired but history stops before the last trading day.
   * active: still trading.
   */
  status(c) {
    if (c.lastDate === c.expiry && (c.expiry < this.lastDate || c.expiry < this.today)) return 'settled';
    if (c.expiry < this.today || c.expiry < this.lastDate) return 'incomplete';
    return 'active';
  }
  settlement(c) { return c && this.status(c) === 'settled' ? c.last : null; }

  /** Ticker of the k-th nearby contract (0 = front) on `date` by exchange schedule. */
  nearbyTicker(date, k = 0) {
    let y = +date.slice(0, 4), m = +date.slice(5, 7) + 1;   // next delivery month
    if (m > 12) { m = 1; y++; }
    let t = makeTicker(this.prefix, y, m);
    if (this.expiryOf(t) < date) { m++; if (m > 12) { m = 1; y++; } t = makeTicker(this.prefix, y, m); }
    for (let i = 0; i < k; i++) { m++; if (m > 12) { m = 1; y++; } }
    return makeTicker(this.prefix, y, m);
  }
  nearby(date, k = 0) { return this.get(this.nearbyTicker(date, k)); }

  /** Weekdays remaining until a contract's expiry (T-n with n ≥ 0). */
  tDays(ticker, date) { return bdBetween(date, this.expiryOf(ticker), this.cal); }

  /**
   * Front-month continuous series rolled at expiry (k = 0) or k-th nearby.
   * r[i]  = same-contract log return from the previous series date, so roll
   *         gaps between contracts never appear as price moves.
   * adj[i] = ratio back-adjusted index built from r, scaled to end at the last
   *          actual price (suitable for return/vol analysis, not price levels).
   */
  continuous(k = 0) {
    if (this._cont[k]) return this._cont[k];
    const dates = [], p = [], tickers = [], r = [], rolls = [];
    for (const d of this.dates) {
      const t = this.nearbyTicker(d, k);
      const c = this.contracts.get(t);
      const px = c ? c.priceOn(d) : null;
      if (px == null) continue;
      const i = dates.length;
      let ret = null;
      if (i > 0) {
        const prevPx = c.priceOn(dates[i - 1]);
        ret = prevPx != null ? logReturn(prevPx, px) : null;
        if (tickers[i - 1] !== t) rolls.push(i);
      }
      dates.push(d); p.push(px); tickers.push(t); r.push(ret);
    }
    const adj = new Array(p.length);
    let acc = 0;
    const cum = r.map(x => (acc += Number.isFinite(x) ? x : 0));
    const scale = p.length ? Math.log(p[p.length - 1]) - cum[cum.length - 1] : 0;
    for (let i = 0; i < p.length; i++) adj[i] = Math.exp(cum[i] + scale);
    const gaps = r.slice(1).filter(x => x === null).length;
    const index = new Map(dates.map((d, i) => [d, i]));
    return (this._cont[k] = { dates, p, tickers, r, adj, rolls, gaps, index });
  }

  /**
   * Forward curve on `date`: every contract with expiry ≥ date. Prices are the
   * close on `date`, or the latest close within `maxStale` calendar days
   * (flagged stale). Missing months are kept with price null.
   */
  curveOn(date, months = 72, maxStale = 5) {
    const out = [];
    for (let k = 0; k < months; k++) {
      const t = this.nearbyTicker(date, k);
      const c = this.contracts.get(t);
      const hit = c ? c.priceAsOf(date, maxStale) : null;
      const info = parseTicker(t);
      out.push({
        ticker: t, year: info.year, month: info.month,
        label: `${MONTHS[info.month - 1]} ${String(info.year).slice(2)}`,
        delivery: `${info.year}-${String(info.month).padStart(2, '0')}-01`,
        price: hit ? hit.p : null, priceDate: hit ? hit.date : null,
        stale: !!(hit && hit.date !== date),
      });
    }
    return out;
  }

  /** Lifecycle points of a contract: [{t, date, p}] with t = weekdays to expiry. */
  lifecycle(ticker) {
    const c = this.get(ticker);
    if (!c) return [];
    const e = c.expiry;
    return c.dates.map((d, i) => ({ t: bdBetween(d, e, this.cal), date: d, p: c.p[i] }));
  }

  /** Same delivery month in other years: [{year, ticker, contract}] (existing only). */
  sameMonth(month) {
    return this.list.filter(c => c.month === month).map(c => ({ year: c.year, ticker: c.ticker, contract: c }));
  }

  /**
   * Calendar spread / butterfly series joined on date.
   * legs: [{ticker, w}] — value = Σ w·price. t is measured to the first leg's expiry.
   */
  structure(legs) {
    const cs = legs.map(l => this.get(l.ticker));
    if (cs.some(c => !c)) return [];
    const exp = cs[0].expiry;
    const out = [];
    for (let i = 0; i < cs[0].dates.length; i++) {
      const d = cs[0].dates[i];
      let v = 0, ok = true;
      for (let j = 0; j < cs.length; j++) {
        const px = j === 0 ? cs[0].p[i] : cs[j].priceOn(d);
        if (px == null) { ok = false; break; }
        v += legs[j].w * px;
      }
      if (ok) out.push({ date: d, t: bdBetween(d, exp, this.cal), v });
    }
    return out;
  }

  /** Delivery years that exist for a delivery month. */
  yearsFor(month) { return this.sameMonth(month).map(x => x.year).sort((a, b) => a - b); }
}

/** Daily FX lookup with as-of fallback (rate on or before date, ≤ maxDays old). */
export class FxSeries {
  constructor(payload) {
    this.dates = (payload && payload.dates) || [];
    this.rate = (payload && payload.rate) || [];
    this.first = this.dates[0] || null;
    this.last = this.dates[this.dates.length - 1] || null;
  }
  get available() { return this.dates.length > 0; }
  latest() { return this.rate.length ? this.rate[this.rate.length - 1] : null; }
  on(date, maxDays = 7) {
    let lo = 0, hi = this.dates.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (this.dates[mid] <= date) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 0 || toDayNum(date) - toDayNum(this.dates[k]) > maxDays) return null;
    return this.rate[k];
  }
}

/** EIA daily spot series. */
export function decodeSpot(payload) {
  if (!payload || !payload.dt) return { dates: [], p: [], index: new Map() };
  const s = decodeSeries(payload.d0, payload.dt, payload.p);
  return { ...s, index: new Map(s.dates.map((d, i) => [d, i])), meta: payload.meta };
}

/** Calendar-month aggregation of a daily log-return series → compounded % returns. */
export function monthlyReturns(dates, r) {
  const map = new Map();
  for (let i = 0; i < dates.length; i++) {
    if (!Number.isFinite(r[i])) continue;
    const key = dates[i].slice(0, 7);
    const e = map.get(key) || { sum: 0, n: 0 };
    e.sum += r[i]; e.n++;
    map.set(key, e);
  }
  return [...map.entries()].map(([key, e]) => ({
    year: +key.slice(0, 4), month: +key.slice(5, 7), logRet: e.sum, ret: (Math.exp(e.sum) - 1) * 100, n: e.n,
  }));
}

export { CODES, MONTHS, addDays };
