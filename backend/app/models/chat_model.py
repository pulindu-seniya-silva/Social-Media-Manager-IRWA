# chat_models.py
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

Role = Literal["user", "assistant", "system", "tool"]

class ConversationCreate(BaseModel):
    title: Optional[str] = "Untitled Chat"
    participants: Optional[List[Role]] = ["user", "assistant"]

class ConversationOut(BaseModel):
    id: str = Field(..., description="Mongo _id as string")
    title: str
    participants: List[Role]
    status: Literal["active","archived"] = "active"
    lastMessageAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: datetime

class MessageCreate(BaseModel):
    role: Role
    content: str
    seq: Optional[int] = None  # optional ordering
    metadata: Optional[dict] = None

class MessageOut(BaseModel):
    id: str
    conversationId: str
    role: Role
    content: str
    seq: Optional[int] = None
    metadata: Optional[dict] = None
    createdAt: datetime
    updatedAt: datetime
