// Higher-level analytics used by the views. Pure functions over Market data,
// covered by tests/js/analytics.test.mjs.

import { MONTHS, addBusinessDays, addDays, bdBetween, makeTicker, toDayNum } from './calendar.js';
import { eurMwhToUsdMmbtu, monthlyReturns } from './market.js';
import {
  annualisedVol, boxStats, mean, minMax, percentileRank, quantileSorted, rollingVol, stdev,
} from './stats.js';

const sumFinite = xs => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);
const pctOfLog = r => (Math.exp(r) - 1) * 100;

/** Index of the last element with dates[i] <= iso (binary search), or -1. */
export function indexAtOrBefore(dates, iso) {
  let lo = 0, hi = dates.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= iso) { k = m; lo = m + 1; } else hi = m - 1; }
  return k;
}

/**
 * Roll-adjusted change of the front-month series over the window ending at
 * the last observation: compounded same-contract returns, so a roll from one
 * delivery month to the next is never counted as a price move.
 */
export function rollAdjustedChange(cont, fromIso) {
  const n = cont.dates.length;
  const i0 = indexAtOrBefore(cont.dates, fromIso);
  if (i0 < 0 || i0 >= n - 1) return null;
  return pctOfLog(sumFinite(cont.r.slice(i0 + 1)));
}

/**
 * Seasonal comparison of a daily series: values within ±halfWindow calendar
 * days of the same month-day in each of the previous `years` years.
 */
export function sameSeasonValues(dates, values, asOf, years = 5, halfWindow = 7) {
  const out = [];
  const yearsSeen = new Set();
  for (let k = 1; k <= years; k++) {
    const y = +asOf.slice(0, 4) - k;
    let md = asOf.slice(5);
    if (md === '02-29') md = '02-28';
    const center = `${y}-${md}`;
    const lo = addDays(center, -halfWindow), hi = addDays(center, halfWindow);
    let i = indexAtOrBefore(dates, hi);
    while (i >= 0 && dates[i] >= lo) {
      if (Number.isFinite(values[i])) { out.push(values[i]); yearsSeen.add(y); }
      i--;
    }
  }
  return { values: out, years: yearsSeen.size };
}

/** Headline market signals for the overview. */
export function marketSignals(hh, { ttf = null, fx = null, spot = null, today } = {}) {
  const c = hh.continuous();
  const n = c.dates.length - 1;
  const last = c.dates[n];
  const front = hh.get(c.tickers[n]);
  const fi = front.index.get(last);
  const prev = fi > 0 ? { date: front.dates[fi - 1], p: front.p[fi - 1] } : null;
  const ago = days => addDays(last, -days);
  const yearStart = `${last.slice(0, 4)}-01-01`;

  // Volatility (roll-adjusted daily log returns)
  const rv20 = rollingVol(c.r, 20);
  const vol20 = rv20[n];
  const fiveY = indexAtOrBefore(c.dates, addDays(last, -5 * 365)) + 1;
  const volHist = rv20.slice(fiveY).filter(Number.isFinite);

  // Price context (nominal front-month closes)
  const window = (days) => c.p.slice(indexAtOrBefore(c.dates, ago(days)) + 1);
  const p5y = window(5 * 365), p1y = window(365);
  const seasonal = sameSeasonValues(c.dates, c.p, last, 5, 7);

  // Curve
  const curve = hh.curveOn(last, 13);
  const m1 = curve[0], m2 = curve[1], m13 = curve[12];
  const strip12 = curve.slice(0, 12).map(s => s.price);

  // Expiry clock
  const daysToExpiry = bdBetween(today && today > last ? today : last, front.expiry, 'NG');

  const sig = {
    asOf: last, front, price: c.p[n],
    change1d: prev ? { abs: c.p[n] - prev.p, pct: (c.p[n] / prev.p - 1) * 100, prevDate: prev.date } : null,
    change1w: rollAdjustedChange(c, ago(7)),
    change1m: rollAdjustedChange(c, ago(30)),
    changeYtd: rollAdjustedChange(c, addDays(yearStart, -1)),
    vol20, volPctile5y: Number.isFinite(vol20) ? percentileRank(volHist, vol20) : null,
    pctile5y: percentileRank(p5y, c.p[n]), pctile1y: percentileRank(p1y, c.p[n]),
    range1y: minMax(p1y),
    seasonal: seasonal.years >= 3 ? {
      years: seasonal.years, mean: mean(seasonal.values), ...minMax(seasonal.values),
      devPct: (c.p[n] / mean(seasonal.values) - 1) * 100,
    } : null,
    curve: {
      m1, m2, m13,
      m1m2: m1.price != null && m2.price != null ? m1.price - m2.price : null,
      carry12: m1.price != null && m13.price != null ? (m13.price / m1.price - 1) * 100 : null,
      strip12: strip12.every(Number.isFinite) ? mean(strip12) : null,
    },
    expiry: { date: front.expiry, bdays: daysToExpiry, next: hh.nearbyTicker(addBusinessDays(front.expiry, 1, 'NG')) },
  };

  if (ttf) {
    const tc = ttf.continuous();
    const k = tc.dates.length - 1;
    const rate = fx ? fx.on(tc.dates[k]) : null;
    sig.ttf = {
      ticker: tc.tickers[k], date: tc.dates[k], eur: tc.p[k], fx: rate,
      usd: eurMwhToUsdMmbtu(tc.p[k], rate),
    };
    sig.ttf.spread = Number.isFinite(sig.ttf.usd) ? sig.ttf.usd - c.p[n] : null;
  }
  if (spot && spot.dates.length) {
    const k = spot.dates.length - 1;
    const d = spot.dates[k];
    const fut = hh.nearby(d);
    const fp = fut ? fut.priceOn(d) : null;
    sig.spot = { date: d, p: spot.p[k], futures: fp, futuresTicker: fut ? fut.ticker : null, basis: fp != null ? spot.p[k] - fp : null };
  }
  return sig;
}

