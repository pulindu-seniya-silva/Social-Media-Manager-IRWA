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

class ImageRequest(BaseModel):
    topic: str
    content: str = ""
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
        
        prompt = f"""
        Create a social media post about: {req.topic}
        
        Platform: {platform_guide}
        Tone: {tone_guide}
        
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

@app.post("/content/generate-image")
async def generate_image(request: ImageRequest):
    # Your image generation logic here
    return {"image_url": "..."}
