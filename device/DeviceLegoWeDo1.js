// device/DeviceLegoWeDo1.js
// LEGO WeDo 1.0 USB Hub (Vendor 0x0694, Product 0x0003)
// WebUSB implementation
// Asynchronous queued commands (like Interface A)

export class LegoWeDo1 {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.device = null;
    this.interfaceNumber = 0;
    this.endpointOut = 1;
    this.endpointIn = 1;

    this.status = "idle";

    // Queue (same pattern as Interface A)
    this.queue = Promise.resolve();
    this.queueActive = true;

    this._decoder = new TextDecoder();
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
      this._logStatus("Requesting LEGO WeDo 1.0 device…");

      // User selects the USB device
      this.device = await navigator.usb.requestDevice({
        filters: [{ vendorId: 0x0694, productId: 0x0003 }]
      });

      await this.device.open();

      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      await this.device.claimInterface(0);

      this._logStatus("WeDo 1.0 USB interface claimed.");

      // Allocate name only after successful connection
      if (!this.name) {
        this.name = this.manager._allocateName("WD1_");
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
    this._logStatus("Disconnecting LEGO WeDo 1.0…");

    try {
      // Stop motors before closing
      await this.stopAll();
    } catch (e) {
      this._logStatus("Error while stopping motors: " + e);
    }

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
  // COMMANDS (queued)
  // ------------------------------------------------------------

  // Motor: 0x01 = motor command, second byte = speed (0–127)
  async motor(speed) {
    return this.enqueue(async () => {
      const s = Math.max(0, Math.min(127, speed));
      await this._sendBytes([0x01, s]);
    });
  }

  async motorOn() {
    return this.motor(100);
  }

  async motorOff() {
    return this.motor(0);
  }

  async stopAll() {
    return this.enqueue(async () => {
      await this._sendBytes([0x01, 0]);
    });
  }

  // ------------------------------------------------------------
  // SENSORS (queued)
  // ------------------------------------------------------------

  async readSensor() {
    return this.enqueue(async () => {
      const result = await this.device.transferIn(this.endpointIn, 2);
      if (!result || !result.data) return 0;

      return result.data.getUint8(0);
    });
  }

  // ------------------------------------------------------------
  // INTERNAL SEND
  // ------------------------------------------------------------
  async _sendBytes(arr) {
    if (!this.device) {
      this._logStatus("Device not available, cannot send.");
      return;
    }

    const data = new Uint8Array(arr);
    await this.device.transferOut(this.endpointOut, data);
  }

  // ------------------------------------------------------------
  // SAFE CLOSE
  // ------------------------------------------------------------
  async _safeClose() {
    try {
      if (this.device) {
        try { await this.device.close(); } catch (_) {}
        this.device = null;
      }
      await new Promise(r => setTimeout(r, 30));
    } catch (e) {
      this._logStatus("Error while closing device: " + e);
    }
  }

  // ------------------------------------------------------------
  // LOGGING
  // ------------------------------------------------------------
  _logStatus(msg) {
    console.log(`[LegoWeDo1] ${msg}`);
  }
}
