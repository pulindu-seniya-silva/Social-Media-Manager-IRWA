from dotenv import load_dotenv
load_dotenv() 

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="IRWA SocialMediaManager – Content Moderator")

# CORS (Frontend origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB database routes - added by pulindu
from app.routes.chat_routes import router as chat_router
app.include_router(chat_router)

from app.agents.content_creator import router as content_creator_router
app.include_router(content_creator_router, prefix="/content")

from app.agents.content_moderator import router as content_moderator_router
app.include_router(content_moderator_router, prefix="/moderator")
