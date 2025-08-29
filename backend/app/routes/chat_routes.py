# chat_routes.py
from fastapi import APIRouter, Depends, HTTPException, Body
from bson import ObjectId
from datetime import datetime
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase
from app.utils.db import get_db
from app.models.chat_model import ConversationCreate, ConversationOut, MessageCreate, MessageOut

router = APIRouter(prefix="/chat", tags=["chat"])

def oid(s: str) -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid conversation id")

def to_convo_out(doc: Dict[str, Any]) -> ConversationOut:
    return ConversationOut(
        id=str(doc["_id"]),
        title=doc["title"],
        participants=doc.get("participants", []),
        status=doc.get("status", "active"),
        lastMessageAt=doc.get("lastMessageAt"),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )

def to_msg_out(doc: Dict[str, Any]) -> MessageOut:
    return MessageOut(
        id=str(doc["_id"]),
        conversationId=str(doc["conversationId"]),
        role=doc["role"],
        content=doc["content"],
        seq=doc.get("seq"),
        metadata=doc.get("metadata"),
        createdAt=doc["createdAt"],
        updatedAt=doc["updatedAt"],
    )

@router.post("/conversations", response_model=ConversationOut, status_code=201)
async def create_conversation(
    payload: ConversationCreate = Body(default=ConversationCreate()),   # 👈 default body
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    now = datetime.utcnow()
    doc = {
        "title": payload.title or "Untitled Chat",
        "participants": payload.participants or ["user","assistant"],
        "status": "active",
        "lastMessageAt": now,
        "createdAt": now,
        "updatedAt": now,
    }
    res = await db["conversations"].insert_one(doc)
    doc["_id"] = res.inserted_id
    return to_convo_out(doc)

@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def append_message(conversation_id: str, payload: MessageCreate, db: AsyncIOMotorDatabase = Depends(get_db)):
    conv = await db["conversations"].find_one({"_id": oid(conversation_id)})
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    now = datetime.utcnow()
    msg = {
        "conversationId": ObjectId(conversation_id),
        "role": payload.role,
        "content": payload.content,
        "seq": payload.seq,
        "metadata": payload.metadata,
        "createdAt": now,
        "updatedAt": now,
    }
    res = await db["messages"].insert_one(msg)
    msg["_id"] = res.inserted_id

    await db["conversations"].update_one(
        {"_id": ObjectId(conversation_id)},
        {"$set": {"lastMessageAt": now, "updatedAt": now}},
    )
    return to_msg_out(msg)

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageOut])
async def list_messages(
    conversation_id: str,
    limit: int = 50,
    cursor: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    q: Dict[str, Any] = {"conversationId": oid(conversation_id)}
    if cursor:
        q["_id"] = {"$lt": oid(cursor)}

    cur = db["messages"].find(q).sort("_id", -1).limit(min(max(limit, 1), 200))
    items = [to_msg_out(doc) async for doc in cur]
    return list(reversed(items))
