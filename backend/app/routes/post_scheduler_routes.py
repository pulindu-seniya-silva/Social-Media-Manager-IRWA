from fastapi import APIRouter, HTTPException, Body, BackgroundTasks
from app.agents.post_scheduler import PostSchedulerAgent
from app.models.post_scheduler import (
    SuggestRequest, SuggestResponse,
    ScheduleRequest, ScheduleResponse
)
from typing import Dict, Any
from datetime import datetime, timezone
import asyncio
import os
import httpx

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


# -----------------------------
# Real scheduling + background publish
# -----------------------------
_QUEUE: Dict[str, Dict[str, Any]] = {}

async def _publish_to_platform(platform: str, content: str) -> str:
    p = platform.lower()

    # LinkedIn only
    if p == "linkedin":
        token = os.getenv("LINKEDIN_ACCESS_TOKEN")
        author = os.getenv("LINKEDIN_AUTHOR_URN")
        if token and author:
            payload = {
                "author": author,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": content},
                        "shareMediaCategory": "NONE",
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    "https://api.linkedin.com/v2/ugcPosts",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                        "X-Restli-Protocol-Version": "2.0.0",
                    },
                    json=payload,
                )
                if resp.status_code < 300:
                    return "LinkedIn post published."
                raise HTTPException(status_code=502, detail=f"LinkedIn API error: {resp.status_code} {resp.text}")
        raise HTTPException(status_code=400, detail="LinkedIn credentials missing. Set LINKEDIN_ACCESS_TOKEN and LINKEDIN_AUTHOR_URN.")

    # Disallow other platforms in this build
    raise HTTPException(status_code=400, detail="Only LinkedIn posting is supported.")


async def _wait_and_publish(job_id: str):
    job = _QUEUE.get(job_id)
    if not job:
        return
    schedule_at_iso = job["schedule_at_iso"]
    try:
        target = datetime.fromisoformat(schedule_at_iso.replace("Z", "+00:00")).astimezone(timezone.utc)
    except Exception:
        target = datetime.now(timezone.utc)

    while True:
        now = datetime.now(timezone.utc)
        delta = (target - now).total_seconds()
        if delta <= 0:
            break
        await asyncio.sleep(min(delta, 5))

    try:
        msg = await _publish_to_platform(job["platform"], job["content"])
        job["status"] = "posted"
        job["result"] = msg
    except Exception as e:
        job["status"] = "failed"
        job["result"] = str(e)


@router.post("/schedule", response_model=ScheduleResponse)
def schedule_post(request: ScheduleRequest = Body(...), background: BackgroundTasks = None):
    """
    Schedule a post and publish at the specified UTC ISO time.
    """
    if not request.content or not request.platform or not request.schedule_at_iso:
        raise HTTPException(status_code=400, detail="Missing required fields")

    p = str(request.platform).lower()
    if p != "linkedin":
        raise HTTPException(status_code=400, detail="Only LinkedIn posting is supported.")

    job_id = f"job-{len(_QUEUE) + 1}"
    _QUEUE[job_id] = {
        "id": job_id,
        "platform": p,
        "content": request.content,
        "schedule_at_iso": request.schedule_at_iso,
        "status": "scheduled",
    }

    if background is not None:
        background.add_task(_wait_and_publish, job_id)
    else:
        asyncio.create_task(_wait_and_publish(job_id))

    return ScheduleResponse(status="scheduled", message="Post scheduled.", scheduled_at=request.schedule_at_iso)


# -----------------------------
# Job management endpoints
# -----------------------------

@router.get("/jobs")
def list_jobs():
    # Return jobs sorted by schedule time
    def key_fn(j: Dict[str, Any]):
        try:
            return datetime.fromisoformat(j.get("schedule_at_iso", "").replace("Z", "+00:00"))
        except Exception:
            return datetime.max
    items = sorted(_QUEUE.values(), key=key_fn)
    return {"jobs": items}


@router.patch("/jobs/{job_id}")
def update_job(job_id: str, body: Dict[str, Any] = Body(...)):
    job = _QUEUE.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Only scheduled jobs can be updated")
    new_time = body.get("schedule_at_iso")
    if not new_time:
        raise HTTPException(status_code=400, detail="schedule_at_iso is required")
    job["schedule_at_iso"] = str(new_time)
    return {"status": "updated", "job": job}


@router.delete("/jobs/{job_id}")
def cancel_job(job_id: str):
    job = _QUEUE.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "scheduled":
        raise HTTPException(status_code=400, detail="Only scheduled jobs can be cancelled")
    job["status"] = "cancelled"
    return {"status": "cancelled", "job": job}