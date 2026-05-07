#include <WiFi.h>
#include <esp_wifi.h>
#include "esp_http_server.h"

const char* ssid     = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* bridgeName = "Bridge 1";

#define RX_PIN 16
#define TX_PIN 17

// Interface A packet size
static const uint8_t PACKET_SIZE = 11;
static const uint8_t HEADER0 = 0xA1;
static const uint8_t HEADER1 = 0xAF;

// UART packet assembly buffer (used only in UART task)
uint8_t packetBuf[PACKET_SIZE];
uint8_t packetIndex = 0;
bool inPacket = false;

// Queue for WS frames (packet or heartbeat)
struct WsFrame {
  uint8_t len;
  uint8_t data[PACKET_SIZE]; // 11 bytes max; heartbeat uses len=1
};

QueueHandle_t wsQueue;

// Heartbeat / keep-alive timing
uint32_t lastHeartbeat = 0;
uint32_t lastKeepAlive = 0;

// ESP-IDF HTTP/WebSocket server
httpd_handle_t httpServer = NULL;

// Track single WebSocket client
volatile bool wsReady = false;
int wsClientFd = -1;  // socket fd of the connected client

// Forward declarations
void uartWsTask(void *param);
bool wsCanSend();

// -----------------------------
// WebSocket send helper (binary)
// -----------------------------
esp_err_t ws_send_binary(const uint8_t* data, size_t len) {
  if (!wsReady || wsClientFd < 0 || !httpServer) return ESP_FAIL;

  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(ws_pkt));
  ws_pkt.type = HTTPD_WS_TYPE_BINARY;
  ws_pkt.payload = (uint8_t*)data;
  ws_pkt.len = len;

  return httpd_ws_send_frame_async(httpServer, wsClientFd, &ws_pkt);
}

bool wsCanSend() {
  return wsReady && httpServer != NULL && wsClientFd >= 0;
}

// -----------------------------
// WebSocket handler (URI: /lego-bridge)
// -----------------------------
esp_err_t ws_handler(httpd_req_t *req) {
  if (req->method == HTTP_GET) {
    // This is the HTTP upgrade to WebSocket
    Serial.println("[WS] Client connected (HTTP GET upgrade)");
    return ESP_OK;
  }

  // WebSocket frame
  httpd_ws_frame_t ws_pkt;
  memset(&ws_pkt, 0, sizeof(ws_pkt));
  ws_pkt.type = HTTPD_WS_TYPE_BINARY;

  // First call with NULL payload to get frame length
  esp_err_t ret = httpd_ws_recv_frame(req, &ws_pkt, 0);
  if (ret != ESP_OK) {
    Serial.printf("[WS] httpd_ws_recv_frame (len) failed: %d\n", ret);
    return ret;
  }

  if (ws_pkt.len > 0) {
    uint8_t *buf = (uint8_t*)malloc(ws_pkt.len);
    if (!buf) {
      Serial.println("[WS] malloc failed");
      return ESP_ERR_NO_MEM;
    }

    ws_pkt.payload = buf;
    ret = httpd_ws_recv_frame(req, &ws_pkt, ws_pkt.len);
    if (ret != ESP_OK) {
      Serial.printf("[WS] httpd_ws_recv_frame (data) failed: %d\n", ret);
      free(buf);
      return ret;
    }

    // Mark WS as ready and remember client fd
    if (!wsReady) {
      wsReady = true;
      wsClientFd = httpd_req_to_sockfd(req);
      lastKeepAlive = millis();
      Serial.println("[WS] Handshake complete, WS ready");
    }

    // Handle keep-alive 0x02
    if (ws_pkt.len == 1 && buf[0] == 0x02) {
      uint32_t now = millis();
      Serial.print("KA → UART: Time elapsed: ");
      Serial.println(now - lastKeepAlive);
      lastKeepAlive = now;
    }

    // Forward all data to UART
    Serial2.write(buf, ws_pkt.len);

    free(buf);
  }

  return ESP_OK;
}

