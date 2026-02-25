# Smart Garden - Firmware

ESP8266-based firmware for the Smart Garden IoT project. Reads soil moisture (and eventually temperature, humidity, light, CO2) and POSTs data to the backend API.

## Hardware Requirements

- **Microcontroller:** Lolin NodeMCU V3 (ESP8266)
- **Soil Moisture:** Capacitive Soil Moisture Sensor v2.0

### Planned (not yet connected)
- DHT22 (temperature/humidity)
- BH1750 (light)
- MH-Z19 (CO2)

## Wiring

| NodeMCU Pin | Sensor | Wire |
|---|---|---|
| D1 (GPIO5) | Soil Moisture VCC | Red |
| GND | Soil Moisture GND | Black |
| A0 | Soil Moisture AOUT | Yellow |
| D0 (GPIO16) | RST (jumper wire) | Deep sleep wake |

**Important:** The D0-to-RST jumper enables deep sleep wake. Remove it when uploading new firmware (it interferes with serial upload).

## Setup

### 1. Install Arduino IDE and Board Package

Add the ESP8266 boards URL to Arduino IDE preferences:

```
http://arduino.esp8266.com/stable/package_esp8266com_index.json
```

Then install **esp8266 by ESP8266 Community** via Boards Manager.

Select board: **NodeMCU 1.0 (ESP-12E Module)**

### 2. Install Required Libraries

In Arduino IDE, go to **Sketch > Include Library > Manage Libraries** and install:

| Library | Author |
|---|---|
| NTPClient | Fabrice Weinberg |
| ArduinoJson | Benoit Blanchon (v7+) |

Or via Arduino CLI:

```bash
arduino-cli lib install "NTPClient"
arduino-cli lib install "ArduinoJson"
```

### 3. Configure

Copy `config.h.example` to `config.h` in the sketch subdirectory you plan to flash:

```bash
cp soil_moisture/config.h.example soil_moisture/config.h
# or
cp combined/config.h.example combined/config.h
```

Edit the new `config.h` with your WiFi credentials, API endpoint, sensor UUID, and sleep interval.

Note: Arduino's build system requires `config.h` in the same directory as the `.ino` file. All `config.h` files are gitignored.

### 4. Flash

1. **Remove the D0-to-RST jumper** before uploading
2. Connect NodeMCU via USB
3. Select the correct port in Arduino IDE
4. Upload `soil_moisture/soil_moisture.ino` (single sensor) or `combined/combined.ino` (multi-sensor)
5. **Reconnect the D0-to-RST jumper** after upload for deep sleep to work

## Sketches

- **`soil_moisture/`** - Soil moisture only. Simple, production-ready.
- **`combined/`** - All sensors in one sketch. Soil moisture active, others are commented stubs ready to enable.

## Power Strategy

The firmware uses deep sleep between readings (default: 5 minutes). Each wake cycle:

1. Connect WiFi (10s timeout)
2. Sync time via NTP
3. Read sensors
4. POST readings to API
5. Deep sleep

If WiFi fails, the device skips the reading and goes back to sleep to conserve battery.
