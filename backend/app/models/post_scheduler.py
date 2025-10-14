from pydantic import BaseModel
from typing import List, Optional

# --- Model for a single scraped post with AI analysis ---
class FoundPostSummary(BaseModel):
    snippet: str
    time_ago: str
    predicted_engagement_score: int
    justification: str

# --- Core Models ---
class Slot(BaseModel):
    weekday: int
    hour_24: int
    score: float

class ReasonPoint(BaseModel):
    icon: str
    title: str
    text: str

class StructuredReason(BaseModel):
    headline: str
    points: List[ReasonPoint]

# --- API Request and Response Models ---
class SuggestRequest(BaseModel):
    platform: str
    content_type: str
    content: str
    timezone: str
    strategy: str

class SuggestResponse(BaseModel):
    best_iso_utc: str
    best_local_pretty: str
    data_source: str
    data_source_explanation: str
    platform: str
    content_type: str
    top_slots: List[Slot]
    heatmap: List[List[float]]
    reason: StructuredReason
    found_posts: Optional[List[FoundPostSummary]] = None