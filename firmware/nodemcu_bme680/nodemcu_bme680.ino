/*
 * Smart Garden - NodeMCU + ENS160/AHT21 Sketch
 * Board: Lolin NodeMCU V3 (ESP8266)
 *
 * Battery optimization: sensors are still read every SLEEP_SECONDS (hourly),
 * but readings are buffered in RTC user memory (survives deep sleep) and
 * only flushed once the buffer fills (~once a day), so WiFi connect + NTP +
 * HTTP only happens on 1 wake out of READINGS_PER_BATCH. The ENS160 stays
 * powered continuously via 3V3 the whole time regardless of this change —
 * it needs that to retain its warm-up/calibration state — so this only
 * affects WiFi, not sensor power gating.
 *
 * ============================================
 * WIRING DIAGRAM
 * ============================================
 *
 * NodeMCU V3          ENS160+AHT21 Breakout
 * ---------           ---------------------
 * 3V3         ------> VIN (power)
 * G (GND)     ------> GND
 * D1 (GPIO5)  ------> SCL (I2C clock)
 * D2 (GPIO4)  ------> SDA (I2C data)
 *
 * NodeMCU V3          Capacitive Soil Moisture Sensor v2.0
 * ---------           ----------------------------------
 * D5 (GPIO14) ------> VCC (power control pin)
 * G (GND)     ------> GND
 * A0          ------> AOUT (analog signal)
 *
 * Deep Sleep:
 * D0 (GPIO16) ------> RST (wake from deep sleep)
 *
 * ============================================
 * REQUIRED LIBRARIES
 * ============================================
 * - ESP8266WiFi       (built-in)
 * - ESP8266HTTPClient (built-in)
 * - WiFiUdp           (built-in)
 * - Wire              (built-in)
 * - NTPClient         (Library Manager: "NTPClient" by Fabrice Weinberg)
 * - ArduinoJson       (Library Manager: "ArduinoJson" by Benoit Blanchon, v7+)
 * - Adafruit AHTX0    (Library Manager: "Adafruit AHTX0")
 * - ScioSense ENS16x  (Library Manager: "ScioSense_ENS16x")
 *
 * Board package: esp8266 by ESP8266 Community (install via Boards Manager)
 * Board selection: "NodeMCU 1.0 (ESP-12E Module)"
 * FQBN: esp8266:esp8266:nodemcuv2
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <ens160.h>

#include "config.h"

// Sensors
Adafruit_AHTX0 aht;
ENS160 ens160;

// Soil moisture pin definitions
#define SENSOR_POWER_PIN D5   // GPIO14
#define SENSOR_ANALOG_PIN A0

// WiFi connection timeout (milliseconds)
#define WIFI_TIMEOUT_MS 15000

// Number of hourly wakes buffered before a WiFi connect + batch POST.
// SLEEP_SECONDS=3600 -> 24 (once a day). Must stay a compile-time constant.
#define READINGS_PER_BATCH (86400UL / SLEEP_SECONDS)

// One buffered sample. Sentinels (-999 / -1) mark metrics that failed to read.
struct Reading {
  int soil_moisture;
  float temperature;  // -999 if unavailable
  float humidity;      // -999 if unavailable
  int eco2;             // -1 if unavailable
  int tvoc;              // -1 if unavailable
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
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.printf("Going to sleep for %d seconds...\n", SLEEP_SECONDS);
  Serial.flush();
  ESP.deepSleep((uint64_t)SLEEP_SECONDS * 1000000ULL);
}

int readSoilMoistureRaw() {
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(100);

  int rawValue = analogRead(SENSOR_ANALOG_PIN);

  digitalWrite(SENSOR_POWER_PIN, LOW);
  return rawValue;
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - NodeMCU + ENS160/AHT21");
  Serial.println("======================================");

  // --- Restore buffered readings from RTC memory ---
  ESP.rtcUserMemoryRead(0, (uint32_t *)&rtcData, sizeof(rtcData));
  uint32_t crcOfData = calculateCRC32(((uint8_t *)&rtcData) + 4, sizeof(rtcData) - 4);
  if (crcOfData != rtcData.crc32 || rtcData.count > READINGS_PER_BATCH) {
    Serial.println("RTC memory invalid (cold boot / brownout) — starting new batch");
    memset(&rtcData, 0, sizeof(rtcData));
  }

  // This wake will fill the buffer (or it's already full from a failed send
  // last time) — start WiFi as early as possible so connect time overlaps
  // with the ENS160 measurement cycle below.
  bool willSend = (rtcData.count >= READINGS_PER_BATCH - 1);

  // --- Initialize I2C + sensors ---
  Wire.begin(D2, D1); // SDA=GPIO4, SCL=GPIO5

  bool ahtReady = aht.begin();
  Serial.printf("AHT21: %s\n", ahtReady ? "OK" : "FAILED");

  ens160.begin(&Wire, 0x52);
  // Don't call init() on every wakeup — it resets the sensor's warm-up state.
  // 3V3 stays on during deep sleep so the sensor retains calibration.
  bool ensReady = ens160.isConnected();
  if (ensReady) {
    ens160.startStandardMeasure();
  }
  Serial.printf("ENS160: %s\n", ensReady ? "OK" : "FAILED");

  if (willSend) {
    WiFi.persistent(false);
    WiFi.setAutoReconnect(false);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  if (ensReady) {
    delay(1100); // Wait one full 1s measurement cycle (WiFi connects during this, if started)
  }

  // --- Read all sensors (every wake, no WiFi needed) ---
  int rawMoisture = readSoilMoistureRaw();
  Serial.printf("Soil - Raw: %d\n", rawMoisture);

  float temperature = -999, humidity = -999;
  if (ahtReady) {
    sensors_event_t humEvent, tempEvent;
    aht.getEvent(&humEvent, &tempEvent);
    temperature = tempEvent.temperature;
    humidity = humEvent.relative_humidity;
    Serial.printf("AHT21 - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);
  }

  int eco2 = -1, tvoc = -1;
  if (ensReady) {
    // Provide AHT21 temperature+humidity compensation for accurate eCO2/TVOC
    if (temperature != -999 && humidity != -999) {
      ens160.writeCompensation(Ens16x_CalcTempInFromCelsius(temperature), Ens16x_CalcRhIn(humidity));
    }
    ens160.update();
    eco2 = ens160.getEco2();
    tvoc = ens160.getTvoc();
    // Validity flag (bits 2-3 of device status): 0=normal, 1=warm-up, 2=initial start-up, 3=invalid
    uint8_t status = (ens160.getDeviceStatus() >> 2) & 0x03;
    Serial.printf("ENS160 - eCO2: %d ppm, TVOC: %d ppb, status: %d\n", eco2, tvoc, status);
  }

  // --- Buffer this wake's reading ---
  if (rtcData.count < READINGS_PER_BATCH) {
    Reading &r = rtcData.readings[rtcData.count];
    r.soil_moisture = rawMoisture;
    r.temperature = temperature;
    r.humidity = humidity;
    r.eco2 = eco2;
    r.tvoc = tvoc;
    rtcData.count++;
  }
  Serial.printf("Buffered %d/%d readings\n", rtcData.count, (unsigned)READINGS_PER_BATCH);

  if (rtcData.count < READINGS_PER_BATCH) {
    // Buffer not full yet — WiFi was never started, straight to sleep
    saveRTC();
    goToSleep();
    return;
  }

  // --- Buffer full: finish connecting WiFi (already started above) ---
  Serial.printf("Connecting to %s", WIFI_SSID);
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout — keeping buffer, will retry next wake");
      saveRTC();
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
  doc["board_type"] = "nodemcu_ens160_aht21";

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

    if (r.temperature != -999) {
      JsonObject tempReading = entryReadings.add<JsonObject>();
      tempReading["metric"] = "temperature";
      tempReading["value"] = round(r.temperature * 10.0) / 10.0;
    }
    if (r.humidity != -999) {
      JsonObject humReading = entryReadings.add<JsonObject>();
      humReading["metric"] = "humidity";
      humReading["value"] = round(r.humidity * 10.0) / 10.0;
    }
    // ENS160 readings — send even during warm-up (eco2 >= 400, tvoc >= 0)
    if (r.eco2 > 0) {
      JsonObject co2Reading = entryReadings.add<JsonObject>();
      co2Reading["metric"] = "co2_ppm";
      co2Reading["value"] = r.eco2;
    }
    if (r.tvoc >= 0) {
      JsonObject tvocReading = entryReadings.add<JsonObject>();
      tvocReading["metric"] = "tvoc_ppb";
      tvocReading["value"] = r.tvoc;
    }
  }

  String payload;
  serializeJson(doc, payload);
  Serial.printf("Payload (%u bytes, %d readings): %s\n", payload.length(), rtcData.count, payload.c_str());

  // --- POST batch to API ---
  WiFiClient client;
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

  goToSleep();
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
