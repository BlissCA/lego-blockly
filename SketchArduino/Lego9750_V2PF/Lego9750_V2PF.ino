// Lego Interface A – Optimized Driver (v2)
// Board: Arduino UNO / NANO
// 2026-06-10: Added Power Function IR support

// ---------------- Pin mapping ----------------
const uint8_t OUT_PINS[6] = {3, 5, 6, 9, 10, 11};  // Outputs 0-5
const uint8_t IN_PINS[2]  = {7, 8};                // Inputs 6-7
const uint8_t OUT_STS_PINS[2]  = {12, 13};         // Output Pins for Inputs 6-7 Status
const uint8_t IR_PINS[2] = {2, 4};                 // Outputs 2 and 4 for Power Function IR Led Emitter (Remote Control)

// ---------------- Protocol constants ----------------
const uint8_t HEADER0 = 0xA1;
const uint8_t HEADER1 = 0xAF;

const unsigned long PACKET_INTERVAL_US = 5000; // 5 ms
const unsigned long KEEPALIVE_TIMEOUT_MS = 3000; // 3 seconds

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


// PF IR variables
const uint8_t PF_IR_PIN = 2;   // D2 (PD2)
// PF mode
#define PF_COMBO_DIRECT_MODE 0x01
#define PF_SINGLE_PIN_CONTINUOUS 0x2
#define PF_SINGLE_PIN_TIMEOUT 0x3
#define PF_SINGLE_OUTPUT 0x4
#define PF_ESCAPE 0x4

// =========================================================
// PF IR QUEUE (8‑slot ring buffer)
// =========================================================

struct PfCmd {
  uint8_t code1;
  uint8_t code2;
  uint8_t channel;
};

PfCmd pf_queue[8];
volatile uint8_t pf_q_head = 0;
volatile uint8_t pf_q_tail = 0;

void pf_enqueue(uint8_t code1, uint8_t code2, uint8_t channel) {
  uint8_t next = (pf_q_head + 1) & 7;
  if (next == pf_q_tail) {
    // Queue full → drop command (or overwrite oldest if you prefer)
    return;
  }
  pf_queue[pf_q_head].code1 = code1;
  pf_queue[pf_q_head].code2 = code2;
  pf_queue[pf_q_head].channel = channel;
  pf_q_head = next;
}

// ---------------- PF IR STATE ----------------
volatile bool pf_busy = false;

volatile uint8_t pf_frame_bytes[2];  // code1, code2
volatile uint8_t pf_bit_index = 0;   // 0..7
volatile uint8_t pf_byte_index = 0;  // 0 or 1
volatile uint8_t pf_repeat = 0;      // 0..5

volatile uint8_t pf_toggle[4] = {0,0,0,0};
volatile uint8_t pf_channel = 0;

volatile bool pf_carrier_enabled = false;

enum PfState {
  PF_IDLE,
  PF_START_BIT_CARRIER,
  PF_START_BIT_PAUSE,
  PF_DATA_BIT_CARRIER,
  PF_DATA_BIT_PAUSE,
  PF_STOP_BIT_CARRIER,
  PF_STOP_BIT_PAUSE,
  PF_INTER_FRAME
};

volatile PfState pf_state = PF_IDLE;
volatile bool pf_current_bit = 0;
volatile uint8_t pf_message_count = 0;

// =========================================================
// TIMER HELPERS
// =========================================================

// Timer1: schedule compare interrupt after `us` microseconds
inline void pf_timer1Schedule(uint16_t us) {
  uint16_t ticks = us * 2; // 0.5 µs per tick
  OCR1A = TCNT1 + ticks;
}

