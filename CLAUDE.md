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

### Board 1: NodeMCU V3 (ESP8266) — "NodeMCU"
- **MCU**: ESP8266 (Lolin NodeMCU V3), 80MHz, WiFi only
- **MAC**: 8C:CE:4E:CE:66:15
- **USB**: CH340 on `/dev/cu.wchusbserial10`
- **FQBN**: `esp8266:esp8266:nodemcuv2`
- **Firmware**: `firmware/combined/combined.ino` (also `firmware/soil_moisture/`)
- **Sleep interval**: 5 minutes
- **ADC**: 10-bit (0-1023), single pin A0
- **Deep sleep**: GPIO16 jumpered to RST

**Sensors:**
- Capacitive Soil Moisture v2.0: A0 (analog), powered via D1 (GPIO5) — turn on, wait 100ms, read, turn off
  - Raw calibration: ~800 = dry, ~400 = wet
- CJMCU-8118 / HDC1080: I2C on D1/D2 (SCL=GPIO5, SDA=GPIO4) — temperature + humidity
  - CCS811 on same board is defective — not used

**Power notes:**
- AMS1117 regulator draws ~5-10mA quiescent even during deep sleep
- Estimated 18650 runtime: ~10 days (dominated by regulator quiescent current)

### Board 2: DIY MORE ESP32 — "DIY MORE"
Monolith prebuilt boards — soil moisture sensor + DHT11 hardwired on PCB.
Multiple board revisions exist with different chip revisions and soil pin assignments:

| Board | MAC | MCU | Chip Rev | USB |
|-------|-----|-----|----------|-----|
| DIY MORE #1 (original) | 08:B6:1F:8E:C7:E0 | ESP32-D0WDQ6 | v1.0 | CH340 |
| DIY MORE #2 | 34:98:7A:BC:3B:BC | ESP32-D0WDQ6 | v1.1 | CH340 |
| DIY MORE #3 | 7C:9E:BD:F2:5F:54 | ESP32-D0WDQ6 | v1.0 | CH340 |
| DIY MORE #4 | 10:06:1C:B5:80:18 | ESP32-D0WD-V3 | v3.1 | CH340 |

- **USB**: CH340 on `/dev/cu.usbserial-0001` (some boards have flaky CH340 — may not enumerate)
- **FQBN**: `esp32:esp32:esp32`
- **Firmware**: `firmware/diymore/diymore.ino`
- **Sleep interval**: 1 hour
- **ADC**: 12-bit (0-4095), explicit `analogSetPinAttenuation(pin, ADC_11db)` + `analogReadResolution(12)`
- **Deep sleep**: Internal RTC timer (no external wiring)
- **Battery**: Built-in 18650 holder

**Sensors (hardwired to VCC on PCB — cannot be powered off via GPIO):**
- DHT11: GPIO22 — temperature + humidity
- Capacitive Soil Moisture: **GPIO32 or GPIO33** — varies by board revision
  - 08:B6 (rev v1.0): GPIO33 | all others tested: GPIO32
  - Firmware auto-detects by reading both pins, using the higher value
  - Raw calibration: ~3430 = dry (air), ~1360 = wet (submerged)
  - Tested across 3 boards: air range 3387-3457, water range 1276-1502
  - Firmware averages 10 samples with 10ms delay for stability

**Power notes:**
- Sensors always on (~3mA constant drain during deep sleep)
- Estimated 18650 runtime: ~30-35 days (1hr interval, sensors always powered)

### Board 3: NodeMCU V3 (ESP8266) + ENS160/AHT21 — "NodeMCU ENS160"
- **MCU**: ESP8266 (Lolin NodeMCU V3), 80MHz, WiFi only
- **MAC**: 18:FE:34:FB:CF:70
- **USB**: CH340 on `/dev/cu.wchusbserial110`
- **FQBN**: `esp8266:esp8266:nodemcuv2`
- **Firmware**: `firmware/nodemcu_bme680/nodemcu_bme680.ino`
- **Sleep interval**: 1 hour
- **ADC**: 10-bit (0-1023), single pin A0
- **Deep sleep**: GPIO16 jumpered to RST

