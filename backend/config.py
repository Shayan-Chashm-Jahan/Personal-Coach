import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class ConfigManager:
    def __init__(self) -> None:
        self.project_id = os.getenv("GCP_PROJECT_ID")
        if not self.project_id:
            raise ValueError("GCP_PROJECT_ID environment variable is required")
        
        self.model_name = "google/gemini-2.0-flash"
        self.location = "us-central1"
        self.temperature = 0.7
        self.max_tokens = 2048
        
        self.max_history_length = 50
        self.history_truncate_threshold = 30
        self.summary_cache_timeout = 300
        self.credential_refresh_buffer = 300
        
        self.secret_key = os.getenv("SECRET_KEY")
        if not self.secret_key:
            raise ValueError("SECRET_KEY environment variable is required for security")
        self.access_token_expire_minutes = 30
        
        self._load_prompts()
    
    def _load_prompts(self) -> None:
        prompts_path = Path(__file__).parent / "prompts.json"
        try:
            with open(prompts_path, 'r') as f:
                prompts = json.load(f)
                self.system_prompt = prompts["system_prompt"]
                self.conversation_summary_prompt = prompts["conversation_summary_prompt"]
                self.memory_extraction_prompt = prompts["memory_extraction_prompt"]
        except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
            raise ValueError(f"Failed to load prompts from prompts.json: {e}")
    
    def get_model_base_url(self) -> str:
        return (
            f"https://{self.location}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.location}/endpoints/openapi"
        )


config_manager = ConfigManager()