/*
  =============================================================================
  Circuit Cubes ESP32 NimBLE Wireless Multi-Role Bridge (CCubesESP32BLEBridge.ino)
  =============================================================================
  Powered by NimBLE-Arduino (https://github.com/h2zero/NimBLE-Arduino)

  Compatible with:
    - ESP32 (ESP-WROOM-32, NodeMCU-32S, ESP32 DevKit)
    - ESP32-S3 (ESP32-S3 DevKitC-1, etc.)
    - ESP32-C3 (ESP32-C3 DevKitM-1, SuperMini, etc.)
    - ESP32 Arduino Core 2.0.x and 3.x+ (e.g. 3.3.12)
    - NimBLE-Arduino 1.4.x and 2.x+ (auto-detected)

  Architecture:
    PC (Web Bluetooth in Chrome / Edge / Opera)
         || (BLE Wireless - Peripheral Role: "CCubes_ESP32_Bridge")
       ESP32 (NimBLE Multi-Role: Server to PC, Central Client to Cubes)
         || (BLE Wireless - Central Role)
    Circuit Cube #1 & Cube #2 (Tenka Nordic UART Service)

    * Also accepts commands simultaneously via USB Serial (115200 baud).

  Why NimBLE-Arduino instead of Bluedroid?
    1. Uses ~50% less RAM and Flash memory.
    2. Native, clean multi-role: Peripheral (Server) and Central (Client) connections
       are fully isolated in the stack. Disconnecting or powering off a Cube NEVER
       interferes with or drops the Web Bluetooth connection to your PC.
    3. Faster connection establishment and lower latency.
    4. Full dual-compatibility with NimBLE-Arduino 1.4.x and 2.x+.

  Serial & Web Bluetooth Protocol (115200 baud / NUS GATT, newline-terminated):
    PC -> ESP32:
      PING                         -> Handshake check (responds: PONG:CCUBES_BLE_BRIDGE_V1)
      STATUS                       -> Queries connection status of both cubes
      SCAN:<seconds>               -> Runs BLE scan (e.g. SCAN:4)
      ASSIGN:<cubeNum>:<mac>       -> Connects Cube 1 or 2 to MAC (e.g. ASSIGN:1:98:DA:10:08:36:67)
      DISCONNECT:<cubeNum>         -> Disconnects specified cube (e.g. DISCONNECT:1)
      MOTOR:<cubeNum>:<ch>:<power> -> Commands motor (e.g. MOTOR:1:a:200 or MOTOR:2:all:0)
      STOP:<cubeNum>               -> Stops all 3 channels on cube (e.g. STOP:1)
      STOP_ALL                     -> Stops all channels on all connected cubes

    ESP32 -> PC (emitted over Web Bluetooth notifications & USB Serial):
      PONG:CCUBES_BLE_BRIDGE_V1
      STATUS:<cubeNum>:<STATE>:<mac> (STATE = CONNECTED | DISCONNECTED | FAILED | CONNECTING)
      FOUND:<mac>:<name>:<rssi>    -> Emitted during SCAN for each Tenka/Circuit Cube
      SCAN_DONE                    -> Emitted when BLE scan finishes
      LOG:<message>
      OK

  Prerequisites (Arduino IDE):
    1. Go to Tools -> Manage Libraries...
    2. Search for "NimBLE-Arduino" by h2zero.
    3. Install the latest version.
  =============================================================================
*/

#include <Arduino.h>
#include <NimBLEDevice.h>

static const char* NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

#define MAX_CUBES 2

struct CubeSlot {
  int id;
  String macAddress;
  NimBLEClient* pClient;
  NimBLERemoteCharacteristic* pRxChar;
  bool isConnected;
  int portPower[3];
};

static CubeSlot cubes[MAX_CUBES];
static NimBLEScan* pBLEScan = nullptr;

static NimBLEServer* pBleServer = nullptr;
static NimBLECharacteristic* pServerTxChar = nullptr;
static NimBLECharacteristic* pServerRxChar = nullptr;
static bool isPcConnected = false;

// Asynchronous event flags (strictly decoupled from callback contexts)
static volatile bool cubeDisconnectedFlags[MAX_CUBES] = {false, false};
static volatile bool pcConnectedFlag = false;
static volatile bool pcDisconnectedFlag = false;

// Lock-free ring buffer for incoming BLE commands from PC
#define CMD_QUEUE_SIZE 8
#define CMD_BUF_LEN 80
static char bleCmdQueue[CMD_QUEUE_SIZE][CMD_BUF_LEN];
static volatile int bleCmdHead = 0;
static volatile int bleCmdTail = 0;

