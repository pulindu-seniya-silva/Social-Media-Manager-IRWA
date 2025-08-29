
from app.routes import router

app = FastAPI(title="Agentic AI System")
app.include_router(router)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware

from app.routes.routes import router as api_router

app = FastAPI(title="IRWA SocialMediaManager – Content Moderator")

# CORS (Frontend origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tiny rate-limit
limiter = Limiter(key_func=get_remote_address, default_limits=["60/minute"])
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

@app.get("/health")
def health(): return {"ok": True}

app.include_router(api_router, prefix="/api")

#mongodb database routes - added by pulindu
from app.routes.chat_routes import router as chat_router
app.include_router(chat_router)



