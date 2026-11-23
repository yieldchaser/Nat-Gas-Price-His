# Blue Flux — Natural Gas Analytics

A static, dependency-light dashboard for Henry Hub (NYMEX) and Dutch TTF futures:
market overview, contract lifecycles, forward curve, calendar spreads and
butterflies, seasonality and settlement history. Data is refreshed by GitHub
Actions and served from GitHub Pages; there is no server and no build step.

```bash
python3 -m http.server 4173      # then open http://127.0.0.1:4173
npm test                          # node --test + python unittest (no installs needed)
```

## Views

| View | Question it answers |
|---|---|
| **Overview** | Where is the market now? Front month and same-contract changes, realised volatility, 5Y percentile, same-season comparison, prompt spread, 12-month carry, expiry clock, HH vs TTF in USD/MMBtu, EIA cash–futures basis, curve snapshot. |
| **Contracts** | How is this contract tracking versus the same delivery month in prior years at the same point in its life, and what happened next in those years? |
| **Curve** | What does the strip look like, how has each contract moved since a comparison date, what are the Cal/summer/winter strips, and how has the prompt premium evolved? |
| **Spreads** | Where is a calendar spread or butterfly versus its own history at the same point in life? A 12×12 scanner ranks every month pair rich/cheap. |
| **Seasonality** | Seasonal price path, roll-adjusted monthly and annual returns, return and volatility distributions by calendar month, daily return tails. |
| **Settlements** | Final settlement of every contract that traded through expiry, the seasonal settlement premium, annual averages. |

On touch screens a one-finger drag over a chart scrubs the crosshair and tooltip (pinch zooms, vertical swipes scroll the page), and tapping a box plot, bar or table cell shows its detail.

Every view state is in the URL hash (e.g. `#/spreads?a=11&b=1&y=2027`), so views are linkable and the back button works.

## Methodology

**Last trading day.** NYMEX NG: 3 business days before the first day of the delivery month, on the NYMEX holiday calendar (Black Friday counts as a business day from 2011; up to 2010 it did not, and a Saturday New Year closed the preceding Friday). NYMEX TTF: 2 UK business days before the delivery month. Implemented twice (`scripts/contract_calendar.py`, `src/js/lib/calendar.js`), kept identical by a shared fixture, and validated against the archive: the rule reproduces >95% of archived last trading days; the exceptions are 1998–2003 vendor records. Pre-June-1997 HH contracts used a different rule; their last archived date is used.

**Front month / continuous series.** On each date the front month is the first contract whose last trading day is on or after that date (roll at expiry). Prices are actual closes, never back-adjusted for display.

**Roll-adjusted returns.** Every return is measured within one contract: on a roll date the return is the new front contract's own change from the previous session. The price gap between the expiring and next contract is therefore never counted as a move. Monthly, annual, YTD, 1W/1M changes and all volatility figures use these returns.

**Realised volatility.** Sample standard deviation of daily log returns × √252, reported only when ≥80% of the window has returns.

**Lifecycle alignment (T−n).** Contracts are compared at the same number of weekdays before their own last trading day. Short session gaps (≤5 weekdays) are linearly interpolated *only* when aggregating prior years into bands, so holidays do not create artificial spikes. Bands show min–max and interquartile range of settled prior contracts; they are historical ranges, not forecasts.

**Percentiles and z-scores.** Percentile rank uses the mid-rank convention (ties count half). z-scores use the sample standard deviation and are suppressed when it is zero or fewer than three observations exist.

**Spreads.** Calendar spread = front − back; butterfly = wing₁ − 2×body + wing₂. Positive means the front (wings) is priced above the back (body), i.e. backwardation for a calendar spread. Legs are joined only on dates where every leg has a close.

**Unit conversion.** TTF EUR/MWh → USD/MMBtu = price × EURUSD ÷ 3.412141633, using the EURUSD rate of the *same date* (`data/fx_eurusd.json`, daily from 1999). Per date the rate is Yahoo's close where available, else the Federal Reserve H.10 New York noon rate (FRED DEXUSEU), else the ECB reference rate; each date records its source. On common days the three agree to a median 0.12–0.18%. Dates without a rate are omitted rather than converted at today's rate.

**Settlements.** A contract is *settled* only if its history reaches its last trading day; that close is the settlement. Expired contracts whose history stops early are *incomplete* and are shown as `n/a`, never as a stale price. Open contracts appear only as italic forward prices.

**Seasonal comparisons.** “Same season” uses closes within ±7 calendar days of today's month-day in each of the previous 5 years. The seasonal price path gives each prior year one as-of close per calendar day.

## Data pipeline

```
Yahoo Finance ─10 min──▶ scripts/fetch_live_quotes.py ──▶ data/live_quotes.json (last 3 months),
                                                           data/latest.json (heartbeat), data/fx_eurusd.json
                                                       │
Yahoo Finance ─2×daily─▶ scripts/archive_contract.py  ◀┘  (merges the feed first, then fetches gaps)
                                │
                                ▼
           data/database/<Market>/Monthwise/*.csv  (permanent archive, merge-only)
                                │
                                ▼
                     scripts/build_data.py ──▶ data/hh.json, data/ttf.json
EIA RNGWHHD ──weekly──▶ build_spot_from_eia ──▶ data/spot.json
FRED + ECB  ──weekly──▶ scripts/build_fx.py    ──▶ data/fx_eurusd.json (Yahoo > FRED > ECB)
Barchart CSV ─manual──▶ data/imports/ ─daily──▶ scripts/import_price_history.py (validated merge)
```

