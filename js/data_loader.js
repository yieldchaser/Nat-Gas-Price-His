const BASE_RAW = "https://raw.githubusercontent.com/yieldchaser/Nat-Gas-Price-His/main/";
const csvCache = new Map();

const MONTH_FOLDER_MAP = {
    'f': '01_Jan', 'g': '02_Feb', 'h': '03_Mar', 'j': '04_Apr',
    'k': '05_May', 'm': '06_Jun', 'n': '07_Jul', 'q': '08_Aug',
    'u': '09_Sep', 'v': '10_Oct', 'x': '11_Nov', 'z': '12_Dec'
};

/**
 * Maps contract IDs to their respective Monthwise subfolder (e.g., "01_Jan")
 */
function getMonthSubfolder(benchmark, contractID) {
    if (benchmark === "Spot Price") {
        // Spot Price files are named like "Spot_Price_01_Jan"
        const match = contractID.match(/Spot_Price_(0[1-9]|1[0-2])_[A-Za-z]{3}/);
        return match ? match[0].replace("Spot_Price_", "") : null;
    } else {
        if (!contractID || contractID.length < 3) return null;
        // Prefix is 2 chars (ng/tg). 3rd character index 2 is month code
        const monthCode = contractID.charAt(2).toLowerCase();
        return MONTH_FOLDER_MAP[monthCode] || null;
    }
}

/**
 * Fetches contract CSV data with space-safe URL segment encoding and node caches.
 * @param {string} benchmark - "Henry Hub", "Dutch TTF", "Spot Price"
 * @param {string} contractID - e.g. "ngv24", "tgf18", "Spot_Price_01_Jan"
 */
async function loadContractCSV(benchmark, contractID) {
    const cacheKey = `${benchmark}_${contractID}`;
    if (csvCache.has(cacheKey)) {
        return csvCache.get(cacheKey);
    }

    const monthSub = getMonthSubfolder(benchmark, contractID);

    // Build absolute raw git segments
    const segments = ["Cleaned_Database", benchmark, "Monthwise"];
    if (monthSub) {
        segments.push(monthSub);
    }
    segments.push(contractID + ".csv");

    // Encode individually to preserve valid slashes & safe spaces
    const path = segments.map(s => encodeURIComponent(s)).join("/");
    const url = BASE_RAW + path;

    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`Fetch Error ${resp.status}: ${url}`);
        }
        const text = await resp.text();

        // Parse with Papa Parse
        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true // Converts dates/prices to correct primitives automatically
        });

        csvCache.set(cacheKey, parsed.data);
        return parsed.data;

    } catch (err) {
        console.error(`loadContractCSV failed for [${benchmark}] ${contractID}:`, err);
        return [];
    }
}
