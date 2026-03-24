/**
 * Central State Object
 */
const State = {
    activeTab: 'hh-chart',
    hhYear: '2026',
    hhMonth: 'k', // May Default
    hhTDay: 150,
    ttfYear: '2026',
    ttfMonth: 'k',
    initializedTabs: new Set()
};

document.addEventListener("DOMContentLoaded", async () => {
    
    // 1. Tooltips Initialize
    if (typeof initTooltips === 'function') initTooltips();

    // 2. Continuous Header update layouts
    updateHeaderStrip();
    setInterval(updateHeaderStrip, 5 * 60 * 1000); // 5 min continuous interval

    // 3. Setup Navbar Navigation Click Handlers
    const navPills = document.querySelectorAll(".nav-pill");
    navPills.forEach(pill => {
        pill.addEventListener("click", () => {
            const target = pill.getAttribute("data-target");
            
            navPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
            const targetPanel = document.getElementById(target);
            if (targetPanel) targetPanel.classList.add("active");

            loadTabContent(target);
        });
    });

    // 4. Register Dropdown controls Event listeners
    setupControlListeners();

    // 5. Default Load (HH Chart)
    loadTabContent('hh-chart');

    // 6. Background Promises Sweeps Controllers
    sweepFullCurve().then(() => {
        console.log("[App] Forward Curve sweeps loaded.");
        // can notify ui or unblock triggers if needed
    });
    
    fetchEIASpot().then(() => {
        console.log("[App] EIA spot data cached.");
    });
});

/**
 * Updates Live headers with continuous tickers streams
 */
async function updateHeaderStrip() {
    try {
        const ng = await fetchContinuous('NG=F');
        const ttf = await fetchContinuous('TTF=F');

        const badgeNg = document.getElementById("badge-ng");
        if (badgeNg) {
            const sign = ng.change >= 0 ? "▲" : "▼";
            badgeNg.innerHTML = `[NG=F: $${ng.price.toFixed(3)} ${sign} ${ng.changePct.toFixed(2)}%]`;
            badgeNg.style.color = ng.change >= 0 ? "var(--green)" : "var(--red)";
        }

        const badgeTtf = document.getElementById("badge-ttf");
        if (badgeTtf) {
            const sign = ttf.change >= 0 ? "▲" : "▼";
            badgeTtf.innerHTML = `[TTF=F: €${ttf.price.toFixed(2)} ${sign} ${ttf.changePct.toFixed(2)}%]`;
            badgeTtf.style.color = ttf.change >= 0 ? "var(--green)" : "var(--red)";
        }
    } catch (err) {
        console.warn("[App] updateHeaderStrip failed:", err);
    }
}

/**
 * Lazy Loads tab panels triggers first loaded
 */
function loadTabContent(tabId) {
    if (State.initializedTabs.has(tabId)) return;

    switch (tabId) {
        case 'hh-chart': initHHChart(); break;
        case 'ttf-chart': initTTFChart(); break;
        case 'spot-price': initSpotChart(); break;
        case 'spread-analysis': initSpreadAnalysis(); break;
        case 'forward-curve': initForwardCurve(); break;
        case 'expiry-table': initExpiryTable(); break;
        case 'daily-log': initDailyLog(); break;
        case 'cross-spread': initCrossSpread(); break;
    }

    State.initializedTabs.add(tabId);
}

/**
 * Wireframe input triggers binds
 */
function setupControlListeners() {
    // HH Selectors
    const hhY = document.getElementById("hh-year"); if (hhY) hhY.addEventListener("change", (e) => { State.hhYear = e.target.value; initHHChart(); });
    const hhM = document.getElementById("hh-month"); if (hhM) hhM.addEventListener("change", (e) => { State.hhMonth = e.target.value; initHHChart(); });
    const hhSeg = document.getElementById("hh-tday-window");
    if (hhSeg) {
        hhSeg.addEventListener("click", (e) => {
            const btn = e.target.closest(".seg-btn");
            if (btn) {
                document.querySelectorAll("#hh-tday-window .seg-btn").forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                State.hhTDay = parseInt(btn.getAttribute("data-tday"));
                initHHChart();
            }
        });
    }
}

/**
 * TAB 1 - Initialize HH Chart setup buffers
 */
async function initHHChart() {
    const loader = document.getElementById("global-loader");
    if (loader) loader.classList.add("active");

    try {
        const year = State.hhYear;
        const month = State.hhMonth;
        const contract = `ng${month}${year.slice(-2)}`;
        const ticker = contractIDtoYahooTicker('NG', contract);

        const series = await getContractSeries("Henry Hub", contract, ticker);
        const band = await getSeasonalBand("Henry Hub", month, parseInt(year));

        renderHHChart("hh-chart-container", series, band, State.hhTDay);

        // Update Stats values
        if (series && series.length > 0) {
            const prices = series.map(d => d.price);
            document.getElementById("hh-stat-high").innerText = Math.max(...prices).toFixed(3);
            document.getElementById("hh-stat-low").innerText = Math.min(...prices).toFixed(3);
            document.getElementById("hh-stat-last").innerText = series[series.length - 1].price.toFixed(3);
            document.getElementById("hh-stat-days").innerText = series[series.length - 1].tDay;
        }

    } catch (err) {
        console.warn("initHHChart failed on triggers", err);
    } finally {
        if (loader) loader.classList.remove("active");
    }
}

/**
 * Lazy loaders anchors continuous placeholders avoiding Rule 2 breakers frame flawless setups Node-by-node
 */
function initTTFChart() { console.log("[Lazy] initTTFChart"); }
function initSpotChart() { console.log("[Lazy] initSpotChart"); }
function initSpreadAnalysis() { console.log("[Lazy] initSpreadAnalysis"); }
function initForwardCurve() { console.log("[Lazy] initForwardCurve"); }
function initExpiryTable() { console.log("[Lazy] initExpiryTable"); }
function initDailyLog() { console.log("[Lazy] initDailyLog"); }
function initCrossSpread() { console.log("[Lazy] initCrossSpread"); }
