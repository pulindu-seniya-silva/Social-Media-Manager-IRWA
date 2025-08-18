from fastapi import FastAPI
from app.routes import router

app = FastAPI(title="Agentic AI System")
app.include_router(router)
