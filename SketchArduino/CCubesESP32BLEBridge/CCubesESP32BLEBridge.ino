/*
  =============================================================================
  Circuit Cubes ESP32 Wireless BLE Multi-Role Bridge (CCubesESP32BLEBridge.ino)
  =============================================================================
  Compatible with:
    - ESP32 (ESP-WROOM-32, NodeMCU-32S, ESP32 DevKit)
    - ESP32-S3 (ESP32-S3 DevKitC-1, etc.)
    - ESP32-C3 (ESP32-C3 DevKitM-1, SuperMini, etc.)

  Architecture:
    PC (Web Bluetooth in Chrome)
         || (BLE Wireless - Peripheral Role: "CCubes_ESP32_Bridge")
       ESP32 (BLE Multi-Role: Server to PC, Client to Cubes)
         || (BLE Wireless - Central Role)
    Circuit Cube #1 & Cube #2 (Tenka Nordic UART Service)

    * Note: Also accepts commands simultaneously via USB Serial (115200 baud).
  =============================================================================
*/

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <BLEClient.h>
#include <BLE2902.h>

static const char* NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

#define MAX_CUBES 2

struct CubeSlot {
  int id;
  String macAddress;
  BLEClient* pClient;
  BLERemoteCharacteristic* pRxChar;
  bool isConnected;
  int portPower[3];
};

static CubeSlot cubes[MAX_CUBES];
static BLEScan* pBLEScan = nullptr;
static bool isScanning = false;
static unsigned long scanEndTime = 0;

static BLEServer* pBleServer = nullptr;
static BLECharacteristic* pServerTxChar = nullptr;
static bool isPcConnected = false;

void handleCommand(String line);

#include <queue>
#include <string>

static std::queue<String> responseQueue;
static portMUX_TYPE respMux = portMUX_INITIALIZER_UNLOCKED;

void sendResponse(String msg) {
  Serial.println(msg);

  portENTER_CRITICAL(&respMux);
  if (responseQueue.size() < 32) {
    responseQueue.push(msg);
  }
  portEXIT_CRITICAL(&respMux);
}

void flushResponses() {
  if (!isPcConnected || pServerTxChar == nullptr) {
    portENTER_CRITICAL(&respMux);
    while (!responseQueue.empty()) responseQueue.pop();
    portEXIT_CRITICAL(&respMux);
    return;
  }

  for (int r = 0; r < 3; r++) {
    String msg = "";
    portENTER_CRITICAL(&respMux);
    if (!responseQueue.empty()) {
      msg = responseQueue.front();
      responseQueue.pop();
    }
    portEXIT_CRITICAL(&respMux);

    if (msg.length() == 0) break;

    String payload = msg + "\n";
    const uint8_t* data = (const uint8_t*)payload.c_str();
    size_t len = payload.length();
    size_t offset = 0;

    while (offset < len) {
      size_t chunk = (len - offset > 20) ? 20 : (len - offset);
      pServerTxChar->setValue((uint8_t*)(data + offset), chunk);
      pServerTxChar->notify();
      offset += chunk;
      if (offset < len) delay(3);
    }
  }
}

static std::queue<std::string> bleCmdQueue;
static portMUX_TYPE cmdMux = portMUX_INITIALIZER_UNLOCKED;

void queueBleCommand(const std::string& cmd) {
  portENTER_CRITICAL(&cmdMux);
  if (bleCmdQueue.size() < 16) {
    bleCmdQueue.push(cmd);
  }
  portEXIT_CRITICAL(&cmdMux);
}

class BleServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) override {
    isPcConnected = true;
    Serial.println("LOG:PC connected to ESP32 Wireless Bridge via Web Bluetooth!");
  }

  void onDisconnect(BLEServer* pServer) override {
    isPcConnected = false;
    Serial.println("LOG:PC disconnected from ESP32 Wireless Bridge. Restarting advertising...");
    BLEDevice::startAdvertising();
  }
};

class BleServerRxCallbacks : public BLECharacteristicCallbacks {
  std::string lineBuffer;

