import json
from datetime import datetime, timedelta
from typing import List, Iterator, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from auth import get_password_hash, verify_password, create_access_token, verify_token
from config import config_manager
from models import User, Memory, Message, Goal, Chat, get_db, create_tables
from utils import stream_chat_response, generate_initial_call_response, llm_client


class HistoryItem(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    history: List[HistoryItem] = []

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class MessageCreate(BaseModel):
    content: str
    sender: str
    chat_id: int

class ChatCreate(BaseModel):
    title: str

class TitleGenerateRequest(BaseModel):
    message: str

class GoalCreate(BaseModel):
    title: str
    description: str


security = HTTPBearer()

class ChatAPI:
    def __init__(self) -> None:
        self.app = FastAPI(
            title="Personal Coach API", 
            version="1.0.0"
        )
        self._configure_cors()
        self._register_routes()
        create_tables()
    
    def _configure_cors(self) -> None:
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["http://localhost:5173"],
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "DELETE"],
            allow_headers=["*"]
        )
    
    def _register_routes(self) -> None:
        @self.app.post("/api/auth/register")
        async def register_route(user_data: UserRegister, db: Session = Depends(get_db)):
            return await self.register(user_data, db)
            
        @self.app.post("/api/auth/login")
        async def login_route(user_data: UserLogin, db: Session = Depends(get_db)):
            return await self.login(user_data, db)
            
        @self.app.post("/api/chat/stream")
        async def stream_chat_route(request: ChatRequest, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.stream_chat(request, current_user, db)
            
        @self.app.get("/api/memories")
        async def get_memories_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_memories(current_user, db)
            
        @self.app.delete("/api/memories/{memory_id}")
        async def delete_memory_route(memory_id: str, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.delete_memory(memory_id, current_user, db)
            
        @self.app.get("/api/messages")
        async def get_messages_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_messages(current_user, db)
            
        @self.app.post("/api/messages")
        async def save_message_route(message_data: MessageCreate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.save_message(message_data, current_user, db)
            
        @self.app.delete("/api/messages")
        async def clear_messages_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.clear_messages(current_user, db)
            
        @self.app.get("/api/goals")
        async def get_goals_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_goals(current_user, db)
            
        @self.app.post("/api/goals")
        async def create_goal_route(goal_data: GoalCreate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.create_goal(goal_data, current_user, db)
            
        @self.app.delete("/api/goals/{goal_id}")
        async def delete_goal_route(goal_id: int, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.delete_goal(goal_id, current_user, db)
            
        @self.app.put("/api/goals/{goal_id}/status")
        async def update_goal_status_route(goal_id: int, status: str = "Active", current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.update_goal_status(goal_id, status, current_user, db)
            
        @self.app.get("/api/user/status")
        async def get_user_status_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_user_status(current_user, db)
            
        @self.app.get("/api/chats")
        async def get_chats_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_chats(current_user, db)
            
        @self.app.post("/api/chats")
        async def create_chat_route(chat_data: ChatCreate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.create_chat(chat_data, current_user, db)
            
        @self.app.put("/api/chats/{chat_id}")
        async def update_chat_route(chat_id: int, chat_data: ChatCreate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.update_chat(chat_id, chat_data, current_user, db)
            
        @self.app.delete("/api/chats/{chat_id}")
        async def delete_chat_route(chat_id: int, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.delete_chat(chat_id, current_user, db)
            
        @self.app.get("/api/chats/{chat_id}/messages")
        async def get_chat_messages_route(chat_id: int, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_chat_messages(chat_id, current_user, db)
            
        @self.app.post("/api/chats/generate-title")
        async def generate_title_route(request: TitleGenerateRequest, current_user: User = Depends(self.get_current_user)):
            return await self.generate_title(request)
            
        @self.app.post("/api/initial-call/chat")
        async def initial_call_chat_route(request: ChatRequest, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.initial_call_chat(request, current_user, db)
            
        @self.app.post("/api/initial-call/initialize")
        async def initialize_user_profile_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.initialize_user_profile(current_user, db)
    
    def _validate_request(self, request: ChatRequest) -> None:
        if not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    def get_current_user(
        self,
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
    ) -> User:
        email = verify_token(credentials.credentials)
        if not email:
            raise HTTPException(status_code=401, detail="Invalid authentication token")
        
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        
        return user
    
    def _convert_history_to_dict(self, history: List[HistoryItem]) -> List[dict]:
        return [{"role": item.role, "content": item.content} for item in history]
    
    def _generate_stream(
        self, 
        message: str, 
        history_dict: List[dict], 
        user: User, 
        db: Session
    ) -> Iterator[str]:
        try:
            full_response = ""
            
            for chunk in stream_chat_response(message, history_dict, user.id, db):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            
            if full_response.strip():
                memories = llm_client._extract_memories(message, full_response)
                if memories:
                    llm_client.save_memories_to_db(memories, user.id, db)
            
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    def _generate_initial_call_response(
        self, 
        message: str, 
        history_dict: List[dict], 
        user: User, 
        db: Session,
        prompt: str
    ) -> Iterator[str]:
        try:
            response = generate_initial_call_response(message, history_dict, user.id, db, prompt)
            yield f"data: {json.dumps({'chunk': response})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    async def stream_chat(
        self, 
        request: ChatRequest, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ) -> StreamingResponse:
        try:
            self._validate_request(request)
            history_dict = self._convert_history_to_dict(request.history)
            
            return StreamingResponse(
                self._generate_stream(request.message, history_dict, current_user, db),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Stream chat error: {str(e)}")
    
    async def get_memories(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            user_memories = (
                db.query(Memory)
                .filter(Memory.user_id == current_user.id)
                .order_by(Memory.created_at.desc())
                .all()
            )
            memories = [
                {
                    "id": str(memory.id),
                    "content": memory.content,
                    "timestamp": memory.created_at.isoformat()
                }
                for memory in user_memories
            ]
            return {"memories": memories}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def delete_memory(
        self, 
        memory_id: str, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            memory = db.query(Memory).filter(
                Memory.id == int(memory_id),
                Memory.user_id == current_user.id
            ).first()
            
            if not memory:
                raise HTTPException(status_code=404, detail="Memory not found")
            
            db.delete(memory)
            db.commit()
            return {"message": "Memory deleted successfully"}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid memory ID")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def register(
        self, 
        user_data: UserRegister, 
        db: Session = Depends(get_db)
    ):
        try:
            existing_user = db.query(User).filter(User.email == user_data.email).first()
            if existing_user:
                raise HTTPException(status_code=400, detail="Email already registered")
            
            hashed_password = get_password_hash(user_data.password)
            new_user = User(email=user_data.email, hashed_password=hashed_password)
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            
            access_token = create_access_token(data={"sub": new_user.email})
            return {"access_token": access_token, "token_type": "bearer"}
        
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def login(
        self, 
        user_data: UserLogin, 
        db: Session = Depends(get_db)
    ):
        try:
            user = db.query(User).filter(User.email == user_data.email).first()
            if not user or not verify_password(user_data.password, user.hashed_password):
                raise HTTPException(
                    status_code=401, 
                    detail="Invalid email or password"
                )
            
            access_token = create_access_token(data={"sub": user.email})
            return {"access_token": access_token, "token_type": "bearer"}
        
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_messages(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            user_messages = (
                db.query(Message)
                .filter(Message.user_id == current_user.id)
                .order_by(Message.created_at.asc())
                .all()
            )
            messages = [
                {
                    "text": message.content,
                    "sender": message.sender,
                    "timestamp": message.created_at.isoformat()
                }
                for message in user_messages
            ]
            return {"messages": messages}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def save_message(
        self, 
        message_data: MessageCreate,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            chat = db.query(Chat).filter(
                Chat.id == message_data.chat_id,
                Chat.user_id == current_user.id
            ).first()
            
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found")
            
            existing_message = db.query(Message).filter(
                Message.content == message_data.content,
                Message.sender == message_data.sender,
                Message.chat_id == message_data.chat_id
            ).order_by(Message.created_at.desc()).first()
            
            if existing_message:
                time_diff = datetime.utcnow() - existing_message.created_at
                if time_diff < timedelta(minutes=1):
                    return {"message": "Duplicate message not saved"}
            
            new_message = Message(
                content=message_data.content,
                sender=message_data.sender,
                user_id=current_user.id,
                chat_id=message_data.chat_id
            )
            
            chat.updated_at = datetime.utcnow()
            db.add(new_message)
            db.commit()
            db.refresh(new_message)
            return {"message": "Message saved successfully"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def clear_messages(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            deleted_count = db.query(Message).filter(Message.user_id == current_user.id).count()
            db.query(Message).filter(Message.user_id == current_user.id).delete()
            db.commit()
            return {"message": f"Successfully deleted {deleted_count} messages"}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_goals(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            user_goals = (
                db.query(Goal)
                .filter(Goal.user_id == current_user.id)
                .order_by(Goal.created_at.desc())
                .all()
            )
            goals = [
                {
                    "id": str(goal.id),
                    "title": goal.title,
                    "description": goal.description,
                    "status": goal.status,
                    "createdAt": goal.created_at.isoformat()
                }
                for goal in user_goals
            ]
            return {"goals": goals}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def create_goal(
        self, 
        goal_data: GoalCreate,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            new_goal = Goal(
                title=goal_data.title,
                description=goal_data.description,
                user_id=current_user.id
            )
            db.add(new_goal)
            db.commit()
            db.refresh(new_goal)
            
            return {
                "id": str(new_goal.id),
                "title": new_goal.title,
                "description": new_goal.description,
                "status": new_goal.status,
                "createdAt": new_goal.created_at.isoformat()
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def delete_goal(
        self, 
        goal_id: int,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            goal = db.query(Goal).filter(
                Goal.id == goal_id,
                Goal.user_id == current_user.id
            ).first()
            
            if not goal:
                raise HTTPException(status_code=404, detail="Goal not found")
            
            db.delete(goal)
            db.commit()
            return {"message": "Goal deleted successfully"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def update_goal_status(
        self, 
        goal_id: int,
        status: str,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            goal = db.query(Goal).filter(
                Goal.id == goal_id,
                Goal.user_id == current_user.id
            ).first()
            
            if not goal:
                raise HTTPException(status_code=404, detail="Goal not found")
            
            goal.status = status
            db.commit()
            db.refresh(goal)
            
            return {
                "id": str(goal.id),
                "title": goal.title,
                "description": goal.description,
                "status": goal.status,
                "createdAt": goal.created_at.isoformat()
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_user_status(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            return {
                "initial_call_completed": current_user.initial_call_completed or False
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_chats(
        self, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            user_chats = (
                db.query(Chat)
                .filter(Chat.user_id == current_user.id)
                .order_by(Chat.updated_at.desc())
                .all()
            )
            chats = [
                {
                    "id": str(chat.id),
                    "title": chat.title,
                    "createdAt": chat.created_at.isoformat(),
                    "updatedAt": chat.updated_at.isoformat()
                }
                for chat in user_chats
            ]
            return {"chats": chats}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def create_chat(
        self, 
        chat_data: ChatCreate,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            new_chat = Chat(
                title=chat_data.title,
                user_id=current_user.id
            )
            db.add(new_chat)
            db.commit()
            db.refresh(new_chat)
            
            return {
                "id": str(new_chat.id),
                "title": new_chat.title,
                "createdAt": new_chat.created_at.isoformat(),
                "updatedAt": new_chat.updated_at.isoformat()
            }
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def update_chat(
        self, 
        chat_id: int,
        chat_data: ChatCreate,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            chat = db.query(Chat).filter(
                Chat.id == chat_id,
                Chat.user_id == current_user.id
            ).first()
            
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found")
            
            chat.title = chat_data.title
            db.commit()
            db.refresh(chat)
            
            return {
                "id": str(chat.id),
                "title": chat.title,
                "createdAt": chat.created_at.isoformat(),
                "updatedAt": chat.updated_at.isoformat()
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def delete_chat(
        self, 
        chat_id: int,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            chat = db.query(Chat).filter(
                Chat.id == chat_id,
                Chat.user_id == current_user.id
            ).first()
            
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found")
            
            db.delete(chat)
            db.commit()
            return {"message": "Chat deleted successfully"}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_chat_messages(
        self, 
        chat_id: int,
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            chat = db.query(Chat).filter(
                Chat.id == chat_id,
                Chat.user_id == current_user.id
            ).first()
            
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found")
            
            chat_messages = (
                db.query(Message)
                .filter(Message.chat_id == chat_id)
                .order_by(Message.created_at.asc())
                .all()
            )
            messages = [
                {
                    "text": message.content,
                    "sender": message.sender,
                    "timestamp": message.created_at.isoformat()
                }
                for message in chat_messages
            ]
            return {"messages": messages}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    async def initial_call_chat(
        self, 
        request: ChatRequest, 
        current_user: User = Depends(get_current_user), 
        db: Session = Depends(get_db)
    ):
        try:
            self._validate_request(request)
            history_dict = self._convert_history_to_dict(request.history)
            
            chat_history = ""
            if history_dict:
                for entry in history_dict:
                    role = "User" if entry["role"] == "user" else "Coach"
                    chat_history += f"{role}: {entry['content']}\n"
            
            prompt = config_manager.initial_call_prompt.format(chat_history=chat_history)
            
            return StreamingResponse(
                self._generate_initial_call_response(request.message, history_dict, current_user, db, prompt),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Initial call chat error: {str(e)}")
    
    async def initialize_user_profile(
        self, 
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            import time
            time.sleep(5)
            
            user = db.query(User).filter(User.id == current_user.id).first()
            if user:
                user.initial_call_completed = True
                db.commit()
            
            return {"success": True, "message": "Profile initialization completed"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Profile initialization error: {str(e)}")
    
    async def generate_title(self, request: TitleGenerateRequest):
        try:
            prompt_path = "prompts/title_generation.md"
            try:
                with open(prompt_path, "r") as f:
                    prompt_template = f.read()
            except FileNotFoundError:
                raise HTTPException(status_code=500, detail="Title generation prompt not found")
            
            prompt = prompt_template.format(user_message=request.message)
            
            response = llm_client._get_client().models.generate_content(
                model=config_manager.model_name,
                contents=prompt,
                config={
                    "maxOutputTokens": 20,
                    "temperature": 0.7
                }
            )
            
            title = response.text.strip()
            
            if title.startswith('"') and title.endswith('"'):
                title = title[1:-1]
            if title.startswith("'") and title.endswith("'"):
                title = title[1:-1]
            
            if not title or len(title) > 50:
                words = request.message.split()[:5]
                title = " ".join(words)
                if len(title) > 30:
                    title = title[:27] + "..."
            
            return {"title": title}
            
        except Exception:
            words = request.message.split()[:5]
            title = " ".join(words)
            if len(title) > 30:
                title = title[:27] + "..."
            return {"title": title}


chat_api = ChatAPI()
app = chat_api.app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)