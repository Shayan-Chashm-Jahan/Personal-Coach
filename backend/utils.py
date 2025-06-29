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
            model=config_manager.model_pro,
            contents=summary_prompt,
            config={
                "temperature": 0.3,
                "maxOutputTokens": 500
            }
        )
        
        return response.text
    
    def _extract_json_from_response(self, response_text: str) -> dict:
        text = response_text.strip()
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            json_text = text[first_brace:last_brace + 1]
            import json
            return json.loads(json_text)
        else:
            raise ValueError("No valid JSON found in response")
    
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
                model=config_manager.model_pro,
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
                model=config_manager.model_pro,
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
    ) -> str:
        try:
            client = self._get_client()
            
            contents = self._build_contents(text, history, user_id, db)
            
            if prompt:
                system_content = types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
                contents.insert(0, system_content)
            function_declarations = [
                {
                    "name": "update_user_profile",
                    "description": "Update a specific attribute of the user's profile during the initial call",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "user_profile_key": {
                                "type": "string",
                                "description": "The profile attribute to update",
                                "enum": [
                                    "first_name",
                                    "last_name", 
                                    "birth_date",
                                    "personal_characteristics",
                                    "life_ambitions",
                                    "career_ambitions",
                                    "six_month_objectives"
                                ]
                            },
                            "user_profile_value": {
                                "type": "string",
                                "description": "The value to set for the profile attribute. For birth_date, use YYYY-MM-DD format."
                            }
                        },
                        "required": ["user_profile_key", "user_profile_value"]
                    }
                }
            ]

            tools = types.Tool(function_declarations=function_declarations)
            config = types.GenerateContentConfig(tools=[tools])
            
            response = client.models.generate_content(
                model=config_manager.model_pro,
                contents=contents,
                config=config, 
            )
            
            if (response.candidates and 
                response.candidates[0].content and 
                response.candidates[0].content.parts):
                
                function_calls_found = False
                function_response_parts = []
                
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'function_call') and part.function_call:
                        function_calls_found = True
                        function_call = part.function_call
                        if function_call.name == "update_user_profile":
                            self._handle_update_user_profile(dict(function_call.args), user_id, db)
                            
                            function_response_part = types.Part.from_function_response(
                                name=function_call.name,
                                response={"success": True}
                            )
                            function_response_parts.append(function_response_part)
                
                if function_calls_found:
                    if self._is_profile_complete(user_id, db):
                        return "It was wonderful getting to know you! I've gathered enough information to prepare the initial materials for your success. I'm confident that together we can achieve something truly great. Let me prepare everything for our journey ahead!"
                    
                    contents.append(response.candidates[0].content)
                    contents.append(types.Content(
                        role="user", 
                        parts=function_response_parts
                    ))
                    
                    final_response = client.models.generate_content(
                        model=config_manager.model_pro,
                        contents=contents,
                        config=config
                    )
                    
                    return final_response.text if final_response.text else ""
            
            return response.text if response.text else ""
            
        except Exception:
            raise
    
    def _handle_update_user_profile(self, args: dict, user_id: int, db: Session):
        if not user_id or not db:
            return
            
        from models import UserProfile
        from datetime import datetime, timezone
        
        if 'user_profile_key' not in args or 'user_profile_value' not in args:
            return
        
        key = args['user_profile_key']
        value = args['user_profile_value']
        
        allowed_keys = [
            'first_name', 'last_name', 'birth_date', 'personal_characteristics',
            'life_ambitions', 'career_ambitions', 'six_month_objectives'
        ]
        if key not in allowed_keys:
            return
        
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            profile = UserProfile(user_id=user_id)
            db.add(profile)
        
        if key == 'birth_date':
            try:
                setattr(profile, key, datetime.strptime(value, '%Y-%m-%d').date())
            except ValueError:
                return
        else:
            setattr(profile, key, value)
        
        profile.updated_at = datetime.now(timezone.utc)
        
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise

    def _is_profile_complete(self, user_id: int, db: Session) -> bool:
        if not user_id or not db:
            return False
            
        from models import UserProfile
        
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            return False
        
        required_fields = [
            profile.first_name,
            profile.last_name, 
            profile.birth_date,
            profile.personal_characteristics,
            profile.life_ambitions,
            profile.career_ambitions,
            profile.six_month_objectives
        ]
        
        return all(field is not None and str(field).strip() != '' for field in required_fields)

    def find_recommendations(self, conversation_text: str) -> dict:
        try:
            client = self._get_client()
            
            from pathlib import Path
            prompt_path = Path(__file__).parent / "prompts" / "recommendations.md"
            with open(prompt_path, 'r') as f:
                prompt_template = f.read()
            
            prompt = prompt_template.format(conversation_text=conversation_text)

            response = client.models.generate_content(
                model=config_manager.model_pro,
                contents=prompt,
                config={
                    "tools": [{"googleSearch": {}}],
                    "temperature": 0.3,
                    "maxOutputTokens": 2000
                }
            )
            
            result = self._extract_json_from_response(response.text)
            return result
            
        except Exception:
            return {"books": [], "videos": []}


    def generate_book_summary(self, book_title: str, author: str) -> list:
        try:
            from pathlib import Path
            prompt_path = Path(__file__).parent / "prompts" / "book_summary.md"
            with open(prompt_path, 'r') as f:
                prompt_template = f.read()
            
            prompt = prompt_template.format(book_title=book_title, author=author)
            
            client = self._get_client()
            response = client.models.generate_content(
                model=config_manager.model_fast,
                contents=prompt,
                config={
                    "temperature": 0.3,
                    "maxOutputTokens": 4000
                }
            )
            
            if response and response.text:
                text = response.text.strip()
                first_bracket = text.find('[')
                last_bracket = text.rfind(']')
                
                if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
                    json_text = text[first_bracket:last_bracket + 1]
                    import json
                    result = json.loads(json_text)
                    return result
            
            return []
            
        except Exception as e:
            return []


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
) -> str:
    return llm_client.initial_call_response(text, history, user_id, db, prompt)

