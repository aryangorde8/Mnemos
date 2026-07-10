# Mnemos Python agent backend — AWS variant image (EC2 docker-compose / any container host).
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install deps first for layer caching.
COPY apps/agent-py/requirements.txt ./apps/agent-py/requirements.txt
RUN pip install -r apps/agent-py/requirements.txt

# App source + fixtures the tools read (voice cue / demo corpus) + ops scripts
# (scripts/setup_atlas_indexes.py runs inside this container).
COPY apps/agent-py ./apps/agent-py
COPY scripts ./scripts

# Runtime config comes from the container env (deploy/aws/.env):
#   MONGODB_URI, GROQ_API_KEY, COHERE_API_KEY  — required
#   LLM_BASE_URL / LLM_MODEL / COHERE_EMBED_MODEL — optional overrides
# No cloud-provider credentials are baked in or required.
ENV PORT=8080
CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir apps/agent-py --host 0.0.0.0 --port ${PORT:-8080}"]
