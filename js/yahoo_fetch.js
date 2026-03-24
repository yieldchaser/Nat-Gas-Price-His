const YAHOO_TTL = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Fetch historical data using v8 endpoints through CORS proxies layout.
 * @param {string} ticker - Asset identifier (e.g., NGK26.NYM)
 */
async function fetchYahoo(ticker) {
    const key = "yf_" + ticker;
    const cached = sessionStorage.getItem(key);

    if (cached) {
        try {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < YAHOO_TTL) return data;
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

        // Map and Filter nulls Continuous streams
        const data = ts.map((t, i) => ({
            date: new Date(t * 1000).toISOString().split('T')[0],
            price: close[i]
        })).filter(d => d.price !== null && d.price !== undefined);

        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
        return data;

    } catch (err) {
        console.warn(`fetchYahoo failing with proxy for ${ticker}:`, err);
        return [];
    }
}

/**
 * Fetch continuous snapshot metrics for header badges.
 */
async function fetchContinuous(ticker) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) return { price: 0, change: 0, changePct: 0 };

        const json = await resp.json();
        const res = json.chart.result ? json.chart.result[0] : null;

        if (!res || !res.meta) return { price: 0, change: 0, changePct: 0 };

        const price = res.meta.regularMarketPrice;
        const prevClose = res.meta.chartPreviousClose;
        const change = price - prevClose;
        const changePct = prevClose ? ((change / prevClose) * 100) : 0;

        return { price, change, changePct };

    } catch (err) {
        console.warn(`fetchContinuous failing with proxy for ${ticker}:`, err);
        return { price: 0, change: 0, changePct: 0 };
    }
}

/**
 * Sweeps Forward Curves in Parallel using manifests generators.
 */
async function sweepFullCurve() {
    // NG and TTF lists generated from current benchmarks
    // ng start: Apr 2026 'j', ttf start: May 2026 'k' per specs.
    const ngList = generateContractList("NG", 2026, "j", 2031);
    const ttfList = generateContractList("TTF", 2026, "k", 2031);

    const manifests = [...ngList, ...ttfList];

    const results = await Promise.allSettled(
        manifests.map(c => fetchYahoo(c.yahooTicker))
    );

    return manifests.map((manifest, i) => {
        const result = results[i];
        return {
            ...manifest,
            status: result.status,
            data: result.status === "fulfilled" ? result.value : []
        };
    });
}
