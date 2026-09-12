/*
 * Smart Garden - DIY MORE ESP32 Sensor Board
 * Board: ESP32-D0WDQ6 (DIY MORE prebuilt board with 18650 holder)
 *
 * Battery optimization: sensors are still read every SLEEP_SECONDS (hourly),
 * but readings are buffered in RTC slow memory (survives deep sleep, zeroed
 * on power-on/brownout) and only flushed once the buffer fills (~once a
 * day). WiFi connect + NTP sync + TLS handshake — the dominant battery cost
 * per wake — happens on 1 wake out of READINGS_PER_BATCH instead of every wake.
 *
 * ============================================
 * WIRING
 * ============================================
 *
 * ESP32                DHT11 (temperature + humidity)
 * ------               ----------------------------
 * GPIO22  -----------> DATA
 * GPIO26  -----------> VCC (power control, shared)
 * GND     -----------> GND
 *
 * ESP32                Capacitive Soil Moisture Sensor
 * ------               --------------------------------
 * GPIO32  -----------> AOUT (analog signal) [or override via SOIL_PIN in config.h]
 * GPIO26  -----------> VCC (power control, shared)
 * GND     -----------> GND
 *
 * Note: Both sensors powered via GPIO26 — turned off during deep sleep.
 *       Boards with chopped onboard sensor: use SOIL_PIN in config.h to
 *       override soil ADC pin (e.g. GPIO35) since GPIO32/33 have residual
 *       PCB components that attenuate the signal.
 *       The board uses a single 18650 battery in its built-in holder.
 *       USB chip: CH340 on /dev/cu.usbserial-0001
 *       Soil pin auto-detected (GPIO32 vs GPIO33) unless SOIL_PIN is defined.
 *
 * Deep Sleep:
 * Internal RTC timer wakeup — no external wiring needed.
 *
 * ============================================
 * REQUIRED LIBRARIES
 * ============================================
 * - WiFi              (built-in with ESP32 core)
 * - HTTPClient        (built-in with ESP32 core)
 * - WiFiUdp           (built-in)
 * - NTPClient         (Library Manager: "NTPClient" by Fabrice Weinberg)
 * - ArduinoJson       (Library Manager: "ArduinoJson" by Benoit Blanchon, v7+)
 * - DHT sensor library (Library Manager: "DHT sensor library" by Adafruit)
 * - Adafruit Unified Sensor (Library Manager: "Adafruit Unified Sensor")
 *
 * Board package: esp32 by Espressif (install via Boards Manager)
 * Board selection: "ESP32 Dev Module"
 * FQBN: esp32:esp32:esp32
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include "driver/gpio.h"
#include "esp_system.h"

#include "config.h"

// Reported with every upload and stored per-sensor, so behaviour (battery life,
// upload cadence, sensor quality) can be compared across builds. Bump on any
// change that could plausibly affect how the board behaves in the field.
#define FIRMWARE_VERSION "2.1.0"

// Pin definitions
#define DHT_PIN 22
#define DHT_TYPE DHT11
#define SOIL_PIN_A 32
#define SOIL_PIN_B 33
#define SENSOR_POWER_PIN 26
#define I2C_SDA 25
#define I2C_SCL 27
#define LIGHT_POWER_PIN 14

// WiFi connection timeout (milliseconds)
#define WIFI_TIMEOUT_MS 15000

// Number of hourly wakes buffered before a WiFi connect + batch POST.
// SLEEP_SECONDS=3600 -> 24 (once a day). Must stay a compile-time constant.
#define READINGS_PER_BATCH (86400UL / SLEEP_SECONDS)

// One buffered sample. NAN/-1 sentinels mark metrics that failed to read.
struct Reading {
  int soil_moisture;
  float temperature;
  float humidity;
  float light_lux;
};

// Exponential backoff after a failed upload. Without this a WiFi or backend
// outage turns into a full connect attempt every single wake (24/day), which
// burns far more radio time than the once-a-day upload it replaced.
#define MAX_BACKOFF_WAKES 12

// RTC slow memory — survives deep sleep, zeroed on power-on/brownout.
RTC_DATA_ATTR Reading rtcReadings[READINGS_PER_BATCH];
RTC_DATA_ATTR uint8_t rtcCount = 0;
RTC_DATA_ATTR uint8_t rtcFailures = 0;    // consecutive failed uploads
RTC_DATA_ATTR uint8_t rtcSkipWakes = 0;   // wakes still to skip before retrying

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// DHT sensor
DHT dht(DHT_PIN, DHT_TYPE);

// BH1750 light sensor
BH1750 lightMeter;

void goToSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  digitalWrite(SENSOR_POWER_PIN, LOW);
  digitalWrite(LIGHT_POWER_PIN, LOW);

  // ESP32 GPIOs go high-impedance in deep sleep unless explicitly held. A
  // floating sensor VCC can still be phantom-powered through the ESD diodes on
  // its signal pin, so pin the power rails low for the whole sleep.
  gpio_hold_en((gpio_num_t)SENSOR_POWER_PIN);
  gpio_hold_en((gpio_num_t)LIGHT_POWER_PIN);
  gpio_deep_sleep_hold_en();

  Serial.printf("Sleeping for %d seconds...\n", SLEEP_SECONDS);
  Serial.flush();
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

// Called after a failed upload: back off exponentially instead of retrying
// every wake, and eventually drop the batch so a stuck buffer doesn't block
// new readings forever.
void registerFailure() {
  if (rtcFailures < 255) rtcFailures++;
  if (rtcFailures >= 4) {
    Serial.println("Too many failed uploads — dropping buffered batch");
    rtcCount = 0;
    rtcFailures = 0;
    rtcSkipWakes = 0;
    return;
  }
  uint16_t wakes = 1 << rtcFailures;  // 2, 4, 8 wakes
  rtcSkipWakes = wakes > MAX_BACKOFF_WAKES ? MAX_BACKOFF_WAKES : (uint8_t)wakes;
  Serial.printf("Upload failed (attempt %d) — backing off %d wake(s)\n",
                rtcFailures, rtcSkipWakes);
}

void setup() {
  btStop();  // disable BT controller — never used, saves idle current

  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - DIY MORE ESP32  fw " FIRMWARE_VERSION);
  Serial.println("=============================");

  // Release the deep-sleep GPIO hold before touching the power pins — while
  // held they stay latched at their pre-sleep level and ignore digitalWrite,
  // which would leave the sensors permanently unpowered.
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)SENSOR_POWER_PIN);
  gpio_hold_dis((gpio_num_t)LIGHT_POWER_PIN);

  if (rtcCount > READINGS_PER_BATCH) rtcCount = 0;  // defensive clamp

  // A cold boot (battery swap, reflash, brownout) uploads immediately rather
  // than buffering for 24h first — otherwise a board you just reconnected
  // looks dead for a full day and there's no way to tell it's working.
  bool coldBoot = (esp_reset_reason() != ESP_RST_DEEPSLEEP);
  if (coldBoot) {
    Serial.println("Cold boot — uploading immediately to confirm the board is alive");
    rtcCount = 0;
    rtcFailures = 0;
    rtcSkipWakes = 0;
  }

  if (rtcSkipWakes > 0) rtcSkipWakes--;  // serving out a backoff

  // Decide up front so WiFi can start early and overlap the sensor warm-up.
  bool willSend = (coldBoot || rtcCount >= READINGS_PER_BATCH - 1) && rtcSkipWakes == 0;

  // Power on sensors
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  pinMode(LIGHT_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  digitalWrite(LIGHT_POWER_PIN, HIGH);

  // Configure ADC: 12-bit resolution, 11dB attenuation (full 0-3.3V range)
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN_A, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN_B, ADC_11db);

  // Initialize DHT sensor
  dht.begin();

  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // Initialize BH1750 and trigger first measurement immediately —
  // the 200ms measurement overlaps with the DHT11 warm-up delay below.
  bool lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x23);
  if (!lightReady) {
    lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x5C);
  }
  if (lightReady) {
    lightMeter.configure(BH1750::ONE_TIME_HIGH_RES_MODE); // trigger measurement now
  }
  Serial.printf("BH1750: %s\n", lightReady ? "OK" : "not found");

  if (willSend) {
    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  // DHT11 needs ~1s to stabilize after power-on (BH1750 200ms + WiFi connect, if any, overlap here)
  delay(1000);

  // --- Read sensors (every wake, no WiFi needed) ---
  // Soil moisture — raw 12-bit ADC value (0-4095)
#ifdef SOIL_PIN
  // Fixed soil pin (for boards with chopped onboard sensor)
  analogSetPinAttenuation(SOIL_PIN, ADC_11db);
  int soilSum = 0;
  for (int i = 0; i < 10; i++) {
    soilSum += analogRead(SOIL_PIN);
    delay(10);
  }
  int rawMoisture = soilSum / 10;
  Serial.printf("Soil - GPIO%d: %d (fixed pin)\n", SOIL_PIN, rawMoisture);
#else
  // Auto-detect soil pin: some board revisions use GPIO32, others GPIO33
  // Read both, use the one with a higher value (the other reads ~0 noise)
  int sumA = 0, sumB = 0;
  for (int i = 0; i < 10; i++) {
    sumA += analogRead(SOIL_PIN_A);
    sumB += analogRead(SOIL_PIN_B);
    delay(10);
  }
  int avgA = sumA / 10;
  int avgB = sumB / 10;
  int rawMoisture = max(avgA, avgB);
  int soilPin = (avgA >= avgB) ? SOIL_PIN_A : SOIL_PIN_B;
  Serial.printf("Soil - GPIO%d: %d, GPIO%d: %d → using GPIO%d = %d\n",
                SOIL_PIN_A, avgA, SOIL_PIN_B, avgB, soilPin, rawMoisture);
#endif

  // DHT11 — temperature (°C) and humidity (%)
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  Serial.printf("DHT11 - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);

  // BH1750 — light level (lux). Measurement was triggered at boot; just read result.
  float lux = -1;
  if (lightReady) {
    lux = lightMeter.readLightLevel();
  }
  Serial.printf("BH1750 - Light: %.1f lux\n", lux);

  // Guard: DHT11 returns 85°C on failed reads; add explicit range guard
  if (isnan(temperature) || temperature <= -40.0 || temperature >= 80.0) temperature = NAN;

  // --- Buffer this wake's reading ---
  if (rtcCount < READINGS_PER_BATCH) {
    Reading &r = rtcReadings[rtcCount];
    r.soil_moisture = rawMoisture;
    r.temperature = temperature;
    r.humidity = humidity;
    r.light_lux = lux;
    rtcCount++;
  }
  Serial.printf("Buffered %d/%d readings\n", rtcCount, (unsigned)READINGS_PER_BATCH);

  if (!willSend) {
    // Still buffering (or serving out a backoff) — WiFi was never started
    goToSleep();
    return;
  }

  // --- Time to upload: finish connecting WiFi (already started above) ---
  Serial.printf("Connecting to %s", WIFI_SSID);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout — keeping buffer");
      registerFailure();
      goToSleep();
      return;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());

  String macAddress = WiFi.macAddress();
  Serial.printf("MAC: %s\n", macAddress.c_str());

  // --- Sync time via NTP (only needed once, right before sending) ---
  timeClient.begin();
  timeClient.update();
  unsigned long nowEpoch = timeClient.getEpochTime();
  Serial.printf("Unix epoch: %lu\n", nowEpoch);

  // --- Build batched JSON payload ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  doc["adc_bits"] = 12;
  doc["board_type"] = "diymore_dht11";
  doc["fw_version"] = FIRMWARE_VERSION;
  doc["raw_dry"] = RAW_DRY;
  doc["raw_wet"] = RAW_WET;

  JsonArray batch = doc["batch"].to<JsonArray>();
  for (uint8_t i = 0; i < rtcCount; i++) {
    Reading &r = rtcReadings[i];
    JsonObject entry = batch.add<JsonObject>();
    // Oldest buffered reading is (count-1) wakes before now; each wake is
    // SLEEP_SECONDS apart, so back-date from the NTP time we just fetched.
    entry["recorded_at"] = nowEpoch - (unsigned long)(rtcCount - 1 - i) * SLEEP_SECONDS;

    JsonArray entryReadings = entry["readings"].to<JsonArray>();

    JsonObject soilReading = entryReadings.add<JsonObject>();
    soilReading["metric"] = "soil_moisture";
    soilReading["value"] = r.soil_moisture;

    if (!isnan(r.temperature)) {
      JsonObject tempReading = entryReadings.add<JsonObject>();
      tempReading["metric"] = "temperature";
      tempReading["value"] = round(r.temperature * 10.0) / 10.0;
    }
    if (!isnan(r.humidity)) {
      JsonObject humReading = entryReadings.add<JsonObject>();
      humReading["metric"] = "humidity";
      humReading["value"] = round(r.humidity * 10.0) / 10.0;
    }
    if (r.light_lux >= 0) {
      JsonObject luxReading = entryReadings.add<JsonObject>();
      luxReading["metric"] = "light_lux";
      luxReading["value"] = round(r.light_lux * 10.0) / 10.0;
    }
  }

  String payload;
  serializeJson(doc, payload);
  Serial.printf("Payload (%u bytes, %d readings): %s\n", payload.length(), rtcCount, payload.c_str());

  // --- POST batch to API ---
  WiFiClientSecure client;
  client.setInsecure();  // skip cert validation — acceptable for IoT
  HTTPClient http;
  String url = String(API_ENDPOINT) + "/api/readings";
  http.begin(client, url);
  http.setTimeout(15000);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(payload);
  Serial.printf("HTTP response: %d\n", httpCode);

  if (httpCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.printf("HTTP error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();

  if (httpCode >= 200 && httpCode < 300) {
    rtcCount = 0;
    rtcFailures = 0;
    rtcSkipWakes = 0;
  } else {
    // Keep the buffer and retry later with backoff; registerFailure() drops
    // the batch once retries are clearly not going to succeed.
    registerFailure();
  }

  goToSleep();
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
