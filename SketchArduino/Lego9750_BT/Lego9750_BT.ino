#include "BluetoothSerial.h"

BluetoothSerial SerialBT;

// --- GPIO PIN MAPPING (3.3V Side going to Level Shifter) ---
const int OutputPins[] = {12, 13, 14, 25, 26, 27}; 
const int InputPins[]  = {32, 33};                 

// --- State Engine Tracking Variables ---
uint8_t currentOutputByte = 0x00;
uint8_t lastReportedInputs = 0x00;

// --- IDLE TIMING KEEPALIVE ---
unsigned long lastTxTime = 0; 
const unsigned long HEARTBEAT_INTERVAL = 3000; // Force a pulse every 3 seconds if idle

void setup() {
  Serial.begin(115200);
  Serial.println("--- Restored Fast Bluetooth Interface A Gateway Booting ---");

  // Initialize physical Output GPIOs
  for (int i = 0; i < 6; i++) {
    pinMode(OutputPins[i], OUTPUT);
    digitalWrite(OutputPins[i], LOW); // Safe default
  }

  // Initialize physical Input GPIOs
  for (int i = 0; i < 2; i++) {
    pinMode(InputPins[i], INPUT);
  }

  // Open the Bluetooth broadcast engine
  SerialBT.begin("LEGO_InterfaceA_BT"); 
  Serial.println("SPP Profile Broadcast Active!");
}

void loop() {
  // Safe Client Guard Check: Keep everything dark if no PC is bound
  if (!SerialBT.hasClient()) {
    for (int i = 0; i < 6; i++) { digitalWrite(OutputPins[i], LOW); }
    currentOutputByte = 0x00;
    delay(100);
    return;
  }

  // --- STEP A: Read Live Microcontroller Pins ---
  uint8_t currentInputs = 0x00;
  if (digitalRead(InputPins[0]) == HIGH) currentInputs |= 0x40; // Pin D6 (Bit 6)
  if (digitalRead(InputPins[1]) == HIGH) currentInputs |= 0x80; // Pin D7 (Bit 7)

  bool forceUpdate = false;

  // --- STEP B: Process Inbound Motor Commands (TCLogo Style) ---
  if (SerialBT.available() > 0) {
    uint8_t inboundByte = SerialBT.read();
    currentOutputByte = inboundByte & 0x3F; // Isolate D0-D5

    // Physical write to pins
    for (int i = 0; i < 6; i++) {
      digitalWrite(OutputPins[i], (currentOutputByte & (1 << i)) ? HIGH : LOW);
    }
    
    // Clear out any redundant bytes sitting in the queue
    while(SerialBT.available() > 0) { SerialBT.read(); }
    
    forceUpdate = true; 
  }

  // --- STEP C: Asynchronous State-Change Evaluation (Lego Lines Style) ---
  if (currentInputs != lastReportedInputs) {
    forceUpdate = true;
  }

  // --- STEP D: Automated Idle Heartbeat ---
  // If the model sits completely still, force a pulse to keep the PC radio awake
  if (millis() - lastTxTime >= HEARTBEAT_INTERVAL) {
    forceUpdate = true;
  }

  // --- STEP E: Unblocked Fast Transmission ---
  if (forceUpdate) {
    // Assemble the universal 8-bit handshake register byte
    uint8_t returnByte = (currentOutputByte & 0x3F) | currentInputs;

    // Send the data packet down the wireless pipe instantly
    SerialBT.write(returnByte);
       
    // Lock in the tracking markers
    lastReportedInputs = currentInputs;
    lastTxTime = millis(); 
  }

  // Microsecond execution delay to keep the radio pipeline healthy
  delayMicroseconds(100); 
}
