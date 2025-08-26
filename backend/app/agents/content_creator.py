"use client"

from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import openai
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI(title="Social Media Content Generator Pro")

origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@router.post("/generate-content")
async def generate_content(req: ContentRequest):
    try:
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
async def generate_image(req: ImageRequest):
    try:
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

app.include_router(router, prefix="/content")

# (kept as-is to not change your existing structure)
@app.post("/content/generate-image")
async def generate_image(request: ImageRequest):
  return {"image_url": "..."}
