#include <Arduino.h>
#include "BluetoothSerial.h"
#include "driver/rmt.h"

BluetoothSerial SerialBT;

// ---------------- Pin mapping ----------------
const uint8_t OUT_PINS[6] = {13, 12, 14, 27, 26, 25};  // Outputs 0-5
const uint8_t IN_PINS[2]  = {33, 32};                  // Inputs 6-7

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
// PF IR variables (ESP32 RMT)
// =========================================================
const uint8_t PF_IR_PIN = 4;   // GPIO4 for IR LED

#define PF_COMBO_DIRECT_MODE     0x01
#define PF_SINGLE_PIN_CONTINUOUS 0x2
#define PF_SINGLE_PIN_TIMEOUT    0x3
#define PF_SINGLE_OUTPUT         0x4
#define PF_ESCAPE                0x4

struct PfCmd {
  uint8_t code1;
  uint8_t code2;
  uint8_t channel;
};

PfCmd pf_queue[8];
volatile uint8_t pf_q_head = 0;
volatile uint8_t pf_q_tail = 0;
volatile bool pf_busy = false;

volatile uint8_t pf_toggle[4] = {0,0,0,0};

// RMT config
const rmt_channel_t PF_RMT_CHANNEL = RMT_CHANNEL_0;

// PF timing (µs)
const uint16_t PF_T_START_HIGH   = 156;
const uint16_t PF_T_START_LOW    = 1014;
const uint16_t PF_T_BIT_HIGH     = 156;
const uint16_t PF_T_BIT_LOW_0    = 260;
const uint16_t PF_T_BIT_LOW_1    = 546;
const uint16_t PF_T_STOP_HIGH    = 156;
const uint16_t PF_T_STOP_LOW     = 1014;
const uint8_t  PF_FRAME_REPEATS  = 6;

// =========================================================
// MESSAGE PAUSE (non-blocking) — same as before
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
// RMT INIT
// =========================================================
void pf_initRmt() {
  rmt_config_t config = {};
  config.channel = PF_RMT_CHANNEL;
  config.gpio_num = (gpio_num_t)PF_IR_PIN;
  config.mem_block_num = 1;
  config.clk_div = 80; // 1 MHz tick (80 MHz / 80)
  config.tx_config.loop_en = false;
  config.tx_config.carrier_en = true;
  config.tx_config.idle_output_en = true;
  config.tx_config.idle_level = RMT_IDLE_LEVEL_LOW;
  config.tx_config.carrier_freq_hz = 38000;
  config.tx_config.carrier_duty_percent = 50;
  config.tx_config.carrier_level = RMT_CARRIER_LEVEL_HIGH;
  config.rmt_mode = RMT_MODE_TX;

  rmt_config(&config);
  rmt_driver_install(PF_RMT_CHANNEL, 0, 0);
}

// =========================================================
// BUILD ONE PF FRAME INTO RMT ITEMS
// =========================================================
void pf_buildFrameItems(uint8_t code1, uint8_t code2, rmt_item32_t *items, int &itemCount) {
  itemCount = 0;

  // START bit: 156µs high, 1014µs low
  items[itemCount].duration0 = PF_T_START_HIGH;
  items[itemCount].level0    = 1;
  items[itemCount].duration1 = PF_T_START_LOW;
  items[itemCount].level1    = 0;
  itemCount++;

  // DATA bits: 16 bits (code1 then code2), MSB first
  for (int byteIndex = 0; byteIndex < 2; byteIndex++) {
    uint8_t b = (byteIndex == 0) ? code1 : code2;
    for (int bitIndex = 0; bitIndex < 8; bitIndex++) {
      uint8_t mask = 0x80 >> bitIndex;
      bool bit = (b & mask) != 0;

      items[itemCount].duration0 = PF_T_BIT_HIGH;
      items[itemCount].level0    = 1;
      items[itemCount].duration1 = bit ? PF_T_BIT_LOW_1 : PF_T_BIT_LOW_0;
      items[itemCount].level1    = 0;
      itemCount++;
    }
  }

  // STOP bit: 156µs high, 1014µs low
  items[itemCount].duration0 = PF_T_STOP_HIGH;
  items[itemCount].level0    = 1;
  items[itemCount].duration1 = PF_T_STOP_LOW;
  items[itemCount].level1    = 0;
  itemCount++;
}

