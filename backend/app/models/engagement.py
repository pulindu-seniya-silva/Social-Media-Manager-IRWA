from pydantic import BaseModel, Field
from typing import List, Optional

# NEW: Defines the structure for a single recommendation sub-card
class RecommendationDetail(BaseModel):
    title: str = Field(..., description="A short, action-oriented title for the recommendation, e.g., 'Amplify Data Insights'.")
    description: str = Field(..., description="The full recommendation text.")

# UPDATED: The main recommendation model is now deeply structured
class StrategicRecommendation(BaseModel):
    theme: str = Field(..., description="The core strategic theme, e.g., 'Data-Driven Storytelling'.")
    reason: str = Field(..., description="A concise, one-sentence explanation for the post's success.")
    recommendations: List[RecommendationDetail] = Field(..., description="A list of two structured recommendation objects.")

# Defines the structure for a single post
class PostDetails(BaseModel):
    id: int
    post_title: str
    created_date: Optional[str] = None
    likes: int
    comments: int
    shares: int
    engagement_rate: float

# The main analysis object, updated to use the new recommendation model
class TopPostAnalysis(BaseModel):
    post_title: str
    engagement_rate: float
    likes: int
    comments: int
    shares: int
    external_context_summary: str
    relevant_urls: List[str]
    strategic_recommendations: StrategicRecommendation # <-- UPDATED
    upcoming_trends: List[str]

# This is the response for the initial file upload.
class InitialAnalysisResponse(BaseModel):
    total_posts_analyzed: int
    average_engagement_rate: float
    posts: List[PostDetails]