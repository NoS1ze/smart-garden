/*
 * Smart Garden - Soil Moisture Sensor Sketch
 * Board: Lolin NodeMCU V3 (ESP8266)
 *
 * ============================================
 * WIRING DIAGRAM
 * ============================================
 *
 * NodeMCU V3          Capacitive Soil Moisture Sensor v2.0
 * ---------           ----------------------------------
 * D1 (GPIO5)  ------> VCC (red wire)    [power control pin]
 * G (GND)     ------> GND (black wire)
 * A0          ------> AOUT (yellow wire) [analog signal]
 *
 * Deep Sleep:
 * D0 (GPIO16) ------> RST               [wake from deep sleep]
 *
 * ============================================
 * REQUIRED LIBRARIES
 * ============================================
 * - ESP8266WiFi       (built-in with ESP8266 board package)
 * - ESP8266HTTPClient (built-in with ESP8266 board package)
 * - WiFiUdp           (built-in with ESP8266 board package)
 * - NTPClient         (install via Library Manager: "NTPClient" by Fabrice Weinberg)
 * - ArduinoJson       (install via Library Manager: "ArduinoJson" by Benoit Blanchon, v7+)
 *
 * Board package: esp8266 by ESP8266 Community (install via Boards Manager)
 * Board selection: "NodeMCU 1.0 (ESP-12E Module)"
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>

#include "config.h"

// Pin definitions
#define SENSOR_POWER_PIN D1
#define SENSOR_ANALOG_PIN A0

// Calibration values (capacitive sensor v2.0)
#define RAW_DRY 800
#define RAW_WET 400

// WiFi connection timeout (milliseconds)
#define WIFI_TIMEOUT_MS 10000

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - Soil Moisture Sensor");
  Serial.println("====================================");

  // --- Step 1: Connect to WiFi ---
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s", WIFI_SSID);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout, sleeping");
      ESP.deepSleep(SLEEP_SECONDS * 1000000ULL);
      return;
    }
    delay(250);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("Connected! IP: %s\n", WiFi.localIP().toString().c_str());

  // --- Step 2: Sync time via NTP ---
  timeClient.begin();
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();
  Serial.printf("Unix epoch: %lu\n", epochTime);

  // --- Step 3: Read soil moisture sensor ---
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(100);

  int rawValue = analogRead(SENSOR_ANALOG_PIN);

  // Map raw value to percentage (800=dry=0%, 400=wet=100%)
  float moisture = map(rawValue, RAW_DRY, RAW_WET, 0, 100);
  if (moisture < 0) moisture = 0;
  if (moisture > 100) moisture = 100;

  digitalWrite(SENSOR_POWER_PIN, LOW);

  Serial.printf("Raw: %d, Moisture: %.1f%%\n", rawValue, moisture);

  // --- Step 4: Build JSON payload ---
  JsonDocument doc;
  doc["sensor_id"] = SENSOR_ID;
  JsonArray readings = doc["readings"].to<JsonArray>();
  JsonObject reading = readings.add<JsonObject>();
  reading["metric"] = "soil_moisture";
  reading["value"] = round(moisture * 10.0) / 10.0;
  doc["recorded_at"] = epochTime;

  String payload;
  serializeJson(doc, payload);
  Serial.printf("Payload: %s\n", payload.c_str());

  // --- Step 5: POST to API ---
  WiFiClient client;
  HTTPClient http;
  String url = String(API_ENDPOINT) + "/api/readings";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(payload);
  Serial.printf("HTTP response: %d\n", httpCode);

  if (httpCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.printf("HTTP error: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();

  // --- Step 6: Sleep ---
  WiFi.disconnect(true);
  Serial.println("Going to sleep...");
  ESP.deepSleep(SLEEP_SECONDS * 1000000ULL);
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