// Discovered device buffer for background scan
struct DiscoveredItem {
  char addr[20];
  char name[32];
  int rssi;
};
#define MAX_DISCOVERED 16
static DiscoveredItem discItems[MAX_DISCOVERED];
static volatile int discCount = 0;
static int discSent = 0;

// Forward declaration
void handleCommand(String line);

// Transmit telemetry / logs to both PC (BLE Notification) and USB Serial
// MUST only be called from loop() or functions called by loop()
void sendResponse(String msg) {
  Serial.println(msg);

  if (isPcConnected && pServerTxChar != nullptr) {
    String payload = msg + "\n";
    const uint8_t* data = (const uint8_t*)payload.c_str();
    size_t len = payload.length();
    size_t offset = 0;

    // Send in standard BLE 20-byte chunks to fit within default MTU
    while (offset < len) {
      size_t chunk = (len - offset > 20) ? 20 : (len - offset);
      pServerTxChar->setValue(data + offset, chunk);
      pServerTxChar->notify();
      offset += chunk;
      if (offset < len) delay(2);
    }
  }
}

// ---------------------------------------------------------------------------
// NimBLE Server Callbacks (PC <-> ESP32)
// In NimBLE, server callbacks ONLY trigger for clients connecting to our server!
// Dual-compatibility for NimBLE 1.x and 2.x
// ---------------------------------------------------------------------------
#if __has_include(<NimBLEConnInfo.h>)
// NimBLE 2.x+
class BleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
    isPcConnected = true;
    pcConnectedFlag = true;
  }

  void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
    isPcConnected = false;
    pcDisconnectedFlag = true;
  }
};

class BleServerRxCallbacks : public NimBLECharacteristicCallbacks {
  char lineBuffer[CMD_BUF_LEN];
  uint8_t lineIndex = 0;

  void onWrite(NimBLECharacteristic* pCharacteristic, NimBLEConnInfo& connInfo) override {
    std::string val = pCharacteristic->getValue();
    for (size_t i = 0; i < val.length(); i++) {
      char c = val[i];
      if (c == '\n' || c == '\r') {
        if (lineIndex > 0) {
          lineBuffer[lineIndex] = '\0';
          int nextHead = (bleCmdHead + 1) % CMD_QUEUE_SIZE;
          if (nextHead != bleCmdTail) {
            strncpy(bleCmdQueue[bleCmdHead], lineBuffer, CMD_BUF_LEN - 1);
            bleCmdQueue[bleCmdHead][CMD_BUF_LEN - 1] = '\0';
            bleCmdHead = nextHead;
          }
          lineIndex = 0;
        }
      } else {
        if (lineIndex < sizeof(lineBuffer) - 1) {
          lineBuffer[lineIndex++] = c;
        }
      }
    }
  }
};
#else
// NimBLE 1.4.x
class BleServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer) override {
    isPcConnected = true;
    pcConnectedFlag = true;
  }

  void onDisconnect(NimBLEServer* pServer) override {
    isPcConnected = false;
    pcDisconnectedFlag = true;
  }
};

class BleServerRxCallbacks : public NimBLECharacteristicCallbacks {
  char lineBuffer[CMD_BUF_LEN];
  uint8_t lineIndex = 0;

  void onWrite(NimBLECharacteristic* pCharacteristic) override {
    std::string val = pCharacteristic->getValue();
    for (size_t i = 0; i < val.length(); i++) {
      char c = val[i];
      if (c == '\n' || c == '\r') {
        if (lineIndex > 0) {
          lineBuffer[lineIndex] = '\0';
          int nextHead = (bleCmdHead + 1) % CMD_QUEUE_SIZE;
          if (nextHead != bleCmdTail) {
            strncpy(bleCmdQueue[bleCmdHead], lineBuffer, CMD_BUF_LEN - 1);
            bleCmdQueue[bleCmdHead][CMD_BUF_LEN - 1] = '\0';
            bleCmdHead = nextHead;
          }
          lineIndex = 0;
        }
      } else {
        if (lineIndex < sizeof(lineBuffer) - 1) {
          lineBuffer[lineIndex++] = c;
        }
      }
    }
  }
};
#endif

