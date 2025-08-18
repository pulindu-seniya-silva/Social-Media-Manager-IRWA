from fastapi import APIRouter, Depends, HTTPException, FastAPI
from typing import List
from math import sqrt
from collections import Counter
import re, json, os, time

from app.models.moderation import PostDraft, ModerationDecision
from app.security.auth import verify_token

router = APIRouter()
app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Content Moderator API is running 🚀"}

# --- Load rules / keyword lists (IR) ---
DATA_DIR = os.getenv("MOD_DATA_DIR", "data")
BAN_FILE = os.path.join(DATA_DIR, "banned_keywords.txt")
SENSITIVE_FILE = os.path.join(DATA_DIR, "sensitive_keywords.txt")

def _load_words(path: str) -> List[str]:
    if not os.path.exists(path): return []
    with open(path, "r", encoding="utf-8") as f:
        return [w.strip().lower() for w in f if w.strip() and not w.startswith("#")]

BANNED = set(_load_words(BAN_FILE) or ["hate","kill","racist","sexist","terror","suicide"])
SENSITIVE = set(_load_words(SENSITIVE_FILE) or ["politics","religion","violence","self-harm","drugs"])

# --- Very small NLP helpers (no internet / light deps) ---
NEG_WORDS = {"hate","awful","stupid","idiot","kill","trash","disgusting","dumb","sucks"}
POS_WORDS = {"love","great","awesome","kind","thanks","amazing","cool","happy","inspiring"}

def sentiment_polarity(text: str) -> float:
    words = re.findall(r"[a-z']+", text.lower())
    if not words: return 0.0
    pos = sum(w in POS_WORDS for w in words)
    neg = sum(w in NEG_WORDS for w in words)
    return (pos - neg) / max(1, (pos + neg))

def heuristic_toxicity(text: str) -> float:
    text_l = text.lower()
    hits = sum(text_l.count(w) for w in NEG_WORDS.union(BANNED))
    return min(1.0, hits / 5.0)

def cosine_keyword_score(text: str, vocab: List[str]) -> float:
    # Tiny TF counter cosine with vocab bag
    toks = re.findall(r"[a-z']+", text.lower())
    tvec = Counter(toks)
    vvec = Counter(vocab)
    dot = sum(tvec[w] * vvec[w] for w in set(tvec) & set(vvec))
    n1 = sqrt(sum(c*c for c in tvec.values()))
    n2 = sqrt(sum(c*c for c in vvec.values()))
    return 0.0 if n1 == 0 or n2 == 0 else dot / (n1 * n2)

def clean_caption(text: str) -> str:
    # Mask banned words conservatively
    t = text
    for w in BANNED:
        t = re.sub(rf"\b{re.escape(w)}\b", "***", t, flags=re.IGNORECASE)
    return t

# --- Endpoints ---
@router.post("/review", response_model=ModerationDecision, tags=["Content Moderator"])
def review(draft: PostDraft, user=Depends(verify_token)):
    caption = draft.caption.strip()
    cap_l = caption.lower()

    exact_hits = [w for w in BANNED if re.search(rf"\b{re.escape(w)}\b", cap_l)]
    keyword_score = cosine_keyword_score(cap_l, list(SENSITIVE))
    polarity = sentiment_polarity(caption)
    tox = heuristic_toxicity(caption)

    explanations = []
    if exact_hits:
        explanations.append(f"Banned keywords detected: {', '.join(exact_hits)}")
    if tox >= 0.5:
        explanations.append("High toxicity signals (aggressive/insulting language)")
    if polarity < -0.4:
        explanations.append("Negative sentiment polarity")
    if keyword_score >= 0.35:
        explanations.append("Sensitive-topic proximity detected; needs cautious phrasing")

    if exact_hits or tox >= 0.5 or polarity < -0.4:
        return ModerationDecision(
            status="rejected",
            reason=explanations[0] if explanations else "Policy violation",
            cleaned_caption=clean_caption(caption),
            signals={"polarity": round(polarity,3), "toxicity_score": round(tox,3), "keyword_score": round(keyword_score,3)},
            explanations=explanations
        )

    return ModerationDecision(
        status="approved",
        cleaned_caption=caption,
        signals={"polarity": round(polarity,3), "toxicity_score": round(tox,3), "keyword_score": round(keyword_score,3)},
        explanations=["No banned words; acceptable sentiment and toxicity levels."]
    )

# Optional: forward to scheduler if approved (HTTP A2A)
import httpx
SCHEDULER_URL = os.getenv("SCHEDULER_URL")  # e.g., http://localhost:8000/scheduler/queue

@router.post("/review-and-forward", response_model=ModerationDecision, tags=["Content Moderator"])
def review_and_forward(draft: PostDraft, user=Depends(verify_token)):
    decision = review(draft, user)
    # audit log
    _log_audit("moderation_decision", {"draft": draft.dict(), "decision": decision.dict()})

    if decision.status == "approved" and SCHEDULER_URL:
        try:
            with httpx.Client(timeout=5.0) as client:
                client.post(SCHEDULER_URL, json={
                    "caption": decision.cleaned_caption or draft.caption,
                    "hashtags": draft.hashtags,
                    "platform": draft.platform,
                    "source": "content_moderator"
                }, headers={"Authorization": f"Bearer {os.getenv('SVC_TOKEN','')}"})
            decision.explanations.append("Forwarded to Post Scheduler.")
        except Exception:
            decision.explanations.append("Approved but forwarding to scheduler failed.")
    return decision

# Rules management (for IR) --------------------------------------------
@router.get("/rules", tags=["Content Moderator"])
def rules(user=Depends(verify_token)):
    return {
        "banned_keywords": sorted(BANNED),
        "sensitive_keywords": sorted(SENSITIVE)
    }

@router.post("/rules", tags=["Content Moderator"])
def add_rule(keyword: str, kind: str = "banned", user=Depends(verify_token)):
    kw = keyword.strip().lower()
    if not kw: raise HTTPException(400, "Empty keyword")
    if kind == "banned":
        BANNED.add(kw); _persist(BAN_FILE, BANNED)
    else:
        SENSITIVE.add(kw); _persist(SENSITIVE_FILE, SENSITIVE)
    return {"ok": True}

def _persist(path: str, words: set):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for w in sorted(words): f.write(w + "\n")

# Responsible-AI: simple audit log (transparency)
AUDIT_PATH = os.getenv("AUDIT_PATH", "data/mod_audit.log")
def _log_audit(event: str, payload: dict):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    rec = {"ts": int(time.time()), "event": event, **payload}
    with open(AUDIT_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
