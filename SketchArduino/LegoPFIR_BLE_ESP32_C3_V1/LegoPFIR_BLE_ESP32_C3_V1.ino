/**
 * ESP32-C3 Adaptation: LEGO Power Functions IR Gateway + BLE + Generic IR
 * Target: ESP32-C3 (Single-Core 32-bit RISC-V @ 160MHz)
 * 
 * Hardware Abstraction Layer (HAL) & Pin Changes:
 * 1. Pin Map:
 *    - IR_SEND_PIN: GPIO 4 (Safe general I/O)
 *    - IR_RECEIVE_PIN: GPIO 5 (Replaced GPIO 16 from WROOM-32!
 *      NOTE: GPIO 16 on ESP32-C3 is internal SPI Flash Data line SPID.
 *      Connecting to GPIO 16 causes instant boot failure / flash corruption).
 * 2. RMT Peripheral HAL:
 *    - ESP32-C3 has only 2 RMT TX and 2 RMT RX channels (channels 0-1),
 *      compared to 8 channels on classic ESP-WROOM-32.
 *    - IRsend uses RMT TX ch 0; IRrecv uses RMT RX ch 1 automatically.
 * 3. Single-Core Architecture:
 *    - RISC-V single-core runs both BLE protocol tasks and Arduino loop().
 *    - Added non-blocking vTaskDelay / delay(2) in loop() to yield CPU
 *      to the FreeRTOS idle task and prevent Task Watchdog (TWDT) resets.
 * 4. BLE Stack Headers:
 *    - Added esp_gap_ble_api.h & esp_gatts_api.h for standard compilation
 *      across ESP-IDF v4 (Arduino 2.x) and ESP-IDF v5 (Arduino 3.x).
 */

#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ESP32 Arduino Core 3.x compatibility:
// On ESP32-C3 in Arduino Core 3.x, NimBLE / Bluedroid headers may not expose raw esp_gap_ble_api.h.
// We guard the low-level IDF includes or use conditional includes so it compiles seamlessly on all cores.
#if __has_include(<esp_gap_ble_api.h>)
  #include <esp_gap_ble_api.h>
  #include <esp_gatts_api.h>
  #define HAS_ESP_GAP_BLE_API 1
#else
  #define HAS_ESP_GAP_BLE_API 0
#endif

// ------------------------------------------------------
// Pin Definitions (Updated for ESP32-C3)
// ------------------------------------------------------
#define IR_SEND_PIN 4
#define IR_RECEIVE_PIN 5

IRsend irsend(IR_SEND_PIN);
IRrecv irrecv(IR_RECEIVE_PIN);
decode_results results;

// ------------------------------------------------------
// BLE UUIDs (Service + TX + RX)
// ------------------------------------------------------
static const char *BLE_SERVICE_UUID    = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *BLE_TX_UUID         = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR TX
static const char *BLE_RX_UUID         = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR RX
static const char *BLE_IR_GENERIC_UUID = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E"; // Generic IR RX

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
// BLE TX handler (PF IR only) - Supports Arduino Core 2.x & 3.x
// ------------------------------------------------------
class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    // In Core 3.x / 2.x, getData() returns uint8_t* and getLength() returns byte count
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
// BLE connection callbacks & interval optimization
// ------------------------------------------------------
class MyServerCallbacks : public BLEServerCallbacks {
#if HAS_ESP_GAP_BLE_API
  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override {
    bleClientConnected = true;
    memcpy(connectedBda, param->connect.remote_bda, sizeof(esp_bd_addr_t));
    Serial.println("[BLE] Client connected");

    esp_ble_conn_update_params_t connParams;
    memcpy(connParams.bda, connectedBda, sizeof(esp_bd_addr_t));
    connParams.latency = 0;
    // Set 7.5ms - 15ms interval (min_int=6, max_int=12)
    connParams.min_int = 6;
    connParams.max_int = 12;
    connParams.timeout = 400;

    esp_ble_gap_update_conn_params(&connParams);
    Serial.println("[BLE] Fast connection interval requested");
  }
#endif

  void onConnect(BLEServer *server) override {
    bleClientConnected = true;
    Serial.println("[BLE] Client connected");
  }
  
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

  Serial.println("=== ESP32-C3 LEGO PF IR Gateway + BLE + Generic IR ===");
  Serial.printf("HAL: RISC-V Arch | IR TX Pin: GPIO %d | IR RX Pin: GPIO %d\n", IR_SEND_PIN, IR_RECEIVE_PIN);

  // Initialize IR hardware (RMT peripheral)
  irsend.begin();
  irrecv.enableIRIn();

  // Create queue for outgoing IR frames
  irQueue = xQueueCreate(8, sizeof(uint16_t));

  // Initialize BLE Stack
  BLEDevice::init("PF-IR-Gateway-C3");

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new MyServerCallbacks());

  bleService = bleServer->createService(BLE_SERVICE_UUID);

  // PF IR TX Characteristic
  txChar = bleService->createCharacteristic(
    BLE_TX_UUID,
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  txChar->setCallbacks(new TxCallbacks());

  // PF IR RX Characteristic
  rxChar = bleService->createCharacteristic(
    BLE_RX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  rxChar->addDescriptor(new BLE2902());

  // Generic IR RX Characteristic
  irGenericChar = bleService->createCharacteristic(
    BLE_IR_GENERIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  irGenericChar->addDescriptor(new BLE2902());

  bleService->start();
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising started as 'PF-IR-Gateway-C3'");
}

// ------------------------------------------------------
// Main Loop
// ------------------------------------------------------
void loop() {
  uint16_t outFrame;
  if (irQueue != nullptr && xQueueReceive(irQueue, &outFrame, 0) == pdTRUE) {
    irsend.sendLegoPf(outFrame, 16, 0);
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

  // CRITICAL FOR ESP32-C3 SINGLE-CORE:
  // Yield to FreeRTOS IDLE task to service BLE background stack & prevent Watchdog resets
  delay(2);
}
