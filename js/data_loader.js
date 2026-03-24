const BASE_RAW = "https://raw.githubusercontent.com/yieldchaser/Nat-Gas-Price-His/main/";
const csvCache = new Map();

const MONTH_FOLDER_MAP = {
    'f': '01_Jan', 'g': '02_Feb', 'h': '03_Mar', 'j': '04_Apr',
    'k': '05_May', 'm': '06_Jun', 'n': '07_Jul', 'q': '08_Aug',
    'u': '09_Sep', 'v': '10_Oct', 'x': '11_Nov', 'z': '12_Dec'
};

const MONTH_NAMES = {
    'f': 'Jan', 'g': 'Feb', 'h': 'Mar', 'j': 'Apr',
    'k': 'May', 'm': 'Jun', 'n': 'Jul', 'q': 'Aug',
    'u': 'Sep', 'v': 'Oct', 'x': 'Nov', 'z': 'Dec'
};

/**
 * Maps contract IDs to their respective subfolder nested buckets
 */
function getMonthSubfolder(benchmark, contractID) {
    if (benchmark === "Spot Price") {
        // Spot Price files are named like "Spot_Price_01_Jan"
        const match = contractID.match(/Spot_Price_(0[1-9]|1[0-2])_[A-Za-z]{3}/);
        return match ? match[0].replace("Spot_Price_", "") : null;
    } else {
        if (!contractID || contractID.length < 3) return null;
        const monthCode = contractID.charAt(2).toLowerCase();
        return MONTH_FOLDER_MAP[monthCode] || null;
    }
}

/**
 * Translate Contract ID back to Yahoo tickers (e.g., ngf26 -> NGF26.NYM)
 */
function contractIDtoYahooTicker(prefix, contractID) {
    if (!contractID || contractID.length < 3) return "";
    // e.g. ngf26
    const core = contractID.substring(2).toUpperCase();
    return `${prefix}${core}.NYM`;
}

/**
 * Utility to generate contract manifests sweeps arrays
 */
function generateContractList(prefix, fromYear, fromMonthCode, toYear) {
    const list = [];
    const codes = Object.keys(MONTH_FOLDER_MAP);
    const startIdx = codes.indexOf(fromMonthCode.toLowerCase());
    const validStart = startIdx !== -1 ? startIdx : 0;

    for (let y = fromYear; y <= toYear; y++) {
        const yy = String(y).slice(-2).padStart(2, '0');
        for (let m = (y === fromYear ? validStart : 0); m < codes.length; m++) {
            const code = codes[m];
            const contractID = `${prefix === 'NG' ? 'ng' : 'tg'}${code}${yy}`;
            list.push({
                contractID: contractID,
                yahooTicker: `${prefix}${code.toUpperCase()}${yy}.NYM`,
                year: y,
                month: MONTH_NAMES[code],
                label: `${MONTH_NAMES[code]} ${yy}`
            });
        }
    }
    return list;
}

/**
 * Loads Monthwise cached raw layout CSV streams coordinates
 */
async function loadContractCSV(benchmark, contractID) {
    const cacheKey = `${benchmark}_${contractID}`;
    if (csvCache.has(cacheKey)) return csvCache.get(cacheKey);

    const monthSub = getMonthSubfolder(benchmark, contractID);

    // Build absolute raw segment routers
    const segments = ["Cleaned_Database", benchmark, "Monthwise"];
    if (monthSub) {
        segments.push(monthSub);
    }
    segments.push(contractID + ".csv");

    const path = segments.map(s => encodeURIComponent(s)).join("/");
    const url = BASE_RAW + path;

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`${resp.status}: ${url}`);
        const text = await resp.text();

        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true
        });

        csvCache.set(cacheKey, parsed.data);
        return parsed.data;

    } catch (err) {
        console.warn(`loadContractCSV 404 for [${benchmark}] ${contractID}:`, err);
        return [];
    }
}

/**
 * Loads Yearwise compiled flat absolute files routers
 */
async function loadYearwiseCSV(benchmark, year) {
    const cacheKey = `${benchmark}_Yearwise_${year}`;
    if (csvCache.has(cacheKey)) return csvCache.get(cacheKey);

    const segments = ["Cleaned_Database", benchmark, "Yearwise", String(year) + ".csv"];
    const path = segments.map(s => encodeURIComponent(s)).join("/");
    const url = BASE_RAW + path;

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`${resp.status}: ${url}`);
        const text = await resp.text();

        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
        csvCache.set(cacheKey, parsed.data);
        return parsed.data;

    } catch (err) {
        console.warn(`loadYearwiseCSV 404 for [${benchmark}] ${year}:`, err);
        return [];
    }
}

// Line 382 verification test logger
(async () => {
    const testArgs = ["Henry Hub", "ngv24"];
    const monthSub = getMonthSubfolder(testArgs[0], testArgs[1]);
    const segments = ["Cleaned_Database", testArgs[0], "Monthwise", monthSub, testArgs[1] + ".csv"];
    const testUrl = BASE_RAW + segments.map(s => encodeURIComponent(s)).join("/");
    console.log(`[DataLoader] Init Test URL mapping absolute routers: ${testUrl}`);
})();
