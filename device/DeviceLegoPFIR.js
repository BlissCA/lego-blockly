// ------------------------------------------------------------
// device/DeviceLegoPFIR.js
// LEGO Power Functions IR using FTDI DTR pin.
// Based on Arduino PF IR protocol implementation.
// Supports: Single Output Mode + Combo (via two single outputs).
// ------------------------------------------------------------

export class LegoPFIR {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.status = "idle";

    // PF IR timing (Arduino-accurate)
    this.T_US = 158;                    // base time unit
    this.PREAMBLE_US = 16 * this.T_US;  // preamble carrier
    this.FRAME_GAP_US = 39 * this.T_US; // inter-frame gap
    this.FRAME_REPEAT = 5;              // repeat count

    // Carrier timing (~38 kHz): 13 µs high, 13 µs low
    this.CARRIER_HALF_US = 13;

    // Queue
    this.queue = Promise.resolve();
    this.queueActive = true;

    this._toggleBit = false;
  }

  // ------------------------------------------------------------
  // QUEUE
  // ------------------------------------------------------------
  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }

  // ------------------------------------------------------------
  // CONNECT
  // ------------------------------------------------------------
  async connect() {
    try {
      this._logStatus("Requesting serial port for LEGO PF IR…");

      try {
        this.port = await window.autoSelectPort();
      } catch (err) {
        this._logStatus("User cancelled port selection");
        throw err;
      }

      await this.port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none"
      });

      await this.port.setSignals({ dataTerminalReady: false });

      this._logStatus("Serial port opened.");

      if (!this.name) {
        this.name = this.manager._allocateName("PFIR");
      }
      this.status = "Connected";

      return true;

    } catch (err) {
      this._logStatus("Error during connect: " + err);
      await this._safeClose();

      if (this.name) {
        this.manager._removeDevice(this);
        this.name = null;
      }

      throw err;
    }
  }

  // ------------------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------------------
  async disconnect() {
    this._logStatus("Disconnecting PF IR...");

    this.queueActive = false;
    await this._safeClose();

    this.status = "Disconnected";

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this._logStatus("Disconnected.");
  }

  // ------------------------------------------------------------
  // PRECISE TIMING HELPERS
  // ------------------------------------------------------------
  async sleepUs(us) {
    const start = performance.now();
    const target = start + us / 1000;
    while (performance.now() < target) {
      // busy wait
    }
  }

  async carrierBurst(us) {
    const half = this.CARRIER_HALF_US;
    const end = performance.now() + us / 1000;

    while (performance.now() < end) {
      await this.port.setSignals({ dataTerminalReady: true });
      await this.sleepUs(half);

      await this.port.setSignals({ dataTerminalReady: false });
      await this.sleepUs(half);
    }
  }

  // ------------------------------------------------------------
  // BIT ENCODING (Arduino-accurate)
  // ------------------------------------------------------------
  async sendBit0() {
    // 0-bit: T high + T low
    await this.carrierBurst(this.T_US);
    await this.sleepUs(this.T_US);
  }

  async sendBit1() {
    // 1-bit: T high + 3T low
    await this.carrierBurst(this.T_US);
    await this.sleepUs(3 * this.T_US);
  }

  async sendStartStop() {
    // Start/stop bits are 0-bits
    await this.sendBit0();
  }

  // ------------------------------------------------------------
  // FRAME BUILDER (Arduino-accurate)
  // ------------------------------------------------------------
  async sendPFFrame(channel, mode, data) {
    const toggle = (this._toggleBit = !this._toggleBit) ? 1 : 0;

    const nibble0 = (toggle << 3) | (channel & 0x03);
    const nibble1 = mode & 0x0F;
    const nibble2 = data & 0x0F;
    const nibble3 = 0x0F ^ nibble0 ^ nibble1 ^ nibble2;

    const frame =
      (nibble3 << 12) |
      (nibble2 << 8) |
      (nibble1 << 4) |
      nibble0;

    for (let r = 0; r < this.FRAME_REPEAT; r++) {
      // Preamble: 16T carrier
      await this.carrierBurst(this.PREAMBLE_US);

      // Start bit
      await this.sendStartStop();

      // 16 bits LSB-first
      for (let i = 0; i < 16; i++) {
        const bit = (frame >> i) & 1;
        bit ? await this.sendBit1() : await this.sendBit0();
      }

      // Stop bit
      await this.sendStartStop();

      // Inter-frame gap
      await this.sleepUs(this.FRAME_GAP_US);
    }
  }

  // ------------------------------------------------------------
  // POWER MAPPING (Arduino-accurate)
  // ------------------------------------------------------------
  mapPowerToPF(p) {
    // p: -7..7, 0 = float
    if (p === 0) return 0;        // float
    if (p > 0) return p;          // 1..7 forward
    return 16 + p;                // -1..-7 → 15..9
  }

  // ------------------------------------------------------------
  // PUBLIC API: SINGLE OUTPUT MODE
  // ------------------------------------------------------------
  motorPower(channel, output, power) {
    return this.enqueue(async () => {
      // Mode nibble for single output:
      // 0x4 = single output, red (A)
      // 0x5 = single output, blue (B)
      const mode = (output === "A" || output === 0) ? 0x4 : 0x5;

      const p = Math.max(-7, Math.min(7, power));
      const pfPower = this.mapPowerToPF(p);

      await this.sendPFFrame(channel, mode, pfPower);
    });
  }

  // ------------------------------------------------------------
  // PUBLIC API: COMBO PWM MODE (emulated via two single outputs)
  // ------------------------------------------------------------
  comboPWM(channel, powerA, powerB) {
    return this.enqueue(async () => {
      await this.motorPower(channel, "A", powerA);
      await this.motorPower(channel, "B", powerB);
    });
  }

  // ------------------------------------------------------------
  // STOP ALL
  // ------------------------------------------------------------
  stopAll() {
    return this.enqueue(async () => {
      for (let ch = 0; ch < 4; ch++) {
        await this.motorPower(ch, "A", 0);
        await this.motorPower(ch, "B", 0);
      }
    });
  }

  // ------------------------------------------------------------
  // SAFE CLOSE
  // ------------------------------------------------------------
  async _safeClose() {
    try {
      if (this.reader) {
        try { await this.reader.cancel(); } catch (_) {}
        try { this.reader.releaseLock(); } catch (_) {}
        this.reader = null;
      }

      if (this.writer) {
        try { await this.writer.close(); } catch (_) {}
        try { this.writer.releaseLock(); } catch (_) {}
        this.writer = null;
      }

      if (this.port) {
        try { await this.port.close(); } catch (_) {}
        this.port = null;
      }

      await new Promise(r => setTimeout(r, 30));

    } catch (e) {
      this._logStatus("Error while closing port: " + e);
    }
  }

  // ------------------------------------------------------------
  // LOGGING
  // ------------------------------------------------------------
  _logStatus(msg) {
    console.log(`[PF IR] ${msg}`);
  }
}
