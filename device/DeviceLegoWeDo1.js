// device/DeviceLegoWeDo1.js
// LEGO WeDo 1.0 Hub (WebHID, late firmware, 8‑byte packets)
// HID Input:  reportId = 0 → [flag, status, dataA, typeA, dataB, typeB, 0, 0]
// HID Output: reportId = 0 → [64, motorA, motorB, 0, 0, 0, 0, 0]
// Sensors: tilt + distance (per port 1/2), no button, no rotation
// Commands are queued (Blockly-compatible)

export class LegoWeDo1 {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.device = null;
    this.status = "idle";

    // Queue (same pattern as Interface A)
    this.queue = Promise.resolve();
    this.queueActive = true;

    // Raw sensor state per port
    this.rawTilt1 = 0;
    this.rawTilt2 = 0;
    this.rawDistance1 = 0;
    this.rawDistance2 = 0;

    // Last commanded motor speeds (-100..100)
    this.lastMotorA = 0;
    this.lastMotorB = 0;

    // Last raw HID packet (8 bytes)
    this.lastPacket = new Uint8Array(8);

    // Cache of last output states
    // New Output Cache that work for both single and multiple commands.
    this.portState = {};
    for (let p = 0; p <= 1; p++) {
      this.portState[p] = { mode: "?", power: -1 };
    }

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
      this._log("Requesting LEGO WeDo 1.0 HID device…");

      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: 0x0694, productId: 0x0003 }]
      });

      if (!devices || devices.length === 0) {
        throw new Error("No WeDo 1.0 device selected");
      }

      this.device = devices[0];

      await this.device.open();
      this._log("HID device opened.");

      // Enable receiving input reports (if supported)
      if (this.device.receiveReports) {
        await this.device.receiveReports(true);
      }

      // Listen for sensor updates (8‑byte packets on reportId 0)
      this.device.addEventListener("inputreport", e => {
        if (e.reportId !== 0) return;

        const d = new Uint8Array(e.data.buffer);
        this.lastPacket = d;

        // Packet format:
        // [flag, status, dataA, typeA, dataB, typeB, 0, 0]
        const dataA = d[2];
        const typeA = d[3];
        const dataB = d[4];
        const typeB = d[5];

        // Port 1 (A)
        if (LegoWeDo1.TILT_TYPES.includes(typeA)) this.rawTilt1 = dataA;
        if (LegoWeDo1.DIST_TYPES.includes(typeA)) this.rawDistance1 = dataA;

        // Port 2 (B)
        if (LegoWeDo1.TILT_TYPES.includes(typeB)) this.rawTilt2 = dataB;
        if (LegoWeDo1.DIST_TYPES.includes(typeB)) this.rawDistance2 = dataB;
      });

      // Allocate name after successful connection
      if (!this.name) {
        this.name = this.manager._allocateName("WD1_");
      }

      this.status = "Connected";
      this._log("Connected.");

      return true;

    } catch (err) {
      this._log("Error during connect: " + err);
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
    this._log("Disconnecting LEGO WeDo 1.0…");

    try {
      await this.stopMotor();
    } catch (e) {
      this._log("Error while stopping motor: " + e);
    }

    this.queueActive = false;

    await this._safeClose();

    this.status = "Disconnected";

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this._log("Disconnected.");
  }

  // ---------------- Helper Method to Update Cache for multiple port commands ----------------
  shouldSendMulti(mask, mode, power = null) {
    let mustSend = false;

    for (let p = 0; p <= 1; p++) {
      if (mask & (1 << p)) {
        const st = this.portState[p];

        if (st.mode !== mode || (power !== null && st.power !== power)) {
          mustSend = true;
        }
      }
    }

    // Update states
    if (mustSend) {
      for (let p = 0; p <= 1; p++) {
        if (mask & (1 << p)) {
          this.portState[p].mode = mode;
          if (power !== null) this.portState[p].power = power;
        }
      }
    }

    return mustSend;
  }
  // ------------------------------------------------------------
  // MOTOR COMMANDS (queued) — numeric ports, Python conversion
  // ------------------------------------------------------------
  // ports: 1 = A, 2 = B, 3 = A+B (bitmask)
  // speed: -100..100 (percent)
  _convertSpeed(v) {
    if (v > 0) return v + 27;     // 28..127
    if (v < 0) return v - 27;     // -28..-127
    return 0;
  }

  async motor(ports, speed) {
    return this.enqueue(async () => {
      if (!this.device || !this.device.opened) {
        this._log("Cannot send motor command: device not open.");
        return;
      }

      // Clamp speed
      let s = Math.max(-100, Math.min(100, speed));

      // Update stored last speeds
      if (ports & 1) this.lastMotorA = s;
      if (ports & 2) this.lastMotorB = s;

      // Convert to HID values
      //let A = (ports & 1) ? this._convertSpeed(this.lastMotorA) : 0;
      //let B = (ports & 2) ? this._convertSpeed(this.lastMotorB) : 0;
      let A = this._convertSpeed(this.lastMotorA);
      let B = this._convertSpeed(this.lastMotorB);

      // Build 8‑byte HID packet
      const data = new Uint8Array([
        64,   // command frame marker
        A & 0xFF,
        B & 0xFF,
        0, 0, 0, 0, 0
      ]);

      await this.device.sendReport(0, data);
    });
  }

  async stopMotor() {
    // 3 = 1|2 = A+B
    return this.motor(3, 0);
  }

  getMotor(port) {
    if (port === 1) return this.lastMotorA;
    if (port === 2) return this.lastMotorB;
    return 0;
  }

  // ------------------------------------------------------------
  // SENSOR READ (queued) — returns snapshot + raw packet
  // ------------------------------------------------------------
  async readSensor() {
    return this.enqueue(async () => ({
      tilt1: this.getTilt(1),
      tilt2: this.getTilt(2),
      distance1: this.getDistance(1),
      distance2: this.getDistance(2),
      rawTilt1: this.rawTilt1,
      rawTilt2: this.rawTilt2,
      rawDistance1: this.rawDistance1,
      rawDistance2: this.rawDistance2,
      rawPacket: this.lastPacket
    }));
  }

  // ------------------------------------------------------------
  // TILT INTERPRETATION
  // ------------------------------------------------------------
  // 0 = FLAT
  // 1 = TILT_FORWARD
  // 2 = TILT_LEFT
  // 3 = TILT_RIGHT
  // 4 = TILT_BACK

  static TILT_TYPES = [38, 39, 40];
  static DIST_TYPES = [176, 177, 178, 179, 180];

  _interpretTilt(raw) {
    if (raw >= 10 && raw <= 40) return 4;   // BACK
    if (raw >= 60 && raw <= 90) return 3;   // RIGHT
    if (raw >= 170 && raw <= 190) return 1; // FORWARD
    if (raw >= 220 && raw <= 240) return 2; // LEFT
    return 0;                               // FLAT
  }

  getTiltRaw(port) {
    return (port === 1) ? this.rawTilt1 : this.rawTilt2;
  }

  getTilt(port) {
    return this._interpretTilt(this.getTiltRaw(port));
  }

  // ------------------------------------------------------------
  // DISTANCE INTERPRETATION (Python interpolation, cm)
  // ------------------------------------------------------------
  static RAW_MEASURES = {
    210: 46,
    208: 39,
    207: 34,
    206: 32,
    205: 30.5,
    204: 29,
    203: 27,
    202: 26,
    201: 25,
    200: 24.5,
    199: 23.5,
    198: 22.5,
    197: 22,
    196: 21.5,
    195: 20,
    194: 19.5,
    193: 18,
    192: 17.5,
    191: 17,
    180: 15,
    170: 13,
    160: 12.5,
    150: 11,
    140: 10.5,
    130: 10,
    120: 9.5,
    100: 7.5,
    71: 6.5,
    70: 6,
    69: 5.3,
    68: 0
  };

  static RAW_KEYS = Object.keys(LegoWeDo1.RAW_MEASURES)
    .map(k => parseInt(k))
    .sort((a, b) => a - b);

  _interpolateDistance(raw) {
    const keys = LegoWeDo1.RAW_KEYS;

    let leftIndex = keys.findIndex(k => k >= raw) - 1;
    if (leftIndex < 0) leftIndex = 0;

    let rightIndex = (leftIndex === keys.length - 1) ? leftIndex : leftIndex + 1;

    const left = keys[leftIndex];
    const right = keys[rightIndex];

    const mLeft = LegoWeDo1.RAW_MEASURES[left];
    const mRight = LegoWeDo1.RAW_MEASURES[right];

    if (left > raw) return mLeft;
    if (mLeft === mRight) return mLeft;

    const ratio = (raw - left) / (right - left);
    return mLeft + ratio * (mRight - mLeft);
  }

  getDistanceRaw(port) {
    return (port === 1) ? this.rawDistance1 : this.rawDistance2;
  }

  getDistance(port) {
    return this._interpolateDistance(this.getDistanceRaw(port));
  }

  // ------------------------------------------------------------
  // INTERNAL HID SEND (kept for compatibility, not used by motor)
  // ------------------------------------------------------------
  async _sendHID(arr) {
    if (!this.device || !this.device.opened) {
      this._log("Cannot send HID report: device not open.");
      return;
    }

    const data = new Uint8Array(arr);
    await this.device.sendReport(0x00, data);
  }

  // ------------------------------------------------------------
  // SAFE CLOSE
  // ------------------------------------------------------------
  async _safeClose() {
    try {
      if (this.device && this.device.opened) {
        try { await this.device.close(); } catch (_) {}
      }
      this.device = null;
      await new Promise(r => setTimeout(r, 30));
    } catch (e) {
      this._log("Error while closing device: " + e);
    }
  }

  // ------------------------------------------------------------
  // LOGGING
  // ------------------------------------------------------------
  _log(msg) {
    console.log(`[LegoWeDo1] ${msg}`);
  }
}
