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

- **Sensor 1: Capacitive Soil Moisture Sensor v2.0** (analog)
  - VCC (red) → D5 (GPIO14, power pin — allows turning sensor off between readings)
  - GND (black) → G
  - AOUT (yellow) → A0
  - Returns analog value: ~800+ = dry, ~400 = wet (calibrate per sensor)
  - Powered via D5 to save power — turn on, wait 100ms, read, turn off

- **Sensor 2: CJMCU-8118 board — HDC1080 temperature/humidity** (I2C)
  - VCC → 3V3 (no onboard regulator — must be 3.3V)
  - GND → G
  - SDA → D2 (GPIO4)
  - SCL → D1 (GPIO5)
  - WAK → G (tie low)
  - HDC1080 at I2C address 0x40 — provides temperature (°C) and humidity (%)
  - CCS811 (eCO2/TVOC) on same board is defective/non-responsive — not used

### Planned Sensors (not yet connected)
- Light (BH1750, I2C — can share D1/D2 bus)
- CO2 (standalone CCS811 breakout or MH-Z19 to replace defective onboard CCS811)

### Power Notes
- NodeMCU V3 deep sleep: GPIO16 must be jumpered to RST
- ESP8266 only has 1 analog pin (A0) — future sensors should be digital/I2C
- D5 used as power switch for moisture sensor to reduce corrosion and save power
- D1/D2 used for I2C bus (SCL/SDA) — shared by HDC1080 and future I2C sensors
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
- Send raw ADC value (no percentage conversion — frontend handles calibration via soil types)
- POST JSON to /api/readings:
  {"mac": "XX:XX:XX:XX:XX:XX", "readings": [{"metric": "soil_moisture", "value": 652}], "recorded_at": <unix epoch>}
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
- mac_address (text, unique, not null) — immutable hardware identifier from ESP8266 WiFi.macAddress()
- display_name (text, nullable) — user-settable friendly name; frontend shows this, falls back to mac_address
- location (text)
- created_at (timestamp)

Table: `readings`
- id (uuid, primary key)
- sensor_id (uuid, foreign key → sensors.id)
- metric (text) — temperature, humidity, soil_moisture, light_lux, co2_ppm
- value (float) — for soil_moisture: raw ADC value 0-1023 (frontend converts to % using soil type calibration)
- recorded_at (timestamp) — set by ESP8266, UTC Unix epoch converted to timestamp

Table: `alerts`
- id (uuid, primary key)
- sensor_id (uuid, foreign key → sensors.id)
- metric (text)
- condition (text) — "below" or "above"
- threshold (float)
- email (text)
- active (boolean)

Table: `alert_history`
- id (uuid, primary key)
- alert_id (uuid, foreign key → alerts.id)
- triggered_at (timestamp)
- value_at_trigger (float)

Table: `soil_types`
- id (uuid, primary key)
- name (text, unique, not null) — e.g. "Sandy Soil", "Clay"
- raw_dry (int, default 800) — raw ADC value when dry
- raw_wet (int, default 400) — raw ADC value when wet
- created_at (timestamp)

Table: `plant_types`
- id (uuid, primary key)
- name (text, unique, not null)
- min_temp (float)
- max_temp (float)
- optimal_min_temp (float)
- optimal_max_temp (float)
- min_humidity (float)
- max_humidity (float)
- optimal_min_humidity (float)
- optimal_max_humidity (float)
- min_moisture (float)
- max_moisture (float)
- optimal_min_moisture (float)
- optimal_max_moisture (float)
- min_light (float)
- max_light (float)
- optimal_min_light (float)
- optimal_max_light (float)
- min_co2 (float)
- max_co2 (float)
- optimal_min_co2 (float)
- optimal_max_co2 (float)
- created_at (timestamp)

Table: `plants`
- id (uuid, primary key)
- name (text, not null)
- plant_type_id (uuid, FK → plant_types.id, ON DELETE SET NULL)
- planted_date (date)
- photo_url (text) — URL to plant image, not binary
- notes (text)
- soil_type_id (uuid, FK → soil_types.id, ON DELETE SET NULL) — calibration profile
- created_at (timestamp)

Table: `sensor_plant` (junction table)
- sensor_id (uuid, foreign key → sensors.id)
- plant_id (uuid, foreign key → plants.id)
- assigned_at (timestamp)
- PRIMARY KEY (sensor_id, plant_id)

## API Endpoints (FastAPI)

### Readings
- `POST /api/readings` — ESP8266 posts data here. Backend looks up sensor by MAC, auto-registers if unknown.
```json
  {
    "mac": "8C:CE:4E:CE:66:15",
    "readings": [
      {"metric": "soil_moisture", "value": 45.0}
    ],
    "recorded_at": 1708789200
  }
```
  Auto-registration: if mac not found in sensors table, create new sensor with mac_address=mac, display_name=null.
  Then insert readings using that sensor's UUID.
- `GET /api/readings?sensor_id=x&from=date&to=date&metric=x&limit=100&offset=0`

### Sensors
- `GET /api/sensors` — list all sensors (returns mac_address, display_name, location)
- `PUT /api/sensors/{sensor_id}` — update display_name and/or location

### Alerts
- `POST /api/alerts` — create alert rule
- `GET /api/alerts?sensor_id=x`
- `DELETE /api/alerts/{alert_id}` — soft-delete (sets active=false); frontend must use this, NOT direct Supabase write

### Soil Types
- `GET /api/soil-types` — list all soil types
- `POST /api/soil-types` — create {name, raw_dry?, raw_wet?}
- `PUT /api/soil-types/{id}` — update name/raw_dry/raw_wet
- `DELETE /api/soil-types/{id}` — delete soil type (plants revert to default calibration)

