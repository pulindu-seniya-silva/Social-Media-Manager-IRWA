from pydantic import BaseModel, Field, constr
from typing import List, Optional, Literal, Dict

SafeText = constr(strip_whitespace=True, min_length=1, max_length=2000)

class PostDraft(BaseModel):
    caption: SafeText
    hashtags: List[str] = []
    media_desc: Optional[str] = None
    platform: Optional[Literal["instagram","twitter","linkedin","tiktok","facebook"]] = None
    creator_request_id: Optional[str] = None  # traceability

class ModerationDecision(BaseModel):
    status: Literal["approved","rejected"]
    reason: Optional[str] = None
    cleaned_caption: Optional[str] = None
    signals: Dict[str, float] = {}  # polarity, toxicity_score, keyword_score
    explanations: List[str] = []     # transparency for Responsible AI
