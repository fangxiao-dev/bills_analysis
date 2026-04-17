# Docker Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- `.env.docker` file configured with real API keys

## Quick Start

### 1. Configure Environment

```bash
# Copy the example configuration
cp .env.docker.example .env.docker

# Edit with your Azure API credentials
vim .env.docker
```

**Required environment variables:**

```env
# Azure Document Intelligence (invoice recognition)
AZURE_DI_ENDPOINT="https://your-resource.cognitiveservices.azure.com/"
AZURE_DI_KEY="your-di-api-key"

# Azure OpenAI (document classification & semantic validation)
AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
AZURE_OPENAI_KEY="your-openai-api-key"
```

**Optional configuration:**

```env
# Expected receiver for office batch type validation
OFFICE_EXPECTED_RECEIVER="Your Company Name"

# File processing timeout in seconds
BACKEND_FILE_TIMEOUT_SEC=180
```

### 2. Build & Run

```bash
# Build image and start service
docker compose up -d

# Check service status
docker compose ps

# View logs
docker compose logs -f api

# Stop service
docker compose down
```

### 3. Access

- **Web UI**: http://localhost:8002
- **API**: http://localhost:8002/docs (OpenAPI/Swagger)
- **Health check**: http://localhost:8002/healthz

## Troubleshooting

### Container won't start

```bash
# Check detailed logs
docker compose logs api

# Rebuild from scratch
docker compose build --no-cache
docker compose up -d
```

### Health check failing

- Check Azure API credentials in `.env.docker`
- Ensure network connectivity: `docker exec <container-id> curl -v http://127.0.0.1:8000/healthz`

### PDF processing errors

- Verify `AZURE_DI_ENDPOINT` and `AZURE_DI_KEY` are correct
- Check file permissions on `./outputs` volume

## Configuration Details

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `HOST` | API server host | `0.0.0.0` | No |
| `PORT` | API server port | `8000` | No |
| `RUN_INLINE_WORKER` | Run async tasks inline | `true` | No |
| `FRONTEND_DIST_DIR` | Static frontend path | `/app/frontend/dist` | No |
| `AZURE_DI_ENDPOINT` | Document Intelligence URL | — | Yes |
| `AZURE_DI_KEY` | DI API key | — | Yes |
| `AZURE_OPENAI_ENDPOINT` | OpenAI endpoint URL | — | Yes |
| `AZURE_OPENAI_KEY` | OpenAI API key | — | Yes |

## Development

### Local development (without Docker)

```bash
# Install dependencies
uv sync --all-extras

# Create local .env
cp .env.docker.example .env

# Run backend
invoice-web-api

# In another terminal, run frontend
cd frontend
pnpm install
pnpm dev
```

### Build custom image

```bash
# Build with custom tag
docker build -t bills-analysis:my-version .

# Run custom image
docker run -p 8000:8000 \
  --env-file .env.docker \
  -v $(pwd)/outputs:/app/outputs \
  bills-analysis:my-version
```

## Security Notes

⚠️ **Important:**

- `.env.docker` contains sensitive API keys — never commit to version control
- It's already in `.gitignore`, but double-check before pushing
- Rotate Azure API keys regularly
- Don't share `.env.docker` files in public channels
- Use separate Azure resources for development, staging, and production

## Support

For issues:

1. Check logs: `docker compose logs api`
2. Review AGENTS.md for architecture overview
3. Check azure service status
4. Verify firewall/VPN connectivity to Azure endpoints