// -----------------------------
// /id endpoint for discovery
// -----------------------------
esp_err_t id_handler(httpd_req_t *req) {
  char resp[256];

  snprintf(resp, sizeof(resp),
    "{"
      "\"type\":\"lego-bridge\","
      "\"name\":\"%s\","
      "\"version\":\"1.0\","
      "\"ws\":\"/lego-bridge\""
    "}",
    bridgeName
  );

  httpd_resp_set_type(req, "application/json");
  httpd_resp_send(req, resp, strlen(resp));
  return ESP_OK;
}

// -----------------------------
// HTTP server setup
// -----------------------------
void startHttpServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;

  if (httpd_start(&httpServer, &config) == ESP_OK) {

    // WS handler
    httpd_uri_t ws_uri = {
      .uri       = "/lego-bridge",
      .method    = HTTP_GET,
      .handler   = ws_handler,
      .user_ctx  = NULL,
      .is_websocket = true
    };
    httpd_register_uri_handler(httpServer, &ws_uri);

    // NEW: /id handler
    httpd_uri_t id_uri = {
      .uri       = "/id",
      .method    = HTTP_GET,
      .handler   = id_handler,
      .user_ctx  = NULL,
      .is_websocket = false
    };
    httpd_register_uri_handler(httpServer, &id_uri);

    Serial.println("[HTTP] Server started, WS at /lego-bridge, ID at /id");
  } else {
    Serial.println("[HTTP] Failed to start server");
  }
}


// -----------------------------
// WiFi setup
// -----------------------------
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  esp_wifi_set_bandwidth(WIFI_IF_STA, WIFI_BW_HT20);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);

  esp_wifi_set_protocol(WIFI_IF_STA,
                        WIFI_PROTOCOL_11B |
                        WIFI_PROTOCOL_11G |
                        WIFI_PROTOCOL_11N);

  WiFi.begin(ssid, password);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(200);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.println(WiFi.localIP());
}

// -----------------------------
// Setup
// -----------------------------
void setup() {
  Serial.begin(115200);

  Serial2.setRxBufferSize(4096);
  Serial2.begin(115200, SERIAL_8N1, RX_PIN, TX_PIN);

  wsQueue = xQueueCreate(32, sizeof(WsFrame));

  setupWiFi();
  startHttpServer();

  // UART → WS queue task
  xTaskCreatePinnedToCore(
    uartWsTask,
    "uartWsTask",
    4096,
    NULL,
    1,
    NULL,
    1
  );
}

// -----------------------------
// Main loop
// -----------------------------
void loop() {
  // Enforce single-client rule: if fd is invalid, mark not ready
  if (wsReady && wsClientFd < 0) {
    wsReady = false;
  }

  // 1) Send queued frames (from UART task)
  if (wsCanSend() && wsQueue) {
    WsFrame frame;
    int sent = 0;
    while (sent < 8 && xQueueReceive(wsQueue, &frame, 0) == pdTRUE) {
      ws_send_binary(frame.data, frame.len);
      sent++;
    }
  }

  // 2) Heartbeat every 100 ms
  uint32_t now = millis();
  if (wsCanSend() && now - lastHeartbeat >= 100) {
    uint8_t hb = 0xFF;
    ws_send_binary(&hb, 1);
    lastHeartbeat = now;
  }

  delay(1);
}

// -----------------------------
// UART → packet → queue task
// -----------------------------
void uartWsTask(void *param) {
  for (;;) {
    while (Serial2.available()) {
      uint8_t b = Serial2.read();

      if (!inPacket) {
        if (packetIndex == 0 && b == HEADER0) {
          packetBuf[packetIndex++] = b;
        } else if (packetIndex == 1 && b == HEADER1) {
          packetBuf[packetIndex++] = b;
          inPacket = true;
        } else {
          packetIndex = 0;
        }
      } else {
        packetBuf[packetIndex++] = b;

        if (packetIndex == PACKET_SIZE) {
          if (wsQueue) {
            WsFrame frame;
            frame.len = PACKET_SIZE;
            memcpy(frame.data, packetBuf, PACKET_SIZE);
            xQueueSend(wsQueue, &frame, 0);
          }
          packetIndex = 0;
          inPacket = false;
        }
      }
    }

    vTaskDelay(1);
  }
}
