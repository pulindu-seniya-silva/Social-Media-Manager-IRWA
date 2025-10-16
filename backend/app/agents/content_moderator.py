# app/agents/content_moderator.py
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Tuple
import os, uuid, json, re

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

router = APIRouter()

# ---- Scheduler integration imports ----
from app.models.post_scheduler import SuggestRequest, SuggestResponse
from app.agents.post_scheduler import PostSchedulerAgent

# --- minimal fallback mask (only used if LLM fails) ---
_BANNED = ["hate", "kill", "racist", "sexist", "terror", "suicide"]
def _mask_banned(text: str) -> str:
    cleaned = text
    for w in _BANNED:
        cleaned = re.sub(rf"\b{re.escape(w)}\b", "***", cleaned, flags=re.IGNORECASE)
    return cleaned

# ---- request/response schema ----
class ReviewRequest(BaseModel):
    caption: str
    hashtags: List[str] = []
    platform: str = "instagram"
    policy: Optional[str] = "standard_safe"
    creator_request_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))

class ReviewResponse(BaseModel):
    status: str                      # "approved" | "rejected"
    reason: Optional[str] = None
    cleaned_caption: Optional[str] = None
    signals: Dict[str, float]
    explanations: List[str]
    # Scheduling suggestion (when available)
    scheduled_at_iso: Optional[str] = None
    scheduled_at_pretty: Optional[str] = None

@router.get("/")
def read_root():
    return {"msg": "moderator alive ✅"}

