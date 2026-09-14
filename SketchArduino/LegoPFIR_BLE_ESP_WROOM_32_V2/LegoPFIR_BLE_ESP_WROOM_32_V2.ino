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
esp_bd_addr_t connectedBda; // peer address, needed for conn-param update

// ------------------------------------------------------
// Outgoing IR queue: a real FIFO (not overwrite-single-slot).
// Decouples the BLE stack task from the blocking IR send.
// Depth of 8 is plenty for bursts of discrete commands
// (e.g. two motor blocks fired back-to-back) without ever
// dropping a frame.
// ------------------------------------------------------
static QueueHandle_t irQueue = nullptr;

// ------------------------------------------------------
// BLE TX handler: receive 16-bit PF frame, hand off to loop()
// ------------------------------------------------------
class TxCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string value = characteristic->getValue();

    // Payload is now N concatenated 2-byte PF frames (N >= 1), not just one.
    // This lets the JS side batch commands issued in the same tick (e.g.
    // two motor blocks fired back-to-back) into a single BLE write, so
    // they only pay for one connection event instead of two.
    size_t frameCount = value.size() / 2;
    if (frameCount == 0 || (value.size() % 2) != 0) return; // malformed, ignore

//    Serial.printf("[BLE RX] %u frame(s) received at %lu ms\n", (unsigned)frameCount, millis());

    for (size_t i = 0; i < frameCount; i++) {
      uint16_t frame = (static_cast<uint8_t>(value[i * 2]) << 8) |
                        static_cast<uint8_t>(value[i * 2 + 1]);

      // Do NOT call irsend here: sendLegoPf() blocks for a few ms and
      // would stall the Bluedroid task, delaying the *next* BLE event.
      if (irQueue != nullptr) {
        if (xQueueSend(irQueue, &frame, 0) != pdTRUE) {
          Serial.println("[BLE TX] IR queue full, frame dropped");
        }
      }
    }
  }
};

// ------------------------------------------------------
// BLE connection-interval optimizer (Bluedroid only)
// ------------------------------------------------------
class MyServerCallbacks : public BLEServerCallbacks {
  // NOTE: the (BLEServer*, esp_ble_gatts_cb_param_t*) overload is the one
  // that actually fires on arduino-esp32 2.0.17's Bluedroid BLE stack, and
  // it's the only one that gives us the peer's address.
  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override {
    bleClientConnected = true;
    memcpy(connectedBda, param->connect.remote_bda, sizeof(esp_bd_addr_t));

    Serial.println("[BLE] Client connected");

    // Request FAST connection interval (7.5 ms, the BLE spec minimum)
    esp_ble_conn_update_params_t connParams;
    memcpy(connParams.bda, connectedBda, sizeof(esp_bd_addr_t)); // <-- was missing entirely, update silently did nothing
    connParams.latency = 0;
    connParams.max_int = 6;   // 6 * 1.25 ms = 7.5 ms
    connParams.min_int = 6;   // 6 * 1.25 ms = 7.5 ms
    connParams.timeout = 400; // 4 second supervision timeout

    esp_ble_gap_update_conn_params(&connParams);

    Serial.println("[BLE] Requested fast connection interval");
  }

  // Keep this so the class still satisfies the base interface; the real
  // work happens in the param overload above, which is the one that fires.
  void onConnect(BLEServer *server) override {}

  void onDisconnect(BLEServer *server) override {
    bleClientConnected = false;
    Serial.println("[BLE] Client disconnected");
    BLEDevice::startAdvertising();
  }
};

// ------------------------------------------------------
// GAP callback: confirms what interval was actually negotiated.
// Central (Chrome/OS) has final say, but this tells you if your
// request was even accepted.
// ------------------------------------------------------
static void gapEventHandler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
  if (event == ESP_GAP_BLE_UPDATE_CONN_PARAMS_EVT) {
    Serial.printf("[BLE] Conn params updated: interval=%.2fms latency=%d timeout=%dms status=%d\n",
                  param->update_conn_params.conn_int * 1.25,
                  param->update_conn_params.latency,
                  param->update_conn_params.timeout * 10,
                  param->update_conn_params.status);
  }
}

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

//  Serial.printf("[BLE RX] Notified PF frame: 0x%04X\n", frame);
}

// ------------------------------------------------------
// Setup
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("=== ESP32 LEGO PF IR Gateway + BLE (Optimized Version) ===");

  irsend.begin();
  irrecv.enableIRIn();

  irQueue = xQueueCreate(8, sizeof(uint16_t));

  // BLE init
  BLEDevice::init("PF-IR-Gateway");
  esp_ble_gap_register_callback(gapEventHandler);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new MyServerCallbacks());   // <-- NEW CALLBACK INSTALLED HERE

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
  // Drain the outgoing IR queue (fed by TxCallbacks::onWrite)
  uint16_t outFrame;
  if (irQueue != nullptr && xQueueReceive(irQueue, &outFrame, 0) == pdTRUE) {
//    unsigned long t0 = millis();
//    Serial.printf("[IR TX] dequeued 0x%04X at %lu ms\n", outFrame, t0);
    irsend.sendLegoPf(outFrame, 16, 0); // repeat=0: single message, not the 5x "held remote" repeat mode
//    unsigned long t1 = millis();
//    Serial.printf("[IR TX] sendLegoPf() returned at %lu ms (took %lu ms)\n", t1, t1 - t0);
  }

  if (irrecv.decode(&results)) {
    if (results.decode_type == LEGOPF) {
      uint16_t frame = static_cast<uint16_t>(results.value);
      notifyPfFrame(frame);
    }
    irrecv.resume();
  }
}
