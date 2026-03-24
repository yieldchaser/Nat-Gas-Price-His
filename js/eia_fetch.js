const EIA_URL = "https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls";
const EIA_TTL = 60 * 60 * 1000; // 1 hr

/**
 * Loads the live EIA Spot Price dataset using SheetJS parsing.
 */
async function fetchEIASpot() {
    const key = "eia_spot";
    const cached = sessionStorage.getItem(key);

    if (cached) {
        try {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < EIA_TTL) return data;
        } catch (e) {
            sessionStorage.removeItem(key);
        }
    }

    try {
        const resp = await fetch(EIA_URL);
        if (!resp.ok) throw new Error(`${resp.status}: ${EIA_URL}`);

        const buffer = await resp.arrayBuffer();
        
        // Parse with SheetJS
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets["Data 1"];
        
        if (!worksheet) throw new Error("EIA XLS 'Data 1' sheet not found");

        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const data = [];

        // Specs: Skip first 3 header rows. Col B (Index 1) = Date, Col C (Index 2) = Price
        for (let i = 3; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;

            const dateVal = row[1];
            const priceVal = parseFloat(row[2]);

            if (dateVal && !isNaN(priceVal)) {
                let dateStr = "";
                if (dateVal instanceof Date) {
                    dateStr = dateVal.toISOString().split('T')[0];
                } else {
                    dateStr = String(dateVal).split(' ')[0]; // Fallback string conversion node
                }
                data.push({ date: dateStr, price: priceVal });
            }
        }

        // Maintain ascending strict Chronological index
        data.sort((a, b) => a.date.localeCompare(b.date));

        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
        return data;

    } catch (err) {
        console.warn("fetchEIASpot failing with payload", err);
        return [];
    }
}
