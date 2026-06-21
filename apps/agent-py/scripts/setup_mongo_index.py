"""Create the Atlas Search indexes on `chunks` — port of scripts/setup-mongo-index.ts.

  apps/agent-py/.venv/bin/python apps/agent-py/scripts/setup_mongo_index.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/agent-py

from pymongo import MongoClient  # noqa: E402
from pymongo.operations import SearchIndexModel  # noqa: E402

from app.config import settings  # noqa: E402 (loads .env.local)

DIMS = 768

vector_index = SearchIndexModel(
    name=settings.mongodb_vector_index,
    type="vectorSearch",
    definition={
        "fields": [
            {"type": "vector", "path": "embedding", "numDimensions": DIMS, "similarity": "cosine"},
            {"type": "filter", "path": "source"},
            {"type": "filter", "path": "documentId"},
            {"type": "filter", "path": "metadata.threadId"},
        ]
    },
)

text_index = SearchIndexModel(
    name=settings.mongodb_text_index,
    type="search",
    definition={
        "mappings": {
            "dynamic": False,
            "fields": {
                "text": {"type": "string", "analyzer": "lucene.english"},
                "title": {"type": "string", "analyzer": "lucene.english"},
                "source": {"type": "token"},
            },
        }
    },
)


def main() -> None:
    if not settings.mongodb_uri.startswith("mongodb"):
        print("MONGODB_URI is required", file=sys.stderr)
        sys.exit(1)
    client = MongoClient(settings.mongodb_uri, appName="mnemos-setup")
    try:
        db = client[settings.mongodb_db]
        if "chunks" not in db.list_collection_names():
            db.create_collection("chunks")
            print(f"created collection {settings.mongodb_db}.chunks")
        chunks = db["chunks"]
        existing = {i["name"] for i in chunks.list_search_indexes()}
        for model in (vector_index, text_index):
            if model.document["name"] in existing:
                print(f'index "{model.document["name"]}" already exists')
                continue
            name = chunks.create_search_index(model)
            print(f'created {model.document["type"]} index "{name}" on {settings.mongodb_db}.chunks')
        print("note: Atlas takes ~1–3 minutes to build each index before queries return results.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
