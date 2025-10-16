 

from fastapi import FastAPI, APIRouter
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import openai
from dotenv import load_dotenv
from datetime import datetime
from typing import Dict, Tuple

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

#app = FastAPI(title="Social Media Content Generator Pro")

#origins = ["http://localhost:3000"]
#app.add_middleware(
#    CORSMiddleware,
#    allow_origins=origins,
#    allow_credentials=True,
#    allow_methods=["*"],
#    allow_headers=["*"],
#) 

class ContentRequest(BaseModel):
    topic: str
    platform: str = "general"
    tone: str = "professional"
    # 🔹 NEW (optional): user-controlled word limit
    word_limit: int | None = None

class ImageRequest(BaseModel):
    topic: str
    content: str = ""
    platform: str = "general"

# 🔹 NEW: request bodies for hashtag/keyword generation (keep it simple and optional)
class HKRequest(BaseModel):
    topic: str
    content: str = ""  # optional – can send generatedContent if available
    platform: str = "general"

router = APIRouter()

# -----------------------------
# Backend Pricing Model (simple)
# -----------------------------
# Plans: free | pro | team
# - text generations per day: 20 | 300 | 1000
# - image generation allowed:  False | True | True

PlanName = str  # 'free' | 'pro' | 'team'

PLAN_LIMITS: Dict[PlanName, Dict[str, object]] = {
    "free": {"gensPerDay": 20, "imageRegen": False, "label": "Free"},
    "pro": {"gensPerDay": 300, "imageRegen": True, "label": "Pro"},
    "team": {"gensPerDay": 1000, "imageRegen": True, "label": "Team"},
}

# In-memory usage store: key = (client_key, date_str) -> count
_USAGE_STORE: Dict[Tuple[str, str], int] = {}

def _today_key() -> str:
    d = datetime.utcnow()
    return f"{d.year}-{d.month:02d}-{d.day:02d}"

def _client_key_from_request(req: Request) -> str:
    # Prefer explicit client id header; fallback to remote IP
    client_id = req.headers.get("X-Client-Id")
    if client_id:
        return f"cid:{client_id}"
    ip = (req.client.host if req.client else "unknown")
    return f"ip:{ip}"

def _plan_from_headers(req: Request) -> PlanName:
    p = (req.headers.get("X-Plan") or "free").strip().lower()
    return p if p in PLAN_LIMITS else "free"

def _get_usage(req: Request) -> int:
    key = (_client_key_from_request(req), _today_key())
    return _USAGE_STORE.get(key, 0)

def _bump_usage(req: Request) -> int:
    key = (_client_key_from_request(req), _today_key())
    _USAGE_STORE[key] = _USAGE_STORE.get(key, 0) + 1
    return _USAGE_STORE[key]

def _check_and_bump_generation_allowance(req: Request, plan: PlanName):
    limit = int(PLAN_LIMITS[plan]["gensPerDay"])  # type: ignore[index]
    used = _get_usage(req)
    if used >= limit:
        label = PLAN_LIMITS[plan]["label"]  # type: ignore[index]
        raise HTTPException(status_code=429, detail=f"Daily limit reached for {label} plan ({used}/{limit}). Upgrade to increase limits.")
    _bump_usage(req)

def _require_image_allowed(plan: PlanName):
    if not bool(PLAN_LIMITS[plan]["imageRegen"]):  # type: ignore[index]
        raise HTTPException(status_code=402, detail="Image generation is available on Pro/Team plans. Upgrade to proceed.")

# Platform-specific guidelines
PLATFORM_GUIDELINES = {
    "instagram": "Create an engaging Instagram post with relevant hashtags. Keep it visual and appealing.",
    "twitter": "Create a concise Twitter post (under 280 characters) that's engaging and encourages retweets.",
    "facebook": "Create a friendly Facebook post that encourages comments and sharing.",
    "linkedin": "Create a professional LinkedIn post that showcases expertise and encourages discussion.",
    "tiktok": "Create a catchy TikTok caption that's trendy and encourages engagement.",
    "general": "Create an engaging social media post that works across platforms."
}

# Tone guidelines
TONE_GUIDELINES = {
    "professional": "Use a professional and polished tone suitable for business contexts.",
    "casual": "Use a casual, friendly tone that feels personal and approachable.",
    "funny": "Use humor and wit to make the post entertaining and shareable.",
    "inspirational": "Use an uplifting and motivational tone that inspires your audience.",
    "urgent": "Create a sense of urgency or importance to drive immediate action."
}

