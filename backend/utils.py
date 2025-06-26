import ast
import json
import re
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional, Dict, List, Any

from google import genai
from google.genai import types
from google.genai.types import HttpOptions
from sqlalchemy.orm import Session

from config import config_manager


class LLMStreamingClient:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self) -> None:
        if self._initialized:
            return
            
        self.client = None
        self.summary_storage_path = Path(__file__).parent / "conversation_summary.json"
        self.max_history_length = config_manager.max_history_length
        self._summary_cache = None
        self._summary_cache_time = 0
        self._initialized = True
    
    def _get_client(self) -> genai.Client:
        if self.client is None:
            vertex_config = config_manager.get_vertex_ai_config()
            self.client = genai.Client(
                http_options=HttpOptions(api_version="v1"),
                **vertex_config
            )
        return self.client
    
    def _normalize_role(self, role: str) -> str:
        role_mapping = {
            "assistant": "model",
            "system": "user",
            "user": "user",
            "model": "model"
        }
        return role_mapping.get(role, "user")
    
    def _load_conversation_summary(self) -> Optional[str]:
        current_time = time.time()
        if self._summary_cache and current_time - self._summary_cache_time < config_manager.summary_cache_timeout:
            return self._summary_cache
            
        if not self.summary_storage_path.exists():
            return None
        
        try:
            with open(self.summary_storage_path, 'r') as f:
                data = json.load(f)
                summary = data.get("summary")
                self._summary_cache = summary
                self._summary_cache_time = current_time
                return summary
        except (json.JSONDecodeError, KeyError):
            return None
    
    def _save_conversation_summary(self, summary: str) -> None:
        data = {
            "summary": summary, 
            "last_updated": str(Path(__file__).stat().st_mtime)
        }
        with open(self.summary_storage_path, 'w') as f:
            json.dump(data, f, indent=2)
        self._summary_cache = summary
        self._summary_cache_time = time.time()
    
    def _create_summary(self, history: List[Dict[str, str]]) -> str:
        history_text = "\n".join(
            [f"{item['role']}: {item['content']}" for item in history]
        )
        
        summary_prompt = config_manager.conversation_summary_prompt.format(
            history_text=history_text
        )
        
        client = self._get_client()
        response = client.models.generate_content(
            model=config_manager.model_name,
            contents=summary_prompt,
            config={
                "temperature": 0.3,
                "maxOutputTokens": 500
            }
        )
        
        return response.text
    
    def _extract_list_from_response(self, content: str) -> List[str]:
        first_bracket = content.find('[')
        last_bracket = content.rfind(']')
        
        if first_bracket == -1 or last_bracket == -1:
            return []
        
        list_string = content[first_bracket:last_bracket + 1]
        
        try:
            parsed_list = ast.literal_eval(list_string)
            if isinstance(parsed_list, list):
                return [str(item).strip() for item in parsed_list if str(item).strip()]
            return []
        except:
            return []
    
    def _extract_memories(self, user_message: str, assistant_response: str) -> List[str]:
        memory_prompt = config_manager.memory_extraction_prompt.format(
            user_message=user_message,
            assistant_response=assistant_response
        )

        try:
            client = self._get_client()
            response = client.models.generate_content(
                model=config_manager.model_name,
                contents=memory_prompt,
                config={
                    "temperature": 0.2,
                    "maxOutputTokens": 200
                }
            )
            
            content = response.text.strip()
            
            if content.upper() == "NONE" or not content:
                return []
            
            return self._extract_list_from_response(content)
            
        except Exception:
            return []
    
    def save_memories_to_db(self, memory_list: List[str], user_id: int, db: Session) -> None:
        if not memory_list:
            return
        
        from models import Memory
        
        for memory_content in memory_list:
            new_memory = Memory(
                content=memory_content,
                user_id=user_id
            )
            db.add(new_memory)
        
        db.commit()
    
    def _build_goals_context(self, user_id: int, db: Session) -> Optional[str]:
        try:
            from models import Goal
            goals = db.query(Goal).filter(
                Goal.user_id == user_id,
                Goal.status == "Active"
            ).order_by(Goal.created_at.desc()).limit(10).all()
            
            if not goals:
                return None
            
            context_parts = ["=== USER'S CURRENT GOALS ==="]
            for goal in goals:
                goal_text = f"• {goal.description}"
                context_parts.append(goal_text)
            
            context_parts.append("=== END GOALS ===")
            return "\n".join(context_parts)
        except Exception:
            return None
    
    def _build_memories_context(self, user_id: int, db: Session) -> Optional[str]:
        try:
            from models import Memory
            memories = db.query(Memory).filter(
                Memory.user_id == user_id
            ).order_by(Memory.created_at.desc()).limit(15).all()
            
            if not memories:
                return None
            
            context_parts = ["=== COACH NOTES & INSIGHTS ==="]
            for memory in memories:
                context_parts.append(f"• {memory.content}")
            
            context_parts.append("=== END COACH NOTES ===")
            return "\n".join(context_parts)
        except Exception:
            return None
    
    def _build_system_instruction(
        self,
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> str:
        system_parts = [config_manager.system_prompt]
        
        if user_id and db:
            goals_context = self._build_goals_context(user_id, db)
            if goals_context:
                system_parts.append(goals_context)
            
            memories_context = self._build_memories_context(user_id, db)
            if memories_context:
                system_parts.append(memories_context)
        
        existing_summary = self._load_conversation_summary()
        if existing_summary:
            system_parts.append(f"Previous conversation summary: {existing_summary}")
        
        return "\n\n".join(system_parts)
    
    def _build_contents(
        self, 
        text: str, 
        history: Optional[List[Dict[str, str]]],
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> List[Dict[str, str]]:
        contents = []
        
        if history and len(history) > config_manager.history_truncate_threshold:
            full_history = history.copy()
            summary = self._create_summary(full_history[:-30])
            self._save_conversation_summary(summary)
            history = history[-config_manager.history_truncate_threshold:]
        
        if history:
            for item in history:
                normalized_role = self._normalize_role(item["role"])
                contents.append({
                    "role": normalized_role,
                    "parts": [{"text": item["content"]}]
                })
        
        contents.append({
            "role": "user",
            "parts": [{"text": text}]
        })
        
        return contents
    
    def stream_response(
        self, 
        text: str, 
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> Iterator[str]:
        try:
            client = self._get_client()
            
            system_instruction = self._build_system_instruction(user_id, db)
            contents = self._build_contents(text, history, user_id, db)
            
            response_stream = client.models.generate_content_stream(
                model=config_manager.model_name,
                contents=contents,
                config={
                    "tools": [{"googleSearch": {}}],
                    "systemInstruction": {
                        "parts": [{"text": system_instruction}]
                    },
                    "temperature": config_manager.temperature,
                    "maxOutputTokens": config_manager.max_tokens
                }
            )
            
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
            
        except Exception as e:
            raise
    
    def initial_call_response(
        self, 
        text: str, 
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        db: Optional[Session] = None,
        prompt: str = ""
    ) -> Iterator[str]:
        try:
            client = self._get_client()
            
            contents = self._build_contents(text, history, user_id, db)
            
            response_stream = client.models.generate_content_stream(
                model=config_manager.model_name,
                contents=contents,
                config={
                    "tools": [{"googleSearch": {}}],
                    "systemInstruction": {
                        "parts": [{"text": prompt}]
                    },
                    "temperature": config_manager.temperature,
                    "maxOutputTokens": config_manager.max_tokens
                }
            )
            
            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text
            
        except Exception as e:
            raise


llm_client = LLMStreamingClient()


def stream_chat_response(
    text: str, 
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None
) -> Iterator[str]:
    return llm_client.stream_response(text, history, user_id, db)

def generate_initial_call_response(
    text: str, 
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None,
    prompt: str = ""
) -> Iterator[str]:
    return llm_client.initial_call_response(text, history, user_id, db, prompt)

