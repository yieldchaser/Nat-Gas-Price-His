// Number/date formatting. Every formatter returns '—' for missing values so
// the UI never prints NaN, Infinity or "null".

import { MONTHS } from '../lib/calendar.js?v=b09a9c5d5a';

export const DASH = '—';
const ok = v => typeof v === 'number' && Number.isFinite(v);

export function num(v, dp = 2) {
  return ok(v) ? v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : DASH;
}
export const signed = (v, dp = 2) => (ok(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), dp) : DASH);
export const pct = (v, dp = 1) => (ok(v) ? `${num(v, dp)}%` : DASH);
export const signedPct = (v, dp = 1) => (ok(v) ? `${signed(v, dp)}%` : DASH);
export const int = v => (ok(v) ? Math.round(v).toLocaleString('en-US') : DASH);

/** Price in market units, e.g. $3.169 / €31.42. */
export function price(v, market) {
  if (!ok(v)) return DASH;
  const m = market || { ccy: '$', dp: 3 };
  return `${m.ccy}${num(v, m.dp)}`;
}
export function signedPrice(v, market) {
  if (!ok(v)) return DASH;
  const m = market || { ccy: '$', dp: 3 };
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${m.ccy}${num(Math.abs(v), m.dp)}`;
}

export function ordinal(n) {
  if (!ok(n)) return DASH;
  const r = Math.round(n), s = ['th', 'st', 'nd', 'rd'], v = r % 100;
  return r + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** '2026-11-20' -> 'Nov 20, 2026' (or 'Nov 20' with short=true). */
export function date(iso, short = false) {
  if (!iso) return DASH;
  const [y, m, d] = iso.split('-').map(Number);
  return short ? `${MONTHS[m - 1]} ${d}` : `${MONTHS[m - 1]} ${d}, ${y}`;
}
export const monthYear = iso => (iso ? `${MONTHS[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}` : DASH);

export const toneOf = v => (ok(v) ? (v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat') : 'flat');

export function relativeAge(ms) {
  if (!ok(ms)) return DASH;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
