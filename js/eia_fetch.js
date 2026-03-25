/**
 * EIA FETCH (eia_fetch.js)
 * 
 * Fetches live Henry Hub spot price data from EIA.
 * Parses XLS format with SheetJS.
 */

const EIA_URL = 'https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls'
const EIA_TTL = 60 * 60 * 1000  // 1 hour in milliseconds

/**
 * Fetch Henry Hub spot price data from EIA
 * Parses XLS (not XLSX) from sheet "Data 1"
 * Skips first 3 header rows, extracts col B (date) and col C (price)
 * @returns {Promise<Array>} Array of {date, price}
 */
async function fetchEIASpot() {
    const cached = sessionStorage.getItem('eia_spot')
    
    // Return cached data if still within TTL
    if (cached) {
        const { ts, data } = JSON.parse(cached)
        if (Date.now() - ts < EIA_TTL) {
            return data
        }
    }

    const resp = await fetch(EIA_URL)
    if (!resp.ok) {
        throw new Error('EIA fetch failed: ' + resp.status)
    }

    // Parse XLS with SheetJS
    const buffer = await resp.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets['Data 1']
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1 })

    // Skip first 3 header rows, extract date (col B) and price (col C)
    const data = raw.slice(3)
        .filter(row => row[1] && row[2])  // Must have both date and price
        .map(row => ({
            date: row[1],  // col B (index 1)
            price: parseFloat(row[2])  // col C (index 2)
        }))
        .filter(d => !isNaN(d.price))
        .sort((a, b) => new Date(a.date) - new Date(b.date))

    sessionStorage.setItem('eia_spot', JSON.stringify({ ts: Date.now(), data }))
    return data
}
