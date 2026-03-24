const YAHOO_TTL = 4 * 60 * 60 * 1000; // 4 hours
const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];

/**
 * Helper to generate tickers following standard structure: Prefix + Code + YY .NYM
 * @param {string} prefix - "NG", "TTF"
 */
function generateContractList(prefix, startYear, endYear) {
    const list = [];
    for (let y = startYear; y <= endYear; y++) {
        const yy = String(y).slice(-2);
        for (const code of MONTH_CODES) {
            list.push({
                ticker: `${prefix}${code}${yy}.NYM`,
                benchmark: prefix === "NG" ? "Henry Hub" : "Dutch TTF"
            });
        }
    }
    return list;
}

/**
 * Fetches daily pricing string history from Yahoo Finance v8 API endpoint.
 * @param {string} ticker - Asset identifier (e.g., NGK26.NYM)
 */
async function fetchYahoo(ticker) {
    const key = "yf_" + ticker;
    const cached = sessionStorage.getItem(key);

    if (cached) {
        try {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < YAHOO_TTL) {
                return data;
            }
        } catch (e) {
            sessionStorage.removeItem(key);
        }
    }

    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=max`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return [];

        const json = await resp.json();
        const res = json.chart.result;
        if (!res || !res[0]) return [];

        const ts = res[0].timestamp;
        const close = res[0].indicators.quote[0].close;

        if (!ts || !close) return [];

        const data = ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().split('T')[0],
            price: close[i]
        })).filter(d => d.price !== null && d.price !== undefined);

        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
        return data;

    } catch (err) {
        console.warn(`fetchYahoo 404/Block on ${ticker}:`, err);
        return []; // Graceful 404 yields empty lists
    }
}

/**
 * Triggers parallel fetch for NG and TTF curve buckets across target timeline.
 */
async function sweepFullCurve() {
    const ng = generateContractList("NG", 2026, 2031);
    const ttf = generateContractList("TTF", 2026, 2031);
    const manifests = [...ng, ...ttf];

    const results = await Promise.allSettled(
        manifests.map(c => fetchYahoo(c.ticker))
    );

    return manifests.map((manifest, i) => {
        const result = results[i];
        return {
            ticker: manifest.ticker,
            benchmark: manifest.benchmark,
            status: result.status,
            data: result.status === "fulfilled" ? result.value : []
        };
    });
}
