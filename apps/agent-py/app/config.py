"""Typed runtime config — mirrors apps/agent/src/config.ts.

Loads the same repo-root .env.local both apps share, so the Python backend runs
against identical Atlas + Bedrock/Gemini + OAuth credentials.
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

    # Free-tier alternative to Vertex: an AI Studio key routes Gemini + embedding
    # calls through the Gemini API (used unless a provider is forced below).
    gemini_api_key: str = Field("", alias="GEMINI_API_KEY")

    # LLM provider for generation/streaming: "bedrock" | "gemini" | "vertex" | ""
    # (auto). Embeddings pick their own provider below (EMBED_PROVIDER).
    llm_provider: str = Field("", alias="LLM_PROVIDER")
    # Amazon Bedrock (Converse API). Credentials come from the standard AWS env
    # (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) or an instance role.
    # Default is Amazon Nova Pro: an AWS first-party model, so it needs no AWS
    # Marketplace subscription — unlike Anthropic Claude, which India (AISPL)
    # accounts can't subscribe to without an international card. Claude/Llama/
    # Mistral all work here too by changing this id (Claude needs the card).
    # The region prefix (apac./us./eu.) must match BEDROCK_REGION.
    bedrock_model_id: str = Field(
        "apac.amazon.nova-pro-v1:0", alias="BEDROCK_MODEL_ID")
    bedrock_region: str = Field("", alias="BEDROCK_REGION")

    # Embedding provider: "bedrock" | "gemini" | "vertex" | "" (auto). Bedrock uses
    # Titan; its dimension must match the Atlas vector index (rebuild on change).
    embed_provider: str = Field("", alias="EMBED_PROVIDER")
    bedrock_embed_model: str = Field("amazon.titan-embed-text-v2:0", alias="BEDROCK_EMBED_MODEL")
    bedrock_embed_dims: int = Field(1024, alias="BEDROCK_EMBED_DIMS")

    mnemos_use_mcp: str = Field("0", alias="MNEMOS_USE_MCP")
    firebase_project_id: str = Field("", alias="FIREBASE_PROJECT_ID")
    mnemos_web_url: str = Field("", alias="MNEMOS_WEB_URL")


settings = Settings()


def is_mongo_configured() -> bool:
    return settings.mongodb_uri.startswith("mongodb")


def is_vertex_configured() -> bool:
    return len(settings.google_cloud_project) > 0


def llm_provider() -> str:
    """Which backend serves generation/streaming: 'bedrock' | 'gemini_api' | 'vertex'
    | 'missing'. LLM_PROVIDER forces it; otherwise infer from what's configured."""
    forced = (settings.llm_provider or "").strip().lower()
    if forced in ("bedrock", "gemini", "gemini_api", "vertex"):
        return "gemini_api" if forced == "gemini" else forced
    if settings.gemini_api_key:
        return "gemini_api"
    return "vertex" if is_vertex_configured() else "missing"


def is_bedrock() -> bool:
    return llm_provider() == "bedrock"


def is_llm_configured() -> bool:
    """Generation is callable via Bedrock, the Gemini API, or Vertex."""
    return llm_provider() != "missing"


def embed_provider() -> str:
    """Which backend serves embeddings: 'bedrock' | 'gemini_api' | 'vertex' | 'missing'.
    EMBED_PROVIDER forces it; otherwise infer (Gemini key, then Vertex, then Bedrock)."""
    forced = (settings.embed_provider or "").strip().lower()
    if forced in ("bedrock", "gemini", "gemini_api", "vertex"):
        return "gemini_api" if forced == "gemini" else forced
    if settings.gemini_api_key:
        return "gemini_api"
    if is_vertex_configured():
        return "vertex"
    return "bedrock" if is_bedrock() else "missing"


def embedding_dims() -> int:
    """Vector dimension of the active embedding model — must match the Atlas index."""
    return settings.bedrock_embed_dims if embed_provider() == "bedrock" else 768


def is_embeddings_configured() -> bool:
    return embed_provider() != "missing"


def active_model() -> str:
    """The generation model id currently in use."""
    return settings.bedrock_model_id if is_bedrock() else settings.vertex_gemini_model


def _bedrock_label(model_id: str) -> str:
    """Human-friendly name from a Bedrock model / inference-profile id, e.g.
    'apac.amazon.nova-pro-v1:0' -> 'Amazon Nova Pro';
    'global.anthropic.claude-sonnet-4-5-..' -> 'Claude Sonnet 4.5'."""
    import re
    mid = model_id.lower()
    if "nova" in mid:
        tier = ("Pro" if "nova-pro" in mid else "Lite" if "nova-lite" in mid
                else "Micro" if "nova-micro" in mid else "Premier" if "nova-premier" in mid else "")
        return f"Amazon Nova {tier}".strip()
    if "titan" in mid:
        return "Amazon Titan"
    if "claude" in mid:
        fam = ("Claude Opus" if "opus" in mid else "Claude Haiku" if "haiku" in mid
               else "Claude Sonnet" if "sonnet" in mid else "Claude")
        m = re.search(r"(?:sonnet|opus|haiku)-(\d+)(?:-(\d+))?", mid)
        ver = f" {m.group(1)}.{m.group(2)}" if m and m.group(2) else (f" {m.group(1)}" if m else "")
        return f"{fam}{ver}"
    if "mistral" in mid:
        return "Mistral"
    if "llama" in mid:
        return "Llama"
    return "Bedrock model"


def active_model_label() -> str:
    """Human-friendly name of the active generation model, e.g. 'Amazon Nova Pro'."""
    p = llm_provider()
    if p == "bedrock":
        return _bedrock_label(settings.bedrock_model_id)
    if p == "gemini_api":
        return "Gemini (API)"
    if p == "vertex":
        return "Gemini (Vertex)"
    return "not configured"


def active_provider_short() -> str:
    """One-word tag for the active generation model, for compact UI chips:
    'nova' | 'claude' | 'titan' | 'mistral' | 'llama' on Bedrock, else 'gemini'."""
    if is_bedrock():
        mid = settings.bedrock_model_id.lower()
        for tag in ("nova", "titan", "claude", "mistral", "llama"):
            if tag in mid:
                return tag
        return "bedrock"
    return "gemini"


def active_embedding_label() -> str:
    """Human-friendly name of the active embedding model."""
    if embed_provider() == "bedrock":
        return "Titan (Bedrock)"
    return settings.vertex_embedding_model


# Back-compat alias — /ready and the web pill read this.
def llm_mode() -> str:
    return llm_provider()
