import urllib.request
import json
import datetime

# Month codes: F G H J K M N Q U V X Z
# Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
month_codes = ['F','G','H','J','K','M','N','Q','U','V','X','Z']
month_names  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

# Generate all contracts from Apr 2026 out to Dec 2035
contracts = []
for year in range(2026, 2036):
    for i, code in enumerate(month_codes):
        # Skip already-expired months in 2026 (before Apr)
        if year == 2026 and i < 3:  # Jan/Feb/Mar already gone
            continue
        label  = f"{month_names[i]} {year}"
        symbol = f"NG{code}{str(year)[-2:]}"
        contracts.append((symbol, label))

print(f"Testing {len(contracts)} contracts across the full curve...\n")
print(f"{'Symbol':<12} {'Contract':<12} {'Status':<8} {'Bars':<6} {'First Date':<12} {'Last Date':<12} {'Last Price'}")
print("-" * 78)

ok_count   = 0
fail_count = 0
last_ok    = None

for symbol, label in contracts:
    ticker = f"{symbol}.NYM"
    url    = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=max"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        result = data['chart']['result']
        if result:
            ts     = result[0].get('timestamp', [])
            closes = result[0]['indicators']['quote'][0].get('close', [])
            valid  = [c for c in closes if c is not None]
            if ts and valid:
                first = datetime.datetime.fromtimestamp(ts[0]).strftime('%Y-%m-%d')
                last  = datetime.datetime.fromtimestamp(ts[-1]).strftime('%Y-%m-%d')
                print(f"{ticker:<12} {label:<12} {'OK':<8} {len(ts):<6} {first:<12} {last:<12} {round(valid[-1], 3)}")
                ok_count += 1
                last_ok = label
            else:
                print(f"{ticker:<12} {label:<12} EMPTY")
                fail_count += 1
        else:
            print(f"{ticker:<12} {label:<12} NO RESULT")
            fail_count += 1
    except urllib.error.HTTPError as e:
        print(f"{ticker:<12} {label:<12} {e.code} {e.reason}")
        fail_count += 1
    except Exception as e:
        print(f"{ticker:<12} {label:<12} ERROR: {e}")
        fail_count += 1

print("\n" + "=" * 78)
print(f"OK: {ok_count}  |  Failed: {fail_count}  |  Last valid contract: {last_ok}")
print("=" * 78)

input("\nDone. Press Enter to exit...")
