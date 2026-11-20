#!/usr/bin/env python3
"""
Build data/fx_eurusd.json: a daily EURUSD history (USD per EUR) from 1999 on,
merged from three independent sources with a per-date source code.

Priority on each date (first available wins):
  Y  Yahoo Finance EURUSD=X daily close   (maintained by fetch_live_quotes.py)
  F  Federal Reserve H.10 noon buying rate in New York (FRED series DEXUSEU)
  E  ECB euro foreign exchange reference rate (14:15 CET)

Yahoo is preferred because it is what the live feed uses, so recent and
historical conversions are consistent.  FRED's New York noon fix is next: it
is closest in time to the NYMEX TTF settlement (London afternoon).  ECB fills
the remaining days (US holidays).  On overlapping dates the three agree to a
median of 0.12-0.18% (timing differences within the day) — see
`--compare`.

Sources (first reachable URL is used):
  FRED  https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXUSEU
        mirror: https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv
  ECB   https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip
        or a local copy passed with --ecb-zip (e.g. the file bundled in the
        CurrencyConverter package on PyPI)
"""

import argparse
import csv
import io
import json
import os
import statistics
import sys
import urllib.request
import zipfile
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'data', 'fx_eurusd.json')
UA = {'User-Agent': 'nat-gas-dashboard/2.0 (fx history builder)'}

FRED_URLS = [
    ('fred', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DEXUSEU'),
    ('mirror', 'https://raw.githubusercontent.com/datasets/exchange-rates/main/data/daily.csv'),
]
ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip'


def _get(url, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def load_fred():
    for kind, url in FRED_URLS:
        try:
            raw = _get(url).decode('utf-8')
        except Exception as exc:  # pragma: no cover - network
            print(f'  FRED source unavailable ({url}): {exc}')
            continue
        out = {}
        rows = csv.reader(io.StringIO(raw))
        header = next(rows)
        if kind == 'fred':                      # DATE,DEXUSEU  (USD per EUR, '.' = missing)
            for d, v in rows:
                if v not in ('', '.'):
                    out[d] = float(v)
        else:                                   # Date,Country,Exchange rate (EUR per USD)
            for d, country, v in rows:
                if country == 'Euro' and v not in ('', '0'):
                    out[d] = round(1 / float(v), 6)
        print(f'  FRED ({kind}): {len(out)} days {min(out)} -> {max(out)}')
        return out, url
    return {}, None


def load_ecb(local_zip=None):
    blob = None
    if local_zip:
        with open(local_zip, 'rb') as f:
            blob = f.read()
        src = local_zip
    else:
        try:
            blob = _get(ECB_URL)
            src = ECB_URL
        except Exception as exc:  # pragma: no cover - network
            print(f'  ECB source unavailable: {exc}')
            return {}, None
    z = zipfile.ZipFile(io.BytesIO(blob))
    rows = list(csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding='utf-8')))
    i = [h.strip() for h in rows[0]].index('USD')
    out = {r[0]: float(r[i]) for r in rows[1:] if len(r) > i and r[i] not in ('N/A', '')}
    print(f'  ECB: {len(out)} days {min(out)} -> {max(out)}')
    return out, src


def load_existing():
    if not os.path.exists(OUT):
        return {}, {}
    with open(OUT) as f:
        old = json.load(f)
    dates, rate = old.get('dates', []), old.get('rate', [])
    src = old.get('src') or 'Y' * len(dates)
    return dict(zip(dates, rate)), dict(zip(dates, src))


def compare(a, b, name):
    d = sorted(abs(a[k] / b[k] - 1) * 100 for k in a if k in b)
    if d:
        print(f'  {name}: {len(d)} common days, median |diff| {d[len(d) // 2]:.3f}%, '
              f'p99 {d[int(len(d) * 0.99)]:.3f}%, max {d[-1]:.3f}%')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--ecb-zip', help='local eurofxref-hist.zip instead of downloading')
    args = ap.parse_args()

    existing, existing_src = load_existing()
    yahoo = {d: v for d, v in existing.items() if existing_src.get(d, 'Y') == 'Y'}
    print(f'  Yahoo (existing file): {len(yahoo)} days')
    fred, fred_src = load_fred()
    ecb, ecb_src = load_ecb(args.ecb_zip)
    compare(fred, yahoo, 'FRED vs Yahoo')
    compare(ecb, yahoo, 'ECB  vs Yahoo')
    compare(fred, ecb, 'FRED vs ECB ')

    merged = {}
    for code, series in (('E', ecb), ('F', fred), ('Y', yahoo)):   # later wins
        for d, v in series.items():
            if v and 0.5 < v < 2.5:                                  # sanity bound for EURUSD
                merged[d] = (round(v, 6), code)
    # Keep non-Yahoo rows from a previous build if a source is unreachable now.
    for d, v in existing.items():
        merged.setdefault(d, (v, existing_src.get(d, 'Y')))
    # Weekend rows (Yahoo emits Sunday-evening FX bars) add nothing for daily closes.
    dates = sorted(d for d in merged if datetime.fromisoformat(d).weekday() < 5)
    counts = {c: sum(merged[d][1] == c for d in dates) for c in 'YFE'}
    payload = {
        'meta': {
            'pair': 'EURUSD', 'unit': 'USD per EUR',
            'sources': {
                'Y': 'Yahoo Finance EURUSD=X daily close',
                'F': f'Federal Reserve H.10 noon NY buying rate (FRED DEXUSEU) via {fred_src}',
                'E': f'ECB euro reference rate via {ecb_src}',
            },
            'priority': 'Y > F > E per date', 'counts': counts,
            'updatedAt': datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        },
        'dates': dates,
        'rate': [merged[d][0] for d in dates],
        'src': ''.join(merged[d][1] for d in dates),
    }
    with open(OUT, 'w') as f:
        json.dump(payload, f, separators=(',', ':'))
    print(f'Wrote {OUT}: {len(dates)} days {dates[0]} -> {dates[-1]} {counts}')


if __name__ == '__main__':
    sys.exit(main())
