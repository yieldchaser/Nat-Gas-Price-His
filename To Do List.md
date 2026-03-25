=======================================================================
MASTER BUILD PROMPT — NATGAS ANALYTICS DASHBOARD
=======================================================================

You are building a professional Natural Gas futures analytics dashboard 
as a static GitHub Pages web app from scratch.

=======================================================================
ABSOLUTE BUILD RULES — READ BEFORE ANYTHING ELSE
=======================================================================

1. ONE FILE PER MESSAGE. Write one complete file, then STOP.
   Wait for "next" or "continue" before writing the next file.
   Never combine two files in one message.

2. NO STUBS. Every function you write must be fully implemented.
   No "// TODO", no "// implement later", no empty function bodies.
   If a function is not ready, do not write it at all.

3. NO PARTIAL FILES. Every file must be 100% complete when delivered.
   Not "here's the structure, I'll fill in the logic next."

4. NEVER ASSUME FILE CONTENTS. Folder names, CSV column names, and 
   TTF contract ID formats must be verified from actual repo contents 
   at runtime — do not hardcode assumptions about them.

5. TEST URLS BEFORE DECLARING DONE. After app.js (Step 9), write out 
   every fetch URL you call with the full encoded string. If any URL 
   contains unencoded spaces, the build is wrong.

6. AFTER EACH FILE: state what it does, what it depends on, and what 
   the next file will be. Then stop.

=======================================================================
REPO — GROUND TRUTH
=======================================================================

Repo URL   : https://github.com/yieldchaser/Nat-Gas-Price-His
Branch     : main
GitHub Raw : https://raw.githubusercontent.com/yieldchaser/Nat-Gas-Price-His/main/

--- EXISTING DATA STRUCTURE (DO NOT MODIFY ANYTHING HERE) ---

Cleaned_Database/
├── Henry Hub/
│   ├── Yearwise/       one CSV per year (all months)
│   └── Monthwise/      one CSV per individual contract (e.g. ngv24.csv)
├── Dutch TTF/
│   ├── Yearwise/
│   └── Monthwise/      individual TTF contract CSVs
└── Spot Price/
    ├── Yearwise/
    └── Monthwise/      Henry Hub daily spot price CSVs

Price History Data/     raw zip archives — ignore entirely

--- CSV SCHEMA (ALL files, exactly 4 columns, no exceptions) ---

"S No." | "Date" (YYYY-MM-DD) | "Price" (float) | "Contract ID" (string)

No Volume. No OI. No other columns. Do not assume any other columns.

--- FOLDER NAME ENCODING (CRITICAL) ---

Folder names contain spaces: "Henry Hub", "Dutch TTF", "Spot Price"
Encode EVERY path segment individually:
  const segments = ["Cleaned_Database", "Henry Hub", "Monthwise", "ngv24.csv"]
  const path = segments.map(s => encodeURIComponent(s)).join("/")
  const url  = BASE_RAW + path
DO NOT encodeURIComponent the full URL string in one pass.

--- CONTRACT ID CONVENTIONS ---

Henry Hub  : ng{monthcode_lower}{yy}
             e.g. ngf26 (Jan 2026), ngv24 (Oct 2024), ngk25 (May 2025)
             
Dutch TTF  : UNKNOWN — DO NOT HARDCODE.
             Read the "Contract ID" column from actual CSV files at runtime.
             The TTF format may differ from HH. Verify before wiring loader.

Month codes (both HH and TTF, same CME standard):
  f g h j k m n q u v x z  →  Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec
  (uppercase for Yahoo tickers: F G H J K M N Q U V X Z)

=======================================================================
LIVE DATA SOURCES — ALL VERIFIED, DO NOT RE-TEST
=======================================================================

--- HENRY HUB NYMEX FUTURES ---

Yahoo Finance v8 API:
  Symbol    : NG{MC}{YY}.NYM  e.g. NGK26.NYM = May 2026
  Continuous: NG=F
  Endpoint  : https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=max
  Headers   : { 'User-Agent': 'Mozilla/5.0' }

Confirmed (tested 2026-03-24):
  Active forward Apr 2026 → Jun 2031 = 69 contracts, all return data ✅
  range=max returns ~126 bars only (not from inception)
  "First Date" showing 2014-01-01 in Yahoo = metadata artifact, ignore it
  Expired contracts (e.g. NGK25, NGZ25, NGF26, NGH26) = HTTP 404
  Jul 2031–Oct 2033 = patchy (CME listing gaps, skip 404s silently)
  2034+ = not yet listed by CME

Rule: if a contract's last CSV date < today → it is expired → use CSV only, 
      never call Yahoo for it

--- DUTCH TTF FUTURES ---

Yahoo Finance v8 API:
  Symbol    : TTF{MC}{YY}.NYM  e.g. TTFK26.NYM = May 2026
  Continuous: TTF=F
  Same endpoint and headers as HH

Confirmed (tested 2026-03-24):
  TTFK26.NYM  May 2026  → OK ✅
  TTFM26.NYM  Jun 2026  → OK ✅
  TTFN26.NYM  Jul 2026  → OK ✅
  TTFV26.NYM  Oct 2026  → 404 (not yet listed, not a code error)

TTF curve is patchier than HH — sweep same range, skip all 404s silently.
Expired TTF contracts = 404 → serve from Cleaned_Database/Dutch TTF/ CSVs.
Unit: EUR/MWh (NEVER mix with $/MMBTU on same axis, never share Y-axis)

NEVER USE THESE TTF FORMATS (all confirmed 404):
  TTF26.NYM  /  TFAF26.NYM  /  TTFF26.ICE  /  TFA-F  /  TTFDc1

--- HENRY HUB SPOT PRICE (EIA — live, official) ---

