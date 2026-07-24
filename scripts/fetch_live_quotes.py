#!/usr/bin/env python3
"""
Fetch live price history for active Henry Hub, Dutch TTF futures contracts,
NG=F continuous series, and EURUSD=X spot from Yahoo Finance API in parallel.
Compiles fresh quotes into data/live_quotes.json for sub-50ms web loading.
"""

import concurrent.futures
from datetime import datetime, timezone
import json
import os
import urllib.request

MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']

def get_active_hh_tickers():
    now = datetime.now(timezone.utc)
    tickers = []
    for offset in range(72):
        month = (now.month - 1 + offset) % 12
        year_add = (now.month - 1 + offset) // 12
        yr = (now.year + year_add) % 100
        code = MONTH_CODES[month]
        tickers.append(f"NG{code}{yr:02d}.NYM")
    return tickers

def get_active_ttf_tickers():
    now = datetime.now(timezone.utc)
    tickers = []
    for offset in range(36):
        month = (now.month - 1 + offset) % 12
        year_add = (now.month - 1 + offset) // 12
        yr = (now.year + year_add) % 100
        code = MONTH_CODES[month]
        tickers.append(f"TTF{code}{yr:02d}.NYM")
    return tickers

def fetch_single_ticker(ticker):
    range_param = 'max' if ticker == 'NG=F' else '2y'
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range={range_param}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = json.loads(resp.read().decode('utf-8'))
        result = raw.get('chart', {}).get('result')
        if not result:
            return ticker, None
        ts = result[0].get('timestamp', [])
        quotes = result[0].get('indicators', {}).get('quote', [{}])[0].get('close', [])
        if not ts or not quotes:
            return ticker, None
        
        pts = []
        d_counter = 1
        for t, p in zip(ts, quotes):
            if p is not None:
                dt_str = datetime.fromtimestamp(t, timezone.utc).strftime('%Y-%m-%d')
                pts.append({'d': d_counter, 'p': round(float(p), 4), 'date': dt_str})
                d_counter += 1
        return ticker, pts
    except Exception:
        return ticker, None

def main():
    scripts_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(scripts_dir, '..'))
    out_file = os.path.join(repo_root, 'data', 'live_quotes.json')
    
    tickers = ['NG=F', 'EURUSD=X'] + get_active_hh_tickers() + get_active_ttf_tickers()
    print(f"Fetching quotes for {len(tickers)} tickers from Yahoo Finance...")
    
    quotes_map = {}
    success_count = 0
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(fetch_single_ticker, t): t for t in tickers}
        for future in concurrent.futures.as_completed(futures):
            ticker, pts = future.result()
            if pts:
                quotes_map[ticker] = pts
                success_count += 1

    now_utc = datetime.now(timezone.utc)
    payload = {
        "meta": {
            "updatedAt": now_utc.isoformat(),
            "updatedTimestamp": int(now_utc.timestamp() * 1000),
            "tickerCount": len(quotes_map)
        },
        "quotes": quotes_map
    }
    
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    
    print(f"Successfully compiled {success_count}/{len(tickers)} live quotes to {out_file}")

if __name__ == '__main__':
    main()
