from fastapi import APIRouter
from app.agents import content_moderator

router = APIRouter()
router.include_router(content_moderator.router, prefix="/moderator")
