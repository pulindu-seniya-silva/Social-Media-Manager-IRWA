from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, HttpUrl
import httpx
import os
import openai
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

router = APIRouter()


class AnalyzeRequest(BaseModel):
    url: HttpUrl


class QARequest(BaseModel):
    url: HttpUrl
    question: str
    summary_hint: str | None = None


class DraftRequest(BaseModel):
    url: HttpUrl
    platform: str = "general"
    tone: str = "professional"
    word_limit: int | None = None
    summary_hint: str | None = None


PLATFORM_GUIDELINES = {
    "instagram": "Create an engaging Instagram post with relevant hashtags. Keep it visual and appealing.",
    "twitter": "Create a concise Twitter post (under 280 characters) that's engaging and encourages retweets.",
    "facebook": "Create a friendly Facebook post that encourages comments and sharing.",
    "linkedin": "Create a professional LinkedIn post that showcases expertise and encourages discussion.",
    "tiktok": "Create a catchy TikTok caption that's trendy and encourages engagement.",
    "general": "Create an engaging social media post that works across platforms.",
}

TONE_GUIDELINES = {
    "professional": "Use a professional and polished tone suitable for business contexts.",
    "casual": "Use a casual, friendly tone that feels personal and approachable.",
    "funny": "Use humor and wit to make the post entertaining and shareable.",
    "inspirational": "Use an uplifting and motivational tone that inspires your audience.",
    "urgent": "Create a sense of urgency or importance to drive immediate action.",
}


def extract_readable_text(html: str) -> str:
    try:
        from bs4 import BeautifulSoup
    except Exception:
        # If bs4 is not available, fall back to returning a trimmed HTML string
        return html[:20000]

    soup = BeautifulSoup(html, "html.parser")
    # Remove script/style/noscript
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    # Pull key metas
    title = (soup.title.string.strip() if soup.title and soup.title.string else "")
    og_title = soup.find("meta", property="og:title")
    og_desc = soup.find("meta", property="og:description")
    meta_desc = soup.find("meta", attrs={"name": "description"})
    head_bits = []
    if og_title and og_title.get("content"):
        head_bits.append(og_title.get("content").strip())
    elif title:
        head_bits.append(title)
    if og_desc and og_desc.get("content"):
        head_bits.append(og_desc.get("content").strip())
    elif meta_desc and meta_desc.get("content"):
        head_bits.append(meta_desc.get("content").strip())

    # Visible text
    body_text = soup.get_text(" ")
    text = ("\n\n".join(head_bits) + "\n\n" + body_text).strip()
    # Normalize whitespace and cap size for token limits
    text = " ".join(text.split())
    return text[:20000]


async def fetch_url_text(url: str) -> str:
    timeout = httpx.Timeout(15.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
        })
        resp.raise_for_status()
        html = resp.text
        return extract_readable_text(html)


# -----------------------------
# Backend Pricing Model (simple)
# -----------------------------
# Plans: free | pro | team
# - text generations per day: 20 | 300 | 1000

from datetime import datetime
from typing import Dict as _Dict, Tuple as _Tuple

PlanName = str
PLAN_LIMITS: _Dict[PlanName, _Dict[str, object]] = {
    "free": {"gensPerDay": 20, "label": "Free"},
    "pro": {"gensPerDay": 300, "label": "Pro"},
    "team": {"gensPerDay": 1000, "label": "Team"},
}
_USAGE_STORE: _Dict[_Tuple[str, str], int] = {}

def _today_key() -> str:
    d = datetime.utcnow()
    return f"{d.year}-{d.month:02d}-{d.day:02d}"

def _client_key(req: Request) -> str:
    cid = req.headers.get("X-Client-Id")
    if cid:
        return f"cid:{cid}"
    ip = (req.client.host if req.client else "unknown")
    return f"ip:{ip}"

def _plan(req: Request) -> PlanName:
    p = (req.headers.get("X-Plan") or "free").strip().lower()
    return p if p in PLAN_LIMITS else "free"

def _get_usage(req: Request) -> int:
    key = (_client_key(req), _today_key())
    return _USAGE_STORE.get(key, 0)

def _bump_usage(req: Request) -> int:
    key = (_client_key(req), _today_key())
    _USAGE_STORE[key] = _USAGE_STORE.get(key, 0) + 1
    return _USAGE_STORE[key]

def _check_and_bump_text_allowance(req: Request, plan: PlanName):
    limit = int(PLAN_LIMITS[plan]["gensPerDay"])  # type: ignore[index]
    used = _get_usage(req)
    if used >= limit:
        label = PLAN_LIMITS[plan]["label"]  # type: ignore[index]
        raise HTTPException(status_code=429, detail=f"Daily limit reached for {label} plan ({used}/{limit}). Upgrade to increase limits.")
    _bump_usage(req)


@router.post("/analyze")
async def analyze_link(req: AnalyzeRequest, request: Request):
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        html = await fetch_url_text(str(req.url))
        system = (
            "You are a skilled social media analyst. Given raw HTML of a public post or article, "
            "extract the core content in your own words (avoid boilerplate). Return a concise summary, "
            "key points, notable entities, and 5 suggested hashtags."
        )
        user = "Content follows (cleaned). Summarize and extract signals for social media.\n\n" + html
        resp = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.4,
            max_tokens=500,
        )
        content = resp.choices[0].message.content.strip()
        return {"summary": content}
    except Exception as e:
        return {"error": str(e)}


@router.post("/qa")
async def qa_on_link(req: QARequest, request: Request):
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        html = await fetch_url_text(str(req.url))
        system = (
            "You answer questions about the provided public post/article content. If unsure, say so."
        )
        user = (
            f"Question: {req.question}\n\n"
            "Use this HTML as context (ignore boilerplate, focus on content):\n\n" + html
        )
        if req.summary_hint:
            user = req.summary_hint + "\n\n" + user
        resp = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.3,
            max_tokens=400,
        )
        answer = resp.choices[0].message.content.strip()
        return {"answer": answer}
    except Exception as e:
        return {"error": str(e)}


@router.post("/draft")
async def draft_from_link(req: DraftRequest, request: Request):
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        html = await fetch_url_text(str(req.url))
        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        tone_guide = TONE_GUIDELINES.get(req.tone, TONE_GUIDELINES["professional"])
        word_part = f"Limit to about {req.word_limit} words." if req.word_limit else "Keep it concise."
        system = (
            "You create engaging social media captions based on a referenced post/article. "
            "Respect platform/tone guidance and include 2-4 relevant hashtags when appropriate."
        )
        user = (
            f"Platform: {platform_guide}\nTone: {tone_guide}\n{word_part}\n\n"
            "Use the following HTML as content reference (ignore boilerplate):\n\n" + html
        )
        if req.summary_hint:
            user = req.summary_hint + "\n\n" + user
        resp = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
            max_tokens=220,
        )
        caption = resp.choices[0].message.content.strip()
        return {"content": caption}
    except Exception as e:
        return {"error": str(e)}


