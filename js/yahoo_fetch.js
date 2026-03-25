/**
 * YAHOO FETCH (yahoo_fetch.js)
 * 
 * Fetches live futures data from Yahoo Finance v8 API.
 * Integrates historical CSV data with live Yahoo tail.
 */

const YAHOO_TTL = 4 * 60 * 60 * 1000  // 4 hours in milliseconds

/**
 * Fetch full historical + recent data from Yahoo Finance v8
 * Caches in sessionStorage, returns array of {date, price}
 * @param {string} ticker - e.g. "NGK26.NYM", "TTFM26.NYM"
 * @returns {Promise<Array>} Array of {date (YYYY-MM-DD), price}
 */
async function retryFetch(url, options = {}, retries = 2, delay = 500) {
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await fetch(url, options)
            if (resp.ok) return resp
            if (i === retries) return resp
            await new Promise(r => setTimeout(r, delay * (i + 1)))
        } catch (e) {
            if (i === retries) throw e
            await new Promise(r => setTimeout(r, delay * (i + 1)))
        }
    }
}

async function fetchYahoo(ticker) {
    const key = 'yf_' + ticker
    const cached = sessionStorage.getItem(key)
    
    // Return cached data if still within TTL
    if (cached) {
        const { ts, data } = JSON.parse(cached)
        if (Date.now() - ts < YAHOO_TTL) {
            return data
        }
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=max`
    
    let resp
    try {
        resp = await retryFetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3, 300)
    } catch (e) {
        console.warn('[Yahoo] Network error:', ticker, e)
        return []
    }

    if (!resp || !resp.ok) {
        console.warn('[Yahoo] HTTP', resp?.status, ticker)
        return []
    }

    const json = await resp.json()
    const result = json?.chart?.result?.[0]
    if (!result) return []

    const timestamps = result.timestamp ?? []
    const closes = result.indicators?.quote?.[0]?.close ?? []
    
    const data = timestamps
        .map((t, i) => ({
            date: new Date(t * 1000).toISOString().split('T')[0],
            price: closes[i]
        }))
        .filter(d => d.price !== null && d.price !== undefined)

    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    return data
}

/**
 * Fetch current price + daily change for header ticker strip
 * Used for NG=F and TTF=F continuous contracts
 * @param {string} ticker - e.g. "NG=F", "TTF=F", "EURUSD=X"
 * @returns {Promise<Object|null>} {price, change, changePct} or null if fetch fails
 */
async function fetchContinuous(ticker) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=5d`
    
    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        })
        if (!resp.ok) return null

        const json = await resp.json()
        const result = json?.chart?.result?.[0]
        if (!result) return null

        const closes = result.indicators.quote[0].close.filter(c => c !== null)
        if (closes.length < 1) return null

        const price = closes.at(-1)
        const prevClose = closes.at(-2) ?? price
        const change = price - prevClose
        const changePct = (change / prevClose) * 100

        return { price, change, changePct }
    } catch (e) {
        console.warn('[Yahoo] fetchContinuous error:', ticker, e)
        return null
    }
}

/**
 * Sweep all future contracts across the curve
 * Fetches NG and TTF from current month through 2031
 * Returns map of ticker → data for all successful fetches
 * @returns {Promise<Object>} Map of ticker → array of {date, price}
 */
async function sweepFullCurve() {
    const today = new Date()
    const startMonth = today.getMonth()      // 0-11
    const startYear = today.getFullYear()

    // Generate contract lists: Apr 2026 → Jun 2031 (both NG and TTF)
    const ngList = generateContractList('NG', startYear, startMonth, 2031, 11)
    const ttfList = generateContractList('TTF', startYear, startMonth, 2031, 11)
    const allContracts = [...ngList, ...ttfList]

    // Fetch all in parallel, catch failures individually
    const results = await Promise.allSettled(
        allContracts.map(c => fetchYahoo(c.yahooTicker))
    )

    // Build result map: only include successful fetches with data
    const curveData = {}
    allContracts.forEach((c, i) => {
        if (results[i].status === 'fulfilled' && results[i].value.length > 0) {
            curveData[c.yahooTicker] = results[i].value
        }
    })

    return curveData
}
