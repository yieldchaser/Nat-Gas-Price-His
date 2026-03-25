/**
 * APP.JS — MAIN APPLICATION
 * 
 * Entry point: initializes tooltips, tab routing, live tickers,
 * background data fetching, and 8 panel controllers.
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[App] Initializing...')

    // 1. INITIALIZE TOOLTIPS
    initTooltips()

    // 2. SET UP TAB ROUTING & STATE
    const tabs = document.querySelectorAll('.tab-button')
    const panels = document.querySelectorAll('.panel')

    const state = {
        activeTab: 'hh',
        hh: {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            tDay: 250
        },
        ttf: {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            tDay: 250
        },
        spot: {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
            tDay: 250
        },
        spread: {
            front: 0,
            back: 1,
            year: new Date().getFullYear(),
            tDay: 250
        },
        cross: {
            mode: 'native'  // 'native' or 'usd'
        },
        initialized: new Set()
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'))
            panels.forEach(p => p.style.display = 'none')

            tab.classList.add('active')
            const tabID = tab.dataset.tab
            const panel = document.getElementById('panel-' + tabID)
            if (panel) panel.style.display = 'flex'

            state.activeTab = tabID

            // Lazy init: only initialize panel once
            if (!state.initialized.has(tabID)) {
                state.initialized.add(tabID)
                initPanel(tabID, state)
            }
        })
    })

    // 3. DEFAULT TAB: HH CHART
    const hhTab = Array.from(tabs).find(t => t.dataset.tab === 'hh')
    if (hhTab) hhTab.click()

    // 4. HEADER TICKER STRIP (live updates every 5 min)
    async function updateTickerStrip() {
        try {
            const [ng, ttf] = await Promise.all([
                fetchContinuous('NG=F'),
                fetchContinuous('TTF=F')
            ])
            updateTickerUI('ng-ticker', ng, '$', ' $/MMBTU')
            updateTickerUI('ttf-ticker', ttf, '€', ' €/MWh')
        } catch (e) {
            console.error('[Ticker] Update failed:', e)
        }
    }

    updateTickerStrip()
    setInterval(updateTickerStrip, 5 * 60 * 1000)

    // 5. BACKGROUND: SWEEP FULL FUTURES CURVE
    (async () => {
        try {
            const curveData = await sweepFullCurve()
            window._curveData = curveData
            console.log('[App] Curve data loaded:', Object.keys(curveData).length, 'tickers')
        } catch (e) {
            console.error('[App] Curve sweep failed:', e)
        }
    })()

    // 6. BACKGROUND: FETCH EIA SPOT DATA
    (async () => {
        try {
            const eiaData = await fetchEIASpot()
            window._eiaSpot = eiaData
            console.log('[App] EIA spot data loaded:', eiaData.length, 'rows')
        } catch (e) {
            console.error('[App] EIA fetch failed:', e)
        }
    })()
})

/**
 * Update ticker pill in header
 */
function updateTickerUI(elID, data, symbol, unit) {
    const el = document.getElementById(elID)
    if (!el) return

    if (!data) {
        el.textContent = '--'
        return
    }

    const sign = data.change >= 0 ? '▲' : '▼'
    const color = data.change >= 0 ? '#3fb950' : '#f85149'
    el.innerHTML = `${symbol}${data.price.toFixed(3)} <span style="color:${color}">${sign} ${Math.abs(data.changePct).toFixed(2)}%</span>`
}

/**
 * Route panel initialization based on tab ID
 */
async function initPanel(id, state) {
    switch (id) {
        case 'hh':
            await initHHChart(state)
            break
        case 'ttf':
            await initTTFChart(state)
            break
        case 'spot':
            await initSpotChart(state)
            break
        case 'spread':
            await initSpreadPanel(state)
            break
        case 'curve':
            await initForwardCurve(state)
            break
        case 'expiry':
            await initExpiryTable(state)
            break
        case 'log':
            await initDailyLog(state)
            break
        case 'cross':
            await initCrossSpread(state)
            break
    }
}

/* ===================================================================
   PANEL 1: HH CHART
   =================================================================== */

