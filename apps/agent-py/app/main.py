"""Mnemos Python agent backend — FastAPI entrypoint.

Mirrors apps/agent/src/server.ts. Routes are mounted as they're ported; this
file currently wires health/readiness and the search router.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    active_embedding_label, active_model, active_model_label, active_provider_short,
    embed_provider, is_bedrock, is_mongo_configured, is_vertex_configured, llm_mode, settings,
)
from app.lib.firebase_auth import firebase_middleware, is_firebase_configured

app = FastAPI(title="mnemos-agent-py")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Firebase auth gate — no-op unless FIREBASE_PROJECT_ID is set.
app.middleware("http")(firebase_middleware)


@app.get("/health")
async def health() -> dict:
    return {
        "service": "mnemos-agent-py",
        "status": "ok",
        "time": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/ready")
async def ready() -> dict:
    gmail_configured = bool(
        __import__("os").environ.get("GMAIL_OAUTH_CLIENT_ID")
        and __import__("os").environ.get("GMAIL_OAUTH_CLIENT_SECRET")
        and __import__("os").environ.get("GMAIL_OAUTH_REDIRECT_URI")
    )
    return {
        "atlas": "configured" if is_mongo_configured() else "missing",
        "vertex": "configured" if is_vertex_configured() else "missing",
        "llm": llm_mode(),  # bedrock | gemini_api (free tier) | vertex | missing
        "embeddings": embed_provider(),  # bedrock (titan) | gemini_api | vertex | missing
        "gmail": "configured" if gmail_configured else "missing",
        "firebaseAuth": "enforced" if is_firebase_configured() else "open",
        "mcp": "enabled" if settings.mnemos_use_mcp != "0" else "disabled",
        "model": active_model(),
        "modelLabel": active_model_label(),
        "providerShort": active_provider_short(),
        "embeddingModel": active_embedding_label(),
        "region": settings.bedrock_region if is_bedrock() else settings.google_cloud_location,
        "runtime": "python",
    }


# Routers
from app.routes.search import router as search_router  # noqa: E402
from app.routes.agent import router as agent_router  # noqa: E402
from app.routes.actions import router as actions_router  # noqa: E402
from app.routes.commitments import router as commitments_router  # noqa: E402
from app.routes.graph import router as graph_router  # noqa: E402
from app.routes.auth import router as auth_router  # noqa: E402
from app.routes.debate import router as debate_router  # noqa: E402
from app.routes.briefings import router as briefings_router  # noqa: E402
from app.routes.ingest import router as ingest_router  # noqa: E402

for _r in (search_router, agent_router, actions_router, commitments_router, graph_router,
           auth_router, debate_router, briefings_router, ingest_router):
    app.include_router(_r)