URL    : https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls
Format : XLS (not XLSX) — parse with SheetJS
Sheet  : "Data 1"
Columns: col B = date, col C = price ($/MMBTU)
Skip   : first 3 header rows before data starts
Cache  : sessionStorage, 1-hour TTL

--- EUR/USD CONVERSION ---

Ticker : EURUSD=X  (same Yahoo v8 endpoint)
Use    : HH/TTF Spread panel, USD Equivalent mode only
Display: show rate used in chart subtitle

=======================================================================
TECH STACK — EXACT CDN VERSIONS
=======================================================================

Use these exact CDN links, no substitutions:

<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>

NO other libraries. NO React. NO Vue. NO jQuery. NO Bootstrap. 
NO Tippy.js. NO build tools. No npm. No bundlers.
Vanilla JS + HTML + CSS only. Runs directly in browser.

=======================================================================
FILES TO CREATE
=======================================================================

/
├── index.html
├── style.css
├── app.js
└── js/
    ├── tooltip.js
    ├── data_loader.js
    ├── yahoo_fetch.js
    ├── eia_fetch.js
    ├── data_engine.js
    └── charts.js

=======================================================================
DESIGN SYSTEM
=======================================================================

--- CSS VARIABLES (define in :root, use everywhere) ---

--bg-primary    : #0d1117
--bg-panel      : #161b22
--bg-card       : #1c2128
--border        : #30363d
--border-hover  : #58a6ff
--text-primary  : #e6edf3
--text-muted    : #8b949e
--text-dim      : #484f58
--accent-blue   : #58a6ff
--accent-amber  : #d29922
--green         : #3fb950
--red           : #f85149
--band-fill     : rgba(139, 148, 158, 0.15)
--card-shadow   : 0 4px 16px rgba(0,0,0,0.4)
--font-mono     : 'JetBrains Mono', 'Fira Code', 'Courier New', monospace
--font-ui       : -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

--- LAYOUT (pixel precise) ---

<header>
  height          : 52px
  position        : fixed
  top             : 0
  width           : 100%
  background      : var(--bg-primary)
  border-bottom   : 1px solid var(--border)
  z-index         : 100
  display         : flex, align-items center, justify-content space-between
  padding         : 0 20px

  Left  : "⚡ NatGas Dashboard"
          font: 15px var(--font-mono), color: var(--text-primary)
          bolt icon: color var(--accent-blue)

  Right : live ticker pills
          [NG=F: $2.928 ▲ +0.21%]  [TTF=F: €34.48 ▼ -0.8%]
          pill: background var(--bg-card), border 1px var(--border), 
                border-radius 20px, padding 4px 12px, font 12px mono
          ▲ positive: color var(--green)
          ▼ negative: color var(--red)
          shows "--" if fetch fails
          refreshes every 5 minutes

<nav>
  height          : 44px
  position        : sticky
  top             : 52px
  background      : var(--bg-primary)
  border-bottom   : 1px solid var(--border)
  z-index         : 99
  display         : flex
  align-items     : center
  padding         : 0 16px
  gap             : 4px

  Tab buttons:
    font          : 13px var(--font-ui)
    padding       : 6px 14px
    border-radius : 6px
    border        : none
    cursor        : pointer
    transition    : all 0.15s
    
    Default       : background transparent, color var(--text-muted)
    Hover         : background var(--bg-card), color var(--text-primary)
    Active        : background var(--accent-blue), color #fff

  8 tabs: HH Chart | TTF Chart | Spot Price | Spread Analysis |
          Forward Curve | Expiry Table | Daily Log | HH/TTF Spread

<main>
  margin-top      : 96px  (52px header + 44px nav)
  height          : calc(100vh - 96px)
  overflow        : hidden

Each .panel:
  height          : 100%
  display         : flex
  flex-direction  : column
  overflow-y      : auto

  .control-bar
    position      : sticky
    top           : 0
    background    : var(--bg-primary)
    border-bottom : 1px solid var(--border)
    padding       : 10px 16px
    display       : flex
    flex-wrap     : wrap
    gap           : 10px
    align-items   : center
    z-index       : 10

  .stats-row
    display               : grid
    grid-template-columns : repeat(4, 1fr)
    gap                   : 12px
    padding               : 12px 16px

  .stat-card
    background    : var(--bg-card)
    border        : 1px solid var(--border)
    border-radius : 8px
    padding       : 14px 16px
    cursor        : default
    transition    : border-color 0.15s
    :hover        → border-color var(--border-hover)

    .stat-label   font-size 11px, uppercase, letter-spacing 0.08em, 
                  color var(--text-muted)
    .stat-value   font-size 22px, var(--font-mono), color var(--text-primary), 
                  margin 4px 0
    .stat-sub     font-size 11px, color var(--text-dim)

  .chart-wrap
    flex          : 1
    min-height    : 400px
    height        : calc(100vh - 340px)   ← THIS IS CRITICAL — charts were blank 
    padding       : 0 16px 16px           without an explicit height on this div

--- PLOTLY CONFIG (apply to EVERY chart, no exceptions) ---

layout:
  paper_bgcolor  : '#0d1117'
  plot_bgcolor   : '#161b22'
  font           : { color: '#e6edf3', family: 'JetBrains Mono, monospace', size: 11 }
  xaxis          : { gridcolor: '#21262d', zerolinecolor: '#30363d', showgrid: true }
  yaxis          : { gridcolor: '#21262d', zerolinecolor: '#30363d', showgrid: true }
  margin         : { t: 40, r: 24, b: 56, l: 64 }
  hoverlabel     : { bgcolor: 'rgba(22,27,34,0.95)',
                     bordercolor: 'rgba(88,166,255,0.3)',
                     font: { color: '#e6edf3', size: 12 } }
  legend         : { bgcolor: 'rgba(22,27,34,0.8)', bordercolor: '#30363d' }
  autosize       : true

