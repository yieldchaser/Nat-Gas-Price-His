#!/usr/bin/env python3
"""
Maintain the futures contract archive (data/database/*/Monthwise/*.csv).

Usage
-----
  python scripts/archive_contract.py NGK26 TGK26     # fetch & merge explicit tickers
  python scripts/archive_contract.py --update        # full maintenance run (CI)
  python scripts/archive_contract.py --update --no-network   # feed merge + rebuild only

``--update`` performs, in order:
  1. Merge every contract in data/live_quotes.json into the archive.  This needs
     no network access and guarantees that anything the hourly feed has seen is
     preserved even after Yahoo stops serving the contract.
  2. Fetch contracts in the trading window that have no CSV yet.
  3. Re-fetch *incomplete* expired contracts: expired within the last
     ~3 years but whose last archived date is before their last trading day.
     (The previous test, ``rows < 519``, missed contracts archived mid-life,
     which carry ~754 rows of pre-window history.)
  4. Rebuild the dashboard JSON (scripts/build_data.py).

Every write is a merge: archived rows are never deleted, rows after the
contract's expiry are never written.

Tickers: HH ``NG<code><yy>`` (Yahoo ``NG<code><yy>.NYM``);
         TTF ``TG<code><yy>`` (Yahoo ``TTF<code><yy>.NYM``).
"""

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from archive_io import (archived_tickers, csv_path, feed_rows, load_feed,  # noqa: E402
                        merge_rows, prune_nonsession, read_rows)
from contract_calendar import CODES, contract_expiry, parse_ticker  # noqa: E402

STALE_WINDOW_DAYS = 3 * 365
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))


class ContractNotAvailable(Exception):
    pass


def yahoo_symbol(ticker):
    return ('TTF' + ticker[2:] if ticker.startswith('TG') else ticker) + '.NYM'


def yahoo_fetch(symbol, period='3y'):
    url = ('https://query2.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(symbol)
           + f'?interval=1d&range={period}')
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; nat-gas-archive/2.0)'}
    payload = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as resp:
                payload = json.load(resp)
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise ContractNotAvailable(f'{symbol}: HTTP 404') from exc
            if attempt == 3:
                raise
        except Exception:
            if attempt == 3:
                raise
        time.sleep(2 ** attempt)
    result = (payload or {}).get('chart', {}).get('result')
    if not result:
        raise ContractNotAvailable(f'{symbol}: empty result')
    ts = result[0].get('timestamp') or []
    closes = result[0]['indicators']['quote'][0].get('close') or []
    return {datetime.fromtimestamp(t, timezone.utc).date().isoformat(): round(float(c), 4)
            for t, c in zip(ts, closes) if c is not None and c > 0}


def contracts_in_window(prefix, today, years_back=2.5, years_forward=0.5):
    out = set()
    for year in range(today.year - 4, today.year + 3):
        for m in range(1, 13):
            delta = (date(year, m, 1) - today).days / 365.25
            if -years_back <= delta <= years_forward:
                out.add(f'{prefix}{CODES[m - 1]}{year % 100:02d}')
    return out


def incomplete_expired(prefix, today):
    stale = []
    for t in archived_tickers(prefix):
        try:
            exp = contract_expiry(t)
        except (ValueError, IndexError):
            continue
        if exp >= today or (today - exp).days > STALE_WINDOW_DAYS:
            continue
        rows = read_rows(csv_path(t))
        if not rows or max(rows) < exp.isoformat():
            stale.append(t)
    return stale


def sort_key(t):
    return (t[:2],) + parse_ticker(t)[1:]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('tickers', nargs='*')
    ap.add_argument('--update', action='store_true', help='full maintenance run')
    ap.add_argument('--no-network', action='store_true', help='skip Yahoo fetches')
    ap.add_argument('--rebuild', action='store_true', help='run build_data.py afterwards')
    ap.add_argument('--today', default=date.today().isoformat())
    args = ap.parse_args()
    today = date.fromisoformat(args.today)
    changed = False

    if args.update:
        args.rebuild = True
        pruned = sum(prune_nonsession(t) for pre in ('NG', 'TG') for t in archived_tickers(pre))
        if pruned:
            changed = True
            print(f'Pruned {pruned} non-session (weekend/holiday) rows')
        feed = load_feed()
        if feed:
            n = 0
            for t, rows in feed_rows(feed).items():
                added, corrected = merge_rows(t, rows, today)
                if added or corrected:
                    n += 1
                    changed = True
                    print(f'  feed -> {t}: +{added} rows, {corrected} corrected')
            print(f'Feed merge: {n} contract file(s) changed')

    targets = [t.upper() for t in args.tickers]
    if args.update and not args.no_network:
        for prefix in ('NG', 'TG'):
            missing = sorted(contracts_in_window(prefix, today) - archived_tickers(prefix), key=sort_key)
            stale = sorted(incomplete_expired(prefix, today), key=sort_key)
            if missing:
                print(f'{prefix}: {len(missing)} missing in window: {" ".join(missing)}')
            if stale:
                print(f'{prefix}: {len(stale)} expired but incomplete: {" ".join(stale)}')
            targets += [t for t in missing + stale if t not in targets]

    errors = []
    for t in ([] if args.no_network else targets):
        sym = yahoo_symbol(t)
        try:
            rows = yahoo_fetch(sym)
        except ContractNotAvailable as exc:
            print(f'  skip {t}: {exc}')
            continue
        except Exception as exc:  # network / parsing failure
            print(f'  ERROR {t}: {exc}')
            errors.append(t)
            continue
        added, corrected = merge_rows(t, rows, today)
        changed |= bool(added or corrected)
        last = max(read_rows(csv_path(t)) or {'-': 0})
        print(f'  {t}: +{added} rows, {corrected} corrected (last {last}, expiry {contract_expiry(t)})')

    if args.rebuild and (changed or args.update):
        print('Rebuilding dashboard JSON ...')
        rc = subprocess.run([sys.executable, os.path.join(SCRIPTS_DIR, 'build_data.py'), '--skip-eia',
                             '--today', today.isoformat()]).returncode
        if rc:
            sys.exit(rc)
    if errors:
        print(f'Failed: {errors}')
        sys.exit(1)


if __name__ == '__main__':
    main()
