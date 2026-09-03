import serial
s = serial.Serial('/dev/cu.usbserial-0001', 115200, timeout=2)
while True:
    line = s.readline().decode('utf-8', errors='replace').strip()
    if line:
        print(line, flush=True)
