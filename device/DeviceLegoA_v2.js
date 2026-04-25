// device/DeviceLegoA_v2.js
// ES-module Lego Interface A v2 driver for the Arduino adapter.

export class LegoInterfaceA_v2 {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    // Inputs 6,7: state + rotation counters
    this.inputState = { 6: false, 7: false };
    this.rot = { 6: 0, 7: 0 };

    // Output cache: PWM per port 0–5
    this.portPwm = {};
    for (let p = 0; p <= 5; p++) {
      this.portPwm[p] = 0;
    }

    this.status = "idle";
    this.statusMessage = "Idle";

    this.readingActive = false;
    this.keepAliveTimer = null;

    this.packetBuffer = [];
    this.packetCount = 0;
    this.lastPacketTime = 0;
    this.packetMonitor = null;

    this.HANDSHAKE_SEND = new TextEncoder().encode(
      "###Do you byte, when I knock?$$$"
    );
    this.HANDSHAKE_REPLY = "###Just a bit off the block!$$$";

    this.KEEP_ALIVE = new Uint8Array([0x02]);
    this.FORCE_DISCONNECT_CMD = new Uint8Array([0x70]);

    this.HEADER0 = 0xA1;
    this.HEADER1 = 0xAF;
    this.PACKET_LEN = 11;

