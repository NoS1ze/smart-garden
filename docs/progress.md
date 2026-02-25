# Smart Garden — Progress Tracker

## Team
| Agent | Owns | Status |
|-------|------|--------|
| backend | /backend, /docs | Active |
| frontend | /frontend | Active — waiting on api-spec.md |
| firmware | /firmware | Active |
| team-lead | CLAUDE.md, coordination | Active |

---

## Completed
- **[backend]** /docs/api-spec.md — all 6 endpoints (incl. DELETE /api/alerts/{id}), full schemas ✓
- **[backend]** FastAPI backend — main.py, models.py, database.py, alerts.py, requirements.txt ✓
- **[backend]** DELETE /api/alerts/{alert_id} soft-delete endpoint ✓
- **[backend]** Deployment: Dockerfile, railway.toml, render.yaml, .dockerignore, /health endpoint ✓
- **[firmware]** ESP8266 soil_moisture.ino + combined.ino + config.h.example per subdir + README + .gitignore ✓
- **[firmware]** arduino-cli compile verified: 264KB flash (25%), 36% RAM ✓
- **[frontend]** React dashboard — 16 files, Recharts, Supabase direct reads, alert CRUD via backend ✓
- **[frontend]** deleteAlert patched to use DELETE /api/alerts/{id} backend endpoint ✓
- **[frontend]** Deployment: vercel.json, netlify.toml, README deployment section ✓
- **[team-lead]** Integration verification: syntax ✓, tsc ✓, vite build ✓, arduino compile ✓
- **[team-lead]** docs/schema.sql — ready-to-paste SQL with indexes ✓

---

## In Progress
_(nothing — all build tasks complete)_

---

## Blocked
- **Live end-to-end test**: needs Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY) and schema applied
- **Deployment**: Railway/Render setup not started

---

## Known Issues
_(none yet)_

---

## Architecture Decisions Log
- **2026-02-25**: Confirmed hardware is ESP8266 (Lolin NodeMCU V3), NOT ESP32. Only 1 analog pin (A0). Moisture sensor powered via D1 pin.
- **2026-02-25**: Frontend reads Supabase directly (anon key). Only alert creation goes via FastAPI.
- **2026-02-25**: Firmware gets timestamp via NTP (no RTC on NodeMCU).
- **2026-02-25**: All sensor readings POSTed in a single request per wake cycle to minimize WiFi on-time.