// Timer2: 38 kHz carrier interrupt toggling D2
void pf_initTimer2_carrier() {
  pinMode(PF_IR_PIN, OUTPUT);
  digitalWrite(PF_IR_PIN, LOW);

  // Timer2 CTC mode, prescaler 8 → 0.5 µs per tick
  TCCR2A = 0;
  TCCR2B = 0;

  TCCR2A |= (1 << WGM21); // CTC
  TCCR2B |= (1 << CS21);  // prescaler 8

  // Compare value for ~13 µs half-period:
  // 13 µs / 0.5 µs = 26 ticks
  OCR2A = 26;

  TIMSK2 |= (1 << OCIE2A); // enable interrupt
}

ISR(TIMER2_COMPA_vect) {
  if (pf_carrier_enabled) {
    // Toggle D2 (PD2)
    PIND = (1 << PIND2);
  }
}

// Timer1: PF bit timing
void pf_initTimer1_bits() {
  TCCR1A = 0;
  TCCR1B = 0;

  TCCR1B |= (1 << WGM12); // CTC
  TCCR1B |= (1 << CS11);  // prescaler 8

  TIMSK1 &= ~(1 << OCIE1A); // disabled until needed
}

// =========================================================
// MESSAGE PAUSE (non-blocking)
// =========================================================
uint16_t pf_compute_message_pause_us(uint8_t channel, uint8_t count) {
  uint8_t a = 0;
  if (count == 0)
    a = 4 - channel + 1;
  else if (count == 1 || count == 2)
    a = 5;
  else if (count == 3 || count == 4)
    a = 5 + (channel + 1) * 2;

  return (uint16_t)a * 77;
}

// =========================================================
// START PF FRAME (non-blocking)
// =========================================================
void pf_startFrame(uint8_t code1, uint8_t code2, uint8_t channel) {
  // If busy → queue it
  if (pf_busy) {
    pf_enqueue(code1, code2, channel);
    return;
  }

  // Otherwise start immediately
  pf_frame_bytes[0] = code1;
  pf_frame_bytes[1] = code2;
  pf_bit_index = 0;
  pf_byte_index = 0;
  pf_repeat = 0;
  pf_message_count = 0;
  pf_channel = channel;

  pf_state = PF_START_BIT_CARRIER;
  pf_busy = true;

  TIMSK1 |= (1 << OCIE1A);

  uint16_t pause_us = pf_compute_message_pause_us(channel, pf_message_count);
  pf_message_count++;
  pf_timer1Schedule(pause_us);
}

// =========================================================
// TIMER1 ISR — PF BIT STATE MACHINE
// =========================================================
ISR(TIMER1_COMPA_vect) {
  switch (pf_state) {

    case PF_START_BIT_CARRIER:
      pf_carrier_enabled = true;
      pf_timer1Schedule(156);
      pf_state = PF_START_BIT_PAUSE;
      pf_current_bit = 0;
      break;

    case PF_START_BIT_PAUSE:
      pf_carrier_enabled = false;
      pf_timer1Schedule(1014);
      pf_state = PF_DATA_BIT_CARRIER;
      pf_bit_index = 0;
      pf_byte_index = 0;
      break;

    case PF_DATA_BIT_CARRIER: {
      uint8_t b = pf_frame_bytes[pf_byte_index];
      uint8_t mask = 0x80 >> pf_bit_index;
      pf_current_bit = (b & mask) ? 1 : 0;

      pf_carrier_enabled = true;
      pf_timer1Schedule(156);
      pf_state = PF_DATA_BIT_PAUSE;
      break;
    }

    case PF_DATA_BIT_PAUSE:
      pf_carrier_enabled = false;
      pf_timer1Schedule(pf_current_bit ? 546 : 260);

      pf_bit_index++;
      if (pf_bit_index >= 8) {
        pf_bit_index = 0;
        pf_byte_index++;
        if (pf_byte_index >= 2) {
          pf_state = PF_STOP_BIT_CARRIER;
        } else {
          pf_state = PF_DATA_BIT_CARRIER;
        }
      } else {
        pf_state = PF_DATA_BIT_CARRIER;
      }
      break;

    case PF_STOP_BIT_CARRIER:
      pf_carrier_enabled = true;
      pf_timer1Schedule(156);
      pf_state = PF_STOP_BIT_PAUSE;
      break;

    case PF_STOP_BIT_PAUSE:
      pf_carrier_enabled = false;
      pf_timer1Schedule(1014);
      pf_state = PF_INTER_FRAME;
      break;

    case PF_INTER_FRAME:
      pf_repeat++;
      if (pf_repeat >= 6) {
        // Finished this PF frame
        pf_state = PF_IDLE;
        pf_busy = false;
        TIMSK1 &= ~(1 << OCIE1A);

        // -------------------------------
        // DEQUEUE NEXT COMMAND IF ANY
        // -------------------------------
        if (pf_q_tail != pf_q_head) {
          PfCmd cmd = pf_queue[pf_q_tail];
          pf_q_tail = (pf_q_tail + 1) & 7;
          pf_startFrame(cmd.code1, cmd.code2, cmd.channel);
        }
      } else {
        // Continue with next repeat
        uint16_t pause_us = pf_compute_message_pause_us(pf_channel, pf_message_count);
        pf_message_count++;
        pf_timer1Schedule(pause_us);
        pf_state = PF_START_BIT_CARRIER;
      }
      break;

    case PF_IDLE:
    default:
      TIMSK1 &= ~(1 << OCIE1A);
      pf_busy = false;
      break;
  }
}