// ---------------------------------------------------------------------------
// NimBLE Client Callbacks (ESP32 <-> Circuit Cubes)
// ZERO delays, ZERO allocations, ZERO serial writes here!
// ---------------------------------------------------------------------------
#if __has_include(<NimBLEConnInfo.h>)
class CubeClientCallbacks : public NimBLEClientCallbacks {
  int _cubeIdx;
public:
  CubeClientCallbacks(int cubeIdx) : _cubeIdx(cubeIdx) {}

  void onConnect(NimBLEClient* pClient) override {}

  void onDisconnect(NimBLEClient* pClient, int reason) override {
    cubes[_cubeIdx].isConnected = false;
    cubeDisconnectedFlags[_cubeIdx] = true;
  }
};
#else
class CubeClientCallbacks : public NimBLEClientCallbacks {
  int _cubeIdx;
public:
  CubeClientCallbacks(int cubeIdx) : _cubeIdx(cubeIdx) {}

  void onConnect(NimBLEClient* pClient) override {}

  void onDisconnect(NimBLEClient* pClient) override {
    cubes[_cubeIdx].isConnected = false;
    cubeDisconnectedFlags[_cubeIdx] = true;
  }
};
#endif

// ---------------------------------------------------------------------------
// NimBLE Scanner Callbacks (supports both 2.x and 1.4.x)
// ---------------------------------------------------------------------------
#if __has_include(<NimBLEConnInfo.h>)
// NimBLE 2.x+
class ScanCallbacks : public NimBLEScanCallbacks {
  void onResult(const NimBLEAdvertisedDevice* advertisedDevice) override {
    String name = advertisedDevice->getName().c_str();
    String addr = advertisedDevice->getAddress().toString().c_str();
    int rssi = advertisedDevice->getRSSI();

    bool isCircuitCube = false;

    // Check by Nordic UART Service UUID
    if (advertisedDevice->haveServiceUUID()) {
      NimBLEUUID nusUuid(NUS_SERVICE_UUID);
      if (advertisedDevice->isAdvertisingService(nusUuid)) {
        isCircuitCube = true;
      }
    }

    // Check by name prefix
    String nameLower = name;
    nameLower.toLowerCase();
    if (nameLower.startsWith("tenka") || nameLower.startsWith("circuit") || nameLower.indexOf("cube") != -1) {
      isCircuitCube = true;
    }

    // Never report our own bridge peripheral name
    if (name == "CCubes_ESP32_Bridge") return;

    if (isCircuitCube && name.length() > 0) {
      if (discCount < MAX_DISCOVERED) {
        bool exists = false;
        for (int i = 0; i < discCount; i++) {
          if (strcasecmp(discItems[i].addr, addr.c_str()) == 0) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          strncpy(discItems[discCount].addr, addr.c_str(), 19);
          discItems[discCount].addr[19] = '\0';
          strncpy(discItems[discCount].name, name.c_str(), 31);
          discItems[discCount].name[31] = '\0';
          discItems[discCount].rssi = rssi;
          discCount++;
        }
      }
    }
  }
};
#else
// NimBLE 1.4.x
class ScanAdvertisedDeviceCallbacks : public NimBLEAdvertisedDeviceCallbacks {
  void onResult(NimBLEAdvertisedDevice* advertisedDevice) override {
    String name = advertisedDevice->getName().c_str();
    String addr = advertisedDevice->getAddress().toString().c_str();
    int rssi = advertisedDevice->getRSSI();

    bool isCircuitCube = false;

    if (advertisedDevice->haveServiceUUID()) {
      NimBLEUUID nusUuid(NUS_SERVICE_UUID);
      if (advertisedDevice->isAdvertisingService(nusUuid)) {
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
      if (discCount < MAX_DISCOVERED) {
        bool exists = false;
        for (int i = 0; i < discCount; i++) {
          if (strcasecmp(discItems[i].addr, addr.c_str()) == 0) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          strncpy(discItems[discCount].addr, addr.c_str(), 19);
          discItems[discCount].addr[19] = '\0';
          strncpy(discItems[discCount].name, name.c_str(), 31);
          discItems[discCount].name[31] = '\0';
          discItems[discCount].rssi = rssi;
          discCount++;
        }
      }
    }
  }
};
#endif

// ---------------------------------------------------------------------------
// Protocol Translation Helpers
// ---------------------------------------------------------------------------
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

void flushDiscovered() {
  while (discSent < discCount) {
    String out = "FOUND:" + String(discItems[discSent].addr) + ":" + String(discItems[discSent].name) + ":" + String(discItems[discSent].rssi);
    sendResponse(out);
    discSent++;
  }
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
  sendResponse("LOG:Searching for Cube " + mac + "...");

  pBLEScan->clearResults();

#if __has_include(<NimBLEConnInfo.h>)
  // NimBLE 2.x+: getResults takes duration in milliseconds and blocks synchronously
  NimBLEScanResults scanResults = pBLEScan->getResults(2000, false);
#else
  // NimBLE 1.4.x: start takes duration in seconds and blocks synchronously
  NimBLEScanResults scanResults = pBLEScan->start(2, false);
#endif

  discCount = 0;
  discSent = 0;

  const NimBLEAdvertisedDevice* pFoundDevice = nullptr;

  for (size_t i = 0; i < scanResults.getCount(); i++) {
    const NimBLEAdvertisedDevice* dev = scanResults.getDevice(i);
    if (dev != nullptr) {
      String devAddr = dev->getAddress().toString().c_str();
      if (devAddr.equalsIgnoreCase(mac)) {
        pFoundDevice = dev;
        break;
      }
    }
  }

  if (pFoundDevice == nullptr) {
    pBLEScan->clearResults();
    sendResponse("STATUS:" + String(c.id) + ":FAILED:NOT_FOUND");
    sendResponse("LOG:Cube " + mac + " not found nearby (Cube is off or out of range).");
    return false;
  }

  pBLEScan->stop();
  delay(50);

  sendResponse("LOG:Cube found! Establishing BLE connection...");

  if (c.pClient == nullptr) {
    c.pClient = NimBLEDevice::createClient();
    c.pClient->setClientCallbacks(new CubeClientCallbacks(cubeIdx));
  }

  // Set a generous 6-second timeout (6000 ms)
  c.pClient->setConnectTimeout(6000);

  bool connected = false;
  for (int attempt = 1; attempt <= 3; attempt++) {
    sendResponse("LOG:Connecting to Cube #" + String(c.id) + " (attempt " + String(attempt) + "/3)...");
    connected = c.pClient->connect(pFoundDevice);
    if (connected) break;
    delay(250);
  }

  pBLEScan->clearResults();

  if (!connected) {
    sendResponse("STATUS:" + String(c.id) + ":FAILED:NOT_FOUND");
    sendResponse("LOG:Could not reach Cube #" + String(c.id) + " (" + mac + ").");
    return false;
  }

  NimBLERemoteService* pRemoteService = c.pClient->getService(NUS_SERVICE_UUID);
  if (pRemoteService != nullptr) {
    c.pRxChar = pRemoteService->getCharacteristic(NUS_CHAR_RX_UUID);
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

  // Ultra-stable cooperative BLE connection parameters:
  // 30ms-50ms interval, latency 2, supervision timeout 400 (4.0s)
  c.pClient->updateConnParams(24, 40, 2, 400);

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
      c.pRxChar->writeValue((const uint8_t*)stopCmd, strlen(stopCmd), false);
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

  NimBLERemoteCharacteristic* ch = c.pRxChar;
  if (ch == nullptr || cubeDisconnectedFlags[cubeIdx]) return false;
  ch->writeValue((const uint8_t*)cmd.c_str(), cmd.length(), false);
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
  if (durationSeconds <= 0) durationSeconds = 4;
  if (durationSeconds > 15) durationSeconds = 15;

  discCount = 0;
  discSent = 0;
  pBLEScan->clearResults();
  sendResponse("LOG:BLE Scan started for " + String(durationSeconds) + " seconds...");

#if __has_include(<NimBLEConnInfo.h>)
  pBLEScan->getResults(durationSeconds * 1000UL, false);
#else
  pBLEScan->start(durationSeconds, false);
#endif

  flushDiscovered();
  sendResponse("SCAN_DONE");
  sendResponse("LOG:BLE Scan complete.");
}

// ---------------------------------------------------------------------------
// Command Parser
// ---------------------------------------------------------------------------
void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line == "PING") {
    sendResponse("PONG:CCUBES_BLE_BRIDGE_V1");
    return;
  }

