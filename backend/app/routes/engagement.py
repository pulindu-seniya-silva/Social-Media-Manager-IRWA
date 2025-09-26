# backend/app/routes/engagement.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from ..agents import engagement as engagement_agent  # Correct import path for your engagement agent

# Create an APIRouter instance
router = APIRouter()

# Define the structure of the request body
class AnalyzeRequest(BaseModel):
    postId: str
    likes: int = 0
    shares: int = 0
    reach: int = 1
    follower_change: int = 0
    comments: List[str] = []

# Define the new /api/engagement/analyze POST endpoint
@router.post("/api/engagement/analyze")
def analyze(req: AnalyzeRequest):
    try:
        # Convert the incoming request data to a dictionary
        payload = req.dict()
        # Call the analyze_post function from the engagement agent
        result = engagement_agent.analyze_post(payload)
        return result  # Return the result of the analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))  # Return error message if something goes wrong
