// NYMEX Henry Hub trading session (CME Globex), evaluated in New York time so
// it is right across US daylight-saving changes and in any viewer time zone.
//
// Globex gas trades Sunday 18:00 ET to Friday 17:00 ET with a daily break
// 17:00–18:00 ET. The trade date of an evening session (after 18:00 ET) is
// the next business day. Full NYMEX holidays are treated as closed.

import { addBusinessDays, isSession } from './calendar.js?v=b09a9c5d5a';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** New York calendar date, weekday and time for a UTC millisecond timestamp. */
export function nyParts(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const h = +p.hour % 24, m = +p.minute;
  return { date: `${p.year}-${p.month}-${p.day}`, dow: DOW[p.weekday], h, m, mins: h * 60 + m, time: `${String(h).padStart(2, '0')}:${p.minute}` };
}

/**
 * Session state at `ms`:
 *   open       Globex session in progress
 *   tradeDate  trade date that prices at this moment belong to
 *   settled    that trade date's settlement (14:30 ET) has passed
 */
export function marketSession(ms = Date.now()) {
  const p = nyParts(ms);
  let open;
  if (p.dow === 6) open = false;
  else if (p.dow === 0) open = p.mins >= 18 * 60;
  else if (p.dow === 5) open = p.mins < 17 * 60;
  else open = !(p.mins >= 17 * 60 && p.mins < 18 * 60);
  // Evening session (and the weekend) trades for the next business day.
  const evening = p.mins >= 18 * 60 || p.dow === 6 || p.dow === 0;
  const tradeDate = evening || !isSession('NG', p.date) ? addBusinessDays(p.date, 1, 'NG') : p.date;
  if (open && !isSession('NG', p.date) && p.dow !== 0) open = false;    // holiday
  const settled = !evening && p.mins >= 14 * 60 + 30 && isSession('NG', p.date);
  return { open, tradeDate, settled, ny: p };
}

/**
 * Classify the latest price of the feed.
 *   live   the market is open and the latest close belongs to the current
 *          trade date (an intraday, ~10-minute-delayed quote)
 *   close  anything else: the market is closed or the quote is a prior close
 * `stale` flags an open market whose feed has not updated for 45 minutes.
 */
export function priceState(lastDate, feedTs, nowMs = Date.now()) {
  const now = marketSession(nowMs);
  const atFeed = feedTs ? marketSession(feedTs) : null;
  const live = !!(now.open && atFeed && atFeed.open && lastDate === atFeed.tradeDate && lastDate === now.tradeDate && !atFeed.settled);
  const stale = !!(now.open && feedTs && nowMs - feedTs > 45 * 60 * 1000);
  return { live, stale, open: now.open, ny: now.ny };
}