config:
  displayModeBar          : true
  modeBarButtonsToRemove  : ['lasso2d', 'select2d', 'autoScale2d']
  responsive              : true
  displaylogo             : false

Use Plotly.react() for updates (not Plotly.newPlot every time — avoids flicker)

--- SELECT DROPDOWNS ---

background    : var(--bg-card)
border        : 1px solid var(--border)
color         : var(--text-primary)
border-radius : 6px
padding       : 6px 10px
font          : 13px var(--font-mono)
cursor        : pointer
outline       : none
:focus, :hover → border-color var(--accent-blue)

--- T-DAY SEGMENTED BUTTONS ---

Group of 13 buttons: 25|50|75|100|150|200|250|300|350|400|450|500|518

Active   : background var(--accent-blue), color #fff, border-color var(--accent-blue)
Inactive : background var(--bg-card), color var(--text-muted), border 1px var(--border)
Hover    : background var(--bg-panel), color var(--text-primary)
Font     : 11px var(--font-mono)
Radius   : 4px
Padding  : 4px 8px

--- SCROLLBAR ---

::-webkit-scrollbar         width 6px, height 6px
::-webkit-scrollbar-track   background var(--bg-primary)
::-webkit-scrollbar-thumb   background var(--border), border-radius 3px
::-webkit-scrollbar-thumb:hover  background var(--text-dim)

=======================================================================
TOOLTIP SYSTEM (tooltip.js)
=======================================================================

Single global <div id="global-tooltip"> at end of <body>.
Any HTML element with a data-tooltip="..." attribute gets tooltip behavior 
automatically via event delegation on document.
Zero per-element initialization required.

--- POSITIONING MATH ---

  const rect    = trigger.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  let   left    = centerX - tooltip.offsetWidth / 2
  let   top     = rect.top + window.scrollY - tooltip.offsetHeight - 14

  // Flip to below if not enough room above
  if (top - window.scrollY < 8) {
    top = rect.bottom + window.scrollY + 8
  }

  // Anti-overflow horizontal clamp
  left = Math.max(8, Math.min(left, window.innerWidth - tooltip.offsetWidth - 8))

  tooltip.style.left = left + 'px'
  tooltip.style.top  = top  + 'px'

--- CSS for #global-tooltip ---

  position             : fixed
  z-index              : 9999
  pointer-events       : none
  background           : rgba(22, 27, 34, 0.95)
  backdrop-filter      : blur(8px)
  -webkit-backdrop-filter: blur(8px)
  border               : 1px solid rgba(88, 166, 255, 0.3)
  border-radius        : 8px
  padding              : 8px 12px
  color                : #e6edf3
  font-size            : 12px
  line-height          : 1.5
  max-width            : 280px
  box-shadow           : 0 8px 32px rgba(0,0,0,0.6),
                         0 2px 8px rgba(88,166,255,0.15)
  opacity              : 0
  transform            : translateY(10px)
  transition           : opacity 0.15s ease, transform 0.15s ease
  white-space          : pre-line
  font-family          : var(--font-mono)

Class .tooltip-visible:
  opacity   : 1
  transform : translateY(0)

--- MOUSE EVENTS ---

  document.addEventListener('mouseover', e => {
    const trigger = e.target.closest('[data-tooltip]')
    if (!trigger) return
    tooltip.textContent = trigger.dataset.tooltip
    tooltip.classList.add('tooltip-visible')
    // position after adding class so offsetWidth is correct
    requestAnimationFrame(() => positionTooltip(trigger))
  })

  document.addEventListener('mouseout', e => {
    const trigger = e.target.closest('[data-tooltip]')
    if (!trigger) return
    tooltip.classList.remove('tooltip-visible')
  })

--- TOUCH EVENTS (mobile) ---

  document.addEventListener('touchstart', e => {
    const trigger = e.target.closest('[data-tooltip]')
    if (!trigger) {
      tooltip.classList.remove('tooltip-visible')
      return
    }
    tooltip.textContent = trigger.dataset.tooltip
    tooltip.classList.add('tooltip-visible')
    requestAnimationFrame(() => positionTooltip(trigger))
  }, { passive: true })

--- TOOLTIP CONTENT MAP (what goes in data-tooltip for each element) ---

Stat card HIGH      : "Highest closing price\nfor this contract\nover selected T-Day window"
Stat card LOW       : "Lowest closing price\nfor this contract\nover selected T-Day window"
Stat card LAST PRICE: "Most recent available close\nLive from Yahoo Finance\nor last CSV row if expired"
Stat card DAYS TRADED:"Total trading days\nfrom contract inception\nto latest available date"
5Y Seasonal card    : "Mean of same delivery month\nover last 5 calendar years\nat each T-Day position"
T-Day label         : "Trading day from contract inception\nT-1 = first day contract traded\nNot calendar days"
Expiry table cell   : populated dynamically: "{contractID}\nExpiry: {date}\n${price} | {n}Y Avg: ${avg} ({delta}%)"
Spread col header   : "{year} spread data\n{n} trading days available\nSource: Cleaned_Database CSVs"
TTF unit badge      : "European gas benchmark\nEUR per Megawatt-hour\n÷11.63 for MMBTU equivalent"
Forward overlay btn : "Show forward curve\nas it appeared {n} year(s) ago\nSource: last CSV price on that date"
Daily log Contract  : populated dynamically: "Contract: {id}\nExpiry: {date}\nSource: {source}"

=======================================================================
T-DAY INDEXING (CRITICAL)
=======================================================================

CSVs use calendar dates. All contract chart X-axes must be T-Day (integer 
starting at 1 = first trading day of that contract).

