"""Async MongoDB access — mirrors apps/agent/src/lib/mongo.ts (motor)."""
from __future__ import annotations

from functools import lru_cache

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.config import is_mongo_configured, settings

SOURCE_KINDS = ("email", "calendar", "meeting_notes", "shared_doc", "slack", "notes")


@lru_cache(maxsize=1)
def _client() -> AsyncIOMotorClient:
    if not is_mongo_configured():
        raise RuntimeError("MONGODB_URI is not configured — set it in .env.local")
    return AsyncIOMotorClient(settings.mongodb_uri, appName="mnemos-agent-py")


def get_db() -> AsyncIOMotorDatabase:
    return _client()[settings.mongodb_db]


def collection(name: str) -> AsyncIOMotorCollection:
    return get_db()[name]


def documents() -> AsyncIOMotorCollection:
    return collection("documents")


def chunks() -> AsyncIOMotorCollection:
    return collection("chunks")
