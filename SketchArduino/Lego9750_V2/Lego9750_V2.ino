// Lego Interface A – Optimized Driver (v2)
// Board: Arduino UNO / NANO

// ---------------- Pin mapping ----------------
const uint8_t OUT_PINS[6] = {3, 5, 6, 9, 10, 11};  // Outputs 0-5
const uint8_t IN_PINS[2]  = {12, 13};             // Inputs 6-7

// ---------------- Protocol constants ----------------
const uint8_t HEADER0 = 0xA1;
const uint8_t HEADER1 = 0xAF;

const unsigned long PACKET_INTERVAL_US = 5000; // 5 ms
const unsigned long KEEPALIVE_TIMEOUT_MS = 2000; // 2 seconds

// ---------------- Input state / counters ----------------
uint8_t inputState[2] = {0, 0};
uint8_t lastInputState[2] = {0, 0};
uint8_t edgeCount[2] = {0, 0};

// ---------------- Output tracking ----------------
uint8_t pwmValues[6] = {0,0,0,0,0,0};

// ---------------- Timing ----------------
unsigned long lastPacketTime = 0;
unsigned long lastCommandTime = 0;

// ---------------- Handshake strings ----------------
const char *HANDSHAKE_JS  = "###Do you byte, when I knock?$$$";
const char *HANDSHAKE_ARD = "###Just a bit off the block!$$$";

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
    lastInputState[i] = digitalRead(IN_PINS[i]) ? 1 : 0;
    inputState[i]     = lastInputState[i];
    edgeCount[i]      = 0;
  }

  Serial.begin(115200);
  delay(50);
  Serial.println("READY");
}

// =========================================================
//                     MAIN LOOP
// =========================================================
void loop() {
  if (!connected) {
    waitForHandshake();
    connected = true;
    lastPacketTime = micros();
    lastCommandTime = millis();
  }

  // 1) Handle incoming commands
  handleCommands();

  // 2) Check keep-alive timeout
  if ((millis() - lastCommandTime) > KEEPALIVE_TIMEOUT_MS) {
    forceDisconnect();
    return;
  }

  // 3) Poll inputs
  pollInputs();

  // 4) Send status packet periodically
  unsigned long now = micros();
  if ((now - lastPacketTime) >= PACKET_INTERVAL_US) {
    lastPacketTime = now;
    sendStatusPacket();
  }
}

// =========================================================
//                     HANDSHAKE
// =========================================================
void waitForHandshake() {
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
          return;
        }
      } else {
        idx = 0;
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
    lastCommandTime = millis(); // keep-alive refresh

    // ---------------- KEEP ALIVE (0x02) ----------------
    if (cmd == 0x02) {
      return; // nothing else to read
    }

    // ---------------- FORCE DISCONNECT (0x70) ----------------
    if (cmd == 0x70) {
      forceDisconnect();
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
//                     INPUT POLLING
// =========================================================
void pollInputs() {
  for (uint8_t i = 0; i < 2; i++) {
    uint8_t current = digitalRead(IN_PINS[i]) ? 1 : 0;

    if (current != lastInputState[i]) {
      lastInputState[i] = current;
      inputState[i]     = current;

      if (edgeCount[i] < 255) edgeCount[i]++;
    }
  }
}

// =========================================================
//                     STATUS PACKET
// =========================================================
void sendStatusPacket() {
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
//                     FORCE DISCONNECT
// =========================================================
void forceDisconnect() {
  // Reset outputs
  for (uint8_t i = 0; i < 6; i++) {
    pwmValues[i] = 0;
    analogWrite(OUT_PINS[i], 0);
  }

  connected = false;

  // Flush serial buffer
  while (Serial.available()) Serial.read();
}