The browser loads the JSON files, merges the live feed into the archive (feed wins on overlapping dates) and computes everything client-side (`src/js/lib`).

### How fresh are prices?

- **Feed:** `live-quotes.yml` runs every 10 minutes while NYMEX gas trades (Sun 22:00 UTC → Fri 22:00 UTC), at off-peak minutes because GitHub delays top-of-hour schedules (the old hourly job really ran every 5–8 h). A run with no price change writes nothing, so nothing is committed or redeployed. Yahoo's NYMEX quotes are themselves ~10 minutes delayed, and GitHub Pages redeploys in ~40 s after each commit, so prices on the site are typically 10–25 minutes behind the exchange. GitHub Pages allows ~10 builds/hour, which is why the feed does not run more often; tick-level data would need a paid real-time feed and a server.
- **Browser:** the page checks `data/latest.json` (a ~300-byte heartbeat) every minute while the tab is visible and on returning to the tab. When the feed has moved on, all data is reloaded (unchanged files revalidate as 304s) and the current view re-renders in place, keeping scroll position and settings.
- **Live vs close:** the status bar and the front-month tile say **live** when the market is open and the latest price belongs to the current trade date (an intraday, delayed quote), otherwise **close <date>**. Sessions follow CME Globex in New York time (Sun 18:00 – Fri 17:00 ET, daily break 17:00–18:00, evening sessions belong to the next trade date, NYMEX holidays closed). Changes are always measured against the same contract's previous close. End-of-day analytics (settlements, seasonality, monthly returns) use closes; while the market is open the latest point of an active contract is the intraday price, and settled contracts are never affected.
- **Archive:** `archive-contracts.yml` runs after the NYMEX settlement (21:41 UTC weekdays) and at 06:17 UTC, merging the feed into the permanent archive and rebuilding `hh.json`/`ttf.json`.
- **Staleness:** if the feed stops updating, the status dot turns amber after 45 minutes of an open market and a red banner appears after 4 days, so a broken job never looks like a quiet market.

Nothing in the code is tied to a calendar year: contract strips, trading windows, expiries, session rules and every view derive from today's date and the data, and the test suite checks behaviour with the clock set into 2027–2028.

**Data-quality rules** (enforced in the pipeline and mirrored in the browser):
- Archive writes are merges: rows are added or corrected, never deleted; nothing is written after a contract's last trading day.
- Weekend bars (Yahoo emits Sunday-evening copies of Friday's close) and, for HH from 2011, NYMEX-holiday bars are rejected.
- Vendor fill-forward rows after expiry (repeated price) are dropped.
- Expired contracts whose archive stops before the last trading day are re-fetched daily while Yahoo still serves them.
- The live feed is never overwritten by a failed sweep (<10 tickers).
- Manually downloaded price histories (Barchart exports) dropped in `data/imports/` are merged only if ≥95% of overlapping closes agree within 0.5% with the archive, or — for an isolated row after a gap, such as a final settlement — if a neighbouring delivery month (±3 months) closed within 2% of it that day. The exports already in the repo match the archive on 519/519 days.
- `scripts/repair_archive.py` backfills the archive from the git history of `live_quotes.json`; it recovered the final months of NGV26, NGX26 and eight TTF contracts that the old archiver had missed.

## Repository layout

```
index.html                 app shell
src/css/app.css            design system
src/js/app.js              data loading, routing, status bar
src/js/lib/                calendar.js, market.js, analytics.js, stats.js (pure, tested)
src/js/ui/                 charts.js (Lightweight Charts layer), svg.js, dom.js, format.js
src/js/views/              overview, contracts, curve, spreads, seasonality, settlements
scripts/                   contract_calendar.py, archive_io.py, archive_contract.py, build_data.py,
                           build_fx.py, fetch_live_quotes.py, import_price_history.py, repair_archive.py
tests/                     test_pipeline.py, js/*.test.mjs, fixtures/expiries.json
.github/workflows/         live-quotes (hourly), archive-contracts (daily),
                           refresh-spot (weekly), tests, pages
```

## Known limitations

- Prices come from Yahoo Finance daily closes; the latest point of an active contract can be an intraday value until the session settles.
- TGJ26, TGK26, TGM26 and TGN26 have their final settlements (Barchart, each corroborated within 0.01–0.25% by a neighbouring month's close that day — see `data/imports/PROVENANCE.md`), but their daily prices between 27 Mar 2026 and expiry are not available from any source we could reach, so the contract chart shows a break over those weeks. Dropping full Barchart exports into `data/imports/` fills them in.
- Yahoo lists only a handful of TTF forward months, so the TTF curve is sparse.
- EIA spot is published weekly and lags futures by several days.