  if (line == "STATUS") {
    for (int i = 0; i < MAX_CUBES; i++) {
      if (cubes[i].isConnected) {
        sendResponse("STATUS:" + String(cubes[i].id) + ":CONNECTED:" + cubes[i].macAddress);
      } else {
        sendResponse("STATUS:" + String(cubes[i].id) + ":DISCONNECTED");
      }
    }
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

// ---------------------------------------------------------------------------
// Arduino setup() & loop()
// ---------------------------------------------------------------------------
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

  // 1. Initialize NimBLE Stack with high MTU support
  NimBLEDevice::init("CCubes_ESP32_Bridge");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // Max TX power for robust RF range
  NimBLEDevice::setMTU(517);

  // 2. Setup GATT Server (Peripheral to PC)
  pBleServer = NimBLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());

  NimBLEService* pService = pBleServer->createService(NUS_SERVICE_UUID);

  pServerTxChar = pService->createCharacteristic(
    NUS_CHAR_TX_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );

  pServerRxChar = pService->createCharacteristic(
    NUS_CHAR_RX_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  pServerRxChar->setCallbacks(new BleServerRxCallbacks());

  pService->start();

  // 3. Setup Advertising to PC
  NimBLEAdvertising* pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->setName("CCubes_ESP32_Bridge");

  // Primary Advertisement contains flags and the full, single name (24 bytes total < 31 bytes)
  NimBLEAdvertisementData advData;
  advData.setFlags(0x06); // General Discoverable + BR/EDR Not Supported
  advData.setName("CCubes_ESP32_Bridge");
  pAdvertising->setAdvertisementData(advData);

  // Scan Response contains the 128-bit Nordic UART Service UUID (18 bytes < 31 bytes)
  NimBLEAdvertisementData scanData;
  scanData.setCompleteServices(NimBLEUUID(NUS_SERVICE_UUID));
  pAdvertising->setScanResponseData(scanData);

#if __has_include(<NimBLEConnInfo.h>)
  pAdvertising->enableScanResponse(true);
#else
  pAdvertising->setScanResponse(true);
#endif
  pAdvertising->setMinInterval(32); // 20ms
  pAdvertising->setMaxInterval(64); // 40ms
  pAdvertising->start();

  // 4. Setup BLE Scanner (Central to Circuit Cubes)
  pBLEScan = NimBLEDevice::getScan();
#if __has_include(<NimBLEConnInfo.h>)
  pBLEScan->setScanCallbacks(new ScanCallbacks());
#else
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanAdvertisedDeviceCallbacks());
#endif
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(60); // 60% duty cycle: keeps radio free for PC server events

