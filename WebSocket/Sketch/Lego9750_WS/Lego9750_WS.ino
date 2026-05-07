// Lego Interface A – Optimized Driver (v2, WebSocket Edition)
// Board: Arduino UNO / NANO

// ---------------- Pin mapping ----------------
const uint8_t OUT_PINS[6] = {3, 5, 6, 9, 10, 11};  // Outputs 0-5
const uint8_t IN_PINS[2]  = {7, 8};               // Inputs 6-7
const uint8_t OUT_STS_PINS[2]  = {12, 13};         // Output Pins for Inputs 6-7 Status

// ---------------- Protocol constants ----------------
const uint8_t HEADER0 = 0xA1;
const uint8_t HEADER1 = 0xAF;

const unsigned long HEARTBEAT_INTERVAL_MS = 100;   // Send packet every 100ms even if no change
const unsigned long KEEPALIVE_TIMEOUT_MS  = 8000;  // JS must send 0x02 every 1.9s

// ---------------- Binary handshake ----------------
const uint8_t HS[3] = {0xAA, 0x55, 0xA5};
uint8_t hsIndex = 0;

// ---------------- Input state / counters ----------------
uint8_t inputState[2] = {0, 0};
uint8_t lastInputState[2] = {0, 0};
uint8_t edgeCount[2] = {0, 0};

// ---------------- Output tracking ----------------
uint8_t pwmValues[6]    = {0,0,0,0,0,0};
uint8_t lastSentPwm[6]  = {0,0,0,0,0,0};

// ---------------- Timing ----------------
unsigned long lastPacketMs  = 0;
unsigned long lastCommandMs = 0;

// ---------------- State ----------------
bool connected = false;

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

  // High-speed UART for ESP32 bridge
  Serial.begin(115200);
  delay(20);
}

// =========================================================
//                     MAIN LOOP
// =========================================================
void loop() {
  if (!connected) {
    waitForBinaryHandshake();
    connected      = true;
    lastPacketMs   = millis();
    lastCommandMs  = millis();
  }

  handleCommands();
  pollInputs();

  unsigned long now = millis();

  bool changed = inputsChanged() || outputsChanged();

  if (changed || (now - lastPacketMs) >= HEARTBEAT_INTERVAL_MS) {
    lastPacketMs = now;
    sendStatusPacket();
    saveLastSentOutputs();
  }

  if ((now - lastCommandMs) > KEEPALIVE_TIMEOUT_MS) {
    forceDisconnect();
  }
}

// =========================================================
//                     BINARY HANDSHAKE
// =========================================================
void waitForBinaryHandshake() {
  // Wait until we see the 3-byte signature 0xAA 0x55 0xA5
  hsIndex = 0;

  while (true) {
    if (Serial.available()) {
      uint8_t b = (uint8_t)Serial.read();

      if (b == HS[hsIndex]) {
        hsIndex++;
        if (hsIndex >= 3) {
          // Full signature matched
          return;
        }
      } else {
        // Reset if mismatch
        hsIndex = 0;
        // If this byte matches first HS byte, start from 1
        if (b == HS[0]) {
          hsIndex = 1;
        }
      }
    }
  }
}

// =========================================================
//                     COMMAND HANDLING
// =========================================================
void handleCommands() {
  while (Serial.available()) {
    uint8_t cmd = (uint8_t)Serial.read();
    lastCommandMs = millis();

    if (cmd == 0x02) return;       // KEEP ALIVE
    if (cmd == 0x70) { forceDisconnect(); return; }

    if ((cmd & 0xF0) == 0x90) {
      while (!Serial.available());
      uint8_t val  = (uint8_t)Serial.read();
      uint8_t port = cmd & 0x0F;

      if (port < 6) {
        pwmValues[port] = val;
        analogWrite(OUT_PINS[port], val);
      }
      return;
    }
  }
}

// =========================================================
//                     INPUT POLLING
// =========================================================
void pollInputs() {
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
//                     CHANGE DETECTION
// =========================================================
bool inputsChanged() {
  return (edgeCount[0] > 0) || (edgeCount[1] > 0);
}

bool outputsChanged() {
  for (uint8_t i = 0; i < 6; i++) {
    if (pwmValues[i] != lastSentPwm[i]) return true;
  }
  return false;
}

void saveLastSentOutputs() {
  for (uint8_t i = 0; i < 6; i++) {
    lastSentPwm[i] = pwmValues[i];
  }
}

// =========================================================
//                     STATUS PACKET
// =========================================================
void sendStatusPacket() {
  uint8_t buf[11];

  buf[0] = HEADER0;
  buf[1] = HEADER1;

  for (uint8_t i = 0; i < 6; i++) {
    buf[2 + i] = pwmValues[i];
  }

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

  uint16_t sum = 0;
  for (uint8_t i = 0; i < 10; i++) sum += buf[i];
  buf[10] = (uint8_t)(sum & 0xFF);

  Serial.write(buf, 11);
}

// =========================================================
//                     FORCE DISCONNECT
// =========================================================
void forceDisconnect() {
  for (uint8_t i = 0; i < 6; i++) {
    pwmValues[i] = 0;
    analogWrite(OUT_PINS[i], 0);
  }

  connected = false;
  while (Serial.available()) Serial.read();
}