**Sensors:**
- ENS160: I2C on D1/D2 (SCL=GPIO5, SDA=GPIO4), address 0x52 — eCO2 (ppm) + TVOC (ppb)
- AHT21: I2C on D1/D2, address 0x38 — temperature + humidity
- Capacitive Soil Moisture v2.0: A0 (analog), powered via D5 (GPIO14) — turn on, wait 100ms, read, turn off
  - Raw calibration: ~800 = dry, ~400 = wet

**Wiring:**
```
NodeMCU V3          ENS160+AHT21 Breakout
---------           ---------------------
3V3         ------> VIN
GND         ------> GND
D1 (GPIO5)  ------> SCL
D2 (GPIO4)  ------> SDA

NodeMCU V3          Capacitive Soil Moisture v2.0
---------           -----------------------------
D5 (GPIO14) ------> VCC (power control)
GND         ------> GND
A0          ------> AOUT (analog signal)

Deep sleep: D0 (GPIO16) → RST
Power: 18650 battery → VIN + GND
```

### Planned Sensors (not yet connected)
- Light (BH1750, I2C — can share D1/D2 bus)
- CO2 (standalone CCS811 breakout or MH-Z19 to replace defective onboard CCS811)

---

## Firmware

All boards follow the same wake cycle:
1. Wake from deep sleep → connect WiFi (timeout: 10-15s) → sync NTP → read sensors
2. POST JSON to `/api/readings`: `{"mac": "XX:XX:...", "readings": [...], "recorded_at": <epoch>}`
3. Disconnect WiFi → deep sleep for N seconds (from `config.h`)

Firmware sends raw ADC values for soil_moisture — frontend handles calibration via soil types.

| Board | Sketch | ADC range | Sleep | board_type slug |
|-------|--------|-----------|-------|-----------------|
| NodeMCU + HDC1080 | `firmware/soil_moisture/` | 0-1023 (10-bit) | 1 hour | `nodemcu_hdc1080` |
| DIY MORE + DHT11 | `firmware/diymore/` | 0-4095 (12-bit) | 1 hour | `diymore_dht11` |
| NodeMCU + ENS160/AHT21 | `firmware/nodemcu_bme680/` | 0-1023 (10-bit) | 1 hour | `nodemcu_ens160_aht21` |

Each sketch directory has its own `config.h` (gitignored) and `config.h.example`.

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

Table: `board_types`
- id (uuid, primary key)
- name (text, unique, not null) — e.g. "NodeMCU V3 + HDC1080"
- slug (text, unique, not null) — firmware sends this in POST payload, e.g. "nodemcu_hdc1080"
- mcu (text, not null) — e.g. "ESP8266", "ESP32-D0WDQ6"
- fqbn (text) — Arduino CLI board identifier
- adc_bits (smallint, default 10)
- sleep_seconds (int, default 300)
- sensors (jsonb, default '[]') — array of sensor chip info objects
- notes (text)
- created_at (timestamptz)

JSONB `sensors` format per chip:
```json
{"chip": "BME680", "interface": "i2c", "address": "0x76", "pins": "D1/D2", "metrics": ["temperature", "humidity", "pressure_hpa"]}
```

Table: `sensors`
- id (uuid, primary key)
- mac_address (text, unique, not null) — immutable hardware identifier from ESP8266 WiFi.macAddress()
- display_name (text, nullable) — user-settable friendly name; frontend shows this, falls back to mac_address
- location (text)
- board_type_id (uuid, FK → board_types.id, ON DELETE SET NULL) — auto-set from firmware `board_type` slug
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
- `POST /api/readings` — ESP posts data here. Backend looks up sensor by MAC, auto-registers if unknown. Sets `board_type_id` from slug.
```json
  {
    "mac": "8C:CE:4E:CE:66:15",
    "readings": [
      {"metric": "soil_moisture", "value": 665},
      {"metric": "temperature", "value": 22.3},
      {"metric": "humidity", "value": 48.1}
    ],
    "recorded_at": 1708789200,
    "adc_bits": 10,
    "board_type": "nodemcu_hdc1080"
  }
```
  Auto-registration: if mac not found in sensors table, create new sensor with mac_address=mac, display_name=null.
  Then insert readings using that sensor's UUID.
  Metrics: soil_moisture, temperature, humidity, co2_ppm, tvoc_ppb, pressure_hpa, light_lux
