# backend/app/routes/post_scheduler_routes.py
from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.models.post_scheduler import SuggestRequest, SuggestResponse
from app.agents.post_scheduler import suggest_best_time, refresh_dataset, DATASET_SINGLETON

router = APIRouter(prefix="/post-scheduler", tags=["post-scheduler"])

@router.get("/health")
def health():
    try:
        v = DATASET_SINGLETON.view
        return {"ok": True, "rows": int(len(v.df))}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.post("/refresh")
def refresh():
    return refresh_dataset()

@router.post("/suggest", response_model=SuggestResponse)
def suggest(req: SuggestRequest):
    try:
        data = suggest_best_time(
            platform=req.platform,
            content_type=req.content_type,
            timezone=req.timezone,
            days_ahead=req.days_ahead,
            strategy=req.strategy,
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
