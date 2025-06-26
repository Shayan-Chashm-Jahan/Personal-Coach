import json
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Iterator, Optional, Dict, List, Any

import google.auth.transport.requests
import openai
from google.auth import default
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
        self.credentials = None
        self.token_expiry = 0
        self.summary_storage_path = Path(__file__).parent / "conversation_summary.json"
        self.max_history_length = config_manager.max_history_length
        self._summary_cache = None
        self._summary_cache_time = 0
        self._initialized = True
    
    def _get_fresh_credentials(self):
        current_time = time.time()
        if self.credentials is None or current_time >= self.token_expiry - config_manager.credential_refresh_buffer:
            self.credentials, _ = default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
            self.credentials.refresh(google.auth.transport.requests.Request())
            self.token_expiry = current_time + 3600
        return self.credentials
    
    def _get_client(self) -> openai.OpenAI:
        if self.client is None:
            credentials = self._get_fresh_credentials()
            self.client = openai.OpenAI(
                base_url=config_manager.get_model_base_url(),
                api_key=credentials.token,
                timeout=30.0,
                max_retries=2
            )
        else:
            credentials = self._get_fresh_credentials()
            if self.client.api_key != credentials.token:
                self.client.api_key = credentials.token
        
        return self.client
    
    def _normalize_role(self, role: str) -> str:
        role_mapping = {
            "model": "assistant",
            "assistant": "assistant", 
            "user": "user",
            "system": "system"
        }
        return role_mapping.get(role, role)
    
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
        
        summary_messages = [
            {
                "role": "user", 
                "content": config_manager.conversation_summary_prompt.format(
                    history_text=history_text
                )
            }
        ]
        
        client = self._get_client()
        response = client.chat.completions.create(
            model=config_manager.model_name,
            messages=summary_messages,
            temperature=0.3,
            max_tokens=500,
            stream=False
        )
        
        return response.choices[0].message.content
    
    def _extract_memories(self, user_message: str, assistant_response: str) -> List[str]:
        memory_prompt = config_manager.memory_extraction_prompt.format(
            user_message=user_message,
            assistant_response=assistant_response
        )

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config_manager.model_name,
                messages=[{"role": "user", "content": memory_prompt}],
                temperature=0.2,
                max_tokens=200,
                stream=False
            )
            
            content = response.choices[0].message.content.strip()
            if content == "NONE" or not content:
                return []
            
            memories = []
            for line in content.split('\n'):
                line = line.strip()
                if line and not line.startswith('NONE'):
                    cleaned_line = line.lstrip('0123456789.- ').strip()
                    if cleaned_line and len(cleaned_line) > 10:
                        memories.append(cleaned_line)
            
            return memories
        except (openai.APIError, openai.APIConnectionError, openai.RateLimitError) as e:
            print(f"OpenAI API error in _extract_memories: {str(e)}")
            return []
        except Exception as e:
            print(f"Unexpected error in _extract_memories: {str(e)}")
            print(f"Traceback: {traceback.format_exc()}")
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
        """Build context string from user's active goals"""
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
                if goal.category:
                    goal_text += f" (Category: {goal.category})"
                if goal.priority:
                    goal_text += f" [Priority: {goal.priority}]"
                if goal.target_date:
                    goal_text += f" [Target: {goal.target_date}]"
                context_parts.append(goal_text)
            
            context_parts.append("=== END GOALS ===")
            return "\n".join(context_parts)
        except Exception:
            return None
    
    def _build_memories_context(self, user_id: int, db: Session) -> Optional[str]:
        """Build context string from user's coach memories/notes"""
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
    
    def _build_messages(
        self, 
        text: str, 
        history: Optional[List[Dict[str, str]]],
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> List[Dict[str, str]]:
        messages = []
        
        messages.append({
            "role": "system", 
            "content": config_manager.system_prompt
        })
        
        # Add user's goals and memories as context if available
        if user_id and db:
            # Add user's goals as context
            goals_context = self._build_goals_context(user_id, db)
            if goals_context:
                messages.append({
                    "role": "system",
                    "content": goals_context
                })
            
            # Add user's memories (coach notes) as context
            memories_context = self._build_memories_context(user_id, db)
            if memories_context:
                messages.append({
                    "role": "system",
                    "content": memories_context
                })
        
        existing_summary = self._load_conversation_summary()
        if existing_summary:
            messages.append({
                "role": "system", 
                "content": f"Previous conversation summary: {existing_summary}"
            })
        
        if history and len(history) > config_manager.history_truncate_threshold:
            full_history = history.copy()
            summary = self._create_summary(full_history[:-30])
            self._save_conversation_summary(summary)
            
            history = history[-config_manager.history_truncate_threshold:]
            messages.append({
                "role": "system", 
                "content": f"Conversation summary: {summary}"
            })
        
        if history:
            for item in history:
                normalized_role = self._normalize_role(item["role"])
                messages.append({"role": normalized_role, "content": item["content"]})
        
        messages.append({"role": "user", "content": text})
        return messages
    
    def stream_response(
        self, 
        text: str, 
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> Iterator[str]:
        try:
            print(f"Building messages for text: {text[:50]}...")
            messages = self._build_messages(text, history, user_id, db)
            print(f"Built {len(messages)} messages")
            
            print("Getting LLM client...")
            client = self._get_client()
            print("Client obtained, making API call...")
            
            response = client.chat.completions.create(
                model=config_manager.model_name,
                messages=messages,
                temperature=config_manager.temperature,
                max_tokens=config_manager.max_tokens,
                stream=True
            )
            print("API call successful, streaming response...")
            
            full_response = ""
            chunk_count = 0
            for chunk in response:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_response += content
                    chunk_count += 1
                    yield content
            
            print(f"Streaming completed. Chunks: {chunk_count}, Total length: {len(full_response)}")
            
        except Exception as e:
            print(f"Error in stream_response: {str(e)}")
            print(f"Traceback: {traceback.format_exc()}")
            raise


llm_client = LLMStreamingClient()


def stream_chat_response(
    text: str, 
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None
) -> Iterator[str]:
    return llm_client.stream_response(text, history, user_id, db)