  void onWrite(BLECharacteristic* pCharacteristic) override {
    uint8_t* data = pCharacteristic->getData();
    size_t len = pCharacteristic->getLength();
    if (len == 0 || data == nullptr) return;

    for (size_t i = 0; i < len; i++) {
      char c = (char)data[i];
      if (c == '\n' || c == '\r') {
        if (lineBuffer.length() > 0) {
          queueBleCommand(lineBuffer);
          lineBuffer.clear();
        }
      } else {
        if (lineBuffer.length() < 128) {
          lineBuffer += c;
        }
      }
    }
  }
};

class CubeClientCallbacks : public BLEClientCallbacks {
  int _cubeIdx;
public:
  CubeClientCallbacks(int cubeIdx) : _cubeIdx(cubeIdx) {}

  void onConnect(BLEClient* pclient) override {}

  void onDisconnect(BLEClient* pclient) override {
    cubes[_cubeIdx].isConnected = false;
    cubes[_cubeIdx].pRxChar = nullptr;
    cubes[_cubeIdx].portPower[0] = 0;
    cubes[_cubeIdx].portPower[1] = 0;
    cubes[_cubeIdx].portPower[2] = 0;

    String sts = "STATUS:" + String(_cubeIdx + 1) + ":DISCONNECTED";
    sendResponse(sts);
    sendResponse("LOG:Cube #" + String(_cubeIdx + 1) + " disconnected from BLE.");
  }
};

class ScanAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    String name = advertisedDevice.getName().c_str();
    String addr = advertisedDevice.getAddress().toString().c_str();
    int rssi = advertisedDevice.getRSSI();

    bool isCircuitCube = false;

    if (advertisedDevice.haveServiceUUID()) {
      BLEUUID nusUuid(NUS_SERVICE_UUID);
      if (advertisedDevice.isAdvertisingService(nusUuid)) {
        isCircuitCube = true;
      }
    }

    String nameLower = name;
    nameLower.toLowerCase();
    if (nameLower.startsWith("tenka") || nameLower.startsWith("circuit") || nameLower.indexOf("cube") != -1) {
      isCircuitCube = true;
    }

    if (name == "CCubes_ESP32_Bridge") return;

    if (isCircuitCube && name.length() > 0) {
      String out = "FOUND:" + addr + ":" + name + ":" + String(rssi);
      sendResponse(out);
    }
  }
};

int clampPower(int power) {
  if (power > 255) return 255;
  if (power < -255) return -255;
  return power;
}

String formatCubeCommand(char channel, int power) {
  int p = clampPower(power);
  char dir = (p < 0) ? '-' : '+';
  int mag = abs(p);
  char buf[8];
  snprintf(buf, sizeof(buf), "%c%03d%c", dir, mag, channel);
  return String(buf);
}

bool connectCube(int cubeIdx, String mac) {
  if (cubeIdx < 0 || cubeIdx >= MAX_CUBES) return false;
  CubeSlot& c = cubes[cubeIdx];

  // 1. Already connected to this exact MAC: Keep existing link, report success immediately
  if (c.isConnected && c.pClient != nullptr && c.pClient->isConnected() && c.macAddress.equalsIgnoreCase(mac)) {
    sendResponse("STATUS:" + String(c.id) + ":CONNECTED:" + mac);
    sendResponse("LOG:Cube #" + String(c.id) + " is already paired and connected to " + mac);
    return true;
  }

  // 2. If previously connected to a different MAC, disconnect it first
  if (c.pClient != nullptr && c.pClient->isConnected()) {
    c.pClient->disconnect();
    delay(100);
  }

  c.macAddress = mac;
  c.isConnected = false;
  c.pRxChar = nullptr;

  sendResponse("STATUS:" + String(c.id) + ":CONNECTING:" + mac);
  sendResponse("LOG:Connecting to " + mac + "...");

  BLEAddress targetAddr(mac.c_str());

  if (c.pClient == nullptr) {
    c.pClient = BLEDevice::createClient();
    c.pClient->setClientCallbacks(new CubeClientCallbacks(cubeIdx));
  }

  bool connected = false;
  if (c.pClient->connect(targetAddr)) {
    connected = true;
  }

  if (!connected) {
    sendResponse("STATUS:" + String(c.id) + ":FAILED:NOT_FOUND");
    sendResponse("LOG:Could not reach Cube #" + String(c.id) + " (" + mac + "). Is it turned on?");
    return false;
  }

  BLERemoteService* pRemoteService = c.pClient->getService(BLEUUID(NUS_SERVICE_UUID));
  if (pRemoteService != nullptr) {
    c.pRxChar = pRemoteService->getCharacteristic(BLEUUID(NUS_CHAR_RX_UUID));
  }

  if (c.pRxChar == nullptr) {
    sendResponse("STATUS:" + String(c.id) + ":FAILED:SERVICE_NOT_FOUND");
    c.pClient->disconnect();
    return false;
  }

  c.isConnected = true;
  c.portPower[0] = 0;
  c.portPower[1] = 0;
  c.portPower[2] = 0;

  // Ultra-low latency connection interval: 7.5ms min, 15ms max
  c.pClient->updateConnParams(6, 12, 0, 200);

  sendResponse("STATUS:" + String(c.id) + ":CONNECTED:" + mac);
  sendResponse("LOG:Cube #" + String(c.id) + " connected successfully!");
  return true;
}

