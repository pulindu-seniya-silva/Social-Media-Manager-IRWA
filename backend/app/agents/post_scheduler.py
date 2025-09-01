# backend/app/agents/post_scheduler.py
from __future__ import annotations
import os
import math
import json
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Tuple, List, Optional
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
import numpy as np
from dateutil import tz
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# optional LLM (safe no-op if key not set)
try:
    from openai import OpenAI      # pip install openai
    _OPENAI = True
except Exception:
    _OPENAI = False

# -----------------------------
# Config
# -----------------------------
DATASET_PATH = os.getenv("DATASET_PATH", "data/social_media_engagement_data.xlsx")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# [Keep all your existing utility functions and classes exactly as they are]
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
    # impressions can normalize, but make it optional
    impressions = row.get("impressions", None)
    raw = (likes + 2*comments + 3*shares + reactions + 2*saves)
    if impressions and impressions > 0:
        return 1000.0 * raw / impressions
    return float(raw)

def _weekday(dt: pd.Timestamp) -> int:
    # python weekday: Mon=0..Sun=6
    return int(dt.weekday())

def _to_local_str(dt_utc: datetime, tz_name: str) -> str:
    return dt_utc.astimezone(ZoneInfo(tz_name)).strftime("%a, %d %b %Y %I:%M %p")

def _next_occurrence_from_weekday_hour(
    weekday: int, hour_24: int, now_local: datetime
) -> datetime:
    # weekday: Mon=0 .. Sun=6
    days_ahead = (weekday - now_local.weekday()) % 7
    candidate = now_local.replace(hour=hour_24, minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    if candidate <= now_local:
        candidate += timedelta(days=7)
    return candidate

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

class Dataset:
    def __init__(self, path: str = DATASET_PATH):
        self.path = path
        self._view: Optional[DataView] = None

    def load(self) -> DataView:
        if not os.path.exists(self.path):
            raise FileNotFoundError(f"Dataset not found at {self.path}")

        df = pd.read_excel(self.path) if self.path.endswith((".xlsx", ".xls")) else pd.read_csv(self.path)

        # normalize column names (create soft copies)
        rename_map = {}
        # timestamp column candidates
        ts_col = _try_cols(df, ["Post Timestamp","created_at","post_time","Time","datetime","published_at","Date","Time Periods"])
        if not ts_col:
            raise ValueError("Could not find a timestamp column. Expected one of: timestamp/created_at/post_time/time.")

        # platform column candidates
        plat_col = _try_cols(df, ["Platform","source","network"])
        if not plat_col:
            raise ValueError("Could not find a platform column. Expected: platform/source/network")

        # content type candidates
        type_col = _try_cols(df, ["Post Type","type","post_type","format"])
        if not type_col:
            # create a default 'unknown'
            df["content_type"] = "unknown"
            type_col = "content_type"

        # metric columns (whatever exists)
        metric_candidates = ["likes", "comments", "shares", "reactions", "saves","impressions", "views", "clicks", "engagement_rate", "engagements rate"]
        present = []
        # make canonical lowercase copies to simplify scoring
        for c in df.columns:
            lc = c.strip().lower()
            if lc in metric_candidates:
                rename_map[c] = lc  # rename original to canonical lowercase
                present.append(c)
        # ensure our key cols exist with canonical names too
        rename_map[ts_col] = "timestamp"
        rename_map[plat_col] = "platform"
        rename_map[type_col] = "content_type"

        df = df.rename(columns=rename_map)
        # parse time column
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=False)
        df = df.dropna(subset=["timestamp"])
        # pre-compute local pieces (we treat timestamp as already local to poster, which is ok for ranking)
        df["weekday"] = df["timestamp"].dt.weekday          # 0=Mon..6=Sun
        df["hour"] = df["timestamp"].dt.hour

        # build a soft engagement score
        # make sure expected metric names exist in lowercase (missing -> 0)
        for name in ["likes","comments","shares","reactions","saves","impressions"]:
            if name not in df.columns:
                df[name] = 0

        df["score"] = df.apply(_engagement_score, axis=1)

        self._view = DataView(df=df, time_col="timestamp", platform_col="platform",
                              type_col="content_type", metrics=present)
        return self._view

    @property
    def view(self) -> DataView:
        return self._view or self.load()

DATASET_SINGLETON = Dataset(DATASET_PATH)

# -----------------------------
# core ranking
# -----------------------------
def compute_heatmap(platform: str, content_type: str) -> np.ndarray:
    """
    returns a 7x24 matrix of mean scores normalized to [0,1].
    rows: Mon..Sun, cols: 0..23
    """
    v = DATASET_SINGLETON.view
    df = v.df.copy()

    df = df[df["platform"].str.lower() == platform.lower()]
    if content_type and content_type.lower() != "any":
        df = df[df["content_type"].str.lower() == content_type.lower()]
    if df.empty:  # fall back to platform only
        df = v.df[v.df["platform"].str.lower() == platform.lower()].copy()
    if df.empty:  # last resort: whole dataset
        df = v.df.copy()

    grid = df.groupby(["weekday","hour"])["score"].mean().unstack(fill_value=0.0)
    # ensure 7x24 presence
    for w in range(7):
        if w not in grid.index:
            grid.loc[w] = 0.0
    grid = grid.sort_index().reindex(columns=range(24), fill_value=0.0)
    m = grid.values.astype(float)
    # normalize 0..1
    mx = m.max()
    mn = m.min()
    if mx > mn:
        m = (m - mn) / (mx - mn)
    else:
        m = np.zeros_like(m)
    return m

