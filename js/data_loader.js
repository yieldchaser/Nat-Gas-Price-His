/**
 * DATA LOADER (data_loader.js)
 * 
 * Loads historical CSV contract data from GitHub raw content.
 * Implements caching, URL encoding, and Papa Parse integration.
 */

const BASE_RAW = 'https://raw.githubusercontent.com/yieldchaser/Nat-Gas-Price-His/main/'

const csvCache = new Map()

/**
 * Load a contract CSV from GitHub, parse with Papa Parse, cache result
 * @param {string} benchmark - e.g. "Henry Hub", "Dutch TTF", "Spot Price"
 * @param {string} contractID - e.g. "ngf26", "ttfk26"
 * @returns {Promise<Array>} Parsed CSV rows (with headers as keys)
 */
async function loadContractCSV(benchmark, contractID) {
    const key = `${benchmark}::${contractID}`
    if (csvCache.has(key)) {
        return csvCache.get(key)
    }

    // Extract month code from contract ID (3rd character, lowercase)
    // E.g. "ngf26" → "f", "ttfk26" → "k"
    const monthCodeLower = contractID.charAt(2)
    const MC = ['f','g','h','j','k','m','n','q','u','v','x','z']
    const monthIndex = MC.indexOf(monthCodeLower)
    const monthNames = ['01_Jan','02_Feb','03_Mar','04_Apr','05_May','06_Jun',
                        '07_Jul','08_Aug','09_Sep','10_Oct','11_Nov','12_Dec']
    const monthFolder = monthIndex >= 0 ? monthNames[monthIndex] : '01_Jan'

    // Build URL with proper encoding: each path segment encoded individually
    const segments = [
        'Cleaned_Database',
        benchmark,
        'Monthwise',
        monthFolder,
        contractID + '.csv'
    ]
    const path = segments.map(s => encodeURIComponent(s)).join('/')
    const url = BASE_RAW + path

    console.log('[DataLoader] Fetching:', url)

    const resp = await fetch(url)
    if (!resp.ok) {
        throw new Error(`CSV fetch failed (${resp.status}): ${url}`)
    }

    const text = await resp.text()
    const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true
    }).data

    csvCache.set(key, parsed)
    return parsed
}

/**
 * Generate a list of contracts for a given range
 * @param {string} prefix - e.g. "NG", "TTF"
 * @param {number} startYear - Start year (e.g. 2026)
 * @param {number} startMonth - Start month (0-11, Jan=0)
 * @param {number} endYear - End year (e.g. 2031)
 * @param {number} endMonth - End month (0-11)
 * @returns {Array} Array of contract objects: {contractID, yahooTicker, year, month, label}
 */
function generateContractList(prefix, startYear, startMonth, endYear, endMonth) {
    const MC = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z']
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const contracts = []

    for (let y = startYear; y <= endYear; y++) {
        for (let m = 0; m < 12; m++) {
            // Skip months before start year/month
            if (y === startYear && m < startMonth) continue
            // Stop after end year/month
            if (y === endYear && m > endMonth) break

            const yy = String(y).slice(-2)
            const ticker = `${prefix}${MC[m]}${yy}.NYM`
            const id = `${prefix.toLowerCase()}${MC[m].toLowerCase()}${yy}`
            const label = `${monthNames[m]} ${y}`

            contracts.push({
                contractID: id,
                yahooTicker: ticker,
                year: y,
                month: m,
                label: label
            })
        }
    }

    return contracts
}

/**
 * Load Spot Price CSV by month (not by contract year)
 * Spot Price is continuous, not expiring, so just month folder
 * @param {number} monthIndex - 0-11 (Jan=0, Dec=11)
 * @returns {Promise<Array>} Parsed CSV rows
 */
async function loadSpotPriceCSV(monthIndex) {
    const key = `Spot Price::month_${monthIndex}`
    if (csvCache.has(key)) {
        return csvCache.get(key)
    }

    const monthNames = ['01_Jan','02_Feb','03_Mar','04_Apr','05_May','06_Jun',
                        '07_Jul','08_Aug','09_Sep','10_Oct','11_Nov','12_Dec']
    const monthFolder = monthNames[monthIndex]
    const fileName = `Spot_Price_${monthFolder}.csv`

    const segments = [
        'Cleaned_Database',
        'Spot Price',
        'Monthwise',
        monthFolder,
        fileName
    ]
    const path = segments.map(s => encodeURIComponent(s)).join('/')
    const url = BASE_RAW + path

    console.log('[DataLoader] Fetching Spot Price:', url)

    const resp = await fetch(url)
    if (!resp.ok) {
        throw new Error(`Spot CSV fetch failed (${resp.status}): ${url}`)
    }

    const text = await resp.text()
    const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true
    }).data

    csvCache.set(key, parsed)
    return parsed
}
