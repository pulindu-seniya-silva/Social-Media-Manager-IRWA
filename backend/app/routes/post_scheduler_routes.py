from fastapi import APIRouter

router = APIRouter()

@router.get("/")
@router.post("/")
@router.put("/")
@router.delete("/")

def home():
    return {"message": "AI Agent Backend is running!"}