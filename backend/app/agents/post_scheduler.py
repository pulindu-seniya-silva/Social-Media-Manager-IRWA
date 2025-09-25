# backend/app/agents/post_scheduler.py
from __future__ import annotations
import os
import json
import hashlib
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Tuple, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# optional LLM (safe no-op if key not set)
try:
    from openai import OpenAI  # pip install openai
    _OPENAI = True
except Exception:
    _OPENAI = False

# -----------------------------
# Config
# -----------------------------
DATASET_PATH = os.getenv("DATASET_PATH", "data/social_media_engagement_data.xlsx")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# For production, add your frontend origins here
CORS_ALLOW_ORIGINS = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000").split(",")

# -----------------------------
# Small utilities
# -----------------------------
def _try_cols(df: pd.DataFrame, options: List[str]) -> Optional[str]:
    """Return first column name from `options` that exists in df (case-insensitive)."""
    lower = {c.lower(): c for c in df.columns}
    for k in options:
        if k.lower() in lower:
            return lower[k.lower()]
    return None

def _engagement_score(row: pd.Series) -> float:
    """Robust score using whatever columns exist."""
    likes = row.get("likes", 0) or 0
    comments = row.get("comments", 0) or 0
    shares = row.get("shares", 0) or 0
    reactions = row.get("reactions", 0) or 0
    saves = row.get("saves", 0) or 0
    impressions = row.get("impressions", None)
    raw = (likes + 2 * comments + 3 * shares + reactions + 2 * saves)
    if impressions and impressions > 0:
        return 1000.0 * raw / impressions
    return float(raw)

def _to_local_str(dt_utc: datetime, tz_name: str) -> str:
    return dt_utc.astimezone(ZoneInfo(tz_name)).strftime("%a, %d %b %Y %I:%M %p")

def _next_occurrence_from_weekday_hour(weekday: int, hour_24: int, now_local: datetime) -> datetime:
    # weekday: Mon=0 .. Sun=6
    days_ahead = (weekday - now_local.weekday()) % 7
    candidate = now_local.replace(hour=hour_24, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    if candidate <= now_local:
        candidate += timedelta(days=7)
    return candidate

def _hash_slots(slots: List[Tuple[int, int, float]]) -> str:
    js = json.dumps(slots, separators=(",", ":"), sort_keys=True)
    return hashlib.md5(js.encode("utf-8")).hexdigest()

# -----------------------------
# Data access / cache
# -----------------------------
@dataclass
class DataView:
    df: pd.DataFrame
    time_col: str
    platform_col: str
    type_col: str
    metrics: List[str]

# Global dataset version to invalidate caches on refresh
_DATASET_VERSION = 0

def _bump_version():
    global _DATASET_VERSION
    _DATASET_VERSION += 1

class Dataset:
    """
    Loads the raw dataset once, normalizes columns, derives features, and
    pre-aggregates into a tiny table: [platform, content_type, weekday, hour] -> mean(score).
    """
    def __init__(self, path: str = DATASET_PATH):
        self.path = path
        self._view: Optional[DataView] = None
        self._grouped: Optional[pd.DataFrame] = None  # pre-aggregated table

    def load(self) -> DataView:
        if not os.path.exists(self.path):
            raise FileNotFoundError(f"Dataset not found at {self.path}")

        # Read
        if self.path.endswith((".xlsx", ".xls")):
            df = pd.read_excel(self.path)
        else:
            df = pd.read_csv(self.path)

        # Normalize key columns
        rename_map: Dict[str, str] = {}

        ts_col = _try_cols(df, [
            "Post Timestamp", "created_at", "post_time", "Time", "datetime",
            "published_at", "Date", "Time Periods"
        ])
        if not ts_col:
            raise ValueError("Could not find a timestamp column. Expected one of: Post Timestamp/created_at/post_time/Time/datetime/published_at/Date/Time Periods")

        plat_col = _try_cols(df, ["Platform", "source", "network"])
        if not plat_col:
            raise ValueError("Could not find a platform column. Expected: Platform/source/network")

        type_col = _try_cols(df, ["Post Type", "type", "post_type", "format"])
        if not type_col:
            df["content_type"] = "unknown"
            type_col = "content_type"

        # Canonical lowercase metric names if present
        metric_candidates = set([
            "likes", "comments", "shares", "reactions", "saves",
            "impressions", "views", "clicks", "engagement_rate", "engagements rate"
        ])
        for c in df.columns:
            lc = str(c).strip().lower()
            if lc in metric_candidates:
                rename_map[c] = lc

        rename_map[ts_col] = "timestamp"
        rename_map[plat_col] = "platform"
        rename_map[type_col] = "content_type"

        df = df.rename(columns=rename_map)

        # Parse & filter time
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=False)
        df = df.dropna(subset=["timestamp"])

        # Derived features
        df["weekday"] = df["timestamp"].dt.weekday.astype("int8")  # 0..6
        df["hour"] = df["timestamp"].dt.hour.astype("int8")        # 0..23

        # Ensure expected metrics exist
        for name in ["likes", "comments", "shares", "reactions", "saves", "impressions"]:
            if name not in df.columns:
                df[name] = 0

        # Soft engagement score
        df["score"] = df.apply(_engagement_score, axis=1)

        # Pre-aggregate to a tiny table for speed
        grp = (
            df.groupby(["platform", "content_type", "weekday", "hour"], observed=True)["score"]
              .mean()
              .reset_index()
        )
        grp["platform"] = grp["platform"].astype("string")
        grp["content_type"] = grp["content_type"].astype("string")

        self._grouped = grp
        self._view = DataView(
            df=df,
            time_col="timestamp",
            platform_col="platform",
            type_col="content_type",
            metrics=[],  # not used at runtime
        )

        _bump_version()
        # Clear dependent caches on reload
        try:
            _heatmap_cached.cache_clear()
        except Exception:
            pass
        _LLM_CACHE.clear()
        return self._view

    @property
    def view(self) -> DataView:
        return self._view or self.load()

    @property
    def grouped(self) -> pd.DataFrame:
        self.view  # ensure loaded
        return self._grouped

