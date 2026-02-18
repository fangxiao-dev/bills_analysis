# Stage 1: Node — compile frontend
FROM node:20-slim AS frontend-builder
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN VITE_API_MODE=real pnpm build

# Stage 2: Python — backend + frontend static files
FROM python:3.11-slim AS runtime
# opencv-python (non-headless) requires libgl1 for cv2 import
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml ./
COPY src/ ./src/
RUN pip install --no-cache-dir -e ".[web]"
# tests/config.json is loaded at runtime by local_backend.py
COPY tests/config.json ./tests/config.json
COPY --from=frontend-builder /build/dist ./frontend/dist
RUN mkdir -p /app/outputs/webapp
ENV HOST=0.0.0.0
ENV PORT=8000
ENV FRONTEND_DIST_DIR=/app/frontend/dist
EXPOSE 8000
CMD ["invoice-web-api"]
