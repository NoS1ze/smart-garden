# Smart Garden Monitor — CLAUDE.md

## Project Overview
IoT system that collects environmental sensor data from ESP32 devices
and displays it via a web dashboard with alerts.

## Architecture
```
ESP32 wakes from deep sleep
        ↓
Read sensors
        ↓
POST JSON to FastAPI
        ↓
FastAPI saves to Supabase + runs alert checks
        ↓
Web Dashboard reads from Supabase
```

## Hardware

### Current Setup
- **Microcontroller**: Lolin NodeMCU V3 (ESP8266, not ESP32)
  - Note: ESP8266 has only ONE analog pin (A0), plan accordingly
  - Deep sleep via GPIO16 connected to RST pin

- **Sensor 1: Capacitive Soil Moisture Sensor v2.0**
  - VCC (red) → D1 (power pin — allows turning sensor off between readings)
  - GND (black) → G
  - AOUT (yellow) → A0
  - Returns analog value: ~800+ = dry, ~400 = wet (calibrate per sensor)
  - Powered via D1 to save power — turn on, wait 100ms, read, turn off

### Planned Sensors (not yet connected)
- Temperature/humidity (DHT22)
- Light (BH1750)
- CO2 (MH-Z19)

### Power Notes
- NodeMCU V3 deep sleep: GPIO16 must be jumpered to RST
- ESP8266 only has 1 analog pin (A0) — future sensors should be digital/I2C
- D1 used as power switch for moisture sensor to reduce corrosion and save power
```

---

Also update the firmware agent prompt — replace the firmware section with:
```
Build ESP8266 Arduino firmware in /firmware:

- firmware/soil_moisture/soil_moisture.ino — current working sketch
- firmware/config.h.example

Sketch must:
- Wake from deep sleep (GPIO16 jumpered to RST)
- Turn on sensor via D1 (digitalWrite HIGH)
- Wait 100ms for sensor to stabilize
- Read A0 analog value (0-1023)
- Map to percentage (calibrate: ~800=0%, ~400=100%)
- POST JSON to /api/readings:
  {"sensor_id": "x", "readings": [{"metric": "soil_moisture", "value": 45.2}], "recorded_at": <unix epoch>}
- Turn off sensor via D1
- Deep sleep for N seconds (from config.h)

Note: No RTC on NodeMCU — get Unix timestamp from NTP before posting.
Include wiring diagram and required libraries as comments.

## Tech Stack
- **Backend**: Python FastAPI (thin layer for ingestion + alerts)
- **Database**: Supabase (free tier Postgres in the cloud)
- **Frontend**: React + Recharts (historical charts)
- **Alerts**: Email via SendGrid
- **Hosting**: Railway or Render (free tier for FastAPI)
- **Google Home**: Future phase

## Project Structure
```
/backend          FastAPI app, alert engine
/frontend         React dashboard
/firmware         ESP32 Arduino code (.ino files)
/docs             Wiring diagrams, API spec
CLAUDE.md         This file
```

## Database Schema (Supabase)
Table: `sensors`
- id (uuid, primary key)
- name (text)
- location (text)
- created_at (timestamp)

Table: `readings`
- id (uuid, primary key)
- sensor_id (uuid, foreign key)
- metric (text) — temperature, humidity, soil_moisture, light_lux, co2_ppm
- value (float)
- recorded_at (timestamp) — set by ESP32, UTC Unix epoch converted to timestamp

Table: `alerts`
- id (uuid, primary key)
- sensor_id (uuid)
- metric (text)
- condition (text) — "below" or "above"
- threshold (float)
- email (text)
- active (boolean)

Table: `alert_history`
- id (uuid, primary key)
- alert_id (uuid)
- triggered_at (timestamp)
- value_at_trigger (float)

## API Endpoints (FastAPI)
- `POST /api/readings` — ESP32 posts data here
```json
  {
    "sensor_id": "uuid",
    "readings": [
      {"metric": "temperature", "value": 23.5},
      {"metric": "soil_moisture", "value": 45.0}
    ],
    "recorded_at": 1708789200
  }
```
- `GET /api/readings?sensor_id=x&from=date&to=date`
- `GET /api/sensors`
- `POST /api/alerts` — create alert rule
- `GET /api/alerts?sensor_id=x`

