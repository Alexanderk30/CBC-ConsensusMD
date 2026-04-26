# Multi-stage build: compile the Vite frontend, then copy the static bundle
# into the Python image alongside the FastAPI backend. The backend mounts
# /frontend/dist at "/" so one service serves both. Designed for Railway,
# Fly.io, Render — anywhere that detects a Dockerfile and provides $PORT.

# ── Stage 1: build the frontend ─────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/frontend

# Copy package manifests first so the npm install layer caches across
# source-only changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


# ── Stage 2: python runtime ─────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# Install the runtime-optional dependencies from pyproject.toml
# (fastapi, uvicorn, anthropic, openai, websockets, python-dotenv).
COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[runtime]"

# Backend source + demo cases the /cases endpoints read from disk.
COPY backend/ ./backend/
COPY cases/ ./cases/

# Prebuilt frontend from the node stage — main.py mounts this at "/".
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Railway (and most PaaS) inject $PORT; fall back to 8000 for local docker runs.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port $PORT"]
