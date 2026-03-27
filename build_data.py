#!/usr/bin/env python3
"""Convert CSV price data to JSON for the dashboard."""
import csv, json, os, glob, urllib.request, tempfile

MONTH_CODES = {
    '01': ('Jan', 'F'), '02': ('Feb', 'G'), '03': ('Mar', 'H'),
    '04': ('Apr', 'J'), '05': ('May', 'K'), '06': ('Jun', 'M'),
    '07': ('Jul', 'N'), '08': ('Aug', 'Q'), '09': ('Sep', 'U'),
    '10': ('Oct', 'V'), '11': ('Nov', 'X'), '12': ('Dec', 'Z'),
}

CODE_TO_MONTH = {v[1]: v[0] for v in MONTH_CODES.values()}

def read_csv(path):
    """Read CSV and return list of {d, p, date} dicts."""
    rows = []
    with open(path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                rows.append({
                    'd': int(row['S No.']),
                    'p': round(float(row['Price']), 4),
                    'date': row['Date']
                })
            except (ValueError, KeyError):
                continue
    return rows

def build_hh_json(base_dir, out_dir):
    """Build hh_jan.json ... hh_dec.json from Henry Hub CSVs."""
    month_dir = os.path.join(base_dir, 'Henry Hub', 'Monthwise')
    for folder in sorted(os.listdir(month_dir)):
        month_num = folder[:2]
        if month_num not in MONTH_CODES:
            continue
        month_name, month_code = MONTH_CODES[month_num]
        contracts = {}
        folder_path = os.path.join(month_dir, folder)
        for csv_file in sorted(os.listdir(folder_path)):
            if not csv_file.endswith('.csv'):
                continue
            # Extract year from filename like ngf26.csv
            name = csv_file.replace('.csv', '')
            yr = name[-2:]
            ticker = f"NG{month_code}{yr}".upper()
            rows = read_csv(os.path.join(folder_path, csv_file))
            if rows:
                contracts[ticker] = [{'d': r['d'], 'p': r['p'], 'date': r['date']} for r in rows]

        out = {
            'meta': {
                'month': month_name,
                'month_code': month_code,
                'unit': 'USD/MMBtu',
                'source': 'Historical'
            },
            'contracts': contracts
        }
        os.makedirs(os.path.join(out_dir, 'hh'), exist_ok=True)
        out_path = os.path.join(out_dir, 'hh', f'hh_{month_name.lower()}.json')
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        print(f"  {out_path}: {len(contracts)} contracts")

def build_ttf_json(base_dir, out_dir):
    """Build ttf_jan.json ... ttf_dec.json from Dutch TTF CSVs."""
    month_dir = os.path.join(base_dir, 'Dutch TTF', 'Monthwise')
    for folder in sorted(os.listdir(month_dir)):
        month_num = folder[:2]
        if month_num not in MONTH_CODES:
            continue
        month_name, month_code = MONTH_CODES[month_num]
        contracts = {}
        folder_path = os.path.join(month_dir, folder)
        for csv_file in sorted(os.listdir(folder_path)):
            if not csv_file.endswith('.csv'):
                continue
            name = csv_file.replace('.csv', '')
            yr = name[-2:]
            ticker = f"TG{month_code}{yr}".upper()
            rows = read_csv(os.path.join(folder_path, csv_file))
            if rows:
                contracts[ticker] = [{'d': r['d'], 'p': r['p'], 'date': r['date']} for r in rows]

        out = {
            'meta': {
                'month': month_name,
                'month_code': month_code,
                'unit': 'EUR/MWh',
                'source': 'Historical'
            },
            'contracts': contracts
        }
        os.makedirs(os.path.join(out_dir, 'ttf'), exist_ok=True)
        out_path = os.path.join(out_dir, 'ttf', f'ttf_{month_name.lower()}.json')
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        print(f"  {out_path}: {len(contracts)} contracts")

EIA_SPOT_URL = 'https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls'

MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

def build_spot_from_eia(out_dir):
    """Download EIA Henry Hub daily spot XLS and regenerate spot JSON files."""
    try:
        import xlrd
    except ImportError:
        raise SystemExit("xlrd not installed — run: pip install xlrd")

    print(f"  Downloading {EIA_SPOT_URL} ...")
    with tempfile.NamedTemporaryFile(suffix='.xls', delete=False) as tmp:
        tmp_path = tmp.name
    urllib.request.urlretrieve(EIA_SPOT_URL, tmp_path)

    wb = xlrd.open_workbook(tmp_path)
    ws = wb.sheet_by_name('Data 1')

    # month_data[month_name][year] = list of {d, p, date}
    month_data = {m: {} for m in MONTH_NAMES}

    for r in range(3, ws.nrows):
        serial = ws.cell(r, 0).value
        price  = ws.cell(r, 1).value
        if not isinstance(serial, float) or not isinstance(price, float):
            continue
        dt = xlrd.xldate_as_datetime(serial, wb.datemode).date()
        m_name = MONTH_NAMES[dt.month - 1]
        yr = str(dt.year)
        if yr not in month_data[m_name]:
            month_data[m_name][yr] = []
        month_data[m_name][yr].append({'p': round(price, 4), 'date': dt.isoformat()})

    os.makedirs(os.path.join(out_dir, 'spot'), exist_ok=True)
    for m_name, years in month_data.items():
        # Add sequential d within each year
        years_out = {}
        for yr in sorted(years.keys()):
            years_out[yr] = [{'d': i+1, 'p': e['p'], 'date': e['date']}
                             for i, e in enumerate(years[yr])]
        out = {
            'meta': {'month': m_name, 'unit': 'USD/MMBtu', 'source': 'EIA'},
            'years': years_out
        }
        out_path = os.path.join(out_dir, 'spot', f'spot_{m_name.lower()}.json')
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        total_pts = sum(len(v) for v in years_out.values())
        print(f"  {out_path}: {len(years_out)} years, {total_pts} data points, last={list(years_out.values())[-1][-1]['date']}")

    os.unlink(tmp_path)

def build_spot_json(base_dir, out_dir):
    """Build spot_jan.json ... spot_dec.json from Spot Price CSVs."""
    month_dir = os.path.join(base_dir, 'Spot Price', 'Monthwise')
    for folder in sorted(os.listdir(month_dir)):
        month_num = folder[:2]
        if month_num not in MONTH_CODES:
            continue
        month_name, _ = MONTH_CODES[month_num]
        folder_path = os.path.join(month_dir, folder)
        csvs = [f for f in os.listdir(folder_path) if f.endswith('.csv')]
        if not csvs:
            continue
        # Usually one CSV per month folder
        all_rows = []
        for csv_file in csvs:
            all_rows.extend(read_csv(os.path.join(folder_path, csv_file)))

        # Group by year
        years = {}
        for r in all_rows:
            yr = r['date'][:4]
            if yr not in years:
                years[yr] = []
            years[yr].append({'d': len(years[yr]) + 1, 'p': r['p'], 'date': r['date']})

        out = {
            'meta': {
                'month': month_name,
                'unit': 'USD/MMBtu',
                'source': 'EIA'
            },
            'years': years
        }
        os.makedirs(os.path.join(out_dir, 'spot'), exist_ok=True)
        out_path = os.path.join(out_dir, 'spot', f'spot_{month_name.lower()}.json')
        with open(out_path, 'w') as f:
            json.dump(out, f, separators=(',', ':'))
        print(f"  {out_path}: {len(years)} years")

def build_expiry_prices(base_dir, out_dir):
    """Build expiry_prices.json from the last row of each HH contract CSV."""
    month_dir = os.path.join(base_dir, 'Henry Hub', 'Monthwise')
    expiry = {}
    for folder in sorted(os.listdir(month_dir)):
        month_num = folder[:2]
        if month_num not in MONTH_CODES:
            continue
        month_name, month_code = MONTH_CODES[month_num]
        folder_path = os.path.join(month_dir, folder)
        for csv_file in sorted(os.listdir(folder_path)):
            if not csv_file.endswith('.csv'):
                continue
            name = csv_file.replace('.csv', '')
            yr_short = name[-2:]
            yr_full = f"20{yr_short}" if int(yr_short) < 50 else f"19{yr_short}"
            rows = read_csv(os.path.join(folder_path, csv_file))
            if rows:
                last_price = rows[-1]['p']
                if yr_full not in expiry:
                    expiry[yr_full] = {}
                expiry[yr_full][month_name] = last_price

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'expiry_prices.json')
    with open(out_path, 'w') as f:
        json.dump(expiry, f, separators=(',', ':'), sort_keys=True)
    print(f"  {out_path}: {len(expiry)} years")

