from fastapi import FastAPI, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import openai
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

app = FastAPI(title="Agentic AI System")

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

router = APIRouter()

@router.post("/generate-content")
async def generate_content(req: ContentRequest):
    try:
        # New API style for v1.0+
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant for social media content."},
                {"role": "user", "content": f"Write a short, engaging social media post about: {req.topic}"}
            ],
            temperature=0.7,
            max_tokens=150
        )
        generated = response.choices[0].message.content
    except Exception as e:
        generated = f"Error generating content: {str(e)}"

    return {"content": generated}

app.include_router(router, prefix="/content")
