# Mnemos Python agent backend — Cloud Run image.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install deps first for layer caching.
COPY apps/agent-py/requirements.txt ./apps/agent-py/requirements.txt
RUN pip install -r apps/agent-py/requirements.txt

# App source + fixtures the tools read (voice cue / demo corpus).
COPY apps/agent-py ./apps/agent-py
COPY scripts/fixtures ./scripts/fixtures

# Cloud Run provides $PORT (8080). Credentials come from the runtime service
# account (ADC), so no key file or .env.local is needed in the container.
ENV PORT=8080
CMD ["sh", "-c", "python -m uvicorn app.main:app --app-dir apps/agent-py --host 0.0.0.0 --port ${PORT:-8080}"]
