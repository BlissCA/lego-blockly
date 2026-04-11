// device/DeviceLegoWeDo1.js
// LEGO WeDo 1.0 Hub (WebHID)
// HID Input:  [type, value]
// HID Output: [command, value]
// Sensors: tilt, distance, rotation, button
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

    // Sensor state
    this.tilt = 0;
    this.distance = 0;
    this.rotation = 0;
    this.button = 0;

    // Last raw HID packet (optional)
    this.lastPacket = [0, 0];
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

      // User must select the device
      const devices = await navigator.hid.requestDevice({
        filters: [{ vendorId: 0x0694, productId: 0x0003 }]
      });

      if (!devices || devices.length === 0) {
        throw new Error("No WeDo 1.0 device selected");
      }

      this.device = devices[0];

      await this.device.open();

      this._log("HID device opened.");

      // Listen for sensor updates
      this.device.addEventListener("inputreport", e => {
        const data = new Uint8Array(e.data.buffer);
        const type = data[0];
        const value = data[1];

        this.lastPacket = [type, value];

        switch (type) {
          case 0x00: this.tilt = value; break;
          case 0x01: this.distance = value; break;
          case 0x02: this.rotation = value; break;
          case 0x03: this.button = value; break;
        }
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

  // ------------------------------------------------------------
  // MOTOR COMMANDS (queued)
  // ------------------------------------------------------------

  // speed: 0–127
  async motor(speed) {
    return this.enqueue(async () => {
      const s = Math.max(0, Math.min(127, speed));
      await this._sendHID([0x01, s]);
    });
  }

  async motorOn() {
    return this.motor(100);
  }

  async motorOff() {
    return this.motor(0);
  }

  async stopMotor() {
    return this.motor(0);
  }

  // ------------------------------------------------------------
  // SENSOR READ (queued)
  // ------------------------------------------------------------
  async readSensor() {
    return this.enqueue(async () => ({
      tilt: this.tilt,
      distance: this.distance,
      rotation: this.rotation,
      button: this.button,
      raw: this.lastPacket
    }));
  }

  // ------------------------------------------------------------
  // INTERNAL HID SEND
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