Convert immediately after CSV parse:

  function toTDaySeries(csvRows) {
    return [...csvRows]
      .sort((a, b) => new Date(a.Date) - new Date(b.Date))
      .map((row, i) => ({
        tDay  : i + 1,
        date  : row.Date,
        price : parseFloat(row.Price)
      }))
      .filter(d => !isNaN(d.price))
  }

Hover text for all contract charts: "T-{n} | {YYYY-MM-DD} | {value} {unit}"
Never display raw calendar dates on the X-axis of individual contract charts.

=======================================================================
STITCH LOGIC (CSV history + Yahoo live tail)
=======================================================================

  async function getContractSeries(benchmark, contractID, yahooTicker) {
    const historical  = await loadContractCSV(benchmark, contractID)
    const today       = new Date().toISOString().split('T')[0]
    const lastCSVDate = historical.at(-1)?.Date ?? '1900-01-01'
    const isExpired   = lastCSVDate < today

    let rows = historical.map(r => ({
      date  : r.Date,
      price : parseFloat(r.Price)
    }))

    if (!isExpired && yahooTicker) {
      const live = await fetchYahoo(yahooTicker)
      const tail = live.filter(d => d.date > lastCSVDate)
      rows = [...rows, ...tail]
    }

    return toTDaySeries(rows.map(d => ({ Date: d.date, Price: d.price })))
  }

=======================================================================
DATA LOADER (data_loader.js)
=======================================================================

  const BASE_RAW = 
    'https://raw.githubusercontent.com/yieldchaser/Nat-Gas-Price-His/main/'

  const csvCache = new Map()

  async function loadContractCSV(benchmark, contractID) {
    const key = `${benchmark}::${contractID}`
    if (csvCache.has(key)) return csvCache.get(key)

    const segments = ['Cleaned_Database', benchmark, 'Monthwise', contractID + '.csv']
    const path     = segments.map(s => encodeURIComponent(s)).join('/')
    const url      = BASE_RAW + path

    console.log('[DataLoader] Fetching:', url)   // visible in DevTools for debugging

    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`CSV fetch failed (${resp.status}): ${url}`)

    const text   = await resp.text()
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true }).data
    csvCache.set(key, parsed)
    return parsed
  }

  function generateContractList(prefix, startYear, startMonth, endYear, endMonth) {
    const MC         = ['F','G','H','J','K','M','N','Q','U','V','X','Z']
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun',
                        'Jul','Aug','Sep','Oct','Nov','Dec']
    const contracts  = []
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 0; m < 12; m++) {
        if (y === startYear && m < startMonth) continue
        if (y === endYear   && m > endMonth)   break
        const yy     = String(y).slice(-2)
        const ticker = `${prefix}${MC[m]}${yy}.NYM`
        const id     = `${prefix.toLowerCase()}${MC[m].toLowerCase()}${yy}`
        contracts.push({ contractID: id, yahooTicker: ticker,
                         year: y, month: m, label: `${monthNames[m]} ${y}` })
      }
    }
    return contracts
  }

