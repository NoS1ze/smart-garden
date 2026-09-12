# Battery Drain Investigation

> **2026-09-12 update — read this first.** The daily-batching firmware shipped and
> worked exactly as designed, but it did **not** visibly extend battery life on the
> DIY MORE boards. The analysis below the divider is the original (pre-batching)
> investigation and its power-budget estimates; several of those estimates turned
> out not to hold in the field. See **"Field results"** immediately below.

---

## Field results: daily batching on DIY MORE (2026-09-03 → 2026-09-10)

Four DIY MORE ESP32 boards ran the daily-batching firmware for a week, then all
went silent within ~1.5 days of each other.

**The firmware did what it was supposed to.** Evidence:
- Reading timestamps are exactly `3600.000000s` apart — the arithmetic back-dating
  from the RTC buffer, not per-wake NTP. Confirms readings came from the buffer.
- nginx access log shows **exactly 4 POSTs/day** (one per board) for Sep 4–8,
  down from 24/board/day. WiFi on-time genuinely fell ~24×.
- Daily batch boundaries visible in the data, with ~0.7%/day RTC drift (each batch
  lands ~10 min earlier than the last) — expected, harmless.

**But battery life did not improve: ~7 days, same as before.**

### Why the "before" comparison is unreliable

Initial read of the reading-gap history suggested runs of 5–16 days on the old
hourly firmware. That comparison does **not** hold up: the gap boundaries are
*synchronised across all four boards*.

- All four stopped within ~19h of each other around 04-07/04-08
- All four resumed at **04-17 11:49, to the same minute**
- All four stopped again ~04-24, resumed 09-03

Batteries do not die in lockstep and certainly do not come back to life
simultaneously. Those gaps are outages, bulk recharges, or the project being
shelved — not battery exhaustion. So the historical "16 day run" is a *lower
bound* interrupted by something else, not a measured battery life.

The Sep 3–10 run has the same ambiguity: three boards stopped within 25 minutes
of each other, which is equally consistent with a common-mode event.

### Confounder: the cells were old

`battery_changes` shows the last logged battery change on all four boards was
**2026-03-17** — six months prior, including a 4-month shelf period (04-24 →
09-03). If they weren't topped up before redeployment they started that week
already depleted and degraded, which alone accounts for 7 days.

### What this means

- WiFi was **not** the dominant consumer on DIY MORE boards. At ~7 days on a
  ~2000mAh cell the average draw is ~11.5 mA; hourly POSTs only accounted for
  roughly 8 mAh/day (~3% of budget). Removing 23 of 24 uploads saves ~6.6 mAh/day
  — moving battery life from ~7.0 to ~7.2 days. Invisible, as observed.