- `GET /api/readings?sensor_id=x&from=date&to=date&metric=x&limit=100&offset=0`

### Board Types
- `GET /api/board-types` — list all board types with JSONB sensor metadata
- `POST /api/board-types` — create board type {name, slug, mcu, fqbn?, adc_bits?, sleep_seconds?, sensors?, notes?}
- `PUT /api/board-types/{id}` — update board type
- `DELETE /api/board-types/{id}` — delete board type (sensors revert to null)

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

## Power Strategy
- All boards deep sleep between readings
- Wake cycle: WiFi connect → NTP sync → sensor read → HTTP POST → sleep
- All readings posted in ONE request per wake cycle (minimizes WiFi on-time)
- MAC address sent with every POST — backend auto-registers unknown boards
- `config.h` stores: WiFi credentials, API endpoint, sleep interval (NO sensor_id — MAC is used instead)
- NodeMCU: sensor powered off between readings (D1 pin), 5 min cycle
- DIY MORE: sensors hardwired to VCC (always on), 1 hour cycle

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
- Frontend uses CSS custom properties for all colors (dark/light theme support)
- Frontend: use `cssVar(name, fallback)` helper for inline styles that need theme colors (e.g. Recharts)
- Frontend: metric icons in `Icons.tsx` — use `<MetricIcon metric={key} size={n} />`, not inline SVGs
- Frontend: delete actions use inline Confirm/Cancel buttons, never `confirm()` or `alert()`

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
- Firmware sends raw ADC values + `adc_bits` (10 or 12) in POST payload
- `sensors` table has `adc_bits` column (10 or 12), auto-set from firmware payload
- `soil_types` table stores dual calibration: `raw_dry`/`raw_wet` (10-bit) and `raw_dry_12bit`/`raw_wet_12bit` (12-bit)
- Default 10-bit: rawDry=800, rawWet=400 | Default 12-bit: rawDry=3430, rawWet=1360
- Frontend `getCalibration(soilType, adcBits)` picks the correct pair based on sensor's `adc_bits`
- Alerts: backend looks up sensor's `adc_bits` + plant's soil type for correct calibration

## Current Status
- [x] Supabase project created + schema applied
- [x] Backend API — FastAPI, all endpoints, Pydantic validation, CORS
- [x] Alert engine — cooldown check, SendGrid email, alert_history logging
- [x] ESP8266 firmware — soil_moisture + temp/humidity posting every 5 min (deep sleep)
- [x] ESP32 DIY MORE firmware — soil_moisture + temp/humidity posting every 1 hour (deep sleep)
- [x] NodeMCU ENS160/AHT21 firmware — soil_moisture + temp/humidity + eCO2/TVOC posting every 1 hour (deep sleep)
- [x] Board types system — board_types table with JSONB sensor metadata, CRUD API, frontend display
- [x] Frontend dashboard v1 — sensor-centric, working
- [x] Deployment config — Dockerfile + railway.toml + render.yaml (backend); vercel.json + netlify.toml (frontend)
- [x] Feature: Board rename (MAC-based identification + display_name)
- [x] Feature: Plants system (plants table, sensor_plant junction, CRUD)
- [x] Feature: Plant dashboard (plant cards, detail page, charts)
- [x] Feature: Soil type calibration system (soil_types table, per-plant association, frontend conversion)
- [x] Data migration: convert existing readings percentage→raw
- [x] Firmware reflash: send raw ADC values instead of percentages
- [x] Deployed to AWS Lightsail VPS (18.171.135.9) — nginx + systemd + uvicorn
- [x] HTTPS support — DuckDNS + Let's Encrypt + certbot, firmware updated for WiFiClientSecure
- [x] DIY MORE firmware: auto-detect soil pin (GPIO32 vs GPIO33) — reads both, uses higher value
- [x] UI/UX overhaul (5 rounds) — minimalistic design, CSS variables for theming, metric icons, section-card layout
- [x] Frontend: metric tiles with inline trend sparklines (replaced standalone Trends section)
- [x] Frontend: ZonedGradientBar with single-hue opacity stages (replaced multi-color gradient)
- [x] Frontend: inline confirm/cancel for all delete actions (replaced browser confirm() dialogs)
- [x] Frontend: theme-aware charts and components (dark/light mode via CSS custom properties)
- [x] Frontend: staleness thresholds adjusted to 75min/180min (covers 1hr sleep interval)
- [ ] Google Home (future)

