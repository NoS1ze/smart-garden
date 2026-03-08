// Test sketch: GPIO scanner for soil + DHT11 with GPIO26 power control
// Scans multiple GPIOs to find DHT11 and soil sensor on unknown boards

#include <WiFi.h>
#include <DHT.h>

#define SENSOR_POWER_PIN 26

// Soil ADC pins to scan
const int soilPins[] = {32, 33, 34, 35, 36, 39};
const int numSoilPins = sizeof(soilPins) / sizeof(soilPins[0]);

// DHT candidate GPIOs (common on DIY MORE boards)
const int dhtPins[] = {4, 5, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 27};
const int numDhtPins = sizeof(dhtPins) / sizeof(dhtPins[0]);

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== GPIO Scanner: Soil + DHT11 ===");
  WiFi.mode(WIFI_STA);
  delay(100);
  Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);

  pinMode(SENSOR_POWER_PIN, OUTPUT);
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  Serial.println("GPIO26 power ON");

  analogReadResolution(12);
  for (int i = 0; i < numSoilPins; i++) {
    analogSetPinAttenuation(soilPins[i], ADC_11db);
  }

  delay(2000);  // Let sensors stabilize

  // --- Scan ADC pins for soil ---
  Serial.println("\n--- ADC Scan (soil) ---");
  for (int i = 0; i < numSoilPins; i++) {
    int sum = 0;
    for (int j = 0; j < 10; j++) {
      sum += analogRead(soilPins[i]);
      delay(10);
    }
    int avg = sum / 10;
    Serial.printf("  GPIO%d: %d%s\n", soilPins[i], avg, avg > 500 ? " <-- signal" : "");
  }

  // --- Scan GPIOs for DHT11 ---
  Serial.println("\n--- DHT11 Scan ---");
  for (int i = 0; i < numDhtPins; i++) {
    DHT testDht(dhtPins[i], DHT11);
    testDht.begin();
    delay(500);
    float t = testDht.readTemperature();
    float h = testDht.readHumidity();
    if (!isnan(t) && !isnan(h)) {
      Serial.printf("  GPIO%d: FOUND! Temp=%.1fC Hum=%.1f%%\n", dhtPins[i], t, h);
    } else {
      Serial.printf("  GPIO%d: no response\n", dhtPins[i]);
    }
  }

  Serial.println("\n--- Continuous readings (GPIO32/33 + GPIO22 DHT) ---");

  // Set up default DHT for continuous loop
  analogSetPinAttenuation(32, ADC_11db);
  analogSetPinAttenuation(33, ADC_11db);
}

DHT dht(22, DHT11);
bool dhtStarted = false;

void loop() {
  if (!dhtStarted) {
    dht.begin();
    delay(1000);
    dhtStarted = true;
  }

  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(1000);

  int a = analogRead(32);
  int b = analogRead(33);

  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  if (isnan(temp) || isnan(hum)) {
    Serial.printf("GPIO32: %4d  GPIO33: %4d  DHT11(22): failed\n", a, b);
  } else {
    Serial.printf("GPIO32: %4d  GPIO33: %4d  Temp: %.1fC  Hum: %.1f%%\n", a, b, temp, hum);
  }

  digitalWrite(SENSOR_POWER_PIN, LOW);
  delay(2000);
}
