// device/DeviceLegoToyPad.js
// LEGO Dimensions ToyPad (USB HID)
// Wii / PS3 / PS4 / PC versions supported
// Vendor: 0x0E6F, Product: 0x0241 (Wii)
// HID OUT: reportId = 0x55 (commands)
// HID IN : reportId = 0x56 (events: tag placed/removed, region, UID, etc.)

export class LegoToyPad {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.device = null;
    this.status = "idle";

    // Command queue (same pattern as WeDo1 / Interface A)
    this.queue = Promise.resolve();
    this.queueActive = true;

    // Last known tags per region
    this.regions = {
      0: null, // all
      1: null, // center
      2: null,  // left
      3: null  // right
    };

    // Event callback (Blockly will hook into this)
    this.onTagEvent = null;

    // LED cache
    this.ledState = {
      0: { r: 0, g: 0, b: 0 },
      1: { r: 0, g: 0, b: 0 },
      2: { r: 0, g: 0, b: 0 }
    };
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
      this._log("Requesting LEGO ToyPad HID device…");

      const devices = await navigator.hid.requestDevice({
        filters: [{
          vendorId: 0x0E6F,
          productId: 0x0241
        }]
      });

      if (!devices || devices.length === 0) {
        throw new Error("No ToyPad selected");
      }

      this.device = devices[0];
      await this.device.open();
      this._log("ToyPad opened.");

      await new Promise(r => setTimeout(r, 500));

      // Wake/init sequence (mandatory)
      await this._sendWake();

      // Listen for input reports (tag events)
      this.device.addEventListener("inputreport", e => {
        if (e.reportId !== 0x00) return;
        this._handleInput(new Uint8Array(e.data.buffer));
      });

      // Allocate name
      if (!this.name) {
        this.name = this.manager._allocateName("Pad");
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
  // WAKE SEQUENCE
  // ------------------------------------------------------------
  async _sendWake() {
    const WAKE = new Uint8Array([
      0x55, 0x0F, 0xB0, 0x01,
      0x28, 0x63, 0x29, 0x20,
      0x4C, 0x45, 0x47, 0x4F,
      0x20, 0x32, 0x30, 0x31,
      0x34, 0xF7, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00
    ]);

    for (let i = 0; i < 5; i++) {
      try {
        await this.device.sendReport(0, WAKE);
        this._log("Wake OK");
        return;
      } catch (e) {
        this._log("Wake failed, retrying…");
        await new Promise(r => setTimeout(r, 100));
      }
    }

    throw new Error("ToyPad did not accept wake sequence");
  }
  // ------------------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------------------
  async disconnect() {
    this._log("Disconnecting ToyPad…");

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
  // INPUT HANDLER (tag events)
  // ------------------------------------------------------------
  _handleInput(data) {
    // Format (from node-toypad):
    // 56 LL TT RR UU UU UU UU ...
    // TT = event type
    // RR = region (0=center,1=left,2=right)
    // UU.. = UID or tag data

    const type = data[2];
    const region = data[3];

    console.log(`ToyPad data=${[...data].map(b => b.toString(16).padStart(2, "0")).join(" ")}`);

    if (type === 0x00) {
      // Tag removed
      this.regions[region] = null;
      this._emitTagEvent(region, null);
    }

    if (type === 0x01) {
      // Tag placed
      const uid = data.slice(4, 11); // 7-byte UID
      this.regions[region] = uid;
      this._emitTagEvent(region, uid);
    }
  }

  _emitTagEvent(region, uid) {
    if (this.onTagEvent) {
      this.onTagEvent({
        region,
        uid,
        uidHex: uid ? [...uid].map(b => b.toString(16).padStart(2, "0")).join("") : null
      });
    }
  }

  // ------------------------------------------------------------
  // LED CONTROL
  // ------------------------------------------------------------
  async setLED(region, r, g, b) {
    return this.enqueue(async () => {
      if (!this.device || !this.device.opened) return;

      this.ledState[region] = { r, g, b };

      const payload = [
        0x55,       // header
        0x06,       // length (C0, 02, pad, r, g, b, checksum) → 6 bytes after this
        0xC0, 0x02, // LED command
        region & 0xFF,
        r & 0xFF,
        g & 0xFF,
        b & 0xFF
        // checksum will be appended by helper
      ];

      const msg = this._calcChecksumAndPad(payload);
      await this.device.sendReport(0, msg);
    });
  }

  async setAllLED(r, g, b) {
    await this.setLED(0, r, g, b);
  }

  // ------------------------------------------------------------
  // TAG READ / WRITE (NTAG213)
  // ------------------------------------------------------------
  async readTag(region) {
    return this.enqueue(async () => {
      if (!this.regions[region]) return null;

      // ToyPad automatically sends tag data in input reports.
      // For now, return UID only.
      return {
        uid: this.regions[region],
        uidHex: [...this.regions[region]].map(b => b.toString(16).padStart(2, "0")).join("")
      };
    });
  }

  async writeTag(region, page, bytes) {
    return this.enqueue(async () => {
      if (!this.device || !this.device.opened) return;

      // Write command (from node-toypad)
      // 55 0F D0 04 <region> <page> <4 bytes> 00 00 00
      const cmd = new Uint8Array([
        0x55, 0x0F, 0xD0, 0x04,
        region & 0xFF,
        page & 0xFF,
        bytes[0], bytes[1], bytes[2], bytes[3],
        0, 0, 0
      ]);

      await this.device.sendReport(0x55, cmd);
    });
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
    console.log(`[LegoToyPad] ${msg}`);
  }

  // ------------------------------------------------------------
  // CHECKSUM & PADDING (for commands)
  // ------------------------------------------------------------
  _calcChecksumAndPad(payload) {
    // payload: array of bytes WITHOUT checksum
    let checksum = 0;
    for (let i = 0; i < payload.length; i++) {
      checksum += payload[i];
      if (checksum >= 256) checksum -= 256;
    }

    const msg = [...payload, checksum];
    while (msg.length < 32) msg.push(0x00);

    return new Uint8Array(msg);
  }

}
