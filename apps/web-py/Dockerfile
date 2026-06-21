# Mnemos FastHTML frontend — Cloud Run image.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

COPY apps/web-py/requirements.txt ./apps/web-py/requirements.txt
RUN pip install -r apps/web-py/requirements.txt

COPY apps/web-py ./apps/web-py

# AGENT_URL points at the agent service; Cloud Run provides $PORT.
ENV PORT=8080
CMD ["sh", "-c", "python -m uvicorn main:app --app-dir apps/web-py --host 0.0.0.0 --port ${PORT:-8080}"]
