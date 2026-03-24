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