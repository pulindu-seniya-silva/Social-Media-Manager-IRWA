# app/agents/video_creator.py
from fastapi import APIRouter, BackgroundTasks, Request, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import openai
import httpx
import asyncio
import uuid
from datetime import datetime
from typing import Dict as _Dict, Tuple as _Tuple
from dotenv import load_dotenv
from fastapi.responses import FileResponse
from pathlib import Path

# Lazy imports for demo generation
from PIL import Image, ImageDraw, ImageFont
import imageio.v3 as iio

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")
RUNWAY_API_KEY = os.getenv("RUNWAY_API_KEY")

router = APIRouter()

# -----------------------------
# Backend Pricing Model (simple)
# -----------------------------
# Plans: free | pro | team
# - text generations per day: 20 | 300 | 1000
# - media generation (video) allowed:  False | True | True

PlanName = str  # 'free' | 'pro' | 'team'

PLAN_LIMITS: _Dict[PlanName, _Dict[str, object]] = {
    "free": {"gensPerDay": 20, "mediaAllowed": False, "label": "Free"},
    "pro": {"gensPerDay": 300, "mediaAllowed": True, "label": "Pro"},
    "team": {"gensPerDay": 1000, "mediaAllowed": True, "label": "Team"},
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

def _require_media_allowed(plan: PlanName):
    if not bool(PLAN_LIMITS[plan]["mediaAllowed"]):  # type: ignore[index]
        raise HTTPException(status_code=402, detail="Video generation is available on Pro/Team plans. Upgrade to proceed.")

# Request/Response Models
class VideoScriptRequest(BaseModel):
    topic: str
    platform: str = "general"
    duration: int = 60  # seconds
    style: str = "professional"
    target_audience: str = "general"
    include_visuals: bool = True
    include_voiceover: bool = True

class VideoOutlineRequest(BaseModel):
    topic: str
    platform: str = "general"
    duration: int = 60
    style: str = "professional"

class VideoSceneRequest(BaseModel):
    script: str
    scene_number: int
    duration: int
    style: str = "professional"

class VideoGenerationRequest(BaseModel):
    script: str
    platform: str = "general"
    style: str = "professional"
    duration: int = 60
    include_visuals: bool = True
    include_voiceover: bool = True

class VideoCreateRequest(BaseModel):
    script: str
    platform: str = "general"
    style: str = "professional"
    duration: int = 60
    prompt: Optional[str] = None
    image_url: Optional[str] = None

class VideoStatusResponse(BaseModel):
    video_id: str
    status: str  # "processing", "completed", "failed"
    progress: int = 0
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    error_message: Optional[str] = None
    created_at: str
    estimated_completion: Optional[str] = None

# In-memory storage for video generation status (in production, use Redis or database)
video_generation_status = {}

# Storage path for demo videos
DEMO_VIDEO_DIR = Path(os.getenv("DEMO_VIDEO_DIR", "backend/data/demo_videos"))
DEMO_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# Platform-specific guidelines
PLATFORM_GUIDELINES = {
    "instagram": "Create engaging Instagram Reels content with quick cuts, trending music, and visual storytelling.",
    "tiktok": "Create viral TikTok content with trending sounds, quick transitions, and engaging hooks.",
    "youtube": "Create YouTube Shorts with clear structure, engaging thumbnails, and educational value.",
    "facebook": "Create Facebook video content that encourages sharing and discussion.",
    "linkedin": "Create professional LinkedIn video content for business audiences.",
    "twitter": "Create Twitter video content that's concise and shareable.",
    "general": "Create engaging video content that works across platforms."
}

# Style guidelines
STYLE_GUIDELINES = {
    "professional": "Use a professional tone with clear structure and business-appropriate content.",
    "casual": "Use a friendly, conversational tone that feels personal and approachable.",
    "educational": "Use an informative tone with clear explanations and step-by-step guidance.",
    "entertaining": "Use humor and engaging storytelling to keep viewers entertained.",
    "inspirational": "Use an uplifting tone that motivates and inspires the audience.",
    "trendy": "Use current trends, slang, and popular culture references."
}

@router.post("/generate-script")
async def generate_script(req: VideoScriptRequest, request: Request):
    """Generate a video script based on topic and requirements."""
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        style_guide = STYLE_GUIDELINES.get(req.style, STYLE_GUIDELINES["professional"])
        
        prompt = f"""
        Create a video script for: {req.topic}
        
        Platform: {platform_guide}
        Style: {style_guide}
        Duration: {req.duration} seconds
        Target Audience: {req.target_audience}
        Include Visuals: {req.include_visuals}
        Include Voiceover: {req.include_voiceover}
        
        Please create a detailed script that includes:
        1. Hook/Opening (first 3-5 seconds)
        2. Main content with clear structure
        3. Call-to-action ending
        4. Visual cues and transitions
        5. Voiceover notes if applicable
        
        Format the script with timestamps and clear sections.
        Make it engaging and optimized for the {req.platform} platform.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert video script writer who creates engaging, platform-optimized video content."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.8,
            max_tokens=1000
        )
        
        script = response.choices[0].message.content.strip()
        
        return {
            "script": script,
            "platform": req.platform,
            "duration": req.duration,
            "style": req.style,
            "word_count": len(script.split())
        }
        
    except Exception as e:
        return {"error": f"Error generating script: {str(e)}"}

@router.post("/generate-outline")
async def generate_outline(req: VideoOutlineRequest, request: Request):
    """Generate a video outline/storyboard structure."""
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        style_guide = STYLE_GUIDELINES.get(req.style, STYLE_GUIDELINES["professional"])
        
        prompt = f"""
        Create a video outline for: {req.topic}
        
        Platform: {platform_guide}
        Style: {style_guide}
        Duration: {req.duration} seconds
        
        Please create a structured outline with:
        1. Video title
        2. Key message/objective
        3. Scene breakdown (3-5 scenes)
        4. Visual elements for each scene
        5. Transitions between scenes
        6. Call-to-action
        
        Format as a clear, actionable outline that can guide video production.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert video producer who creates detailed, actionable video outlines."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=800
        )
        
        outline = response.choices[0].message.content.strip()
        
        return {
            "outline": outline,
            "platform": req.platform,
            "duration": req.duration,
            "style": req.style
        }
        
    except Exception as e:
        return {"error": f"Error generating outline: {str(e)}"}

