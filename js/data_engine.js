/**
 * Converts chronological CSV rows to T-Day offset values series.
 * @param {Array} csvRows - Raw parsed row datasets node.
 */
function toTDaySeries(csvRows) {
    if (!csvRows || csvRows.length === 0) return [];
    
    // Safety sort absolute chronological sorting bounds
    const sorted = [...csvRows].sort((a, b) => {
        const dA = a.Date || a.date;
        const dB = b.Date || b.date;
        return dA.localeCompare(dB);
    });

    return sorted.map((row, i) => ({
        tDay: i + 1,
        date: row.Date || row.date,
        price: parseFloat(row.Price || row.price)
    }));
}

/**
 * Loads data layout with live data stitches fallback fallback overlays.
 */
async function getContractSeries(benchmark, contractID, yahooTicker) {
    if (benchmark === "Spot Price") {
        const historical = await loadContractCSV(benchmark, contractID);
        const liveData = await fetchEIASpot(); // Authoritative for Spot rates

        const dataMap = new Map();
        historical.forEach(r => dataMap.set(r.Date || r.date, parseFloat(r.Price || r.price)));
        // EIA overwrites with live preference
        liveData.forEach(r => dataMap.set(r.date, r.price));

        const merged = Array.from(dataMap.entries()).map(([date, price]) => ({ date, price }))
                            .sort((a, b) => a.date.localeCompare(b.date));
        
        return toTDaySeries(merged);
    }

    const historical = await loadContractCSV(benchmark, contractID);
    const liveData = await fetchYahoo(yahooTicker);

    if (liveData && liveData.length > 0) {
        const lastHistDate = historical.length > 0 ? (historical[historical.length - 1].Date || historical[historical.length - 1].date) : "";
        const liveTail = liveData.filter(d => d.date > lastHistDate);

        const merged = [
            ...historical.map(r => ({ date: r.Date || r.date, price: parseFloat(r.Price || r.price) })),
            ...liveTail
        ];
        return toTDaySeries(merged);
    }

    return toTDaySeries(historical);
}

/**
 * Calculate Seasonal bands (Mean, Max, Min) derived from past 5 years worth timelines.
 * @param {string} benchmark - "Henry Hub", "Dutch TTF"
 * @param {string} monthCode - 'f'-'z'
 * @param {number} targetYear - Current model year
 */
async function getSeasonalBand(benchmark, monthCode, targetYear) {
    const currentYY = targetYear % 100;
    const prefix = benchmark === "Dutch TTF" ? "tg" : "ng";
    const codes = [];

    // Target past 5 years sequentially node
    for (let i = 1; i <= 5; i++) {
        const yy = String(targetYear - i).slice(-2).padStart(2, '0');
        codes.push(`${prefix}${monthCode.toLowerCase()}${yy}`);
    }

    const seriesList = [];
    for (const id of codes) {
        const hist = await loadContractCSV(benchmark, id);
        if (hist && hist.length > 0) {
            seriesList.push(toTDaySeries(hist));
        }
    }

    if (seriesList.length === 0) return [];

    const maxTDay = Math.max(...seriesList.flatMap(s => s.map(r => r.tDay)));
    const band = [];

    for (let t = 1; t <= maxTDay; t++) {
        // Safe continuous matching using index triggers bounds
        const vals = seriesList.map(s => s[t - 1] ? s[t - 1].price : null).filter(p => p !== null);
        if (vals.length > 0) {
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            const max = Math.max(...vals);
            const min = Math.min(...vals);
            band.push({ tDay: t, mean, max, min });
        }
    }

    return band;
}

/**
 * Computes front/back price split delta series layouts.
 */
async function getSpreadSeries(benchmark, frontMonth, backMonth, year) {
    const prefix = benchmark === "Dutch TTF" ? "tg" : "ng";
    const yy = String(year).slice(-2).padStart(2, '0');
    
    const idFront = `${prefix}${frontMonth.toLowerCase()}${yy}`;
    const idBack = `${prefix}${backMonth.toLowerCase()}${yy}`;

    const front = await loadContractCSV(benchmark, idFront);
    const back = await loadContractCSV(benchmark, idBack);

    const backMap = new Map();
    back.forEach(r => backMap.set(r.Date || r.date, parseFloat(r.Price || r.price)));

    const spreadData = [];
    front.forEach(f => {
        const fDate = f.Date || f.date;
        const pBack = backMap.get(fDate);
        if (pBack !== undefined) {
            spreadData.push({
                date: fDate,
                price: parseFloat(f.Price || f.price) - pBack
            });
        }
    });

    return toTDaySeries(spreadData);
}

/**
 * Translates EUR/MWh to USD Equivalent incorporating specs index coefficients mapping
 */
function eurusdConvert(ttfSeries, eurUsdRate) {
    if (!ttfSeries) return [];
    
    // Coefficient specs line 216: Divide EUR/MWh by 11.63 for MMBTU absolute node
    return ttfSeries.map(r => ({
        ...r,
        price: (r.price * eurUsdRate) / 11.63
    }));
}
