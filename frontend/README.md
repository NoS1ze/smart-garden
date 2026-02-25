# Smart Garden Dashboard

React dashboard for the Smart Garden IoT monitoring system.

## Setup

1. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   cp .env.example .env
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## Features

- Sensor selector dropdown
- Metric tabs: Soil Moisture, Temperature, Humidity, Light, CO2
- Historical line chart with date range picker (24h / 7d / 30d / custom)
- Current reading display with timestamp
- Alert rules management (create/delete)
- Alert history table
- Auto-refresh every 60 seconds

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `VITE_API_URL` | FastAPI backend URL (for alert creation) |

## Deployment

### Vercel (recommended)

1. Push repo to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Set root directory to `frontend/`
4. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
5. Deploy

### Netlify

1. Push repo to GitHub
2. New site from Git on [netlify.com](https://netlify.com)
3. Base directory: `frontend/`, build command: `npm run build`, publish: `dist`
4. Add environment variables in Site Settings > Environment
5. Deploy

**Note**: `VITE_API_URL` should point to your deployed Railway/Render backend URL (e.g. `https://smart-garden-api.railway.app`).