/**
 * Fill short session gaps (exchange holidays, missing vendor days) inside a
 * series indexed by lifecycle position by linear interpolation, so every
 * contract contributes at every T within its life when series are aggregated
 * across years. Gaps longer than `maxGap` weekdays are left empty.
 * points: [{t, v}] in any order → Map(t -> v)
 */
export function denseByT(points, maxGap = 5) {
  const pts = points.filter(p => Number.isFinite(p.v)).sort((a, b) => b.t - a.t);
  const out = new Map();
  for (let i = 0; i < pts.length; i++) {
    out.set(pts[i].t, pts[i].v);
    const nx = pts[i + 1];
    if (!nx) break;
    const gap = pts[i].t - nx.t;
    if (gap > 1 && gap <= maxGap + 1) {
      for (let k = 1; k < gap; k++) out.set(pts[i].t - k, pts[i].v + (nx.v - pts[i].v) * (k / gap));
    }
  }
  return out;
}

function aggregateByT(maps, minN) {
  const byT = new Map();
  maps.forEach(m => m.forEach((v, t) => { if (!byT.has(t)) byT.set(t, []); byT.get(t).push(v); }));
  return [...byT.entries()].filter(([, v]) => v.length >= minN && v.length > 0).map(([t, v]) => {
    const s = v.slice().sort((a, b) => a - b);
    return { t, n: s.length, lo: s[0], hi: s[s.length - 1], p25: quantileSorted(s, 0.25), median: quantileSorted(s, 0.5), p75: quantileSorted(s, 0.75), mean: mean(s) };
  }).sort((a, b) => b.t - a.t);
}

/**
 * Historical envelope of prior same-month contracts by lifecycle position.
 * Returns {years: [...], rows: [{t, n, lo, p25, median, p75, hi, mean}]} for
 * t in [tMin, tMax]. Only settled contracts of delivery years in
 * [refYear - years, refYear - 1] are used (years = Infinity → all).
 */
export function lifecycleBand(market, month, refYear, years = 5) {
  const priors = market.sameMonth(month).filter(x =>
    x.year < refYear && x.year >= refYear - years && market.status(x.contract) === 'settled');
  const maps = priors.map(x => denseByT(market.lifecycle(x.ticker).map(pt => ({ t: pt.t, v: pt.p }))));
  // Require most of the cohort at each T so the envelope does not jump where
  // older, shorter-lived contracts drop out.
  const rows = aggregateByT(maps, Math.max(1, Math.min(priors.length, Math.ceil(priors.length * 0.6))));
  return { years: priors.map(x => x.year), rows };
}

/**
 * Where does a contract sit versus the same delivery month in prior years at
 * the same lifecycle position, and what happened next in those years?
 */
