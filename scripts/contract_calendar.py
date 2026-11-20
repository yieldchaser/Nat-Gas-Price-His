"""
Contract calendar shared by the data pipeline scripts.

Mirrors ``src/js/lib/calendar.js`` (the browser implementation).  Both are
validated against the last trading dates actually present in the archive by
``tests/test_pipeline.py`` and ``tests/js/calendar.test.mjs``.

Henry Hub (NYMEX NG)
    Trading terminates 3 business days before the first calendar day of the
    delivery month.  Business days exclude weekends and NYMEX holidays.  The
    archive shows the Friday after Thanksgiving was *not* counted as a
    business day for December expiries up to 2010 but has been since (every
    Yahoo-era December contract, e.g. NGZ24 -> 2024-11-26, NGZ25 -> 2025-11-25).
    Up to 2010, when New Year's Day fell on a Saturday the preceding Friday
    was a holiday (NGF00/NGF05/NGF11 expired on 28 Dec); in 2021 it was not
    (NGF22 expired 29 Dec).  Before the June-1997 contract the
    exchange used a longer lead time; for those contracts the last date in the
    archive is authoritative.

Dutch TTF (NYMEX TTF, Yahoo ``TTF<code><yy>.NYM``)
    Trading terminates 2 business days before the first calendar day of the
    delivery month (validated against the archive; holiday treatment follows
    the UK calendar, approximated here by weekends + Christmas/New Year/
    Good Friday/Easter Monday).
"""

from datetime import date, timedelta
from functools import lru_cache

CODES = 'FGHJKMNQUVXZ'


def parse_ticker(ticker):
    """'NGZ26' -> ('NG', 2026, 12). Two-digit years < 50 are 20xx."""
    t = ticker.upper().replace('.NYM', '')
    if t.startswith('TTF'):
        t = 'TG' + t[3:]
    prefix, code, yy = t[:2], t[2], int(t[3:5])
    year = 2000 + yy if yy < 50 else 1900 + yy
    return prefix, year, CODES.index(code) + 1


def _nth_weekday(year, month, weekday, n):
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def _last_weekday(year, month, weekday):
    d = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _easter(year):
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _observed(d):
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


# Unscheduled NYMEX closures that fall inside expiry windows.
SPECIAL_CLOSURES = {
    date(2001, 9, 11), date(2001, 9, 12), date(2001, 9, 13), date(2001, 9, 14),
    date(2004, 6, 11), date(2007, 1, 2),
}

# One-off UK bank holidays (moved or added) that can fall in TTF expiry windows.
UK_SPECIAL = {
    date(2012, 6, 4), date(2012, 6, 5), date(2020, 5, 8), date(2022, 6, 2),
    date(2022, 6, 3), date(2022, 9, 19), date(2023, 5, 8),
}
UK_MOVED = {date(2012, 5, 28), date(2020, 5, 4), date(2022, 5, 30)}  # replaced by the above


@lru_cache(maxsize=None)
def us_holidays(year):
    h = set()
    nyd = date(year, 1, 1)
    if nyd.weekday() == 6:
        h.add(nyd + timedelta(days=1))
    elif nyd.weekday() < 5:
        h.add(nyd)
    if year <= 2010 and date(year + 1, 1, 1).weekday() == 5:   # Sat New Year -> Fri 31 Dec
        h.add(date(year, 12, 31))
    h.add(_nth_weekday(year, 1, 0, 3))          # MLK day
    h.add(_nth_weekday(year, 2, 0, 3))          # Presidents' day
    h.add(_easter(year) - timedelta(days=2))    # Good Friday
    h.add(_last_weekday(year, 5, 0))            # Memorial day
    if year >= 2022:
        h.add(_observed(date(year, 6, 19)))     # Juneteenth
    h.add(_observed(date(year, 7, 4)))
    h.add(_nth_weekday(year, 9, 0, 1))          # Labor day
    thanks = _nth_weekday(year, 11, 3, 4)
    h.add(thanks)
    if year <= 2010:
        h.add(thanks + timedelta(days=1))       # see module docstring
    h.add(_observed(date(year, 12, 25)))
    h.update(d for d in SPECIAL_CLOSURES if d.year == year)
    return frozenset(h)


@lru_cache(maxsize=None)
def uk_holidays(year):
    e = _easter(year)
    h = {e - timedelta(days=2), e + timedelta(days=1)}
    h.add(_nth_weekday(year, 5, 0, 1))          # Early May bank holiday
    h.add(_last_weekday(year, 5, 0))            # Spring bank holiday
    h.add(_last_weekday(year, 8, 0))            # Summer bank holiday
    nyd = date(year, 1, 1)
    h.add(nyd if nyd.weekday() < 5 else nyd + timedelta(days=7 - nyd.weekday()))
    xmas, boxing = date(year, 12, 25), date(year, 12, 26)
    if xmas.weekday() == 5:
        h.update({date(year, 12, 27), date(year, 12, 28)})
    elif xmas.weekday() == 6:
        h.update({date(year, 12, 26), date(year, 12, 27)})
    else:
        h.add(xmas)
        h.add(boxing if boxing.weekday() < 5 else boxing + timedelta(days=2))
    h -= UK_MOVED
    h.update(d for d in UK_SPECIAL if d.year == year)
    return frozenset(h)


def is_business_day(d, market='NG'):
    if d.weekday() >= 5:
        return False
    hol = us_holidays(d.year) if market == 'NG' else uk_holidays(d.year)
    return d not in hol


def contract_expiry(ticker):
    """Rule-based last trading day for an NG or TG ticker."""
    prefix, year, month = parse_ticker(ticker)
    lead = 3 if prefix == 'NG' else 2
    d = date(year, month, 1)
    n = 0
    while n < lead:
        d -= timedelta(days=1)
        if is_business_day(d, prefix):
            n += 1
    return d


def rule_applies(ticker):
    """False for HH contracts that predate the current 3-business-day rule."""
    prefix, year, month = parse_ticker(ticker)
    return not (prefix == 'NG' and (year, month) < (1997, 6))
