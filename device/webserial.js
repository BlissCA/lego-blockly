// device/webserial.js
// ES-module version of your original LegoInterfaceB.
// Only change: exported, and `manager` is expected to provide
// updateDeviceEntry(device) and appendLog(device, message).

export class LegoInterfaceB {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.iRaw = new Array(9).fill(0);
    this.iRot = new Array(9).fill(0);
    this.firstReadDone = false;

    this.ix = [0, 14, 10, 6, 2, 16, 12, 8, 4];

    this.keepAliveTimer = null;
    this.readingActive = false;

    this.packetBuffer = [];
    this.packetCount = 0;

    this.handshakeActive = false;

    // Track last valid packet time + monitor
    this.lastPacketTime = 0;
    this.packetMonitor = null;

    // Cache of last output states
    // New Output Cache that work for both single and multiple commands.
    this.portState = {};
    for (let p = 1; p <= 8; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }

    this.status = "idle";
    this.statusMessage = "Idle";

    this.HANDSHAKE_SEND_1 = new Uint8Array([0x70, 0x00]); // "p\0"
    this.HANDSHAKE_SEND_2 = new TextEncoder().encode("###Do you byte, when I knock?$$$");
    this.HANDSHAKE_REPLY = "###Just a bit off the block!$$$";

    this.KEEP_ALIVE = new Uint8Array([0x02]);
  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  // ---------------- check if device is disconnected ----------------
  ensureAlive() {
    if (!this.port || !this.readingActive) {
      throw new Error(`Device ${this.name} is disconnected`);
    }
  }

  // ---------------- Connection + Handshake ----------------

  async connect() {
    this.setStatus("connecting", "Requesting port...");
    this.log("Requesting serial port...");

    // 1. User selects a port
    try {
      this.port = await navigator.serial.requestPort();
    } catch (err) {
      this.log("User cancelled port selection");
      throw err;  // bubble up to deviceManager
    }

    // 2. NOW allocate the name
    this.name = this.manager._allocateName();

    // 3. Open the port
    await this.port.open({
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: "none"
    });

    this.log("Port opened.");
    this.setStatus("handshaking", "Performing handshake...");

    // 4. Handshake
    try {
      await this.sendHandshake();
    } catch (err) {
      this.log("Handshake failed, cleaning up...");
      this.setStatus("error", "Handshake failed");
      await this.forceDisconnect();   // closes port + frees name
      throw err;                      // bubble up to deviceManager
    }


    this.log("Handshake complete.");
    this.setStatus("active", "Connected");
    document.dispatchEvent(new Event("serial-connected"));

    // 5. Start background tasks
    this.startKeepAlive();
    this.startContinuousReader();
    this.startPacketMonitor();
  }

  async sendHandshake() {
    this.handshakeActive = true;
    this.log("Sending handshake part 1...");
//    await this.writer.write(this.HANDSHAKE_SEND_1);
    await this.writeBytes(this.HANDSHAKE_SEND_1);
    this.log("Sending handshake phrase...");
//    await this.writer.write(this.HANDSHAKE_SEND_2);
    await this.writeBytes(this.HANDSHAKE_SEND_2);

    const reply = await this.waitForHandshakeReply();
    this.log(`Received handshake reply: ${reply}`);
    this.handshakeActive = false;
    return reply;
  }

