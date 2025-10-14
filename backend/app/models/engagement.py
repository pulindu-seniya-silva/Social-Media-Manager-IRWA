from pydantic import BaseModel
from typing import List, Dict

class TopPostAnalysis(BaseModel):
    post_title: str
    engagement_rate: float
    likes: int
    comments: int
    shares: int
    external_context_summary: str
    relevant_urls: List[str]
    strategic_recommendations: str

class AnalysisReport(BaseModel):
    total_posts_analyzed: int
    average_engagement_rate: float
    top_performing_post: TopPostAnalysis