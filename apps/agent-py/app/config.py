"""Typed runtime config — AWS variant (zero Google stack).

Loads the same repo-root .env.local both apps share in local dev; in the
docker-compose / EC2 deployment the values come from the container env
(deploy/aws/.env). LLM = any OpenAI-compatible endpoint (Groq free tier by
default); embeddings = Cohere (1024-dim, asymmetric task types).
"""
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# apps/agent-py/app/config.py -> parents[3] == repo root
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env.local"

# Export .env.local into os.environ so libraries that read the environment
# directly (the Gmail OAuth helpers read GMAIL_OAUTH_*) see the same values.
load_dotenv(_ENV_FILE)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    agent_port: int = Field(8787, alias="AGENT_PORT")
    agent_py_port: int = Field(8788, alias="AGENT_PY_PORT")

    mongodb_uri: str = Field("", alias="MONGODB_URI")
    mongodb_db: str = Field("mnemos", alias="MONGODB_DB")
    mongodb_vector_index: str = Field("mnemos_vector_index", alias="MONGODB_VECTOR_INDEX")
    mongodb_text_index: str = Field("mnemos_text_index", alias="MONGODB_TEXT_INDEX")

    # LLM — any OpenAI-compatible chat endpoint. Groq free tier by default;
    # swap provider by changing base URL + model + key, no code change.
    llm_base_url: str = Field("https://api.groq.com/openai/v1", alias="LLM_BASE_URL")
    llm_model: str = Field("llama-3.3-70b-versatile", alias="LLM_MODEL")
    # Bulk extraction (graph/commitments) runs on a small model with its own
    # per-model quota — a full-corpus rebuild (~400k tokens) can't fit in the
    # 70B free-tier daily budget (100k TPD), and shouldn't ride it anyway.
    llm_extract_model: str = Field("llama-3.1-8b-instant", alias="LLM_EXTRACT_MODEL")
    groq_api_key: str = Field("", alias="GROQ_API_KEY")

    # Embeddings — Cohere. embed-english-v3.0 = 1024-dim; the Atlas vector
    # index must be built with numDimensions matching embedding_dim.
    cohere_api_key: str = Field("", alias="COHERE_API_KEY")
    cohere_embed_model: str = Field("embed-english-v3.0", alias="COHERE_EMBED_MODEL")
    embedding_dim: int = Field(1024, alias="EMBEDDING_DIM")

    firebase_project_id: str = Field("", alias="FIREBASE_PROJECT_ID")
    mnemos_web_url: str = Field("", alias="MNEMOS_WEB_URL")

    # Fallback zone for meeting times that carry neither an offset nor a location
    # hint. IANA name ("Asia/Kolkata") or a raw offset ("UTC+05:30").
    default_timezone: str = Field("UTC", alias="MNEMOS_DEFAULT_TZ")


settings = Settings()


def is_mongo_configured() -> bool:
    return settings.mongodb_uri.startswith("mongodb")


def is_llm_configured() -> bool:
    return len(settings.groq_api_key) > 0


def is_embeddings_configured() -> bool:
    return len(settings.cohere_api_key) > 0