@router.post("/generate-scene-details")
async def generate_scene_details(req: VideoSceneRequest, request: Request):
    """Generate detailed scene information for a specific scene."""
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        prompt = f"""
        Create detailed scene information for scene {req.scene_number} of a video.
        
        Script context: {req.script[:500]}...
        Scene duration: {req.duration} seconds
        Style: {req.style}
        
        Please provide:
        1. Scene description
        2. Visual elements needed
        3. Camera angles/shot types
        4. Lighting suggestions
        5. Props or graphics needed
        6. Audio/music suggestions
        7. Transitions to next scene
        
        Make it detailed and actionable for video production.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert video director who provides detailed scene production guidance."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=600
        )
        
        scene_details = response.choices[0].message.content.strip()
        
        return {
            "scene_number": req.scene_number,
            "scene_details": scene_details,
            "duration": req.duration,
            "style": req.style
        }
        
    except Exception as e:
        return {"error": f"Error generating scene details: {str(e)}"}

@router.post("/generate-video-ideas")
async def generate_video_ideas(req: VideoOutlineRequest, request: Request):
    """Generate multiple video ideas based on a topic."""
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        
        prompt = f"""
        Generate 5 creative video ideas for: {req.topic}
        
        Platform: {platform_guide}
        Duration: {req.duration} seconds
        Style: {req.style}
        
        For each idea, provide:
        1. Title
        2. Brief description
        3. Key hook/opening
        4. Main content points
        5. Visual style suggestions
        6. Target engagement level
        
        Make each idea unique and optimized for the {req.platform} platform.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are a creative video strategist who generates viral, engaging video concepts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.9,
            max_tokens=1200
        )
        
        ideas = response.choices[0].message.content.strip()
        
        return {
            "ideas": ideas,
            "platform": req.platform,
            "duration": req.duration,
            "style": req.style,
            "topic": req.topic
        }
        
    except Exception as e:
        return {"error": f"Error generating video ideas: {str(e)}"}

