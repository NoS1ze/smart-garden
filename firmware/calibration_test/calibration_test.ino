// Minimal soil moisture calibration sketch for NodeMCU ESP8266
// Reads A0 every 2 seconds and prints to serial. No WiFi needed.

#define SENSOR_POWER_PIN D5  // GPIO14

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("=== Soil Moisture Calibration ===");

  pinMode(SENSOR_POWER_PIN, OUTPUT);
}

void loop() {
  // Power on sensor
  digitalWrite(SENSOR_POWER_PIN, HIGH);
  delay(100);

  // Read 10 samples
  int sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(A0);
    delay(10);
  }
  int avg = sum / 10;

  // Power off sensor
  digitalWrite(SENSOR_POWER_PIN, LOW);

  Serial.printf("A0 raw (avg of 10): %d\n", avg);
  delay(2000);
}
