# backend/app/routes/post_scheduler_routes.py
from fastapi import APIRouter, HTTPException, Query
import asyncio

from app.models.post_scheduler import SuggestRequest, SuggestResponse, Slot
from app.agents.post_scheduler import (
    suggest_best_time_core,
    llm_reason,
    refresh_dataset,
    DATASET_SINGLETON,
)

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
async def suggest(req: SuggestRequest):
    try:
        # 1) Fast core (no LLM)
        data = suggest_best_time_core(
            platform=req.platform,
            content_type=req.content_type,
            timezone=req.timezone,
            #days_ahead=req.days_ahead,   # kept for compatibility; core ignores window right now
        )

        # 2) Optional LLM explanation
        if req.strategy == "llm":
            # run LLM off the event loop so other requests aren’t blocked
            loop = asyncio.get_event_loop()
            slots_for_llm = [
                (x["weekday"], x["hour_24"], float(x["score"])) for x in data["top_slots"]
            ]
            reason = await loop.run_in_executor(
                None, llm_reason, req.platform, req.content_type, slots_for_llm
            )
            data["reason"] = reason

        # 3) Coerce response to your Pydantic model (validates shape)
        data["top_slots"] = [Slot(**s) for s in data["top_slots"]]
        return SuggestResponse(**data)

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
