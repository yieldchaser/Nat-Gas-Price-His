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

### 📊 **Live Analytics Dashboard**

A static dashboard app setup designed to stitch historical layouts with dynamic live streams overlays.

*   **📈 Integrated Line layouts updates**: Absolute overlays stitching continuous cleaned databases maps together with Yahoo v8 feeds correctly.
*   **⚡ Live Spot Streaming layouts stream**: Frames EIA stream absolute arrays framing XLS tables parsed seamlessly leveraging SheetJS binary layouts directly.
*   **📊 Cross Spread layout controller**: Dual overlay multipliers support supporting conversion coefficients dynamically.

**Tech Frame layout layout**: Vanilla JavaScript, Plotly widgets overlays setups buffers, Papa Parse structures. No node framing required nodes.*