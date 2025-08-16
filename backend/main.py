from fastapi import FastAPI
from routes import router

app = FastAPI(title="Agentic AI System")

app.include_router(router)
