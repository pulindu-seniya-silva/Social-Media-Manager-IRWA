from pydantic import BaseModel, Field
from typing import List, Literal, Optional

# Define a literal type for platforms to match the frontend
Platform = Literal["Instagram", "Facebook", "X (Twitter)", "TikTok", "LinkedIn", "YouTube"]
Strategy = Literal["heuristic", "llm"]

class SuggestRequest(BaseModel):
    """The request body for the /suggest endpoint."""
    platform: Platform
    content_type: str
    timezone: str
    content: str  # The actual text content of the post
    days_ahead: int = 7
    strategy: Strategy = "llm"

class Slot(BaseModel):
    """Represents a single time slot with an engagement score."""
    weekday: int  # 0=Mon, 1=Tue, ..., 6=Sun
    hour_24: int
    score: float

class SuggestResponse(BaseModel):
    """The response body for the /suggest endpoint."""
    best_iso_utc: str
    best_local_pretty: str
    platform: Platform
    content_type: str
    top_slots: List[Slot]
    heatmap: List[List[float]]  # A 7x24 grid
    reason: Optional[str] = None