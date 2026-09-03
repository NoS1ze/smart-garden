/*
 * Smart Garden - NodeMCU V3 (ESP8266) Sensor Board
 * Sensors: Capacitive Soil Moisture v2.0 + HTU21D + BH1750
 *
 * Battery optimization: sensors are still read every SLEEP_SECONDS (hourly),
 * but readings are buffered in RTC user memory (survives deep sleep) and only
 * flushed once the buffer fills (~once a day). WiFi connect + NTP sync + TLS
 * handshake — the dominant battery cost per wake — happens on 1 wake out of
 * READINGS_PER_BATCH instead of every wake.
 *
 * ============================================
 * WIRING DIAGRAM
 * ============================================
 *
 * NodeMCU V3          Capacitive Soil Moisture Sensor v2.0
 * ---------           ----------------------------------
 * D1 (GPIO5)  ------> VCC (power control pin)
 * G (GND)     ------> GND
 * A0          ------> AOUT (analog signal)
 *
 * NodeMCU V3          HTU21D
 * ---------           ------
 * D5 (GPIO14) ------> SCL
 * D6 (GPIO12) ------> SDA
 * 3V3         ------> VCC (always on — standby current negligible)
 * G (GND)     ------> GND
 *
 * NodeMCU V3          BH1750 (GY-302)
 * ---------           ---------------
 * D5 (GPIO14) ------> SCL  (shared I2C bus)
 * D6 (GPIO12) ------> SDA  (shared I2C bus)
 * 3V3         ------> VCC (always on — standby current negligible)
 * G (GND)     ------> GND
 *                     ADDR → GND  (address 0x23)
 *
 * Deep Sleep:
 * D0 (GPIO16) ------> RST               [wake from deep sleep]
 *
 * Power (MCP1700):
 * 18650 (+) -> MCP1700 VIN
 * 18650 (-) -> MCP1700 GND -> NodeMCU GND
 *              MCP1700 VOUT -> NodeMCU 3.3V pin
 *
 * ============================================
 * REQUIRED LIBRARIES
 * ============================================
 * - ESP8266WiFi         (built-in with ESP8266 board package)
 * - ESP8266HTTPClient   (built-in with ESP8266 board package)
 * - WiFiUdp             (built-in)
 * - NTPClient           (Library Manager: "NTPClient" by Fabrice Weinberg)
 * - ArduinoJson         (Library Manager: "ArduinoJson" by Benoit Blanchon, v7+)
 * - SparkFun HTU21D     (Library Manager: "SparkFun HTU21D Humidity and Temperature Sensor Breakout")
 * - BH1750              (Library Manager: "BH1750" by Christopher Laws)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <SparkFunHTU21D.h>
#include <BH1750.h>

#include "config.h"

// Pin definitions
#define SENSOR_POWER_PIN D1    // soil moisture power control
#define SENSOR_ANALOG_PIN A0   // soil moisture analog signal
#define I2C_SCL D5             // GPIO14 — SCL
#define I2C_SDA D6             // GPIO12 — SDA

// WiFi connection timeout (milliseconds)
#define WIFI_TIMEOUT_MS 10000

// Number of hourly wakes buffered before a WiFi connect + batch POST.
// SLEEP_SECONDS=3600 -> 24 (once a day). Must stay a compile-time constant.
#define READINGS_PER_BATCH (86400UL / SLEEP_SECONDS)

// One buffered sample. NAN/-1 sentinels mark metrics that failed to read.
struct Reading {
  float soil_moisture;
  float temperature;
  float humidity;
  float light_lux;
};

// Lives in RTC user memory (survives deep sleep, lost on power loss/brownout).
struct RTCData {
  uint32_t crc32;
  uint8_t count;
  uint8_t _pad[3];
  Reading readings[READINGS_PER_BATCH];
};

RTCData rtcData;

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// Sensors
HTU21D htu21d;
BH1750 lightMeter;

// Standard bit-by-bit CRC32, used to validate RTC memory on wake
uint32_t calculateCRC32(const uint8_t *data, size_t length) {
  uint32_t crc = 0xffffffff;
  while (length--) {
    uint8_t c = *data++;
    for (uint32_t i = 0x80; i > 0; i >>= 1) {
      bool bit = crc & 0x80000000;
      if (c & i) bit = !bit;
      crc <<= 1;
      if (bit) crc ^= 0x04c11db7;
    }
  }
  return crc;
}

void saveRTC() {
  rtcData.crc32 = calculateCRC32(((uint8_t *)&rtcData) + 4, sizeof(rtcData) - 4);
  ESP.rtcUserMemoryWrite(0, (uint32_t *)&rtcData, sizeof(rtcData));
}

void goToSleep() {
  Serial.printf("Sleeping for %d seconds...\n", SLEEP_SECONDS);
  Serial.flush();
  ESP.deepSleep((uint64_t)SLEEP_SECONDS * 1000000ULL);
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - NodeMCU + HTU21D + BH1750");
  Serial.println("=========================================");

  // --- Restore buffered readings from RTC memory ---
  ESP.rtcUserMemoryRead(0, (uint32_t *)&rtcData, sizeof(rtcData));
  uint32_t crcOfData = calculateCRC32(((uint8_t *)&rtcData) + 4, sizeof(rtcData) - 4);
  if (crcOfData != rtcData.crc32 || rtcData.count > READINGS_PER_BATCH) {
    Serial.println("RTC memory invalid (cold boot / brownout) — starting new batch");
    memset(&rtcData, 0, sizeof(rtcData));
  }

  // Power on soil sensor early so its 100ms warm-up overlaps with sensor init
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);

  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  htu21d.begin();

  bool lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x23);
  if (!lightReady) {
    lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x5C);
  }
  Serial.printf("BH1750: %s\n", lightReady ? "OK" : "not found");

  // --- Read sensors (every wake, no WiFi needed) ---
  delay(100);  // ensure at least 100ms since soil sensor power-on
  int rawMoisture = analogRead(SENSOR_ANALOG_PIN);
  digitalWrite(SENSOR_POWER_PIN, LOW);
  Serial.printf("Soil raw: %d\n", rawMoisture);

  float temperature = htu21d.readTemperature();
  float humidity = htu21d.readHumidity();
  Serial.printf("HTU21D - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);

  float lux = -1;
  if (lightReady) {
    lux = lightMeter.readLightLevel();
  }
  Serial.printf("BH1750 - Light: %.1f lux\n", lux);

  // Guard against HTU21D I2C glitch: bus returning 0xFFFF decodes to ~125°C
  if (isnan(temperature) || temperature <= -40.0 || temperature >= 80.0) temperature = NAN;
  if (isnan(humidity) || humidity < 0.0 || humidity > 100.0) humidity = NAN;

  // --- Buffer this wake's reading ---
  if (rtcData.count < READINGS_PER_BATCH) {
    Reading &r = rtcData.readings[rtcData.count];
    r.soil_moisture = rawMoisture;
    r.temperature = temperature;
    r.humidity = humidity;
    r.light_lux = lux;
    rtcData.count++;
  }
  Serial.printf("Buffered %d/%d readings\n", rtcData.count, (unsigned)READINGS_PER_BATCH);

  if (rtcData.count < READINGS_PER_BATCH) {
    // Buffer not full yet — skip WiFi entirely, this is the power saving step
    saveRTC();
    goToSleep();
    return;
  }

  // --- Buffer is full: connect WiFi and flush the whole batch ---
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s", WIFI_SSID);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout — keeping buffer, will retry next wake");
      WiFi.mode(WIFI_OFF);
      saveRTC();  // count stays at READINGS_PER_BATCH, so next wake retries immediately
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
  doc["adc_bits"] = 10;
  doc["board_type"] = "nodemcu_htu21d_bh1750";
  doc["raw_dry"] = RAW_DRY;
  doc["raw_wet"] = RAW_WET;

  JsonArray batch = doc["batch"].to<JsonArray>();
  for (uint8_t i = 0; i < rtcData.count; i++) {
    Reading &r = rtcData.readings[i];
    JsonObject entry = batch.add<JsonObject>();
    // Oldest buffered reading is (count-1) wakes before now; each wake is
    // SLEEP_SECONDS apart, so back-date from the NTP time we just fetched.
    entry["recorded_at"] = nowEpoch - (unsigned long)(rtcData.count - 1 - i) * SLEEP_SECONDS;

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
  Serial.printf("Payload (%u bytes, %d readings): %s\n", payload.length(), rtcData.count, payload.c_str());

  // --- POST batch to API (HTTPS) ---
  BearSSL::WiFiClientSecure client;
  client.setInsecure();      // skip cert validation — acceptable for IoT
  client.setBufferSizes(512, 512);  // smaller buffers speed up the TLS handshake
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

  // Clear the buffer whether or not the POST succeeded — retrying a full
  // batch every wake would grow past READINGS_PER_BATCH slots. Worst case on
  // a failed send is losing one day of history, same as before batching.
  memset(&rtcData, 0, sizeof(rtcData));
  saveRTC();

  // --- Sleep ---
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  goToSleep();
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
