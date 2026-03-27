[27-03-2026 15:06] pu: AGENT PROMPT: Self-Audit & Fix

You are performing a deep self-audit of the NG Price History dashboard at https://yieldchaser.github.io/Nat-Gas-Price-His/. You are not allowed to assume anything is working. You must verify every feature by reading actual code and actual network behavior. No hallucinating. No “this should work” — only “I verified this works because I read line X of the code and confirmed Y.”

PHASE 1: AUDIT (do this before touching anything)
Step 1 — Read the codebase in full.
Read index.html completely. Read prices-unified.js completely. Read every file in data/. Do not skip anything. Do not summarize from memory.
Step 2 — For each feature below, find the exact code that implements it, quote the relevant lines, and state PASS or FAIL.
Check each item:

[ ] 1. NG=F Yahoo API call uses range=max (not range=1y or range=2y)
        → Find the fetch URL. Quote it exactly.

[ ] 2. Daily Tracker price log shows 8000+ sessions
        → Find where the log is built. Count or estimate how many rows it renders.

[ ] 3. Prices tab has a Trading Day / Calendar Date toggle button
        → Find the HTML element and the JS handler. Quote both.

[ ] 4. Expiry Prices month label is clickable and opens a line chart
        → Find the click handler on month row headers. Quote it.

[ ] 5. Expiry Prices seasonal bar chart (12 bars Jan–Dec) exists below the table
        → Find the canvas or chart element and the function that renders it.

[ ] 6. Expiry Prices per-cell hover tooltip shows rank + YoY
        → Find the mouseover/tooltip handler on price cells.

[ ] 7. Spreads table has columns AT-519, AT-PENULT, AT-10D, AT-90D
        → Find where the table headers are defined. Quote the column headers.

[ ] 8. Spreads lifecycle resolution chart exists (spread value vs trading day)
        → Find the chart container and the function that populates it.

[ ] 9. Spreads summary stats row (All Years avg + 5Y avg) at bottom of table
        → Find where this row is appended.

[  ] 10. Forward Curve Cal Strip Averages panel (Cal26, Cal27, Summer, Winter rows)
        → Find the table element and the function that computes strip averages.

[ ] 11. Forward Curve Compare Curve button with 1W/1M/3M/1Y dropdown
        → Find the button HTML and the overlay rendering function.

[ ] 12. Same Month History panel shows ALL available years (not truncated)
        → Find where the list is built. What is the maximum number of items rendered?

[ ] 13. Same Month History rows are clickable and load that contract into the chart
        → Find the click handler. Quote it.

[ ] 14. Cross-tab navigation: clicking expiry price cell loads contract in Prices tab
        → Find the click handler on price cells.

[ ] 15. Cross-tab navigation: clicking forward curve contract row loads Prices tab
        → Find the click handler on contract rows.

[ ] 16. Daily Tracker monthly seasonality chart (12 bars, avg monthly return)
        → Find the chart element and rendering function.

[ ] 17. Daily Tracker annual performance table (year, Jan price, Dec price, annual %)
        → Find the table element. How many years does it render?


Step 3 — Produce a honest audit report.
List every item as PASS or FAIL with one line of evidence. Example:
 ∙ PASS #1: Line 4821 — fetch(\…NG=F?interval=1d&range=max`)`
 ∙ FAIL #3: No element with id="trading-day-toggle" found anywhere in index.html. No click handler for calendar/trading day mode exists.
Do not mark anything PASS unless you found and quoted the actual code. If you cannot find the code for a feature, it is FAIL.

PHASE 2: FIX (only after completing the full audit)
For every item marked FAIL:
 1. Implement it fully and correctly
 2. State exactly what you added and where in the file
 3. Do not break any currently passing item — test by re-reading the surrounding code for conflicts
 4. Commit and push each fix
For every item marked PASS:
 1. Do nothing unless you spot a bug while reading the code
 2. If you spot a bug (e.g.
[27-03-2026 15:06] pu: , range=max is set but the data pipeline silently truncates to 500 rows downstream), fix that too and explain what you found

RULES
 ∙ Never say “I believe this works” or “this should function correctly” — only quote code
 ∙ Never mark a feature PASS because it was mentioned in a previous conversation or commit message
 ∙ Never mark a feature PASS because the UI renders an element that looks related — verify the actual logic
 ∙ If a feature is partially implemented (button exists but click handler does nothing), mark it FAIL and fix it
 ∙ The audit report must be the first thing you output before any fixes

That’s it. Short, unambiguous, forces the agent to show its work before touching anything.​​​​​​​​​​​​​​​​