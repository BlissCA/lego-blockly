// ======================================================
// DeviceManager — handles multiple devices + UI updates
// ======================================================

class DeviceManager {
  constructor() {
    this.devices = [];
    this.legoBCount = 0;

    this.deviceListEl = document.getElementById("device-list");
    this.connectLegoBBtn = document.getElementById("connectLegoBBtn")
    this.disconnectAllBtn = document.getElementById("disconnectAllBtn");
    this.paneEl = document.getElementById("device-pane");

    this.connectLegoBBtn.addEventListener("click", () => this.connectLegoInterfaceB());
    this.disconnectAllBtn.addEventListener("click", () => this.disconnectAll());
    
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
    // Disconnect each device cleanly
    for (const dev of this.devices) {
      try {
        await dev.disconnect();
      } catch (err) {
        console.warn(`Error disconnecting ${dev.name}:`, err);
      }
    }

    // Clear internal list
    this.devices = [];

    // Clear UI
    this.deviceListEl.innerHTML = "";

    // Reset numbering
    this.legoBCount = 0;

    // Notify Blockly dropdowns
    document.dispatchEvent(new Event("serial-disconnected"));

    console.log("All devices disconnected and UI reset.");
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

    // Input state (Python: _iRaw, _iRot, _firstReadDone)
    this.iRaw = new Array(9).fill(0);
    this.iRot = new Array(9).fill(0);
    this.firstReadDone = false;

    // Index mapping (Python: _ix)
    this.ix = [0, 14, 10, 6, 2, 16, 12, 8, 4];

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
    this.lastPacket = packet;

    // Parse 9 words using ix mapping
    for (let x = 0; x < 9; x++) {
      const idx = this.ix[x];
      const hi = packet[idx];
      const lo = packet[idx + 1];
      const word = (hi << 8) | lo;
      this.iRaw[x] = word;

      if (x > 0) {
        let change = word & 0x0003;
        if ((word & 0x0004) === 0) change *= -1;
        this.iRot[x] += change;
      }
    }

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

  // Outputs Processing

  // Write Helper
  async writeBytes(bytes) {
    if (!this.writer) return;
    await this.writer.write(bytes);
  }

  // Helper: send single-byte command
  async sendCmdByte(base, port) {
    const b = (base | (port & 0x07)) & 0xFF;
    await this.writeBytes(new Uint8Array([b]));
  }

  // Output Ports are 1–8 to match Input Ports 1-8 on the device, but we want 0–7 for bitmasking. 
  // On the Device, output ports are A=1, B=2, C=3, D=4, ... H=8.
  normPort(port) {
    return (port - 1) & 7;
  }

  async outOn(port)    { await this.sendCmdByte(0x28, this.normPort(port)); }
  async outOnL(port)   { await this.sendCmdByte(0x10, this.normPort(port)); }
  async outOnR(port)   { await this.sendCmdByte(0x18, this.normPort(port)); }
  async outOff(port)   { await this.sendCmdByte(0x38, this.normPort(port)); }
  async outFloat(port) { await this.sendCmdByte(0x30, this.normPort(port)); }
  async outRev(port)   { await this.sendCmdByte(0x20, this.normPort(port)); }
  async outL(port)     { await this.sendCmdByte(0x40, this.normPort(port)); }
  async outR(port)     { await this.sendCmdByte(0x48, this.normPort(port)); }

  async outPow(port, power) {
    const p = power & 0x07;
    const cmd = (0xB0 | p) & 0xFF;
    const mask = (1 << this.normPort(port)) & 0xFF;
    await this.writeBytes(new Uint8Array([cmd, mask]));
  }

  async outOnFor(port, ton) {
    const t = ton & 0xFF;
    const cmd = (0xC0 | this.normPort(port)) & 0xFF;
    await this.writeBytes(new Uint8Array([cmd, t]));
  }

  // End of Outputs Processing

  // port: 0–8 (0 is special, Red Stop Button)
  inputOn(port) {
    const word = this.iRaw[port];
    if (port > 0) {
      return (word & 0x0008) === 0;
    } else {
      return (word & 0x1000) !== 0;
    }
  }

  inputVal(port) {
    const word = this.iRaw[port];
    return (word >> 6) & 0x03FF;
  }

  inputTempF(port) {
    const v = this.inputVal(port);
    return (760.0 - v) / 4.4 + 32.0;
  }

  inputTempC(port) {
    const v = this.inputVal(port);
    return ((760.0 - v) / 4.4) * 5.0 / 9.0;
  }

  getRot(port) {
    return this.iRot[port];
  }

  setRot(port, r) {
    this.iRot[port] = r;
  }

}

// ======================================================
// Bootstrap
// ======================================================

window.addEventListener("DOMContentLoaded", () => {
  window.deviceManager = new DeviceManager();
});

/* document.getElementById("connectLegoBBtn").addEventListener("click", async () => {
  try {
    await window.deviceManager.connectLegoInterfaceB();
  } catch (err) {
    console.error("Global connect error:", err);
  }
}); */
