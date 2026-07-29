// Lego Interface A – Dual Protocol (TCLOGO + Blockly) – V3
// Board: Arduino UNO / NANO
// 115200 baud, TCLOGO bit‑bang + Blockly
// NON‑BLOCKING TCLOGO timing (no delayMicroseconds)


// ---------------- Pin mapping ----------------
const uint8_t OUT_PINS[6]      = {3, 5, 6, 9, 10, 11};  // Outputs 0-5
const uint8_t IN_PINS[2]       = {7, 8};                // Inputs 6-7
const uint8_t OUT_STS_PINS[2]  = {12, 13};              // Output Pins for Inputs 6-7 Status
const uint8_t IR_PINS[2]       = {2, 4};                // Outputs 2 and 4 for Power Function IR Led Emitter


// ---------------- Protocol constants ----------------
const uint8_t HEADER0 = 0xA1;
const uint8_t HEADER1 = 0xAF;

const unsigned long PACKET_INTERVAL_US   = 5000; // 5 ms
const unsigned long KEEPALIVE_TIMEOUT_MS = 3000; // 3 seconds


// ---------------- Input state / counters ----------------
uint8_t inputState[2]     = {0, 0};
uint8_t lastInputState[2] = {0, 0};
uint8_t edgeCount[2]      = {0, 0};


// ---------------- Output tracking ----------------
uint8_t pwmValues[6] = {0,0,0,0,0,0};


// ---------------- Timing ----------------
unsigned long lastPacketTime  = 0;
unsigned long lastCommandTime = 0;


// ---------------- Handshake strings ----------------
const char *HANDSHAKE_JS  = "###Do you byte, when I knock?$$$";
const char *HANDSHAKE_ARD = "###Just a bit off the block!$$$";


// ---------------- State ----------------
bool connected = false;


// =========================================================
// MODE SELECTION
// =========================================================
enum InterfaceMode {
  MODE_NONE,
  MODE_LEGACY,
  MODE_BLOCKLY
};

InterfaceMode currentMode = MODE_NONE;

// =========================================================
//                     HANDSHAKE (Blockly)
// =========================================================
void waitForHandshake_Blockly() {
  const size_t targetLen = strlen(HANDSHAKE_JS);
  size_t idx = 0;

  while (true) {
    if (Serial.available()) {
      char c = (char)Serial.read();
      if (c == HANDSHAKE_JS[idx]) {
        idx++;
        if (idx >= targetLen) {
          Serial.print(HANDSHAKE_ARD);
          Serial.flush();
          delay(50);
          return;
        }
      } else {
        idx = 0;
      }
    }
  }
}

// =========================================================
//                     COMMAND HANDLING (Blockly)
// =========================================================
void handleCommands_Blockly() {
  while (Serial.available()) {

    uint8_t cmd = (uint8_t)Serial.read();
    lastCommandTime = millis(); // keep-alive refresh

    // ---------------- KEEP ALIVE (0x02) ----------------
    if (cmd == 0x02) {
      return; // nothing else to read
    }

    // ---------------- FORCE DISCONNECT (0x70) ----------------
    if (cmd == 0x70) {
      // Reset outputs
      for (uint8_t i = 0; i < 6; i++) {
        pwmValues[i] = 0;
        analogWrite(OUT_PINS[i], 0);
      }

      connected   = false;
      currentMode = MODE_NONE;

      // Flush serial buffer
      while (Serial.available()) Serial.read();
      return;
    }

    // ---------------- PWM COMMAND (0x9p + value) ----------------
    if ((cmd & 0xF0) == 0x90) {
      while (!Serial.available()); // wait for value byte
      uint8_t val = (uint8_t)Serial.read();

      uint8_t port = cmd & 0x0F;
      if (port < 6) {
        pwmValues[port] = val;
        analogWrite(OUT_PINS[port], val);
      }
      return;
    }

    // Unknown command → ignore
  }
}

// =========================================================
//                     INPUT POLLING (Blockly)
// =========================================================
void pollInputs_Blockly() {
  for (uint8_t i = 0; i < 2; i++) {
    uint8_t current = digitalRead(IN_PINS[i]) ? 1 : 0;
    digitalWrite(OUT_STS_PINS[i], current);

    if (current != lastInputState[i]) {
      lastInputState[i] = current;
      inputState[i]     = current;

      if (edgeCount[i] < 255) edgeCount[i]++;
    }
  }
}