=======================================================================
YAHOO FETCH (yahoo_fetch.js)
=======================================================================

  const YAHOO_TTL = 4 * 60 * 60 * 1000   // 4 hours

  async function fetchYahoo(ticker) {
    const key    = 'yf_' + ticker
    const cached = sessionStorage.getItem(key)
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < YAHOO_TTL) return data
    }

    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=max`
    let resp
    try {
      resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    } catch (e) {
      console.warn('[Yahoo] Network error:', ticker, e)
      return []
    }
    if (!resp.ok) {
      console.warn('[Yahoo] HTTP', resp.status, ticker)
      return []
    }

    const json    = await resp.json()
    const result  = json?.chart?.result?.[0]
    if (!result) return []

    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []
    const data       = timestamps
      .map((t, i) => ({
        date  : new Date(t * 1000).toISOString().split('T')[0],
        price : closes[i]
      }))
      .filter(d => d.price !== null && d.price !== undefined)

    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    return data
  }

  async function fetchContinuous(ticker) {
    // Returns { price, change, changePct } for header ticker strip
    const url  = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
      if (!resp.ok) return null
      const json   = await resp.json()
      const result = json?.chart?.result?.[0]
      if (!result) return null
      const closes    = result.indicators.quote[0].close.filter(c => c !== null)
      const price     = closes.at(-1)
      const prevClose = closes.at(-2) ?? price
      const change    = price - prevClose
      const changePct = (change / prevClose) * 100
      return { price, change, changePct }
    } catch {
      return null
    }
  }

  async function sweepFullCurve() {
    const today   = new Date()
    const startM  = today.getMonth()     // current month index
    const startY  = today.getFullYear()
    const ngList  = generateContractList('NG',  startY, startM, 2031, 11)
    const ttfList = generateContractList('TTF', startY, startM, 2031, 11)
    const all     = [...ngList, ...ttfList]
    const results = await Promise.allSettled(all.map(c => fetchYahoo(c.yahooTicker)))
    const curveData = {}
    all.forEach((c, i) => {
      if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
        curveData[c.yahooTicker] = results[i].value
      }
    })
    return curveData
  }

=======================================================================
EIA FETCH (eia_fetch.js)
=======================================================================

  const EIA_URL = 'https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls'
  const EIA_TTL = 60 * 60 * 1000   // 1 hour

  async function fetchEIASpot() {
    const cached = sessionStorage.getItem('eia_spot')
    if (cached) {
      const { ts, data } = JSON.parse(cached)
      if (Date.now() - ts < EIA_TTL) return data
    }

    const resp = await fetch(EIA_URL)
    if (!resp.ok) throw new Error('EIA fetch failed: ' + resp.status)

    const buffer  = await resp.arrayBuffer()
    const wb      = XLSX.read(buffer, { type: 'array' })
    const ws      = wb.Sheets['Data 1']
    const raw     = XLSX.utils.sheet_to_json(ws, { header: 1 })

    // Skip first 3 header rows
    const data = raw.slice(3)
      .filter(row => row[1] && row[2])
      .map(row => ({
        date  : row[1],    // col B — may need date parsing
        price : parseFloat(row[2])
      }))
      .filter(d => !isNaN(d.price))
      .sort((a, b) => new Date(a.date) - new Date(b.date))

    sessionStorage.setItem('eia_spot', JSON.stringify({ ts: Date.now(), data }))
    return data
  }

=======================================================================
DATA ENGINE (data_engine.js)
=======================================================================

  // toTDaySeries — defined above in T-DAY INDEXING section

  // getContractSeries — defined above in STITCH LOGIC section

  async function getSeasonalBand(benchmark, monthIndex, targetYear, tDayWindow) {
    // Get same delivery month for last 5 years before targetYear
    const MC        = ['f','g','h','j','k','m','n','q','u','v','x','z']
    const years     = [1,2,3,4,5].map(n => targetYear - n)
    const series    = []

    for (const y of years) {
      const yy  = String(y).slice(-2)
      const id  = `ng${MC[monthIndex]}${yy}`
      try {
        const data = await getContractSeries(benchmark, id, null)
        if (data.length > 0) series.push(data)
      } catch { /* skip missing years */ }
    }

    if (series.length === 0) return { avg: [], high: [], low: [], tDays: [] }

    const maxT  = Math.min(tDayWindow, ...series.map(s => s.length))
    const tDays = Array.from({ length: maxT }, (_, i) => i + 1)
    const avg   = tDays.map(t => {
      const vals = series.map(s => s[t-1]?.price).filter(v => v !== undefined)
      return vals.reduce((a,b) => a+b, 0) / vals.length
    })
    const high  = tDays.map(t =>
      Math.max(...series.map(s => s[t-1]?.price).filter(v => v !== undefined)))
    const low   = tDays.map(t =>
      Math.min(...series.map(s => s[t-1]?.price).filter(v => v !== undefined)))

    return { avg, high, low, tDays }
  }

  async function getSpreadSeries(benchmark, frontMonthIdx, backMonthIdx, year) {
    const MC    = ['f','g','h','j','k','m','n','q','u','v','x','z']
    const yy    = String(year).slice(-2)
    const frontID = `ng${MC[frontMonthIdx]}${yy}`
    const backID  = `ng${MC[backMonthIdx]}${yy}`

    const [frontRaw, backRaw] = await Promise.all([
      loadContractCSV(benchmark, frontID),
      loadContractCSV(benchmark, backID)
    ])

    const backMap = new Map(backRaw.map(r => [r.Date, parseFloat(r.Price)]))
    const spread  = []
    for (const row of frontRaw.sort((a,b) => new Date(a.Date)-new Date(b.Date))) {
      const bPrice = backMap.get(row.Date)
      if (bPrice !== undefined) {
        spread.push({ date: row.Date, spread: parseFloat(row.Price) - bPrice })
      }
    }
    return spread.map((d,i) => ({ tDay: i+1, date: d.date, spread: d.spread }))
  }

  async function getExpiryPrices(benchmark) {
    // Returns map of contractID → { price, date }
    // Caller must enumerate available contract IDs from Yearwise or Monthwise file listing
    // (Cannot enumerate GitHub directory — must be pre-loaded or iterated from known list)
    // Build from the contract list generated by generateContractList
    const result = {}
    const allContracts = generateContractList(
      benchmark === 'Henry Hub' ? 'ng' : 'ttf', 2010, 0, 
      new Date().getFullYear(), 11
    )
    await Promise.allSettled(allContracts.map(async c => {
      try {
        const rows = await loadContractCSV(benchmark, c.contractID)
        if (rows.length > 0) {
          const last = rows.at(-1)
          result[c.contractID] = { price: parseFloat(last.Price), date: last.Date,
                                   year: c.year, month: c.month }
        }
      } catch { /* contract file doesn't exist, skip */ }
    }))
    return result
  }

  function eurusdConvert(ttfSeries, rate) {
    return ttfSeries.map(d => ({ ...d, price: d.price * rate }))
  }

=======================================================================
CHARTS (charts.js)
=======================================================================

All chart containers must have explicit height before Plotly renders.
Use Plotly.react() for updates, Plotly.newPlot() only for first render.

  function buildBaseLayout(title, yLabel) {
    return {
      paper_bgcolor : '#0d1117',
      plot_bgcolor  : '#161b22',
      font          : { color: '#e6edf3', family: 'JetBrains Mono, monospace', size: 11 },
      title         : { text: title, font: { size: 13, color: '#8b949e' }, x: 0.01 },
      xaxis         : { gridcolor: '#21262d', zerolinecolor: '#30363d',
                        title: { text: 'Trading Day (T)', font: { size: 11 } } },
      yaxis         : { gridcolor: '#21262d', zerolinecolor: '#30363d',
                        title: { text: yLabel, font: { size: 11 } } },
      margin        : { t: 40, r: 24, b: 56, l: 64 },
      hoverlabel    : { bgcolor: 'rgba(22,27,34,0.95)',
                        bordercolor: 'rgba(88,166,255,0.3)',
                        font: { color: '#e6edf3', size: 12 } },
      legend        : { bgcolor: 'rgba(22,27,34,0.8)', bordercolor: '#30363d' },
      autosize      : true
    }
  }

  const PLOTLY_CONFIG = {
    displayModeBar         : true,
    modeBarButtonsToRemove : ['lasso2d','select2d','autoScale2d'],
    responsive             : true,
    displaylogo            : false
  }

  function renderContractChart(containerID, series, band, tDayWindow, title, unit) {
    const sliced  = series.slice(0, tDayWindow)
    const tDays   = sliced.map(d => d.tDay)
    const prices  = sliced.map(d => d.price)
    const hovers  = sliced.map(d => `T-${d.tDay} | ${d.date} | ${d.price.toFixed(3)} ${unit}`)

    const traces = [
      {
        // 5Y High (top of band) — invisible line
        x: band.tDays, y: band.high, name: '5Y High',
        mode: 'lines', line: { width: 0 }, showlegend: false,
        hoverinfo: 'skip'
      },
      {
        // 5Y Low (bottom of band) — fills to trace above
        x: band.tDays, y: band.low, name: '5Y Range',
        mode: 'lines', line: { width: 0 },
        fill: 'tonexty', fillcolor: 'rgba(139,148,158,0.15)',
        hoverinfo: 'skip'
      },
      {
        // 5Y Average
        x: band.tDays, y: band.avg, name: '5Y Avg',
        mode: 'lines', line: { color: '#d29922', width: 1.5, dash: 'dash' }
      },
      {
        // Selected contract
        x: tDays, y: prices, name: title, text: hovers,
        mode: 'lines', line: { color: '#58a6ff', width: 2 },
        hovertemplate: '%{text}<extra></extra>'
      }
    ]

    const layout = buildBaseLayout(title, unit)
    const el     = document.getElementById(containerID)
    
    if (el._plotlyRendered) {
      Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    } else {
      Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG)
      el._plotlyRendered = true
    }
  }

  function renderForwardCurve(containerID, ngCurve, ttfCurve) {
    // ngCurve  = [{ label: "May 26", price: 2.847 }, ...]
    // ttfCurve = [{ label: "May 26", price: 34.48 }, ...]
    const traces = [
      {
        x: ngCurve.map(d => d.label), y: ngCurve.map(d => d.price),
        name: 'HH ($/MMBTU)', mode: 'lines+markers',
        line: { color: '#58a6ff', width: 2 },
        marker: { size: 5 }, yaxis: 'y'
      },
      {
        x: ttfCurve.map(d => d.label), y: ttfCurve.map(d => d.price),
        name: 'TTF (€/MWh)', mode: 'lines+markers',
        line: { color: '#d29922', width: 2 },
        marker: { size: 5 }, yaxis: 'y2'
      }
    ]

    const layout = {
      ...buildBaseLayout('Forward Curve', ''),
      yaxis  : { ...buildBaseLayout('','').yaxis, title: { text: '$/MMBTU' },
                 side: 'left' },
      yaxis2 : { title: { text: '€/MWh', font: { size: 11 } },
                 overlaying: 'y', side: 'right',
                 gridcolor: '#21262d', color: '#d29922' }
    }

    const el = document.getElementById(containerID)
    if (el._plotlyRendered) Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    else { Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG); el._plotlyRendered = true }
  }

  function renderSpreadChart(containerID, spreadSeries, avgBand) {
    const traces = [
      {
        x: avgBand.tDays, y: avgBand.high, mode: 'lines',
        line: { width: 0 }, showlegend: false, hoverinfo: 'skip'
      },
      {
        x: avgBand.tDays, y: avgBand.low, name: 'Hist. Range',
        mode: 'lines', line: { width: 0 },
        fill: 'tonexty', fillcolor: 'rgba(139,148,158,0.12)', hoverinfo: 'skip'
      },
      {
        x: avgBand.tDays, y: avgBand.avg, name: 'Hist. Avg',
        mode: 'lines', line: { color: '#d29922', width: 1.5, dash: 'dash' }
      },
      {
        x: spreadSeries.map(d => d.tDay),
        y: spreadSeries.map(d => d.spread),
        name: 'Selected Year', mode: 'lines',
        line: { color: '#58a6ff', width: 2 },
        hovertemplate: 'T-%{x} | %{y:.3f}<extra></extra>'
      }
    ]
    const layout = buildBaseLayout('Calendar Spread', '$/MMBTU')
    layout.shapes = [{ type: 'line', x0: 0, x1: 1, xref: 'paper',
                       y0: 0, y1: 0, yref: 'y',
                       line: { color: '#30363d', width: 1, dash: 'dot' } }]
    const el = document.getElementById(containerID)
    if (el._plotlyRendered) Plotly.react(containerID, traces, layout, PLOTLY_CONFIG)
    else { Plotly.newPlot(containerID, traces, layout, PLOTLY_CONFIG); el._plotlyRendered = true }
  }

=======================================================================
8 DASHBOARD PANELS — FULL SPEC
=======================================================================

--- PANEL 1: HH CHART ---

HTML ID : panel-hh
Controls: 
  <select id="hh-year">  options 1991–2031
  <select id="hh-month"> options Jan(F)–Dec(Z)
  T-Day group: 13 buttons, IDs hh-tday-{value}
  Default: current year, current month, T-Day 250

Stats (with data-tooltip):
  HIGH | LOW | LAST PRICE | DAYS TRADED  (unit: $/MMBTU)

Chart div ID: hh-chart  (class: chart-wrap, height required)

On contract select:
  1. getContractSeries('Henry Hub', contractID, yahooTicker)
  2. getSeasonalBand('Henry Hub', monthIdx, year, tDayWindow)
  3. renderContractChart('hh-chart', series, band, tDayWindow, label, '$/MMBTU')
  4. Update stat cards: max(prices), min(prices), last price, series.length

--- PANEL 2: TTF CHART ---

HTML ID : panel-ttf
Identical structure to HH Chart.
Unit: EUR/MWh
Default: current year, current month
Data: Cleaned_Database/Dutch TTF/ + TTF{MC}{YY}.NYM live

--- PANEL 3: SPOT PRICE ---

HTML ID : panel-spot
Same layout as HH/TTF.
Data: Cleaned_Database/Spot Price/ CSVs + EIA XLS live tail
Unit: $/MMBTU
Spot CSVs are continuous series — no "expiry" concept.
Seasonal band still applies (same delivery month, last 5 years).

--- PANEL 4: SPREAD ANALYSIS ---

HTML ID : panel-spread
Controls:
  <select id="spread-front">   Jan–Dec
  <select id="spread-back">    Jan–Dec (must differ from front)
  <select id="spread-year">    1999–current year
  T-Day group (same 13 options)

Table (below controls, above chart):
  Build as HTML <table> with sticky first column (Year labels)
  
  Columns: 1999 | 2000 | ... | current year | ‖ | All-Yr | 10Y | 5Y | 3Y
  Avg columns: left border separator, lighter background
  Selected year column: border 1px solid var(--accent-amber)
  
  Rows:
    "T-Day"         spread value at selected T-Day (or last available)
    "90-Day"        spread at T-90 (or last available)
    "10-Day"        spread at T-10 (or last available)
    "Penultimate"   spread at second-to-last trading day
    "Max"           maximum spread value in window
    "Min"           minimum spread value in window
    "Average"       mean spread over window

  Cell tooltips: data-tooltip="{contractID} | {date} | {value}"

Chart below table (ID: spread-chart, class chart-wrap, height 280px):
  renderSpreadChart with selected year vs avg band

--- PANEL 5: FORWARD CURVE ---

HTML ID : panel-curve
On first visit: trigger sweepFullCurve() if not already done
Show #global-loader until data arrives

Controls: toggle buttons [Today][-1Y][-2Y][-3Y] for overlays

Primary chart (ID: curve-chart):
  renderForwardCurve with ngCurve + ttfCurve
  
Historical overlays: when -1Y/-2Y/-3Y toggled, add trace of dashed 
lighter lines using last available CSV price for each contract on 
approx date 1/2/3 years prior

After load: hide #global-loader, show chart

--- PANEL 6: EXPIRY TABLE ---

HTML ID : panel-expiry
Controls: toggle [3Y Avg][5Y Avg][All Years] for color mode

Table: 13 rows (Jan–Dec + header) × columns (2010–current + Avg footer)
Build as HTML <table>

On load: call getExpiryPrices('Henry Hub')
Populate cells with settlement prices
Color: green if price > selected-avg for that month, red if below
Footer row: N-year average per month
Cell tooltip: "{contractID}\nExpiry: {date}\n${price} | {n}Y Avg: ${avg} ({delta}%)"

--- PANEL 7: DAILY LOG ---

HTML ID : panel-log
Columns: Date | Open | Close | Daily % | Weekly % | Week No. | Contract | Expiry

Data: load recent HH Monthwise CSVs (last 2 active contracts)
      + fetch NG=F from Yahoo for most recent data point

Display: latest 90 rows by default
         "Load More" button appends next 90

Row calculations:
  Daily %  = (Close - PrevClose) / PrevClose × 100
             format: "+1.23%" green, "-0.87%" red
  Weekly % = (Close - first close of ISO week) / first close × 100
  Week No. = ISO week: Math.ceil((dayOfYear + firstDayOffset) / 7)
  Expiry   = last Date in that contract's CSV
  
Today's row (if live): amber left border 3px solid var(--accent-amber)

--- PANEL 8: HH/TTF SPREAD ---

HTML ID : panel-cross
Controls:
  <select id="cross-hh-month">  Jan–Dec
  <select id="cross-hh-year">   2018–current (TTF data starts 2018)
  <select id="cross-ttf-month"> Jan–Dec (default = same as HH)
  <select id="cross-ttf-year">  2018–current
  Toggle: [Native Units][USD Equivalent]

Native mode: dual Y-axes
  HH  : left Y-axis ($/MMBTU), blue line
  TTF : right Y-axis (€/MWh), amber line
  X   : T-Day

USD mode: single Y-axis
  Fetch EURUSD=X rate via fetchYahoo('EURUSD=X')
  TTF series multiplied by rate → both in $/MMBTU equivalent
  Chart subtitle: "EUR/USD: {rate:.4f} (live)"
  
Below primary chart: spread line (HH - TTF_converted) in USD mode only

=======================================================================
APP.JS — INIT SEQUENCE
=======================================================================

  document.addEventListener('DOMContentLoaded', async () => {

    // 1. Tooltips
    initTooltips()

    // 2. Tab routing
    const tabs   = document.querySelectorAll('[data-tab]')
    const panels = document.querySelectorAll('.panel')
    const state  = {
      activeTab : 'hh',
      hh        : { year: new Date().getFullYear(), month: new Date().getMonth(), tDay: 250 },
      ttf       : { year: new Date().getFullYear(), month: new Date().getMonth(), tDay: 250 },
      spot      : { year: new Date().getFullYear(), month: new Date().getMonth(), tDay: 250 },
      spread    : { front: 0, back: 1, year: new Date().getFullYear(), tDay: 250 },
      cross     : { mode: 'native' },
      initialized: new Set()
    }

    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'))
      panels.forEach(p => p.style.display = 'none')
      tab.classList.add('active')
      const id = tab.dataset.tab
      document.getElementById('panel-' + id).style.display = 'flex'
      state.activeTab = id
      if (!state.initialized.has(id)) {
        state.initialized.add(id)
        initPanel(id, state)
      }
    }))

    // 3. Default tab: HH Chart
    document.querySelector('[data-tab="hh"]').click()

    // 4. Header ticker strip
    async function updateTicker() {
      const [ng, ttf] = await Promise.all([
        fetchContinuous('NG=F'),
        fetchContinuous('TTF=F')
      ])
      updateTickerUI('ng-ticker', ng,  '$', '$/MMBTU')
      updateTickerUI('ttf-ticker', ttf, '€', '€/MWh')
    }
    updateTicker()
    setInterval(updateTicker, 5 * 60 * 1000)

    // 5. Background: sweep full curve (for Forward Curve tab)
    sweepFullCurve().then(curveData => {
      window._curveData = curveData
      // If Forward Curve tab is already open, render it
      if (state.activeTab === 'curve') renderForwardCurvePanel(curveData)
    })

    // 6. Background: EIA spot data
    fetchEIASpot().then(data => { window._eiaSpot = data })
  })

  function updateTickerUI(elID, data, symbol, unit) {
    const el = document.getElementById(elID)
    if (!el) return
    if (!data) { el.textContent = '--'; return }
    const sign  = data.change >= 0 ? '▲' : '▼'
    const color = data.change >= 0 ? '#3fb950' : '#f85149'
    el.innerHTML = `${symbol}${data.price.toFixed(3)} 
      <span style="color:${color}">${sign} ${Math.abs(data.changePct).toFixed(2)}%</span>`
  }

  async function initPanel(id, state) {
    switch(id) {
      case 'hh'    : await initHHChart(state); break
      case 'ttf'   : await initTTFChart(state); break
      case 'spot'  : await initSpotChart(state); break
      case 'spread': await initSpreadPanel(state); break
      case 'curve' : await initForwardCurve(state); break
      case 'expiry': await initExpiryTable(state); break
      case 'log'   : await initDailyLog(state); break
      case 'cross' : await initCrossSpread(state); break
    }
  }

=======================================================================
KNOWN FACTS — DO NOT RE-TEST, DO NOT CONTRADICT
=======================================================================

HH NYMEX:
  Yahoo returns ~126 bars per active contract, not full history from inception
  "First Date" 2014-01-01 in Yahoo response = metadata artifact, ignore it
  Expired contracts always 404 on Yahoo — use Cleaned_Database CSVs instead
  Active forward curve: Apr 2026 → Jun 2031 = 69 contracts confirmed working
  Jul 2031–Oct 2033 = patchy CME listing gaps, skip silently
  Unit: $/MMBTU

Dutch TTF:
  Correct Yahoo symbol: TTF{MC}{YY}.NYM (e.g. TTFK26.NYM)
  TTFK26.NYM ✅  TTFM26.NYM ✅  TTFN26.NYM ✅
  TTFV26.NYM = 404 (not yet listed, expected, not a code error)
  TTF=F = continuous front-month, confirmed working ✅
  TTF curve shorter/patchier than HH — same sweep logic, skip 404s
  Unit: EUR/MWh — never share a Y-axis with $/MMBTU values
  NEVER USE: TTF26.NYM / TFAF26.NYM / TTFF26.ICE / TFA-F / TTFDc1

EIA Spot:
  https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls confirmed live ✅
  Parse with SheetJS: sheet "Data 1", skip 3 rows, col B date, col C price

CSV:
  Exactly 4 columns: "S No." | "Date" | "Price" | "Contract ID"
  Date format: YYYY-MM-DD
  Folder names contain spaces → encode each segment individually

Previous failure causes (DO NOT repeat):
  .chart-wrap had no explicit height → Plotly rendered into 0px div → blank chart
  JS modules were written as stubs → data never loaded → stats showed "——"
  TTF live was blocked on wrong symbol formats → TTF header showed "--"
  sweepFullCurve() never called → Forward Curve tab always blank

=======================================================================
BUILD ORDER — ONE FILE PER MESSAGE, STOP AFTER EACH
=======================================================================

STEP 1  → index.html
STEP 2  → style.css
STEP 3  → js/tooltip.js
STEP 4  → js/data_loader.js
STEP 5  → js/yahoo_fetch.js
STEP 6  → js/eia_fetch.js
STEP 7  → js/data_engine.js
STEP 8  → js/charts.js
STEP 9  → app.js
STEP 10 → Verification checklist:
           List every fetch URL called at init with full encoded string
           List every Yahoo ticker requested at load
           Confirm .chart-wrap has explicit height in style.css
           Confirm Plotly.react() used for updates not newPlot
           Confirm no unencoded spaces in any URL

=======================================================================
START — STEP 1 ONLY
=======================================================================

Write index.html now. Requirements:
  - 8 tab buttons in <nav>, each with data-tab="{id}" attribute
    IDs: hh | ttf | spot | spread | curve | expiry | log | cross
  - 8 <section class="panel" id="panel-{id}"> divs
  - Each panel has .control-bar, .stats-row (4 stat-cards), .chart-wrap
  - HH panel control-bar: year <select>, month <select>, 
    13 T-day buttons (25,50,75,100,150,200,250,300,350,400,450,500,518)
  - All stat-cards have data-tooltip attributes per the tooltip content map
  - CDN tags: Plotly 2.35.2, Papa Parse 5.4.1, SheetJS 0.20.3, JetBrains Mono
  - JS imports in order: tooltip.js, data_loader.js, yahoo_fetch.js, 
    eia_fetch.js, data_engine.js, charts.js, app.js
  - <div id="global-tooltip"></div> at end of body
  - <div id="global-loader"> with centered spinner, hidden by default
  - panel-hh visible by default (display:flex), all others display:none
  - Header structure: left = app name, right = #ng-ticker and #ttf-ticker spans

After writing index.html, write out the exact encoded fetch URL for:
  (a) Henry Hub Monthwise ngv24.csv
  (b) Your best-guess Dutch TTF Monthwise file (flag as unverified)

Then STOP. Do not write style.css until confirmed.
