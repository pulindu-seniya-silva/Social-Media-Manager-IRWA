from pathlib import Path
import pandas as pd
import numpy as np
import json

# ---------- Locate files relative to THIS script (works from anywhere) ----------
THIS_FILE = Path(__file__).resolve()
BACKEND_DIR = THIS_FILE.parents[2]              # .../backend
DATA_DIR = BACKEND_DIR / "data"
OUTPUT_FILE = BACKEND_DIR / "app" / "agents" / "precomputed_heatmaps.json"

# Prefer CSV if present; otherwise XLSX
CANDIDATES = [
    DATA_DIR / "social_media_engagement_data.csv",
    DATA_DIR / "social_media_engagement_data.xlsx",
]

def _load_dataframe():
    for p in CANDIDATES:
        if p.exists():
            print(f"Found dataset: {p}")
            if p.suffix.lower() == ".csv":
                return pd.read_csv(p), p
            else:
                # If you read .xlsx, make sure openpyxl is installed: pip install openpyxl
                return pd.read_excel(p), p
    raise FileNotFoundError(
        f"No dataset found. Looked for:\n- {CANDIDATES[0]}\n- {CANDIDATES[1]}"
    )

def analyze_full_dataset():
    try:
        df, path_used = _load_dataframe()
        print(f"Loaded {len(df)} rows from: {path_used}")
    except Exception as e:
        print(f"❌ Could not load dataset: {e}")
        return

    # ----- Normalize expected column names -----
    # Your sheet should have these logical columns; map variations if needed.
    col_map = {
        "Post Timestamp": None,  # required
        "Platform": None,        # required
        "Likes": None,
        "Comments": None,
        "Shares": None,
    }

    # Try to auto-map case/underscore variants
    lower_cols = {c.lower(): c for c in df.columns}
    def find(name):
        candidates = [
            name,
            name.lower(),
            name.replace(" ", "_"),
            name.replace(" ", "").lower(),
        ]
        for c in candidates:
            if c in df.columns: return c
            if c in lower_cols:  return lower_cols[c]
        return None

    for k in list(col_map.keys()):
        col = find(k)
        if col is None and k in ("Likes", "Comments", "Shares"):
            # If any engagement component missing, default it to 0
            df[k] = 0
            col_map[k] = k
        elif col is None:
            print(f"❌ Required column not found: '{k}'. Columns present: {list(df.columns)}")
            return
        else:
            col_map[k] = col

    # ----- Feature engineering -----
    df["timestamp"] = pd.to_datetime(df[col_map["Post Timestamp"]], errors="coerce")
    df = df.dropna(subset=["timestamp"])
    df["weekday"] = df["timestamp"].dt.weekday      # 0=Mon … 6=Sun
    df["hour"]    = df["timestamp"].dt.hour

    weights = {"Likes": 1, "Comments": 2, "Shares": 3}
    df["engagement_score"] = (
        df[col_map["Likes"]]*weights["Likes"] +
        df[col_map["Comments"]]*weights["Comments"] +
        df[col_map["Shares"]]*weights["Shares"]
    )

    # ----- Compute 7x24 heatmaps per platform -----
    all_heatmaps = {}
    for platform, g in df.groupby(col_map["Platform"]):
        pivot = (
            g.groupby(["weekday", "hour"])["engagement_score"]
             .mean()
             .unstack(fill_value=0)
        )

        heat = np.zeros((7, 24))
        if not pivot.empty:
            # Ensure indices exist in the matrix bounds
            rows = pivot.index.astype(int)
            cols = pivot.columns.astype(int)
            heat[np.ix_(rows, cols)] = pivot.values

        m = heat.max()
        if m > 0:
            heat = heat / m

        all_heatmaps[str(platform)] = heat.tolist()
        print(f"✅ Heatmap generated for platform: {platform}")

    # ----- Save output -----
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_heatmaps, f, indent=2)

    print(f"\n🎉 Done! Saved heatmaps to: {OUTPUT_FILE}")

if __name__ == "__main__":
    analyze_full_dataset()
