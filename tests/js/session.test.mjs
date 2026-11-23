import test from 'node:test';
import assert from 'node:assert/strict';
import { marketSession, nyParts, priceState } from '../../src/js/lib/session.js';

const ms = iso => Date.parse(iso);

test('New York time handles daylight saving', () => {
  assert.equal(nyParts(ms('2026-11-23T15:00:00Z')).time, '10:00');   // EST (UTC-5)
  assert.equal(nyParts(ms('2026-07-15T15:00:00Z')).time, '11:00');   // EDT (UTC-4)
});

test('Globex session boundaries', () => {
  assert.equal(marketSession(ms('2026-11-23T15:00:00Z')).open, true);    // Mon 10:00 ET
  assert.equal(marketSession(ms('2026-11-23T22:30:00Z')).open, false);   // Mon 17:30 ET break
  assert.equal(marketSession(ms('2026-11-23T23:30:00Z')).open, true);    // Mon 18:30 ET evening
  assert.equal(marketSession(ms('2026-11-28T15:00:00Z')).open, false);   // Saturday
  assert.equal(marketSession(ms('2026-11-29T22:30:00Z')).open, false);   // Sun 17:30 ET
  assert.equal(marketSession(ms('2026-11-29T23:30:00Z')).open, true);    // Sun 18:30 ET
  assert.equal(marketSession(ms('2026-11-27T22:30:00Z')).open, false);   // Fri 17:30 ET
  assert.equal(marketSession(ms('2026-11-26T16:00:00Z')).open, false);   // Thanksgiving
  assert.equal(marketSession(ms('2027-01-01T16:00:00Z')).open, false);   // New Year (rolls into 2027 cleanly)
});

test('trade date of evening and weekend sessions is the next business day', () => {
  assert.equal(marketSession(ms('2026-11-23T23:30:00Z')).tradeDate, '2026-11-24');
  assert.equal(marketSession(ms('2026-11-29T23:30:00Z')).tradeDate, '2026-11-30');
  assert.equal(marketSession(ms('2026-12-31T23:30:00Z')).tradeDate, '2027-01-04');   // year roll
  assert.equal(marketSession(ms('2026-11-23T15:00:00Z')).tradeDate, '2026-11-23');
});

test('price state: live intraday vs close', () => {
  const feed = ms('2026-11-23T15:40:00Z');                           // Mon 10:40 ET
  assert.equal(priceState('2026-11-23', feed, ms('2026-11-23T15:45:00Z')).live, true);
  assert.equal(priceState('2026-11-20', feed, ms('2026-11-23T15:45:00Z')).live, false);   // prior close
  assert.equal(priceState('2026-11-27', ms('2026-11-27T21:00:00Z'), ms('2026-11-28T15:00:00Z')).live, false); // weekend
  const st = priceState('2026-11-23', feed, ms('2026-11-23T17:00:00Z'));                // 80 min later
  assert.equal(st.stale, true);
});