class ImageContentRequest(BaseModel):
    # Either provide image_url or image_base64 (data without prefix); backend will prepare data URI
    image_url: str | None = None
    image_base64: str | None = None
    platform: str = "general"
    tone: str = "professional"
    word_limit: int | None = None
    # Optional hint topic to steer generation
    topic: str | None = None

class ImageVariationRequest(BaseModel):
    image_base64: str
    prompt: str | None = None
    size: str = "1024x1024"

@router.post("/generate-content")
async def generate_content(req: ContentRequest, request: Request):
    try:
        # Pricing: enforce per-day text generation limits
        plan = _plan_from_headers(request)
        _check_and_bump_generation_allowance(request, plan)

        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        tone_guide = TONE_GUIDELINES.get(req.tone, TONE_GUIDELINES["professional"])

        # 🔹 If user provided a word limit, append a gentle constraint to the prompt.
        word_part = f"\nLimit the caption to about {req.word_limit} words." if req.word_limit else ""

        prompt = f"""
        Create a social media post about: {req.topic}
        
        Platform: {platform_guide}
        Tone: {tone_guide}
        {word_part}
        
        Please include relevant hashtags if appropriate for the platform.
        Make it engaging and shareable.
        """

        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are an expert social media content creator who creates highly engaging posts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=200
        )
        generated = response.choices[0].message.content.strip()

    except Exception as e:
        generated = f"Error generating content: {str(e)}"

    return {"content": generated}

# 🔹 NEW: generate hashtags (as a list) from topic/content
@router.post("/generate-hashtags")
async def generate_hashtags(req: HKRequest):
    try:
        base = f"Topic: {req.topic}."
        if req.content:
            base += f" Here is the draft caption: {req.content}"
        prompt = f"""
        {base}
        Platform: {req.platform}.
        Generate 5-10 short, relevant hashtags (no explanation). Return as a comma-separated list, without the # symbol.
        """
        resp = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You generate concise hashtag lists."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=120
        )
        text = resp.choices[0].message.content.strip()
        # Parse comma-separated into list; strip spaces and '#'
        tags = [t.strip().lstrip("#") for t in text.split(",") if t.strip()]
        # de-dup and cap
        seen = set()
        clean = []
        for t in tags:
            low = t.lower()
            if low and low not in seen:
                seen.add(low)
                clean.append(low)
        return {"hashtags": clean[:10]}
    except Exception as e:
        return {"hashtags": [], "error": str(e)}

# 🔹 NEW: generate keywords (as a list) from topic/content
@router.post("/generate-keywords")
async def generate_keywords(req: HKRequest):
    try:
        base = f"Topic: {req.topic}."
        if req.content:
            base += f" Here is the draft caption: {req.content}"
        prompt = f"""
        {base}
        Generate 5-10 concise topical keywords (lowercase, no punctuation). Return as a comma-separated list only.
        """
        resp = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You generate concise keyword lists."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=120
        )
        text = resp.choices[0].message.content.strip()
        kws = [k.strip().lower() for k in text.split(",") if k.strip()]
        # de-dup and cap
        seen = set()
        clean = []
        for k in kws:
            if k and k not in seen:
                seen.add(k)
                clean.append(k)
        return {"keywords": clean[:10]}
    except Exception as e:
        return {"keywords": [], "error": str(e)}

@router.post("/generate-image")
async def generate_image(req: ImageRequest, request: Request):
    try:
        # Pricing: require image allowed for plan
        plan = _plan_from_headers(request)
        _require_image_allowed(plan)

        # Create a more detailed prompt for better image generation
        if req.content:
            image_prompt = f"""
            Create a social media image for a post about {req.topic}. 
            The post content is: {req.content[:100]}...
            Style: Modern, eye-catching, professional, suitable for {req.platform} platform.
            Include visual elements that represent the topic but avoid text in the image.
            """
        else:
            image_prompt = f"""
            Create a social media image about {req.topic}. 
            Style: Modern, eye-catching, professional, suitable for {req.platform} platform.
            Include visual elements that represent the topic but avoid text in the image.
            """
        
        # Clean up the prompt to avoid API issues
        image_prompt = " ".join(image_prompt.split())
        
        # Generate image using DALL-E
        response = openai.images.generate(
            model="dall-e-3",
            prompt=image_prompt,
            size="1024x1024",
            quality="standard",
            n=1,
        )
        
        image_url = response.data[0].url
        return {"image_url": image_url}
        
    except Exception as e:
        print(f"Error generating image: {str(e)}")
        # Fallback to DALL-E 2 if DALL-E 3 is not available
        try:
            response = openai.images.generate(
                model="dall-e-2",
                prompt=f"A social media image about {req.topic}",
                size="512x512",
                n=1,
            )
            image_url = response.data[0].url
            return {"image_url": image_url}
        except Exception as e2:
            return {"error": f"Error generating image: {str(e2)}"}

