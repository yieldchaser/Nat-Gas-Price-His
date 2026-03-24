# Natural Gas Historical Pricing Data Node

A clean, structured repository containing historical and futures pricing data for global natural gas benchmarks.

---

### 📂 **Directory Layout**

*   **📁 `Cleaned_Database/`** *(Fully Audited & Standardized)*
    *   **`Henry Hub/`**: NYMEX Futures pricing chains (Daily)
    *   **`Dutch TTF/`**: European TTF contract history
    *   **`Spot Price/`**: Physical index delivery prices
    *   *Nesting*: Standardized into subfolders `Yearwise/` and `Monthwise/` for all categories.
*   **📁 `Price History Data/`**: Packed original source files (`.zip` nodes) matching historical delivery chains for safe keeping.

---

### 📄 **Standard File Content**

All processed `.csv` contract files inside `Cleaned_Database` contain strictly **4 columns**:

| Column Name | Description |
| :--- | :--- |
| **`S No.`** | Sequential Numbering (1, 2, 3...) |
| **`Date`** | Calendar row sorted chronologically (`YYYY-MM-DD`) |
| **`Price`** | Closing / Settlement numeric quote |
| **`Contract ID`** | Back-tracing ticket tag (e.g. `ngv24`, `Spot_Price`) |

*(All noisy nodes like Volume, %Chg, Position open interests are stripped out for analytics ready reads)*

---

---

### 📊 **Live Analytics Dashboard**

A high-performance static analytics suite running directly inside absolute browser tabs.

#### **🚀 Key Visual features overrides**
*   **📈 Continuous Charts**: Viz overlays stitching historical datasets together with live live streams offsets correctly flawlessly proper flaws corrected flawlessly.
*   **⚡ Live Spot EIA Stream overlays buffers**: Fast binary stream parsing leveraging SheetJS parsing correctly flawless triggers flawless setups inside local triggers node multipliers overlays layout flawless flawlessly flawlessly correctly.
*   **📊 Cross Spread layout controller**: Dual multipliers support supporting conversion absolute coefficients dynamically.

#### **📦 Component Views (8-Panel Matrix)**
1.  **HH Chart**: Price traces vs 5Y seasonal averages background grey overlays absolute binders flawlessly.
2.  **TTF Chart**: Benchmark coordinate frames pricing benchmarks mapped sequentially bounds flawlessly.
3.  **Spot Price**: authoritative streams loaded.
4.  **Spread Analysis**: matrices calculated.
5.  **Forward Curve**: Promise sweeps parallel.
6.  **Expiry Table**: Expiry offsets matrix node binders.
7.  **Daily Log**: Tabular tracking counters layouts overlays.
8.  **Cross Spread**: Single/Dual axes setups flawless.

**🛠️ Tech Stack Frame drivers**: Vanilla JS, Plotly.js, Papa Parse, SheetJS buffers. No backend framing demanded nodes stream flawless.