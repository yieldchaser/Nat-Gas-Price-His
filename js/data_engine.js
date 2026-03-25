/**
 * DATA ENGINE (data_engine.js)
 * 
 * Core data transformation logic:
 * - T-Day indexing (calendar dates → sequential trading days)
 * - CSV + Yahoo stitching (historical + live tail)
 * - Seasonal band calculation (5-year averages)
 * - Calendar spread calculations
 * - Expiry price aggregation
 */

/**
 * Convert calendar date series to T-Day indexing
 * T-Day 1 = first trading day of contract
 * @param {Array} csvRows - Array of {Date, Price} objects
 * @returns {Array} Array of {tDay, date, price}
 */
function toTDaySeries(csvRows) {
    return [...csvRows]
        .sort((a, b) => new Date(a.Date) - new Date(b.Date))
        .map((row, i) => ({
            tDay: i + 1,
            date: row.Date,
            price: parseFloat(row.Price)
        }))
        .filter(d => !isNaN(d.price))
}

/**
 * Get full contract series: historical CSV + live Yahoo tail (if not expired)
 * @param {string} benchmark - e.g. "Henry Hub", "Dutch TTF"
 * @param {string} contractID - e.g. "ngf26"
 * @param {string|null} yahooTicker - e.g. "NGF26.NYM" (null for expired)
 * @returns {Promise<Array>} T-Day series: {tDay, date, price}
 */
async function getContractSeries(benchmark, contractID, yahooTicker) {
    const historical = await loadContractCSV(benchmark, contractID)
    const today = new Date().toISOString().split('T')[0]
    const lastCSVDate = historical.at(-1)?.Date ?? '1900-01-01'
    const isExpired = lastCSVDate < today

    let rows = historical.map(r => ({
        date: r.Date,
        price: parseFloat(r.Price)
    }))

    // Append live data if contract is not expired
    if (!isExpired && yahooTicker) {
        const live = await fetchYahoo(yahooTicker)
        const tail = live.filter(d => d.date > lastCSVDate)
        rows = [...rows, ...tail]
    }

    return toTDaySeries(rows.map(d => ({ Date: d.date, Price: d.price })))
}

/**
 * Calculate 5-year seasonal band (avg, high, low)
 * Compares same delivery month across last 5 years
 * @param {string} benchmark - e.g. "Henry Hub"
 * @param {number} monthIndex - 0-11 (Jan=0, Dec=11)
 * @param {number} targetYear - Year to compare against
 * @param {number} tDayWindow - Max T-Days to include
 * @returns {Promise<Object>} {avg, high, low, tDays}
 */
async function getSeasonalBand(benchmark, monthIndex, targetYear, tDayWindow) {
    const MC = ['f', 'g', 'h', 'j', 'k', 'm', 'n', 'q', 'u', 'v', 'x', 'z']
    const years = [1, 2, 3, 4, 5].map(n => targetYear - n)
    const series = []

    for (const y of years) {
        const yy = String(y).slice(-2)
        const id = `ng${MC[monthIndex]}${yy}`
        try {
            const data = await getContractSeries(benchmark, id, null)
            if (data.length > 0) {
                series.push(data)
            }
        } catch (e) {
            // Contract file doesn't exist, skip
            console.debug(`[SeasonalBand] Skipped ${id}:`, e.message)
        }
    }

    if (series.length === 0) {
        return { avg: [], high: [], low: [], tDays: [] }
    }

    const maxT = Math.min(tDayWindow, ...series.map(s => s.length))
    const tDays = Array.from({ length: maxT }, (_, i) => i + 1)

    const avg = tDays.map(t => {
        const vals = series
            .map(s => s[t - 1]?.price)
            .filter(v => v !== undefined)
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    })

    const high = tDays.map(t =>
        Math.max(...series.map(s => s[t - 1]?.price).filter(v => v !== undefined))
    )

    const low = tDays.map(t =>
        Math.min(...series.map(s => s[t - 1]?.price).filter(v => v !== undefined))
    )

    return { avg, high, low, tDays }
}

/**
 * Calculate calendar spread (front month - back month) over time
 * @param {string} benchmark - e.g. "Henry Hub"
 * @param {number} frontMonthIdx - 0-11
 * @param {number} backMonthIdx - 0-11
 * @param {number} year - Contract year
 * @returns {Promise<Array>} T-Day spread series: {tDay, date, spread}
 */
async function getSpreadSeries(benchmark, frontMonthIdx, backMonthIdx, year) {
    const MC = ['f', 'g', 'h', 'j', 'k', 'm', 'n', 'q', 'u', 'v', 'x', 'z']
    const yy = String(year).slice(-2)
    const frontID = `ng${MC[frontMonthIdx]}${yy}`
    const backID = `ng${MC[backMonthIdx]}${yy}`

    const [frontRaw, backRaw] = await Promise.all([
        loadContractCSV(benchmark, frontID),
        loadContractCSV(benchmark, backID)
    ])

    const backMap = new Map(
        backRaw.map(r => [r.Date, parseFloat(r.Price)])
    )

    const spread = []
    for (const row of frontRaw.sort((a, b) => new Date(a.Date) - new Date(b.Date))) {
        const bPrice = backMap.get(row.Date)
        if (bPrice !== undefined) {
            spread.push({
                date: row.Date,
                spread: parseFloat(row.Price) - bPrice
            })
        }
    }

    return spread.map((d, i) => ({
        tDay: i + 1,
        date: d.date,
        spread: d.spread
    }))
}

/**
 * Get all available contract expiry prices for a benchmark
 * Returns map of contractID → {price, date, year, month}
 * @param {string} benchmark - e.g. "Henry Hub", "Dutch TTF"
 * @returns {Promise<Object>} Map of contractID → {price, date, year, month}
 */
async function getExpiryPrices(benchmark) {
    const result = {}
    const prefix = benchmark === 'Henry Hub' ? 'ng' : 'ttf'
    const allContracts = generateContractList(
        prefix,
        2010,
        0,
        new Date().getFullYear(),
        11
    )

    await Promise.allSettled(
        allContracts.map(async c => {
            try {
                const rows = await loadContractCSV(benchmark, c.contractID)
                if (rows.length > 0) {
                    const last = rows.at(-1)
                    result[c.contractID] = {
                        price: parseFloat(last.Price),
                        date: last.Date,
                        year: c.year,
                        month: c.month
                    }
                }
            } catch (e) {
                // Contract file doesn't exist, skip
                console.debug(`[ExpiryPrices] Skipped ${c.contractID}:`, e.message)
            }
        })
    )

    return result
}

/**
 * Convert TTF price series to USD equivalent using EUR/USD rate
 * @param {Array} ttfSeries - Array of {price, ...} objects
 * @param {number} rate - EUR/USD conversion rate
 * @returns {Array} Same series with price multiplied by rate
 */
function eurusdConvert(ttfSeries, rate) {
    return ttfSeries.map(d => ({
        ...d,
        price: d.price * rate
    }))
}