@router.post("/optimize-for-platform")
async def optimize_for_platform(req: VideoGenerationRequest, request: Request):
    """Optimize existing script for specific platform requirements."""
    try:
        _check_and_bump_text_allowance(request, _plan(request))
        platform_guide = PLATFORM_GUIDELINES.get(req.platform, PLATFORM_GUIDELINES["general"])
        
        prompt = f"""
        Optimize this video script for the {req.platform} platform:
        
        Original Script: {req.script}
        
        Platform Guidelines: {platform_guide}
        Duration: {req.duration} seconds
        Style: {req.style}
        
        Please provide:
        1. Optimized script for the platform
        2. Platform-specific recommendations
        3. Timing adjustments
        4. Visual suggestions
        5. Engagement tactics
        6. Hashtag suggestions
        
        Make it specifically tailored for {req.platform} best practices.
        """
        
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert social media strategist who optimizes content for specific platforms."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        optimized_content = response.choices[0].message.content.strip()
        
        return {
            "optimized_script": optimized_content,
            "platform": req.platform,
            "original_script": req.script,
            "recommendations": f"Optimized for {req.platform} platform with {req.style} style"
        }
        
    except Exception as e:
        return {"error": f"Error optimizing script: {str(e)}"}

@router.get("/platforms")
async def get_platforms():
    """Get list of supported platforms."""
    return {
        "platforms": list(PLATFORM_GUIDELINES.keys()),
        "styles": list(STYLE_GUIDELINES.keys())
    }

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "video_creator"}

