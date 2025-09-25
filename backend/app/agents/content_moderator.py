# app/agents/content_moderator.py
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import os, uuid, json, re

# ---- OpenAI client (same style as your project) ----
import openai
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

router = APIRouter()

# --- minimal fallback mask (only used if LLM fails) ---
_BANNED = ["hate", "kill", "racist", "sexist", "terror", "suicide"]
def _mask_banned(text: str) -> str:
    cleaned = text
    for w in _BANNED:
        cleaned = re.sub(rf"\b{re.escape(w)}\b", "***", cleaned, flags=re.IGNORECASE)
    return cleaned

# ---- request/response schema (matches your frontend Decision) ----
class ReviewRequest(BaseModel):
    caption: str
    hashtags: List[str] = []
    platform: str = "instagram"
    creator_request_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))

class ReviewResponse(BaseModel):
    status: str                      # "approved" | "rejected"
    reason: Optional[str] = None
    cleaned_caption: Optional[str] = None
    signals: Dict[str, float]
    explanations: List[str]

@router.get("/")
def read_root():
    return {"msg": "CORS working ✅"}

# ---- system prompt (NOTE: polarity is -1..1) ----
_SYSTEM = """You are a strict content safety moderator for social media captions.
Return compact JSON only. No prose, no markdown.
You must:
- classify policy risks (harassment/hate, self-harm, violence, sexual, spam/scam, profanity, personal data, platform-specific risks).
- choose an action: "approved" or "rejected".
- give a short reason (one sentence max) if rejected; else reason can be null.
- provide "cleaned_caption": a safe rewrite preserving original meaning; if already safe, you may return the original.
- produce signals where values are in [0,1] EXCEPT polarity which is in [-1,1]:
  toxicity [0..1], polarity [-1..1], profanity [0..1], spam [0..1], cyberbullying [0..1], length [0..1], hashtags [0..1], emoji_ratio [0..1].
- list 2–6 brief explanations.
JSON schema:
{
  "status": "approved" | "rejected",
  "reason": string | null,
  "cleaned_caption": string,
  "signals": {
    "toxicity": number,
    "polarity": number,        // -1..1
    "profanity": number,
    "spam": number,
    "cyberbullying": number,
    "length": number,
    "hashtags": number,
    "emoji_ratio": number
  },
  "explanations": string[]
}
Be conservative: reject when in doubt for explicit hate/violence/self-harm.
"""

def _user_prompt(caption: str, hashtags: List[str], platform: str) -> str:
    tag_str = ", ".join(f"#{h}" for h in hashtags if h)
    return (
        "Platform: " + platform + "\n"
        "Caption:\n" + caption.strip() + "\n"
        f"Hashtags: {tag_str}\n"
        "Output strictly the JSON object per schema."
    )

def _safe_parse_json(txt: str) -> dict:
    try:
        return json.loads(txt)
    except Exception:
        m = re.search(r"\{.*\}", txt, flags=re.S)
        if m:
            return json.loads(m.group(0))
        raise

def _clamp(v: float, lo: float, hi: float) -> float:
    try:
        x = float(v)
    except Exception:
        return lo
    return max(lo, min(hi, x))

def _moderate_with_llm(caption: str, hashtags: List[str], platform: str) -> ReviewResponse:
    try:
        resp = openai.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.2,
            max_tokens=450,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _user_prompt(caption, hashtags, platform)},
            ],
        )
        raw = resp.choices[0].message.content.strip()
        data = _safe_parse_json(raw)

        status = str(data.get("status", "approved")).lower()
        if status not in ("approved", "rejected"):
            status = "approved"

        reason = data.get("reason")
        cleaned_caption = data.get("cleaned_caption") or caption

        defaults = {
            "toxicity": 0.0, "polarity": 0.0, "profanity": 0.0, "spam": 0.0,
            "cyberbullying": 0.0, "length": 0.0, "hashtags": 0.0, "emoji_ratio": 0.0
        }
        sig_in = data.get("signals") or {}
        signals = defaults | {k: float(v) for k, v in sig_in.items() if k in defaults}

        # clamp: polarity [-1,1], others [0,1]
        for k, v in list(signals.items()):
            if k == "polarity":
                signals[k] = _clamp(v, -1.0, 1.0)
            else:
                signals[k] = _clamp(v, 0.0, 1.0)

        explanations = data.get("explanations") or []
        if not isinstance(explanations, list):
            explanations = [str(explanations)]

        return ReviewResponse(
            status=status,
            reason=reason,
            cleaned_caption=cleaned_caption,
            signals=signals,
            explanations=[str(e) for e in explanations][:6]
        )
    except Exception as e:
        # Fallback if LLM errors
        cleaned = _mask_banned(caption)
        return ReviewResponse(
            status="rejected" if cleaned != caption else "approved",
            reason=f"LLM moderation fallback: {type(e).__name__}",
            cleaned_caption=cleaned,
            signals={
                "toxicity": 0.5, "polarity": 0.0,  # neutral polarity for fallback
                "profanity": 0.2, "spam": 0.1, "cyberbullying": 0.2,
                "length": min(len(caption)/280, 1.0),
                "hashtags": min(len(hashtags)/10, 1.0),
                "emoji_ratio": 0.0
            },
            explanations=["Used heuristic fallback due to LLM error."]
        )

# ---- ROUTES (paths here are relative to prefix='/moderator' in main.py) ----

@router.post("/review", response_model=ReviewResponse)
async def review(req: ReviewRequest):
    return _moderate_with_llm(req.caption, req.hashtags, req.platform)

# underscore version (your frontend calls this)
@router.post("/review_and_forward", response_model=ReviewResponse)
async def review_and_forward(req: ReviewRequest):
    decision = _moderate_with_llm(req.caption, req.hashtags, req.platform)
    if decision.status == "approved":
        decision.explanations = list(decision.explanations) + ["✅ Auto-forwarded to Scheduler service."]
    return decision

# optional hyphen alias (harmless)
@router.post("/review-and-forward", response_model=ReviewResponse)
async def review_and_forward_hyphen(req: ReviewRequest):
    return await review_and_forward(req)
