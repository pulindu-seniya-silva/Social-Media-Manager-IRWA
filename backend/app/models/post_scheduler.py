# backend/app/models/post_scheduler.py
from pydantic import BaseModel, Field
from typing import List, Literal, Optional

Platform = Literal["Instagram","Facebook","X (Twitter)","TikTok","LinkedIn","YouTube"]

class SuggestRequest(BaseModel):
    platform: Platform
    # Default "any" to match the backend logic and avoid 422s on GET
    content_type: str = Field("any", description="e.g., photo, reel, video, text, link")
    timezone: str = "Asia/Colombo"
    days_ahead: int = 7
    strategy: Literal["heuristic", "llm"] = "heuristic"  # "llm" adds an LLM-written reason

class Slot(BaseModel):
    weekday: int                # 0=Mon ... 6=Sun (python style)
    hour_24: int                # 0..23
    score: float

class SuggestResponse(BaseModel):
    best_iso_utc: str           # ISO UTC timestamp for the next occurrence
    best_local_pretty: str      # human friendly in the requested timezone
    platform: Platform
    content_type: str
    top_slots: List[Slot]
    heatmap: List[List[float]]  # 7x24 normalized grid (Mon..Sun × 0..23)
    reason: Optional[str] = None
