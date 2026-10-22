#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include "esp_timer.h"

#define IR_SEND_PIN 4
#define IR_RECEIVE_PIN 16

// ------------------------------------------------------
// RF OOK TX (unmodulated LEGO PF bit stream)
// ------------------------------------------------------
#define RF_SEND_PIN 17

// Set to 0 to disable the RF output completely
#define RF_TX_ENABLED 1

// Set to 1 if your RF TX module needs inverted logic
// (normally: GPIO HIGH = carrier ON = "mark")
#define RF_INVERT 0

// Set to 1 to protect the RF timing from interrupts on this core
// (the burst lasts ~16 ms). Set to 0 if you notice any BLE trouble.
#define RF_USE_CRITICAL_SECTION 1

// LEGO PF timings at 38 kHz: 1 cycle = 26.3 us
static const uint32_t PF_MARK_US        = 158;   //  6 cycles (start, stop and every bit)
static const uint32_t PF_START_SPACE_US = 1026;  // 39 cycles (start and stop bit)
static const uint32_t PF_LOW_SPACE_US   = 263;   // 10 cycles (bit = 0)
static const uint32_t PF_HIGH_SPACE_US  = 553;   // 21 cycles (bit = 1)
static const uint32_t PF_MIN_MSG_US     = 16000; // minimum start-to-start message length

IRsend irsend(IR_SEND_PIN);
IRrecv irrecv(IR_RECEIVE_PIN);
decode_results results;

// ------------------------------------------------------
// BLE UUIDs (Service + TX + RX)
// ------------------------------------------------------
static const char *BLE_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *BLE_TX_UUID      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR TX
static const char *BLE_RX_UUID      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR RX

// Generic IR RX characteristic
static const char *BLE_IR_GENERIC_UUID = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E";

BLEServer         *bleServer     = nullptr;
BLEService        *bleService    = nullptr;
BLECharacteristic *txChar        = nullptr; // PF IR TX
BLECharacteristic *rxChar        = nullptr; // PF IR RX
BLECharacteristic *irGenericChar = nullptr;

bool bleClientConnected = false;
esp_bd_addr_t connectedBda;

// ------------------------------------------------------
// Outgoing IR queue
// ------------------------------------------------------
static QueueHandle_t irQueue = nullptr;

// ------------------------------------------------------
// RF helpers
// ------------------------------------------------------
static inline void rfWrite(bool markLevel) {
#if RF_INVERT
  digitalWrite(RF_SEND_PIN, markLevel ? LOW : HIGH);
#else
  digitalWrite(RF_SEND_PIN, markLevel ? HIGH : LOW);
#endif
}

// Busy-wait until an absolute timestamp (esp_timer, microseconds).
// Using absolute times avoids accumulating drift over the whole frame.
static inline void rfWaitUntil(int64_t target) {
  while (esp_timer_get_time() < target) {
    // spin
  }
}

// One "mark + space" pair, scheduled against a running timeline
static inline void rfMarkSpace(int64_t &t, uint32_t markUs, uint32_t spaceUs) {
  rfWrite(true);
  t += markUs;
  rfWaitUntil(t);

  rfWrite(false);
  t += spaceUs;
  rfWaitUntil(t);
}

// Sends one 16-bit LEGO PF frame as an unmodulated OOK stream:
// start bit + 16 data bits (MSB first) + stop bit, padded to the
// 16 ms minimum message length.
void sendLegoPFUnmodulated(uint16_t data) {
#if RF_TX_ENABLED
#if RF_USE_CRITICAL_SECTION
  static portMUX_TYPE rfMux = portMUX_INITIALIZER_UNLOCKED;
  portENTER_CRITICAL(&rfMux);
#endif

  int64_t t0 = esp_timer_get_time();
  int64_t t  = t0;

  // 1. Start bit
  rfMarkSpace(t, PF_MARK_US, PF_START_SPACE_US);

  // 2. 16 data bits, MSB first
  for (int i = 15; i >= 0; i--) {
    if (data & (1u << i)) {
      rfMarkSpace(t, PF_MARK_US, PF_HIGH_SPACE_US);
    } else {
      rfMarkSpace(t, PF_MARK_US, PF_LOW_SPACE_US);
    }
  }

  // 3. Stop bit
  rfMarkSpace(t, PF_MARK_US, PF_START_SPACE_US);

  // 4. Pad to the minimum message length (output stays OFF)
  rfWrite(false);
  rfWaitUntil(t0 + PF_MIN_MSG_US);

#if RF_USE_CRITICAL_SECTION
  portEXIT_CRITICAL(&rfMux);
#endif
#endif
}