// =========================================================
//                     STATUS PACKET (Blockly)
// =========================================================
void sendStatusPacket_Blockly() {
  uint8_t buf[11];

  buf[0] = HEADER0;
  buf[1] = HEADER1;

  // Outputs
  for (uint8_t i = 0; i < 6; i++) {
    buf[2 + i] = pwmValues[i];
  }

  // Inputs
  for (uint8_t i = 0; i < 2; i++) {
    uint8_t state = inputState[i] & 0x01;

    uint8_t rate;
    if (edgeCount[i] == 0)      rate = 0;
    else if (edgeCount[i] == 1) rate = 1;
    else if (edgeCount[i] == 2) rate = 2;
    else                        rate = 3;

    buf[8 + i] = (state) | (rate << 1);
    edgeCount[i] = 0;
  }

  // Checksum
  uint16_t sum = 0;
  for (uint8_t i = 0; i < 10; i++) sum += buf[i];
  buf[10] = (uint8_t)(sum & 0xFF);

  Serial.write(buf, 11);
}

// =========================================================
// LEGACY BIT-BANG MODE (TCLOGO) — NON-BLOCKING
// =========================================================
uint8_t  legacyOutputByte   = 0x00;
uint8_t  legacyLastInputs   = 0x00;
unsigned long legacyLastTxTime = 0;
const unsigned long LEGACY_HEARTBEAT_INTERVAL = 3000; // ms
static uint32_t lastApplyUs = 0;

void loopLegacy_TCLOGO() {
  // Read inputs for status
  uint8_t currentInputs = 0x00;
  if (digitalRead(IN_PINS[0]) == HIGH) currentInputs |= 0x40; // bit 6
  if (digitalRead(IN_PINS[1]) == HIGH) currentInputs |= 0x80; // bit 7
  bool forceUpdate = false;

  // Check if Blockly handshake is starting
  if (Serial.available() > 0) {
    uint8_t peekByte = (uint8_t)Serial.peek();
    if (peekByte == '#') {
      waitForHandshake_Blockly();
      currentMode     = MODE_BLOCKLY;
      lastPacketTime  = micros();
      lastCommandTime = millis();
      return;
    }

    uint32_t interval = (Serial.available() > 8) ? 900 : 1000;
    if ((uint32_t)(micros() - lastApplyUs) >= interval) {
      uint8_t inboundByte = (uint8_t)Serial.read();
      legacyOutputByte = inboundByte & 0x3F;

      // Update outputs (pure ON/OFF, TCLOGO does PWM itself)
      for (int i = 0; i < 6; i++) {
        uint8_t val = (legacyOutputByte & (1 << i)) ? 255 : 0;
        analogWrite(OUT_PINS[i], val);
      }

      forceUpdate = true;
      lastApplyUs = micros();
    }

  }

  if (currentInputs != legacyLastInputs) {
    forceUpdate = true;
  }

  if (millis() - legacyLastTxTime >= LEGACY_HEARTBEAT_INTERVAL) {
    forceUpdate = true;
  }

  if (forceUpdate) {
    uint8_t returnByte = (legacyOutputByte & 0x3F) | currentInputs;
    Serial.write(returnByte);
    legacyLastInputs = currentInputs;
    legacyLastTxTime = millis();
  }

}

// =========================================================
//                     SETUP
// =========================================================
void setup() {
  // PWM outputs
  for (uint8_t i = 0; i < 6; i++) {
    pinMode(OUT_PINS[i], OUTPUT);
    analogWrite(OUT_PINS[i], 0);
  }

  // Inputs
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(IN_PINS[i], INPUT_PULLUP);
    pinMode(OUT_STS_PINS[i], OUTPUT);
    digitalWrite(OUT_STS_PINS[i],0);
    lastInputState[i] = digitalRead(IN_PINS[i]) ? 1 : 0;
    inputState[i]     = lastInputState[i];
    edgeCount[i]      = 0;
  }

  Serial.begin(115200);
  delay(50);
  Serial.println("READY");

  connected   = false;
  currentMode = MODE_NONE;
}

// =========================================================
//                     MAIN LOOP
// =========================================================
void loop() {
  if (!connected) {
    // First contact: assume legacy TCLOGO by default
    connected       = true;
    currentMode     = MODE_LEGACY;
    lastPacketTime  = micros();
    lastCommandTime = millis();
  }

  if (currentMode == MODE_BLOCKLY) {
    handleCommands_Blockly();

    // Check keep-alive timeout
    if ((millis() - lastCommandTime) > KEEPALIVE_TIMEOUT_MS) {
      // Reset outputs
      for (uint8_t i = 0; i < 6; i++) {
        pwmValues[i] = 0;
        analogWrite(OUT_PINS[i], 0);
      }

      connected = false;

      // Flush serial buffer
      while (Serial.available()) Serial.read();

      currentMode = MODE_NONE;
      return;
    }

    // Poll inputs
    pollInputs_Blockly();

    // Send status packet periodically
    unsigned long now = micros();
    if ((now - lastPacketTime) >= PACKET_INTERVAL_US) {
      lastPacketTime = now;
      sendStatusPacket_Blockly();
    }
  } else if (currentMode == MODE_LEGACY) {
    loopLegacy_TCLOGO();
  } else {
    currentMode = MODE_LEGACY;
  }
}
