# Manual price-history imports

Drop contract price-history CSVs here to fill gaps the automated Yahoo feed
cannot serve (for example the final weeks of TGJ26, TGK26, TGM26 and TGN26,
which expired before the live feed began archiving TTF).

1. On barchart.com open the contract (e.g. `TGK26` for May 2026 Dutch TTF,
   `NGK26` for Henry Hub), choose **Historical Data → Download** (daily).
2. Keep Barchart's file name (`tgk26_price-history-MM-DD-YYYY.csv`) or name it
   `TGK26.csv`, and commit it to this folder.
3. The daily *Archive Contracts* workflow validates each file against the
   archive (≥95% of overlapping closes within 0.5%), merges new rows, rebuilds
   `data/ttf.json` / `data/hh.json`, and moves the file to `done/` (or
   `rejected/` with the reason in the workflow log).

Run it locally instead with:

    python scripts/import_price_history.py --dry-run data/imports/*.csv
    python scripts/archive_contract.py --update --no-network

Barchart exports already in the repo (`data/tgz25_price-history-04-06-2026.csv`,
`data/raw/ngz25_price-history-03-27-2026.csv`) match the archive on 519 of 519
days, so the two sources are interchangeable.