export function contractContext(market, ticker, years = Infinity) {
  const c = market.get(ticker);
  if (!c) return null;
  const lc = market.lifecycle(ticker);
  const now = lc[lc.length - 1];
  const priors = market.sameMonth(c.month).filter(x => x.year < c.year && x.year >= c.year - years
    && market.status(x.contract) === 'settled');
  const rows = priors.map(x => {
    const plc = market.lifecycle(x.ticker);
    // nearest observation at or before the same T (holidays leave gaps)
    let at = null;
    for (const pt of plc) { if (pt.t >= now.t && pt.t - now.t <= 3) at = pt; }
    const settle = x.contract.last;
    return {
      year: x.year, ticker: x.ticker, atT: at ? at.p : null, atDate: at ? at.date : null, settle,
      toExpiryPct: at ? (settle / at.p - 1) * 100 : null,
      high: Math.max(...x.contract.p), low: Math.min(...x.contract.p),
    };
  }).sort((a, b) => b.year - a.year);
  const atT = rows.map(r => r.atT).filter(Number.isFinite);
  const outcomes = rows.map(r => r.toExpiryPct).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    contract: c, status: market.status(c), now, rows,
    percentile: percentileRank(atT, now.p),
    vsMeanPct: atT.length ? (now.p / mean(atT) - 1) * 100 : null,
    z: atT.length > 2 && stdev(atT) ? (now.p - mean(atT)) / stdev(atT) : null,
    outcomes: outcomes.length ? {
      n: outcomes.length, median: quantileSorted(outcomes, 0.5), p10: quantileSorted(outcomes, 0.1),
      p90: quantileSorted(outcomes, 0.9), up: outcomes.filter(x => x > 0).length,
    } : null,
    fromOpenPct: (now.p / c.p[0] - 1) * 100, high: Math.max(...c.p), low: Math.min(...c.p),
  };
}

/** Legs of a structure for a front-leg delivery year. kind: 'spread' | 'fly'. */
export function structureLegs(prefix, kind, months, year) {
  const [a, b, c] = months;
  const yr = m => year + (m < a ? 1 : 0);   // later months roll into next year
  if (kind === 'fly') {
    return [
      { ticker: makeTicker(prefix, yr(a), a), w: 1 },
      { ticker: makeTicker(prefix, yr(b), b), w: -2 },
      { ticker: makeTicker(prefix, yr(c), c), w: 1 },
    ];
  }
  return [{ ticker: makeTicker(prefix, yr(a), a), w: 1 }, { ticker: makeTicker(prefix, yr(b), b), w: -1 }];
}

/**
 * Spread/fly history across years. Returns {byYear: Map(year -> series),
 * band rows by T for years < refYear, stats for refYear}.
 */
export function structureAnalysis(market, kind, months, refYear, bandYears = 5) {
  const years = market.yearsFor(months[0]);
  const byYear = new Map();
  years.forEach(y => {
    const s = market.structure(structureLegs(market.prefix, kind, months, y));
    if (s.length) byYear.set(y, s);
  });
  const prior = [...byYear.keys()].filter(y => y < refYear && y >= refYear - bandYears);
  const band = aggregateByT(prior.map(y => denseByT(byYear.get(y))),
    Math.max(1, Math.min(prior.length, Math.ceil(prior.length * 0.6))));

  const cur = byYear.get(refYear) || [];
  const now = cur[cur.length - 1] || null;
  const valueNear = (series, t) => {
    let hit = null;
    for (const pt of series) if (pt.t >= t && pt.t - t <= 3) hit = pt;
    return hit;
  };
  const table = [...byYear.entries()].map(([y, s]) => {
    const legs = structureLegs(market.prefix, kind, months, y);
    const frontC = market.get(legs[0].ticker);
    const settled = frontC && market.status(frontC) === 'settled';
    const vals = s.map(p => p.v);
    const atT = now ? valueNear(s, now.t) : null;
    return {
      year: y, label: legs.map(l => l.ticker).join(' / '), settled,
      final: settled ? s[s.length - 1].v : null, last: s[s.length - 1].v, lastDate: s[s.length - 1].date,
      atT: atT ? atT.v : null, min: Math.min(...vals), max: Math.max(...vals), mean: mean(vals),
    };
  }).sort((a, b) => b.year - a.year);
  const priorAtT = table.filter(r => r.year < refYear && r.year >= refYear - bandYears).map(r => r.atT).filter(Number.isFinite);
  const allAtT = table.filter(r => r.year < refYear).map(r => r.atT).filter(Number.isFinite);
  const finals = table.filter(r => r.year < refYear && r.final != null).map(r => r.final);
  return {
    byYear, band, now, table, legs: structureLegs(market.prefix, kind, months, refYear),
    stats: now ? {
      value: now.v, t: now.t, date: now.date,
      pctileAll: percentileRank(allAtT, now.v), nAll: allAtT.length,
      meanBand: mean(priorAtT), nBand: priorAtT.length,
      z: priorAtT.length > 2 && stdev(priorAtT) ? (now.v - mean(priorAtT)) / stdev(priorAtT) : null,
      finalMean: mean(finals), finalMedian: finals.length ? quantileSorted(finals.slice().sort((a, b) => a - b), 0.5) : null, nFinal: finals.length,
    } : null,
  };
}

