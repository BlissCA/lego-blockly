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

  Serial Protocol (115200 baud, newline-terminated):
    PC -> ESP32:
      PING                         -> Handshake check (responds: PONG:CCUBES_BRIDGE_V1)
      SCAN:<seconds>               -> Runs BLE scan (e.g. SCAN:3)
      ASSIGN:<cubeNum>:<mac>       -> Connects Cube 1 or 2 to MAC (e.g. ASSIGN:1:FC:58:FA:86:E9:38)
      DISCONNECT:<cubeNum>         -> Disconnects specified cube (e.g. DISCONNECT:1)
      MOTOR:<cubeNum>:<ch>:<power> -> Commands motor (e.g. MOTOR:1:a:200 or MOTOR:2:all:0)
      STOP:<cubeNum>               -> Stops all 3 channels on cube (e.g. STOP:1)
      STOP_ALL                     -> Stops all channels on all connected cubes
      STATUS                       -> Queries connection status of both cubes

    ESP32 -> PC:
      PONG:CCUBES_BRIDGE_V1
      FOUND:<mac>:<name>:<rssi>    -> Emitted during SCAN for each Tenka/Circuit Cube
      SCAN_DONE                    -> Emitted when BLE scan finishes
      STATUS:<cubeNum>:<STATE>:<mac> (STATE = CONNECTED | DISCONNECTED | FAILED | CONNECTING)
      LOG:<message>
      OK    
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

// Asynchronous event flags (strictly decoupled from FreeRTOS/BTC callback contexts)
static volatile bool cubeDisconnectedFlags[MAX_CUBES] = {false, false};
static volatile bool pcConnectedFlag = false;
static volatile bool pcDisconnectedFlag = false;
static volatile bool pcParamsFlag = false;
static volatile uint8_t pcDisconnectReason = 0;
static volatile unsigned long pcDiscMs = 0;
static volatile unsigned long cubeDiscMs[MAX_CUBES] = {0, 0};
static volatile bool foreignDiscFlag = false;      // server-side disconnect event NOT for the PC link
static uint8_t foreignDiscBda[6] = {0};
static volatile uint8_t foreignDiscReason = 0;
static uint8_t pcDiscBda[6] = {0};
static volatile bool foreignConnFlag = false;      // server-side CONNECT event that is NOT the PC (a Cube link)
static uint8_t foreignConnBda[6] = {0};
static esp_bd_addr_t pcAddr;

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
      pServerTxChar->setValue((uint8_t*)(data + offset), chunk);
      pServerTxChar->notify();
      offset += chunk;
      if (offset < len) delay(2);
    }
  }
}

// ---------------------------------------------------------------------------
// BLE Server Callbacks (PC <-> ESP32)
// ZERO complex operations here to prevent watchdog or stack panics
// ---------------------------------------------------------------------------
class BleServerCallbacks : public BLEServerCallbacks {
public:
  // Bluedroid delivers server-side connect/disconnect events for EVERY link, including the
  // Cube links where we are the central. The PC is the only link where we are the peripheral:
  // link_role == 1 (slave). Anything else is a Cube and must not touch the PC state.
  void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t* param) override {
    if (param->connect.link_role == 1) {
      memcpy(pcAddr, param->connect.remote_bda, sizeof(esp_bd_addr_t));
      isPcConnected = true;
      pcConnectedFlag = true;
      pcParamsFlag = true;
    } else {
      memcpy(foreignConnBda, param->connect.remote_bda, 6);
      foreignConnFlag = true;
    }
  }
  void onConnect(BLEServer* pServer) override {}   // handled above, which knows the link role

  // Reason: 0x08 supervision timeout, 0x13 remote hung up, 0x16 local host hung up
  void onDisconnect(BLEServer* pServer, esp_ble_gatts_cb_param_t* param) override {
    bool isPc = isPcConnected && memcmp(param->disconnect.remote_bda, pcAddr, sizeof(esp_bd_addr_t)) == 0;
    if (isPc) {
      memcpy(pcDiscBda, param->disconnect.remote_bda, 6);
      pcDisconnectReason = param->disconnect.reason;
      pcDiscMs = millis();
      isPcConnected = false;
      pcDisconnectedFlag = true;
    } else {
      memcpy(foreignDiscBda, param->disconnect.remote_bda, 6);
      foreignDiscReason = param->disconnect.reason;
      foreignDiscFlag = true;
    }
  }
  void onDisconnect(BLEServer* pServer) override {}   // handled above, which knows which link dropped
};