# Video Generation Functions
async def generate_video_prompt(script: str, platform: str, style: str) -> str:
    """Generate a visual prompt for video generation based on script."""
    platform_guide = PLATFORM_GUIDELINES.get(platform, PLATFORM_GUIDELINES["general"])
    style_guide = STYLE_GUIDELINES.get(style, STYLE_GUIDELINES["professional"])
    
    prompt = f"""
    Create a visual prompt for video generation based on this script:
    
    Script: {script[:500]}...
    Platform: {platform_guide}
    Style: {style_guide}
    
    Generate a detailed visual description that captures the essence of the video content.
    Focus on visual elements, scenes, colors, mood, and style that would work well for {platform}.
    Keep it concise but descriptive (under 200 words).
    """
    
    try:
        response = openai.chat.completions.create(
            model="gpt-4",
            messages=[
                {"role": "system", "content": "You are an expert video director who creates detailed visual prompts for AI video generation."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=300
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        return f"Professional video content about {script[:100]}... with {style} style for {platform} platform"

async def create_runway_video(prompt: str, duration: int = 4) -> Dict[str, Any]:
    """Create video using Runway ML API."""
    if not RUNWAY_API_KEY:
        raise Exception("Runway API key not configured")
    
    headers = {
        "Authorization": f"Bearer {RUNWAY_API_KEY}",
        "Content-Type": "application/json",
        # Required by Runway public API
        "X-Runway-Version": "2024-11-06"
    }
    
    # Runway ML API endpoint for video generation
    data = {
        "prompt": prompt,
        "duration": min(duration, 10),  # Runway has limits
        "model": "gen3a_turbo",
        "resolution": "1280x720",
        "aspect_ratio": "16:9"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.dev.runwayml.com/v1/generations",
            headers=headers,
            json=data,
            timeout=30.0
        )
        
        if response.status_code != 200:
            raise Exception(f"Runway API error: {response.status_code} - {response.text}")
        
        return response.json()

async def check_video_status(generation_id: str) -> Dict[str, Any]:
    """Check the status of a video generation."""
    if not RUNWAY_API_KEY:
        raise Exception("Runway API key not configured")
    
    headers = {
        "Authorization": f"Bearer {RUNWAY_API_KEY}",
        "Content-Type": "application/json",
        # Required by Runway public API
        "X-Runway-Version": "2024-11-06"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.dev.runwayml.com/v1/generations/{generation_id}",
            headers=headers,
            timeout=30.0
        )
        
        if response.status_code != 200:
            raise Exception(f"Runway API error: {response.status_code} - {response.text}")
        
        return response.json()

async def process_video_generation(video_id: str, script: str, platform: str, style: str, duration: int):
    """Background task to process video generation."""
    try:
        # Update status to processing
        video_generation_status[video_id] = {
            "video_id": video_id,
            "status": "processing",
            "progress": 10,
            "video_url": None,
            "thumbnail_url": None,
            "error_message": None,
            "created_at": datetime.now().isoformat(),
            "estimated_completion": None
        }
        
        # Generate visual prompt
        prompt = await generate_video_prompt(script, platform, style)
        
        # Update progress
        video_generation_status[video_id]["progress"] = 30
        
        # Create video with Runway ML
        runway_response = await create_runway_video(prompt, duration)
        generation_id = runway_response.get("id")
        
        if not generation_id:
            raise Exception("Failed to start video generation")
        
        # Update progress
        video_generation_status[video_id]["progress"] = 50
        
        # Poll for completion
        max_attempts = 60  # 5 minutes max
        attempt = 0
        
        while attempt < max_attempts:
            await asyncio.sleep(5)  # Check every 5 seconds
            
            status_response = await check_video_status(generation_id)
            status = status_response.get("status")
            
            if status == "SUCCEEDED":
                video_url = status_response.get("video_url")
                thumbnail_url = status_response.get("thumbnail_url")
                
                video_generation_status[video_id].update({
                    "status": "completed",
                    "progress": 100,
                    "video_url": video_url,
                    "thumbnail_url": thumbnail_url,
                    "estimated_completion": datetime.now().isoformat()
                })
                break
            elif status == "FAILED":
                error_msg = status_response.get("error", "Video generation failed")
                video_generation_status[video_id].update({
                    "status": "failed",
                    "error_message": error_msg,
                    "estimated_completion": datetime.now().isoformat()
                })
                break
            else:
                # Still processing
                progress = min(50 + (attempt * 2), 90)
                video_generation_status[video_id]["progress"] = progress
                attempt += 1
        
        # Timeout
        if attempt >= max_attempts:
            video_generation_status[video_id].update({
                "status": "failed",
                "error_message": "Video generation timed out",
                "estimated_completion": datetime.now().isoformat()
            })
            
    except Exception as e:
        video_generation_status[video_id].update({
            "status": "failed",
            "error_message": str(e),
            "estimated_completion": datetime.now().isoformat()
        })

@router.post("/create-video", response_model=VideoStatusResponse)
async def create_video(request: VideoCreateRequest, background_tasks: BackgroundTasks, http_request: Request):
    """Start video generation process."""
    try:
        # Pricing: require media allowed for plan; bump usage (counts as a generation)
        pl = _plan(http_request)
        _require_media_allowed(pl)
        _check_and_bump_text_allowance(http_request, pl)
        # If no Runway API key, fall back to demo video immediately
        if not RUNWAY_API_KEY:
            demo = _make_demo_video(
                script=request.script or "AI Demo",
                title=f"{request.platform.title()} Demo",
                duration=min(max(request.duration, 4), 12),
                width=1280,
                height=720,
            )
            return VideoStatusResponse(**demo)

        video_id = str(uuid.uuid4())
        
        # Initialize status
        video_generation_status[video_id] = {
            "video_id": video_id,
            "status": "processing",
            "progress": 0,
            "video_url": None,
            "thumbnail_url": None,
            "error_message": None,
            "created_at": datetime.now().isoformat(),
            "estimated_completion": None
        }
        
        # Start background task
        background_tasks.add_task(
            process_video_generation,
            video_id,
            request.script,
            request.platform,
            request.style,
            request.duration
        )
        
        return VideoStatusResponse(**video_generation_status[video_id])
        
    except Exception as e:
        # If Runway errors, fall back to demo video so UX still works
        try:
            demo = _make_demo_video(
                script=request.script or "AI Demo",
                title=f"{request.platform.title()} Demo",
                duration=min(max(request.duration, 4), 12),
                width=1280,
                height=720,
            )
            return VideoStatusResponse(**demo)
        except Exception as e2:
            return VideoStatusResponse(
                video_id="",
                status="failed",
                error_message=f"Runway+Demo failed: {e2}",
                created_at=datetime.now().isoformat()
            )

@router.get("/video-status/{video_id}", response_model=VideoStatusResponse)
async def get_video_status(video_id: str):
    """Get the status of a video generation."""
    if video_id not in video_generation_status:
        return VideoStatusResponse(
            video_id=video_id,
            status="not_found",
            error_message="Video ID not found",
            created_at=datetime.now().isoformat()
        )
    
    return VideoStatusResponse(**video_generation_status[video_id])

@router.get("/video-list")
async def list_videos():
    """List all generated videos."""
    return {
        "videos": list(video_generation_status.values()),
        "total": len(video_generation_status)
    }

@router.delete("/video/{video_id}")
async def delete_video(video_id: str):
    """Delete a video from the status list."""
    if video_id in video_generation_status:
        del video_generation_status[video_id]
        return {"message": "Video deleted successfully"}
    else:
        return {"message": "Video not found"}

# -----------------------------
# Demo (free) video generation - local MP4
# -----------------------------

class DemoVideoRequest(BaseModel):
    script: str
    title: str = "AI Generated Demo"
    duration: int = 8  # seconds
    width: int = 1280
    height: int = 720
    bg_color: str = "#0f172a"  # slate-900
    fg_color: str = "#e5e7eb"  # gray-200

def _wrap_text(text: str, draw: ImageDraw.ImageDraw, font: ImageFont.FreeTypeFont, max_width: int) -> str:
    words = text.split()
    lines = []
    current = []
    for w in words:
        test = " ".join(current + [w])
        w_px, _ = draw.textbbox((0,0), test, font=font)[2:]
        if w_px <= max_width:
            current.append(w)
        else:
            if current:
                lines.append(" ".join(current))
            current = [w]
    if current:
        lines.append(" ".join(current))
    return "\n".join(lines)

def _make_demo_video(script: str, title: str, duration: int, width: int, height: int,
                     bg_color: str = "#0f172a", fg_color: str = "#e5e7eb") -> Dict[str, Any]:
    video_id = str(uuid.uuid4())
    fps = 24
    total_frames = max(1, int(duration * fps))
    out_path = DEMO_VIDEO_DIR / f"{video_id}.mp4"

    # Fonts
    try:
        title_font = ImageFont.truetype("arial.ttf", size=64)
        body_font = ImageFont.truetype("arial.ttf", size=36)
    except Exception:
        title_font = ImageFont.load_default()
        body_font = ImageFont.load_default()

    # Pre-wrap body text
    dummy = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(dummy)
    wrapped = _wrap_text(script.strip()[:1000], draw, body_font, max_width=int(width * 0.8))

    frames = []
    for i in range(total_frames):
        img = Image.new("RGB", (width, height), bg_color)
        d = ImageDraw.Draw(img)

        # Animated overlay
        prog = i / total_frames
        overlay_height = int(80 + 120 * abs((prog * 2 % 2) - 1))
        d.rectangle([(0, 0), (width, overlay_height)], fill="#1e293b")

        # Title centered
        tw = d.textlength(title, font=title_font)
        d.text(((width - tw) / 2, 30), title, font=title_font, fill=fg_color)

        # Body text
        d.multiline_text((int(width * 0.1), 150), wrapped, font=body_font, fill=fg_color, spacing=6)

        frames.append(img)

    # Write MP4
    iio.imwrite(out_path, frames, fps=24, codec="libx264", quality=8)
    url = f"/video/demo/{video_id}.mp4"
    return {
        "video_id": video_id,
        "status": "completed",
        "progress": 100,
        "video_url": url,
        "thumbnail_url": None,
        "created_at": datetime.now().isoformat(),
    }

@router.post("/create-demo-video")
async def create_demo_video(req: DemoVideoRequest, request: Request):
    # Pricing: require media allowed for plan
    _require_media_allowed(_plan(request))
    _check_and_bump_text_allowance(request, _plan(request))
    return _make_demo_video(
        script=req.script,
        title=req.title,
        duration=req.duration,
        width=req.width,
        height=req.height,
        bg_color=req.bg_color,
        fg_color=req.fg_color,
    )

@router.get("/demo/{filename}")
async def serve_demo_video(filename: str):
    path = DEMO_VIDEO_DIR / filename
    if not path.exists():
        return {"error": "File not found"}
    return FileResponse(path, media_type="video/mp4")
