// device/DeviceLegoA_WS.js
// Optimized WebSocket-based Lego Interface A v2 driver.
// Works with the ESP32 WS bridge + optimized Arduino sketch.

import { LegoInterfaceA_v2 } from "./DeviceLegoA_v2.js";

export class LegoInterfaceA_ws extends LegoInterfaceA_v2 {
  constructor(name, manager, wsUrl = "wss://127.0.0.1:7890/lego-bridge") {
    super(name, manager);

    this.wsUrl = wsUrl;
    this.ws = null;

    // WebSerial fields unused in WS mode
    this.port = null;
    this.reader = null;
    this.writer = null;

    // Zero-copy ring buffer for incoming bytes
    this.rb = new Uint8Array(2048);
    this.rbHead = 0;
    this.rbTail = 0;

  }

  // ---------------- Transport overrides ----------------

  ensureAlive() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Device ${this.name || "LegoA_WS"} is disconnected`);
    }
  }

  async writeBytes(bytes) {
    return this.enqueueCommand(async () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(bytes);
      }
    });
  }

  // ---------------- Connection + Handshake ----------------

  async connect() {
    this.setStatus("connecting", "Opening WebSocket...");
    this.log(`Connecting to WS bridge at ${this.wsUrl}...`);

    this.ws = new WebSocket(this.wsUrl);
    this.ws.binaryType = "arraybuffer";

    return new Promise((resolve, reject) => {
      let connected = false;
      let timeoutId = null;

      const fail = (err) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = null;

        if (!connected) {
          try { this.ws?.close(); } catch {}
          this.ws = null;
        }

        reject(err);
      };

      this.ws.onopen = () => {
        this.log("WebSocket opened.");
        this.setStatus("handshaking", "Sending handshake...");

        // Send handshake phrase (Arduino only recognizes it)
        // this.writeBytes(this.HANDSHAKE_SEND);
				this.ws.send(new Uint8Array([0xAA, 0x55, 0xA5]));

        // Start keep-alive + packet monitor
        this.startKeepAlive();
        this.startPacketMonitorWS();

        // If no packets arrive, fail
        timeoutId = setTimeout(() => {
          if (!connected) {
            fail(new Error("No packets received from Arduino via WS bridge"));
          }
        }, 2000);
      };

			this.ws.onmessage = (event) => {
				const data = event.data;
				if (!(data instanceof ArrayBuffer)) return;

				const bytes = new Uint8Array(data);

				// -------------------------
				// HEARTBEAT (1 byte = 0xFF)
				// -------------------------
				if (bytes.length === 1 && bytes[0] === 0xFF) {
					this.lastPacketTime = performance.now();
					return; // do NOT feed into ring buffer
				}

				// -------------------------
				// REAL PACKET (11 bytes)
				// -------------------------
				this.processIncomingBytes(bytes);

				if (!connected) {
					connected = true;
					if (timeoutId) {
						clearTimeout(timeoutId);
						timeoutId = null;
					}

					if (!this.name) {
						this.name = this.manager._allocateName("LegoA");
					}

					this.log("Handshake complete (WS).");
					this.setStatus("connected", "Connected via WebSocket");
					document.dispatchEvent(new Event("serial-connected"));
					this.readingActive = true;

					resolve(this);
				}
			};


      this.ws.onerror = () => {
        if (!connected) fail(new Error("WebSocket error"));
        else {
          this.setStatus("error", "WebSocket error");
          this.manager?.handleDeviceLost?.(this);
        }
      };

      this.ws.onclose = () => {
        this.readingActive = false;
        this.stopKeepAlive();
        if (this.packetMonitor) {
          clearInterval(this.packetMonitor);
          this.packetMonitor = null;
        }

        if (!connected) fail(new Error("WebSocket closed before connection established"));
        else {
          this.setStatus("disconnected", "Disconnected");
          this.manager?.handleDeviceLost?.(this);
        }
      };
    });
  }

  // ---------------- Packet monitor tuned for WS heartbeat ----------------

	startPacketMonitorWS() {
		this.lastPacketTime = performance.now();
		if (this.packetMonitor) clearInterval(this.packetMonitor);

		this.packetMonitor = setInterval(() => {
			const now = performance.now();

			// Heartbeat arrives every 100 ms
			// Even if Chrome freezes for 2–3 seconds, we recover
			if (now - this.lastPacketTime > 5000) {
				this.log("REAL disconnect detected (WS).");
				clearInterval(this.packetMonitor);
				this.packetMonitor = null;
				this.manager?.handleDeviceLost?.(this);
			}
		}, 200);
	}

  // ---------------- Keep-Alive override ----------------

  startKeepAlive() {
    this.keepAliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(this.KEEP_ALIVE);
      }
    }, 1900);
  }


	processIncomingBytes(bytes) {
		const rb = this.rb;
		const size = rb.length;
		let head = this.rbHead;
		let tail = this.rbTail;

		// 1) Push incoming bytes into ring buffer
		for (let i = 0; i < bytes.length; i++) {
			rb[head] = bytes[i];
			head = (head + 1) % size;

			// Overwrite oldest byte if buffer full
			if (head === tail) {
				tail = (tail + 1) % size;
			}
		}

		// 2) Extract packets
		while (true) {
			// Not enough data for a packet
			let available = head >= tail ? head - tail : size - tail + head;
			if (available < this.PACKET_LEN) break;

			// Search for header 0xA1 0xAF
			let idx = tail;
			let found = false;

			while (available >= 2) {
				if (rb[idx] === this.HEADER0 &&
						rb[(idx + 1) % size] === this.HEADER1) {
					found = true;
					break;
				}
				idx = (idx + 1) % size;
				available--;
			}

			if (!found) {
				// No header found → drop everything except last byte
				tail = (head + size - 1) % size;
				break;
			}

			// Check if full packet is available
			if (available < this.PACKET_LEN) break;

			// Extract packet without copying byte-by-byte
			const packet = new Uint8Array(this.PACKET_LEN);
			for (let i = 0; i < this.PACKET_LEN; i++) {
				packet[i] = rb[(idx + i) % size];
			}

			// Advance tail
			tail = (idx + this.PACKET_LEN) % size;

			// Verify checksum
			if (this.verifyChecksum(packet)) {
				this.lastPacketTime = performance.now();
				this.handlePacket(packet);
			}
		}

		this.rbHead = head;
		this.rbTail = tail;
	}


	// ---------------- Disconnect overrides ----------------

  async disconnect() {
    this.queueActive = false;
    this.setStatus("disconnected", "Disconnecting...");

    this.stopKeepAlive();
    try { await this.commandQueue; } catch {}

    this.readingActive = false;

    if (this.packetMonitor) {
      clearInterval(this.packetMonitor);
      this.packetMonitor = null;
    }

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { await this.writeBytes(this.FORCE_DISCONNECT_CMD); } catch {}
        this.ws.close();
      }
    } catch {}

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.ws = null;
    document.dispatchEvent(new Event("serial-disconnected"));
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
}