async function initHHChart(state) {
    console.log('[HH] Initializing...')
    try {
        const yearSel = document.getElementById('hh-year')
        const monthSel = document.getElementById('hh-month')
        const tdayButtons = document.querySelectorAll('#panel-hh .tday-button')

        // Populate year dropdown (1991-2031)
        for (let y = 1991; y <= 2031; y++) {
            const opt = document.createElement('option')
            opt.value = y
            opt.textContent = y
            if (y === state.hh.year) opt.selected = true
            yearSel.appendChild(opt)
        }

        // Populate month dropdown (Jan-Dec)
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthNames.forEach((name, idx) => {
            const opt = document.createElement('option')
            opt.value = idx
            opt.textContent = name
            if (idx === state.hh.month) opt.selected = true
            monthSel.appendChild(opt)
        })

        // T-day buttons
        tdayButtons.forEach(btn => {
            const tday = parseInt(btn.dataset.tday)
            if (tday === state.hh.tDay) btn.classList.add('active')
            btn.addEventListener('click', async () => {
                state.hh.tDay = tday
                tdayButtons.forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                await renderHHChart(state)
            })
        })

        // Select change events
        yearSel.addEventListener('change', async () => {
            state.hh.year = parseInt(yearSel.value)
            await renderHHChart(state)
        })

        monthSel.addEventListener('change', async () => {
            state.hh.month = parseInt(monthSel.value)
            await renderHHChart(state)
        })

        // Initial render
        await renderHHChart(state)
    } catch (e) {
        console.error('[HH] Init failed:', e)
    }
}

