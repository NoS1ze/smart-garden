/*
 * NodeMCU I2C Test — scans bus + tries HDC1080 + CCS811
 * Pins: D5 (GPIO14) = SCL, D6 (GPIO12) = SDA
 * No sleep — loops every 2 seconds
 */

#include <Wire.h>
#include <ClosedCube_HDC1080.h>
#include <Adafruit_CCS811.h>

#define I2C_SCL D5
#define I2C_SDA D6

ClosedCube_HDC1080 hdc1080;
Adafruit_CCS811 ccs;
bool ccsFound = false;

void i2cScan() {
  Serial.println("--- I2C Scan ---");
  int found = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();
    if (err == 0) {
      Serial.printf("  Found device at 0x%02X", addr);
      if (addr == 0x40) Serial.print(" (HDC1080)");
      if (addr == 0x5A) Serial.print(" (CCS811 default)");
      if (addr == 0x5B) Serial.print(" (CCS811 alt)");
      if (addr == 0x23 || addr == 0x5C) Serial.print(" (BH1750)");
      Serial.println();
      found++;
    }
  }
  if (found == 0) Serial.println("  No devices found");
  Serial.println();
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("NodeMCU I2C Test");
  Serial.println("================");
  Serial.printf("SCL: D5 (GPIO14), SDA: D6 (GPIO12)\n\n");

  Wire.begin(I2C_SDA, I2C_SCL);

  i2cScan();

  // HDC1080
  hdc1080.begin(0x40);
  Serial.printf("HDC1080 manufacturer: 0x%X, device: 0x%X\n",
                hdc1080.readManufacturerId(), hdc1080.readDeviceId());

  // CCS811 — try both addresses (0x5A = ADDR low, 0x5B = ADDR high)
  Serial.println();
  Serial.println("--- CCS811 Init ---");
  for (uint8_t addr : {0x5A, 0x5B}) {
    Adafruit_CCS811 testCcs;
    if (testCcs.begin(addr)) {
      Serial.printf("CCS811 responded at 0x%02X\n", addr);
      ccsFound = true;
      ccs.begin(addr);
      break;
    } else {
      Serial.printf("CCS811 not at 0x%02X\n", addr);
    }
  }
  if (!ccsFound) Serial.println("CCS811 not found at any address.");
  Serial.println();
}

void loop() {
  // HDC1080
  float temp = hdc1080.readTemperature();
  float hum  = hdc1080.readHumidity();
  Serial.printf("HDC1080: %.1fC  %.1f%%\n", temp, hum);

  // CCS811
  if (ccsFound) {
    bool dataReady = ccs.available();
    Serial.printf("CCS811:  dataReady=%d  error=%d", dataReady, ccs.checkError());
    if (dataReady) {
      ccs.setEnvironmentalData(hum, temp);
      if (!ccs.readData()) {
        Serial.printf("  CO2=%d ppm  TVOC=%d ppb", ccs.geteCO2(), ccs.getTVOC());
      } else {
        Serial.print("  read error");
      }
    }
    Serial.println();
  } else {
    Serial.println("CCS811:  not found");
  }

  Serial.println();
  delay(2000);
}
