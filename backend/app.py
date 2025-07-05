import json
import threading
from datetime import datetime, timedelta, timezone
from typing import List, Iterator, Optional, Dict

from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
import base64
import mimetypes

from auth import get_password_hash, verify_password, create_access_token, verify_token
from config import config_manager
from models import User, UserProfile, Message, Goal, Chat, Book, get_db, create_tables, SessionLocal
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

class BookSummaryRequest(BaseModel):
    title: str
    author: str

class BookDiscussionRequest(BaseModel):
    message: str
    bookId: str
    bookTitle: str
    bookAuthor: str
    currentChapterIndex: int
    chapters: List[dict]
    history: List[HistoryItem] = []

class MaterialFeedbackCreate(BaseModel):
    material_type: str  # 'book' or 'video'
    material_id: int
    rating: int  # 1-5
    review: Optional[str] = None
    completed: bool = True

class MaterialFeedbackUpdate(BaseModel):
    rating: Optional[int] = None
    review: Optional[str] = None
    completed: Optional[bool] = None


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
        
        @self.app.post("/api/chat/stream-multimodal")
        async def stream_chat_multimodal_route(
            message: str = Form(...),
            chat_id: int = Form(...),
            history: str = Form("[]"),
            files: List[UploadFile] = File(None),
            current_user: User = Depends(self.get_current_user),
            db: Session = Depends(get_db)
        ):
            return await self.stream_chat_multimodal(message, chat_id, history, files, current_user, db)

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
        async def get_user_status_route(current_user: User = Depends(self.get_current_user)):
            return await self.get_user_status(current_user)

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
        async def generate_title_route(request: TitleGenerateRequest):
            return await self.generate_title(request)

        @self.app.get("/api/initial-call/messages")
        async def get_initial_call_messages_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_initial_call_messages(current_user, db)

        @self.app.post("/api/initial-call/chat")
        async def initial_call_chat_route(request: ChatRequest, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.initial_call_chat(request, current_user, db)

        @self.app.post("/api/initial-call/initialize")
        async def initialize_user_profile_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.initialize_user_profile(current_user, db)

        @self.app.get("/api/books")
        async def get_books_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_books(current_user, db)

        @self.app.get("/api/videos")
        async def get_videos_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_videos(current_user, db)

        @self.app.post("/api/books/summary")
        async def generate_book_summary_route(request: BookSummaryRequest, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.generate_book_summary(request, current_user, db)

        @self.app.post("/api/books/discuss")
        async def book_discussion_route(request: BookDiscussionRequest, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.book_discussion(request, current_user, db)
        
        @self.app.get("/api/books/{book_id}/chat")
        async def get_book_chat_route(book_id: int, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_book_chat(book_id, current_user, db)

        @self.app.post("/api/feedback")
        async def create_feedback_route(feedback: MaterialFeedbackCreate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.create_feedback(feedback, current_user, db)

        @self.app.get("/api/feedback/{material_type}/{material_id}")
        async def get_feedback_route(material_type: str, material_id: int, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_feedback(material_type, material_id, current_user, db)

        @self.app.put("/api/feedback/{feedback_id}")
        async def update_feedback_route(feedback_id: int, feedback_update: MaterialFeedbackUpdate, current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.update_feedback(feedback_id, feedback_update, current_user, db)

        @self.app.get("/api/user/feedbacks")
        async def get_user_feedbacks_route(current_user: User = Depends(self.get_current_user), db: Session = Depends(get_db)):
            return await self.get_user_feedbacks(current_user, db)

    def _validate_request(self, request: ChatRequest) -> None:
        if not request.message.strip():
            raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    def _extract_memories_background(
        self, 
        message: str, 
        response: str, 
        history: List[Dict[str, str]], 
        user_id: int
    ):
        try:
            db = SessionLocal()
            memories = llm_client._extract_memories(message, response, history, user_id, db)
            if memories:
                llm_client.save_memories_to_db(memories, user_id, db)
            db.close()
        except Exception as e:
            print(f"An error occurred: {e}")
            pass

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
                memories = llm_client._extract_memories(message, full_response, history_dict, user.id, db)
                if memories:
                    llm_client.save_memories_to_db(memories, user.id, db)

            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"An error occurred: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    def _generate_stream_multimodal(
        self,
        message: str,
        history_dict: List[dict],
        file_data: List[dict],
        user: User,
        db: Session
    ) -> Iterator[str]:
        try:
            full_response = ""

            for chunk in stream_chat_response(message, history_dict, user.id, db, file_data):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            if full_response.strip():
                memories = llm_client._extract_memories(message, full_response, history_dict, user.id, db)
                if memories:
                    llm_client.save_memories_to_db(memories, user.id, db)

            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    def _generate_initial_call_response_with_save(
        self,
        message: str,
        history_dict: List[dict],
        user_id: int,
        db: Session,
        prompt: str
    ) -> Iterator[str]:
        try:
            response = generate_initial_call_response(message, history_dict, user_id, db, prompt)

            from models import Message
            coach_message = Message(
                content=response,
                sender="coach",
                user_id=user_id,
                chat_id=0
            )
            db.add(coach_message)
            db.commit()

            thread = threading.Thread(
                target=self._extract_memories_background,
                args=(message, response, history_dict, user_id)
            )
            thread.daemon = True
            thread.start()

            yield f"data: {json.dumps({'chunk': response})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=f"Stream chat error: {str(e)}")
    
    async def stream_chat_multimodal(
        self,
        message: str,
        chat_id: int,
        history: str,
        files: List[UploadFile],
        current_user: User,
        db: Session
    ):
        try:
            history_list = json.loads(history) if history else []
            history_dict = history_list
            
            file_data = []
            if files:
                for file in files:
                    if file and file.filename:
                        content = await file.read()
                        
                        mime_type = file.content_type or mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
                        
                        base64_data = base64.b64encode(content).decode('utf-8')
                        
                        file_data.append({
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": base64_data
                            }
                        })
            
            return StreamingResponse(
                self._generate_stream_multimodal(message, history_dict, file_data, current_user, db),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=f"Stream chat multimodal error: {str(e)}")

    async def get_memories(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
            
            if not profile or not profile.memories:
                return {"memories": []}
            
            memories_list = json.loads(profile.memories)
            memories = [
                {
                    "id": str(idx),
                    "content": memory["content"],
                    "timestamp": memory["timestamp"]
                }
                for idx, memory in enumerate(memories_list)
            ]
            return {"memories": memories}
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def delete_memory(
        self,
        memory_id: str,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
            
            if not profile or not profile.memories:
                raise HTTPException(status_code=404, detail="Memory not found")
            
            memories_list = json.loads(profile.memories)
            memory_idx = int(memory_id)
            
            if memory_idx < 0 or memory_idx >= len(memories_list):
                raise HTTPException(status_code=404, detail="Memory not found")
            
            memories_list.pop(memory_idx)
            profile.memories = json.dumps(memories_list)
            db.commit()
            
            return {"message": "Memory deleted successfully"}
        except ValueError as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=400, detail="Invalid memory ID")
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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

        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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

        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
                current_time = datetime.now(timezone.utc)
                message_time = existing_message.created_at
                if message_time.tzinfo is None:
                    message_time = message_time.replace(tzinfo=timezone.utc)
                
                time_diff = current_time - message_time
                if time_diff < timedelta(minutes=1):
                    return {"message": "Duplicate message not saved"}

            new_message = Message(
                content=message_data.content,
                sender=message_data.sender,
                user_id=current_user.id,
                chat_id=message_data.chat_id
            )

            chat.updated_at = datetime.now(timezone.utc)
            db.add(new_message)
            db.commit()
            db.refresh(new_message)
            return {"message": "Message saved successfully"}
        except Exception as e:
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def get_user_status(
        self,
        current_user: User = Depends(get_current_user)
    ):
        try:
            return {
                "initial_call_completed": current_user.initial_call_completed or False
            }
        except Exception as e:
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
            print(f"An error occurred: {e}")
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
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
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
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def get_initial_call_messages(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            from models import Message
            
            initial_greeting_exists = db.query(Message).filter(
                Message.user_id == current_user.id,
                Message.chat_id == 0,
                Message.sender == "coach"
            ).first()
            
            if not initial_greeting_exists and not current_user.initial_call_completed:
                initial_message = Message(
                    content="Hey, I'm glad we get to sit down today. How are you doing right now?",
                    sender="coach",
                    user_id=current_user.id,
                    chat_id=0
                )
                db.add(initial_message)
                db.commit()
            
            initial_messages = (
                db.query(Message)
                .filter(Message.chat_id == 0, Message.user_id == current_user.id)
                .order_by(Message.created_at.asc())
                .all()
            )
            
            messages = [
                {
                    "text": message.content,
                    "sender": message.sender,
                    "timestamp": message.created_at.isoformat()
                }
                for message in initial_messages
            ]
            
            return {"messages": messages}
        except Exception as e:
            print(f"An error occurred: {e}")
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

            from models import Message
            user_message = Message(
                content=request.message,
                sender="user",
                user_id=current_user.id,
                chat_id=0
            )
            db.add(user_message)
            db.commit()

            chat_history = ""
            if history_dict:
                for entry in history_dict:
                    role = "User" if entry["role"] == "user" else "Coach"
                    chat_history += f"{role}: {entry['content']}\n"

            prompt = config_manager.initial_call_prompt.format(chat_history=chat_history)

            return StreamingResponse(
                self._generate_initial_call_response_with_save(request.message, history_dict, current_user.id, db, prompt),
                media_type="text/plain",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive"
                }
            )
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=f"Initial call chat error: {str(e)}")

    def _fetch_book_from_google(self, title: str, author: str) -> Optional[dict]:
        import requests

        try:
            query = f"{title} {author}".strip()
            url = f"https://www.googleapis.com/books/v1/volumes?q={query}&maxResults=1"

            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get("items"):
                    book = data["items"][0]["volumeInfo"]
                    return {
                        "google_title": book.get("title", ""),
                        "google_author": ", ".join(book.get("authors", [])),
                        "google_description": book.get("description", "")[:500] if book.get("description") else ""
                    }
            return None
        except Exception as e:
            print(f"An error occurred: {e}")
            return None

    async def initialize_user_profile(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            from models import Message, Book, Video

            user = db.query(User).filter(User.id == current_user.id).first()
            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            messages = db.query(Message).filter(Message.user_id == current_user.id, Message.chat_id == 0).order_by(Message.created_at).all()

            conversation_text = ""
            for msg in messages:
                role = "User" if msg.sender == "user" else "Coach"
                conversation_text += f"{role}: {msg.content}\n"

            if conversation_text.strip():
                # Get user's previous feedback
                from models import MaterialFeedback
                feedbacks = db.query(MaterialFeedback).filter(
                    MaterialFeedback.user_id == current_user.id
                ).order_by(MaterialFeedback.rating.desc()).all()
                
                feedback_text = ""
                if feedbacks:
                    feedback_text = "Previous material feedback:\n"
                    for fb in feedbacks:
                        material_type = fb.material_type.capitalize()
                        material_title = ""
                        if fb.material_type == "book" and fb.book:
                            material_title = f"{fb.book.title} by {fb.book.author}"
                        elif fb.material_type == "video" and fb.video:
                            material_title = fb.video.title
                        
                        feedback_text += f"\n{material_type}: {material_title}\n"
                        feedback_text += f"Rating: {fb.rating}/5 stars\n"
                        if fb.review:
                            feedback_text += f"Review: {fb.review}\n"
                
                recommendations = llm_client.find_recommendations(conversation_text, feedback_text)

                seen_books = set()

                for book_data in recommendations.get("books", []):
                    title = book_data.get("title", "")
                    author = book_data.get("author", "")

                    if not title:
                        continue

                    book_key = f"{title.lower()}-{author.lower()}"
                    if book_key in seen_books:
                        continue

                    google_data = self._fetch_book_from_google(title, author)
                    if google_data:
                        book = Book(
                            title=google_data["google_title"],
                            author=google_data["google_author"] or author,
                            description=book_data.get("description", ""),
                            user_id=current_user.id
                        )
                        db.add(book)
                        seen_books.add(book_key)

                seen_videos = set()
                for video_data in recommendations.get("videos", []):
                    title = video_data.get("title", "")
                    url = video_data.get("url", "")
                    
                    if not title or not url:
                        continue
                    
                    if url.startswith("https://www.youtube.com/results?search_query="):
                        continue
                    
                    video_key = url.lower()
                    if video_key in seen_videos:
                        continue
                    
                    thumbnail = video_data.get("thumbnail", "")
                    
                    video = Video(
                        title=title,
                        url=url,
                        description=video_data.get("description", ""),
                        thumbnail=thumbnail,
                        user_id=current_user.id
                    )
                    db.add(video)
                    seen_videos.add(video_key)
                

            user.initial_call_completed = True
            db.commit()

            return {"success": True, "message": "Profile initialization completed"}
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=f"Profile initialization error: {str(e)}")

    async def generate_title(self, request: TitleGenerateRequest):
        try:
            from pathlib import Path
            prompt_path = Path(__file__).parent / "prompts" / "title_generation.md"
            with open(prompt_path, "r") as f:
                prompt_template = f.read()

            prompt = prompt_template.format(user_message=request.message)

            client = llm_client._get_client()
            response = client.models.generate_content(
                model=config_manager.model_super_fast,
                contents=prompt,
                config={
                    "temperature": 0.7
                }
            )

            if not response:
                raise ValueError("No response from API")

            title = ""
            if response.candidates and len(response.candidates) > 0:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    title = candidate.content.parts[0].text.strip()

            if not title and hasattr(response, 'text'):
                title = response.text.strip() if response.text else ""

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

        except Exception as e:
            print(f"An error occurred: {e}")
            words = request.message.split()[:5]
            title = " ".join(words)
            if len(title) > 30:
                title = title[:27] + "..."
            return {"title": title}

    async def get_books(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            from models import Book
            user_books = (
                db.query(Book)
                .filter(Book.user_id == current_user.id)
                .order_by(Book.created_at.desc())
                .all()
            )
            books = [
                {
                    "id": str(book.id),
                    "title": book.title,
                    "author": book.author,
                    "description": book.description,
                    "createdAt": book.created_at.isoformat()
                }
                for book in user_books
            ]
            return {"books": books}
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def get_videos(
        self,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db)
    ):
        try:
            from models import Video
            user_videos = (
                db.query(Video)
                .filter(Video.user_id == current_user.id)
                .order_by(Video.created_at.desc())
                .all()
            )
            videos = [
                {
                    "id": str(video.id),
                    "title": video.title,
                    "url": video.url,
                    "description": video.description,
                    "thumbnail": video.thumbnail or "",
                    "createdAt": video.created_at.isoformat()
                }
                for video in user_videos
            ]
            return {"videos": videos}
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def generate_book_summary(self, request: BookSummaryRequest, current_user: User, db: Session):
        try:
            from models import Book
            import json


            book = db.query(Book).filter(
                Book.user_id == current_user.id,
                Book.title == request.title
            ).first()

            if book and book.summary:
                try:
                    chapters = json.loads(book.summary)
                    return {"chapters": chapters}
                except json.JSONDecodeError as e:
                    print(f"An error occurred: {e}")
                    pass

            chapters = llm_client.generate_book_summary(request.title, request.author)

            if book and chapters:
                book.summary = json.dumps(chapters)
                db.commit()

            return {"chapters": chapters}
        except Exception as e:
            print(f"An error occurred: {e}")
            return {"chapters": []}

    async def book_discussion(
        self,
        request: BookDiscussionRequest,
        current_user: User,
        db: Session = Depends(get_db)
    ):
        try:
            history_dict = self._convert_history_to_dict(request.history)
            
            current_chapter = {}
            if 0 <= request.currentChapterIndex < len(request.chapters):
                current_chapter = request.chapters[request.currentChapterIndex]
            
            response = llm_client.book_discussion_response(
                message=request.message,
                book_title=request.bookTitle,
                book_author=request.bookAuthor,
                current_chapter=current_chapter,
                all_chapters=request.chapters,
                history=history_dict
            )
            
            if request.bookId:
                book = db.query(Book).filter(
                    Book.id == int(request.bookId),
                    Book.user_id == current_user.id
                ).first()
                
                if book:
                    chat_history = json.loads(book.chat) if book.chat else []
                    
                    chat_history.append({
                        "role": "user",
                        "content": request.message,
                        "timestamp": datetime.now().isoformat()
                    })
                    chat_history.append({
                        "role": "assistant", 
                        "content": response,
                        "timestamp": datetime.now().isoformat()
                    })
                    
                    book.chat = json.dumps(chat_history)
                    db.commit()
            
            book_context_message = f"Discussing book: {request.bookTitle} by {request.bookAuthor}"
            enhanced_history = history_dict.copy() if history_dict else []
            if not any(msg.get('content', '').startswith('Discussing book:') for msg in enhanced_history):
                enhanced_history.insert(0, {'role': 'system', 'content': book_context_message})
            
            thread = threading.Thread(
                target=self._extract_memories_background,
                args=(request.message, response, enhanced_history, current_user.id)
            )
            thread.daemon = True
            thread.start()
            
            return {"response": response}
        except Exception as e:
            print(f"An error occurred: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_book_chat(
        self,
        book_id: int,
        current_user: User,
        db: Session
    ):
        try:
            book = db.query(Book).filter(
                Book.id == book_id,
                Book.user_id == current_user.id
            ).first()
            
            if not book:
                raise HTTPException(status_code=404, detail="Book not found")
            
            chat_history = json.loads(book.chat) if book.chat else []
            
            return {"chat": chat_history}
        except HTTPException as e:
            print(f"An error occurred: {e}")
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    async def create_feedback(
        self,
        feedback: MaterialFeedbackCreate,
        current_user: User,
        db: Session
    ):
        try:
            from models import MaterialFeedback, Book, Video
            
            # Validate material exists and belongs to user
            if feedback.material_type == "book":
                material = db.query(Book).filter(
                    Book.id == feedback.material_id,
                    Book.user_id == current_user.id
                ).first()
                if not material:
                    raise HTTPException(status_code=404, detail="Book not found")
            elif feedback.material_type == "video":
                material = db.query(Video).filter(
                    Video.id == feedback.material_id,
                    Video.user_id == current_user.id
                ).first()
                if not material:
                    raise HTTPException(status_code=404, detail="Video not found")
            else:
                raise HTTPException(status_code=400, detail="Invalid material type")
            
            # Check if feedback already exists
            existing = db.query(MaterialFeedback).filter(
                MaterialFeedback.user_id == current_user.id,
                MaterialFeedback.material_type == feedback.material_type
            )
            if feedback.material_type == "book":
                existing = existing.filter(MaterialFeedback.book_id == feedback.material_id)
            else:
                existing = existing.filter(MaterialFeedback.video_id == feedback.material_id)
            existing = existing.first()
            
            if existing:
                # Update existing feedback
                existing.rating = feedback.rating
                existing.review = feedback.review
                existing.completed = feedback.completed
                existing.updated_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(existing)
                return {"feedback": {
                    "id": existing.id,
                    "rating": existing.rating,
                    "review": existing.review,
                    "completed": existing.completed,
                    "created_at": existing.created_at.isoformat(),
                    "updated_at": existing.updated_at.isoformat()
                }}
            
            # Create new feedback
            new_feedback = MaterialFeedback(
                user_id=current_user.id,
                material_type=feedback.material_type,
                rating=feedback.rating,
                review=feedback.review,
                completed=feedback.completed,
                book_id=feedback.material_id if feedback.material_type == "book" else None,
                video_id=feedback.material_id if feedback.material_type == "video" else None
            )
            
            db.add(new_feedback)
            db.commit()
            db.refresh(new_feedback)
            
            return {"feedback": {
                "id": new_feedback.id,
                "rating": new_feedback.rating,
                "review": new_feedback.review,
                "completed": new_feedback.completed,
                "created_at": new_feedback.created_at.isoformat(),
                "updated_at": new_feedback.updated_at.isoformat()
            }}
        except HTTPException:
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_feedback(
        self,
        material_type: str,
        material_id: int,
        current_user: User,
        db: Session
    ):
        try:
            from models import MaterialFeedback
            
            query = db.query(MaterialFeedback).filter(
                MaterialFeedback.user_id == current_user.id,
                MaterialFeedback.material_type == material_type
            )
            
            if material_type == "book":
                query = query.filter(MaterialFeedback.book_id == material_id)
            elif material_type == "video":
                query = query.filter(MaterialFeedback.video_id == material_id)
            else:
                raise HTTPException(status_code=400, detail="Invalid material type")
            
            feedback = query.first()
            
            if not feedback:
                return {"feedback": None}
            
            return {"feedback": {
                "id": feedback.id,
                "rating": feedback.rating,
                "review": feedback.review,
                "completed": feedback.completed,
                "created_at": feedback.created_at.isoformat(),
                "updated_at": feedback.updated_at.isoformat()
            }}
        except HTTPException:
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))
    
    async def update_feedback(
        self,
        feedback_id: int,
        feedback_update: MaterialFeedbackUpdate,
        current_user: User,
        db: Session
    ):
        try:
            from models import MaterialFeedback
            
            feedback = db.query(MaterialFeedback).filter(
                MaterialFeedback.id == feedback_id,
                MaterialFeedback.user_id == current_user.id
            ).first()
            
            if not feedback:
                raise HTTPException(status_code=404, detail="Feedback not found")
            
            if feedback_update.rating is not None:
                feedback.rating = feedback_update.rating
            if feedback_update.review is not None:
                feedback.review = feedback_update.review
            if feedback_update.completed is not None:
                feedback.completed = feedback_update.completed
            
            feedback.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(feedback)
            
            return {"feedback": {
                "id": feedback.id,
                "rating": feedback.rating,
                "review": feedback.review,
                "completed": feedback.completed,
                "created_at": feedback.created_at.isoformat(),
                "updated_at": feedback.updated_at.isoformat()
            }}
        except HTTPException:
            raise
        except Exception as e:
            print(f"An error occurred: {e}")
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))
    
    async def get_user_feedbacks(
        self,
        current_user: User,
        db: Session
    ):
        try:
            from models import MaterialFeedback, Book, Video
            
            feedbacks = db.query(MaterialFeedback).filter(
                MaterialFeedback.user_id == current_user.id
            ).order_by(MaterialFeedback.updated_at.desc()).all()
            
            result = []
            for feedback in feedbacks:
                item = {
                    "id": feedback.id,
                    "material_type": feedback.material_type,
                    "rating": feedback.rating,
                    "review": feedback.review,
                    "completed": feedback.completed,
                    "created_at": feedback.created_at.isoformat(),
                    "updated_at": feedback.updated_at.isoformat()
                }
                
                if feedback.material_type == "book" and feedback.book:
                    item["material"] = {
                        "id": feedback.book.id,
                        "title": feedback.book.title,
                        "author": feedback.book.author
                    }
                elif feedback.material_type == "video" and feedback.video:
                    item["material"] = {
                        "id": feedback.video.id,
                        "title": feedback.video.title,
                        "url": feedback.video.url
                    }
                
                result.append(item)
            
            return {"feedbacks": result}
        except Exception as e:
            print(f"An error occurred: {e}")
            raise HTTPException(status_code=500, detail=str(e))


chat_api = ChatAPI()
app = chat_api.app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)