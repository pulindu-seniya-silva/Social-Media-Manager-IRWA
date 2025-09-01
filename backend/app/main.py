# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

# ✅ Import routers directly from their files (modules)
# from app.routes import router as api_router
from app.routes.post_scheduler_routes import router as post_scheduler_router

app = FastAPI(title="IRWA SocialMediaManager")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
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
