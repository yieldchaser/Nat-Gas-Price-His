/**
 * Converts raw coordinates sorting chronological layout streams to continuous T-day indexes node layouts.
 */
function toTDaySeries(csvRows) {
    if (!csvRows || csvRows.length === 0) return [];

    return [...csvRows]
        .sort((a, b) => new Date(a.Date || a.date) - new Date(b.Date || b.date))
        .map((row, i) => ({
            tDay: i + 1,
            date: row.Date || row.date,
            price: parseFloat(row.Price || row.price)
        }))
        .filter(d => !isNaN(d.price));
}

/**
 * Historical and Live Data stitch aggregates routines
 */
async function getContractSeries(benchmark, contractID, yahooTicker) {
    const historical = await loadContractCSV(benchmark, contractID);

    const today = new Date().toISOString().split('T')[0];
    const lastRow = historical[historical.length - 1];
    
    // Check expired nodes
    const expired = lastRow && (lastRow.Date || lastRow.date) < today;
    
    let merged = historical.map(r => ({ date: r.Date || r.date, price: parseFloat(r.Price || r.price) }));

    if (!expired && yahooTicker) {
        const live = await fetchYahoo(yahooTicker);
        const lastDate = merged[merged.length - 1]?.date ?? '1900-01-01';
        const tail = live.filter(d => d.date > lastDate);
        merged = [...merged, ...tail];
    }

    // Pass back to T-day conversions
    return toTDaySeries(merged.map(d => ({ Date: d.date, Price: d.price })));
}

/**
 * Calculates high/low/average thresholds nodes mapped from past 5 years worth timeline binders
 */
async function getSeasonalBand(benchmark, monthCode, targetYear) {
    const codes = [];
    const prefix = benchmark === "Dutch TTF" ? "tg" : "ng";

    for (let i = 1; i <= 5; i++) {
        const y = targetYear - i;
        const yy = String(y).slice(-2).padStart(2, '0');
        codes.push(`${prefix}${monthCode.toLowerCase()}${yy}`);
    }

    const seriesList = [];
    for (const id of codes) {
        const hist = await loadContractCSV(benchmark, id);
        if (hist && hist.length > 0) {
            seriesList.push(toTDaySeries(hist));
        }
    }

    const result = { tDays: [], avg: [], high: [], low: [] };
    if (seriesList.length === 0) return result;

    const maxTDay = Math.max(...seriesList.flatMap(s => s.map(r => r.tDay)));

    for (let t = 1; t <= maxTDay; t++) {
        const vals = seriesList.map(s => s[t - 1] ? s[t - 1].price : null).filter(p => p !== null);
        if (vals.length > 0) {
            result.tDays.push(t);
            result.avg.push(vals.reduce((a, b) => a + b, 0) / vals.length);
            result.high.push(Math.max(...vals));
            result.low.push(Math.min(...vals));
        }
    }
    return result;
}

/**
 * Calculates Spread Series Deltas.
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

    const result = { tDays: [], spread: [], dates: [] };
    let tCount = 1;

    front.forEach(f => {
        const fDate = f.Date || f.date;
        const pBack = backMap.get(fDate);
        if (pBack !== undefined) {
             result.tDays.push(tCount++);
             result.dates.push(fDate);
             result.spread.push(parseFloat(f.Price || f.price) - pBack);
        }
    });

    return result;
}

/**
 * Loads last settlement rows aggregating matrices routers
 */
async function getExpiryPrices(benchmark) {
    const currentYear = new Date().getFullYear();
    const prefix = benchmark === "Dutch TTF" ? "TTF" : "NG";
    const manifest = generateContractList(prefix, 2010, "f", currentYear);
    const result = {};

    await Promise.all(manifest.map(async (item) => {
        const data = await loadContractCSV(benchmark, item.contractID);
        if (data && data.length > 0) {
             const last = data[data.length - 1];
             result[item.contractID] = {
                  price: parseFloat(last.Price || last.price),
                  date: last.Date || last.date
             };
        }
    }));

    return result;
}

/**
 * Translates rates multipliers continuous frameworks flawlessly.
 */
function eurusdConvert(series, rate) {
    if (!series) return [];
    return series.map(r => ({
        ...r,
        price: r.price * rate
    }));
}