  Serial.println("\r\n===============================================");
  Serial.println("Circuit Cubes ESP32 NimBLE Wireless Bridge");
  Serial.println("Peripheral Name: CCubes_ESP32_Bridge");
  Serial.println("Service UUID: 6e400001-b5a3-f393-e0a9-e50e24dcca9e");
  Serial.println("===============================================");
  sendResponse("PONG:CCUBES_BLE_BRIDGE_V1");
}

static char rxBuffer[128];
static uint8_t rxIndex = 0;

void loop() {
  // 1. Handle PC connection/disconnection state transitions safely
  if (pcConnectedFlag) {
    pcConnectedFlag = false;
    Serial.println("LOG:PC connected to ESP32 Wireless Bridge via Web Bluetooth!");
  }
  if (pcDisconnectedFlag) {
    pcDisconnectedFlag = false;
    isPcConnected = false;
    Serial.println("LOG:PC disconnected from ESP32 Wireless Bridge. Restarting advertising...");
    NimBLEDevice::startAdvertising();
  }

  // 2. Handle Cube peripheral disconnect events safely (e.g. Cube powered off)
  for (int i = 0; i < MAX_CUBES; i++) {
    if (cubeDisconnectedFlags[i]) {
      cubeDisconnectedFlags[i] = false;
      cubes[i].isConnected = false;
      cubes[i].pRxChar = nullptr;
      cubes[i].portPower[0] = 0;
      cubes[i].portPower[1] = 0;
      cubes[i].portPower[2] = 0;

      sendResponse("STATUS:" + String(i + 1) + ":DISCONNECTED");
      sendResponse("LOG:Cube #" + String(i + 1) + " disconnected from BLE.");
    }
  }

  // 3. Emit any newly discovered Cubes found during background scan
  flushDiscovered();

  // 4. Process commands received from PC via Web Bluetooth (lock-free ring buffer)
  if (bleCmdHead != bleCmdTail) {
    char cmdBuf[CMD_BUF_LEN];
    strncpy(cmdBuf, bleCmdQueue[bleCmdTail], CMD_BUF_LEN);
    bleCmdTail = (bleCmdTail + 1) % CMD_QUEUE_SIZE;
    handleCommand(String(cmdBuf));
  }

  // 5. Read any serial commands from USB if connected
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

  delay(2);
}
