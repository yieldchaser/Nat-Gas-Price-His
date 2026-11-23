import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../../src/js/lib/calendar.js';

const root = new URL('../../', import.meta.url);
const fixture = JSON.parse(readFileSync(new URL('tests/fixtures/expiries.json', root)));

test('JS expiry rule reproduces the Python fixture exactly (1998-2035, NG & TG)', () => {
  const diffs = Object.entries(fixture).filter(([t, e]) => C.contractExpiry(t) !== e);
  assert.deepEqual(diffs, []);
});

test('parse / make tickers', () => {
  assert.deepEqual(C.parseTicker('TTFZ26.NYM'), { prefix: 'TG', year: 2026, month: 12 });
  assert.equal(C.makeTicker('NG', 2027, 1), 'NGF27');
  assert.equal(C.yahooSymbol('TGF27'), 'TTFF27.NYM');
  assert.equal(C.parseTicker('XXZ26'), null);
});

test('business-day distances', () => {
  // NGZ26 expires Wed 2026-11-25. From Fri 2026-11-20: Mon 23, Tue 24, Wed 25 → 3.
  assert.equal(C.bdBetween('2026-11-20', '2026-11-25'), 3);
  assert.equal(C.bdBetween('2026-11-25', '2026-11-25'), 0);
  // Thanksgiving (26 Nov) is skipped; Black Friday counts (post-2010).
  assert.equal(C.bdBetween('2026-11-25', '2026-11-30'), 2);
  assert.equal(C.bdBetween('2026-11-30', '2026-11-25'), -2);
  assert.equal(C.addBusinessDays('2026-11-25', 1), '2026-11-27');
  assert.equal(C.addBusinessDays('2026-11-30', -2), '2026-11-25');
});

test('expiry rule reproduces archived last trading days', () => {
  const hh = JSON.parse(readFileSync(new URL('data/hh.json', root)));
  let checked = 0, matched = 0;
  for (const [t, c] of Object.entries(hh.contracts)) {
    if (c.s !== 'settled' || !C.ruleApplies(t)) continue;
    checked++;
    if (C.contractExpiry(t) === c.x) matched++;
  }
  assert.ok(checked > 300);
  assert.ok(matched / checked >= 0.95, `${matched}/${checked}`);
});