## ESP32 Power Strategy
- Deep sleep between readings
- On wake cycle:
  1. Connect WiFi (with timeout — give up after 10s to save battery)
  2. Read all sensors
  3. POST to /api/readings (single request with all metrics)
  4. Disconnect WiFi
  5. Deep sleep for N seconds
- All readings posted in ONE request per wake cycle (minimizes WiFi on-time)
- config.h stores: WiFi credentials, API endpoint, sensor_id, sleep interval

## Alert Logic (backend)
- After saving readings, check all active alert rules for that sensor
- If threshold breached and last alert for same rule was > 1 hour ago → send email
- Save to alert_history

## Coding Conventions
- Python: async/await, Pydantic models for all request/response validation
- All timestamps: ESP32 sends Unix epoch, backend converts to UTC timestamp
- Supabase client: use supabase-py library
- Environment variables in .env — never hardcode secrets
- Frontend reads directly from Supabase (using anon key) except for writes

## Multi-Agent Instructions
- Agent 1 (backend): FastAPI app, Supabase integration, alert engine
- Agent 2 (frontend): React dashboard with Recharts
- Agent 3 (firmware): ESP32 Arduino sketches
- First task for Agent 1: create /docs/api-spec.md before others start
- Agents must not touch each other's folders
- Commit to git after each major feature

## Environment Variables needed
```
# backend/.env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SENDGRID_API_KEY=
ALERT_COOLDOWN_MINUTES=60

# frontend/.env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=
```

## Current Status
- [ ] Supabase project created + schema applied
- [ ] Backend API
- [ ] Alert engine
- [ ] ESP32 firmware
- [ ] Frontend dashboard
- [ ] Deployed to Railway/Render
- [ ] Google Home (future)
```

---

And here are the updated agent prompts:

---

**Terminal 1 — Backend Agent**
```
Read CLAUDE.md thoroughly. You are Agent 1 (backend).

First create /docs/api-spec.md with full request/response 
JSON schemas for all endpoints.

Then build the FastAPI backend in /backend:
- Supabase integration using supabase-py
- POST /api/readings endpoint — validate with Pydantic, 
  save all metrics from one ESP32 wake cycle in bulk
- GET endpoints for readings and sensors
- Alert engine: after each POST, check alert rules for 
  that sensor, send email via SendGrid if threshold breached,
  respect 1 hour cooldown between same alert
- .env.example file with all required variables
- README with setup instructions

Do not touch /frontend or /firmware.
Commit after each major piece.
```

---

**Terminal 2 — Frontend Agent**
```
Read CLAUDE.md thoroughly. You are Agent 2 (frontend).

Check if /docs/api-spec.md exists first. If not, wait 
and tell me — do not proceed without it.

Build React dashboard in /frontend:
- Connect directly to Supabase using anon key for reads
- Sensor selector dropdown
- Metric tabs: temperature, humidity, soil moisture, light, CO2
- Recharts line chart with date range picker for each metric
- Alerts panel: view/create/delete alert rules per sensor
- Alert history table
- Auto-refresh every 60 seconds
- .env.example with required variables

Do not touch /backend or /firmware.
Commit after each major piece.
```

---

**Terminal 3 — Firmware Agent**
```
Read CLAUDE.md thoroughly. You are Agent 3 (firmware).

Build ESP32 Arduino firmware in /firmware:

- firmware/combined/combined.ino — main sketch, all sensors
- firmware/temperature_humidity/  — DHT22 only
- firmware/soil_moisture/         — analog moisture only  
- firmware/light/                 — BH1750 only
- firmware/co2/                   — MH-Z19 only
- firmware/config.h.example       — WiFi, API endpoint, sensor_id, sleep interval

Each sketch must:
- Wake from deep sleep
- Connect WiFi with 10 second timeout (if fail, go back to sleep)
- Read all available sensors
- POST single JSON request to /api/readings with all metrics
- Print to Serial for debugging
- Go back to deep sleep

Combined sketch posts ALL metrics in one request.
Include wiring diagram as comments at top of each file.
Include required libraries in a comment (for Arduino Library Manager).

Do not touch /backend or /frontend.
Commit after each sensor type is done.