/**
 * Rich/cheap scanner: for every front/back month pair, the current spread for
 * the nearest unexpired front leg and its percentile versus all prior years
 * at the same lifecycle position.
 */
export function spreadScanner(market, asOf) {
  const out = [];
  // Value of a structure at lifecycle position t (or up to 3 weekdays earlier
  // in its life when that session is missing), using direct lookups.
  const valueAtT = (legs, t) => {
    const cs = legs.map(l => market.get(l.ticker));
    if (cs.some(c => !c)) return null;
    for (let k = 0; k <= 3; k++) {
      const d = addBusinessDays(cs[0].expiry, -(t + k), 'WD');
      let v = 0, ok = true;
      for (let j = 0; j < cs.length && ok; j++) { const p = cs[j].priceOn(d); if (p == null) ok = false; else v += legs[j].w * p; }
      if (ok) return v;
    }
    return null;
  };
  for (let a = 1; a <= 12; a++) {
    // nearest front-leg year whose contract has not expired at asOf
    let y = +asOf.slice(0, 4);
    if (market.expiryOf(makeTicker(market.prefix, y, a)) < asOf) y++;
    const years = market.yearsFor(a).filter(x => x < y);
    for (let b = 1; b <= 12; b++) {
      if (a === b) continue;
      const legs = structureLegs(market.prefix, 'spread', [a, b], y);
      const front = market.get(legs[0].ticker), back = market.get(legs[1].ticker);
      let value = null, t = null, date = null;
      if (front && back) {
        for (let i = front.dates.length - 1; i >= 0 && value == null; i--) {
          const pb = back.priceOn(front.dates[i]);
          if (pb != null) { value = front.p[i] - pb; date = front.dates[i]; t = bdBetween(date, front.expiry, 'WD'); }
        }
      }
      const hist = value == null ? [] : years.map(py => valueAtT(structureLegs(market.prefix, 'spread', [a, b], py), t)).filter(Number.isFinite);
      out.push({ front: a, back: b, year: y, value, t, date, n: hist.length, pctile: hist.length >= 5 ? percentileRank(hist, value) : null, mean: mean(hist) });
    }
  }
  return out;
}

/** Settlement matrix {years: [...desc], cells: Map 'y-m' -> {value, kind}} */
export function settlementMatrix(market) {
  const cells = new Map();
  const years = new Set();
  market.list.forEach(c => {
    const st = market.status(c);
    if (st === 'settled') cells.set(`${c.year}-${c.month}`, { value: c.last, kind: 'settled', ticker: c.ticker, date: c.lastDate });
    else if (st === 'active') cells.set(`${c.year}-${c.month}`, { value: c.last, kind: 'forward', ticker: c.ticker, date: c.lastDate });
    else cells.set(`${c.year}-${c.month}`, { value: null, kind: 'incomplete', ticker: c.ticker, date: c.lastDate });
    years.add(c.year);
  });
  return { years: [...years].sort((a, b) => b - a), cells };
}

/** Per-year aggregates of settled months only (null unless every month in the group settled). */
export function yearAggregates(matrix, year) {
  const v = m => { const c = matrix.cells.get(`${year}-${m}`); return c && c.kind === 'settled' ? c.value : null; };
  const all = Array.from({ length: 12 }, (_, i) => v(i + 1));
  const avgIf = xs => (xs.every(Number.isFinite) ? mean(xs) : null);
  return {
    cal: avgIf(all),
    summer: avgIf([4, 5, 6, 7, 8, 9, 10].map(v)),            // Apr–Oct
    winterPrev: avgIf([1, 2, 3].map(v)),                       // Jan–Mar of this year
  };
}

/**
 * Seasonal settlement factors: settlement / calendar-year mean, per month,
 * over complete settled years in [fromYear, toYear].
 */
export function seasonalFactors(matrix, fromYear, toYear) {
  const perMonth = Array.from({ length: 12 }, () => []);
  for (let y = fromYear; y <= toYear; y++) {
    const vals = Array.from({ length: 12 }, (_, i) => {
      const c = matrix.cells.get(`${y}-${i + 1}`);
      return c && c.kind === 'settled' ? c.value : null;
    });
    if (!vals.every(Number.isFinite)) continue;
    const m = mean(vals);
    vals.forEach((v, i) => perMonth[i].push((v / m - 1) * 100));
  }
  return perMonth.map((xs, i) => ({ month: i + 1, label: MONTHS[i], ...(boxStats(xs) || { n: 0 }) }));
}

