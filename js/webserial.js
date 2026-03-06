// ======================================================
// DeviceManager — handles multiple devices + UI updates
// ======================================================

class DeviceManager {
  constructor() {
    this.devices = [];
    this.legoBCount = 0;

    this.deviceListEl = document.getElementById("device-list");
    this.disconnectAllBtn = document.getElementById("disconnectAllBtn");
    this.paneEl = document.getElementById("device-pane");
    this.paneToggleEl = document.getElementById("device-pane-toggle");

    this.disconnectAllBtn.addEventListener("click", () => this.disconnectAll());
    this.paneToggleEl.addEventListener("click", () => this.togglePane());
  }

  togglePane() {
    const collapsed = this.paneEl.classList.toggle("collapsed");
    this.paneToggleEl.textContent = collapsed ? "»" : "«";
  }

  async connectLegoInterfaceB() {
    this.legoBCount += 1;
    const name = `LegoB${this.legoBCount}`;

    const device = new LegoInterfaceB(name, this);
    this.devices.push(device);

    this.renderDeviceEntry(device);

    try {
      await device.connect();
    } catch (err) {
      console.error(`[${name}] Connection error:`, err);
      device.setStatus("error", "Connection error");
      this.updateDeviceEntry(device);
    }
  }

  async disconnectAll() {
    const promises = this.devices.map(d => d.disconnect());
    await Promise.allSettled(promises);
    this.devices = [];
    this.deviceListEl.innerHTML = "";
    console.log("All devices disconnected.");
  }

  // ---------------- UI helpers ----------------

  renderDeviceEntry(device) {
    const container = document.createElement("div");
    container.className = "device-entry";
    container.id = `device-${device.name}`;

    container.innerHTML = `
      <div class="device-header">
        <div class="device-name">${device.name}</div>
        <div class="device-status">
          <div class="status-dot" id="status-dot-${device.name}"></div>
          <span id="status-text-${device.name}">Idle</span>
        </div>
      </div>
      <div class="device-meta">
        Packets: <span id="packet-count-${device.name}">0</span>
      </div>
      <div class="device-log" id="log-${device.name}"></div>
    `;

    this.deviceListEl.appendChild(container);
  }

  updateDeviceEntry(device) {
    const dot = document.getElementById(`status-dot-${device.name}`);
    const text = document.getElementById(`status-text-${device.name}`);
    const packetCount = document.getElementById(`packet-count-${device.name}`);

    if (dot) {
      dot.className = "status-dot";
      switch (device.status) {
        case "connecting": dot.classList.add("status-connecting"); break;
        case "handshaking": dot.classList.add("status-handshaking"); break;
        case "active": dot.classList.add("status-active"); break;
        case "error": dot.classList.add("status-error"); break;
        case "disconnected":
        default: dot.classList.add("status-disconnected"); break;
      }
    }

    if (text) text.textContent = device.statusMessage || device.status;
    if (packetCount) packetCount.textContent = device.packetCount.toString();
  }

