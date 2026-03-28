#!/usr/bin/env python3
"""
Archive futures contract price history from Yahoo Finance into Cleaned_Database.

Each time a contract expires (or is about to), run this script to capture its
full price history before Yahoo eventually drops it.  After archiving, run
build_data.py to rebuild the dashboard JSON files.

Usage
-----
# Archive one or more tickers explicitly:
  python archive_contract.py NGK26
  python archive_contract.py NGK26 NGM26 NGN26
  python archive_contract.py TGK26 TGM26         # Dutch TTF

# Auto-detect HH contracts missing from Cleaned_Database (past ~2.5 years):
  python archive_contract.py --auto

# Archive and immediately rebuild JSON:
  python archive_contract.py --auto --rebuild

Ticker format
-------------
  HH  (NYMEX) :  NG{code}{yy}   e.g. NGK26  (April 2026 delivery)
  TTF (ICE)   :  TG{code}{yy}   e.g. TGK26  (April 2026 delivery)

Month codes: F=Jan G=Feb H=Mar J=Apr K=May M=Jun N=Jul Q=Aug U=Sep V=Oct X=Nov Z=Dec
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
from datetime import date

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MONTH_CODES = {
    'F': ('Jan', '01'), 'G': ('Feb', '02'), 'H': ('Mar', '03'),
    'J': ('Apr', '04'), 'K': ('May', '05'), 'M': ('Jun', '06'),
    'N': ('Jul', '07'), 'Q': ('Aug', '08'), 'U': ('Sep', '09'),
    'V': ('Oct', '10'), 'X': ('Nov', '11'), 'Z': ('Dec', '12'),
}

BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
HH_DIR      = os.path.join(BASE_DIR, 'Cleaned_Database', 'Henry Hub',  'Monthwise')
TTF_DIR     = os.path.join(BASE_DIR, 'Cleaned_Database', 'Dutch TTF',  'Monthwise')

# ---------------------------------------------------------------------------
# Yahoo Finance fetch (no external dependencies)
# ---------------------------------------------------------------------------

def _yahoo_fetch(yahoo_ticker: str, period: str = '2y') -> list[dict]:
    """Return list of {date, close} from Yahoo Finance v8 API."""
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


def _full_year(yy: str) -> int:
    y = int(yy)
    return 2000 + y if y < 50 else 1900 + y


# ---------------------------------------------------------------------------
# Archive individual contracts
# ---------------------------------------------------------------------------

def archive_hh(ticker: str) -> str:
    """Fetch NGK26-style ticker and write to HH Cleaned_Database. Returns CSV path."""
    ticker = ticker.upper()
    code, yy = ticker[2], ticker[3:]
    month_name, folder_name = _month_folder(code)
    csv_path = os.path.join(HH_DIR, folder_name, f'{ticker.lower()}.csv')

    if os.path.exists(csv_path):
        print(f'  {ticker}: already exists at {csv_path}  (use --force to overwrite)')
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
    code, yy = ticker[2], ticker[3:]
    month_name, folder_name = _month_folder(code)
    csv_path = os.path.join(TTF_DIR, folder_name, f'{ticker.lower()}.csv')

    if os.path.exists(csv_path):
        print(f'  {ticker}: already exists at {csv_path}  (use --force to overwrite)')
        return csv_path

    # Internal TGK26 → Yahoo TTFK26.NYM
    yahoo_ticker = 'TTF' + ticker[2:] + '.NYM'
    print(f'  Fetching {yahoo_ticker} ...', end=' ', flush=True)
    rows = _yahoo_fetch(yahoo_ticker)
    _write_csv(csv_path, ticker.lower(), rows)
    print(f'{len(rows)} days  ({rows[0]["date"]} → {rows[-1]["date"]})')
    return csv_path


# ---------------------------------------------------------------------------
# Auto-detection: find HH contracts that should exist but don't
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
    # Walk month by month across the window
    start_year  = today.year - int(years_back) - 1
    end_year    = today.year + int(years_forward) + 1
    code_by_month = {int(mn): code for code, (_, mn) in MONTH_CODES.items()}
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            expiry_approx = date(year, month, 1)   # first of delivery month ≈ expiry
            delta_years = (expiry_approx - today).days / 365.25
            if -years_back <= delta_years <= years_forward:
                code = code_by_month[month]
                yy = str(year % 100).zfill(2)
                tickers.add(f'NG{code}{yy}')
    return tickers


def auto_detect_missing_hh() -> list[str]:
    existing  = _existing_hh_tickers()
    expected  = _contracts_in_window()
    missing   = sorted(expected - existing, key=lambda t: (_full_year(t[3:]), list(MONTH_CODES).index(t[2])))
    return missing


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
    parser.add_argument('--rebuild', action='store_true',
                        help='Run build_data.py after archiving')
    parser.add_argument('--force',   action='store_true',
                        help='Overwrite existing CSV files')
    args = parser.parse_args()

    tickers = [t.upper() for t in args.tickers]

    if args.auto:
        missing = auto_detect_missing_hh()
        if missing:
            print(f'Auto-detected {len(missing)} missing HH contract(s):')
            for t in missing:
                code = t[2]
                month_name, _ = MONTH_CODES[code]
                year = _full_year(t[3:])
                print(f'  {t}  ({month_name} {year})')
            print()
        else:
            print('No missing HH contracts detected.')
        tickers = missing + [t for t in tickers if t not in missing]

    if not tickers:
        parser.print_help()
        sys.exit(0)

    archived = []
    errors   = []

    for ticker in tickers:
        try:
            if args.force:
                # Remove existing so archive_ functions don't skip
                for base_dir, prefix in [(HH_DIR, 'NG'), (TTF_DIR, 'TG')]:
                    if ticker.startswith(prefix):
                        code, yy = ticker[2], ticker[3:]
                        _, folder_name = _month_folder(code)
                        p = os.path.join(base_dir, folder_name, f'{ticker.lower()}.csv')
                        if os.path.exists(p):
                            os.remove(p)

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
        result = subprocess.run([sys.executable, os.path.join(BASE_DIR, 'build_data.py')],
                                cwd=BASE_DIR)
        if result.returncode != 0:
            print('build_data.py exited with errors.')
    elif archived:
        print()
        print('Next step:  python build_data.py')


if __name__ == '__main__':
    main()
