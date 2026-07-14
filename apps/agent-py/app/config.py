"""Typed runtime config — mirrors apps/agent/src/config.ts.

Loads the same repo-root .env.local both apps share, so the Python backend runs
against identical Atlas + Vertex + OAuth credentials.
"""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# apps/agent-py/app/config.py -> parents[3] == repo root
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env.local"

# Export .env.local into os.environ so libraries that read the environment
# directly (the google-genai SDK reads GOOGLE_APPLICATION_CREDENTIALS / ADC,
# the Gmail OAuth helpers read GMAIL_OAUTH_*) see the same values.
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # The Python backend runs on a distinct port so it can coexist with the
    # TypeScript one during the parity migration.
    agent_port: int = Field(8787, alias="AGENT_PORT")
    agent_py_port: int = Field(8788, alias="AGENT_PY_PORT")

    mongodb_uri: str = Field("", alias="MONGODB_URI")
    mongodb_db: str = Field("mnemos", alias="MONGODB_DB")
    mongodb_vector_index: str = Field("mnemos_vector_index", alias="MONGODB_VECTOR_INDEX")
    mongodb_text_index: str = Field("mnemos_text_index", alias="MONGODB_TEXT_INDEX")

    google_cloud_project: str = Field("", alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field("us-central1", alias="GOOGLE_CLOUD_LOCATION")
    google_application_credentials: str = Field("", alias="GOOGLE_APPLICATION_CREDENTIALS")
    # Gemini 3.x preview is served from the global endpoint; embeddings stay regional.
    vertex_gemini_model: str = Field("gemini-3.1-pro-preview", alias="VERTEX_GEMINI_MODEL")
    vertex_gemini_location: str = Field("global", alias="VERTEX_GEMINI_LOCATION")
    vertex_embedding_model: str = Field("text-embedding-004", alias="VERTEX_EMBEDDING_MODEL")

    # Free-tier alternative to Vertex: an AI Studio key routes ALL Gemini +
    # embedding calls through the Gemini API (takes precedence when set).
    gemini_api_key: str = Field("", alias="GEMINI_API_KEY")

    mnemos_use_mcp: str = Field("0", alias="MNEMOS_USE_MCP")
    firebase_project_id: str = Field("", alias="FIREBASE_PROJECT_ID")
    mnemos_web_url: str = Field("", alias="MNEMOS_WEB_URL")


settings = Settings()


def is_mongo_configured() -> bool:
    return settings.mongodb_uri.startswith("mongodb")


def is_vertex_configured() -> bool:
    return len(settings.google_cloud_project) > 0


def is_llm_configured() -> bool:
    """Gemini is callable via either transport: API key (free tier) or Vertex."""
    return bool(settings.gemini_api_key) or is_vertex_configured()


def llm_mode() -> str:
    """Which transport serves Gemini calls — the API key wins when both are set,
    since routing through the free tier is the whole point of setting it."""
    if settings.gemini_api_key:
        return "gemini_api"
    return "vertex" if is_vertex_configured() else "missing"