DATASET_SINGLETON = Dataset(DATASET_PATH)

# -----------------------------
# Heatmap / ranking (fast path)
# -----------------------------
@lru_cache(maxsize=512)
def _heatmap_cached(platform_lower: str, content_type_lower: str, dataset_version: int) -> np.ndarray:
    """
    Build a 7x24 heatmap (normalized 0..1) from the pre-aggregated table.
    Cached by (platform, content_type, dataset_version).
    """
    grp = DATASET_SINGLETON.grouped

    # Filter the small pre-aggregated table
    if content_type_lower != "any":
        sel = grp[
            (grp["platform"].str.lower() == platform_lower) &
            (grp["content_type"].str.lower() == content_type_lower)
        ]
    else:
        sel = grp[(grp["platform"].str.lower() == platform_lower)]

    if sel.empty and content_type_lower != "any":
        sel = grp[(grp["platform"].str.lower() == platform_lower)]
    if sel.empty:
        sel = grp  # last resort: overall

    # Pivot => 7x24 grid
    pivot = sel.pivot_table(
        index="weekday",
        columns="hour",
        values="score",
        aggfunc="mean",
        fill_value=0.0
    )
    # ensure 7 rows 0..6 and 24 cols 0..23
    for w in range(7):
        if w not in pivot.index:
            pivot.loc[w] = 0.0
    pivot = pivot.sort_index().reindex(columns=range(24), fill_value=0.0)

    m = pivot.to_numpy(dtype=float)
    mx, mn = float(m.max()), float(m.min())
    if mx > mn:
        m = (m - mn) / (mx - mn)
    else:
        m = np.zeros_like(m)
    return m

def compute_heatmap(platform: str, content_type: str) -> np.ndarray:
    return _heatmap_cached(platform.lower(), content_type.lower(), _DATASET_VERSION)

def top_slots(platform: str, content_type: str, k: int = 5) -> List[Tuple[int, int, float]]:
    m = compute_heatmap(platform, content_type)
    items: List[Tuple[int, int, float]] = []
    for w in range(7):
        for h in range(24):
            items.append((w, h, float(m[w, h])))
    items.sort(key=lambda t: t[2], reverse=True)
    return items[:k]

# -----------------------------
# LLM client + caching
# -----------------------------
_OPENAI_CLIENT = None
def _get_openai_client():
    global _OPENAI_CLIENT
    if _OPENAI_CLIENT is None and OPENAI_API_KEY and _OPENAI:
        # Keep it simple; add timeout if your client version supports it.
        _OPENAI_CLIENT = OpenAI(api_key=OPENAI_API_KEY)
    return _OPENAI_CLIENT

# Cache explanations by (model, platform_lower, content_type_lower, slots_hash, dataset_version)
_LLM_CACHE: Dict[Tuple[str, str, str, str, int], str] = {}