async function renderHHChart(state) {
    try {
        const MC = ['f', 'g', 'h', 'j', 'k', 'm', 'n', 'q', 'u', 'v', 'x', 'z']
        const yy = String(state.hh.year).slice(-2)
        const contractID = `ng${MC[state.hh.month]}${yy}`
        const yahooTicker = `NG${MC[state.hh.month].toUpperCase()}${yy}.NYM`

        const series = await getContractSeries('Henry Hub', contractID, yahooTicker)
        const band = await getSeasonalBand('Henry Hub', state.hh.month, state.hh.year, state.hh.tDay)

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December']
        const title = `${monthNames[state.hh.month]} ${state.hh.year}`

        renderContractChart('hh-chart', series, band, state.hh.tDay, title, '$/MMBTU')

        // Update stats
        const sliced = series.slice(0, state.hh.tDay)
        const prices = sliced.map(d => d.price).filter(p => !isNaN(p))

        document.getElementById('hh-stat-high').textContent = prices.length > 0
            ? Math.max(...prices).toFixed(3)
            : '--'
        document.getElementById('hh-stat-low').textContent = prices.length > 0
            ? Math.min(...prices).toFixed(3)
            : '--'
        document.getElementById('hh-stat-last').textContent = series.length > 0
            ? series.at(-1).price.toFixed(3)
            : '--'
        document.getElementById('hh-stat-days').textContent = series.length

    } catch (e) {
        console.error('[HH] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 2: TTF CHART
   =================================================================== */

async function initTTFChart(state) {
    console.log('[TTF] Initializing...')
    try {
        const yearSel = document.getElementById('ttf-year')
        const monthSel = document.getElementById('ttf-month')
        const tdayButtons = document.querySelectorAll('#panel-ttf .tday-button')

        for (let y = 2010; y <= 2031; y++) {
            const opt = document.createElement('option')
            opt.value = y
            opt.textContent = y
            if (y === state.ttf.year) opt.selected = true
            yearSel.appendChild(opt)
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthNames.forEach((name, idx) => {
            const opt = document.createElement('option')
            opt.value = idx
            opt.textContent = name
            if (idx === state.ttf.month) opt.selected = true
            monthSel.appendChild(opt)
        })

        tdayButtons.forEach(btn => {
            const tday = parseInt(btn.dataset.tday)
            if (tday === state.ttf.tDay) btn.classList.add('active')
            btn.addEventListener('click', async () => {
                state.ttf.tDay = tday
                tdayButtons.forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                await renderTTFChart(state)
            })
        })

        yearSel.addEventListener('change', async () => {
            state.ttf.year = parseInt(yearSel.value)
            await renderTTFChart(state)
        })

        monthSel.addEventListener('change', async () => {
            state.ttf.month = parseInt(monthSel.value)
            await renderTTFChart(state)
        })

        await renderTTFChart(state)
    } catch (e) {
        console.error('[TTF] Init failed:', e)
    }
}

async function renderTTFChart(state) {
    try {
        const MC = ['f', 'g', 'h', 'j', 'k', 'm', 'n', 'q', 'u', 'v', 'x', 'z']
        const yy = String(state.ttf.year).slice(-2)
        const contractID = `ttf${MC[state.ttf.month]}${yy}`
        const yahooTicker = `TTF${MC[state.ttf.month].toUpperCase()}${yy}.NYM`

        const series = await getContractSeries('Dutch TTF', contractID, yahooTicker)
        const band = await getSeasonalBand('Dutch TTF', state.ttf.month, state.ttf.year, state.ttf.tDay)

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December']
        const title = `${monthNames[state.ttf.month]} ${state.ttf.year}`

        renderContractChart('ttf-chart', series, band, state.ttf.tDay, title, '€/MWh')

        const sliced = series.slice(0, state.ttf.tDay)
        const prices = sliced.map(d => d.price).filter(p => !isNaN(p))

        document.getElementById('ttf-stat-high').textContent = prices.length > 0
            ? Math.max(...prices).toFixed(3)
            : '--'
        document.getElementById('ttf-stat-low').textContent = prices.length > 0
            ? Math.min(...prices).toFixed(3)
            : '--'
        document.getElementById('ttf-stat-last').textContent = series.length > 0
            ? series.at(-1).price.toFixed(3)
            : '--'
        document.getElementById('ttf-stat-days').textContent = series.length

    } catch (e) {
        console.error('[TTF] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 3: SPOT PRICE
   =================================================================== */

async function initSpotChart(state) {
    console.log('[Spot] Initializing...')
    try {
        const yearSel = document.getElementById('spot-year')
        const monthSel = document.getElementById('spot-month')
        const tdayButtons = document.querySelectorAll('#panel-spot .tday-button')

        for (let y = 1997; y <= new Date().getFullYear(); y++) {
            const opt = document.createElement('option')
            opt.value = y
            opt.textContent = y
            if (y === state.spot.year) opt.selected = true
            yearSel.appendChild(opt)
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthNames.forEach((name, idx) => {
            const opt = document.createElement('option')
            opt.value = idx
            opt.textContent = name
            if (idx === state.spot.month) opt.selected = true
            monthSel.appendChild(opt)
        })

        tdayButtons.forEach(btn => {
            const tday = parseInt(btn.dataset.tday)
            if (tday === state.spot.tDay) btn.classList.add('active')
            btn.addEventListener('click', async () => {
                state.spot.tDay = tday
                tdayButtons.forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                await renderSpotChart(state)
            })
        })

        yearSel.addEventListener('change', async () => {
            state.spot.year = parseInt(yearSel.value)
            await renderSpotChart(state)
        })

        monthSel.addEventListener('change', async () => {
            state.spot.month = parseInt(monthSel.value)
            await renderSpotChart(state)
        })

        await renderSpotChart(state)
    } catch (e) {
        console.error('[Spot] Init failed:', e)
    }
}

async function renderSpotChart(state) {
    try {
        // Spot Price is loaded by month only, not by year/contract
        const series = await getSpotPriceSeries(state.spot.month, state.spot.year)
        
        // For seasonal band, use same month from previous 5 years
        const band = await getSeasonalBand('Spot Price', state.spot.month, state.spot.year, state.spot.tDay)

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December']
        const title = `${monthNames[state.spot.month]} (from ${state.spot.year})`

        renderContractChart('spot-chart', series, band, state.spot.tDay, title, '$/MMBTU')

        const sliced = series.slice(0, state.spot.tDay)
        const prices = sliced.map(d => d.price).filter(p => !isNaN(p))

        document.getElementById('spot-stat-high').textContent = prices.length > 0
            ? Math.max(...prices).toFixed(3)
            : '--'
        document.getElementById('spot-stat-low').textContent = prices.length > 0
            ? Math.min(...prices).toFixed(3)
            : '--'
        document.getElementById('spot-stat-last').textContent = series.length > 0
            ? series.at(-1).price.toFixed(3)
            : '--'
        document.getElementById('spot-stat-days').textContent = series.length

    } catch (e) {
        console.error('[Spot] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 4: SPREAD ANALYSIS
   =================================================================== */

async function initSpreadPanel(state) {
    console.log('[Spread] Initializing...')
    try {
        const frontSel = document.getElementById('spread-front')
        const backSel = document.getElementById('spread-back')
        const yearSel = document.getElementById('spread-year')
        const tdayButtons = document.querySelectorAll('#panel-spread .tday-button')

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        monthNames.forEach((name, idx) => {
            const opt1 = document.createElement('option')
            opt1.value = idx
            opt1.textContent = name
            if (idx === 0) opt1.selected = true
            frontSel.appendChild(opt1)

            const opt2 = document.createElement('option')
            opt2.value = idx
            opt2.textContent = name
            if (idx === 1) opt2.selected = true
            backSel.appendChild(opt2)
        })

        for (let y = 1999; y <= new Date().getFullYear(); y++) {
            const opt = document.createElement('option')
            opt.value = y
            opt.textContent = y
            if (y === state.spread.year) opt.selected = true
            yearSel.appendChild(opt)
        }

        tdayButtons.forEach(btn => {
            const tday = parseInt(btn.dataset.tday)
            if (tday === state.spread.tDay) btn.classList.add('active')
            btn.addEventListener('click', async () => {
                state.spread.tDay = tday
                tdayButtons.forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                await renderSpreadPanel(state)
            })
        })

        frontSel.addEventListener('change', async () => {
            state.spread.front = parseInt(frontSel.value)
            await renderSpreadPanel(state)
        })

        backSel.addEventListener('change', async () => {
            state.spread.back = parseInt(backSel.value)
            await renderSpreadPanel(state)
        })

        yearSel.addEventListener('change', async () => {
            state.spread.year = parseInt(yearSel.value)
            await renderSpreadPanel(state)
        })

        await renderSpreadPanel(state)
    } catch (e) {
        console.error('[Spread] Init failed:', e)
    }
}

async function renderSpreadPanel(state) {
    try {
        const spreadSeries = await getSpreadSeries('Henry Hub', state.spread.front, state.spread.back, state.spread.year)
        const sliced = spreadSeries.slice(0, state.spread.tDay)
        const spreads = sliced.map(d => d.spread).filter(p => !isNaN(p))

        // Update stats
        document.getElementById('spread-stat-atday').textContent = sliced.length > 0
            ? sliced.at(-1).spread.toFixed(3)
            : '--'
        document.getElementById('spread-stat-max').textContent = spreads.length > 0
            ? Math.max(...spreads).toFixed(3)
            : '--'
        document.getElementById('spread-stat-min').textContent = spreads.length > 0
            ? Math.min(...spreads).toFixed(3)
            : '--'
        document.getElementById('spread-stat-avg').textContent = spreads.length > 0
            ? (spreads.reduce((a, b) => a + b, 0) / spreads.length).toFixed(3)
            : '--'

        // Render chart with historical band
        const band = await getSeasonalBand('Henry Hub', state.spread.front, state.spread.year, state.spread.tDay)
        renderSpreadChart('spread-chart', spreadSeries.slice(0, state.spread.tDay), band)
    } catch (e) {
        console.error('[Spread] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 5: FORWARD CURVE
   =================================================================== */

async function initForwardCurve(state) {
    console.log('[Curve] Initializing...')
    try {
        const overlayButtons = {
            today: document.getElementById('curve-overlay-today'),
            '1y': document.getElementById('curve-overlay-1y'),
            '2y': document.getElementById('curve-overlay-2y'),
            '3y': document.getElementById('curve-overlay-3y')
        }

        overlayButtons.today.classList.add('active')

        Object.entries(overlayButtons).forEach(([key, btn]) => {
            btn.addEventListener('click', async () => {
                Object.values(overlayButtons).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                // TODO: Implement overlay rendering
            })
        })

        // Render with curve data if available
        if (window._curveData) {
            await renderForwardCurveChart(state)
        } else {
            document.getElementById('curve-chart').textContent = 'Loading curve data...'
        }
    } catch (e) {
        console.error('[Curve] Init failed:', e)
    }
}

async function renderForwardCurveChart(state) {
    try {
        const curveData = window._curveData || {}
        const MC = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        const today = new Date()
        const startMonth = today.getMonth()
        const startYear = today.getFullYear()

        const ngCurve = []
        const ttfCurve = []

        for (let y = startYear; y <= 2031; y++) {
            for (let m = 0; m < 12; m++) {
                if (y === startYear && m < startMonth) continue
                if (y === 2031 + 1) break

                const yy = String(y).slice(-2)
                const ngTicker = `NG${MC[m]}${yy}.NYM`
                const ttfTicker = `TTF${MC[m]}${yy}.NYM`
                const label = `${monthNames[m]} ${y}`

                if (curveData[ngTicker] && curveData[ngTicker].length > 0) {
                    ngCurve.push({
                        label: label,
                        price: curveData[ngTicker].at(-1).price
                    })
                }

                if (curveData[ttfTicker] && curveData[ttfTicker].length > 0) {
                    ttfCurve.push({
                        label: label,
                        price: curveData[ttfTicker].at(-1).price
                    })
                }
            }
        }

        renderForwardCurve('curve-chart', ngCurve, ttfCurve)
    } catch (e) {
        console.error('[Curve] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 6: EXPIRY TABLE
   =================================================================== */

async function initExpiryTable(state) {
    console.log('[Expiry] Initializing...')
    try {
        const modeButtons = {
            '3y': document.getElementById('expiry-mode-3y'),
            '5y': document.getElementById('expiry-mode-5y'),
            'all': document.getElementById('expiry-mode-all')
        }

        modeButtons['3y'].classList.add('active')

        Object.entries(modeButtons).forEach(([key, btn]) => {
            btn.addEventListener('click', async () => {
                Object.values(modeButtons).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                // TODO: Implement expiry table rendering
            })
        })

        await renderExpiryTable(state)
    } catch (e) {
        console.error('[Expiry] Init failed:', e)
    }
}

async function renderExpiryTable(state) {
    try {
        // TODO: Implement full expiry table
        console.log('[Expiry] Rendering table...')
    } catch (e) {
        console.error('[Expiry] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 7: DAILY LOG
   =================================================================== */

async function initDailyLog(state) {
    console.log('[Log] Initializing...')
    try {
        const loadMoreBtn = document.getElementById('log-load-more')
        loadMoreBtn.addEventListener('click', () => {
            // TODO: Load more rows
        })

        await renderDailyLog(state)
    } catch (e) {
        console.error('[Log] Init failed:', e)
    }
}

async function renderDailyLog(state) {
    try {
        // TODO: Implement daily log rendering
        console.log('[Log] Rendering...')
    } catch (e) {
        console.error('[Log] Render failed:', e)
    }
}

/* ===================================================================
   PANEL 8: HH/TTF SPREAD
   =================================================================== */

async function initCrossSpread(state) {
    console.log('[Cross] Initializing...')
    try {
        const hYearSel = document.getElementById('cross-hh-year')
        const hMonthSel = document.getElementById('cross-hh-month')
        const tYearSel = document.getElementById('cross-ttf-year')
        const tMonthSel = document.getElementById('cross-ttf-month')
        const modeButtons = {
            native: document.getElementById('cross-mode-native'),
            usd: document.getElementById('cross-mode-usd')
        }

        for (let y = 2018; y <= 2031; y++) {
            const opt = document.createElement('option')
            opt.value = y
            opt.textContent = y
            hYearSel.appendChild(opt)
            tYearSel.appendChild(opt.cloneNode(true))
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        monthNames.forEach((name, idx) => {
            const opt1 = document.createElement('option')
            opt1.value = idx
            opt1.textContent = name
            hMonthSel.appendChild(opt1)

            const opt2 = document.createElement('option')
            opt2.value = idx
            opt2.textContent = name
            tMonthSel.appendChild(opt2)
        })

        modeButtons.native.classList.add('active')

        Object.entries(modeButtons).forEach(([key, btn]) => {
            btn.addEventListener('click', async () => {
                Object.values(modeButtons).forEach(b => b.classList.remove('active'))
                btn.classList.add('active')
                state.cross.mode = key
                await renderCrossSpread(state)
            })
        })

        hYearSel.addEventListener('change', () => renderCrossSpread(state))
        hMonthSel.addEventListener('change', () => renderCrossSpread(state))
        tYearSel.addEventListener('change', () => renderCrossSpread(state))
        tMonthSel.addEventListener('change', () => renderCrossSpread(state))

        await renderCrossSpread(state)
    } catch (e) {
        console.error('[Cross] Init failed:', e)
    }
}

async function renderCrossSpread(state) {
    try {
        // TODO: Implement cross spread rendering
        console.log('[Cross] Rendering...')
    } catch (e) {
        console.error('[Cross] Render failed:', e)
    }
}
