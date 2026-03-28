#!/usr/bin/env python3
"""
Archive futures contract price history from Yahoo Finance into Cleaned_Database.

Usage
-----
# Archive one or more tickers explicitly:
  python archive_contract.py NGK26
  python archive_contract.py NGK26 NGM26 NGN26
  python archive_contract.py TGK26 TGM26         # Dutch TTF

# Auto-detect HH contracts missing from Cleaned_Database (past ~2.5 years):
  python archive_contract.py --auto

# Full automated update (recommended for cron / CI):
#   - archives any missing contracts in the 2.5-year window
#   - re-fetches recently expired contracts that still have incomplete data
#   - rebuilds all dashboard JSON
  python archive_contract.py --update

# Archive and immediately rebuild JSON:
  python archive_contract.py --auto --rebuild

Ticker format
-------------
  HH  (NYMEX) :  NG{code}{yy}   e.g. NGK26  (April 2026 delivery)
  TTF (ICE)   :  TG{code}{yy}   e.g. TGK26  (April 2026 delivery)

Month codes: F=Jan G=Feb H=Mar J=Apr K=May M=Jun N=Jul Q=Aug U=Sep V=Oct X=Nov Z=Dec

Why --update / incomplete data
-------------------------------
Each contract trades for roughly 519 business days (~2.06 years).
Yahoo's `3y` range covers the full lifecycle.  But if a contract was
archived *before* it expired, the CSV only contains data up to that
day.  Once the contract expires Yahoo has the complete history; --update
detects these stale files and re-fetches them automatically.

Expiry rule (NYMEX HH): 3 business days before the 1st of the delivery month.
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MONTH_CODES = {
    'F': ('Jan', '01'), 'G': ('Feb', '02'), 'H': ('Mar', '03'),
    'J': ('Apr', '04'), 'K': ('May', '05'), 'M': ('Jun', '06'),
    'N': ('Jul', '07'), 'Q': ('Aug', '08'), 'U': ('Sep', '09'),
    'V': ('Oct', '10'), 'X': ('Nov', '11'), 'Z': ('Dec', '12'),
}

# A contract is considered "complete" when it has this many trading days.
# Historical database uses exactly 519; Yahoo returns up to this for expired contracts.
FULL_LIFECYCLE_DAYS = 519

# Re-check stale contracts only if they expired within this many calendar days.
# Beyond this window Yahoo will have dropped the data anyway.
STALE_WINDOW_DAYS = 3 * 365  # ~3 years

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HH_DIR   = os.path.join(BASE_DIR, 'Cleaned_Database', 'Henry Hub', 'Monthwise')
TTF_DIR  = os.path.join(BASE_DIR, 'Cleaned_Database', 'Dutch TTF', 'Monthwise')

# ---------------------------------------------------------------------------
# Date / expiry helpers
# ---------------------------------------------------------------------------

def _full_year(yy: str) -> int:
    y = int(yy)
    return 2000 + y if y < 50 else 1900 + y


def _contract_expiry(ticker: str) -> date:
    """
    Return the NYMEX expiry date for an HH contract.
    Rule: 3 business days before the 1st of the delivery month.
    """
    code = ticker[2].upper()
    yy   = ticker[3:]
    _, month_num = MONTH_CODES[code]
    month = int(month_num)
    year  = _full_year(yy)
    d = date(year, month, 1)
    biz = 3
    while biz > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:   # Mon–Fri
            biz -= 1
    return d


def _csv_row_count(path: str) -> int:
    """Count data rows (excluding the header line)."""
    with open(path, 'r') as f:
        return sum(1 for _ in f) - 1


# ---------------------------------------------------------------------------
# Yahoo Finance fetch (no external dependencies)
# ---------------------------------------------------------------------------

def _yahoo_fetch(yahoo_ticker: str, period: str = '3y') -> list[dict]:
    """
    Return list of {date, close} from Yahoo Finance v8 API.

    period='3y' covers ~756 trading days, well beyond the 519-day contract
    lifecycle.  Yahoo naturally caps the result at the contract's actual
    listing date, so expired contracts will return their full history.
    """
    url = (
        'https://query2.finance.yahoo.com/v8/finance/chart/'
        + urllib.parse.quote(yahoo_ticker)
        + f'?interval=1d&range={period}'
    )
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; archive_contract/1.0)'}

    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                payload = json.load(resp)
            break
        except Exception as exc:
            if attempt == 3:
                raise RuntimeError(f'Yahoo fetch failed for {yahoo_ticker}: {exc}') from exc
            wait = 2 ** attempt
            print(f'  retry in {wait}s ({exc})')
            time.sleep(wait)

    result = payload['chart']['result']
    if not result:
        raise RuntimeError(f'Yahoo returned no data for {yahoo_ticker}')

    timestamps = result[0]['timestamp']
    closes     = result[0]['indicators']['quote'][0]['close']

    rows = []
    for ts, close in zip(timestamps, closes):
        if close is None:
            continue
        rows.append({
            'date':  date.fromtimestamp(ts).isoformat(),
            'close': round(float(close), 4),
        })
    return rows


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _write_csv(path: str, ticker_lower: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['S No.', 'Date', 'Price', 'Contract ID'])
        for i, row in enumerate(rows, 1):
            w.writerow([i, row['date'], row['close'], ticker_lower])


def _month_folder(code: str) -> tuple[str, str]:
    """Return (month_name, 'MM_Mon') for a month code letter."""
    month_name, month_num = MONTH_CODES[code]
    return month_name, f'{month_num}_{month_name}'


# ---------------------------------------------------------------------------
# Archive individual contracts
# ---------------------------------------------------------------------------

def _remove_csv_if_exists(ticker: str) -> None:
    """Delete the existing CSV for ticker (HH or TTF) if present."""
    for base_dir, prefix in [(HH_DIR, 'NG'), (TTF_DIR, 'TG')]:
        if ticker.startswith(prefix):
            _, folder_name = _month_folder(ticker[2])
            p = os.path.join(base_dir, folder_name, f'{ticker.lower()}.csv')
            if os.path.exists(p):
                os.remove(p)


def archive_hh(ticker: str) -> str:
    """Fetch NGK26-style ticker and write to HH Cleaned_Database. Returns CSV path."""
    ticker = ticker.upper()
    _, folder_name = _month_folder(ticker[2])
    csv_path = os.path.join(HH_DIR, folder_name, f'{ticker.lower()}.csv')

    if os.path.exists(csv_path):
        print(f'  {ticker}: already exists ({_csv_row_count(csv_path)} rows)  — skipped')
        return csv_path

    yahoo_ticker = ticker + '.NYM'
    print(f'  Fetching {yahoo_ticker} ...', end=' ', flush=True)
    rows = _yahoo_fetch(yahoo_ticker)
    _write_csv(csv_path, ticker.lower(), rows)
    print(f'{len(rows)} days  ({rows[0]["date"]} → {rows[-1]["date"]})')
    return csv_path


def archive_ttf(ticker: str) -> str:
    """Fetch TGK26-style ticker and write to TTF Cleaned_Database. Returns CSV path."""
    ticker = ticker.upper()
    _, folder_name = _month_folder(ticker[2])
    csv_path = os.path.join(TTF_DIR, folder_name, f'{ticker.lower()}.csv')

    if os.path.exists(csv_path):
        print(f'  {ticker}: already exists ({_csv_row_count(csv_path)} rows)  — skipped')
        return csv_path

    # Internal TGK26 → Yahoo TTFK26.NYM
    yahoo_ticker = 'TTF' + ticker[2:] + '.NYM'
    print(f'  Fetching {yahoo_ticker} ...', end=' ', flush=True)
    rows = _yahoo_fetch(yahoo_ticker)
    _write_csv(csv_path, ticker.lower(), rows)
    print(f'{len(rows)} days  ({rows[0]["date"]} → {rows[-1]["date"]})')
    return csv_path


# ---------------------------------------------------------------------------
# Auto-detection: contracts missing from Cleaned_Database
# ---------------------------------------------------------------------------

def _existing_hh_tickers() -> set[str]:
    found = set()
    for month_dir in os.listdir(HH_DIR):
        full = os.path.join(HH_DIR, month_dir)
        if not os.path.isdir(full):
            continue
        for f in os.listdir(full):
            if f.endswith('.csv'):
                found.add(f.replace('.csv', '').upper())
    return found


def _contracts_in_window(years_back: float = 2.5, years_forward: float = 0.5) -> set[str]:
    """Return the set of HH monthly contracts within the trading window."""
    today = date.today()
    tickers = set()
    start_year    = today.year - int(years_back) - 1
    end_year      = today.year + int(years_forward) + 1
    code_by_month = {int(mn): code for code, (_, mn) in MONTH_CODES.items()}
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            expiry_approx = date(year, month, 1)
            delta_years = (expiry_approx - today).days / 365.25
            if -years_back <= delta_years <= years_forward:
                code = code_by_month[month]
                yy = str(year % 100).zfill(2)
                tickers.add(f'NG{code}{yy}')
    return tickers


def auto_detect_missing_hh() -> list[str]:
    existing = _existing_hh_tickers()
    expected = _contracts_in_window()
    missing  = sorted(
        expected - existing,
        key=lambda t: (_full_year(t[3:]), list(MONTH_CODES).index(t[2]))
    )
    return missing


# ---------------------------------------------------------------------------
# Stale detection: expired contracts archived before they had complete data
# ---------------------------------------------------------------------------

def find_stale_hh() -> list[str]:
    """
    Return HH tickers that:
      1. Have already expired (expiry < today)
      2. Are within Yahoo's history window (expired < STALE_WINDOW_DAYS ago)
      3. Have fewer than FULL_LIFECYCLE_DAYS rows in their CSV

    These were archived while the contract was still live, so they're missing
    the tail end of their price history.  Re-fetching after expiry gives the
    complete dataset.
    """
    today = date.today()
    stale = []

    for month_dir in os.listdir(HH_DIR):
        full = os.path.join(HH_DIR, month_dir)
        if not os.path.isdir(full):
            continue
        for f in os.listdir(full):
            if not f.endswith('.csv'):
                continue
            ticker = f.replace('.csv', '').upper()
            try:
                expiry = _contract_expiry(ticker)
            except (KeyError, ValueError):
                continue

            # Must be expired
            if expiry >= today:
                continue

            # Must be within Yahoo's retrievable window
            days_since_expiry = (today - expiry).days
            if days_since_expiry > STALE_WINDOW_DAYS:
                continue

            path = os.path.join(full, f)
            rows = _csv_row_count(path)
            if rows < FULL_LIFECYCLE_DAYS:
                stale.append(ticker)

    return sorted(stale, key=lambda t: (_full_year(t[3:]), list(MONTH_CODES).index(t[2])))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description='Archive futures price history from Yahoo Finance into Cleaned_Database.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument('tickers', nargs='*',
                        help='Tickers to archive, e.g. NGK26 NGM26 TGK26')
    parser.add_argument('--auto',    action='store_true',
                        help='Auto-detect missing HH contracts in the past ~2.5 years')
    parser.add_argument('--update',  action='store_true',
                        help='Full automated update: archive missing + refresh stale expired contracts')
    parser.add_argument('--rebuild', action='store_true',
                        help='Run build_data.py after archiving')
    parser.add_argument('--force',   action='store_true',
                        help='Overwrite existing CSV files (use with explicit tickers)')
    args = parser.parse_args()

    tickers = [t.upper() for t in args.tickers]

    # --update implies --auto + stale refresh + --rebuild
    if args.update:
        args.auto    = True
        args.rebuild = True

    # --- Step 1: auto-detect missing contracts ---
    if args.auto:
        missing = auto_detect_missing_hh()
        if missing:
            print(f'Auto-detected {len(missing)} missing HH contract(s):')
            for t in missing:
                month_name, _ = MONTH_CODES[t[2]]
                print(f'  {t}  ({month_name} {_full_year(t[3:])})')
            print()
        else:
            print('No missing HH contracts detected.')
        tickers = missing + [t for t in tickers if t not in missing]

    # --- Step 2 (--update only): find stale expired contracts ---
    force_tickers: set[str] = set()
    if args.force:
        force_tickers = set(tickers)

    if args.update:
        stale = find_stale_hh()
        if stale:
            print(f'Found {len(stale)} stale expired contract(s) to refresh:')
            for t in stale:
                expiry = _contract_expiry(t)
                csv_path_check = os.path.join(
                    HH_DIR, _month_folder(t[2])[1], f'{t.lower()}.csv'
                )
                rows = _csv_row_count(csv_path_check) if os.path.exists(csv_path_check) else 0
                print(f'  {t}  (expired {expiry}, {rows} rows → re-fetching)')
            print()
            # These need force-delete so archive_hh won't skip them
            force_tickers |= set(stale)
            # Prepend stale before other tickers (process them first)
            tickers = [t for t in stale if t not in tickers] + tickers
        else:
            print('All archived HH contracts have complete data.')

    if not tickers:
        parser.print_help()
        sys.exit(0)

    # --- Step 3: archive ---
    archived = []
    errors   = []

    for ticker in tickers:
        try:
            if ticker in force_tickers:
                _remove_csv_if_exists(ticker)

            if ticker.startswith('TG'):
                path = archive_ttf(ticker)
            else:
                path = archive_hh(ticker)
            archived.append(path)
        except Exception as exc:
            print(f'  ERROR {ticker}: {exc}')
            errors.append(ticker)

    print()
    print(f'Archived {len(archived)} contract(s).')
    if errors:
        print(f'Failed:  {errors}')

    if args.rebuild and archived:
        print()
        print('Rebuilding JSON (running build_data.py)...')
        result = subprocess.run(
            [sys.executable, os.path.join(BASE_DIR, 'build_data.py')],
            cwd=BASE_DIR,
        )
        if result.returncode != 0:
            print('build_data.py exited with errors.')
            sys.exit(1)
    elif archived and not args.rebuild:
        print()
        print('Next step:  python build_data.py')


if __name__ == '__main__':
    main()