  async waitForHandshakeReply() {
    const decoder = new TextDecoder();
    let buffer = "";

    this.handshakeActive = true;

    const readLoop = async () => {
      while (this.handshakeActive && this.port?.readable) {
        this.reader = this.port.readable.getReader();
        try {
          while (this.handshakeActive) {
            const { value, done } = await this.reader.read();
            if (done || !this.handshakeActive) break;

            if (value) {
              buffer += decoder.decode(value, { stream: true });
              if (buffer.includes(this.HANDSHAKE_REPLY)) {
                return this.HANDSHAKE_REPLY;
              }
            }
          }
        } finally {
          try { this.reader.releaseLock(); } catch {}
          this.reader = null;
        }
      }
      return null;
    };

    const timeout = new Promise(resolve =>
      setTimeout(() => resolve("TIMEOUT"), 500)
    );

    const result = await Promise.race([readLoop(), timeout]);

    // Stop the read loop
    this.handshakeActive = false;

    // Cancel reader if still active
    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    this.reader = null;

    if (result === "TIMEOUT") {
      this.log("Handshake timeout!");
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
          this.manager?.handleDeviceLost?.(this);
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
    this.lastPacketTime = performance.now();

    this.manager?.updateDeviceEntry?.(this);
    if (window.debugLogPackets) {
        this.log(`Packet #${this.packetCount}: [${Array.from(packet).join(", ")}]`);
    }
    this.lastPacket = packet;

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

  startPacketMonitor() {
    this.lastPacketTime = performance.now();
    this.packetMonitor = setInterval(() => {
      const now = performance.now();
      // No packets for 3000 ms → consider device lost
      if (now - this.lastPacketTime > 3000) {
        this.log("Packet timeout — device likely disconnected.");
        clearInterval(this.packetMonitor);
        this.packetMonitor = null;
        this.manager?.handleDeviceLost?.(this);
      }
    }, 500);
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
    }, 1900);
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

    if (this.packetMonitor) {
      clearInterval(this.packetMonitor);
      this.packetMonitor = null;
    }

    this.portState = {};
    for (let p = 1; p <= 8; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }

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

  // ---------------- force disconnect, a minimal cleanup if handshake times out ----------------
  async forceDisconnect() {
    this.stopKeepAlive();
    this.readingActive = false;

    if (this.packetMonitor) {
      clearInterval(this.packetMonitor);
      this.packetMonitor = null;
    }

    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    this.reader = null;

    try { await this.writer?.close(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;

    try { await this.port?.close(); } catch {}
    this.port = null;

    // Free the name if it was allocated
    if (this.name) {
      this.manager._freeName(this.name);
      this.name = null;
    }

    this.setStatus("disconnected", "Disconnected");
  }
  
  // ---------------- Helper Method to Update Cache for single port commands ----------------
  shouldSendSingle(port, mode, power = null) {
    const st = this.portState[port];

    if (st.mode === mode && (power === null || st.power === power)) {
      return false; // no change → skip sending
    }

    st.mode = mode;
    if (power !== null) st.power = power;

    return true;    // changed → send command
  }

  // ---------------- Helper Method to Update Cache for multiple port commands ----------------
   shouldSendMulti(mask, mode, power = null) {
    let mustSend = false;

    for (let p = 1; p <= 8; p++) {
      if (mask & (1 << (p - 1))) {
        const st = this.portState[p];

        if (st.mode !== mode || (power !== null && st.power !== power)) {
          mustSend = true;
        }
      }
    }

    // Update states
    if (mustSend) {
      for (let p = 1; p <= 8; p++) {
        if (mask & (1 << (p - 1))) {
          this.portState[p].mode = mode;
          if (power !== null) this.portState[p].power = power;
        }
      }
    }

    return mustSend;
  }

  // ---------------- Outputs Processing ----------------

  async writeBytes(bytes) {
    if (!this.port || !this.port.writable) return;

    const writer = this.port.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  async sendCmdByte(base, port) {
    const b = (base | (port & 0x07)) & 0xFF;
    await this.writeBytes(new Uint8Array([b]));
  }

  normPort(port) {
    return (port - 1) & 7;
  }

  async outOn(port) {
    this.ensureAlive();
    if (!this.shouldSendSingle(port, "on")) return;
    await this.sendCmdByte(0x28, this.normPort(port));
  }

  async outOnL(port) {
    if (!this.shouldSendSingle(port, "onL")) return;
    await this.sendCmdByte(0x10, this.normPort(port));
  }

  async outOnR(port) {
    if (!this.shouldSendSingle(port, "onR")) return;
    await this.sendCmdByte(0x18, this.normPort(port));
  }

  async outOff(port) {
    this.ensureAlive();
    if (!this.shouldSendSingle(port, "off")) return;
    await this.sendCmdByte(0x38, this.normPort(port));
  }

  async outOffAll() {
    if (!this.shouldSendMulti(0xFF, "off")) return;
    await this.writeBytes(new Uint8Array([0x90, 0xFF]));
  }

  async outFloat(port) {
    if (!this.shouldSendSingle(port, "float")) return;
    await this.sendCmdByte(0x30, this.normPort(port));
  }

  async outRev(port) {
    await this.sendCmdByte(0x20, this.normPort(port));
  }

  async outL(port) {
    if (!this.shouldSendSingle(port, "L")) return;
    await this.sendCmdByte(0x40, this.normPort(port));
  }

  async outR(port) {
    if (!this.shouldSendSingle(port, "R")) return;
    await this.sendCmdByte(0x48, this.normPort(port));
  }

  async outPow(port, power) {
    const p = power & 0x07;
    const key = `pow_${port}`;
    if (!this.shouldSendSingle(port, "pow", p)) return;
    const cmd = (0xB0 | p) & 0xFF;
    const mask = (1 << this.normPort(port)) & 0xFF;
    await this.writeBytes(new Uint8Array([cmd, mask]));
  }

  async outOnFor(port, ton) {
    const t = ton & 0xFF;
    const cmd = (0xC0 | this.normPort(port)) & 0xFF;
    await this.writeBytes(new Uint8Array([cmd, t]));
  }

  // ---------------- Multiple Ports Outputs Processing ----------------
  async multiOutOn(mask) {
    const cmd = new Uint8Array([0x91, mask]);
    if (!this.shouldSendMulti(mask, "on")) return;
    await this.writeBytes(cmd);
  }
  async multiOutOff(mask) {
    const cmd = new Uint8Array([0x90, mask]);
    if (!this.shouldSendMulti(mask, "off")) return;
    await this.writeBytes(cmd);
  }
  async multiOutFloat(mask) {
    const cmd = new Uint8Array([0x92, mask]);
    if (!this.shouldSendMulti(mask, "float")) return;
    await this.writeBytes(cmd);
  }
  async multiOutRev(mask) {
    const cmd = new Uint8Array([0x95, mask]);
    await this.writeBytes(cmd);
  }
  async multiOutL(mask) {
    const cmd = new Uint8Array([0x93, mask]);
    if (!this.shouldSendMulti(mask, "L")) return;
    await this.writeBytes(cmd);
  }
  async multiOutR(mask) {
    const cmd = new Uint8Array([0x94, mask]);
    if (!this.shouldSendMulti(mask, "R")) return;
    await this.writeBytes(cmd);
  }
async multiOutPower(level, mask) {
  const cmd = new Uint8Array([0xB0 + (level & 0x07), mask]);
  if (!this.shouldSendMulti(mask, "pow", level)) return;
  await this.writeBytes(cmd);
}


  // ---------------- Inputs ----------------

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