TASK: Full Codebase Self-Audit — Error Detection & Bug Report

You are to conduct a thorough, systematic self-audit of the entire index.html codebase. Your job is not to fix anything yet — only to find, classify, and document every error with precision. Fix phase comes after the full audit is complete and confirmed.

AUDIT CATEGORIES — Check every single one:

1. Render / Display Errors

Raw code or JavaScript source text leaking into the visible UI (rendered as plain text instead of executing)

Any function body, comment block, or code string appearing in the DOM as visible text to the user

Broken or unstyled elements, overlapping components, layout breaks
2. Chart / Visualization Errors

Charts that render blank, empty, or fail to load entirely

Charts with missing data, incorrect axis labels, or wrong date ranges

Charts that break on tab switch or on first load
3. Mathematical Errors

Incorrect aggregation logic (wrong average, sum, count)

Off-by-one errors in date ranges, index slices, or loop boundaries

Percentage, return, or spread calculations that produce wrong values

Division-by-zero risks not handled
4. Logical Errors

Conditions that are always true or always false

Functions that are defined but never called, or called before definition

State mutations that affect unintended components

Tab navigation logic that breaks when switching between tabs

requestAnimationFrame or async timing bugs causing stale renders
5. Data Pipeline Errors

Data not being parsed, filtered, or mapped correctly before being passed to charts

Wrong field names, mismatched keys, or undefined lookups in data objects

Hardcoded values where dynamic data should be used
6. Event & Interaction Errors

Click handlers not firing or firing multiple times (duplicate listeners)

Controls (dropdowns, toggles, date pickers) not updating chart state correctly

Tab switching not triggering re-renders where required
7. Scope & Variable Errors

Variables used before declaration or outside their intended scope

Global state (STATE object or equivalent) being read before it is initialized

Closures capturing stale values
8. Performance & Stability Errors

Functions that re-render the entire DOM on every interaction unnecessarily

Memory leaks from unremoved event listeners

Infinite loops or recursive calls without a base case

KNOWN CONFIRMED BUGS — These must appear in your audit report:
Flag each of these with root cause analysis, not just acknowledgment:

[BUG-001] Code text leaking into UI tabs — The following function body is rendering as visible plain text at the bottom of every tab instead of executing:
text
// ─── GLOBAL CROSS-TAB NAVIGATION ────────────────────────────────
function navigateTo(tab, params) { ... }

Identify exactly where in the HTML/JS this script block is being treated as text content instead of executable code (e.g., wrong tag placement, missing <script> wrapper, script inside a <div> or template literal, incorrect escaping).

[BUG-002] "Average Monthly Return — NG=F Full History" chart not rendering — Identify whether the failure is at the data fetch layer, the aggregation/calculation layer, or the Plotly render call. State exactly which function or line is responsible.

[BUG-003] "Lifecycle Resolution (vs Trading Day)" chart not rendering — Same diagnostic requirement as BUG-002.

[BUG-004] "Spread Heatmap — Average Calendar Spread (Last 5 Years)" chart not rendering — Same diagnostic requirement as BUG-002.

OUTPUT FORMAT — Deliver your audit as follows:
For every bug found (including the confirmed ones above), report in this exact format:
text
BUG-[ID] | Category: [Render / Math / Logic / Data / Event / Scope / Performance]
Location: [Function name, line number or code block]
Description: [What is wrong, in plain language]
Root Cause: [Why it is happening — specific, not vague]
Impact: [What breaks for the user as a result]
Fix Approach: [One-line description of the correct fix — no code yet]

RULES:

Do not write any fixes during this audit phase

Do not skip any category — check all 8 even if you think they're clean

If a category has zero issues, explicitly state: [Category Name]: No issues found

Prioritize bugs by impact: Critical → High → Medium → Low

When the full report is ready, end with a summary count — total bugs by category

START: Begin auditing index.html now. Work through all 8 categories sequentially. Do not output anything until the full audit across all categories is complete. Then deliver the structured report in one block.