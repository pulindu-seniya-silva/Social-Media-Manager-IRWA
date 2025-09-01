# db.py
import os
from typing import AsyncGenerator
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

MONGO_URI = os.getenv("MONGO_URI")
DB_NAME = os.getenv("DB_NAME", "ai_urgent_dev")

_client: AsyncIOMotorClient | None = None

async def get_db() -> AsyncGenerator[AsyncIOMotorDatabase, None]:
    global _client
    if _client is None:
        if not MONGO_URI:
            raise RuntimeError("MONGO_URI is not set")
        _client = AsyncIOMotorClient(MONGO_URI, maxPoolSize=10, serverSelectionTimeoutMS=10000)
    yield _client[DB_NAME]
