#!/usr/bin/env python3
"""
One-off / on-demand archive repair.

The daily archiver historically skipped contracts that were archived *before*
they expired: its "stale" test was ``rows < 519``, but Yahoo's 3-year range
returns ~754 rows for a live contract, so a contract archived mid-life was
never re-fetched and its final months of trading were lost (e.g. NGV26 ended
at 2026-04-06, NGX26 at 2026-05-01, several 2026 TTF contracts at 2026-03-27).

The hourly live-quotes workflow committed every contract's daily closes to
``data/live_quotes.json``.  Its git history therefore still holds the missing
tails.  This script walks that history and **adds** any (date, close) rows that
the Monthwise CSV archive lacks.  Where both hold a date and disagree, the feed
value wins: the archive's final row for a contract archived mid-life is an
intraday snapshot, whereas later feed snapshots carry the settled close.

Sources, in order of preference for a date that is missing from the archive:
  1. the newest commit of live_quotes.json that contains the date
     (newer snapshots supersede intraday values captured earlier that day)
  2. the legacy ``Yearwise`` CSV mirror (only rows absent from Monthwise)

Usage:
    python scripts/repair_archive.py            # dry run, prints a report
    python scripts/repair_archive.py --write    # apply changes to CSVs
"""

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract_calendar import contract_expiry, parse_ticker  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = os.path.join(ROOT, 'data', 'database')
MARKETS = {
    'NG': os.path.join(DB, 'Henry Hub'),
    'TG': os.path.join(DB, 'Dutch TTF'),
}
CODES = 'FGHJKMNQUVXZ'
MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
FEED = 'data/live_quotes.json'


def month_folder(code):
    i = CODES.index(code)
    return f'{i + 1:02d}_{MONTH_NAMES[i]}'


def csv_path(ticker):
    prefix, code = ticker[:2], ticker[2]
    return os.path.join(MARKETS[prefix], 'Monthwise', month_folder(code), f'{ticker.lower()}.csv')


def read_csv(path):
    rows = {}
    if not os.path.exists(path):
        return rows
    with open(path, newline='') as f:
        for r in csv.DictReader(f):
            try:
                rows[r['Date']] = float(r['Price'])
            except (KeyError, ValueError):
                continue
    return rows


def write_csv(path, ticker, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['S No.', 'Date', 'Price', 'Contract ID'])
        for i, d in enumerate(sorted(rows), 1):
            w.writerow([i, d, rows[d], ticker.lower()])


def internal_ticker(feed_ticker):
    """NGZ26.NYM -> NGZ26, TTFZ26.NYM -> TGZ26, anything else -> None."""
    if not feed_ticker.endswith('.NYM'):
        return None
    base = feed_ticker[:-4]
    if base.startswith('TTF'):
        base = 'TG' + base[3:]
    if len(base) == 5 and base[:2] in MARKETS and base[2] in CODES and base[3:].isdigit():
        return base
    return None


def feed_history():
    """Yield (commit, quotes) newest first for every commit touching the feed."""
    commits = subprocess.run(
        ['git', 'log', '--format=%H', '--', FEED], cwd=ROOT,
        capture_output=True, text=True, check=True,
    ).stdout.split()
    for sha in commits:
        blob = subprocess.run(['git', 'show', f'{sha}:{FEED}'], cwd=ROOT, capture_output=True)
        if blob.returncode != 0:
            continue
        try:
            payload = json.loads(blob.stdout)
        except ValueError:
            continue
        yield sha, payload.get('quotes', {})


def collect_feed_rows():
    """ticker -> {date: price}, keeping the newest snapshot's value per date."""
    out = {}
    n = 0
    for _sha, quotes in feed_history():
        n += 1
        for ft, pts in quotes.items():
            t = internal_ticker(ft)
            if not t or not pts:
                continue
            bucket = out.setdefault(t, {})
            for p in pts:
                d, px = p.get('date'), p.get('p')
                if d and isinstance(px, (int, float)) and px > 0 and d not in bucket:
                    bucket[d] = round(float(px), 4)
    return out, n


def collect_yearwise_rows():
    out = {}
    for prefix, base in MARKETS.items():
        yw = os.path.join(base, 'Yearwise')
        if not os.path.isdir(yw):
            continue
        for yr in os.listdir(yw):
            folder = os.path.join(yw, yr)
            if not os.path.isdir(folder):
                continue
            for fn in os.listdir(folder):
                if fn.endswith('.csv'):
                    t = fn[:-4].upper()
                    out.setdefault(t, {}).update(read_csv(os.path.join(folder, fn)))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--write', action='store_true', help='apply changes (default: dry run)')
    ap.add_argument('--today', default=date.today().isoformat(), help='reference date (YYYY-MM-DD)')
    args = ap.parse_args()
    today = date.fromisoformat(args.today)

    feed, n_commits = collect_feed_rows()
    yearwise = collect_yearwise_rows()
    print(f'Scanned {n_commits} feed snapshots, {len(feed)} contracts; Yearwise mirror: {len(yearwise)} contracts')

    changed = 0
    mismatches = []
    for ticker in sorted(set(feed) | set(yearwise), key=lambda t: (t[:2], parse_ticker(t)[1:])):
        path = csv_path(ticker)
        archive = read_csv(path)
        expiry = contract_expiry(ticker)
        # Never add rows dated after the contract's last trading day (those are
        # fill-forward artefacts in some vendor histories).
        def admissible(d):
            return d <= expiry.isoformat() and d <= today.isoformat()

        additions = {}
        for source in (feed.get(ticker, {}), yearwise.get(ticker, {})):
            for d, px in source.items():
                if not admissible(d):
                    continue
                if d in archive:
                    if source is feed.get(ticker) and abs(archive[d] - px) > 1e-6:
                        mismatches.append((ticker, d, archive[d], px))
                        additions[d] = px
                    continue
                additions.setdefault(d, px)
        if not additions:
            continue
        changed += 1
        before_last = max(archive) if archive else '—'
        merged = {**archive, **additions}
        print(f'  {ticker}: +{len(additions):4d} rows  (archive last {before_last} -> {max(merged)}; '
              f'expiry {expiry.isoformat()})')
        if args.write:
            write_csv(path, ticker, merged)

    if mismatches:
        print(f'\n{len(mismatches)} overlapping dates where feed and archive disagree (feed value used):')
        for m in mismatches[:15]:
            print('   ', m)
    print(f'\n{changed} contract file(s) {"updated" if args.write else "would be updated (dry run)"}.')


if __name__ == '__main__':
    main()