/** Forward-curve strips: calendar years, summer (Apr–Oct) and winter (Nov–Mar). */
export function curveStrips(curve) {
  const by = new Map(curve.map(s => [`${s.year}-${s.month}`, s.price]));
  const strip = (pairs) => { const v = pairs.map(([y, m]) => by.get(`${y}-${m}`)); return v.every(Number.isFinite) ? mean(v) : null; };
  const years = [...new Set(curve.map(s => s.year))];
  const out = [];
  years.forEach(y => {
    out.push({ kind: 'Cal', label: `Cal ${String(y).slice(2)}`, year: y, value: strip(Array.from({ length: 12 }, (_, i) => [y, i + 1])) });
    out.push({ kind: 'Summer', label: `Sum ${String(y).slice(2)}`, year: y, value: strip([4, 5, 6, 7, 8, 9, 10].map(m => [y, m])) });
    out.push({ kind: 'Winter', label: `Win ${String(y).slice(2)}/${String(y + 1).slice(2)}`, year: y, value: strip([[y, 11], [y, 12], [y + 1, 1], [y + 1, 2], [y + 1, 3]]) });
  });
  return out.filter(s => s.value != null);
}

/** Prompt premium history: M1 minus the average of M1..M12 on each date. */
export function promptPremiumHistory(market, fromIso) {
  const out = [];
  const i0 = indexAtOrBefore(market.dates, fromIso) + 1;
  for (let i = Math.max(0, i0); i < market.dates.length; i++) {
    const d = market.dates[i];
    const px = [];
    for (let k = 0; k < 12; k++) {
      const c = market.nearby(d, k);
      const v = c ? c.priceOn(d) : null;
      if (v == null) break;
      px.push(v);
    }
    if (px.length === 12) out.push({ date: d, m1: px[0], strip: mean(px), premium: px[0] - mean(px) });
  }
  return out;
}

/** Monthly (year × month) roll-adjusted return grid + annual totals. */
export function returnGrid(cont) {
  const months = monthlyReturns(cont.dates, cont.r);
  const years = [...new Set(months.map(m => m.year))].sort((a, b) => b - a);
  const cell = new Map(months.map(m => [`${m.year}-${m.month}`, m]));
  const annual = new Map();
  years.forEach(y => {
    const ms = months.filter(m => m.year === y);
    annual.set(y, { ret: pctOfLog(sumFinite(ms.map(m => m.logRet))), months: ms.length });
  });
  return { years, cell, annual, months };
}

/** Realised vol per (year, month) from daily roll-adjusted returns (≥ 12 obs). */
export function monthlyVol(cont) {
  const groups = new Map();
  cont.dates.forEach((d, i) => {
    if (!Number.isFinite(cont.r[i])) return;
    const k = d.slice(0, 7);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(cont.r[i]);
  });
  const out = [];
  groups.forEach((rs, k) => { const v = annualisedVol(rs, 252, 12); if (v != null) out.push({ year: +k.slice(0, 4), month: +k.slice(5, 7), vol: v }); });
  return out;
}

/**
 * Seasonal price path: current-year daily values vs the min/mean/max of the
 * previous `years` years on the same calendar day. Each prior year contributes
 * exactly one value per calendar day — its latest close on or before that day
 * (at most 5 days old) — so weekends and holidays, which fall on different
 * dates each year, do not change which years are in the envelope.
 */
export function seasonalPath(dates, values, year, years = 5) {
  const current = [];
  dates.forEach((d, i) => { if (+d.slice(0, 4) === year && d.slice(5) !== '02-29') current.push({ md: d.slice(5), date: d, v: values[i] }); });
  const hist = new Map();
  for (let y = year - years; y < year; y++) {
    for (let n = toDayNum(`${y}-01-01`), end = toDayNum(`${y}-12-31`); n <= end; n++) {
      const d = addDays('1970-01-01', n);
      const md = d.slice(5);
      if (md === '02-29') continue;
      const k = indexAtOrBefore(dates, d);
      if (k < 0 || n - toDayNum(dates[k]) > 5) continue;
      if (!hist.has(md)) hist.set(md, []);
      hist.get(md).push(values[k]);
    }
  }
  const rows = [...hist.entries()].filter(([, v]) => v.length >= Math.max(1, Math.ceil(years * 0.6))).map(([md, v]) => ({
    md, n: v.length, lo: Math.min(...v), hi: Math.max(...v), mean: mean(v),
  })).sort((a, b) => (a.md < b.md ? -1 : 1));
  return { rows, current };
}

export { toDayNum };