// RX Characteristic: PC sends commands here ("MOTOR:1:a:200", "ASSIGN:1:...", etc.)
class BleServerRxCallbacks : public BLECharacteristicCallbacks {
  char lineBuffer[CMD_BUF_LEN];
  uint8_t lineIndex = 0;

  void onWrite(BLECharacteristic* pCharacteristic) override {
    uint8_t* data = pCharacteristic->getData();
    size_t len = pCharacteristic->getLength();
    if (len == 0 || data == nullptr) return;

    for (size_t i = 0; i < len; i++) {
      char c = (char)data[i];
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

// ---------------------------------------------------------------------------
// BLE Client Callbacks (ESP32 <-> Circuit Cubes)
// ZERO delays, ZERO allocations, ZERO serial writes here!
// ---------------------------------------------------------------------------
class CubeClientCallbacks : public BLEClientCallbacks {
  int _cubeIdx;
public:
  CubeClientCallbacks(int cubeIdx) : _cubeIdx(cubeIdx) {}

  void onConnect(BLEClient* pclient) override {}

  void onDisconnect(BLEClient* pclient) override {
    // Only flag it. loop() does the cleanup, so the BT task never nulls a
    // pointer that loop() may be about to use for a write.
    cubes[_cubeIdx].isConnected = false;
    cubeDiscMs[_cubeIdx] = millis();
    cubeDisconnectedFlags[_cubeIdx] = true;
  }
};

class ScanAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    String name = advertisedDevice.getName().c_str();
    String addr = advertisedDevice.getAddress().toString().c_str();
    int rssi = advertisedDevice.getRSSI();

    bool isCircuitCube = false;

    // Check by Nordic UART Service UUID
    if (advertisedDevice.haveServiceUUID()) {
      BLEUUID nusUuid(NUS_SERVICE_UUID);
      if (advertisedDevice.isAdvertisingService(nusUuid)) {
        isCircuitCube = true;
      }
    }

    // Check by name prefix
    String nameLower = name;
    nameLower.toLowerCase();
    if (nameLower.startsWith("tenka") || nameLower.startsWith("circuit") || nameLower.indexOf("cube") != -1) {
      isCircuitCube = true;
    }

    // Never report our own peripheral name
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

  // If a background scan is active, stop it before doing a targeted scan
  if (isScanning) {
    pBLEScan->stop();
    isScanning = false;
  }

  pBLEScan->clearResults();
  BLEScanResults* pResults = pBLEScan->start(2, false);
  discCount = 0; discSent = 0;   // targeted scan: don't report these as FOUND
  BLEAdvertisedDevice* pFoundDevice = nullptr;

  if (pResults != nullptr) {
    for (int i = 0; i < pResults->getCount(); i++) {
      BLEAdvertisedDevice dev = pResults->getDevice(i);
      String devAddr = dev.getAddress().toString().c_str();
      if (devAddr.equalsIgnoreCase(mac)) {
        pFoundDevice = new BLEAdvertisedDevice(dev);
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

  sendResponse("LOG:Cube found! Establishing BLE connection...");

  if (c.pClient == nullptr) {
    c.pClient = BLEDevice::createClient();
    c.pClient->setClientCallbacks(new CubeClientCallbacks(cubeIdx));
  }

  bool connected = false;
  if (c.pClient->connect(pFoundDevice)) {
    connected = true;
  }
  delete pFoundDevice;
  pBLEScan->clearResults();

  if (!connected) {
    sendResponse("STATUS:" + String(c.id) + ":FAILED:NOT_FOUND");
    sendResponse("LOG:Could not reach Cube #" + String(c.id) + " (" + mac + ").");
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

  // Cooperative connection parameters for multi-role coexistence:
  // A powered-off Cube is detected after 2s instead of 4s, so it stops hogging radio time sooner
  c.pClient->updateConnParams(24, 40, 0, 200);   // 30-50ms, no latency, 2s timeout
  
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

  BLERemoteCharacteristic* ch = c.pRxChar;
  if (ch == nullptr || cubeDisconnectedFlags[cubeIdx]) return false;
  ch->writeValue((uint8_t*)cmd.c_str(), cmd.length(), false);
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

void flushDiscovered() {
  while (discSent < discCount) {
    String out = "FOUND:" + String(discItems[discSent].addr) + ":" + String(discItems[discSent].name) + ":" + String(discItems[discSent].rssi);
    sendResponse(out);
    discSent++;
  }
}

void startScan(int durationSeconds) {
  if (isScanning) {
    pBLEScan->stop();
  }
  if (durationSeconds <= 0) durationSeconds = 4;
  if (durationSeconds > 15) durationSeconds = 15;

  discCount = 0;
  discSent = 0;
  pBLEScan->clearResults();
  isScanning = true;
  scanEndTime = millis() + (durationSeconds * 1000UL);
  sendResponse("LOG:BLE Scan started for " + String(durationSeconds) + " seconds...");
  pBLEScan->start(durationSeconds, false);   // blocking: returns when the scan is over

  isScanning = false;
  pBLEScan->stop();
  flushDiscovered();                          // FOUND lines MUST go out before SCAN_DONE
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
#ifdef ESP_ARDUINO_VERSION_MAJOR
  Serial.printf("LOG:Arduino-ESP32 core %d.%d.%d\r\n", ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH);
#endif
  Serial.printf("LOG:Reset reason = %d (1=power-on, 3=software, 4=panic/crash, 5-7=watchdog)\r\n", (int)esp_reset_reason());

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

  // 1. Initialize BLE Stack with high MTU support
  BLEDevice::init("CCubes_ESP32_Bridge");
  BLEDevice::setMTU(517);

  // 2. Setup GATT Server (Peripheral to PC)
  pBleServer = BLEDevice::createServer();
  pBleServer->setCallbacks(new BleServerCallbacks());
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  // Core 3.x restarts advertising itself on EVERY server-side disconnect event, including the
  // spurious ones for Cube links. We restart advertising ourselves, only when the PC leaves.
  pBleServer->advertiseOnDisconnect(false);
#endif

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

  // 3. Setup Advertising to PC
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLEUUID(NUS_SERVICE_UUID));
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x10);
  pAdvertising->setMaxPreferred(0x20);
  BLEDevice::startAdvertising();

  // 4. Setup BLE Scanner (Central to Circuit Cubes)
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new ScanAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  Serial.println("\r\n===============================================");
  Serial.println("Circuit Cubes ESP32 Wireless BLE Multi-Role Hub");
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
  if (foreignConnFlag) {
    foreignConnFlag = false;
    Serial.printf("LOG:Ignored server-side CONNECT event for %02X:%02X:%02X:%02X:%02X:%02X (Cube link, not the PC)\r\n",
                  foreignConnBda[0], foreignConnBda[1], foreignConnBda[2], foreignConnBda[3], foreignConnBda[4], foreignConnBda[5]);
  }
  if (foreignDiscFlag) {
    foreignDiscFlag = false;
    Serial.printf("LOG:Ignored server-side disconnect event for %02X:%02X:%02X:%02X:%02X:%02X (not the PC) reason=0x%02X\r\n",
                  foreignDiscBda[0], foreignDiscBda[1], foreignDiscBda[2], foreignDiscBda[3], foreignDiscBda[4], foreignDiscBda[5],
                  (unsigned)foreignDiscReason);
  }
  if (pcParamsFlag) {
    pcParamsFlag = false;
    // Ask the PC for a 6s supervision timeout so a busy radio can't drop the PC link
    // (the PC may ignore this, Windows often does)
    pBleServer->updateConnParams(pcAddr, 24, 40, 0, 600);
  }
  if (pcDisconnectedFlag) {
    pcDisconnectedFlag = false;
    isPcConnected = false;
    Serial.printf("LOG:PC disconnected: %02X:%02X:%02X:%02X:%02X:%02X reason=0x%02X at t=%lums. Restarting advertising...\r\n",
                  pcDiscBda[0], pcDiscBda[1], pcDiscBda[2], pcDiscBda[3], pcDiscBda[4], pcDiscBda[5],
                  (unsigned)pcDisconnectReason, pcDiscMs);
    BLEDevice::startAdvertising();
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