  appendLog(device, message) {
    const logEl = document.getElementById(`log-${device.name}`);
    if (!logEl) return;

    const timestamp = new Date().toLocaleTimeString();
    logEl.textContent += `[${timestamp}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ======================================================
// LegoInterfaceB — your full protocol, wrapped in a class
// ======================================================

class LegoInterfaceB {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.keepAliveTimer = null;
    this.readingActive = false;

    this.packetBuffer = [];
    this.packetCount = 0;

    this.status = "idle";
    this.statusMessage = "Idle";

    // Handshake constants
    this.HANDSHAKE_SEND_1 = new Uint8Array([0x70, 0x00]); // "p\0"
    this.HANDSHAKE_SEND_2 = new TextEncoder().encode("###Do you byte, when I knock?$$$");
    this.HANDSHAKE_REPLY = "###Just a bit off the block!$$$";

    // Keep-alive constant
    this.KEEP_ALIVE = new Uint8Array([0x02]);
  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager.updateDeviceEntry(this);
  }

  log(msg) {
    console.log(`[${this.name}] ${msg}`);
    this.manager.appendLog(this, msg);
  }

  // ---------------- Connection + Handshake ----------------

  async connect() {
    this.setStatus("connecting", "Requesting port...");
    this.log("Requesting serial port...");

    this.port = await navigator.serial.requestPort();
    await this.port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none"
    });

    this.log("Port opened.");
    this.setStatus("handshaking", "Performing handshake...");

    this.writer = this.port.writable.getWriter();

    await this.sendHandshake();
    this.log("Handshake complete.");

    this.writer.releaseLock();
    this.writer = null;

    this.setStatus("active", "Connected");
    document.dispatchEvent(new Event("serial-connected"));

    this.startKeepAlive();
    this.startContinuousReader();
  }

  async sendHandshake() {
    this.log("Sending handshake part 1...");
    await this.writer.write(this.HANDSHAKE_SEND_1);

    this.log("Sending handshake phrase...");
    await this.writer.write(this.HANDSHAKE_SEND_2);

    const reply = await this.waitForHandshakeReply();
    this.log(`Received handshake reply: ${reply}`);
  }

  async waitForHandshakeReply() {
    const decoder = new TextDecoder();
    let buffer = "";

    const readPromise = new Promise(async (resolve, reject) => {
      while (this.port && this.port.readable) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              if (buffer.includes(this.HANDSHAKE_REPLY)) {
                this.reader.releaseLock();
                this.reader = null;
                resolve(this.HANDSHAKE_REPLY);
                return;
              }
            }
          }
        } catch (err) {
          reject(err);
        } finally {
          if (this.reader) {
            this.reader.releaseLock();
            this.reader = null;
          }
        }
      }
    });

    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => resolve("TIMEOUT"), 500);
    });

    const result = await Promise.race([readPromise, timeoutPromise]);

    if (result === "TIMEOUT") {
      this.log("Handshake timeout!");
      this.setStatus("error", "Handshake timeout");
      throw new Error("Handshake timeout");
    }

    return result;
  }

  // ---------------- Continuous 19-byte Reader ----------------

  async startContinuousReader() {
    this.log("Starting 19-byte reader...");
    this.readingActive = true;

    while (this.port && this.port.readable && this.readingActive) {
      this.reader = this.port.readable.getReader();

      try {
        while (this.readingActive) {
          const { value, done } = await this.reader.read();
          if (done || !this.readingActive) break;
          if (value) this.processIncomingBytes(value);
        }
      } catch (err) {
        if (this.readingActive) {
          this.log(`Read error: ${err.message || err}`);
          this.setStatus("error", "Read error");
        }
      } finally {
        if (this.reader) {
          this.reader.releaseLock();
          this.reader = null;
        }
      }
    }

    this.log("Reader stopped.");
  }

  processIncomingBytes(bytes) {
    for (let b of bytes) {
      this.packetBuffer.push(b);

      if (this.packetBuffer.length === 19) {
        const packet = new Uint8Array(this.packetBuffer);
        this.handlePacket(packet);
        this.packetBuffer = [];
      }
    }
  }

  handlePacket(packet) {
    this.packetCount += 1;
    this.manager.updateDeviceEntry(this);
    this.log(`Packet #${this.packetCount}: [${Array.from(packet).join(", ")}]`);

    // TODO: decode packet for Blockly
  }

  // ---------------- Keep-Alive ----------------

  startKeepAlive() {
    this.log("Starting keep-alive...");
    this.keepAliveTimer = setInterval(async () => {
      try {
        if (!this.port || !this.port.writable) return;
        const w = this.port.writable.getWriter();
        await w.write(this.KEEP_ALIVE);
        w.releaseLock();
        this.log("Keep-alive sent");
      } catch (err) {
        this.log(`Keep-alive error: ${err.message || err}`);
      }
    }, 2000);
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
      this.log("Keep-alive stopped.");
    }
  }

  // ---------------- Disconnect ----------------

  async disconnect() {
    this.log("Disconnecting...");
    this.setStatus("disconnected", "Disconnecting...");

    this.stopKeepAlive();
    this.readingActive = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
        this.log("Reader stopped.");
      }
    } catch (err) {
      this.log(`Reader cancel error: ${err.message || err}`);
    }

    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
        this.log("Writer released.");
      }
    } catch (err) {
      this.log(`Writer release error: ${err.message || err}`);
    }

    try {
      if (this.port) {
        await this.port.close();
        this.log("Port closed.");
      }
    } catch (err) {
      this.log(`Port close error: ${err.message || err}`);
    }

    this.port = null;
    this.setStatus("disconnected", "Disconnected");
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
  }
}

// ======================================================
// Bootstrap
// ======================================================

const deviceManager = new DeviceManager();

document.getElementById("connectLegoBBtn").addEventListener("click", async () => {
  try {
    await deviceManager.connectLegoInterfaceB();
  } catch (err) {
    console.error("Global connect error:", err);
  }
});