@router.post("/generate-content-from-image")
async def generate_content_from_image(req: ImageContentRequest, request: Request):
    try:
        # Pricing: enforce per-day text generation limits; also gate image-vision by plan
        plan = _plan_from_headers(request)
        _require_image_allowed(plan)
        _check_and_bump_generation_allowance(request, plan)

        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        tone_guide = TONE_GUIDELINES.get(req.tone, TONE_GUIDELINES["professional"])

        word_part = f"Limit the caption to about {req.word_limit} words." if req.word_limit else "Keep it concise."

        system_prompt = (
            "You are an expert social media content creator. Analyze the given image and write a highly "
            "engaging caption tailored to the specified platform and tone. Include 2-4 relevant hashtags "
            "when appropriate."
        )

        text_context = (
            f"Platform guidance: {platform_guide}\nTone: {tone_guide}\n{word_part}"
        )
        if req.topic:
            text_context += f"\nOptional topic hint: {req.topic}"

        # Build image content
        image_part: dict
        if req.image_url:
            image_part = {"type": "image_url", "image_url": {"url": req.image_url}}
        elif req.image_base64:
            # Assume PNG if not specified; clients can still send a data URL via image_url if needed
            data_uri = f"data:image/png;base64,{req.image_base64}"
            image_part = {"type": "image_url", "image_url": {"url": data_uri}}
        else:
            return {"error": "Provide image_url or image_base64"}

        resp = openai.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": text_context},
                        image_part,
                    ],
                },
            ],
            temperature=0.7,
            max_tokens=220,
        )
        generated = resp.choices[0].message.content.strip()
        return {"content": generated}
    except Exception as e:
        return {"error": str(e), "content": ""}

@router.post("/generate-image-variation")
async def generate_image_variation(req: ImageVariationRequest, request: Request):
    import base64
    import tempfile
    try:
        # Pricing: require image allowed for plan
        plan = _plan_from_headers(request)
        _require_image_allowed(plan)

        # Decode base64 image into a temp file
        raw = base64.b64decode(req.image_base64)
        with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
            tmp.write(raw)
            tmp.flush()
            try:
                # Try DALL·E 2 variations (DALL·E 3 does not support variations)
                with open(tmp.name, "rb") as f:
                    response = openai.images.edits(
                        model="dall-e-2",
                        image=f,
                        prompt=(req.prompt or "Create a fresh, modern, eye-catching social media image inspired by the uploaded image. Avoid text."),
                        size=req.size,
                        n=1,
                    )
                image_url = response.data[0].url
                return {"image_url": image_url}
            except Exception:
                # Fallback: describe then generate similar using chat + images.generate
                vision_desc = openai.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Describe the image briefly with key visual elements and style."},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": "Please describe this image succinctly for use as an image generation prompt."},
                                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{req.image_base64}"}},
                            ],
                        },
                    ],
                    temperature=0.2,
                    max_tokens=120,
                )
                desc = vision_desc.choices[0].message.content.strip()
                prompt = req.prompt or ("Create a new social-media-ready visual inspired by: " + desc + ". Avoid text.")
                gen = openai.images.generate(
                    model="dall-e-3",
                    prompt=prompt,
                    size=req.size,
                    quality="standard",
                    n=1,
                )
                image_url = gen.data[0].url
                return {"image_url": image_url}
    except Exception as e:
        return {"error": str(e)}

#app.include_router(router, prefix="/content")


#mongodb database routes - added by pulindu
#from app.routes.chat_routes import router as chat_router
#app.include_router(chat_router)
