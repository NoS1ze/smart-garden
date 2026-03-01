/*
 * Smart Garden - NodeMCU + ENS160/AHT21 Sketch
 * Board: Lolin NodeMCU V3 (ESP8266)
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

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

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

  // --- Initialize I2C + sensors ---
  Wire.begin(D2, D1); // SDA=GPIO4, SCL=GPIO5

  bool ahtReady = aht.begin();
  Serial.printf("AHT21: %s\n", ahtReady ? "OK" : "FAILED");

  ens160.begin(&Wire, 0x52);
  bool ensReady = ens160.init() && ens160.isConnected();
  if (ensReady) {
    ens160.startStandardMeasure();
    delay(1000); // ENS160 needs warmup time
  }
  Serial.printf("ENS160: %s\n", ensReady ? "OK" : "FAILED");

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

  String macAddress = WiFi.macAddress();
  Serial.printf("MAC: %s\n", macAddress.c_str());

  // --- Step 2: Sync time via NTP ---
  timeClient.begin();
  timeClient.update();
  unsigned long epochTime = timeClient.getEpochTime();
  Serial.printf("Unix epoch: %lu\n", epochTime);

  // --- Step 3: Read all sensors ---
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
    ens160.update();
    eco2 = ens160.getEco2();
    tvoc = ens160.getTvoc();
    Serial.printf("ENS160 - eCO2: %d ppm, TVOC: %d ppb\n", eco2, tvoc);
  }

  // --- Step 4: Build JSON payload ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  JsonArray readings = doc["readings"].to<JsonArray>();
  doc["recorded_at"] = epochTime;
  doc["adc_bits"] = 10;
  doc["board_type"] = "nodemcu_ens160_aht21";

  // Soil moisture (raw ADC value)
  JsonObject soilReading = readings.add<JsonObject>();
  soilReading["metric"] = "soil_moisture";
  soilReading["value"] = rawMoisture;

  // AHT21 readings
  if (temperature != -999) {
    JsonObject tempReading = readings.add<JsonObject>();
    tempReading["metric"] = "temperature";
    tempReading["value"] = round(temperature * 10.0) / 10.0;
  }
  if (humidity != -999) {
    JsonObject humReading = readings.add<JsonObject>();
    humReading["metric"] = "humidity";
    humReading["value"] = round(humidity * 10.0) / 10.0;
  }

  // ENS160 readings
  if (eco2 > 0) {
    JsonObject co2Reading = readings.add<JsonObject>();
    co2Reading["metric"] = "co2_ppm";
    co2Reading["value"] = eco2;
  }
  if (tvoc >= 0 && ensReady) {
    JsonObject tvocReading = readings.add<JsonObject>();
    tvocReading["metric"] = "tvoc_ppb";
    tvocReading["value"] = tvoc;
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
  WiFi.disconnect(true);
  Serial.printf("Going to sleep for %d seconds...\n", SLEEP_SECONDS);
  ESP.deepSleep(SLEEP_SECONDS * 1000000ULL);
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
