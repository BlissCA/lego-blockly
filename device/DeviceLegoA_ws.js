// device/DeviceLegoA_WS.js
// WebSocket-based Lego Interface A v2 driver using ESP32 bridge.
// Reuses all logic from LegoInterfaceA_v2, only transport is different.

import { LegoInterfaceA_v2 } from "./DeviceLegoA_v2.js";

export class LegoInterfaceA_ws extends LegoInterfaceA_v2 {
  constructor(name, manager, wsUrl = "wss://127.0.0.1:7890/lego-bridge") {
    super(name, manager);

    this.wsUrl = wsUrl;
    this.ws = null;

    // We don't use navigator.serial here
    this.port = null;
    this.reader = null;
    this.writer = null;
  }

  // ---------------- Transport overrides ----------------

  ensureAlive() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Device ${this.name || "LegoA_WS"} is disconnected`);
    }
  }

  async writeBytes(bytes) {
    return this.enqueueCommand(async () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      // bytes is Uint8Array
      this.ws.send(bytes);
    });
  }

  // ---------------- Connection + Handshake (WS) ----------------

  async connect() {
    this.setStatus("connecting", "Opening WebSocket...");
    this.log(`Connecting to WS bridge at ${this.wsUrl}...`);

    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = "arraybuffer";

    return new Promise((resolve, reject) => {
      let connected = false;
      let timeoutId = null;

      const cleanup = (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;

        if (!connected) {
          try { this.ws?.close(); } catch {}
          this.ws = null;
        }

        if (err) reject(err);
      };

      this.ws.onopen = () => {
        this.log("WebSocket opened.");
        this.setStatus("handshaking", "Sending handshake...");

        // Send the same handshake phrase as v2, but we don't wait for reply.
        this.writeBytes(this.HANDSHAKE_SEND).catch(err => {
          this.log("Handshake send error: " + err);
        });

        // Start keep-alive + packet monitor
        this.startKeepAlive();
        this.startPacketMonitor();

        // Set up message handler (continuous reader)
        this._attachWsMessageHandler();

        // Option: wait for first valid packet to confirm connection
        timeoutId = setTimeout(() => {
          if (!connected) {
            this.log("No packets received in time — assuming connection failed.");
            cleanup(new Error("No packets from Arduino via WS bridge"));
          }
        }, 2000);
      };

      this.ws.onmessage = (event) => {
        // First message: mark as connected, then process normally
        if (!connected) {
          connected = true;
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }

          // DeviceManager allocates the name AFTER successful connection
          if (!this.name) {
            this.name = this.manager._allocateName("LegoA");
          }

          this.log("Handshake complete (WS).");
          this.setStatus("connected", "Connected via WebSocket");
          document.dispatchEvent(new Event("serial-connected"));
          this.readingActive = true;

          resolve(this);
        }

        const data = event.data;
        if (data instanceof ArrayBuffer) {
          this.processIncomingBytes(new Uint8Array(data));
        } else if (data instanceof Blob) {
          data.arrayBuffer().then(buf => {
            this.processIncomingBytes(new Uint8Array(buf));
          });
        } else {
          // Ignore text frames; protocol is binary
        }
      };

      this.ws.onerror = (ev) => {
        this.log("WebSocket error.");
        if (!connected) {
          cleanup(new Error("WebSocket error"));
        } else {
          this.setStatus("error", "WebSocket error");
          this.manager?.handleDeviceLost?.(this);
        }
      };

      this.ws.onclose = () => {
        this.log("WebSocket closed.");
        this.readingActive = false;
        this.stopKeepAlive();
        if (this.packetMonitor) {
          clearInterval(this.packetMonitor);
          this.packetMonitor = null;
        }
        if (!connected) {
          cleanup(new Error("WebSocket closed before connection established"));
        } else {
          this.setStatus("disconnected", "Disconnected");
          this.manager?.handleDeviceLost?.(this);
        }
      };

      // Resolve when first packet arrives (see onmessage)
      // If we get here, resolution is handled in onmessage/cleanup.
    });
  }

  _attachWsMessageHandler() {
    // No-op here because we already set ws.onmessage in connect().
    // This method exists just to mirror the structure of v2's startContinuousReader.
  }

  // ---------------- Keep-Alive override (same logic, different transport) ----------------

  startKeepAlive() {
    this.log("Starting keep-alive (WS)...");
    this.keepAliveTimer = setInterval(() => {
      this.enqueueCommand(async () => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(this.KEEP_ALIVE);
      });
    }, 1900);
  }

  // ---------------- Disconnect overrides ----------------

  async disconnect() {
    this.queueActive = false;
    this.log("Disconnecting (WS)...");
    this.setStatus("disconnected", "Disconnecting...");

    this.stopKeepAlive();

    try {
      await this.commandQueue;
    } catch {}

    this.readingActive = false;

    if (this.packetMonitor) {
      clearInterval(this.packetMonitor);
      this.packetMonitor = null;
    }

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Optionally send FORCE_DISCONNECT_CMD to Arduino
        try {
          await this.writeBytes(this.FORCE_DISCONNECT_CMD);
        } catch {}
        this.ws.close();
      }
    } catch (err) {
      this.log(`WS close error: ${err.message || err}`);
    }

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.ws = null;
    this.setStatus("disconnected", "Disconnected");
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly (WS).");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this.commandQueue = Promise.resolve();
    this.stopKeepAlive();
    this.readingActive = false;

    if (this.packetMonitor) {
      clearInterval(this.packetMonitor);
      this.packetMonitor = null;
    }

    try { this.ws?.close(); } catch {}
    this.ws = null;

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.setStatus("disconnected", "Disconnected");
  }

  // ---------------- Handshake helpers (not used in WS) ----------------

  // waitForLine / waitForHandshakeReply are not used in WS mode.
  // We keep them inherited but never call them here.
}