## Firmware Deployment
- `arduino-cli` is installed via Homebrew (`/opt/homebrew/bin/arduino-cli`)
- Cores installed: `esp8266:esp8266` v3.1.2, `esp32:esp32` v3.0.7
- `config.h` lives in each sketch directory (gitignored) — contains WiFi creds, API endpoint, sleep interval

### NodeMCU (ESP8266)
- Port: `/dev/cu.wchusbserial10`
- FQBN: `esp8266:esp8266:nodemcuv2`
- Compile: `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 firmware/soil_moisture`
- Upload: `arduino-cli upload --fqbn esp8266:esp8266:nodemcuv2 --port /dev/cu.wchusbserial10 firmware/soil_moisture`
- Board must be awake to flash — hold FLASH + press RST, then release FLASH

### NodeMCU + ENS160/AHT21 (ESP8266)
- Port: `/dev/cu.wchusbserial110`
- FQBN: `esp8266:esp8266:nodemcuv2`
- Compile: `arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 firmware/nodemcu_bme680`
- Upload: `arduino-cli upload --fqbn esp8266:esp8266:nodemcuv2 --port /dev/cu.wchusbserial110 firmware/nodemcu_bme680`
- Board must be awake to flash — hold FLASH + press RST, then release FLASH
- Libraries: NTPClient, ArduinoJson v7, Adafruit AHTX0, ScioSense_ENS16x

### DIY MORE (ESP32)
- Port: `/dev/cu.usbserial-0001`
- FQBN: `esp32:esp32:esp32`
- Compile: `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/diymore`
- Upload: `arduino-cli upload --fqbn esp32:esp32:esp32 --port /dev/cu.usbserial-0001 firmware/diymore`
- Hold BOOT button while uploading if auto-reset doesn't work

## HTTPS Setup
- **Domain**: DuckDNS subdomain (e.g., smartgarden.duckdns.org)
- **SSL**: Let's Encrypt via certbot with nginx plugin
- **Auto-renewal**: certbot.timer systemd service
- **Deploy**: set `DOMAIN` env var before running deploy-server.sh (defaults to `smartgarden.duckdns.org`)
- **DuckDNS cron**: set `DUCKDNS_TOKEN` env var to enable automatic IP updates every 5 min
- **Firmware**: uses WiFiClientSecure with setInsecure() for HTTPS (skips cert validation — acceptable for IoT)
- **ESP8266**: BearSSL::WiFiClientSecure (from WiFiClientSecureBearSSL.h)
- **ESP32**: WiFiClientSecure (from WiFiClientSecure.h)

## Notes
- NodeMCU sensor MAC: 8C:CE:4E:CE:66:15 (UUID: cd4d94f1-7ab2-42be-8b42-063aea049f49)
- DIY MORE sensor MAC: 08:B6:1F:8E:C7:E0 (auto-registers on first POST)
- Supabase project ref: snmhepqybhjuzoavefyr
- Alert deletion uses DELETE /api/alerts/{id} — frontend calls backend, NOT Supabase directly
- POST /api/readings now uses "mac" field instead of "sensor_id" — breaking change, firmware already reflashed

## VPS Deployment (AWS Lightsail)
- **Server**: 18.171.135.9 (Ubuntu 22.04, eu-west-2)
- **SSH**: `ssh -i ~/.ssh/lightsail-eu-west-2.pem ubuntu@18.171.135.9`
- **Deploy script**: `./deploy-server.sh` (run from project root on Mac)
- **HTTPS deploy**: `DOMAIN=smartgarden.duckdns.org ./deploy-server.sh` (certbot auto-provisions SSL)
- **Frontend**: https://smartgarden.duckdns.org/ — nginx serves static build from `/opt/smart-garden/frontend/dist`
- **Backend API**: https://smartgarden.duckdns.org/api/ — nginx reverse proxy to uvicorn on 127.0.0.1:8000
- **systemd service**: `smart-garden` — auto-restarts, env from `/opt/smart-garden/backend/.env`
- **VITE_API_URL**: set automatically by deploy script to `https://$DOMAIN` (no `/api` suffix — code already prepends `/api/`)