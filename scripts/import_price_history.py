#!/usr/bin/env python3
"""
Import contract price-history CSVs (e.g. Barchart "Download" exports) into the
archive, with validation.

Barchart's NG/TG histories are the same series as the archive: the exports in
this repo (tgz25_price-history-04-06-2026.csv, ngz25_price-history-03-27-2026.csv)
match archived closes on 519/519 days exactly.  That makes them a safe way to
fill gaps the automated Yahoo feed can no longer serve, such as the final weeks
of TGJ26-TGN26.

Usage
-----
  python scripts/import_price_history.py data/imports/*.csv          # merge
  python scripts/import_price_history.py --dry-run file.csv           # report only
  python scripts/import_price_history.py --ticker TGK26 export.csv    # name not parseable

Files placed in data/imports/ are imported automatically by the daily archive
workflow (archive_contract.py --update) and moved to data/imports/done/.

Accepted formats (header detected automatically):
  Barchart:  Time,Open,High,Low,Latest,Change,%Change,Volume,"Open Int"
  Generic:   Date,Close   (or Date,Price / Date,Settle)

Ticker: taken from the file name ("tgk26_price-history-....csv", "TGK26.csv",
"TTFK26.NYM.csv") unless --ticker is given.

Safety checks (the file is rejected unless --force):
  * on dates already in the archive, at least 95% must agree within 0.5%
    (catches a file for the wrong contract or in different units);
  * a file that shares no dates with an existing archive is accepted only when
    it extends it contiguously (first new date within 10 days of the archive),
    or when every new row is corroborated by a neighbouring delivery month
    (up to 3 months away) trading within 2% of it on the same day — this admits
    an isolated final settlement after a gap without trusting it blindly.
Rows after the contract's last trading day and on weekends/holidays are never
written (archive_io.merge_rows).
"""

import argparse
import csv
import os
import re
import shutil
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from archive_io import ROOT, csv_path, is_session, merge_rows, read_rows  # noqa: E402
from contract_calendar import CODES, contract_expiry  # noqa: E402

IMPORT_DIR = os.path.join(ROOT, 'data', 'imports')
DATE_COLS = ('time', 'date', 'trade date', 'timestamp')
PRICE_COLS = ('latest', 'close', 'settle', 'settlement', 'price', 'last')


def ticker_from_name(path):
    name = os.path.basename(path).upper()
    m = re.match(r'(?:TTF|TG|NG)([FGHJKMNQUVXZ])(\d{2})', name.replace('TTF', 'TG', 1) if name.startswith('TTF') else name)
    if not m:
        return None
    prefix = 'TG' if name.startswith(('TG', 'TTF')) else 'NG'
    return f'{prefix}{m.group(1)}{m.group(2)}'


def parse_file(path):
    """{date: price} from a Barchart or generic CSV; ignores footer lines."""
    with open(path, newline='', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = [h.strip().lower() for h in next(reader)]
        di = next((i for i, h in enumerate(header) if h in DATE_COLS), None)
        pi = next((i for i, h in enumerate(header) if h in PRICE_COLS), None)
        if di is None or pi is None:
            raise ValueError(f'{path}: need a date column {DATE_COLS} and a price column {PRICE_COLS}; got {header}')
        out = {}
        for row in reader:
            if len(row) <= max(di, pi):
                continue
            d = row[di].strip()[:10]
            if not re.match(r'\d{4}-\d{2}-\d{2}$', d):
                m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})$', row[di].strip())   # MM/DD/YYYY
                if not m:
                    continue
                d = f'{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}'
            try:
                px = float(row[pi].replace(',', ''))
            except ValueError:
                continue
            if px > 0:
                out[d] = round(px, 4)
    return out