// ------------------------------------------------------
// BLE TX handler (PF IR only) - UPDATED FOR CORE 3.3.11
// ------------------------------------------------------
class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    // In Core 3.x, getData() returns uint8_t* and getLength() returns byte count
    size_t len = characteristic->getLength();
    const uint8_t *data = characteristic->getData();

    size_t frameCount = len / 2;
    if (frameCount == 0 || (len % 2) != 0 || data == nullptr) return;

    for (size_t i = 0; i < frameCount; i++) {
      uint16_t frame = (static_cast<uint16_t>(data[i * 2]) << 8) |
                        static_cast<uint16_t>(data[i * 2 + 1]);

      if (irQueue != nullptr) {
        if (xQueueSend(irQueue, &frame, 0) != pdTRUE) {
          Serial.println("[BLE TX] IR queue full, frame dropped");
        }
      }
    }
  }
};

// ------------------------------------------------------
// BLE connection-interval optimizer
// ------------------------------------------------------
class MyServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override {
    bleClientConnected = true;
    memcpy(connectedBda, param->connect.remote_bda, sizeof(esp_bd_addr_t));

    Serial.println("[BLE] Client connected");

    esp_ble_conn_update_params_t connParams;
    memcpy(connParams.bda, connectedBda, sizeof(esp_bd_addr_t));
    connParams.latency = 0;
    connParams.max_int = 6;
    connParams.min_int = 6;
    connParams.timeout = 400;

    esp_ble_gap_update_conn_params(&connParams);
    Serial.println("[BLE] Requested fast connection interval");
  }

  void onConnect(BLEServer *server) override {}
  void onDisconnect(BLEServer *server) override {
    bleClientConnected = false;
    Serial.println("[BLE] Client disconnected");
    BLEDevice::startAdvertising();
  }
};

// ------------------------------------------------------
// PF IR notify
// ------------------------------------------------------
void notifyPfFrame(uint16_t frame) {
  if (!bleClientConnected || rxChar == nullptr) return;

  uint8_t payload[2] = {
    static_cast<uint8_t>(frame >> 8),
    static_cast<uint8_t>(frame & 0xFF)
  };

  rxChar->setValue(payload, 2);
  rxChar->notify();
}

// ------------------------------------------------------
// Generic IR notify
// ------------------------------------------------------
void notifyGenericIR(uint8_t proto, uint16_t bits, uint64_t value) {
  if (!bleClientConnected || irGenericChar == nullptr) return;

  if (value == 0xFFFFFFFFFFFFFFFF) bits = 64;

  uint8_t byteCount = (bits + 7) / 8;
  uint8_t payload[2 + 8]; // proto + bits + up to 8 bytes

  payload[0] = proto;
  payload[1] = bits;

  for (uint8_t i = 0; i < byteCount; i++) {
    payload[2 + i] = (value >> ((byteCount - 1 - i) * 8)) & 0xFF;
  }

  irGenericChar->setValue(payload, 2 + byteCount);
  irGenericChar->notify();
}

// ------------------------------------------------------
// Setup
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== ESP32 LEGO PF IR Gateway + BLE + Generic IR + RF OOK ===");

  irsend.begin();
  irrecv.enableIRIn();

#if RF_TX_ENABLED
  pinMode(RF_SEND_PIN, OUTPUT);
  rfWrite(false); // idle = carrier OFF
  Serial.println("[RF] OOK TX enabled on GPIO " + String(RF_SEND_PIN));
#endif

  irQueue = xQueueCreate(8, sizeof(uint16_t));

  BLEDevice::init("PF-IR-Gateway");

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new MyServerCallbacks());

  bleService = bleServer->createService(BLE_SERVICE_UUID);

  // PF IR TX
  txChar = bleService->createCharacteristic(
    BLE_TX_UUID,
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  txChar->setCallbacks(new TxCallbacks());

  // PF IR RX
  rxChar = bleService->createCharacteristic(
    BLE_RX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  rxChar->addDescriptor(new BLE2902());

  // Generic IR RX characteristic
  irGenericChar = bleService->createCharacteristic(
    BLE_IR_GENERIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  irGenericChar->addDescriptor(new BLE2902());

  bleService->start();
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising started");
}

// ------------------------------------------------------
// Loop
// ------------------------------------------------------
void loop() {
  uint16_t outFrame;
  if (irQueue != nullptr && xQueueReceive(irQueue, &outFrame, 0) == pdTRUE) {
    // Existing IR transmission (unchanged)
    irsend.sendLegoPf(outFrame, 16, 0);

    // Same frame as an unmodulated RF OOK stream
    sendLegoPFUnmodulated(outFrame);
  }

  if (irrecv.decode(&results)) {
    if (results.decode_type == LEGOPF) {
      notifyPfFrame((uint16_t)results.value);
    } else {
      notifyGenericIR(
        results.decode_type,
        results.bits,
        results.value
      );
    }

    irrecv.resume();
  }
}
