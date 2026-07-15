"""Create the Atlas Search indexes on `chunks` — port of scripts/setup-mongo-index.ts.

  apps/agent-py/.venv/bin/python apps/agent-py/scripts/setup_mongo_index.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # apps/agent-py

from pymongo import MongoClient  # noqa: E402
from pymongo.operations import SearchIndexModel  # noqa: E402

from app.config import embedding_dims, settings  # noqa: E402 (loads .env.local)

DIMS = embedding_dims()  # 768 (Gemini/Vertex) or the Titan dim (Bedrock)

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
        existing = {i["name"]: i for i in chunks.list_search_indexes()}

        def _vector_dims(idx: dict) -> int | None:
            # Search the index metadata for numDimensions wherever Atlas nests it
            # (latestDefinition / definition / statusDetail shapes have varied).
            found: list[int] = []

            def walk(node):
                if isinstance(node, dict):
                    if isinstance(node.get("numDimensions"), int):
                        found.append(node["numDimensions"])
                    for v in node.values():
                        walk(v)
                elif isinstance(node, list):
                    for v in node:
                        walk(v)

            walk(idx)
            return found[0] if found else None

        import time
        for model in (vector_index, text_index):
            name = model.document["name"]
            is_vector = model.document["type"] == "vectorSearch"
            if name in existing:
                if not is_vector:
                    print(f'index "{name}" already exists')
                    continue
                # The vector index must match the active model's dimension. Recreate
                # unless it's confirmed already at DIMS (treat unknown as a mismatch,
                # so a provider/dimension switch always takes effect).
                cur_dims = _vector_dims(existing[name])
                if cur_dims == DIMS:
                    print(f'vector index "{name}" already at {DIMS}-d')
                    continue
                print(f'vector index "{name}" is {cur_dims}-d, need {DIMS}-d — recreating')
                chunks.drop_search_index(name)
                while name in {i["name"] for i in chunks.list_search_indexes()}:
                    time.sleep(2)  # wait for the drop to finalize before recreating
            created = chunks.create_search_index(model)
            print(f'created {model.document["type"]} index "{created}" on {settings.mongodb_db}.chunks')
        print("note: Atlas takes ~1–3 minutes to build each index before queries return results.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
