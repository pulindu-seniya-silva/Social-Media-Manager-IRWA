from fastapi import APIRouter, HTTPException, Body
from app.agents.post_scheduler import PostSchedulerAgent
from app.models.post_scheduler import (
    SuggestRequest, SuggestResponse,
    ScheduleRequest, ScheduleResponse
)

router = APIRouter(prefix="/post-scheduler", tags=["Post Scheduler"])
agent = PostSchedulerAgent()

@router.post("/suggest", response_model=SuggestResponse)
def suggest_time(request: SuggestRequest = Body(...)):
    """
    Analyzes post content and suggests the optimal time to post.
    """
    try:
        return agent.suggest_best_time(request)
    except Exception as e:
        print(f"Error in /suggest: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/schedule", response_model=ScheduleResponse)
def schedule_post(request: ScheduleRequest = Body(...)):
    """
    Mocks scheduling a post to demonstrate the workflow.
    """
    try:
        response = agent.mock_schedule(request)
        if response.status == "error":
            raise HTTPException(status_code=400, detail=response.message)
        return response
    except Exception as e:
        detail = e.detail if isinstance(e, HTTPException) else str(e)
        raise HTTPException(status_code=500, detail=f"Failed to schedule: {detail}")