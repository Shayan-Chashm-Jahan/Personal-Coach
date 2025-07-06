import ast
import json
import threading
import time
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
        except (json.JSONDecodeError, KeyError) as e:
            print(f"An error occurred: {e}")
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
                "temperature": 0.3
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
                result = [str(item).strip() for item in parsed_list if str(item).strip()]
                return result
            return []
        except Exception as e:
            print(f"An error occurred: {e}")
            return []

    def _extract_memories(self, user_message: str, assistant_response: str, history: Optional[List[Dict[str, str]]] = None, user_id: Optional[int] = None, db: Optional[Session] = None) -> List[str]:

        conversation_context = ""
        if history:
            processed_history, summary = self._build_conversation_context(history)
            if summary:
                conversation_context = f"Previous conversation summary: {summary}\n\n"
            
            recent_messages = processed_history[-10:] if processed_history else []
            if recent_messages:
                conversation_context += "Recent conversation:\n"
                for msg in recent_messages:
                    role = "User" if msg.get("role") == "user" else "Assistant"
                    conversation_context += f"{role}: {msg.get('content', '')}\n"
        
        existing_memories_text = ""
        if user_id and db:
            existing_memories_context = self._build_memories_context(user_id, db)
            if existing_memories_context:
                existing_memories_text = existing_memories_context
        
        memory_prompt = config_manager.memory_extraction_prompt.format(
            user_message=user_message,
            assistant_response=assistant_response,
            conversation_context=conversation_context,
            existing_memories=existing_memories_text
        )

        try:
            client = self._get_client()

            response = client.models.generate_content(
                model=config_manager.model_pro,
                contents=memory_prompt,
                config={
                    "temperature": 0.2
                }
            )

            content = response.text.strip() if response and response.text else ""

            if content.upper() == "NONE" or not content:
                return []

            memories = self._extract_list_from_response(content)
            return memories

        except Exception as e:
            print(f"An error occurred: {e}")
            return []

    def save_memories_to_db(self, memory_list: List[str], user_id: int, db: Session) -> None:
        if not memory_list:
            return

        from models import UserProfile

        try:
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            if not profile:
                profile = UserProfile(user_id=user_id, memories="[]")
                db.add(profile)
                db.flush()
            
            existing_memories = json.loads(profile.memories) if profile.memories else []
            
            for memory_content in memory_list:
                if memory_content.startswith("FIRST_NAME: "):
                    profile.first_name = memory_content.replace("FIRST_NAME: ", "").strip()
                elif memory_content.startswith("LAST_NAME: "):
                    profile.last_name = memory_content.replace("LAST_NAME: ", "").strip()
                elif memory_content.startswith("BIRTH_DATE: "):
                    birth_date_str = memory_content.replace("BIRTH_DATE: ", "").strip()
                    try:
                        profile.birth_date = datetime.strptime(birth_date_str, "%Y-%m-%d").date()
                    except ValueError as e:
                        print(f"An error occurred: {e}")
                        pass
                else:
                    existing_memories.append({
                        "content": memory_content,
                        "timestamp": datetime.now().isoformat()
                    })
            
            profile.memories = json.dumps(existing_memories)
            db.commit()
        except Exception as e:
            print(f"An error occurred: {e}")
            db.rollback()
            raise

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
        except Exception as e:
            print(f"An error occurred: {e}")
            return None

    def _build_memories_context(self, user_id: int, db: Session) -> Optional[str]:
        try:
            from models import UserProfile
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            
            if not profile or not profile.memories:
                return None
            
            memories = json.loads(profile.memories)
            if not memories:
                return None
            
            recent_memories = memories[-15:] if len(memories) > 15 else memories
            
            context_parts = ["=== MEMORIES & INSIGHTS ==="]
            for memory in recent_memories:
                context_parts.append(f"• {memory['content']}")

            context_parts.append("=== END MEMORIES ===")
            return "\n".join(context_parts)
        except Exception as e:
            print(f"An error occurred: {e}")
            return None

    def _build_system_instruction(
        self,
        user_id: Optional[int] = None,
        db: Optional[Session] = None
    ) -> str:
        user_info = ""
        goals = ""
        memories = ""
        conversation_summary = ""
        
        if user_id and db:
            from models import UserProfile
            profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
            
            if profile:
                user_info_parts = []
                if profile.first_name or profile.last_name:
                    full_name = f"{profile.first_name or ''} {profile.last_name or ''}".strip()
                    user_info_parts.append(f"User's name: {full_name}")
                
                if profile.birth_date:
                    user_info_parts.append(f"Birthday: {profile.birth_date.strftime('%B %d, %Y')}")
                
                if user_info_parts:
                    user_info = "=== USER INFORMATION ===\n" + "\n".join(user_info_parts) + "\n=== END USER INFORMATION ==="
            
            goals_context = self._build_goals_context(user_id, db)
            if goals_context:
                goals = goals_context
            
            memories_context = self._build_memories_context(user_id, db)
            if memories_context:
                memories = memories_context
        
        existing_summary = self._load_conversation_summary()
        if existing_summary:
            conversation_summary = f"=== PREVIOUS CONVERSATION SUMMARY ===\n{existing_summary}\n=== END SUMMARY ==="
        
        system_prompt = config_manager.system_prompt
        system_prompt = system_prompt.replace("{user_info}", user_info)
        system_prompt = system_prompt.replace("{goals}", goals)
        system_prompt = system_prompt.replace("{memories}", memories)
        system_prompt = system_prompt.replace("{conversation_summary}", conversation_summary)
        
        return system_prompt

    def _build_conversation_context(self, history: Optional[List[Dict[str, str]]]) -> tuple[List[Dict[str, str]], Optional[str]]:
        if not history:
            return [], None
            
        existing_summary = self._load_conversation_summary()
        
        if len(history) > config_manager.history_truncate_threshold:
            full_history = history.copy()
            summary = self._create_summary(full_history[:-30])
            self._save_conversation_summary(summary)
            return history[-config_manager.history_truncate_threshold:], summary
        
        return history, existing_summary
    
    def _build_contents(
        self,
        text: str,
        history: Optional[List[Dict[str, str]]],
        files: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        contents = []
        
        processed_history, _ = self._build_conversation_context(history)
        
        if processed_history:
            for item in processed_history:
                normalized_role = self._normalize_role(item["role"])
                parts = []
                
                if item.get("content"):
                    parts.append({"text": item["content"]})
                
                if item.get("files"):
                    for file_data in item.get("files", []):
                        if file_data.get("inline_data"):
                            parts.append({
                                "inline_data": {
                                    "mime_type": file_data["inline_data"]["mime_type"],
                                    "data": file_data["inline_data"]["data"]
                                }
                            })
                
                if parts:
                    contents.append({
                        "role": normalized_role,
                        "parts": parts
                    })

        current_parts = []
        
        if files:
            for file_data in files:
                if file_data.get("inline_data"):
                    current_parts.append({
                        "inline_data": {
                            "mime_type": file_data["inline_data"]["mime_type"],
                            "data": file_data["inline_data"]["data"]
                        }
                    })
        
        if text:
            current_parts.append({"text": text})
        
        contents.append({
            "role": "user",
            "parts": current_parts
        })

        return contents

    def stream_response(
        self,
        text: str,
        history: Optional[List[Dict[str, str]]] = None,
        user_id: Optional[int] = None,
        db: Optional[Session] = None,
        files: Optional[List[Dict[str, Any]]] = None
    ) -> Iterator[str]:
        try:
            client = self._get_client()

            system_instruction = self._build_system_instruction(user_id, db)
            contents = self._build_contents(text, history, files)

            response_stream = client.models.generate_content_stream(
                model=config_manager.model_pro,
                contents=contents,
                config={
                    "tools": [{"googleSearch": {}}],
                    "systemInstruction": {
                        "parts": [{"text": system_instruction}]
                    },
                    "temperature": config_manager.temperature
                }
            )

            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text

        except Exception as e:
            print(f"An error occurred: {e}")
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

            contents = self._build_contents(text, history)

            if prompt:
                system_content = types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)]
                )
                contents.insert(0, system_content)
            
            response = client.models.generate_content(
                model=config_manager.model_pro,
                contents=contents,
                config={
                    "tools": [{"googleSearch": {}}],
                    "temperature": config_manager.temperature
                }
            )

            response_text = response.text if response and response.text else ""
            if response_text.strip() == "END":
                return "It was wonderful getting to know you! I've gathered enough information to prepare the initial materials for your success. I'm confident that together we can achieve something truly great. Let me prepare everything for our journey ahead!"
            return response_text

        except Exception as e:
            print(f"An error occurred: {e}")
            raise



    def search_youtube_videos(self, search_queries: list) -> list:
        import requests
        
        youtube_videos = []
        api_key = config_manager.google_api_key
        
        if not api_key:
            return youtube_videos
        
        
        for query in search_queries:
            try:
                url = "https://www.googleapis.com/youtube/v3/search"
                params = {
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "maxResults": 1,
                    "key": api_key
                }
                
                response = requests.get(url, params=params)
                
                if response.status_code == 200:
                    data = response.json()
                    if data.get("items"):
                        video = data["items"][0]
                        video_id = video["id"]["videoId"]
                        video_title = video["snippet"]["title"]
                        channel_name = video["snippet"]["channelTitle"]
                        video_url = f"https://www.youtube.com/watch?v={video_id}"
                        
                        
                        thumbnail_url = video["snippet"].get("thumbnails", {}).get("high", {}).get("url", "")
                        
                        youtube_videos.append({
                            "title": video_title,
                            "url": video_url,
                            "channel": channel_name,
                            "thumbnail": thumbnail_url
                        })
                    else:
                        pass
                else:
                    pass
            except Exception as e:
                print(f"An error occurred: {e}")
                continue
        
        return youtube_videos

    def find_recommendations(self, conversation_text: str, user_feedback: str = "") -> dict:
        try:
            client = self._get_client()

            from pathlib import Path
            prompt_path = Path(__file__).parent / "prompts" / "recommendations.md"
            with open(prompt_path, 'r') as f:
                prompt_template = f.read()

            prompt = prompt_template.format(
                conversation_text=conversation_text,
                user_feedback=user_feedback if user_feedback else "No previous feedback available."
            )

            response = client.models.generate_content(
                model=config_manager.model_pro,
                contents=prompt,
                config={
                    "tools": [{"googleSearch": {}}],
                    "temperature": 0.3
                }
            )

            result = self._extract_json_from_response(response.text)
            
            
            if result.get("videos"):
                pass
                search_queries = []
                for video in result["videos"]:
                    if video.get("title"):
                        query = video.get("title", "")
                        if video.get("channel"):
                            query += " " + video.get("channel")
                        search_queries.append(query)
                
                youtube_results = self.search_youtube_videos(search_queries)
                
                valid_videos = []
                seen_urls = set()
                
                for i, video in enumerate(result["videos"]):
                    if i < len(youtube_results):
                        video["url"] = youtube_results[i]["url"]
                        video["thumbnail"] = youtube_results[i].get("thumbnail", "")
                        
                        if video["url"].lower() not in seen_urls:
                            valid_videos.append(video)
                            seen_urls.add(video["url"].lower())
                        else:
                            pass
                    else:
                        pass
                
                result["videos"] = valid_videos
            
            return result

        except Exception as e:
            print(f"An error occurred: {e}")
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
                    "temperature": 0.3
                }
            )


            if response and response.text:
                text = response.text.strip()

                if text.startswith('```python'):
                    text = text[9:]
                elif text.startswith('```'):
                    text = text[3:]

                if text.endswith('```'):
                    text = text[:-3]

                text = text.strip()

                first_bracket = text.find('[')
                last_bracket = text.rfind(']')

                if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
                    json_text = text[first_bracket:last_bracket + 1]
                    import json
                    result = json.loads(json_text)
                    return result
                else:
                    return []
            else:
                return []

        except Exception as e:
            print(f"An error occurred: {e}")
            return []


    def book_discussion_response(
        self,
        message: str,
        book_title: str,
        book_author: str,
        current_chapter: dict,
        all_chapters: List[dict],
        history: Optional[List[Dict[str, str]]] = None
    ) -> str:
        try:
            
            client = self._get_client()
            
            processed_history, summary = self._build_conversation_context(history)
            
            conversation_context = ""
            if summary:
                conversation_context = f"Previous conversation summary: {summary}\n\n"
            
            if processed_history:
                conversation_context += "Recent conversation:\n"
                for msg in processed_history[-10:]:
                    role = "User" if msg.get("role") == "user" else "Assistant"
                    conversation_context += f"{role}: {msg.get('content', '')}\n"
            
            all_chapters_text = "\n\n".join([
                f"Chapter: {ch.get('chapter', 'Unknown')}\n{ch.get('content', '')}"
                for ch in all_chapters
            ])
            
            prompt = config_manager.book_discussion_prompt.format(
                book_title=book_title,
                book_author=book_author,
                current_chapter_title=current_chapter.get('chapter', 'Unknown'),
                current_chapter_content=current_chapter.get('content', ''),
                all_chapters=all_chapters_text,
                conversation_context=conversation_context
            )
            
            contents = [{
                "role": "user",
                "parts": [{"text": message}]
            }]
            
            response = client.models.generate_content(
                model=config_manager.model_fast,
                contents=contents,
                config={
                    "tools": [{"googleSearch": {}}],
                    "systemInstruction": {
                        "parts": [{"text": prompt}]
                    },
                    "temperature": 0.5
                }
            )
            
            return response.text if response.text else ""
                    
        except Exception as e:
            print(f"An error occurred: {e}")
            raise


llm_client = LLMStreamingClient()


def stream_chat_response(
    text: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None,
    files: Optional[List[Dict[str, Any]]] = None
) -> Iterator[str]:
    return llm_client.stream_response(text, history, user_id, db, files)

def generate_initial_call_response(
    text: str,
    history: Optional[List[Dict[str, Any]]] = None,
    user_id: Optional[int] = None,
    db: Optional[Session] = None,
    prompt: str = ""
) -> str:
    return llm_client.initial_call_response(text, history, user_id, db, prompt)