void disconnectCube(int cubeIdx) {
  if (cubeIdx < 0 || cubeIdx >= MAX_CUBES) return;
  CubeSlot& c = cubes[cubeIdx];
  if (c.pClient != nullptr && c.pClient->isConnected()) {
    if (c.pRxChar != nullptr) {
      const char* stopCmd = "+000a+000b+000c";
      c.pRxChar->writeValue((uint8_t*)stopCmd, strlen(stopCmd), false);
    }
    c.pClient->disconnect();
  }
  c.isConnected = false;
  c.pRxChar = nullptr;
  sendResponse("STATUS:" + String(c.id) + ":DISCONNECTED");
}

bool setMotorPower(int cubeIdx, char channel, int power) {
  if (cubeIdx < 0 || cubeIdx >= MAX_CUBES) return false;
  CubeSlot& c = cubes[cubeIdx];

  if (!c.isConnected || c.pClient == nullptr || !c.pClient->isConnected() || c.pRxChar == nullptr) {
    c.isConnected = false;
    return false;
  }

  String cmd = "";
  if (channel == 'a' || channel == 'A') {
    c.portPower[0] = power;
    cmd = formatCubeCommand('a', power);
  } else if (channel == 'b' || channel == 'B') {
    c.portPower[1] = power;
    cmd = formatCubeCommand('b', power);
  } else if (channel == 'c' || channel == 'C') {
    c.portPower[2] = power;
    cmd = formatCubeCommand('c', power);
  } else if (channel == '*' || channel == 'x' || channel == 'X') {
    c.portPower[0] = power;
    c.portPower[1] = power;
    c.portPower[2] = power;
    cmd = formatCubeCommand('a', power) + formatCubeCommand('b', power) + formatCubeCommand('c', power);
  } else {
    return false;
  }

  c.pRxChar->writeValue((uint8_t*)cmd.c_str(), cmd.length(), false);
  return true;
}

void stopCube(int cubeIdx) {
  if (cubeIdx >= 0 && cubeIdx < MAX_CUBES) {
    setMotorPower(cubeIdx, '*', 0);
  }
}

void stopAllCubes() {
  for (int i = 0; i < MAX_CUBES; i++) {
    if (cubes[i].isConnected) {
      stopCube(i);
    }
  }
}

