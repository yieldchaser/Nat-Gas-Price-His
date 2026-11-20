#!/usr/bin/env python3
"""
Build the compact JSON datasets consumed by the dashboard.

Outputs (all under data/):
  hh.json   Henry Hub contracts (USD/MMBtu)
  ttf.json  Dutch TTF contracts (EUR/MWh)
  spot.json EIA Henry Hub daily spot (USD/MMBtu)

Contract file layout::

    {"meta": {...},
     "contracts": {"NGZ26": {"x": "2026-11-25",   # last trading day
                             "s": "active",       # settled | active | incomplete
                             "d0": "2023-05-03",  # first date
                             "dt": [0, 1, 1, 6],  # calendar-day deltas from d0
                             "p": [4.406, ...]}}}

Data-quality rules applied here (documented so the UI can rely on them):
  * Rows dated after a contract's rule-based expiry whose price merely repeats
    the previous close are vendor fill-forward artefacts and are dropped.
  * A contract is ``settled`` only if its expiry has passed *and* the archive
    reaches its last trading day; the final close is then the settlement.
    Expired contracts whose history stops short are ``incomplete`` and are
    never presented as settled.
  * Pre-June-1997 HH contracts used a different expiry rule; their last
    archived date is taken as the expiry.
"""

import argparse
import csv
import json
import os
import sys
import tempfile
import time
import urllib.request
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from archive_io import MARKET_DIRS, ROOT  # noqa: E402
from contract_calendar import contract_expiry, parse_ticker, rule_applies  # noqa: E402

DATA = os.path.join(ROOT, 'data')
EIA_SPOT_URL = 'https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls'
MARKET_META = {
    'NG': {'market': 'HH', 'name': 'Henry Hub (NYMEX)', 'unit': 'USD/MMBtu', 'file': 'hh.json'},
    'TG': {'market': 'TTF', 'name': 'Dutch TTF (NYMEX)', 'unit': 'EUR/MWh', 'file': 'ttf.json'},
}


def encode_series(points):
    """[(iso_date, price)] sorted -> (d0, deltas, prices)."""
    d0 = points[0][0]
    prev = date.fromisoformat(d0)
    deltas, prices = [], []
    for d, p in points:
        cur = date.fromisoformat(d)
        deltas.append((cur - prev).days)
        prices.append(round(p, 4))
        prev = cur
    return d0, deltas, prices


def read_contract_csv(path):
    pts = {}
    with open(path, newline='') as f:
        for r in csv.DictReader(f):
            try:
                px = float(r['Price'])
            except (KeyError, ValueError, TypeError):
                continue
            if px > 0 and r.get('Date'):
                pts[r['Date']] = px
    return sorted(pts.items())


def clean_contract(ticker, pts, today):
    """Apply expiry/fill-forward rules. Returns (points, expiry_iso, status, notes)."""
    notes = []
    if not rule_applies(ticker):
        return pts, pts[-1][0], 'settled', ['pre-1997 expiry rule: last archived date used']
    rule_exp = contract_expiry(ticker).isoformat()
    # Drop fill-forward rows after expiry (price identical to previous close).
    while len(pts) > 1 and pts[-1][0] > rule_exp and pts[-1][1] == pts[-2][1]:
        pts = pts[:-1]
        notes.append('dropped fill-forward row after expiry')
    last = pts[-1][0]
    if last > rule_exp:
        # Vendor history continues past the rule date with changing prices;
        # keep it and treat the last archived date as the expiry.
        notes.append(f'archive extends past rule expiry {rule_exp}')
        return pts, last, 'settled', notes
    if rule_exp >= today.isoformat():
        return pts, rule_exp, 'active', notes
    if last == rule_exp:
        return pts, rule_exp, 'settled', notes
    notes.append(f'history ends {last}, before last trading day {rule_exp}')
    return pts, rule_exp, 'incomplete', notes


