# backend/app/main.py
from fastapi import FastAPI
from dotenv import load_dotenv
load_dotenv() 

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

# ✅ Import routers directly from their files (modules)
# from app.routes import router as api_router
from app.routes.post_scheduler_routes import router as post_scheduler_router

from dotenv import load_dotenv
load_dotenv() 



app = FastAPI(title="IRWA SocialMediaManager")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://social-media-manager-irwa-kaje.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiting (optional)
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

@app.get("/health")
def health():
    return {"ok": True, "service": "IRWA backend"}

# Mount routers
# app.include_router(api_router, prefix="/api")
app.include_router(post_scheduler_router)
# MongoDB database routes - added by pulindu
from app.routes.chat_routes import router as chat_router
app.include_router(chat_router)

from app.agents.content_creator import router as content_creator_router
app.include_router(content_creator_router, prefix="/content")

from app.agents.content_moderator import router as content_moderator_router
app.include_router(content_moderator_router, prefix="/moderator")

from app.agents.video_creator import router as video_creator_router
app.include_router(video_creator_router, prefix="/video")

from app.agents.engagement import router as engagement_router
app.include_router(engagement_router, prefix="/engagement")

