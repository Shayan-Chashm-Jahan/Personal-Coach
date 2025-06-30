import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


class ConfigManager:
    def __init__(self) -> None:
        self.project_id = os.getenv("GCP_PROJECT_ID")
        if not self.project_id:
            raise ValueError("GCP_PROJECT_ID environment variable is required")

        self.model_pro = "gemini-2.5-pro"
        self.model_fast = "gemini-2.5-flash"
        self.model_super_fast = "gemini-2.0-flash"
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

        self.google_api_key = os.getenv("GOOGLE_API_KEY")

        self._load_prompts()

    def _load_prompts(self) -> None:
        prompts_dir = Path(__file__).parent / "prompts"
        try:
            self.system_prompt = self._read_prompt_file(prompts_dir / "system_prompt.md")
            self.conversation_summary_prompt = self._read_prompt_file(prompts_dir / "conversation_summary.md")
            self.memory_extraction_prompt = self._read_prompt_file(prompts_dir / "memory_extraction.md")
            self.initial_call_prompt = self._read_prompt_file(prompts_dir / "initial_call_prompt.md")
        except FileNotFoundError as e:
            raise ValueError(f"Failed to load prompt file: {e}")

    def _read_prompt_file(self, file_path: Path) -> str:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read().strip()

    def get_vertex_ai_config(self) -> dict:
        return {
            "vertexai": True,
            "project": self.project_id,
            "location": self.location
        }


config_manager = ConfigManager()