# backend/app/agents/engagement.py
import os
import json
import re
from typing import List, Dict, Any
from openai import OpenAI

# Load API key from env (use python-dotenv elsewhere)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

# Simple file cache so you don't call the LLM repeatedly during development
CACHE_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "data", "sentiment_cache.json")
os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
try:
    with open(CACHE_PATH, "r", encoding="utf-8") as f:
        cache = json.load(f)
except Exception:
    cache = {}
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f)

def _save_cache():
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

def _extract_json_from_text(text: str):
    # Try to pull the first JSON object / array from LLM text
    m = re.search(r'(\[.*\]|\{.*\})', text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        return None

def classify_with_llm(comments: List[str]) -> List[Dict[str, str]]:
    """
    Batched LLM classification. Returns list of {"comment": ..., "sentiment": ...}
    If no API key found or the LLM fails, raises an exception (caller will fallback).
    """
    if not comments:
        return []

    # 1) Check cache
    out = [None] * len(comments)
    to_query = []
    idx_map = []
    for i, c in enumerate(comments):
        key = c.strip()
        if key in cache:
            out[i] = {"comment": c, "sentiment": cache[key]}
        else:
            idx_map.append(i)
            to_query.append(c)

    # Nothing to query
    if not to_query or client is None:
        # Fill missing with fallback (this case should not happen if OpenAI API is set)
        for i, item in enumerate(out):
            if item is None:
                out[i] = {"comment": comments[i], "sentiment": "Neutral"}
        return out

    # 2) Build a clear system prompt telling LLM to return strict JSON only
    system_msg = {
        "role": "system",
        "content": (
            "You are a sentiment classifier. You will be given a JSON array of strings (comments). "
            "Return ONLY a JSON array of objects in the same order, each object having keys "
            "\"comment\" and \"sentiment\" where sentiment is exactly one of: Positive, Neutral, Negative. "
            "Do not include extra explanation text — only the JSON array."
        )
    }
    user_msg = {"role": "user", "content": json.dumps(to_query, ensure_ascii=False)}

    # 3) Call the LLM (model can be changed)
    resp = client.chat.completions.create(
        model="gpt-4o-mini",  # Change model if needed
        messages=[system_msg, user_msg],
        temperature=0.0
    )
    raw = resp.choices[0].message.content

    parsed = _extract_json_from_text(raw)
    if parsed is None:
        # Try a fallback parse attempt; if still fails, raise so caller can fallback
        raise RuntimeError("Failed to parse JSON from LLM response")

    # Normalize parsed result
    normalized = []
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], str):
        # If LLM returned list of labels ["Positive","Negative"...] => map them to comments
        for c, label in zip(to_query, parsed):
            normalized.append({"comment": c, "sentiment": label.strip().capitalize()})
    else:
        # Assume list of objects
        for item in parsed:
            if isinstance(item, dict):
                label = item.get("sentiment") or item.get("label") or item.get("sent")
                label = (label.strip().capitalize() if isinstance(label, str) else "Neutral")
                # Prefer the comment returned by LLM (but keep our original if missing)
                comment_text = item.get("comment") if item.get("comment") else to_query[len(normalized)]
                normalized.append({"comment": comment_text, "sentiment": label})
            else:
                normalized.append({"comment": str(item), "sentiment": "Neutral"})

    # Store results in cache and return
    for idx, res_item in zip(idx_map, normalized):
        out[idx] = res_item
        cache_key = res_item["comment"].strip()
        cache[cache_key] = res_item["sentiment"]
    _save_cache()
    return out

def analyze_post(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Compute engagement
    likes = int(payload.get("likes", 0))
    shares = int(payload.get("shares", 0))
    reach = max(1, int(payload.get("reach", 1)))
    comments = payload.get("comments", []) or []
    follower_change = int(payload.get("follower_change", 0))

    engagement_rate = round(((likes + shares + len(comments)) / reach) * 100, 2)

    # Only use LLM for sentiment analysis
    try:
        sentiments = classify_with_llm(comments)
    except Exception:
        sentiments = [{"comment": c, "sentiment": "Neutral"} for c in comments]  # If LLM fails, fallback to Neutral

    breakdown = {"positive": 0, "neutral": 0, "negative": 0}
    for s in sentiments:
        lab = (s.get("sentiment") or "Neutral").lower()
        if lab.startswith("pos"):
            breakdown["positive"] += 1
        elif lab.startswith("neg"):
            breakdown["negative"] += 1
        else:
            breakdown["neutral"] += 1

    return {
        "postId": payload.get("postId"),
        "engagementRate": engagement_rate,
        "likes": likes,
        "shares": shares,
        "reach": reach,
        "follower_change": follower_change,
        "sentiments": sentiments,       # list of {comment, sentiment}
        "breakdown": breakdown
    }