// =========================================================
// SEND ONE PF FRAME (blocking RMT send)
// =========================================================
void pf_sendFrame(uint8_t code1, uint8_t code2, uint8_t channel) {
  rmt_item32_t items[32];
  int itemCount = 0;
  pf_buildFrameItems(code1, code2, items, itemCount);

  uint8_t message_count = 0;
  for (uint8_t rep = 0; rep < PF_FRAME_REPEATS; rep++) {
    uint16_t pause_us = pf_compute_message_pause_us(channel, message_count);
    message_count++;

    uint32_t start = micros();
    while ((micros() - start) < pause_us) {
      // wait
    }

    rmt_write_items(PF_RMT_CHANNEL, items, itemCount, true);
    rmt_wait_tx_done(PF_RMT_CHANNEL, portMAX_DELAY);
  }
}

// =========================================================
// QUEUE + START FRAME (non-blocking API)
// =========================================================
void pf_startFrame(uint8_t code1, uint8_t code2, uint8_t channel) {
  if (pf_busy) {
    uint8_t next = (pf_q_head + 1) & 7;
    if (next == pf_q_tail) {
      return; // queue full
    }
    pf_queue[pf_q_head].code1 = code1;
    pf_queue[pf_q_head].code2 = code2;
    pf_queue[pf_q_head].channel = channel;
    pf_q_head = next;
    return;
  }

  pf_busy = true;
  pf_sendFrame(code1, code2, channel);
  pf_busy = false;

  if (pf_q_tail != pf_q_head) {
    PfCmd cmd = pf_queue[pf_q_tail];
    pf_q_tail = (pf_q_tail + 1) & 7;
    pf_startFrame(cmd.code1, cmd.code2, cmd.channel);
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
// PWM (ESP32 LEDC) for Blockly outputs
// =========================================================
const int LEDC_CHANNELS[6] = {0,1,2,3,4,5};
const int LEDC_FREQ = 1000; // 1 kHz
const int LEDC_RES  = 8;     // 0-255

// =========================================================
// HANDSHAKE (Blockly)
// =========================================================
void waitForHandshake() {
  const size_t targetLen = strlen(HANDSHAKE_JS);
  size_t idx = 0;

  while (true) {
    if (SerialBT.available()) {
      char c = (char)SerialBT.read();
      if (c == HANDSHAKE_JS[idx]) {
        idx++;
        if (idx >= targetLen) {
          SerialBT.print(HANDSHAKE_ARD);
          SerialBT.flush();
          delay(50);
          return;
        }
      } else {
        idx = 0;
      }
    }
    delay(1);
  }
}

// =========================================================
// COMMAND HANDLING (Blockly)
// =========================================================
void handleCommands() {
  while (SerialBT.available()) {

    uint8_t cmd = (uint8_t)SerialBT.read();
    lastCommandTime = millis();

    if (cmd == 0x02) {
      return;
    }

    if (cmd == 0x70) {
      forceDisconnect();
      return;
    }

    if ((cmd & 0xF0) == 0x90) {
      while (!SerialBT.available());
      uint8_t val = (uint8_t)SerialBT.read();

      uint8_t port = cmd & 0x0F;
      if (port < 6) {
        pwmValues[port] = val;
        ledcWrite(LEDC_CHANNELS[port], val);
      }
      return;
    }

    if ((cmd & 0xF0) == 0xA0) {
      while (!SerialBT.available());
      uint8_t val = (uint8_t)SerialBT.read();

      uint8_t ch     = cmd & 0x0F;
      uint8_t pf_out = (val & 0xF0) >> 4;
      uint8_t pf_pwm = val & 0x0F;
      if (ch < 4) {
        pf_singleOutput(pf_pwm, pf_out, ch);
      }
      return;
    }

    if ((cmd & 0xF0) == 0xB0) {
      while (!SerialBT.available());
      uint8_t val = (uint8_t)SerialBT.read();

      uint8_t ch       = cmd & 0x0F;
      uint8_t pf_pwm_b = (val & 0xF0) >> 4;
      uint8_t pf_pwm_r = val & 0x0F;
      if (ch < 4) {
        pf_comboPWM(pf_pwm_b, pf_pwm_r, ch);
      }
      return;
    }
  }
}

// =========================================================
// INPUT POLLING (Blockly)
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
// STATUS PACKET (Blockly)
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

  SerialBT.write(buf, 11);
}

// =========================================================
// FORCE DISCONNECT (Blockly)
// =========================================================
void forceDisconnect() {
  for (uint8_t i = 0; i < 6; i++) {
    pwmValues[i] = 0;
    ledcWrite(LEDC_CHANNELS[i], 0);
  }

  connected    = false;
  currentMode  = MODE_NONE;

  while (SerialBT.available()) SerialBT.read();
}

// =========================================================
// LEGACY BIT-BANG MODE
// =========================================================
uint8_t legacyOutputByte   = 0x00;
uint8_t legacyLastInputs   = 0x00;
unsigned long legacyLastTxTime = 0;
const unsigned long LEGACY_HEARTBEAT_INTERVAL = 3000; // ms

void loopLegacy() {
  uint8_t currentInputs = 0x00;
  if (digitalRead(IN_PINS[0]) == HIGH) currentInputs |= 0x40; // bit 6
  if (digitalRead(IN_PINS[1]) == HIGH) currentInputs |= 0x80; // bit 7

  bool forceUpdate = false;

  // Check if Blockly handshake is starting
  if (SerialBT.available() > 0) {
    uint8_t peekByte = (uint8_t)SerialBT.peek();
    if (peekByte == '#') {
      waitForHandshake();
      currentMode = MODE_BLOCKLY;
      lastPacketTime  = micros();
      lastCommandTime = millis();
      return;
    }

    // Legacy command: raw output byte
    while (SerialBT.available() > 0) {
      uint8_t inboundByte = (uint8_t)SerialBT.read();
      legacyOutputByte = inboundByte & 0x3F;

      for (int i = 0; i < 6; i++) {
        uint8_t val = (legacyOutputByte & (1 << i)) ? 255 : 0;
        ledcWrite(LEDC_CHANNELS[i], val);
      }

    }

    forceUpdate = true;
  }

  if (currentInputs != legacyLastInputs) {
    forceUpdate = true;
  }

  if (millis() - legacyLastTxTime >= LEGACY_HEARTBEAT_INTERVAL) {
    forceUpdate = true;
  }

  if (forceUpdate) {
    uint8_t returnByte = (legacyOutputByte & 0x3F) | currentInputs;
    SerialBT.write(returnByte);

    legacyLastInputs = currentInputs;
    legacyLastTxTime = millis();
  }

  delayMicroseconds(100);
}

// =========================================================
// SETUP
// =========================================================
void setup() {
  Serial.begin(115200);
  Serial.println("ESP32 LEGO Interface A – Dual Mode (Blockly + Legacy)");

  // PWM outputs (Blockly)
  for (uint8_t i = 0; i < 6; i++) {
    ledcSetup(LEDC_CHANNELS[i], LEDC_FREQ, LEDC_RES);
    ledcAttachPin(OUT_PINS[i], LEDC_CHANNELS[i]);
    ledcWrite(LEDC_CHANNELS[i], 0);
  }

  // Inputs
  for (uint8_t i = 0; i < 2; i++) {
    pinMode(IN_PINS[i], INPUT_PULLUP);
    lastInputState[i] = digitalRead(IN_PINS[i]) ? 1 : 0;
    inputState[i]     = lastInputState[i];
    edgeCount[i]      = 0;
  }

  // PF IR (RMT)
  pf_initRmt();

  SerialBT.begin("LEGO_InterfaceA_BT_Blockly");
  Serial.println("Bluetooth SPP active, ready for Blockly or Legacy.");
}

// =========================================================
// MAIN LOOP
// =========================================================
void loop() {
  if (!SerialBT.hasClient()) {
    for (uint8_t i = 0; i < 6; i++) {
      pwmValues[i] = 0;
      ledcWrite(LEDC_CHANNELS[i], 0);
      digitalWrite(OUT_PINS[i], LOW);
    }
    connected   = false;
    currentMode = MODE_NONE;
    delay(100);
    return;
  }

  if (!connected) {
    SerialBT.println("READY");
    SerialBT.flush();
    delay(50);

    connected   = true;
    currentMode = MODE_LEGACY;  // default to legacy on connect
    lastPacketTime  = micros();
    lastCommandTime = millis();
  }

  if (currentMode == MODE_BLOCKLY) {
    handleCommands();

    if ((millis() - lastCommandTime) > KEEPALIVE_TIMEOUT_MS) {
      forceDisconnect();
      return;
    }

    pollInputs();

    unsigned long now = micros();
    if ((now - lastPacketTime) >= PACKET_INTERVAL_US) {
      lastPacketTime = now;
      sendStatusPacket();
    }
  } else if (currentMode == MODE_LEGACY) {
    loopLegacy();
  } else {
    currentMode = MODE_LEGACY;
  }
}