// =========================================================
// HIGH-LEVEL PF COMMANDS
// =========================================================
void pf_singleOutput(uint8_t pwm, uint8_t output, uint8_t channel) {
  uint8_t nib1 = pf_toggle[channel] | channel;
  uint8_t nib2 = PF_SINGLE_OUTPUT | output;
  uint8_t nib3 = pwm;
  uint8_t nib4 = 0xF ^ nib1 ^ nib2 ^ nib3;

  uint8_t code1 = (nib1 << 4) | nib2;
  uint8_t code2 = (nib3 << 4) | nib4;

  pf_startFrame(code1, code2, channel);

  pf_toggle[channel] = (pf_toggle[channel] == 0) ? 8 : 0;
}

void pf_comboPWM(uint8_t blue_pwm, uint8_t red_pwm, uint8_t channel) {
  uint8_t nib1 = PF_ESCAPE | channel;
  uint8_t nib2 = blue_pwm;
  uint8_t nib3 = red_pwm;
  uint8_t nib4 = 0xF ^ nib1 ^ nib2 ^ nib3;

  uint8_t code1 = (nib1 << 4) | nib2;
  uint8_t code2 = (nib3 << 4) | nib4;

  pf_startFrame(code1, code2, channel);
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

  // PF IR Pin
  pf_initTimer2_carrier();
  pf_initTimer1_bits();

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

    // ---------------- PF IR COMMAND (0xAx + value for Single Output, 0xBx + value for Combo PWM, x = channel 0, 1, 2, 3) ----------------
    if ((cmd & 0xF0) == 0xA0) {
      while (!Serial.available()); // wait for value byte
      uint8_t val = (uint8_t)Serial.read();

      uint8_t ch = cmd & 0x0F;
      uint8_t pf_out = (val & 0xF0) >> 4;
      uint8_t pf_pwm = val & 0x0F;
      if (ch < 4) {
        pf_singleOutput(pf_pwm, pf_out, ch);
      }
      return;
    }

    if ((cmd & 0xF0) == 0xB0) {
      while (!Serial.available()); // wait for value byte
      uint8_t val = (uint8_t)Serial.read();

      uint8_t ch = cmd & 0x0F;
      uint8_t pf_pwm_b = (val & 0xF0) >> 4;
      uint8_t pf_pwm_r = val & 0x0F;
      if (ch < 4) {
        pf_comboPWM(pf_pwm_b, pf_pwm_r, ch);
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
    digitalWrite(OUT_STS_PINS[i], current);

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
