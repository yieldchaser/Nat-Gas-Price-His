// Contract calendar: month codes, exchange holidays, last trading days and
// business-day arithmetic. Mirrors scripts/contract_calendar.py; both are
// validated against the archive's last trading dates (see tests).
//
// All dates are ISO strings 'YYYY-MM-DD'. Internally we use UTC day numbers
// (days since 1970-01-01) so there is no time-zone ambiguity.

export const CODES = 'FGHJKMNQUVXZ';
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY = 86400000;
export const toDayNum = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / DAY;
export const fromDayNum = n => new Date(n * DAY).toISOString().slice(0, 10);
const ymd = (y, m, d) => Date.UTC(y, m - 1, d) / DAY;            // m is 1-based
const weekday = n => (new Date(n * DAY).getUTCDay() + 6) % 7;     // Mon=0 .. Sun=6
export const addDays = (iso, k) => fromDayNum(toDayNum(iso) + k);

/** 'NGZ26' | 'TTFZ26.NYM' | 'TGZ26' -> { prefix:'NG'|'TG', year, month (1-12) } */
export function parseTicker(ticker) {
  let t = String(ticker).toUpperCase().replace('.NYM', '');
  if (t.startsWith('TTF')) t = 'TG' + t.slice(3);
  const prefix = t.slice(0, 2);
  const month = CODES.indexOf(t[2]) + 1;
  const yy = parseInt(t.slice(3, 5), 10);
  if (month < 1 || !Number.isFinite(yy) || (prefix !== 'NG' && prefix !== 'TG')) return null;
  return { prefix, year: yy < 50 ? 2000 + yy : 1900 + yy, month };
}

export const makeTicker = (prefix, year, month) =>
  `${prefix}${CODES[month - 1]}${String(year % 100).padStart(2, '0')}`;

export const yahooSymbol = ticker =>
  (ticker.startsWith('TG') ? 'TTF' + ticker.slice(2) : ticker) + '.NYM';

export const contractLabel = ticker => {
  const p = parseTicker(ticker);
  return p ? `${MONTHS[p.month - 1]} ${p.year}` : ticker;
};

function nthWeekday(year, month, wd, n) {
  const first = ymd(year, month, 1);
  return first + ((wd - weekday(first) + 7) % 7) + 7 * (n - 1);
}
function lastWeekday(year, month, wd) {
  const last = ymd(year, month + 1, 1) - 1;
  return last - ((weekday(last) - wd + 7) % 7);
}
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}
const observed = n => (weekday(n) === 5 ? n - 1 : weekday(n) === 6 ? n + 1 : n);

const US_SPECIAL = ['2001-09-11', '2001-09-12', '2001-09-13', '2001-09-14', '2004-06-11', '2007-01-02'].map(toDayNum);
const UK_SPECIAL = ['2012-06-04', '2012-06-05', '2020-05-08', '2022-06-02', '2022-06-03', '2022-09-19', '2023-05-08'].map(toDayNum);
const UK_MOVED = new Set(['2012-05-28', '2020-05-04', '2022-05-30'].map(toDayNum));

const holidayCache = { NG: new Map(), TG: new Map() };

/** NYMEX (US) holidays relevant to NG expiry counting. See contract_calendar.py. */
export function usHolidays(year) {
  const c = holidayCache.NG.get(year);
  if (c) return c;
  const h = new Set();
  const nyd = ymd(year, 1, 1);
  if (weekday(nyd) === 6) h.add(nyd + 1); else if (weekday(nyd) < 5) h.add(nyd);
  if (year <= 2010 && weekday(ymd(year + 1, 1, 1)) === 5) h.add(ymd(year, 12, 31));
  h.add(nthWeekday(year, 1, 0, 3));
  h.add(nthWeekday(year, 2, 0, 3));
  h.add(easter(year) - 2);
  h.add(lastWeekday(year, 5, 0));
  if (year >= 2022) h.add(observed(ymd(year, 6, 19)));
  h.add(observed(ymd(year, 7, 4)));
  h.add(nthWeekday(year, 9, 0, 1));
  const thanks = nthWeekday(year, 11, 3, 4);
  h.add(thanks);
  if (year <= 2010) h.add(thanks + 1);
  h.add(observed(ymd(year, 12, 25)));
  US_SPECIAL.forEach(n => { if (fromDayNum(n).startsWith(String(year))) h.add(n); });
  holidayCache.NG.set(year, h);
  return h;
}