def build_ng_continuous(base_dir, out_dir):
    """Build a continuous NG=F front-month series from individual contracts."""
    year_dir = os.path.join(base_dir, 'Henry Hub', 'Yearwise')
    # all_data[date] = list of (delivery_date, price)
    all_data = {}
    
    # Month codes to delivery month index
    DELIVERY_MAP = {v[1]: int(k) for k, v in MONTH_CODES.items()}

    print("  Scanning Yearwise CSVs for continuous NG series...")
    years = [d for d in os.listdir(year_dir) if os.path.isdir(os.path.join(year_dir, d))]
    for yr_folder in sorted(years):
        folder_path = os.path.join(year_dir, yr_folder)
        for csv_file in os.listdir(folder_path):
            if not csv_file.endswith('.csv'): continue
            name = csv_file.replace('.csv', '')
            # ngf19 -> month=F, yr=19
            m_code = name[2:3].upper()
            yr_short = name[3:]
            if m_code not in DELIVERY_MAP: continue
            
            m_idx = DELIVERY_MAP[m_code]
            yr_full = int(yr_short) + (2000 if int(yr_short) < 50 else 1900)
            delivery_date = f"{yr_full}-{m_idx:02d}-01"
            
            rows = read_csv(os.path.join(folder_path, csv_file))
            for r in rows:
                dt = r['date']
                if dt not in all_data:
                    all_data[dt] = []
                all_data[dt].append({'delivery': delivery_date, 'p': r['p']})

    # For each date, pick the contract with the earliest delivery date
    continuous = []
    for dt in sorted(all_data.keys()):
        # Sort by delivery date ascending
        pts = sorted(all_data[dt], key=lambda x: x['delivery'])
        # Pick the one with the earliest delivery
        continuous.append({'date': dt, 'p': pts[0]['p']})

    out_path = os.path.join(out_dir, 'ng_continuous.json')
    with open(out_path, 'w') as f:
        json.dump(continuous, f, separators=(',', ':'))
    print(f"  {out_path}: {len(continuous)} data points, range {continuous[0]['date']} to {continuous[-1]['date']}")

if __name__ == '__main__':
    base = 'Cleaned_Database'
    out = 'data'
    print("Building HH JSON...")
    build_hh_json(base, out)
    print("Building TTF JSON...")
    build_ttf_json(base, out)
    print("Building Spot JSON (from EIA)...")
    build_spot_from_eia(out)
    print("Building Expiry Prices...")
    build_expiry_prices(base, out)
    print("Building Continuous NG History...")
    build_ng_continuous(base, out)
    print("Done!")
