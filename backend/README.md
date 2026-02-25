# Smart Garden IoT — Backend

FastAPI service that ingests sensor readings, stores them in Supabase, and sends email alerts via SendGrid when thresholds are breached.

## Setup

1. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and SendGrid credentials
   ```

3. **Run the server**

   ```bash
   uvicorn main:app --reload --port 8000
   ```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/readings | Ingest sensor readings |
| GET | /api/readings | Query historical readings |
| GET | /api/sensors | List all sensors |
| POST | /api/alerts | Create an alert rule |
| GET | /api/alerts | List alert rules |

| GET | /health | Health check (for deploy probes) |

See `../docs/api-spec.md` for full request/response schemas.

## Deployment

### Railway

1. Push this repo to GitHub.
2. Create a new project on [Railway](https://railway.app) and connect your GitHub repo.
3. Set the **root directory** to `/backend`.
4. Add the required environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SENDGRID_API_KEY`, `ALERT_COOLDOWN_MINUTES`).
5. Railway detects `railway.toml` automatically. It will build using the Dockerfile and override the start command with `uvicorn main:app --host 0.0.0.0 --port $PORT` so the app binds to Railway's assigned port.
6. Deploy. The `/health` endpoint is used for health checks.

### Render

1. Push this repo to GitHub.
2. Create a new **Web Service** on [Render](https://render.com) and connect your GitHub repo.
3. Set the **root directory** to `/backend`.
4. Render picks up `render.yaml` for build and start commands.
5. Add the required environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SENDGRID_API_KEY`). `ALERT_COOLDOWN_MINUTES` defaults to `60` in `render.yaml`.
6. Deploy. Both Railway and Render inject a `PORT` environment variable automatically; the uvicorn start command uses `$PORT` to bind correctly.