- The remaining ~11.5 mA constant draw is **hardware**, not firmware:
  - AMS1117 LDO quiescent: 5–10 mA
  - Onboard power LED: 2–5 mA
  - Onboard sensors, if hardwired to VCC rather than gated: ~5 mA
    (the `board_types` note says "Sensors hardwired to VCC (always on)", which
    contradicts the firmware's GPIO26 gating — **user rewired these off 3V3**)
- **No conclusion is possible without a multimeter.** All further log archaeology
  is inference around one unmeasured number.

### Outstanding: the measurement that settles it

Multimeter in series with the cell, board in deep sleep, **USB disconnected**
(USB powers the CH340/LED off VBUS and back-feeds the rail):

- **~10 mA** → LDO + LED dominate; firmware is irrelevant, do the hardware mod
- **~200 µA** → firmware is already good and the 7 days were just tired cells

Gotchas: measure during the sleep window, not the ~2s wake. A cheap DMM's µA-range
burden voltage can brown the board out on wake — if it resets only when metered,
that's the meter. On DIY MORE measure at the cell so the onboard charge circuit is
inside the measurement.

Best comparison available: measure a NodeMCU (MCP1700) and a DIY MORE side by side.

### Hardware fixes, in order of expected impact

1. Bypass the onboard AMS1117 — feed 3.3V from an MCP1700 straight to the 3V3 pin,
   the same mod already done on the NodeMCU. **Caveat:** on the NodeMCU the LED and
   CH340 sit on the VIN/5V rail so that mod bypassed them too; on DIY MORE they may
   sit on the 3.3V rail, in which case this alone won't remove them.
2. Remove the power LED (desolder, or cut its series resistor).
3. Verify GPIO26 actually gates the sensors (toggle it and watch the current).

Realistic ceiling for DIY MORE even fully modded: weeks, not the NodeMCU's
60–90 days. The all-in-one board design fights low-power operation.

### Firmware changes made in response (fw 2.1.0)

Not battery fixes — robustness and diagnosability:
- **Cold-boot immediate upload.** A reconnected board used to report nothing for
  24h, making a battery swap indistinguishable from a dead board. Now it uploads
  on the first wake after power-on, then resumes daily batching.
- **Exponential upload backoff.** A failed upload used to retry every wake (24
  connect attempts/day, worse than the hourly firmware it replaced). Now backs off
  2/4/8 wakes, and drops the batch after 4 consecutive failures so a stuck buffer
  can't block new readings forever.
- **ESP8266 `RF_DISABLED` on non-upload wakes.** The ESP8266 powers its radio at
  boot on *every* wake by default, even when the sketch never touches WiFi. Only
  the upload wake now sleeps with `RF_DEFAULT`. This is a genuine saving on the
  NodeMCU boards and was missing from the original batching work.
- **ESP32 GPIO hold in deep sleep.** ESP32 GPIOs float in deep sleep, so a gated
  sensor's VCC could still be phantom-powered through its signal pin's ESD diodes.
  Power pins are now held low for the whole sleep. Relevant now that the sensors
  have been rewired off the always-on 3V3 rail.
- **Firmware version reporting.** Every upload carries `fw_version`, stored on
  `sensors.firmware_version` with changeovers logged to `firmware_history`, so
  behaviour can be attributed to a specific build from here on.

---

# Original investigation (pre-batching) — NodeMCU V3 (Ms Green)

## Context

**Board:** NodeMCU V3 + HTU21D + BH1750 (slug: `nodemcu_htu21d_bh1750`)
**MAC:** `8C:CE:4E:CE:66:15` (UUID: `cd4d94f1-7ab2-42be-8b42-063aea049f49`)
**Plant:** Ms Green
**Power:** 18650 → MCP1700 LDO → NodeMCU 3.3V pin (bypasses onboard AMS1117)

---

## Observed vs Expected Battery Life

| | Value |
|---|---|
| Last active run | 2026-04-02 23:34 UTC → 2026-04-17 06:44 UTC |
| Duration | ~14 days 7 hours |
| Battery at end | 3.642V ≈ **40% remaining** (60% used) |
| Expected total runtime (CLAUDE.md) | **60–90 days** |
| Implied actual total runtime | **~23 days** |
| Discrepancy | **3–4× worse than expected** |

Sensor stopped transmitting on 2026-04-17 after morning watering (likely water ingress or
loose connector). Last soil reading jumped from ~562 → 268 (very wet) and then silence.

---

## Key Findings

### 1. CH340G and Power LED — NOT a drain source (confirmed)
- CH340G is powered from USB VBUS (5V), not the 3.3V rail
- Power LED is also on the VIN/5V rail
- When powered via MCP1700 → 3.3V pin with no USB connected, neither draws current
- Confirmed by user: no LEDs visible during battery-only operation
- Deep sleep current is genuinely close to designed ~22µA (ESP8266 ~20µA + MCP1700 ~1.6µA)

### 2. BearSSL TLS Handshake — primary suspected drain source
- Back-calculating from observed drain: active phase must average **~49 seconds per wake**
- `http.setTimeout(10000)` in firmware only caps the HTTP *response* timeout
- It does **NOT** cap the BearSSL TLS handshake duration
- ESP8266 BearSSL TLS 1.2 handshake is CPU-intensive and can take 20–50 seconds
  depending on server certificate chain and server response time
- 24 wakes/day × 49s × 130mA = ~42 mAh/day active (vs expected ~13 mAh/day at 15s/wake)
- **This alone explains the 3× discrepancy**

### 3. HTU21D returning CRC errors (humidity = 999)
- SparkFun HTU21D library returns `ERROR_BAD_CRC = 999` on checksum failure
- DB shows `humidity = 999` consistently for weeks — sensor has been faulty for a long time
- Current firmware (`soil_moisture.ino`) has a range guard that filters it out:
  ```cpp
  if (!isnan(humidity) && humidity >= 0.0 && humidity <= 100.0)
  ```
- But 999 is in the DB → **board is running an older firmware version** without this guard
- Temperature metric is also absent from readings — HTU21D fully non-functional
- Faulty I2C may add blocking read time to each wake cycle

### 4. Soil sensor powered too early (minor)
- `digitalWrite(SENSOR_POWER_PIN, HIGH)` is called at the very start of `setup()`
- Sensor stays powered through entire WiFi connect + NTP sync (5–15s extra)
- Only powers off after WiFi done — sensor draws ~5mA during this unnecessary window
- Comment says "100ms warm-up" but sensor is on for 10–20× longer than needed

### 5. BH1750 triggered twice per wake (minor)
- `lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE)` on line 97 triggers measurement #1
- `lightMeter.configure(BH1750::ONE_TIME_HIGH_RES_MODE)` on line 102 triggers measurement #2
- Second call is redundant — `begin()` already configures and starts the measurement

---

## Power Budget Analysis

### Current state (hourly POST, no hardware mods)
| Phase | Calculation | mAh/day |
|-------|-------------|---------|
| Deep sleep | 23.9h × 0.022mA | 0.53 |
| Active (24 wakes × ~49s × 130mA) | observed back-calc | ~42 |
| **Total** | | **~42.5 mAh/day → ~23 days** |

### After firmware fixes only (TLS timeout + optimisations)
| Phase | Calculation | mAh/day |
|-------|-------------|---------|
| Deep sleep | 23.9h × 0.022mA | 0.53 |
| Active (24 wakes × ~15s × 130mA) | with TLS capped | ~13 |
| **Total** | | **~13.5 mAh/day → ~60 days** |

### After firmware fixes + daily batching
| Phase | Calculation | mAh/day |
|-------|-------------|---------|
| Deep sleep | 23.9h × 0.022mA | 0.53 |
| 23 sensor-only wakes (no WiFi, ~3s × 30mA) | | 0.58 |
| 1 WiFi wake + batch POST (~20s) | | 0.72 |
| **Total** | | **~1.83 mAh/day → ~450 days** |

### After firmware fixes + daily batching + desolder CH340G/LED
- No additional gain (CH340G/LED already confirmed not drawing from battery circuit)
- Same ~450 days

---

## TODO List

### Priority 1 — Diagnose (before any code changes)
- [ ] **Attach serial monitor on next wake** — check timestamps between each log line
  - Look for: how long WiFi connect takes, how long BearSSL handshake takes, total active time
  - Board must be awake to connect — hold FLASH + press RST, then release FLASH
  - Port: check `ls /dev/cu.wch*`
  - Command: `arduino-cli monitor --port /dev/cu.wchusbserial110 --config baudrate=115200`

### Priority 2 — Firmware fixes (high impact)
- [ ] **Cap BearSSL TLS handshake timeout**
  ```cpp
  // Add before http.begin():
  client.setBufferSizes(512, 512);  // reduces heap, speeds up handshake
  client.setTimeout(15000);
  ```
- [ ] **Fix soil sensor power-on timing** — move `digitalWrite(SENSOR_POWER_PIN, HIGH)`
  to just before `analogRead`, not at the top of `setup()`
- [ ] **Remove redundant BH1750 configure()** — delete line 102:
  ```cpp
  lightMeter.configure(BH1750::ONE_TIME_HIGH_RES_MODE);  // remove this
  ```
- [ ] **Reflash with current firmware** — board is running an old version (humidity=999 in DB
  means the range guard isn't present). After fixing above issues, compile and flash.

### Priority 3 — Fix HTU21D sensor
- [ ] **Check D5/D6 wiring** — HTU21D on SCL=D5(GPIO14), SDA=D6(GPIO12)
  - Reseat connectors, check for corrosion or water damage from watering incidents
  - Verify 3V3 → HTU21D VCC is solid
- [ ] **Test I2C with a scanner sketch** before reflashing production firmware
  - Scan should find HTU21D at 0x40 and BH1750 at 0x23

### Priority 4 — Daily batching (implement after firmware is stable)
- [ ] Implement RTC memory buffer for 24 readings
  - ESP8266 has 512 bytes RTC user memory (survives deep sleep, lost on power-off)
  - 24 readings × 20 bytes (4 floats + 1 uint32 timestamp) = 480 bytes
  - Include CRC32 (4 bytes) + count (1 byte) = 485 bytes total — fits in 512 bytes
  - On cold boot (bad CRC): initialise count = 0, proceed normally
  - On normal wake: read RTC, store reading, increment count
  - When count == 24: connect WiFi, POST batch, reset count
- [ ] Modify backend `POST /api/readings` to accept array of `recorded_at` timestamps
  (currently all readings in one POST share a single `recorded_at`)

### Priority 5 — Hardware (optional, low priority)
- [ ] **Consider CP2102 programmer** (~$2) as replacement for USB flashing
  if CH340G ever needs to be removed for other reasons
- [ ] **Water-proof the enclosure** — sensor stopped after watering event on 2026-04-17;
  soil sensor connector and board need protection from direct water contact

---

## Notes on RTC Memory Implementation

```cpp
#include <ESP.h>

struct Reading {
  float soil_moisture;
  float temperature;
  float humidity;
  float light_lux;
  uint32_t recorded_at;
};  // 20 bytes

struct RTCData {
  uint32_t crc32;       // 4 bytes
  uint8_t  count;       // 1 byte
  uint8_t  _pad[3];     // padding to align readings
  Reading  readings[24]; // 480 bytes
};  // 488 bytes — fits in 512 bytes

// Read from RTC:
ESP.rtcUserMemoryRead(0, (uint32_t*)&rtcData, sizeof(RTCData));

// Write to RTC:
ESP.rtcUserMemoryWrite(0, (uint32_t*)&rtcData, sizeof(RTCData));
```

Data survives deep sleep (GPIO16→RST wake) but is lost on full power-off/battery swap.
Maximum data loss on battery death: 23 readings (one day's worth).

---

## Battery Life Summary Table

| Scenario | Daily draw | Runtime |
|----------|-----------|---------|
| Current (old firmware, TLS slow) | ~42.5 mAh | ~23 days |
| Firmware fixes only | ~13.5 mAh | ~60 days |
| Firmware fixes + daily batch | ~1.83 mAh | ~450 days |

*Assumes ~1000mAh battery capacity (back-calculated from CLAUDE.md 60-day estimate).*