# ---- system prompt ----
_SYSTEM = """You are a strict content safety moderator for social media captions.
Moderation modes:
- "strict": Only approve clean, professional, respectful captions. Reject informal, sarcastic, or emotionally strong.
- "balanced": Approve positive/neutral/respectful. Reject clearly toxic/hateful/unsafe text.
- "creative": Be lenient; allow mild slang/humor/edge unless clearly hateful or illegal.

Return COMPACT JSON ONLY (no prose, no markdown).
You must:
- classify policy risks (harassment/hate, self-harm, violence, sexual, spam/scam, profanity, personal data, platform risks)
- choose action: "approved" or "rejected"
- short reason if rejected; else null
- cleaned_caption: safe rewrite preserving meaning (or original if already safe)
- signals in {toxicity[0..1], polarity[-1..1], profanity[0..1], spam[0..1], cyberbullying[0..1], length[0..1], hashtags[0..1], emoji_ratio[0..1]}
- 2–6 brief explanations
JSON schema:
{
  "status": "approved" | "rejected",
  "reason": string | null,
  "cleaned_caption": string,
  "signals": {
    "toxicity": number,
    "polarity": number,
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

# ---- policy profiles ----
POLICY_PROFILES: Dict[str, Dict] = {
    "standard_safe": {
        "display": "Standard – Safe & Inclusive",
        "thresholds": {"toxicity": 0.30, "profanity": 0.20, "spam": 0.40, "cyberbullying": 0.25, "polarity_min": -0.20},
        "hard_bans": ["hate", "violence", "self_harm", "sexual_expl", "illegal"],
    },
    "edgy_marketing": {
        "display": "Edgy – Challenger Marketing",
        "thresholds": {"toxicity": 0.60, "profanity": 0.40, "spam": 0.50, "cyberbullying": 0.40, "polarity_min": -0.50},
        "hard_bans": ["hate", "violence", "self_harm", "sexual_expl", "illegal"],
    },
    "professional_brand": {
        "display": "Professional – Corporate/Regulated",
        "thresholds": {"toxicity": 0.20, "profanity": 0.05, "spam": 0.30, "cyberbullying": 0.10, "polarity_min": -0.05},
        "hard_bans": ["hate", "violence", "self_harm", "sexual_expl", "illegal"],
    },
}

def _policy_name(name: Optional[str]) -> str:
    if not name:
        return "standard_safe"
    key = name.strip().lower().replace("-", "_")
    return key if key in POLICY_PROFILES else "standard_safe"

def _user_prompt(caption: str, hashtags: List[str], platform: str, policy: str) -> str:
    tag_str = ", ".join(f"#{h}" for h in hashtags if h)
    return (
        f"Platform: {platform}\n"
        f"Moderation policy: {policy}\n"
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

def _extract_policy_risks(explanations: List[str]) -> List[str]:
    text = " ".join(explanations or []).lower()
    hits = []
    if any(k in text for k in ["hate", "harass", "racist", "sexist", "slur"]): hits.append("hate")
    if any(k in text for k in ["violence", "threat", "kill", "assault"]): hits.append("violence")
    if any(k in text for k in ["self-harm", "suicide", "self harm"]): hits.append("self_harm")
    if any(k in text for k in ["sexual", "explicit", "nsfw", "adult"]): hits.append("sexual_expl")
    if any(k in text for k in ["illegal", "drugs", "fraud"]): hits.append("illegal")
    return list(dict.fromkeys(hits))

def _apply_policy(
    status: str,
    reason: Optional[str],
    signals: Dict[str, float],
    explanations: List[str],
    policy_key: str,
) -> Tuple[str, Optional[str], List[str]]:
    profile = POLICY_PROFILES[_policy_name(policy_key)]
    th = profile["thresholds"]
    hard_bans = set(profile["hard_bans"])

    risks = set(_extract_policy_risks(explanations))
    if risks & hard_bans:
        why = ", ".join(sorted(risks & hard_bans)).replace("_", " ")
        expl = [f"❌ Hard-ban category detected: {why}. Policy forbids it."]
        return ("rejected", f"Hard-ban: {why}", explanations + expl)

    tox  = float(signals.get("toxicity", 0))
    prof = float(signals.get("profanity", 0))
    spam = float(signals.get("spam", 0))
    bully= float(signals.get("cyberbullying", 0))
    pol  = float(signals.get("polarity", 0))

    fails, passes = [], []

    if tox > th["toxicity"]: fails.append(f"toxicity {tox:.2f} > {th['toxicity']:.2f}")
    else: passes.append(f"toxicity OK ({tox:.2f} ≤ {th['toxicity']:.2f})")

    if prof > th["profanity"]: fails.append(f"profanity {prof:.2f} > {th['profanity']:.2f}")
    else: passes.append(f"profanity OK ({prof:.2f} ≤ {th['profanity']:.2f})")

    if spam > th["spam"]: fails.append(f"spam {spam:.2f} > {th['spam']:.2f}")
    else: passes.append(f"spam OK ({spam:.2f} ≤ {th['spam']:.2f})")

    if bully > th["cyberbullying"]: fails.append(f"cyberbullying {bully:.2f} > {th['cyberbullying']:.2f}")
    else: passes.append(f"cyberbullying OK ({bully:.2f} ≤ {th['cyberbullying']:.2f})")

    if pol < th["polarity_min"]: fails.append(f"polarity {pol:.2f} < {th['polarity_min']:.2f}")
    else: passes.append(f"polarity OK ({pol:.2f} ≥ {th['polarity_min']:.2f})")

    if fails:
        new_reason = f"Policy '{profile['display']}' violations: " + "; ".join(fails)
        new_expl = explanations + [f"Policy applied: {profile['display']}"] + [f"• {p}" for p in passes] + [f"• ❌ {f}" for f in fails]
        return ("rejected", new_reason, new_expl)

    new_reason = reason if reason else f"Meets '{profile['display']}' thresholds."
    new_expl = explanations + [f"Policy applied: {profile['display']}"] + [f"• {p}" for p in passes]
    return ("approved", new_reason, new_expl)

def _moderate_with_llm(caption: str, hashtags: List[str], platform: str, policy: str = "standard_safe") -> ReviewResponse:
    try:
        resp = client.chat.completions.create(
            model=LLM_MODEL,
            temperature=0.2,
            max_tokens=450,
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": _user_prompt(caption, hashtags, platform, policy)},
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
        signals = {**defaults, **{k: float(v) for k, v in sig_in.items() if k in defaults}}

        # clamp: polarity [-1,1], others [0,1]
        for k, v in list(signals.items()):
            if k == "polarity":
                signals[k] = _clamp(v, -1.0, 1.0)
            else:
                signals[k] = _clamp(v, 0.0, 1.0)

        explanations = data.get("explanations") or []
        if not isinstance(explanations, list):
            explanations = [str(explanations)]
        if not explanations:
            explanations = ["No policy risks explicitly noted by the model."]

        final_status, final_reason, final_expls = _apply_policy(
            status=status,
            reason=reason,
            signals=signals,
            explanations=explanations,
            policy_key=policy,   # ✅ use selected policy
        )

        return ReviewResponse(
            status=final_status,
            reason=final_reason,
            cleaned_caption=cleaned_caption,
            signals=signals,
            explanations=final_expls[:8],
        )

    except Exception as e:
        cleaned = _mask_banned(caption)
        return ReviewResponse(
            status="rejected" if cleaned != caption else "approved",
            reason=f"LLM moderation fallback: {type(e).__name__}",
            cleaned_caption=cleaned,
            signals={
                "toxicity": 0.5, "polarity": 0.0,
                "profanity": 0.2, "spam": 0.1, "cyberbullying": 0.2,
                "length": min(len(caption)/280, 1.0),
                "hashtags": min(len(hashtags)/10, 1.0),
                "emoji_ratio": 0.0
            },
            explanations=["Used heuristic fallback due to LLM error."]
        )

# ---- Routes (to be mounted under prefix '/moderator') ----
@router.post("/review", response_model=ReviewResponse)
async def review(req: ReviewRequest):
    return _moderate_with_llm(req.caption, req.hashtags, req.platform, req.policy or "standard_safe")

@router.post("/review_and_forward", response_model=ReviewResponse)
async def review_and_forward(req: ReviewRequest):
    decision = _moderate_with_llm(req.caption, req.hashtags, req.platform, req.policy or "standard_safe")
    if decision.status == "approved":
        decision.explanations = list(decision.explanations) + ["✅ Auto-forwarded to Scheduler service."]
        try:
            agent = PostSchedulerAgent()
            cleaned = decision.cleaned_caption or req.caption
            suggest_req = SuggestRequest(
                platform=req.platform,
                content_type="post",
                content=cleaned,
                timezone=os.getenv("DEFAULT_TZ", "Asia/Colombo"),
                strategy="core",
            )
            suggestion: SuggestResponse = agent.suggest_best_time(suggest_req)
            decision.scheduled_at_iso = suggestion.best_iso_utc
            decision.scheduled_at_pretty = suggestion.best_local_pretty
            decision.explanations = list(decision.explanations) + [
                f"🗓 Suggested best time: {suggestion.best_local_pretty}"
            ]
        except Exception as e:
            decision.explanations = list(decision.explanations) + [
                f"⚠️ Scheduler suggestion unavailable: {type(e).__name__}"
            ]
    return decision

@router.post("/review-and-forward", response_model=ReviewResponse)
async def review_and_forward_hyphen(req: ReviewRequest):
    return await review_and_forward(req)

@router.get("/policies")
def list_policies():
    return {
        "profiles": {
            k: {"display": v["display"], "thresholds": v["thresholds"]}
            for k, v in POLICY_PROFILES.items()
        }
    }