def top_slots(platform: str, content_type: str, k: int = 5) -> List[Tuple[int,int,float]]:
    m = compute_heatmap(platform, content_type)
    # rank by score then spread by weekday/hour
    items: List[Tuple[int,int,float]] = []
    for w in range(7):
        for h in range(24):
            items.append((w, h, float(m[w, h])))
    # highest first
    items.sort(key=lambda t: t[2], reverse=True)
    # keep unique hours across days a bit more diverse (already diverse by (w,h))
    return items[:k]

# -----------------------------
# LLM "reasoner" (optional)
# -----------------------------
def llm_reason(platform: str, content_type: str, slots: List[Tuple[int,int,float]]) -> Optional[str]:
    """Explain the choice using the dataset-derived stats. Optional; returns None if API key missing."""
    if not (OPENAI_API_KEY and _OPENAI):
        return None

    client = OpenAI(api_key=OPENAI_API_KEY)

    weekdays = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
    summary = [
        {"weekday": weekdays[w], "hour_24": h, "score_0_1": round(s, 3)}
        for (w,h,s) in slots
    ]
    prompt = (
        "You are a social media analytics assistant. "
        "Given the top time slots (0..1 normalized scores) computed from real engagement data, "
        "pick the single best slot and explain briefly (2–3 sentences) why it likely works for "
        f"{platform} and content type '{content_type}'. Avoid generic advice; reference the scores.\n\n"
        f"Top slots JSON:\n{json.dumps(summary, indent=2)}\n\n"
        "Return ONLY the explanation text, no JSON."
    )

    try:
        # Chat Completions are still available and simple to integrate.
        r = client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": "Be concise and insightful."},
                {"role": "user", "content": prompt},
            ],
        )
        return (r.choices[0].message.content or "").strip()
    except Exception as e:
        return f"(LLM unavailable: {e})"

# -----------------------------
# public API used by routes
# -----------------------------
def suggest_best_time(platform: str, content_type: str, timezone: str, days_ahead: int = 7,
                      strategy: str = "heuristic") -> Dict:
    """
    1) build a 7x24 heatmap for (platform, content_type)
    2) pick the top-scoring slot
    3) map it to the next calendar occurrence in user's timezone
    """
    m = compute_heatmap(platform, content_type)
    best_w, best_h, best_s = 0, 0, 0.0
    for w in range(7):
        for h in range(24):
            s = float(m[w, h])
            if s > best_s:
                best_w, best_h, best_s = w, h, s

    # now choose the next calendar datetime in user's timezone
    tz_local = ZoneInfo(timezone)
    now_local = datetime.now(tz_local)
    target_local = _next_occurrence_from_weekday_hour(best_w, best_h, now_local)
    best_utc = target_local.astimezone(ZoneInfo("UTC"))

    top = top_slots(platform, content_type, k=5)
    top_serializable = [{"weekday": w, "hour_24": h, "score": round(s, 4)} for (w,h,s) in top]
    heatmap_list = m.tolist()

    reason = None
    if strategy == "llm":
        reason = llm_reason(platform, content_type, top)

    return {
        "best_iso_utc": best_utc.isoformat(),
        "best_local_pretty": _to_local_str(best_utc, timezone),
        "platform": platform,
        "content_type": content_type,
        "top_slots": top_serializable,
        "heatmap": heatmap_list,
        "reason": reason,
    }

def refresh_dataset() -> Dict:
    DATASET_SINGLETON.load()
    return {"ok": True, "rows": int(len(DATASET_SINGLETON.view.df))}

# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI(title="IRWA Backend (agents.post_scheduler)")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class TimeRequest(BaseModel):
    platform: str
    content_type: str = "any"
    timezone: str = "UTC"
    strategy: str = "heuristic"  # or "llm"

@app.get("/health")
def health():
    return {"ok": True, "service": "post_scheduler"}

@app.post("/suggest-best-time")
def api_suggest_best_time(request: TimeRequest):
    """Get the best time to post based on historical engagement data."""
    try:
        result = suggest_best_time(
            platform=request.platform,
            content_type=request.content_type,
            timezone=request.timezone,
            strategy=request.strategy
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/suggest-best-time")
def api_suggest_best_time_get(
    platform: str = Query(..., description="Social media platform"),
    content_type: str = Query("any", description="Type of content"),
    timezone: str = Query("UTC", description="Timezone for scheduling"),
    strategy: str = Query("heuristic", description="Strategy: heuristic or llm")
):
    """Get the best time to post (GET version for easy testing)."""
    try:
        result = suggest_best_time(
            platform=platform,
            content_type=content_type,
            timezone=timezone,
            strategy=strategy
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/refresh-dataset")
def api_refresh_dataset():
    """Reload the dataset from disk."""
    try:
        result = refresh_dataset()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/heatmap")
def api_get_heatmap(
    platform: str = Query(..., description="Social media platform"),
    content_type: str = Query("any", description="Type of content")
):
    """Get the engagement heatmap for visualization."""
    try:
        heatmap = compute_heatmap(platform, content_type)
        return {
            "platform": platform,
            "content_type": content_type,
            "heatmap": heatmap.tolist(),
            "shape": list(heatmap.shape)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))