def neighbour_check(ticker, rows, tolerance=0.02):
    """(ok, reason): each row within `tolerance` of an adjacent month's close that day."""
    prefix, code, yy = ticker[:2], ticker[2], int(ticker[3:5])
    idx = CODES.index(code)
    neighbours = []
    for k in (1, -1, 2, -2, 3, -3):
        j, y = idx + k, yy
        if j > 11:
            j, y = j - 12, y + 1
        elif j < 0:
            j, y = j + 12, y - 1
        neighbours.append(f'{prefix}{CODES[j]}{y % 100:02d}')
    archives = {n: read_rows(csv_path(n)) for n in neighbours}
    notes = []
    for d, px in sorted(rows.items()):
        best = min(((abs(px / a[d] - 1), n) for n, a in archives.items() if d in a), default=None)
        if best is None or best[0] > tolerance:
            return False, f'{d}: no neighbouring month within {tolerance:.0%}'
        notes.append(f'{d} {px} vs {best[1]} {archives[best[1]][d]} ({best[0]:.2%})')
    return True, 'corroborated by neighbouring months: ' + '; '.join(notes)


def validate(ticker, rows, archive):
    common = sorted(set(rows) & set(archive))
    if common:
        agree = sum(abs(rows[d] / archive[d] - 1) <= 0.005 for d in common)
        ok = agree / len(common) >= 0.95
        return ok, f'{agree}/{len(common)} overlapping closes agree within 0.5%'
    if not archive:
        return True, 'no archived history yet'
    new_first = min(d for d in rows if d not in archive)
    gap = (date.fromisoformat(new_first) - date.fromisoformat(max(archive))).days
    if 0 < gap <= 10:
        return True, f'no overlap; first new date {new_first} is {gap} days after archive end {max(archive)}'
    ok, why = neighbour_check(ticker, rows)
    return ok, f'no overlap, {gap}-day gap after archive end {max(archive)}; {why}'


def import_file(path, ticker=None, dry_run=False, force=False, today=None):
    today = today or date.today()
    ticker = (ticker or ticker_from_name(path) or '').upper()
    if len(ticker) != 5 or ticker[:2] not in ('NG', 'TG') or ticker[2] not in CODES:
        raise ValueError(f'{path}: cannot determine ticker; pass --ticker')
    rows = parse_file(path)
    if not rows:
        raise ValueError(f'{path}: no price rows found')
    archive = read_rows(csv_path(ticker))
    ok, why = validate(ticker, rows, archive)
    limit = min(contract_expiry(ticker), today).isoformat()
    new = {d: p for d, p in rows.items() if d not in archive and d <= limit and is_session(ticker, d)}
    status = 'OK' if ok else ('FORCED' if force else 'REJECTED')
    print(f'{os.path.basename(path)} -> {ticker}: {len(rows)} rows, {len(new)} new '
          f'({min(new) if new else "-"} .. {max(new) if new else "-"}); {why} [{status}]')
    if (not ok and not force) or dry_run:
        return 0 if not ok and not force else len(new)
    added, _ = merge_rows(ticker, new, today, prefer_new=False)
    after = read_rows(csv_path(ticker))
    exp = contract_expiry(ticker).isoformat()
    note = 'now reaches its last trading day' if max(after) == exp else f'last date {max(after)}, expiry {exp}'
    print(f'   merged {added} rows; {ticker} {note}')
    return added


def import_drop_folder(today=None):
    """Import every CSV in data/imports/ and move processed files to done/ (rejected ones to rejected/)."""
    if not os.path.isdir(IMPORT_DIR):
        return 0
    total = 0
    for fn in sorted(os.listdir(IMPORT_DIR)):
        path = os.path.join(IMPORT_DIR, fn)
        if not fn.lower().endswith('.csv') or not os.path.isfile(path):
            continue
        try:
            rows = parse_file(path)
            t = ticker_from_name(path)
            ok, _ = validate(t, rows, read_rows(csv_path(t))) if t else (False, '')
            n = import_file(path, today=today)
            dest = 'done' if ok else 'rejected'
            total += n
        except ValueError as exc:
            print(f'   {exc}')
            dest = 'rejected'
        os.makedirs(os.path.join(IMPORT_DIR, dest), exist_ok=True)
        shutil.move(path, os.path.join(IMPORT_DIR, dest, fn))
    return total


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('files', nargs='+')
    ap.add_argument('--ticker', help='contract ticker if not in the file name, e.g. TGK26')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--force', action='store_true', help='import even if validation fails')
    args = ap.parse_args()
    for f in args.files:
        import_file(f, ticker=args.ticker, dry_run=args.dry_run, force=args.force)


if __name__ == '__main__':
    main()
