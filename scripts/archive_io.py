"""CSV archive helpers shared by the pipeline scripts.

The archive lives in ``data/database/<Market>/Monthwise/<MM_Mon>/<ticker>.csv``
with columns ``S No.,Date,Price,Contract ID``.  All writes go through
:func:`merge_rows`, which only ever adds or corrects dates — it never drops
history that is already archived.
"""

import csv
import json
import os

from datetime import date

from contract_calendar import CODES, contract_expiry, us_holidays

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = os.path.join(ROOT, 'data', 'database')
MARKET_DIRS = {'NG': os.path.join(DB, 'Henry Hub'), 'TG': os.path.join(DB, 'Dutch TTF')}
MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
FEED_PATH = os.path.join(ROOT, 'data', 'live_quotes.json')


def month_folder(code):
    i = CODES.index(code)
    return f'{i + 1:02d}_{MONTH_NAMES[i]}'


def csv_path(ticker):
    return os.path.join(MARKET_DIRS[ticker[:2]], 'Monthwise', month_folder(ticker[2]), f'{ticker.lower()}.csv')


def read_rows(path):
    """{date: price} for one contract CSV (empty dict if missing)."""
    rows = {}
    if not os.path.exists(path):
        return rows
    with open(path, newline='') as f:
        for r in csv.DictReader(f):
            try:
                px = float(r['Price'])
            except (KeyError, ValueError, TypeError):
                continue
            if px > 0 and r.get('Date'):
                rows[r['Date']] = px
    return rows


def write_rows(path, ticker, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['S No.', 'Date', 'Price', 'Contract ID'])
        for i, d in enumerate(sorted(rows), 1):
            w.writerow([i, d, round(rows[d], 4), ticker.lower()])


def is_session(ticker, iso):
    """True if ``iso`` can carry a genuine daily settlement for ``ticker``.

    Yahoo emits Sunday-evening bars (a copy of Friday's close) and bars on
    exchange holidays while Globex is open without a settlement.  Weekends are
    never sessions; for Henry Hub, NYMEX holidays from 2011 on are excluded
    too (the vendor-era archive legitimately traded some days that are
    holidays in today's calendar, so older rows are left alone).
    """
    d = date.fromisoformat(iso)
    if d.weekday() >= 5:
        return False
    if ticker.startswith('NG') and d.year >= 2011 and d in us_holidays(d.year):
        return False
    return True


def prune_nonsession(ticker):
    """Remove non-session rows from an archived CSV; returns rows removed."""
    path = csv_path(ticker)
    rows = read_rows(path)
    keep = {d: p for d, p in rows.items() if is_session(ticker, d)}
    if len(keep) != len(rows):
        write_rows(path, ticker, keep)
    return len(rows) - len(keep)


def merge_rows(ticker, new_rows, today, prefer_new=True):
    """Merge {date: price} into the archive CSV for ``ticker``.

    Rows dated after the contract's rule-based expiry or after ``today``, and
    rows on non-session dates (see :func:`is_session`), are ignored.  Returns (added, corrected) counts; writes only when something
    changed.
    """
    path = csv_path(ticker)
    archive = read_rows(path)
    limit = min(contract_expiry(ticker).isoformat(), today.isoformat())
    added = corrected = 0
    for d, px in new_rows.items():
        if d > limit or not px or px <= 0 or not is_session(ticker, d):
            continue
        px = round(float(px), 4)
        if d not in archive:
            archive[d] = px
            added += 1
        elif prefer_new and abs(archive[d] - px) > 1e-6:
            archive[d] = px
            corrected += 1
    if added or corrected:
        write_rows(path, ticker, archive)
    return added, corrected


def internal_ticker(feed_ticker):
    """'NGZ26.NYM' -> 'NGZ26', 'TTFZ26.NYM' -> 'TGZ26'; None for non-contracts."""
    if not feed_ticker.endswith('.NYM'):
        return None
    base = feed_ticker[:-4]
    if base.startswith('TTF'):
        base = 'TG' + base[3:]
    if len(base) == 5 and base[:2] in MARKET_DIRS and base[2] in CODES and base[3:].isdigit():
        return base
    return None


def feed_rows(payload):
    """{internal_ticker: {date: price}} from a live_quotes.json payload."""
    out = {}
    for ft, pts in (payload or {}).get('quotes', {}).items():
        t = internal_ticker(ft)
        if not t or not pts:
            continue
        out[t] = {p['date']: p['p'] for p in pts if p.get('date') and isinstance(p.get('p'), (int, float))}
    return out


def load_feed(path=FEED_PATH):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def archived_tickers(prefix):
    base = os.path.join(MARKET_DIRS[prefix], 'Monthwise')
    found = set()
    for folder in os.listdir(base):
        full = os.path.join(base, folder)
        if os.path.isdir(full):
            found.update(fn[:-4].upper() for fn in os.listdir(full) if fn.endswith('.csv'))
    return found
