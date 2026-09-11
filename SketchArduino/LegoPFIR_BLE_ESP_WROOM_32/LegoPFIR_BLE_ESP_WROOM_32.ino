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
static const char *BLE_TX_UUID      = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"; // Client → ESP32
static const char *BLE_RX_UUID      = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"; // ESP32 → Client

BLEServer         *bleServer   = nullptr;
BLEService        *bleService  = nullptr;
BLECharacteristic *txChar      = nullptr; // WriteWithoutResponse
BLECharacteristic *rxChar      = nullptr; // Notify

bool bleClientConnected = false;

// ------------------------------------------------------
// BLE TX handler: receive 16-bit PF frame and send via IR
// ------------------------------------------------------
class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();
    if (value.size() != 2) return; // Expect exactly 2 bytes (PF frame)

    uint16_t frame = (static_cast<uint8_t>(value[0]) << 8) |
                     static_cast<uint8_t>(value[1]);

    Serial.printf("[BLE TX] Received PF frame: 0x%04X\n", frame);
    irsend.sendLegoPf(frame, 16, 1);
  }
};

// ------------------------------------------------------
// BLE server callbacks: track connection state
// ------------------------------------------------------
class ServerCallbacks : public BLEServerCallbacks {
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
// Notify PF IR events to BLE client (full 16-bit frame)
// ------------------------------------------------------
void notifyPfFrame(uint16_t frame) {
  if (!bleClientConnected || rxChar == nullptr) return;

  uint8_t payload[2] = {
    static_cast<uint8_t>(frame >> 8),
    static_cast<uint8_t>(frame & 0xFF)
  };

  rxChar->setValue(payload, 2);
  rxChar->notify();

  Serial.printf("[BLE RX] Notified PF frame: 0x%04X\n", frame);
}

// ------------------------------------------------------
// Setup
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== ESP32 LEGO PF IR Gateway + BLE (Final Clean Version) ===");

  // IMPORTANT: do NOT set pinMode(IR_SEND_PIN, OUTPUT) – RMT owns the pin
  irsend.begin();
  irrecv.enableIRIn();

  // BLE init
  BLEDevice::init("PF-IR-Gateway");
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  bleService = bleServer->createService(BLE_SERVICE_UUID);

  // TX characteristic: client writes PF frame (2 bytes)
  txChar = bleService->createCharacteristic(
    BLE_TX_UUID,
    BLECharacteristic::PROPERTY_WRITE_NR
  );
  txChar->setCallbacks(new TxCallbacks());

  // RX characteristic: ESP32 notifies PF frame (2 bytes)
  rxChar = bleService->createCharacteristic(
    BLE_RX_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  rxChar->addDescriptor(new BLE2902());

  bleService->start();
  BLEDevice::startAdvertising();

  Serial.println("[BLE] Advertising started");
}

// ------------------------------------------------------
// Loop
// ------------------------------------------------------
void loop() {
  // PF IR RECEIVE from handset
  if (irrecv.decode(&results)) {
    if (results.decode_type == LEGOPF) {
      uint16_t frame = static_cast<uint16_t>(results.value);

      Serial.println("=== PF IR RECEIVED ===");
      Serial.printf("Raw 16-bit frame: 0x%04X\n", frame);
      Serial.printf("Channel: %d\n", results.address);
      Serial.printf("Command byte: 0x%02X\n", results.command);
      Serial.println("=========================");

      // Forward to BLE client as full 16-bit frame
      notifyPfFrame(frame);
    }
    irrecv.resume();
  }
}
