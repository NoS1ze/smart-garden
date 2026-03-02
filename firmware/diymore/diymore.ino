/*
 * Smart Garden - DIY MORE ESP32 Sensor Board
 * Board: ESP32-D0WDQ6 (DIY MORE prebuilt board with 18650 holder)
 *
 * ============================================
 * WIRING (hardwired on PCB — no user wiring needed)
 * ============================================
 *
 * ESP32                DHT11 (temperature + humidity)
 * ------               ----------------------------
 * GPIO22  -----------> DATA
 * 3V3     -----------> VCC (hardwired on PCB)
 * GND     -----------> GND (hardwired on PCB)
 *
 * ESP32                Capacitive Soil Moisture Sensor
 * ------               --------------------------------
 * GPIO32 or GPIO33 --> AOUT (analog signal, varies by board revision)
 * 3V3     -----------> VCC (hardwired on PCB)
 * GND     -----------> GND (hardwired on PCB)
 *
 * Note: Both sensors are hardwired to VCC — cannot be powered off via GPIO.
 *       The board uses a single 18650 battery in its built-in holder.
 *       USB chip: CH340 on /dev/cu.usbserial-0001
 *       Soil pin varies: some revisions use GPIO32, others GPIO33.
 *       Firmware auto-detects by reading both and picking the higher value.
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
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

#include "config.h"

// Pin definitions
#define DHT_PIN 22
#define DHT_TYPE DHT11
#define SOIL_PIN_A 32
#define SOIL_PIN_B 33

// Calibration reference (12-bit ADC: 0-4095)
// ~3430 = dry (air), ~1360 = wet (submerged)
// Frontend handles conversion via soil types (raw_dry_12bit / raw_wet_12bit)
// Soil pin varies by board revision — auto-detected at boot

// WiFi connection timeout (milliseconds)
#define WIFI_TIMEOUT_MS 15000

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// DHT sensor
DHT dht(DHT_PIN, DHT_TYPE);

void goToSleep() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.printf("Sleeping for %d seconds...\n", SLEEP_SECONDS);
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - DIY MORE ESP32");
  Serial.println("=============================");

  // Configure ADC: 12-bit resolution, 11dB attenuation (full 0-3.3V range)
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN_A, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN_B, ADC_11db);

  // Initialize DHT sensor
  dht.begin();
  // DHT11 needs ~1s to stabilize after power-on (always powered via VCC)
  delay(1000);

  // --- Step 1: Connect to WiFi ---
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s", WIFI_SSID);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout, sleeping");
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

  // --- Step 2: Sync time via NTP ---
  timeClient.begin();
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();
  Serial.printf("Unix epoch: %lu\n", epochTime);

  // --- Step 3: Read sensors ---
  // Soil moisture — raw 12-bit ADC value (0-4095)
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

  // DHT11 — temperature (°C) and humidity (%)
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();
  Serial.printf("DHT11 - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);

  // --- Step 4: Build JSON payload ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  JsonArray readings = doc["readings"].to<JsonArray>();
  doc["recorded_at"] = epochTime;
  doc["adc_bits"] = 12;
  doc["board_type"] = "diymore_dht11";

  // Soil moisture — send raw ADC value (frontend converts via soil type calibration)
  JsonObject soilReading = readings.add<JsonObject>();
  soilReading["metric"] = "soil_moisture";
  soilReading["value"] = rawMoisture;

  // Temperature
  if (!isnan(temperature)) {
    JsonObject tempReading = readings.add<JsonObject>();
    tempReading["metric"] = "temperature";
    tempReading["value"] = round(temperature * 10.0) / 10.0;
  }

  // Humidity
  if (!isnan(humidity)) {
    JsonObject humReading = readings.add<JsonObject>();
    humReading["metric"] = "humidity";
    humReading["value"] = round(humidity * 10.0) / 10.0;
  }

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
  goToSleep();
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
