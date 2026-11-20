#!/usr/bin/env python3
"""
Fetch daily closes for the active Henry Hub and Dutch TTF contract strips from
Yahoo Finance and write data/live_quotes.json (served to the dashboard).

Also refreshes the recent Yahoo window of data/fx_eurusd.json (the daily
EURUSD history built by build_fx.py from Yahoo, FRED and ECB) so TTF can be
converted into USD/MMBtu at each date's own exchange rate.
"""

import concurrent.futures
import json
import os
import urllib.request
from datetime import datetime, timezone

CODES = 'FGHJKMNQUVXZ'
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'data', 'live_quotes.json')
FX_OUT = os.path.join(ROOT, 'data', 'fx_eurusd.json')
HH_MONTHS, TTF_MONTHS = 72, 36


def strip_tickers(prefix, months, now):
    out = []
    for k in range(months):
        idx = now.month - 1 + k
        out.append(f'{prefix}{CODES[idx % 12]}{(now.year + idx // 12) % 100:02d}.NYM')
    return out


def fetch(ticker, rng='2y'):
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range={rng}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; nat-gas-feed/2.0)'})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
        res = (raw.get('chart') or {}).get('result')
        if not res:
            return ticker, None
        ts = res[0].get('timestamp') or []
        closes = ((res[0].get('indicators') or {}).get('quote') or [{}])[0].get('close') or []
        pts, seen = [], set()
        for t, p in zip(ts, closes):
            if p is None or p <= 0:
                continue
            d = datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%d')
            if d in seen:          # Yahoo occasionally repeats the live bar
                pts[-1]['p'] = round(float(p), 4)
                continue
            seen.add(d)
            pts.append({'d': len(pts) + 1, 'p': round(float(p), 4), 'date': d})
        return ticker, pts or None
    except Exception:
        return ticker, None


def update_fx(recent):
    """Merge Yahoo EURUSD closes into fx_eurusd.json, keeping per-date sources.

    The file is built by build_fx.py (Yahoo > FRED > ECB from 1999); here the
    recent Yahoo window overwrites matching dates and is tagged 'Y'. Weekend
    bars are skipped.
    """
    hist, src, meta = {}, {}, {}
    if os.path.exists(FX_OUT):
        with open(FX_OUT) as f:
            old = json.load(f)
        meta = old.get('meta', {})
        hist = dict(zip(old.get('dates', []), old.get('rate', [])))
        src = dict(zip(old.get('dates', []), old.get('src') or 'Y' * len(hist)))
    if not hist or min(hist) > '2005-01-01':      # not yet backfilled
        _, full = fetch('EURUSD=X', 'max')
        recent = (full or []) + (recent or [])
    for p in recent or []:
        if datetime.strptime(p['date'], '%Y-%m-%d').weekday() < 5:
            hist[p['date']] = p['p']
            src[p['date']] = 'Y'
    if not hist:
        return
    dates = sorted(hist)
    meta.update({'pair': 'EURUSD', 'unit': 'USD per EUR', 'updatedAt': datetime.now(timezone.utc).isoformat()})
    meta['counts'] = {c: sum(src[d] == c for d in dates) for c in 'YFE'}
    with open(FX_OUT, 'w') as f:
        json.dump({'meta': meta, 'dates': dates, 'rate': [hist[d] for d in dates],
                   'src': ''.join(src[d] for d in dates)}, f, separators=(',', ':'))


def main():
    now = datetime.now(timezone.utc)
    tickers = ['NG=F', 'EURUSD=X'] + strip_tickers('NG', HH_MONTHS, now) + strip_tickers('TTF', TTF_MONTHS, now)
    quotes = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        for ticker, pts in pool.map(fetch, tickers):
            if pts:
                quotes[ticker] = pts
    payload = {'meta': {'updatedAt': now.isoformat(), 'updatedTimestamp': int(now.timestamp() * 1000),
                        'tickerCount': len(quotes)},
               'quotes': quotes}
    if len(quotes) < 10:
        # Do not overwrite a good feed with a failed sweep.
        raise SystemExit(f'Only {len(quotes)} tickers fetched; keeping previous feed')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    update_fx(quotes.get('EURUSD=X'))
    print(f'Compiled {len(quotes)}/{len(tickers)} quotes into {OUT}')


if __name__ == '__main__':
    main()
