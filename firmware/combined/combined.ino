/*
 * Smart Garden - Combined Sensor Sketch
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
 * NodeMCU V3          DHT22 (not yet connected)
 * ---------           -------------------------
 * D2 (GPIO4)  ------> DATA (with 10k pull-up to 3.3V)
 * 3V3         ------> VCC
 * G (GND)     ------> GND
 *
 * NodeMCU V3          BH1750 Light Sensor (not yet connected)
 * ---------           ------------------------------------
 * D5 (GPIO14) ------> SCL (I2C clock)
 * D6 (GPIO12) ------> SDA (I2C data)
 * 3V3         ------> VCC
 * G (GND)     ------> GND
 * Note: Using software I2C since hardware I2C (D1/D2) is taken
 *
 * NodeMCU V3          MH-Z19 CO2 Sensor (not yet connected)
 * ---------           ----------------------------------
 * D7 (GPIO13) ------> TX (sensor TX -> MCU RX)
 * D8 (GPIO15) ------> RX (sensor RX -> MCU TX)
 * VIN (5V)    ------> VIN (sensor needs 5V)
 * G (GND)     ------> GND
 *
 * Deep Sleep:
 * D0 (GPIO16) ------> RST               [wake from deep sleep]
 *
 * ============================================
 * REQUIRED LIBRARIES
 * ============================================
 * - ESP8266WiFi       (built-in)
 * - ESP8266HTTPClient (built-in)
 * - WiFiUdp           (built-in)
 * - NTPClient         (Library Manager: "NTPClient" by Fabrice Weinberg)
 * - ArduinoJson       (Library Manager: "ArduinoJson" by Benoit Blanchon, v7+)
 *
 * Uncomment the following when sensors are connected:
 * - DHT sensor library (Library Manager: "DHT sensor library" by Adafruit)
 * - Adafruit Unified Sensor (Library Manager: "Adafruit Unified Sensor")
 * - BH1750            (Library Manager: "BH1750" by Christopher Laws)
 * - MH-Z19            (Library Manager: "MH-Z19" by Jonathan Dempsey)
 * - SoftwareSerial     (built-in)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <ArduinoJson.h>

// --- Uncomment when DHT22 is connected ---
// #include <DHT.h>
// #define DHT_PIN D2
// #define DHT_TYPE DHT22
// DHT dht(DHT_PIN, DHT_TYPE);

// --- Uncomment when BH1750 is connected ---
// #include <Wire.h>
// #include <BH1750.h>
// BH1750 lightMeter;
// #define BH1750_SCL D5
// #define BH1750_SDA D6

// --- Uncomment when MH-Z19 is connected ---
// #include <SoftwareSerial.h>
// #include <MHZ19.h>
// #define MHZ19_RX D7  // sensor TX -> MCU RX
// #define MHZ19_TX D8  // sensor RX -> MCU TX
// SoftwareSerial mhzSerial(MHZ19_RX, MHZ19_TX);
// MHZ19 mhz19;

#include "config.h"

// Soil moisture pin definitions
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

// --- Sensor reading functions ---

float readSoilMoisture(int* rawOut) {
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(100);

  int rawValue = analogRead(SENSOR_ANALOG_PIN);
  if (rawOut) *rawOut = rawValue;

  digitalWrite(SENSOR_POWER_PIN, LOW);

  float moisture = map(rawValue, RAW_DRY, RAW_WET, 0, 100);
  if (moisture < 0) moisture = 0;
  if (moisture > 100) moisture = 100;
  return moisture;
}

// --- Uncomment when DHT22 is connected ---
// void readDHT22(float* temperature, float* humidity) {
//   *temperature = dht.readTemperature();
//   *humidity = dht.readHumidity();
//   if (isnan(*temperature)) *temperature = -999;
//   if (isnan(*humidity)) *humidity = -999;
// }

// --- Uncomment when BH1750 is connected ---
// float readLight() {
//   return lightMeter.readLightLevel();
// }

// --- Uncomment when MH-Z19 is connected ---
// int readCO2() {
//   return mhz19.getCO2();
// }

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - Combined Sensor Sketch");
  Serial.println("======================================");

  // --- Initialize additional sensors (uncomment when connected) ---
  // dht.begin();
  // Wire.begin(BH1750_SDA, BH1750_SCL);
  // lightMeter.begin();
  // mhzSerial.begin(9600);
  // mhz19.begin(mhzSerial);

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
  int rawMoisture;
  float moisture = readSoilMoisture(&rawMoisture);
  Serial.printf("Soil - Raw: %d, Moisture: %.1f%%\n", rawMoisture, moisture);

  // --- Uncomment when DHT22 is connected ---
  // float temperature, humidity;
  // readDHT22(&temperature, &humidity);
  // Serial.printf("DHT22 - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);

  // --- Uncomment when BH1750 is connected ---
  // float lux = readLight();
  // Serial.printf("Light: %.1f lux\n", lux);

  // --- Uncomment when MH-Z19 is connected ---
  // int co2 = readCO2();
  // Serial.printf("CO2: %d ppm\n", co2);

  // --- Step 4: Build JSON payload with all sensor readings ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  JsonArray readings = doc["readings"].to<JsonArray>();
  doc["recorded_at"] = epochTime;

  // Soil moisture (always active)
  JsonObject soilReading = readings.add<JsonObject>();
  soilReading["metric"] = "soil_moisture";
  soilReading["value"] = round(moisture * 10.0) / 10.0;

  // --- Uncomment when DHT22 is connected ---
  // if (temperature != -999) {
  //   JsonObject tempReading = readings.add<JsonObject>();
  //   tempReading["metric"] = "temperature";
  //   tempReading["value"] = round(temperature * 10.0) / 10.0;
  // }
  // if (humidity != -999) {
  //   JsonObject humReading = readings.add<JsonObject>();
  //   humReading["metric"] = "humidity";
  //   humReading["value"] = round(humidity * 10.0) / 10.0;
  // }

  // --- Uncomment when BH1750 is connected ---
  // JsonObject luxReading = readings.add<JsonObject>();
  // luxReading["metric"] = "light";
  // luxReading["value"] = round(lux * 10.0) / 10.0;

  // --- Uncomment when MH-Z19 is connected ---
  // JsonObject co2Reading = readings.add<JsonObject>();
  // co2Reading["metric"] = "co2";
  // co2Reading["value"] = co2;

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
