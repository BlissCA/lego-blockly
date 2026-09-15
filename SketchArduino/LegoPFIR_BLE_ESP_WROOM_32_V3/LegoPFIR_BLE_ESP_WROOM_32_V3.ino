#include <Arduino.h>
#include <IRremoteESP8266.h>
#include <IRsend.h>
#include <IRrecv.h>
#include <IRutils.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define IR_SEND_PIN 4
#define IR_RECEIVE_PIN 16

IRsend irsend(IR_SEND_PIN);
IRrecv irrecv(IR_RECEIVE_PIN);
decode_results results;

// ------------------------------------------------------
// BLE UUIDs (Service + TX + RX)
// ------------------------------------------------------
static const char *BLE_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E";
static const char *BLE_TX_UUID      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR TX
static const char *BLE_RX_UUID      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // PF IR RX

// *** NEW *** Generic IR RX characteristic
static const char *BLE_IR_GENERIC_UUID = "6E400004-B5A3-F393-E0A9-E50E24DCCA9E";

BLEServer         *bleServer   = nullptr;
BLEService        *bleService  = nullptr;
BLECharacteristic *txChar      = nullptr; // PF IR TX
BLECharacteristic *rxChar      = nullptr; // PF IR RX
BLECharacteristic *irGenericChar = nullptr; // *** NEW ***

bool bleClientConnected = false;
esp_bd_addr_t connectedBda;

// ------------------------------------------------------
// Outgoing IR queue
// ------------------------------------------------------
static QueueHandle_t irQueue = nullptr;

// ------------------------------------------------------
// BLE TX handler (PF IR only)
// ------------------------------------------------------
class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();
    size_t frameCount = value.size() / 2;
    if (frameCount == 0 || (value.size() % 2) != 0) return;

    for (size_t i = 0; i < frameCount; i++) {
      uint16_t frame = (static_cast<uint8_t>(value[i * 2]) << 8) |
                        static_cast<uint8_t>(value[i * 2 + 1]);

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
// NOTE: a custom esp_ble_gap_register_callback() was used earlier purely
// to log the negotiated connection interval for diagnostics. It has been
// removed permanently: it silently replaces the Arduino BLEDevice
// library's own internal GAP callback (there's only one global slot),
// which broke the library's own security/bonding bookkeeping and was the
// real cause of the Windows pairing/connection issues seen previously.
// The 7.5ms interval negotiation was already confirmed working before
// this was removed, so it isn't needed for normal operation.
// ------------------------------------------------------

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
// *** NEW *** Generic IR notify
// ------------------------------------------------------
void notifyGenericIR(uint8_t proto, uint16_t bits, uint64_t value) {
  if (!bleClientConnected || irGenericChar == nullptr) return;

  uint8_t byteCount = (bits + 7) / 8;
  uint8_t payload[2 + 8]; // proto + bits + up to 8 bytes

  payload[0] = proto;
  payload[1] = bits;

  for (uint8_t i = 0; i < byteCount; i++) {
    payload[2 + i] = (value >> ((byteCount - 1 - i) * 8)) & 0xFF;
  }

  irGenericChar->setValue(payload, 2 + byteCount);
  irGenericChar->notify();

  // Serial.printf("[IR GEN] proto=%d bits=%d value=0x%llX\n",
  //               proto, bits, value);
}

// ------------------------------------------------------
// Setup
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== ESP32 LEGO PF IR Gateway + BLE + Generic IR ===");

  irsend.begin();
  irrecv.enableIRIn();

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

  // *** NEW *** Generic IR RX characteristic
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
}
