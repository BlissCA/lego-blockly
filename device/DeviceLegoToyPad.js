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
      1: { effect: null, r:0, g:0, b:0, params:{} },
      2: { effect: null, r:0, g:0, b:0, params:{} },
      3: { effect: null, r:0, g:0, b:0, params:{} }
    };

    this.msgCounter = 0;      // 0–255, wraps

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

      navigator.hid.addEventListener("disconnect", e => {
        if (e.device === this.device) {
          this._log("ToyPad physically disconnected.");
          this.disconnect();   // your own cleanup
        }
      });

      await new Promise(r => setTimeout(r, 500));

      // Wake/init sequence (mandatory)
      await this._sendWake();

      // Listen for input reports (tag events)
      this.device.addEventListener("inputreport", e => {
        try {
          if (e.reportId !== 0) return;
          const data = new Uint8Array(e.data.buffer);
          this._handleInput(data);
        } catch (err) {
          this._log("ToyPad input error (likely disconnected): " + err);
          this.disconnect();
        }
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

    console.log(
      "ToyPad RAW IN:",
      [...data].map(b => b.toString(16).padStart(2, "0")).join(" ")
    );

    // Expect: 56 LL RR 00 RR ACTION UID[7] CHECKSUM ...
    if (data[0] !== 0x56) {
      //console.log("ToyPad: non-event packet", [...data].map(b => b.toString(16).padStart(2, "0")).join(" "));
      return;
    }

    const len     = data[1];
    const region  = data[2];   // 1=center, 2=left, 3=right
    const action  = data[5];   // 0 = inserted, 1 = removed

    if (action === 1) {
      // Tag removed
      this.regions[region] = null;
      this._emitTagEvent(region, null);
      return;
    }

    if (action === 0) {
      // Tag inserted
      const uid = data.slice(6, 13); // 7 bytes
      this.regions[region] = uid;
      this._emitTagEvent(region, uid);
      return;
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
  async _sendCommand(command, region, newState, payloadBytes, { skipCache = false } = {}) {
    return this.enqueue(async () => {
      if (!this.device || !this.device.opened) return;

      // --- SEMANTIC CACHE CHECK ---
      if (!skipCache) {
        if (region === 0) {
          // If ANY region differs, we must send
          const same =
            ["1","2","3"].every(r => {
              const old = this.ledState[r];
              return old &&
                old.effect === newState.effect &&
                old.r === newState.r &&
                old.g === newState.g &&
                old.b === newState.b &&
                JSON.stringify(old.params) === JSON.stringify(newState.params);
            });

          if (same) return;
        } else {
          const old = this.ledState[region];
          if (old &&
              old.effect === newState.effect &&
              old.r === newState.r &&
              old.g === newState.g &&
              old.b === newState.b &&
              JSON.stringify(old.params) === JSON.stringify(newState.params)) {
            return;
          }
        }
      }

      // --- BUILD PACKET ---
      const len = payloadBytes.length + 2;
      const payload = [
        0x55,
        len,
        command,
        this.msgCounter,
        ...payloadBytes
      ];

      const msg = this._calcChecksumAndPad(payload);

      // --- UPDATE SEMANTIC CACHE ---
      if (region === 0) {
        this.ledState[1] = newState;
        this.ledState[2] = newState;
        this.ledState[3] = newState;
      } else {
        this.ledState[region] = newState;
      }

      this.msgCounter = (this.msgCounter + 1) & 0xFF;

      await this.device.sendReport(0, msg);
    });
  }

  async setLED(region, r, g, b) {
    const newState = {
      effect: "solid",
      r, g, b,
      params: {}
    };

    return this._sendCommand(
      0xC0, // SWITCH_PAD
      region,
      newState,
      [
        region,
        r, g, b
      ]
    );
  }

  async setAllLED(r, g, b) {
    await this.setLED(0, r, g, b);
  }

  async flashLED(region, r, g, b, t1, t2, pulseCount) {
    const newState = {
      effect: "flash",
      r, g, b,
      params: { t1, t2, pulseCount }
    };

    // Flash is persistent ONLY when pulseCount = 0 or 255
    const isPersistent =
      pulseCount === 0 || pulseCount === 255;

    return this._sendCommand(
      0xC3, // FLASH_PAD
      region,
      newState,
      [
        region,
        t1, t2, pulseCount,
        r, g, b
      ],
      {skipCache: !isPersistent} // skip only for transient flashes
    );
  }

  async fadeLED(region, r, g, b, t1, pulseCount) {
    const newState = {
      effect: "fade",
      r, g, b,
      params: { t1, pulseCount }
    };

    // Fade is persistent ONLY when pulseCount = 0 or 255
    const isPersistent =
      pulseCount === 0 || pulseCount === 255;

    return this._sendCommand(
      0xC2, // FADE_PAD
      region,
      newState,
      [
        region,
        t1, pulseCount,
        r, g, b
      ],
      {skipCache: !isPersistent} // skip only for transient flashes
    );
  }

  // ------------------------------------------------------------
  // TAG READ / WRITE (NTAG213)
  // ------------------------------------------------------------
  getTagHex(region) {
    const uid = this.regions[region];
    if (!uid) return "NOTAG";
    return [...uid].map(b => b.toString(16).padStart(2, "0")).join("");
  }

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

      await this.device.sendReport(0x00, cmd);
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

  _arraysEqual(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }


}
