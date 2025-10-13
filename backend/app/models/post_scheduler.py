from pydantic import BaseModel, Field
from typing import List, Literal, Optional

# Define literal types for consistency
Platform = Literal["Instagram", "Facebook", "X (Twitter)", "TikTok", "LinkedIn", "YouTube"]
Strategy = Literal["heuristic", "llm"]

# --- Models for the API Request ---
class SuggestRequest(BaseModel):
    """The request body for the /suggest endpoint."""
    platform: Platform
    content_type: str
    timezone: str
    content: str
    days_ahead: int = 7
    strategy: Strategy = "llm"

# --- Models for the API Response ---
class Slot(BaseModel):
    """Represents a single time slot with an engagement score."""
    weekday: int  # 0=Mon, 1=Tue, ..., 6=Sun
    hour_24: int
    score: float

# <-- NEW: Model for a single point in the reason
class ReasonPoint(BaseModel):
    icon: str
    title: str
    text: str

# <-- NEW: Model for the entire structured reason object
class StructuredReason(BaseModel):
    headline: str
    points: List[ReasonPoint]

class SuggestResponse(BaseModel):
    """The response body for the /suggest endpoint."""
    best_iso_utc: str
    best_local_pretty: str
    data_source: str
    data_source_explanation: str
    platform: Platform
    content_type: str
    top_slots: List[Slot]
    heatmap: List[List[float]]  # A 7x24 grid
    reason: StructuredReason # <-- MODIFIED: This is now a structured object