    // Command queue
    this.commandQueue = Promise.resolve();
    this.queueActive = true;
  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || "LegoA"}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  ensureAlive() {
    if (!this.port || !this.readingActive) {
      throw new Error(`Device ${this.name || "LegoA"} is disconnected`);
    }
  }

  // ---------------- Command Queueing ----------------

  enqueueCommand(fn) {
    if (!this.queueActive) {
      return Promise.resolve();
    }

    this.commandQueue = this.commandQueue
      .then(() => fn())
      .catch(err => {
        this.log("Queue command error: " + err);
      });

    return this.commandQueue;
  }

  async writeBytes(bytes) {
    return this.enqueueCommand(async () => {
      if (!this.port || !this.port.writable) return;
      const writer = this.port.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
    });
  }

  // ---------------- Connection + Handshake ----------------

  async connect() {
    this.setStatus("connecting", "Requesting port...");
    this.log("Requesting serial port...");

    try {
      this.port = await window.autoSelectPort();
    } catch (err) {
      this.log("User cancelled port selection");
      throw err;
    }

    await this.port.open({
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "none"
    });

    this.log("Port opened.");

    // Wait for Arduino to reboot and send READY
    this.log("Waiting for READY from Arduino…");
    await this.waitForLine("READY", 3000);

    this.setStatus("handshaking", "Performing handshake...");

    try {
      await this.sendHandshake();
    } catch (err) {
      this.log("Handshake failed, cleaning up...");
      this.setStatus("error", "Handshake failed");
      await this.forceDisconnect();
      throw err;
    }

    // DeviceManager allocates the name AFTER successful connection
    if (!this.name) {
      this.name = this.manager._allocateName("LegoA");
    }

    this.log("Handshake complete.");
    this.setStatus("connected", "Connected");
    document.dispatchEvent(new Event("serial-connected"));

    this.startKeepAlive();
    this.startContinuousReader();
    this.startPacketMonitor();
  }

  async sendHandshake() {
    this.log("Sending handshake phrase...");
    await this.writeBytes(this.HANDSHAKE_SEND);
    const reply = await this.waitForHandshakeReply();
    this.log(`Received handshake reply: ${reply}`);
    return reply;
  }

  async waitForHandshakeReply() {
    const decoder = new TextDecoder();
    let buffer = "";

    const readLoop = async () => {
      while (this.port?.readable) {
        this.reader = this.port.readable.getReader();
        try {
          while (true) {
            const { value, done } = await this.reader.read();
            if (done) break;
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
      setTimeout(() => resolve("TIMEOUT"), 1000)
    );

    const result = await Promise.race([readLoop(), timeout]);

    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    this.reader = null;

    if (result === "TIMEOUT") {
      this.log("Handshake timeout!");
      throw new Error("Handshake timeout");
    }

    return result;
  }

  // ---------------- Continuous Reader + Packet Parsing ----------------

  async startContinuousReader() {
    this.log("Starting status packet reader...");
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

      // Try to extract packets while we have enough data
      while (this.packetBuffer.length >= this.PACKET_LEN) {
        // Find header
        let idx = this.packetBuffer.findIndex(
          (v, i, arr) =>
            v === this.HEADER0 &&
            i + 1 < arr.length &&
            arr[i + 1] === this.HEADER1
        );

        if (idx < 0) {
          // No header found, drop everything except last byte
          this.packetBuffer = this.packetBuffer.slice(-1);
          break;
        }

        // If not enough bytes after header, wait for more
        if (this.packetBuffer.length - idx < this.PACKET_LEN) {
          // Keep bytes from header onward
          this.packetBuffer = this.packetBuffer.slice(idx);
          break;
        }

        // Extract one packet
        const raw = this.packetBuffer.slice(idx, idx + this.PACKET_LEN);
        this.packetBuffer = this.packetBuffer.slice(idx + this.PACKET_LEN);

        const packet = new Uint8Array(raw);
        if (this.verifyChecksum(packet)) {
          this.handlePacket(packet);
        } else {
          this.log("Checksum error, dropping packet");
        }
      }
    }
  }

  verifyChecksum(packet) {
    if (packet.length !== this.PACKET_LEN) return false;
    let sum = 0;
    for (let i = 0; i < this.PACKET_LEN - 1; i++) {
      sum = (sum + packet[i]) & 0xFF;
    }
    return sum === packet[this.PACKET_LEN - 1];
  }

  handlePacket(packet) {
    this.packetCount += 1;
    this.lastPacketTime = performance.now();
    this.manager?.updateDeviceEntry?.(this);

    if (window.debugLogPackets) {
      this.log(
        `Packet #${this.packetCount}: [${Array.from(packet)
          .map(b => b.toString(16).padStart(2, "0"))
          .join(" ")}]`
      );
    }

    // Bytes 2–7: outputs 0–5 PWM (we can trust Arduino, but we keep our own cache anyway)
    // Bytes 8–9: inputs 6–7 packed: bit0=state, bits1–2=rate
    // Byte 10: checksum (already verified)

    for (let i = 0; i < 2; i++) {
      const port = 6 + i;
      const b = packet[8 + i];
      const state = (b & 0x01) !== 0;
      const rate = (b >> 1) & 0x03;

      this.inputState[port] = state;
      // Interface A: one direction only → just accumulate positive counts
      this.rot[port] += rate;
    }
  }

  startPacketMonitor() {
    this.lastPacketTime = performance.now();
    this.packetMonitor = setInterval(() => {
      const now = performance.now();
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
    this.keepAliveTimer = setInterval(() => {
      this.enqueueCommand(async () => {
        if (!this.port || !this.port.writable) return;
        const w = this.port.writable.getWriter();
        try {
          await w.write(this.KEEP_ALIVE);
        } finally {
          w.releaseLock();
        }
      });
    }, 1900);
  }

  stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
      this.log("Keep-alive stopped.");
    }
  }

  // ---------------- Public API: Inputs ----------------

  inputOn(port) {
    if (port !== 6 && port !== 7) return false;
    return !!this.inputState[port];
  }

  getRot(port) {
    if (port !== 6 && port !== 7) return 0;
    return this.rot[port] | 0;
  }

  setRot(port, r = 0) {
    if (port !== 6 && port !== 7) return;
    this.rot[port] = r | 0;
  }

  // ---------------- Public API: Outputs ----------------

  async outPwm(port, pwm) {
    this.ensureAlive();
    if (port < 0 || port > 5) return;

    let v = Math.round(pwm);
    v = v & 0xFF;

    if (this.portPwm[port] === v) return; // cached, no change

    this.portPwm[port] = v;

    const cmd = (0x90 | (port & 0x0F)) & 0xFF;
    await this.writeBytes(new Uint8Array([cmd, v]));
  }

  // combo: 0→(0,1), 1→(2,3), 2→(4,5)
  // dir: 0 = right, 1 = left
  async outCombo(combo, pwm, dir) {
    this.ensureAlive();
    if (combo < 0 || combo > 2) return;

    let v = Math.round(pwm);
    v = v & 0xFF;

    const basePort = combo * 2;
    const rightPort = basePort;     // 0,2,4
    const leftPort = basePort + 1;  // 1,3,5

    if (dir === 0) {
      // right: rightPort = pwm, leftPort = 0
      await this.outPwm(rightPort, v);
      await this.outPwm(leftPort, 0);
    } else {
      // left: leftPort = pwm, rightPort = 0
      await this.outPwm(rightPort, 0);
      await this.outPwm(leftPort, v);
    }
  }

  // ---------------- Disconnect ----------------

  async disconnect() {
    this.queueActive = false;
    this.log("Disconnecting...");
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
        // Optionally tell Arduino to disconnect
        try {
          await this.writeBytes(this.FORCE_DISCONNECT_CMD);
        } catch {}
        await this.port.close();
        this.log("Port closed.");
      }
    } catch (err) {
      this.log(`Port close error: ${err.message || err}`);
    }

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.port = null;
    this.setStatus("disconnected", "Disconnected");
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
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

    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    this.reader = null;

    try { await this.writer?.close(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null;

    try { await this.port?.close(); } catch {}
    this.port = null;

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.setStatus("disconnected", "Disconnected");
  }
}
