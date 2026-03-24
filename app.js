document.addEventListener("DOMContentLoaded", () => {
    
    // 1. Navbar Navigation Toggle Setup
    const navPills = document.querySelectorAll(".nav-pill");
    const panels = document.querySelectorAll(".panel");

    navPills.forEach(pill => {
        pill.addEventListener("click", () => {
            const target = pill.getAttribute("data-target");

            // Update Active Nav Pill
            navPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            // Update Panel Node Visibilities
            panels.forEach(p => {
                if (p.id === target) {
                    p.classList.add("active");
                } else {
                    p.classList.remove("active");
                }
            });
        });
    });

    // 2. Control Bar Structure Initializations placeholders
    const hhControl = document.querySelector("#hh-chart .control-bar");
    if (hhControl) {
        hhControl.innerHTML = `
            <select id="hh-year-select">
                <option value="2026">2026</option>
                <option value="2025">2025</option>
            </select>
            <select id="hh-month-select">
                <option value="F">Jan (F)</option>
                <option value="K" selected>May (K)</option>
            </select>
        `;
    }

    // 3. App Initialization routines for default Active trace
    async function initDashboard() {
        const loader = document.getElementById("global-loader");
        if (loader) loader.classList.add("active");

        try {
            // Live ticker headers populated from FRONT-MONTH updates
            const liveTickers = document.getElementById("live-ticker-strip");
            const ngContinuous = await fetchYahoo("NG=F");
            if (ngContinuous && ngContinuous.length > 0) {
                const latest = ngContinuous[ngContinuous.length - 1];
                const tickerEl = document.getElementById("ticker-ng");
                if (tickerEl) tickerEl.innerText = `NG=F: $${latest.price.toFixed(3)}`;
            }

            // Default startup rendering: Henry Hub May 2026 Contract (ngk26)
            const benchmark = "Henry Hub";
            const contract = "ngk26";
            const liveTicker = "NGK26.NYM";

            const contractSeries = await getContractSeries(benchmark, contract, liveTicker);
            const seasonalBand = await getSeasonalBand(benchmark, "k", 2026);

            if (contractSeries && contractSeries.length > 0) {
                renderHHChart("hh-chart-container", contractSeries, seasonalBand);

                // Update standard metrics labels cards
                const lastRow = contractSeries[contractSeries.length - 1];
                document.getElementById("hh-stat-last").innerText = lastRow.price.toFixed(3);
                document.getElementById("hh-stat-days").innerText = lastRow.tDay;

                const prices = contractSeries.map(r => r.price);
                document.getElementById("hh-stat-high").innerText = Math.max(...prices).toFixed(3);
                document.getElementById("hh-stat-low").innerText = Math.min(...prices).toFixed(3);
            }

        } catch (err) {
            console.error("Dashboard Init crashed:", err);
        } finally {
            if (loader) loader.classList.remove("active");
        }
    }

    initDashboard();
});