def llm_reason(platform: str, content_type: str, slots: List[Tuple[int, int, float]]) -> Optional[str]:
    """
    Explain why the best slot works, using only the top slots summary.
    Uses an in-process cache to avoid re-calling the LLM for identical inputs.
    """
    if not (OPENAI_API_KEY and _OPENAI):
        return None

    model = LLM_MODEL
    key = (model, platform.lower(), content_type.lower(), _hash_slots(slots), _DATASET_VERSION)
    if key in _LLM_CACHE:
        return _LLM_CACHE[key]

    client = _get_openai_client()
    if client is None:
        return None

    weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    summary = [
        {"weekday": weekdays[w], "hour_24": h, "score_0_1": round(s, 3)}
        for (w, h, s) in slots
    ]
    prompt = (
        "You are a social media analytics assistant. "
        "Given the top time slots (0–1 normalized scores) computed from real engagement data, "
        f"pick ONE best slot and explain in <= 2 sentences for {platform} / '{content_type}'. "
        "Reference the scores briefly. Avoid generic advice.\n"
        f"Top slots:\n{json.dumps(summary, separators=(',', ':'))}"
    )

    try:
        r = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "Be concise, concrete, and data-referential."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=80,
            presence_penalty=0,
            frequency_penalty=0,
        )
        text = (r.choices[0].message.content or "").strip()
        _LLM_CACHE[key] = text
        return text
    except Exception as e:
        return f"(LLM unavailable: {e})"

# -----------------------------
# Public logic
# -----------------------------
def suggest_best_time_core(platform: str, content_type: str, timezone: str) -> Dict:
    """
    Core (fast) path that computes best slot using the cached heatmap.
    Does NOT call the LLM; that can be done separately.
    """
    m = compute_heatmap(platform, content_type)
    best_w, best_h, best_s = 0, 0, 0.0
    for w in range(7):
        for h in range(24):
            s = float(m[w, h])
            if s > best_s:
                best_w, best_h, best_s = w, h, s

    tz_local = ZoneInfo(timezone)
    now_local = datetime.now(tz_local)
    target_local = _next_occurrence_from_weekday_hour(best_w, best_h, now_local)
    best_utc = target_local.astimezone(ZoneInfo("UTC"))

    top = top_slots(platform, content_type, k=5)
    top_serializable = [{"weekday": w, "hour_24": h, "score": round(s, 4)} for (w, h, s) in top]
    heatmap_list = m.tolist()

    return {
        "best_iso_utc": best_utc.isoformat(),
        "best_local_pretty": _to_local_str(best_utc, timezone),
        "platform": platform,
        "content_type": content_type,
        "top_slots": top_serializable,
        "heatmap": heatmap_list,
        "reason": None,  # filled by LLM path if requested
    }

def refresh_dataset() -> Dict:
    DATASET_SINGLETON.load()
    # version bump + cache clears happen inside load()
    return {"ok": True, "rows": int(len(DATASET_SINGLETON.view.df))}

# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI(title="IRWA Backend (agents.post_scheduler)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class TimeRequest(BaseModel):
    platform: str
    content_type: str = "any"
    timezone: str = "UTC"
    strategy: str = "heuristic"  # or "llm"

@app.on_event("startup")
def _warm_start():
    # Warm-load dataset so first request is fast
    try:
        DATASET_SINGLETON.load()
    except Exception as e:
        print("Dataset warm-load failed:", e)

@app.get("/health")
def health():
    return {"ok": True, "service": "post_scheduler"}

# Async endpoints so the LLM call doesn't block the event loop
import asyncio

@app.post("/suggest-best-time")
async def api_suggest_best_time(request: TimeRequest):
    try:
        # Fast part first
        result = suggest_best_time_core(
            platform=request.platform,
            content_type=request.content_type,
            timezone=request.timezone,
        )

        if request.strategy.lower() == "llm":
            # Run the LLM step in a thread pool (non-blocking)
            loop = asyncio.get_event_loop()
            slots_for_llm = [
                (x["weekday"], x["hour_24"], float(x["score"])) for x in result["top_slots"]
            ]
            reason = await loop.run_in_executor(
                None, llm_reason, request.platform, request.content_type, slots_for_llm
            )
            result["reason"] = reason

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/suggest-best-time")
async def api_suggest_best_time_get(
    platform: str = Query(..., description="Social media platform"),
    content_type: str = Query("any", description="Type of content"),
    timezone: str = Query("UTC", description="Timezone for scheduling"),
    strategy: str = Query("heuristic", description="Strategy: heuristic or llm"),
):
    try:
        result = suggest_best_time_core(
            platform=platform,
            content_type=content_type,
            timezone=timezone,
        )
        if strategy.lower() == "llm":
            loop = asyncio.get_event_loop()
            slots_for_llm = [
                (x["weekday"], x["hour_24"], float(x["score"])) for x in result["top_slots"]
            ]
            reason = await loop.run_in_executor(None, llm_reason, platform, content_type, slots_for_llm)
            result["reason"] = reason
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/refresh-dataset")
def api_refresh_dataset():
    try:
        result = refresh_dataset()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/heatmap")
def api_get_heatmap(
    platform: str = Query(..., description="Social media platform"),
    content_type: str = Query("any", description="Type of content"),
):
    try:
        heatmap = compute_heatmap(platform, content_type)
        return {
            "platform": platform,
            "content_type": content_type,
            "heatmap": heatmap.tolist(),
            "shape": list(heatmap.shape),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
