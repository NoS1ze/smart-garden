/*
 * Smart Garden - DIY MORE ESP32 Sensor Board
 * Board: ESP32-D0WDQ6 (DIY MORE prebuilt board with 18650 holder)
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

#include "config.h"

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
  Serial.printf("Sleeping for %d seconds...\n", SLEEP_SECONDS);
  Serial.flush();
  esp_sleep_enable_timer_wakeup((uint64_t)SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  btStop();  // disable BT controller — never used, saves idle current

  Serial.begin(115200);
  Serial.println();
  Serial.println("Smart Garden - DIY MORE ESP32");
  Serial.println("=============================");

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

  // Start WiFi now so it connects during the mandatory DHT11 warm-up delay below
  WiFi.persistent(false);
  WiFi.setAutoReconnect(false);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // DHT11 needs ~1s to stabilize after power-on (BH1750 200ms + WiFi connect overlap here)
  delay(1000);
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

  // --- Step 4: Build JSON payload ---
  JsonDocument doc;
  doc["mac"] = macAddress;
  JsonArray readings = doc["readings"].to<JsonArray>();
  doc["recorded_at"] = epochTime;
  doc["adc_bits"] = 12;
  doc["board_type"] = "diymore_dht11";
  doc["raw_dry"] = RAW_DRY;
  doc["raw_wet"] = RAW_WET;

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

  // Light
  if (lux >= 0) {
    JsonObject luxReading = readings.add<JsonObject>();
    luxReading["metric"] = "light_lux";
    luxReading["value"] = round(lux * 10.0) / 10.0;
  }

  String payload;
  serializeJson(doc, payload);
  Serial.printf("Payload: %s\n", payload.c_str());

  // --- Step 5: POST to API ---
  WiFiClientSecure client;
  client.setInsecure();  // skip cert validation — acceptable for IoT
  HTTPClient http;
  String url = String(API_ENDPOINT) + "/api/readings";
  http.begin(client, url);
  http.setTimeout(10000);  // 10s timeout — prevents infinite hang on bad connection
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