void startScan(int durationSeconds) {
  if (isScanning) {
    pBLEScan->stop();
  }
  if (durationSeconds <= 0) durationSeconds = 4;
  if (durationSeconds > 15) durationSeconds = 15;

  pBLEScan->clearResults();
  isScanning = true;
  scanEndTime = millis() + (durationSeconds * 1000UL);
  sendResponse("LOG:BLE Scan started for " + String(durationSeconds) + " seconds...");
  pBLEScan->start(durationSeconds, false);
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line == "PING") {
    sendResponse("PONG:CCUBES_BLE_BRIDGE_V1");
    return;
  }

  if (line.startsWith("SCAN")) {
    int duration = 4;
    int colIdx = line.indexOf(':');
    if (colIdx != -1) {
      duration = line.substring(colIdx + 1).toInt();
    }
    startScan(duration);
    return;
  }

  if (line.startsWith("ASSIGN:")) {
    int firstColon = line.indexOf(':');
    int secondColon = line.indexOf(':', firstColon + 1);
    if (firstColon != -1 && secondColon != -1) {
      int cubeNum = line.substring(firstColon + 1, secondColon).toInt();
      String mac = line.substring(secondColon + 1);
      mac.trim();
      mac.toUpperCase();
      connectCube(cubeNum - 1, mac);
    }
    return;
  }

  if (line.startsWith("DISCONNECT:")) {
    int cubeNum = line.substring(line.indexOf(':') + 1).toInt();
    disconnectCube(cubeNum - 1);
    return;
  }

  if (line.startsWith("MOTOR:")) {
    int c1 = line.indexOf(':');
    int c2 = line.indexOf(':', c1 + 1);
    int c3 = line.indexOf(':', c2 + 1);
    if (c1 != -1 && c2 != -1 && c3 != -1) {
      int cubeNum = line.substring(c1 + 1, c2).toInt();
      String chStr = line.substring(c2 + 1, c3);
      int pwr = line.substring(c3 + 1).toInt();
      char ch = 'a';
      if (chStr.equalsIgnoreCase("all") || chStr == "*") ch = '*';
      else if (chStr.length() > 0) ch = tolower(chStr.charAt(0));

      if (setMotorPower(cubeNum - 1, ch, pwr)) {
        sendResponse("OK");
      }
    }
    return;
  }

  if (line.startsWith("STOP:")) {
    int cubeNum = line.substring(line.indexOf(':') + 1).toInt();
    stopCube(cubeNum - 1);
    sendResponse("OK");
    return;
  }

  if (line == "STOP_ALL" || line == "STOP") {
    stopAllCubes();
    sendResponse("OK");
    return;
  }
}

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(10);
  delay(200);

  for (int i = 0; i < MAX_CUBES; i++) {
    cubes[i].id = i + 1;
    cubes[i].macAddress = "";
    cubes[i].pClient = nullptr;
    cubes[i].pRxChar = nullptr;
    cubes[i].isConnected = false;
    cubes[i].portPower[0] = 0;
    cubes[i].portPower[1] = 0;
    cubes[i].portPower[2] = 0;
  }

  BLEDevice::init("CCubes_ESP32_Bridge");
  BLEDevice::setMTU(517);

  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  BLEService* pService = pBleServer->createService(BLEUUID(NUS_SERVICE_UUID));

  pServerTxChar = pService->createCharacteristic(
    BLEUUID(NUS_CHAR_TX_UUID),
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pServerTxChar->addDescriptor(new BLE2902());

  BLECharacteristic* pServerRxChar = pService->createCharacteristic(
    BLEUUID(NUS_CHAR_RX_UUID),
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  pServerRxChar->setCallbacks(new BleServerRxCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLEUUID(NUS_SERVICE_UUID));
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMaxPreferred(0x10);
  BLEDevice::startAdvertising();

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  Serial.println("\r\n===============================================");
  Serial.println("Circuit Cubes ESP32 Wireless BLE Multi-Role Hub");
  Serial.println("Peripheral Name: CCubes_ESP32_Bridge");
  Serial.println("===============================================");
  sendResponse("PONG:CCUBES_BLE_BRIDGE_V1");
}

static char rxBuffer[128];
static uint8_t rxIndex = 0;

void loop() {
  flushResponses();

  std::string bleCmd = "";
  portENTER_CRITICAL(&cmdMux);
  if (!bleCmdQueue.empty()) {
    bleCmd = bleCmdQueue.front();
    bleCmdQueue.pop();
  }
  portEXIT_CRITICAL(&cmdMux);

  if (bleCmd.length() > 0) {
    handleCommand(String(bleCmd.c_str()));
  }

  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (rxIndex > 0) {
        rxBuffer[rxIndex] = '\0';
        handleCommand(String(rxBuffer));
        rxIndex = 0;
      }
    } else {
      if (rxIndex < sizeof(rxBuffer) - 1) {
        rxBuffer[rxIndex++] = c;
      }
    }
  }

  if (isScanning && millis() >= scanEndTime) {
    isScanning = false;
    pBLEScan->stop();
    sendResponse("SCAN_DONE");
  }
}
