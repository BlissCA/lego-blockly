// ------------------------------------------------------------
// device/DeviceLegoPFIR.js
// LEGO Power Functions IR using FTDI DTR pin.
// Compatible with LEGO PF IR Receiver v1/v2.
// Supports: Single Output Mode + Combo PWM Mode.
// ------------------------------------------------------------

export class LegoPFIR {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.status = "idle";

    // PF IR timing constants (microseconds)
    this.CARRIER_PERIOD_US = 26;     // 38 kHz → ~26 µs high, 26 µs low
    this.BIT0_US = 600;              // logical 0 burst
    this.BIT1_US = 1300;             // logical 1 burst
    this.BIT_GAP_US = 600;           // silence after each bit
    this.FRAME_REPEAT = 5;           // LEGO requires 5 repeats

    // Queue
    this.queue = Promise.resolve();
    this.queueActive = true;
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
    while (performance.now() < target) { /* busy wait */ }
  }

  async pulse(on, us) {
    await this.port.setSignals({ dataTerminalReady: on });
    await this.sleepUs(us);
  }

  // ------------------------------------------------------------
  // 38 kHz CARRIER BURST
  // ------------------------------------------------------------
  async carrierBurst(us) {
    const period = this.CARRIER_PERIOD_US;
    const end = performance.now() + us / 1000;

    while (performance.now() < end) {
      await this.port.setSignals({ dataTerminalReady: true });
      await this.sleepUs(period);
      await this.port.setSignals({ dataTerminalReady: false });
      await this.sleepUs(period);
    }
  }

  // ------------------------------------------------------------
  // PF BIT ENCODING
  // ------------------------------------------------------------
  async sendBit0() {
    await this.carrierBurst(this.BIT0_US);
    await this.sleepUs(this.BIT_GAP_US);
  }

  async sendBit1() {
    await this.carrierBurst(this.BIT1_US);
    await this.sleepUs(this.BIT_GAP_US);
  }

  // ------------------------------------------------------------
  // PF FRAME BUILDER
  // ------------------------------------------------------------
  async sendPFFrame(channel, mode, data) {
    // LEGO PF frame:
    // [Start=1][Toggle][Channel][Mode][Data][Checksum]

    const toggle = (this._toggleBit = !this._toggleBit) ? 1 : 0;

    const nibble = (toggle << 3) | (channel & 0x03);
    const checksum = 0xF ^ nibble ^ mode ^ data;

    const frame = [
      1,                // Start bit
      (nibble >> 3) & 1,
      (nibble >> 2) & 1,
      (nibble >> 1) & 1,
      (nibble >> 0) & 1,
      (mode >> 1) & 1,
      (mode >> 0) & 1,
      (data >> 3) & 1,
      (data >> 2) & 1,
      (data >> 1) & 1,
      (data >> 0) & 1,
      (checksum >> 3) & 1,
      (checksum >> 2) & 1,
      (checksum >> 1) & 1,
      (checksum >> 0) & 1
    ];

    for (let r = 0; r < this.FRAME_REPEAT; r++) {
      for (const bit of frame) {
        bit ? await this.sendBit1() : await this.sendBit0();
      }
      await this.sleepUs(5000); // Inter-frame gap
    }
  }

  // ------------------------------------------------------------
  // PUBLIC API: SINGLE OUTPUT MODE
  // ------------------------------------------------------------
  motorPower(channel, output, power) {
    return this.enqueue(async () => {
      const mode = 0b01; // Single Output Mode

      const out = (output === "A" || output === 0) ? 0 : 1;

      // Power: -7..+7 → PF encoding 0..15
      let p = Math.max(-7, Math.min(7, power));
      const data = (out << 4) | (p & 0x0F);

      await this.sendPFFrame(channel, mode, data);
    });
  }

  // ------------------------------------------------------------
  // PUBLIC API: COMBO PWM MODE
  // ------------------------------------------------------------
  comboPWM(channel, powerA, powerB) {
    return this.enqueue(async () => {
      const mode = 0b10; // Combo PWM Mode

      let a = Math.max(-7, Math.min(7, powerA));
      let b = Math.max(-7, Math.min(7, powerB));

      const data = ((a & 0x0F) << 4) | (b & 0x0F);

      await this.sendPFFrame(channel, mode, data);
    });
  }

  // ------------------------------------------------------------
  // STOP ALL
  // ------------------------------------------------------------
  stopAll() {
    return this.enqueue(async () => {
      for (let ch = 0; ch < 4; ch++) {
        await this.sendPFFrame(ch, 0b01, 0x00);
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
