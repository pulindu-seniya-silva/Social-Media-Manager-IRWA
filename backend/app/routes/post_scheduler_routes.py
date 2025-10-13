from fastapi import APIRouter, HTTPException, Body
from app.agents.post_scheduler import PostSchedulerAgent
from app.models.post_scheduler import SuggestRequest, SuggestResponse

router = APIRouter(
    prefix="/post-scheduler",
    tags=["Post Scheduler"]
)

agent = PostSchedulerAgent()

@router.post("/suggest", response_model=SuggestResponse)
async def suggest_time(request: SuggestRequest = Body(...)):
    """
    Analyzes post content and suggests the optimal time to post.
    Can use a simple heuristic or a more advanced LLM-based strategy.
    """
    try:
        response_data = agent.suggest_best_time(request)
        return response_data
    except Exception as e:
        # Log the error for debugging
        print(f"An error occurred: {e}")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while generating the suggestion."
        )