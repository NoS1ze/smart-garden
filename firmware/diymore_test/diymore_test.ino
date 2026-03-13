/*
 * DIY MORE ESP32 - Sensor Test Sketch
 * No WiFi, no sleep — reads all sensors in a loop every 2s.
 * Used for hardware debugging (soldering check etc.)
 *
 * Pins:
 *   SENSOR_POWER_PIN = 26  (DHT11 + soil VCC)
 *   LIGHT_POWER_PIN  = 14  (BH1750 VCC)
 *   DHT11 data       = 22
 *   Soil signal      = 32 and 33 (both read, prints each)
 *   BH1750 SDA       = 25
 *   BH1750 SCL       = 27
 */

#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>

#define DHT_PIN          22
#define DHT_TYPE         DHT11
#define SOIL_PIN_A       32
#define SOIL_PIN_B       33
#define SENSOR_POWER_PIN 26   // DHT11 power
#define SOIL_POWER_PIN   12   // soil sensor power (split from DHT11)
#define LIGHT_POWER_PIN  14
#define I2C_SDA          25
#define I2C_SCL          27

DHT dht(DHT_PIN, DHT_TYPE);
BH1750 lightMeter;
bool lightReady = false;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== DIY MORE Sensor Test ===");

  // Power on sensors
  pinMode(SENSOR_POWER_PIN, OUTPUT);
  pinMode(SOIL_POWER_PIN, OUTPUT);
  pinMode(LIGHT_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  digitalWrite(SOIL_POWER_PIN, HIGH);
  digitalWrite(LIGHT_POWER_PIN, HIGH);

  // ADC config
  analogReadResolution(12);
  analogSetPinAttenuation(SOIL_PIN_A, ADC_11db);
  analogSetPinAttenuation(SOIL_PIN_B, ADC_11db);

  // DHT
  dht.begin();

  // I2C scan
  Wire.begin(I2C_SDA, I2C_SCL);
  Serial.printf("I2C scan (SDA=%d, SCL=%d): ", I2C_SDA, I2C_SCL);
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("0x%02X ", addr);
      found++;
    }
  }
  if (found == 0) Serial.print("none");
  Serial.printf(" (%d devices)\n", found);

  // BH1750
  lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x23);
  if (!lightReady) {
    lightReady = lightMeter.begin(BH1750::ONE_TIME_HIGH_RES_MODE, 0x5C);
    if (lightReady) Serial.println("BH1750: found at 0x5C");
    else             Serial.println("BH1750: NOT FOUND");
  } else {
    Serial.println("BH1750: found at 0x23");
  }

  delay(1000); // let DHT stabilize
  Serial.println("Starting sensor loop...\n");
}

void loop() {
  Serial.println("--- Reading ---");

  // Soil: read both pins, 10-sample average
  int sumA = 0, sumB = 0;
  for (int i = 0; i < 10; i++) {
    sumA += analogRead(SOIL_PIN_A);
    sumB += analogRead(SOIL_PIN_B);
    delay(10);
  }
  int avgA = sumA / 10;
  int avgB = sumB / 10;
  int chosen = max(avgA, avgB);
  int chosenPin = (avgA >= avgB) ? SOIL_PIN_A : SOIL_PIN_B;
  Serial.printf("  Soil GPIO32: %d  |  GPIO33: %d  →  using GPIO%d = %d\n",
                avgA, avgB, chosenPin, chosen);

  // DHT11
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();
  if (isnan(temp) || isnan(hum)) {
    Serial.println("  DHT11: READ ERROR");
  } else {
    Serial.printf("  DHT11 Temp: %.1f C  Humidity: %.1f %%\n", temp, hum);
  }

  // BH1750
  if (lightReady) {
    lightMeter.configure(BH1750::ONE_TIME_HIGH_RES_MODE);
    delay(200);
    float lux = lightMeter.readLightLevel();
    Serial.printf("  BH1750 Light: %.1f lux\n", lux);
  } else {
    Serial.println("  BH1750: not available");
  }

  Serial.println();
  delay(2000);
}
