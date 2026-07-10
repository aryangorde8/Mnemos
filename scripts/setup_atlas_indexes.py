"""Create/refresh the two Atlas search indexes for the AWS variant.

The AWS branch embeds with Cohere embed-english-v3.0 (1024-dim); the old
corpus was embedded at 768-dim (Vertex text-embedding-004). Mixing dims in
one index breaks $vectorSearch, so this script:

  1. (--wipe) deletes all documents + chunks (the old 768-dim corpus),
  2. drops + recreates the vector index at EMBEDDING_DIM (default 1024)
     with the `source` filter field the retrieval code relies on,
  3. drops + recreates the BM25 text index (lucene.english over text/title,
     token `source` for the equals filter),
  4. waits until both indexes report queryable.

After it finishes, re-ingest (web UI /ingest, or POST /ingest/demo on the
agent) so chunks are embedded at the new dimension.

Run inside the agent container (pymongo + env already present):
  docker compose exec agent python scripts/setup_atlas_indexes.py --wipe
or anywhere with pymongo installed and MONGODB_URI exported.
"""
from __future__ import annotations

import argparse
import os
import sys
import time

from pymongo import MongoClient
from pymongo.operations import SearchIndexModel


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def wait_gone(coll, name: str, timeout: float = 120.0) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        if not any(ix["name"] == name for ix in coll.list_search_indexes()):
            return
        time.sleep(3)
    raise TimeoutError(f"index {name} still present after {timeout}s")


def wait_queryable(coll, name: str, timeout: float = 300.0) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        for ix in coll.list_search_indexes():
            if ix["name"] == name and ix.get("queryable"):
                print(f"  ✓ {name} queryable")
                return
        time.sleep(5)
    raise TimeoutError(f"index {name} not queryable after {timeout}s")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--wipe", action="store_true",
                    help="delete all documents+chunks first (required when the embedding dim changed)")
    args = ap.parse_args()

    uri = env("MONGODB_URI")
    if not uri.startswith("mongodb"):
        print("MONGODB_URI is not set", file=sys.stderr)
        return 1
    dbname = env("MONGODB_DB", "mnemos")
    vec_name = env("MONGODB_VECTOR_INDEX", "mnemos_vector_index")
    txt_name = env("MONGODB_TEXT_INDEX", "mnemos_text_index")
    dim = int(env("EMBEDDING_DIM", "1024"))

    client = MongoClient(uri, appName="mnemos-setup-indexes")
    db = client[dbname]
    chunks = db["chunks"]

    if args.wipe:
        nd = db["documents"].delete_many({}).deleted_count
        nc = chunks.delete_many({}).deleted_count
        print(f"wiped corpus: {nd} documents, {nc} chunks")

    existing = {ix["name"] for ix in chunks.list_search_indexes()}
    for name in (vec_name, txt_name):
        if name in existing:
            print(f"dropping existing index {name} …")
            chunks.drop_search_index(name)
            wait_gone(chunks, name)

    print(f"creating {vec_name} (vector, {dim}-dim cosine, filter: source) …")
    chunks.create_search_index(SearchIndexModel(
        name=vec_name,
        type="vectorSearch",
        definition={"fields": [
            {"type": "vector", "path": "embedding",
             "numDimensions": dim, "similarity": "cosine"},
            {"type": "filter", "path": "source"},
        ]},
    ))

    print(f"creating {txt_name} (BM25, lucene.english over text/title) …")
    chunks.create_search_index(SearchIndexModel(
        name=txt_name,
        type="search",
        definition={
            "analyzer": "lucene.english",
            "searchAnalyzer": "lucene.english",
            "mappings": {"dynamic": False, "fields": {
                "text": {"type": "string"},
                "title": {"type": "string"},
                "source": {"type": "token"},
            }},
        },
    ))

    wait_queryable(chunks, vec_name)
    wait_queryable(chunks, txt_name)
    print("done — re-ingest the corpus now (POST /ingest/demo or the web /ingest page)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