/** UK bank holidays (TTF expiry counting). */
export function ukHolidays(year) {
  const c = holidayCache.TG.get(year);
  if (c) return c;
  const e = easter(year);
  const h = new Set([e - 2, e + 1, nthWeekday(year, 5, 0, 1), lastWeekday(year, 5, 0), lastWeekday(year, 8, 0)]);
  const nyd = ymd(year, 1, 1);
  h.add(weekday(nyd) < 5 ? nyd : nyd + (7 - weekday(nyd)));
  const xmas = ymd(year, 12, 25);
  if (weekday(xmas) === 5) { h.add(xmas + 2); h.add(xmas + 3); }
  else if (weekday(xmas) === 6) { h.add(xmas + 1); h.add(xmas + 2); }
  else { h.add(xmas); const box = xmas + 1; h.add(weekday(box) < 5 ? box : box + 2); }
  UK_MOVED.forEach(n => h.delete(n));
  UK_SPECIAL.forEach(n => { if (fromDayNum(n).startsWith(String(year))) h.add(n); });
  holidayCache.TG.set(year, h);
  return h;
}

/**
 * market: 'NG' (NYMEX holidays), 'TG' (UK holidays) or 'WD' (plain weekdays).
 * 'WD' is used for lifecycle (T-day) alignment: it gives every session a
 * unique position even when a vendor-era session fell on a day that is a
 * holiday in today's calendar, and leaves holidays as gaps.
 */
export function isBusinessDayNum(n, market = 'NG') {
  if (weekday(n) >= 5) return false;
  if (market === 'WD') return true;
  const year = new Date(n * DAY).getUTCFullYear();
  return !(market === 'NG' ? usHolidays(year) : ukHolidays(year)).has(n);
}
export const isBusinessDay = (iso, market = 'NG') => isBusinessDayNum(toDayNum(iso), market);

/**
 * True if a daily close dated `iso` can be a genuine settlement (mirrors
 * archive_io.is_session): never weekends (Yahoo emits Sunday-evening bars that
 * copy Friday), and for Henry Hub not NYMEX holidays from 2011 on.
 */
export function isSession(prefix, iso) {
  const n = toDayNum(iso);
  if (weekday(n) >= 5) return false;
  const year = +iso.slice(0, 4);
  return !(prefix === 'NG' && year >= 2011 && usHolidays(year).has(n));
}

/** Rule-based last trading day (ISO) for an NG/TG ticker. */
export function contractExpiry(ticker) {
  const p = parseTicker(ticker);
  if (!p) return null;
  const lead = p.prefix === 'NG' ? 3 : 2;
  let n = ymd(p.year, p.month, 1), k = 0;
  while (k < lead) { n -= 1; if (isBusinessDayNum(n, p.prefix)) k += 1; }
  return fromDayNum(n);
}

/** True unless an HH contract predates the 3-business-day rule (Jun 1997). */
export function ruleApplies(ticker) {
  const p = parseTicker(ticker);
  return !(p && p.prefix === 'NG' && (p.year < 1997 || (p.year === 1997 && p.month < 6)));
}

// ── Business-day index: O(1) business-day distances ─────────────────────
// cum[i] = number of business days in [START, START+i]
const IDX_START = ymd(1988, 1, 1), IDX_END = ymd(2040, 12, 31);
const bdIndex = {};
function cumIndex(market) {
  if (bdIndex[market]) return bdIndex[market];
  const len = IDX_END - IDX_START + 1;
  const cum = new Int32Array(len);
  let c = 0;
  for (let i = 0; i < len; i++) { if (isBusinessDayNum(IDX_START + i, market)) c++; cum[i] = c; }
  return (bdIndex[market] = cum);
}

/**
 * Business days from `fromIso` (exclusive) to `toIso` (inclusive), i.e. the
 * number of trading sessions remaining after `fromIso` up to and including
 * `toIso`. Negative if toIso < fromIso. bdBetween(expiry, expiry) === 0.
 */
export function bdBetween(fromIso, toIso, market = 'NG') {
  const cum = cumIndex(market);
  const a = toDayNum(fromIso) - IDX_START, b = toDayNum(toIso) - IDX_START;
  if (a < 0 || b < 0 || a >= cum.length || b >= cum.length) {
    // Outside the index: approximate with weekdays (never used for real data).
    return Math.round((b - a) * 5 / 7);
  }
  return cum[b] - cum[a];
}

/** The `k`-th business day after `iso` (k may be negative). */
export function addBusinessDays(iso, k, market = 'NG') {
  let n = toDayNum(iso);
  const step = k >= 0 ? 1 : -1;
  let left = Math.abs(k);
  while (left > 0) { n += step; if (isBusinessDayNum(n, market)) left--; }
  return fromDayNum(n);
}
