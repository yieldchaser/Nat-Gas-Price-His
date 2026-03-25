# NG Price History

Natural gas dashboard for browsing Henry Hub futures history, Dutch TTF futures history, Henry Hub spot history, spreads, forward curve snapshots, expiry settlements, and a front-month daily tracker.

The app is intentionally lightweight:

- `index.html` is the whole UI.
- Historical data lives in JSON under `data/`.
- GitHub Pages deploys directly from `main`.
- Live futures data is fetched at runtime from Yahoo Finance with a proxy-first fallback.

## What Is In The Dashboard

- `HH Contracts`: Henry Hub contract history with seasonal overlays and compare mode
- `TTF Contracts`: Dutch TTF contract history
- `Spot`: Henry Hub daily spot history
- `Spreads`: calendar spread chart plus heatmap
- `Forward Curve`: live strip view from current forward contracts
- `Expiry Prices`: historical final settlement table
- `Daily Tracker`: front-month contract log and upcoming expirations

## Repo Layout

```text
.
|-- index.html
|-- README.md
|-- build_data.py
|-- data/
|   |-- hh/
|   |-- ttf/
|   |-- spot/
|   `-- expiry_prices.json
|-- Cleaned_Database/
|-- Price History Data/
`-- .github/workflows/pages.yml
```

## Data Format

Henry Hub and TTF contract files are grouped by month:

```json
{
  "meta": {
    "month": "Jan",
    "month_code": "F",
    "unit": "USD/MMBtu",
    "source": "Historical"
  },
  "contracts": {
    "NGF26": [
      { "d": 1, "p": 4.52, "date": "2025-01-02" }
    ]
  }
}
```

Spot files are grouped by calendar year:

```json
{
  "meta": {
    "month": "Jan",
    "unit": "USD/MMBtu",
    "source": "EIA"
  },
  "years": {
    "2025": [
      { "d": 1, "p": 3.11, "date": "2025-01-02" }
    ]
  }
}
```

Expiry settlements are stored as:

```json
{
  "2025": {
    "Jan": 3.514,
    "Feb": 3.535
  }
}
```

## Running Locally

Because the page loads JSON with `fetch`, serve the repo over HTTP instead of opening the file directly.

```powershell
cd "c:\Users\Dell\OneDrive\Desktop\New folder\misc\Github\Nat-Gas-Price-His-main\Nat-Gas-Price-His-main"
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173
```

## Rebuilding The Historical JSON

`build_data.py` converts the CSV source folders inside `Cleaned_Database/` into the JSON files used by the dashboard.

```powershell
python build_data.py
```

That script currently:

- builds `data/hh/hh_*.json` from `Cleaned_Database/Henry Hub/Monthwise`
- builds `data/ttf/ttf_*.json` from `Cleaned_Database/Dutch TTF/Monthwise`
- builds `data/spot/spot_*.json` from `Cleaned_Database/Spot Price/Monthwise`
- rebuilds `data/expiry_prices.json` from the last Henry Hub price in each contract CSV

## Deployment

GitHub Pages is configured in [pages.yml](c:\Users\Dell\OneDrive\Desktop\New folder\misc\Github\Nat-Gas-Price-His-main\Nat-Gas-Price-His-main\.github\workflows\pages.yml). Any push to `main` publishes the repo root as the site.

## Notes

- The dashboard is static and does not require a build step.
- Live contract availability depends on Yahoo Finance responses and proxy availability.
- If some live contracts are unavailable, the historical views still render from the committed JSON files.
