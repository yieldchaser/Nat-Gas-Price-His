// Reference values computed independently with NumPy 1.x / SciPy:
//   x.std(ddof=1), np.quantile (linear), scipy.stats.skew/kurtosis(bias=False),
//   np.corrcoef, scipy.stats.percentileofscore(kind='mean').
import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../src/js/lib/stats.js';

const x = [0.5, -1.2, 3.3, 2.1, -0.7, 0.0, 4.4, -2.5, 1.1, 0.9];
const y = [1, 2, 0.5, 3, 2.2, 0.1, 4, -1, 2, 1.5];
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('stdev is the sample (n-1) estimator', () => close(S.stdev(x), 2.0781669273130534));
test('quantile matches numpy linear interpolation', () => {
  close(S.quantile(x, 0.25), -0.5249999999999999);
  close(S.quantile(x, 0.9), 3.4099999999999997);
  close(S.median([3, 1, 2, 4]), 2.5);
});
test('skew / excess kurtosis match scipy (bias=False)', () => {
  const m = S.moments(x);
  close(m.skew, 0.2757783928113074);
  close(m.kurt, -0.2361625786700352);
});
test('correlation matches numpy', () => close(S.correlation(x, y), 0.5923710269946456));
test('percentile rank uses mid-rank (scipy kind=mean)', () => {
  close(S.percentileRank(x, 1.1), 65);
  close(S.percentileRank(x, 0), 35);
  close(S.percentileRank([5, 5, 5], 5), 50);
});
test('annualised vol of log returns', () => {
  const px = [3.0, 3.1, 2.95, 3.2, 3.3, 3.15, 3.05, 3.4, 3.5, 3.45, 3.6, 3.55];
  const r = px.slice(1).map((p, i) => Math.log(p / px[i]));
  close(S.annualisedVol(r), 81.84752417291902, 1e-9);
});
test('rolling vol equals full-window vol and refuses sparse windows', () => {
  const r = [0.01, -0.02, 0.015, 0.0, -0.01, 0.02, 0.005, -0.004, 0.012, -0.007];
  const rv = S.rollingVol(r, 10);
  close(rv[9], S.annualisedVol(r), 1e-9);
  assert.equal(rv[8], null);
  const sparse = [0.01, null, null, null, 0.02, 0.01, null, 0.01, null, 0.0];
  assert.equal(S.rollingVol(sparse, 10)[9], null);   // 5/10 obs < 80%
});
test('functions never return NaN for degenerate input', () => {
  assert.equal(S.mean([]), null);
  assert.equal(S.stdev([1]), null);
  assert.equal(S.zScore([2, 2, 2], 3), null);       // zero dispersion
  assert.equal(S.percentileRank([], 1), null);
  assert.equal(S.mean([1, NaN, Infinity, 3]), 2);
});
test('sma and box stats', () => {
  assert.deepEqual(S.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const b = S.boxStats([1, 2, 3, 4, 5]);
  assert.equal(b.median, 3); assert.equal(b.p25, 2); assert.equal(b.pctPositive, 100);
});
test('histogram clamps outliers into end bins', () => {
  const h = S.histogram([-10, 0.1, 0.2, 10], 2, 0, 1);
  assert.deepEqual(h.map(b => b.count), [3, 1]);
});
