const EIA_URL = "https://www.eia.gov/dnav/ng/hist_xls/RNGWHHDd.xls";
const EIA_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the live absolute Henry Hub Spot Price matrix from EIA XLS feed resources.
 * Handles parsing binary stream overlays using SheetJS hooks.
 */
async function fetchEIASpot() {
    const key = "eia_spot";
    const cached = sessionStorage.getItem(key);

    if (cached) {
        try {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < EIA_TTL) {
                return data;
            }
        } catch (e) {
            sessionStorage.removeItem(key);
        }
    }

    try {
        const resp = await fetch(EIA_URL);
        if (!resp.ok) {
            throw new Error(`EIA Fetch Error ${resp.status}: ${EIA_URL}`);
        }

        const arrayBuffer = await resp.arrayBuffer();

        // Use SheetJS to read binary nodes
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const worksheet = workbook.Sheets["Data 1"];
        
        if (!worksheet) {
            throw new Error("Sheet 'Data 1' not found in EIA XLS payload");
        }

        // Convert to absolute arrays [ [colA, colB, colC], ... ]
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const parsedData = [];

        // Specs: Skip first 3 rows header titles.
        // Columns: B (index 1) = Date, C (index 2) = Price
        for (let i = 3; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 3) continue;

            const dateValue = row[1];
            const priceValue = parseFloat(row[2]);

            if (dateValue && !isNaN(priceValue)) {
                let dateStr = "";
                if (dateValue instanceof Date) {
                    dateStr = dateValue.toISOString().split('T')[0];
                } else {
                    dateStr = String(dateValue).split(' ')[0];
                }
                
                parsedData.push({
                    date: dateStr,
                    price: priceValue
                });
            }
        }

        // Assure chronological ordering
        parsedData.sort((a, b) => a.date.localeCompare(b.date));

        sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: parsedData }));
        return parsedData;

    } catch (err) {
        console.warn("fetchEIASpot failed:", err);
        return [];
    }
}
