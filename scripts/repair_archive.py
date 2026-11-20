#!/usr/bin/env python3
"""
Backfill the contract archive from the git history of data/live_quotes.json.

Why this exists: the daily archiver used to re-fetch an expired contract only
when its CSV had < 519 rows.  A contract archived mid-life holds ~754 rows
(Yahoo's 3-year range), so it was never re-fetched and its final months were
lost (NGV26 stopped at 2026-04-06, NGX26 at 2026-05-01, several 2026 TTF
contracts at 2026-03-27).  The hourly live-quotes workflow committed every
quoted contract's daily closes, so the history of that file still holds them.

For each contract this script takes, per date, the value from the *newest*
feed snapshot containing that date (later snapshots supersede intraday values
captured earlier) and merges it into the Monthwise CSV via
``archive_io.merge_rows`` — rows are added or corrected, never removed, and
nothing dated after the contract's expiry is written.

Usage:
    python scripts/repair_archive.py            # dry run report
    python scripts/repair_archive.py --write    # apply
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from archive_io import ROOT, csv_path, feed_rows, is_session, merge_rows, read_rows  # noqa: E402
from contract_calendar import contract_expiry  # noqa: E402

FEED = 'data/live_quotes.json'


def feed_history_rows():
    """{ticker: {date: price}} with the newest snapshot winning per date."""
    shas = subprocess.run(['git', 'log', '--format=%H', '--', FEED], cwd=ROOT,
                          capture_output=True, text=True, check=True).stdout.split()
    out = {}
    for sha in shas:                      # newest first
        blob = subprocess.run(['git', 'show', f'{sha}:{FEED}'], cwd=ROOT, capture_output=True)
        if blob.returncode != 0:
            continue
        try:
            snapshot = feed_rows(json.loads(blob.stdout))
        except ValueError:
            continue
        for t, rows in snapshot.items():
            bucket = out.setdefault(t, {})
            for d, px in rows.items():
                bucket.setdefault(d, px)
    return out, len(shas)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--write', action='store_true', help='apply changes (default: dry run)')
    ap.add_argument('--today', default=date.today().isoformat(), help='reference date YYYY-MM-DD')
    args = ap.parse_args()
    today = date.fromisoformat(args.today)

    rows, n = feed_history_rows()
    print(f'Scanned {n} feed snapshots covering {len(rows)} contracts')
    changed = 0
    for t in sorted(rows):
        archive = read_rows(csv_path(t))
        limit = min(contract_expiry(t), today).isoformat()
        new = {d: p for d, p in rows[t].items()
               if d <= limit and is_session(t, d) and (d not in archive or abs(archive[d] - p) > 1e-6)}
        if not new:
            continue
        changed += 1
        last_before = max(archive) if archive else '-'
        print(f'  {t}: {len(new):4d} new/corrected rows (archive last {last_before}, expiry {contract_expiry(t)})')
        if args.write:
            merge_rows(t, new, today)
    print(f'{changed} contract file(s) {"updated" if args.write else "to update (dry run)"}')


if __name__ == '__main__':
    main()