def build_market(prefix, today):
    meta = MARKET_META[prefix]
    base = os.path.join(MARKET_DIRS[prefix], 'Monthwise')
    contracts, issues = {}, []
    for folder in sorted(os.listdir(base)):
        full = os.path.join(base, folder)
        if not os.path.isdir(full):
            continue
        for fn in sorted(os.listdir(full)):
            if not fn.endswith('.csv'):
                continue
            ticker = fn[:-4].upper()
            pts = read_contract_csv(os.path.join(full, fn))
            if not pts:
                continue
            pts, expiry, status, notes = clean_contract(ticker, pts, today)
            d0, dt, p = encode_series(pts)
            contracts[ticker] = {'x': expiry, 's': status, 'd0': d0, 'dt': dt, 'p': p}
            if status == 'incomplete':
                issues.append(f'{ticker}: {notes[-1]}')
    ordered = dict(sorted(contracts.items(), key=lambda kv: parse_ticker(kv[0])[1:]))
    last_date = max(_last_date(c) for c in ordered.values())
    out = {
        'meta': {
            'market': meta['market'], 'name': meta['name'], 'unit': meta['unit'],
            'built': datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            'asOf': today.isoformat(), 'lastDate': last_date,
            'contracts': len(ordered),
            'settled': sum(c['s'] == 'settled' for c in ordered.values()),
            'incomplete': sorted(k for k, c in ordered.items() if c['s'] == 'incomplete'),
            'source': 'Contract archive (data/database), Yahoo Finance daily closes',
        },
        'contracts': ordered,
    }
    path = os.path.join(DATA, meta['file'])
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'  {path}: {len(ordered)} contracts, last {last_date}, {os.path.getsize(path) / 1e6:.2f} MB')
    for msg in issues:
        print(f'    incomplete: {msg}')
    return out


def _last_date(c):
    d = date.fromisoformat(c['d0']).toordinal() + sum(c['dt'])
    return date.fromordinal(d).isoformat()


def write_spot(points, source):
    points = sorted({d: p for d, p in points if p and p > 0}.items())
    d0, dt, p = encode_series(points)
    out = {'meta': {'market': 'HH-SPOT', 'name': 'Henry Hub spot (EIA)', 'unit': 'USD/MMBtu',
                    'source': source, 'lastDate': points[-1][0],
                    'built': datetime.now(timezone.utc).replace(microsecond=0).isoformat()},
           'd0': d0, 'dt': dt, 'p': p}
    path = os.path.join(DATA, 'spot.json')
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'  {path}: {len(points)} days {points[0][0]} -> {points[-1][0]}')


def build_spot_from_eia(_out_dir=None):
    """Download the EIA daily Henry Hub spot workbook and write data/spot.json."""
    import xlrd  # noqa: WPS433 (optional dependency, CI installs it)
    with tempfile.NamedTemporaryFile(suffix='.xls', delete=False) as tmp:
        tmp_path = tmp.name
    for attempt in range(4):
        try:
            urllib.request.urlretrieve(EIA_SPOT_URL, tmp_path)
            break
        except Exception as exc:  # pragma: no cover - network
            if attempt == 3:
                raise RuntimeError(f'EIA download failed: {exc}') from exc
            time.sleep(2 ** attempt)
    wb = xlrd.open_workbook(tmp_path)
    ws = wb.sheet_by_name('Data 1')
    pts = []
    for r in range(3, ws.nrows):
        serial, price = ws.cell(r, 0).value, ws.cell(r, 1).value
        if isinstance(serial, float) and isinstance(price, float):
            pts.append((xlrd.xldate_as_datetime(serial, wb.datemode).date().isoformat(), round(price, 4)))
    os.unlink(tmp_path)
    write_spot(pts, 'EIA RNGWHHD (daily Henry Hub spot)')


def spot_from_legacy():
    """Convert the legacy data/spot/spot_<mon>.json files if present."""
    folder = os.path.join(DATA, 'spot')
    pts = []
    if os.path.isdir(folder):
        for fn in os.listdir(folder):
            with open(os.path.join(folder, fn)) as f:
                for series in json.load(f).get('years', {}).values():
                    pts += [(p['date'], p['p']) for p in series]
    return pts


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--skip-eia', action='store_true', help='do not download EIA spot data')
    ap.add_argument('--today', default=date.today().isoformat())
    args = ap.parse_args()
    today = date.fromisoformat(args.today)
    print('Building contract datasets ...')
    for prefix in ('NG', 'TG'):
        build_market(prefix, today)
    if not args.skip_eia:
        print('Refreshing EIA spot ...')
        build_spot_from_eia()
    elif not os.path.exists(os.path.join(DATA, 'spot.json')):
        legacy = spot_from_legacy()
        if legacy:
            write_spot(legacy, 'EIA RNGWHHD (daily Henry Hub spot)')


if __name__ == '__main__':
    main()
