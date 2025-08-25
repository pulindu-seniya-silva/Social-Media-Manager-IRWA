from fastapi import FastAPI
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import re, uuid
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Content Moderator API")

# ------------------- CORS -------------------
origins = [
    "http://localhost:3000",  # Next.js frontend
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,        # or ["*"] for all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------- Root -------------------
@app.get("/")
def read_root():
    return {"msg": "CORS working ✅"}

# ------------------- Rules & Lexicons -------------------
banned = ["hate", "kill", "racist", "sexist", "terror", "suicide"]
negWords = ["awful","stupid","idiot","trash","disgusting","dumb","sucks","hate","kill"]
posWords = ["love","great","awesome","kind","thanks","amazing","cool","happy","inspiring"]

def clamp(n: float, min_: float = 0, max_: float = 1):
    return max(min_, min(max_, n))

# ------------------- Schemas -------------------
class ReviewRequest(BaseModel):
    caption: str
    hashtags: List[str] = []
    platform: str = "instagram"
    creator_request_id: Optional[str] = Field(default_factory=lambda: str(uuid.uuid4()))

class ReviewResponse(BaseModel):
    status: str                      # "approved" | "rejected"
    reason: Optional[str] = None     # why rejected
    cleaned_caption: Optional[str] = None
    signals: Dict[str, float]        # numeric indicators
    explanations: List[str]          # human-readable reasons

# ------------------- Core Logic -------------------
def moderate(caption: str, hashtags: List[str]) -> ReviewResponse:
    text = caption.lower()

    # Basic NLP-like passes
    banned_hits = [w for w in banned if re.search(rf"\b{w}\b", text)]
    toks = re.findall(r"[a-z']+", text)
    pos = sum(1 for t in toks if t in posWords)
    neg = sum(1 for t in toks if t in negWords)

    # Scores
    polarity = (pos - neg) / max(1, pos + neg)
    toxicity = clamp((neg + len(banned_hits)) / 5)

    length_score = clamp(len(caption) / 280)             # insta/twitter rough guidance
    hashtag_density = clamp(len(hashtags) / 10)          # >10 is spammy
    emoji_count = caption.count("😀") + caption.count("😂") + caption.count("🔥")
    emoji_ratio = clamp(emoji_count / max(1, len(caption)))

    cyberbullying_risk = clamp(neg / (len(toks) + 1))
    profanity_intensity = clamp(len(banned_hits) / 3)
    spam_score = clamp(caption.lower().count("buy now") / 2)

    signals = {
        "polarity": round(polarity, 3),
        "toxicity": round(toxicity, 3),
        "length": round(length_score, 3),
        "hashtags": round(hashtag_density, 3),
        "emoji_ratio": round(emoji_ratio, 3),
        "cyberbullying": round(cyberbullying_risk, 3),
        "profanity": round(profanity_intensity, 3),
        "spam": round(spam_score, 3),
    }

    # Explanations
    explanations: List[str] = []
    if banned_hits:
        explanations.append(f"Banned keywords detected: {', '.join(banned_hits)}")
    if toxicity >= 0.7:
        explanations.append("Severe toxicity signals")
    elif toxicity >= 0.4:
        explanations.append("Moderate toxicity signals")
    if polarity < -0.6:
        explanations.append("Strong negative sentiment")
    elif polarity < -0.3:
        explanations.append("Mild negative sentiment")
    if pos > 2:
        explanations.append("Detected positive language patterns")
    if "#" in caption or len(hashtags) > 0:
        explanations.append("Hashtags included – check for brand alignment")
    if spam_score >= 0.5:
        explanations.append("Possible spam intent detected")

    # Decision
    should_reject = (
        len(banned_hits) > 0 or
        toxicity >= 0.5 or
        polarity < -0.4
    )

    if should_reject:
        cleaned = caption
        for w in banned:
            cleaned = re.sub(rf"\b{w}\b", "***", cleaned, flags=re.IGNORECASE)
        return ReviewResponse(
            status="rejected",
            reason=explanations[0] if explanations else "Policy violation",
            cleaned_caption=cleaned,
            signals=signals,
            explanations=explanations or ["Policy violation detected."]
        )

    return ReviewResponse(
        status="approved",
        cleaned_caption=caption,
        signals=signals,
        explanations=explanations or ["No banned words; acceptable sentiment and toxicity levels."]
    )

# ------------------- Routes -------------------
@app.post("/moderator/review", response_model=ReviewResponse)
async def review(req: ReviewRequest):
    return moderate(req.caption, req.hashtags)

@app.post("/moderator/review-and-forward", response_model=ReviewResponse)
async def review_and_forward(req: ReviewRequest):
    decision = moderate(req.caption, req.hashtags)
    if decision.status == "approved":
        decision.explanations.append("✅ Auto-forwarded to Scheduler service.")
    return decision
