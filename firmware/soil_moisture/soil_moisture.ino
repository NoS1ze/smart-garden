/*
 * Smart Garden - NodeMCU V3 (ESP8266) Sensor Board
 * Sensors: Capacitive Soil Moisture v2.0 + HTU21D + BH1750
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

// NTP setup
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000);

// Sensors
HTU21D htu21d;
BH1750 lightMeter;

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - NodeMCU + HTU21D + BH1750");
  Serial.println("=========================================");

  // Power on soil sensor early so its 100ms warm-up overlaps with WiFi connect
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);

  // Initialize I2C
  Wire.begin(I2C_SDA, I2C_SCL);

  // Initialize HTU21D
  htu21d.begin();

  // Initialize BH1750 — trigger first measurement immediately so the 200ms
  // measurement window overlaps with WiFi connect below
  bool lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x23);
  if (!lightReady) {
    lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x5C);
  }
  if (lightReady) {
    lightMeter.configure(BH1750::ONE_TIME_HIGH_RES_MODE);
  }
  Serial.printf("BH1750: %s\n", lightReady ? "OK" : "not found");

  // --- Step 1: Connect to WiFi ---
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("Connecting to %s", WIFI_SSID);

  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart > WIFI_TIMEOUT_MS) {
      Serial.println();
      Serial.println("WiFi timeout, sleeping");
      WiFi.mode(WIFI_OFF);
      Serial.flush();
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

  // --- Step 3: Read sensors ---
  // Soil moisture — ensure at least 100ms since power-on
  delay(100);
  int rawMoisture = analogRead(SENSOR_ANALOG_PIN);
  digitalWrite(SENSOR_POWER_PIN, LOW);
  Serial.printf("Soil raw: %d\n", rawMoisture);

  // HTU21D — temperature + humidity
  float temperature = htu21d.readTemperature();
  float humidity = htu21d.readHumidity();
  Serial.printf("HTU21D - Temp: %.1fC, Humidity: %.1f%%\n", temperature, humidity);

  // BH1750 — light level (measurement was triggered at boot; well past 200ms by now)
  float lux = -1;
  if (lightReady) {
    lux = lightMeter.readLightLevel();
  }
  Serial.printf("BH1750 - Light: %.1f lux\n", lux);

  // --- Step 4: Build JSON payload ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  JsonArray readings = doc["readings"].to<JsonArray>();
  doc["recorded_at"] = epochTime;
  doc["adc_bits"] = 10;
  doc["board_type"] = "nodemcu_htu21d_bh1750";

  JsonObject soilReading = readings.add<JsonObject>();
  soilReading["metric"] = "soil_moisture";
  soilReading["value"] = rawMoisture;

  if (!isnan(temperature)) {
    JsonObject tempReading = readings.add<JsonObject>();
    tempReading["metric"] = "temperature";
    tempReading["value"] = round(temperature * 10.0) / 10.0;
  }

  if (!isnan(humidity)) {
    JsonObject humReading = readings.add<JsonObject>();
    humReading["metric"] = "humidity";
    humReading["value"] = round(humidity * 10.0) / 10.0;
  }

  if (lux >= 0) {
    JsonObject luxReading = readings.add<JsonObject>();
    luxReading["metric"] = "light_lux";
    luxReading["value"] = round(lux * 10.0) / 10.0;
  }

  String payload;
  serializeJson(doc, payload);
  Serial.printf("Payload: %s\n", payload.c_str());

  // --- Step 5: POST to API (HTTPS) ---
  BearSSL::WiFiClientSecure client;
  client.setInsecure();  // skip cert validation — acceptable for IoT
  HTTPClient http;
  String url = String(API_ENDPOINT) + "/api/readings";
  http.begin(client, url);
  http.setTimeout(10000);  // 10s timeout — prevents infinite hang
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
  WiFi.mode(WIFI_OFF);
  Serial.printf("Sleeping for %d seconds...\n", SLEEP_SECONDS);
  Serial.flush();
  ESP.deepSleep(SLEEP_SECONDS * 1000000ULL);
}

void loop() {
  // Never reached — deep sleep resets the chip and re-runs setup()
}
