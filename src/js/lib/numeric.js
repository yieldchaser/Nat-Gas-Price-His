// Statistics primitives. Every function ignores non-finite inputs and returns
// null (never NaN/Infinity) when a statistic is undefined for the input.

export const finite = xs => xs.filter(Number.isFinite);

export function mean(xs) {
  const v = finite(xs);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Sample standard deviation (n − 1). */
export function stdev(xs) {
  const v = finite(xs);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

/** Quantile with linear interpolation between order statistics (R type 7 / NumPy default). */
export function quantileSorted(sorted, q) {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}
export const quantile = (xs, q) => quantileSorted(finite(xs).sort((a, b) => a - b), q);
export const median = xs => quantile(xs, 0.5);

/**
 * Percentile rank of x within xs, in [0, 100], using the mid-rank convention
 * (ties count half) so a value equal to every observation scores 50, the
 * minimum of n distinct values scores 50/n, and results are symmetric.
 */
export function percentileRank(xs, x) {
  const v = finite(xs);
  if (!v.length || !Number.isFinite(x)) return null;
  let below = 0, equal = 0;
  for (const y of v) { if (y < x) below++; else if (y === x) equal++; }
  return ((below + 0.5 * equal) / v.length) * 100;
}

export function zScore(xs, x) {
  const m = mean(xs), s = stdev(xs);
  return m === null || !s || !Number.isFinite(x) ? null : (x - m) / s;
}

export function minMax(xs) {
  let lo = Infinity, hi = -Infinity;
  for (const x of xs) if (Number.isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo === Infinity ? null : { min: lo, max: hi };
}

/** Five-number style summary for box plots. */
export function boxStats(xs) {
  const v = finite(xs).sort((a, b) => a - b);
  if (!v.length) return null;
  return {
    n: v.length,
    min: v[0], max: v[v.length - 1],
    p5: quantileSorted(v, 0.05), p10: quantileSorted(v, 0.1), p25: quantileSorted(v, 0.25),
    median: quantileSorted(v, 0.5),
    p75: quantileSorted(v, 0.75), p90: quantileSorted(v, 0.9), p95: quantileSorted(v, 0.95),
    mean: v.reduce((a, b) => a + b, 0) / v.length,
    pctPositive: (v.filter(x => x > 0).length / v.length) * 100,
  };
}

/** Sample skewness (adjusted Fisher–Pearson) and excess kurtosis. */
export function moments(xs) {
  const v = finite(xs);
  const n = v.length;
  if (n < 4) return null;
  const m = v.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of v) { const d = x - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  if (!m2) return null;
  const g1 = m3 / m2 ** 1.5;
  const skew = (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
  const g2 = m4 / (m2 * m2) - 3;
  const kurt = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
  return { n, mean: m, sd: Math.sqrt(m2 * n / (n - 1)), skew, kurt };
}

/**
 * Annualised volatility (%) of log returns: sample stdev × √periodsPerYear.
 * Requires at least `minObs` finite returns.
 */
export function annualisedVol(logReturns, periodsPerYear = 252, minObs = 10) {
  const v = finite(logReturns);
  if (v.length < minObs) return null;
  return stdev(v) * Math.sqrt(periodsPerYear) * 100;
}

/**
 * Rolling annualised vol over a window of `n` returns. Positions with fewer
 * than ceil(0.8·n) finite returns in the window yield null (so roll gaps or
 * missing data never produce a value from too few observations).
 */
export function rollingVol(logReturns, n, periodsPerYear = 252) {
  const out = new Array(logReturns.length).fill(null);
  const need = Math.ceil(0.8 * n);
  let s = 0, s2 = 0, k = 0;
  for (let i = 0; i < logReturns.length; i++) {
    const x = logReturns[i];
    if (Number.isFinite(x)) { s += x; s2 += x * x; k++; }
    if (i >= n) {
      const y = logReturns[i - n];
      if (Number.isFinite(y)) { s -= y; s2 -= y * y; k--; }
    }
    if (i >= n - 1 && k >= need && k > 1) {
      const variance = Math.max(0, (s2 - (s * s) / k) / (k - 1));
      out[i] = Math.sqrt(variance * periodsPerYear) * 100;
    }
  }
  return out;
}

/** Simple moving average over `n` observations; null until the window is full. */
export function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let s = 0, k = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (Number.isFinite(x)) { s += x; k++; }
    if (i >= n) { const y = values[i - n]; if (Number.isFinite(y)) { s -= y; k--; } }
    if (i >= n - 1 && k === n) out[i] = s / n;
  }
  return out;
}

/** Pearson correlation of paired arrays (pairs with any non-finite member dropped). */
export function correlation(xs, ys) {
  const a = [], b = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    if (Number.isFinite(xs[i]) && Number.isFinite(ys[i])) { a.push(xs[i]); b.push(ys[i]); }
  }
  if (a.length < 3) return null;
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return saa && sbb ? sab / Math.sqrt(saa * sbb) : null;
}

/** Equal-width histogram over [lo, hi]; values outside are clamped into the end bins. */
export function histogram(xs, bins, lo, hi) {
  const counts = new Array(bins).fill(0);
  const w = (hi - lo) / bins;
  for (const x of xs) {
    if (!Number.isFinite(x)) continue;
    const i = Math.min(bins - 1, Math.max(0, Math.floor((x - lo) / w)));
    counts[i]++;
  }
  return counts.map((c, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: c }));
}

export const logReturn = (a, b) => (a > 0 && b > 0 ? Math.log(b / a) : null);
export const pctFromLog = r => (Number.isFinite(r) ? (Math.exp(r) - 1) * 100 : null);
