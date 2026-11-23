# Provenance of manually imported prices

| Contract | Date | Price (EUR/MWh) | Source | Corroboration |
|---|---|---|---|---|
| TGJ26 (Apr 2026) | 2026-03-30 | 54.814 | Barchart TGJ26 quote page, settlement-flagged ("54.814s"), expiration 03/30/26 | Contiguous with archive (last row 2026-03-27 at 54.177); TGQ26 settled 54.952 that day (−0.25%) |
| TGK26 (May 2026) | 2026-04-29 | 46.853 | Barchart TGK26 quote page ("46.853s", expiration 04/29/26); same value on Barchart's NYMEX ITTK26 page | TGQ26 46.859 same day (−0.01%) |
| TGM26 (Jun 2026) | 2026-05-28 | 46.921 | Barchart TGM26 quote page ("46.921s", expiration 05/28/26) | TGU26 46.936 / TGQ26 46.951 same day (−0.03% / −0.06%) |
| TGN26 (Jul 2026) | 2026-06-29 | 42.565 | Barchart TGN26 quote page ("42.565s", expiration 06/29/26) | TGQ26 42.616 same day (−0.12%) |

Barchart's TG series is the same series as this archive (TGZ25 and NGZ25 exports match on 519/519 days).
These rows are the final settlements only: daily prices between 2026-03-27 and each expiry are not
available from any source reachable when they were imported, so those weeks remain a visible gap.

## Daily history 2026-03-30 → expiry (imported 2026-11-23)

Daily settlements for TGK26 (20 rows), TGM26 (41) and TGN26 (63), from Barchart's price-history
pages, supplied by the repository owner. Checks before import:
- every date already in the archive (27 Mar and each expiry day) matches exactly;
- against TGQ26 (Aug 2026) on the same days: median difference 0.12–0.18%, maximum 1.37%.
Good Friday (3 Apr) and Easter Monday (6 Apr) were non-trading; 4 and 25 May traded.
The contracts now have complete daily histories; the earlier note about a data gap no longer applies.