### Plant Types
- `GET /api/plant-types` — list all plant types
- `POST /api/plant-types` — create {name, ...ranges}
- `PUT /api/plant-types/{id}` — update
- `DELETE /api/plant-types/{id}`

### Plants
- `GET /api/plants` — list all plants with nested sensors, soil_type, and plant_type
- `GET /api/plants/{plant_id}` — single plant with nested sensors, soil_type, and plant_type
- `POST /api/plants` — create plant {name, plant_type_id?, planted_date?, photo_url?, notes?, soil_type_id?}
- `PUT /api/plants/{plant_id}` — update plant fields including soil_type_id and plant_type_id
- `DELETE /api/plants/{plant_id}` — delete plant (cascade deletes sensor_plant associations)
- `POST /api/plants/{plant_id}/sensors` — associate sensor {sensor_id}
- `DELETE /api/plants/{plant_id}/sensors/{sensor_id}` — unassociate sensor

## ESP8266 Power Strategy
- Deep sleep between readings
- On wake cycle:
  1. Connect WiFi (with timeout — give up after 10s to save battery)
  2. Read all sensors
  3. POST to /api/readings with MAC address (single request with all metrics)
  4. Disconnect WiFi
  5. Deep sleep for N seconds
- All readings posted in ONE request per wake cycle (minimizes WiFi on-time)
- MAC address sent with every POST — backend auto-registers unknown boards
- config.h stores: WiFi credentials, API endpoint, sleep interval (NO sensor_id — MAC is used instead)

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
- Always use TeamCreate for multi-step implementation tasks — parallelize independent work across teammates
- Agent 1 (backend): FastAPI app, Supabase integration, alert engine
- Agent 2 (frontend): React dashboard with Recharts
- Agent 3 (firmware): ESP32 Arduino sketches
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

## Soil Type Calibration
- Firmware sends raw ADC values (0-1023) for soil_moisture
- Frontend converts raw → % using `rawToPercent(raw, rawDry, rawWet)` from soil type calibration
- Default calibration: rawDry=800, rawWet=400 (used when no soil type assigned)
- Soil types are CRUD-managed via `/api/soil-types` and associated per-plant
- Alerts: backend converts raw → % using default calibration for threshold comparison
- Data migration: when reflashing firmware, run `UPDATE readings SET value = 800.0 - (value / 100.0) * 400.0 WHERE metric = 'soil_moisture';` to convert existing percentage values to raw

## Current Status
- [x] Supabase project created + schema applied
- [x] Backend API — FastAPI, all endpoints, Pydantic validation, CORS
- [x] Alert engine — cooldown check, SendGrid email, alert_history logging
- [x] ESP8266 firmware — soil_moisture + temp/humidity posting every 5 min (deep sleep)
- [x] Frontend dashboard v1 — sensor-centric, working
- [x] Deployment config — Dockerfile + railway.toml + render.yaml (backend); vercel.json + netlify.toml (frontend)
- [x] Feature: Board rename (MAC-based identification + display_name)
- [x] Feature: Plants system (plants table, sensor_plant junction, CRUD)
- [x] Feature: Plant dashboard (plant cards, detail page, charts)
- [x] Feature: Soil type calibration system (soil_types table, per-plant association, frontend conversion)
- [x] Data migration: convert existing readings percentage→raw
- [x] Firmware reflash: send raw ADC values instead of percentages
- [x] Deployed to AWS Lightsail VPS (18.171.135.9) — nginx + systemd + uvicorn
- [ ] Google Home (future)

## Firmware Deployment
- `arduino-cli` is installed via Homebrew (`/opt/homebrew/bin/arduino-cli`)
- Board: NodeMCU V3 on `/dev/cu.wchusbserial10` (CH340 USB-serial)
- ESP8266 core `esp8266:esp8266` v3.1.2 installed
- FQBN: `esp8266:esp8266:nodemcuv2`
- Firmware source: `firmware/soil_moisture/` (in this repo)
- `config.h` lives in the sketch directory (gitignored) — contains WiFi creds, API endpoint, OTA password
- Compile: `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 /path/to/soil_moisture`
- Upload: `arduino-cli upload --fqbn esp8266:esp8266:nodemcuv2 --port /dev/cu.wchusbserial10 /path/to/soil_moisture`
- Board must be awake to flash — hold FLASH + press RST, then release FLASH to enter bootloader
- OTA updates also supported (10s window after each wake) — password in config.h

## Notes
- Existing sensor MAC: 8C:CE:4E:CE:66:15 (UUID: cd4d94f1-7ab2-42be-8b42-063aea049f49)
- Supabase project ref: snmhepqybhjuzoavefyr
- Alert deletion uses DELETE /api/alerts/{id} — frontend calls backend, NOT Supabase directly
- POST /api/readings now uses "mac" field instead of "sensor_id" — breaking change, firmware already reflashed

## VPS Deployment (AWS Lightsail)
- **Server**: 18.171.135.9 (Ubuntu 22.04, eu-west-2)
- **SSH**: `ssh -i ~/.ssh/lightsail-eu-west-2.pem ubuntu@18.171.135.9`
- **Deploy script**: `./deploy-server.sh` (run from project root on Mac)
- **Frontend**: http://18.171.135.9/ — nginx serves static build from `/opt/smart-garden/frontend/dist`
- **Backend API**: http://18.171.135.9/api/ — nginx reverse proxy to uvicorn on 127.0.0.1:8000
- **systemd service**: `smart-garden` — auto-restarts, env from `/opt/smart-garden/backend/.env`
- **VITE_API_URL**: must be `http://18.171.135.9` (no `/api` suffix — code already prepends `/api/`)