//
// ---------- Lego Interface A 9750 BT Driver for ESP32 WROOM
// ---------- MUST USE ESP32 Board Package V2.0.17 using the Board Management in Tools menu of Arduino IDE.
//

#include "BluetoothSerial.h"

// Instantiate Bluetooth Classic (Requires standard dual-core ESP32 WROOM)
BluetoothSerial SerialBT;

// --- GPIO PIN MAPPING (3.3V Side going to Level Shifter) ---
const int OutputPins[] = {12, 13, 14, 25, 26, 27}; 
const int InputPins[]  = {32, 33};                 

// --- State Engine Tracking Variables ---
uint8_t currentOutputByte = 0x00;
uint8_t lastReportedInputs = 0x00;

void setup() {
  Serial.begin(115200);
  Serial.println("--- Windows 11 Compatible LEGO Bluetooth Gateway Booting ---");

  // Initialize physical Output GPIOs
  for (int i = 0; i < 6; i++) {
    pinMode(OutputPins[i], OUTPUT);
    digitalWrite(OutputPins[i], LOW); // Force 0V on power-up for safety
  }

  // Initialize physical Input GPIOs
  for (int i = 0; i < 2; i++) {
    pinMode(InputPins[i], INPUT);
  }

  // Open the Bluetooth broadcast engine
  SerialBT.begin("LEGO_InterfaceA_BT"); 
  Serial.println("HC-05 Standard SPP Profile Broadcast Active!");
}

void loop() {
  // CRITICAL PROTECTION BLOCK FOR 2.x CORE: 
  // Only execute logic loops if a PC client has safely bound to the RFCOMM socket
  if (!SerialBT.hasClient()) {
    // Turn off all LEGO motors for safety if connection drops
    for (int i = 0; i < 6; i++) { digitalWrite(OutputPins[i], LOW); }
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

    // Write physical states to the output pins
    for (int i = 0; i < 6; i++) {
      digitalWrite(OutputPins[i], (currentOutputByte & (1 << i)) ? HIGH : LOW);
    }
    
    // Direct specs requirement: Flush any redundant bytes sitting in the queue
    while(SerialBT.available() > 0) { SerialBT.read(); }
    
    forceUpdate = true; 
  }

  // --- STEP C: Asynchronous State-Change Evaluation (Lego Lines Style) ---
  if (currentInputs != lastReportedInputs) {
    forceUpdate = true;
  }

  // --- STEP D: Safe Overwrite Data Transmission ---
  if (forceUpdate) {
    // Combine outputs with the fresh real-time sensor states
    uint8_t returnByte = (currentOutputByte & 0x3F) | currentInputs;

    // Send the fresh data packet down the wireless pipe instantly
    SerialBT.write(returnByte);

    // Save tracking states for the next pass
    lastReportedInputs = currentInputs;
  }

  // Microsecond execution delay to keep the radio pipeline healthy
  delayMicroseconds(100); 
}
