# backend/app/main.py
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

# ---- Routers (APIs) ----
from app.routes.post_scheduler_routes import router as post_scheduler_router
from app.routes.chat_routes import router as chat_router
from app.routes.engagement import router as engagement_api_router  # /api/engagement/...
from app.agents.content_creator import router as content_creator_router
from app.agents.content_moderator import router as content_moderator_router
from app.agents.video_creator import router as video_creator_router

# Try to support either `router` or `routes` in the engagement agent
engagement_agent_router = None
try:
    # Preferred: module exposes `router`
    from app.agents.engagement import router as _engagement_agent_router
    engagement_agent_router = _engagement_agent_router
except Exception:
    try:
        # Fallback: module exposes `routes`
        from app.agents import engagement as engagement_agent
        engagement_agent_router = getattr(engagement_agent, "routes", None)
    except Exception:
        engagement_agent_router = None

app = FastAPI(title="IRWA SocialMediaManager")

# ---- CORS (single block) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "https://social-media-manager-irwa-kaje.vercel.app",
        "*",  # keep only if you truly need it for dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Rate limiting (optional) ----
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

@app.get("/health")
def health():
    return {"ok": True, "service": "IRWA backend"}

# ---- Mount routers (each exactly once) ----
app.include_router(post_scheduler_router)
app.include_router(chat_router)
app.include_router(content_creator_router, prefix="/content")
app.include_router(content_moderator_router, prefix="/moderator")
app.include_router(video_creator_router, prefix="/video")

# REST API for engagement analyzer (your existing /api/engagement/... routes)
app.include_router(engagement_api_router, prefix="/api")

# Agent endpoints (if the agent module provides a router)
if engagement_agent_router is not None:
    app.include_router(engagement_agent_router, prefix="/engagement")
