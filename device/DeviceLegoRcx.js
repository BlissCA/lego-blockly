// device/DeviceLegoRcx.js
// Upgraded LegoRcx driver with Mindstorms RCX Remote Handset IR Decoding support
// Supports both Full Brick Mode ("Rcx1" / "CM1") and Tower-Only Remote Mode ("RcxIR1" / "CM_IR1")

/**
 * LEGO Mindstorms RCX Remote Handset key definitions and mappings.
 * Keys supported:
 * Msg1, Msg2, Msg3,
 * A Fwd, A Rev, B Fwd, B Rev, C Fwd, C Rev,
 * P1, P2, P3, P4, P5,
 * Stop, Beep.
 */
export const REMOTE_KEYS = {
  NONE: { code: 0, name: "None", label: "None", category: "system", description: "No button pressed" },
  MSG1: { code: 1, name: "Msg1", label: "Message 1", category: "message", description: "Send / Receive IR Message 1 (0xF7 0x01)" },
  MSG2: { code: 2, name: "Msg2", label: "Message 2", category: "message", description: "Send / Receive IR Message 2 (0xF7 0x02)" },
  MSG3: { code: 3, name: "Msg3", label: "Message 3", category: "message", description: "Send / Receive IR Message 3 (0xF7 0x03)" },
  A_FWD: { code: 4, name: "A Fwd", label: "Motor A Forward", category: "motor", description: "Motor A Forward (0x0008)" },
  A_REV: { code: 5, name: "A Rev", label: "Motor A Reverse", category: "motor", description: "Motor A Reverse (0x0010)" },
  B_FWD: { code: 6, name: "B Fwd", label: "Motor B Forward", category: "motor", description: "Motor B Forward (0x0020)" },
  B_REV: { code: 7, name: "B Rev", label: "Motor B Reverse", category: "motor", description: "Motor B Reverse (0x0040)" },
  C_FWD: { code: 8, name: "C Fwd", label: "Motor C Forward", category: "motor", description: "Motor C Forward (0x0080)" },
  C_REV: { code: 9, name: "C Rev", label: "Motor C Reverse", category: "motor", description: "Motor C Reverse (0x0100)" },
  P1:   { code: 10, name: "P1",   label: "Program 1", category: "program", description: "Select / Run Program 1 (0x91 0x00)" },
  P2:   { code: 11, name: "P2",   label: "Program 2", category: "program", description: "Select / Run Program 2 (0x91 0x01)" },
  P3:   { code: 12, name: "P3",   label: "Program 3", category: "program", description: "Select / Run Program 3 (0x91 0x02)" },
  P4:   { code: 13, name: "P4",   label: "Program 4", category: "program", description: "Select / Run Program 4 (0x91 0x03)" },
  P5:   { code: 14, name: "P5",   label: "Program 5", category: "program", description: "Select / Run Program 5 (0x91 0x04)" },
  STOP: { code: 15, name: "Stop", label: "Stop",      category: "system",  description: "Stop all tasks and motors (0x50 / 0x4000)" },
  BEEP: { code: 16, name: "Beep", label: "Beep",      category: "system",  description: "Play system beep / sound (0x51 0x00 / 0x8000)" }
};

export const REMOTE_KEY_BY_CODE = {};
export const REMOTE_KEY_BY_NAME = {};

export function normalizeKeyString(str) {
  return String(str).toLowerCase().replace(/[\s_-]+/g, "");
}

Object.values(REMOTE_KEYS).forEach(k => {
  REMOTE_KEY_BY_CODE[k.code] = k;
  REMOTE_KEY_BY_NAME[k.name.toLowerCase()] = k;
  REMOTE_KEY_BY_NAME[normalizeKeyString(k.name)] = k;
  if (k.name === "A Fwd") {
    REMOTE_KEY_BY_NAME["a_fwd"] = k;
    REMOTE_KEY_BY_NAME["afwd"] = k;
    REMOTE_KEY_BY_NAME["a forward"] = k;
  } else if (k.name === "A Rev") {
    REMOTE_KEY_BY_NAME["a_rev"] = k;
    REMOTE_KEY_BY_NAME["arev"] = k;
    REMOTE_KEY_BY_NAME["a reverse"] = k;
  } else if (k.name === "B Fwd") {
    REMOTE_KEY_BY_NAME["b_fwd"] = k;
    REMOTE_KEY_BY_NAME["bfwd"] = k;
    REMOTE_KEY_BY_NAME["b forward"] = k;
  } else if (k.name === "B Rev") {
    REMOTE_KEY_BY_NAME["b_rev"] = k;
    REMOTE_KEY_BY_NAME["brev"] = k;
    REMOTE_KEY_BY_NAME["b reverse"] = k;
  } else if (k.name === "C Fwd") {
    REMOTE_KEY_BY_NAME["c_fwd"] = k;
    REMOTE_KEY_BY_NAME["cfwd"] = k;
    REMOTE_KEY_BY_NAME["c forward"] = k;
  } else if (k.name === "C Rev") {
    REMOTE_KEY_BY_NAME["c_rev"] = k;
    REMOTE_KEY_BY_NAME["crev"] = k;
    REMOTE_KEY_BY_NAME["c reverse"] = k;
  }
});

// Dropdown options array for Blockly custom blocks
export const REMOTE_KEY_DROPDOWN_OPTIONS = [
  ["Msg1", "Msg1"],
  ["Msg2", "Msg2"],
  ["Msg3", "Msg3"],
  ["A Fwd", "A Fwd"],
  ["A Rev", "A Rev"],
  ["B Fwd", "B Fwd"],
  ["B Rev", "B Rev"],
  ["C Fwd", "C Fwd"],
  ["C Rev", "C Rev"],
  ["P1", "P1"],
  ["P2", "P2"],
  ["P3", "P3"],
  ["P4", "P4"],
  ["P5", "P5"],
  ["Stop", "Stop"],
  ["Beep", "Beep"]
];

export const REMOTE_KEY_DROPDOWN_OPTIONS_NUMERIC = [
  ["Msg1", 1],
  ["Msg2", 2],
  ["Msg3", 3],
  ["A Fwd", 4],
  ["A Rev", 5],
  ["B Fwd", 6],
  ["B Rev", 7],
  ["C Fwd", 8],
  ["C Rev", 9],
  ["P1", 10],
  ["P2", 11],
  ["P3", 12],
  ["P4", 13],
  ["P5", 14],
  ["Stop", 15],
  ["Beep", 16]
];

export class LegoRcx {
  constructor(name = null, manager = null) {
    this.name = name;
    this.manager = manager;

    this.isCM = typeof window !== "undefined" && !!window.useCyberMaster;

    if (this.isCM) {
      this.devicePrefix = "CM";
      this.headerBytes = Uint8Array.from([0xFE, 0x00, 0x00, 0xFF]);
      this.replySignatureBase = Uint8Array.from([0xFF]);
      this.handshakeOpcode = 0xA5;
      this.handshakePhrase = "Do you byte, when I knock?";
      this.expectedReplyPhrase = "Just a bit off the block!";
    } else {
      this.devicePrefix = "Rcx";
      this.headerBytes = Uint8Array.from([0x55, 0xFF, 0x00]);
      this.replySignatureBase = Uint8Array.from([0x55, 0xFF, 0x00]);
      this.handshakeOpcode = 0x10;
      this.handshakePhrase = null;
      this.expectedReplyPhrase = null;
    }

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.status = "idle";
    this.hasBrick = false;
    this.isTowerOnly = false;

    this.queue = Promise.resolve();
    this.queueActive = true;

    this.lastOpCode = 0;
    this.opCodeEx = new Set([0xF7]);
    this.NoReply = false;

    this.portState = {};
    for (let p = 1; p <= 3; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }

    this.currentRemoteKey = REMOTE_KEYS.NONE;   // primary key (first of the combo) - backward compatible
    this.currentRemoteKeys = [];                // ALL keys currently held (combo support)
    this.lastRemoteKey = REMOTE_KEYS.NONE;
    this.lastRemoteKeys = [];
    this.lastRemoteEvent = null;
    this.remoteKeyTimestamp = 0;
    this.remoteAutoClearTimeoutMs = 100;
    this.remoteListeners = new Set();

    // Enable verbose console debug logging by default
    this.debug = false;
    this.enableAutoKeepAlive = true;

    // TSOP Keep-alive heartbeat settings
    // 9V Battery Serial IR Tower sleeps receiver after ~5s of TX inactivity.
    // Periodic ping keeps TSOP powered ONLY while read methods are actively in use!
    this._keepAliveTimer = null;
    this._keepAliveIntervalMs = 1800; // 1.8 seconds (well inside the ~5s sleep window)
    this._keepAliveLastTouch = 0; // 0 until a read method is called
    this._keepAliveAutoSleepTimeoutMs = 5000; // auto-pause 5s after last read call so Green LED turns off quickly

    this.isReading = false;
    this.readBuffer = new Uint8Array(0);
    this.pendingReply = null;
    this.onPacketLogged = null;

    // WebUSB state for LEGO USB IR Tower (0x0694:0x0001)
    this.isUsbTower = false;
    this.usbDevice = null;
    this._usbInEpNum = 2;
    this._usbInEpSize = 64;
    this._usbOutEpNum = 1;
  }

  log(msg) {
    console.log(`[${this.devicePrefix} ${this.name || "unnamed"}] ${msg}`);
  }

  setDebug(enabled) {
    this.debug = enabled;
  }

  // ---------------- Tower TSOP Keep-Alive Pulse ----------------
  startRemoteKeepAlive(intervalMs = 1800) {
    // The USB tower is bus-powered: its TSOP never sleeps, so no keep-alive is needed.
    if (this.isUsbTower || this.usbDevice) return;

    this._keepAliveIntervalMs = intervalMs;
    this._keepAliveLastTouch = Date.now();

    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
    }

    this.log(`Started Tower TSOP Keep-Alive Pulse (${this._keepAliveIntervalMs}ms). Powering TSOP (Green LED on).`);
    this._sendTowerKeepAlivePing();

    this._keepAliveTimer = setInterval(() => {
      const hasListeners = this.remoteListeners.size > 0;
      const recentActivity = Date.now() - this._keepAliveLastTouch < this._keepAliveAutoSleepTimeoutMs;

      // Auto-pause if completely inactive and no listeners attached to save 9V battery & turn off Green LED
      if (!hasListeners && !recentActivity) {
        this.log("Pausing TSOP Keep-Alive pulse (no active read method calls). Green LED will turn off.");
        this.stopRemoteKeepAlive();
        return;
      }

      this._sendTowerKeepAlivePing();
    }, this._keepAliveIntervalMs);
  }

  stopRemoteKeepAlive() {
    if (this._keepAliveTimer) {
      clearInterval(this._keepAliveTimer);
      this._keepAliveTimer = null;
      this.log("Stopped Tower TSOP Keep-Alive Pulse. Tower will sleep TSOP (Green LED off).");
    }
  }

  isRemoteKeepAliveActive() {
    return this._keepAliveTimer !== null;
  }

  _touchRemoteActivity() {
    this._keepAliveLastTouch = Date.now();
    // Serial IR tower only (9V battery -> TSOP powers down after ~5s without traffic)
    if (this.isUsbTower || this.usbDevice) return;
    if (this.enableAutoKeepAlive && !this._keepAliveTimer && this.port) {
      this.startRemoteKeepAlive(this._keepAliveIntervalMs);
    }
  }

  async _sendTowerKeepAlivePing() {
    if (this.isUsbTower || this.usbDevice) return; // never ping a USB tower
    if (!this.writer) return;
    try {
      const pingPacket = this.mkSerBuffWr(Uint8Array.from([0x10]));
      if (this.writer) {
        await this.writer.write(pingPacket);
      } else if (this.usbDevice) {
        await this.usbDevice.transferOut(this._usbOutEpNum || 1, pingPacket);
      }
    } catch {
      // Ignore keep-alive write transient errors
    }
  }

  getRemoteKey() {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    return this.currentRemoteKey.code !== 0 ? this.currentRemoteKey.name : "";
  }

  getRemoteKeyCode() {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    return this.currentRemoteKey.code;
  }

  getLastRemoteKey() {
    this._touchRemoteActivity();
    return this.lastRemoteKey.code !== 0 ? this.lastRemoteKey.name : "";
  }

  getLastRemoteKeyCode() {
    this._touchRemoteActivity();
    return this.lastRemoteKey.code;
  }

  getLastRemoteEvent() {
    this._touchRemoteActivity();
    return this.lastRemoteEvent;
  }

  consumeRemoteKey() {
    const key = this.getRemoteKey();
    this.clearRemoteKey();
    return key;
  }

  consumeRemoteKeyCode() {
    const code = this.getRemoteKeyCode();
    this.clearRemoteKey();
    return code;
  }

  // True if the key is part of the keys currently held (works for single keys AND combos).
  isRemoteKeyPressed(key) {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    const k = this._resolveRemoteKey(key);
    return !!k && this.currentRemoteKeys.some((c) => c.code === k.code);
  }

  // ---- Combo support (several keys pressed at the same time on the handset) ----
  // Names of all keys currently held, e.g. ["A Fwd", "C Fwd"]
  getRemoteKeys() {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    return this.currentRemoteKeys.map((k) => k.name);
  }

  getRemoteKeyCodes() {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    return this.currentRemoteKeys.map((k) => k.code);
  }

  // Combo as one string, e.g. "A Fwd+C Fwd" ("" if nothing pressed)
  getRemoteCombo() {
    return this.getRemoteKeys().join("+");
  }

  // keys: array or "A Fwd+C Fwd" string. exact=true -> exactly these keys and no others.
  isRemoteComboPressed(keys, exact = true) {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    const wanted = this._resolveRemoteKeyList(keys);
    if (wanted.length === 0) return false;
    const held = this.currentRemoteKeys;
    const hasAll = wanted.every((w) => held.some((h) => h.code === w.code));
    return exact ? hasAll && held.length === wanted.length : hasAll;
  }

  // Motor view of the handset: -1 = Rev, 0 = idle, 1 = Fwd (both Fwd+Rev held -> 0)
  getRemoteMotorStates() {
    this._touchRemoteActivity();
    this._checkRemoteKeyTimeout();
    const has = (k) => this.currentRemoteKeys.some((c) => c.code === k.code);
    return {
      A: (has(REMOTE_KEYS.A_FWD) ? 1 : 0) - (has(REMOTE_KEYS.A_REV) ? 1 : 0),
      B: (has(REMOTE_KEYS.B_FWD) ? 1 : 0) - (has(REMOTE_KEYS.B_REV) ? 1 : 0),
      C: (has(REMOTE_KEYS.C_FWD) ? 1 : 0) - (has(REMOTE_KEYS.C_REV) ? 1 : 0),
    };
  }

  _resolveRemoteKey(key) {
    if (key && typeof key === "object" && typeof key.code === "number") return key;
    if (typeof key === "number") return REMOTE_KEY_BY_CODE[key] || null;
    const str = String(key).trim();
    return REMOTE_KEY_BY_NAME[str.toLowerCase()] || REMOTE_KEY_BY_NAME[normalizeKeyString(str)] || null;
  }

  _resolveRemoteKeyList(keys) {
    const list = Array.isArray(keys) ? keys : String(keys).split("+");
    return list.map((k) => this._resolveRemoteKey(k)).filter((k) => k && k.code !== 0);
  }

  clearRemoteKey() {
    this.currentRemoteKey = REMOTE_KEYS.NONE;
    this.currentRemoteKeys = [];
    this.remoteKeyTimestamp = 0;
  }

  onRemoteKey(callback) {
    this.remoteListeners.add(callback);
    this._touchRemoteActivity();
    return () => this.remoteListeners.delete(callback);
  }

  offRemoteKey(callback) {
    this.remoteListeners.delete(callback);
  }

  waitForRemoteKey(expectedKey = null, timeoutMs = 0) {
    this._touchRemoteActivity();
    return new Promise((resolve, reject) => {
      let timeoutId = null;

      const listener = (event) => {
        if (!expectedKey) {
          cleanup();
          resolve(event);
        } else if (typeof expectedKey === "number" && (event.codes || [event.code]).includes(expectedKey)) {
          cleanup();
          resolve(event);
        } else if (typeof expectedKey === "string" || Array.isArray(expectedKey)) {
          const wanted = this._resolveRemoteKeyList(expectedKey);
          const got = event.codes || [event.code];
          // "A Fwd+C Fwd" (or an array) waits for exactly that combo; a single key matches if it is held
          const ok = wanted.length > 1
            ? wanted.length === got.length && wanted.every((w) => got.includes(w.code))
            : wanted.length === 1 && got.includes(wanted[0].code);
          if (ok) {
            cleanup();
            resolve(event);
          }
        }
      };

      const cleanup = () => {
        this.remoteListeners.delete(listener);
        if (timeoutId) clearTimeout(timeoutId);
      };

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Timed out waiting for remote key ${expectedKey || "any"}`));
        }, timeoutMs);
      }

      this.remoteListeners.add(listener);
    });
  }

  _checkRemoteKeyTimeout() {
    if (this.currentRemoteKey.code !== 0 && this.remoteAutoClearTimeoutMs > 0) {
      if (Date.now() - this.remoteKeyTimestamp > this.remoteAutoClearTimeoutMs) {
        this.currentRemoteKey = REMOTE_KEYS.NONE;
        this.currentRemoteKeys = [];
      }
    }
  }

  simulateRemotePress(keyNameOrCode) {
    // Accepts a key, an array of keys, or a combo string like "A Fwd+C Fwd"
    const keys = typeof keyNameOrCode === "number"
      ? this._resolveRemoteKeyList([keyNameOrCode])
      : this._resolveRemoteKeyList(keyNameOrCode);
    if (keys.length === 0) return;
    this._dispatchRemoteEvent(keys, undefined, "simulated");
  }

  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve(null);
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }

  isBrickOnline() {
    return this.hasBrick && !this.isTowerOnly;
  }

  isTowerOnlyMode() {
    return this.isTowerOnly;
  }

  async connect(existingPort = null, options = {}) {
    this.log("Requesting serial port...");

    try {
      if (existingPort) {
        this.port = existingPort;
      } else if (typeof window.autoSelectPort === "function") {
        this.port = await window.autoSelectPort();
      } else if (navigator && navigator.serial) {
        this.port = await navigator.serial.requestPort();
      } else {
        throw new Error("Web Serial API is not supported in this browser.");
      }
    } catch (err) {
      this.log("User cancelled port selection or error: " + err);
      throw err;
    }

    await this.port.open({
      baudRate: 2400,
      dataBits: 8,
      stopBits: 1,
      parity: "odd",
      bufferSize: 3 * 32 * 1024
    });

    // Configure RS-232 control lines (DTR and RTS)
    // The LEGO Serial IR Tower requires DTR=true and RTS=true for transceiver power and CTS detection!
    try {
      await this.port.setSignals({ 
        dataTerminalReady: true, 
        requestToSend: !this.isCM 
      });
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (sigErr) {
      console.warn("Could not set serial signals (DTR/RTS):", sigErr);
    }

    this.writer = this.port.writable.getWriter();
    this._startReaderLoop();

    // Direct tower-only connection requested for RCX only
    if (options && options.towerOnly && !this.isCM) {
      this.hasBrick = false;
      this.isTowerOnly = true;
      this.devicePrefix = "RcxIR";

      if (!this.name && this.manager && typeof this.manager._allocateName === "function") {
        this.name = this.manager._allocateName(this.devicePrefix);
      } else if (!this.name) {
        this.name = `${this.devicePrefix}1`;
      }

      this.log(`Tower-Only mode selected directly. Name assigned: ${this.name} (Keep-alive idle until read methods are used)`);
      this.status = "Connected";
      if (typeof window.logStatus === "function") {
        window.logStatus(
          `${this.name}: IR Tower connected (Tower-Only mode, standby).`
        );
      }
      return;
    }

    // 3. Handshake check: Test if an RCX or CyberMaster brick is powered on
    let ok = false;
    try {
      if (this.isCM) {
        ok = await this._handshakeCM(true);
      } else {
        ok = await this.alive(true);
      }
    } catch (err) {
      console.warn("Handshake error:", err);
      ok = false;
    }

    if (ok) {
      // 🌟 FULL BRICK MODE: The RCX / CM brick responded!
      this.hasBrick = true;
      this.isTowerOnly = false;
      this.devicePrefix = this.isCM ? "CM" : "Rcx";

      if (!this.name && this.manager && typeof this.manager._allocateName === "function") {
        this.name = this.manager._allocateName(this.devicePrefix);
      } else if (!this.name) {
        this.name = `${this.devicePrefix}99`;
      }

      this.log(`Full brick online. Name assigned: ${this.name}`);
      this.status = "Connected";
      if (typeof window.logStatus === "function") {
        window.logStatus(`${this.name}: Connected with ${this.devicePrefix} brick online.`);
      }
    } else {
      // 🌟 TOWER-ONLY / REMOTE HANDSET MODE: No brick responded, but IR Serial Tower is open!
      // DO NOT disconnect! Use prefix "RcxIR"
      // BUT IS isCM? Disconnect!.
      if (this.isCM) {
          this.devicePrefix = "CM";
          this.log(`${this.devicePrefix} did not respond. Power it on.`);
          window.logStatus(`${this.devicePrefix}: Please power on the device and Reconnect.`);
          this.disconnect();
      }      
      this.hasBrick = false;
      this.isTowerOnly = true;
      this.devicePrefix = "RcxIR";

      if (!this.name && this.manager && typeof this.manager._allocateName === "function") {
        this.name = this.manager._allocateName(this.devicePrefix);
      } else if (!this.name) {
        this.name = `${this.devicePrefix}99`;
      }

      this.log(`Brick offline. IR Tower connected in Remote-Only mode. Name assigned: ${this.name} (Standby, Green LED off until read methods are used)`);
      this.status = "Connected";
      if (typeof window.logStatus === "function") {
        window.logStatus(
          `${this.name}: IR Tower connected (Standby, brick powered off).`
        );
      }
    }
  }

  // ---------------- LEGO USB IR Tower (WebUSB) ----------------
  async connectUsbTower(device = null, options = {}) {
    this.log("Requesting LEGO USB IR Tower via WebUSB...");
    if (typeof navigator === "undefined" || !navigator.usb) {
      throw new Error("WebUSB API is not supported in this browser. Please use Chrome, Edge, or Opera.");
    }

    try {
      if (device) {
        this.usbDevice = device;
      } else {
        this.usbDevice = await navigator.usb.requestDevice({
          filters: [{ vendorId: 0x0694, productId: 0x0001 }],
        });
      }

      await this.usbDevice.open();
      if (this.usbDevice.configuration === null) {
        await this.usbDevice.selectConfiguration(1);
      }
      await this.usbDevice.claimInterface(0);

      let inEndpoint = null;
      let outEndpoint = null;
      try {
        const iface = this.usbDevice.configuration?.interfaces[0];
        const alternate = iface?.alternates[0];
        if (alternate && alternate.endpoints) {
          inEndpoint = alternate.endpoints.find((ep) => ep.direction === "in");
          outEndpoint = alternate.endpoints.find((ep) => ep.direction === "out");
        }
      } catch (epErr) {
        console.warn("Could not inspect USB endpoints:", epErr);
      }
      this._usbInEpNum = inEndpoint ? inEndpoint.endpointNumber : 2;
      this._usbInEpSize = inEndpoint ? inEndpoint.packetSize : 64;
      this._usbOutEpNum = outEndpoint ? outEndpoint.endpointNumber : 1;

      this.isUsbTower = true;
      this.queueActive = true;
      this._startUsbReaderLoop();

      // Direct tower-only connection requested (Remote Handset only, no handshake)
      if (options && options.towerOnly) {
        this._applyUsbTowerOnly("Tower-Only mode selected directly.");
        return this.usbDevice;
      }

      // Handshake check (same logic as connect()): is an RCX brick powered on?
      // Temporarily leave isTowerOnly=false so rcxCmd() is not short-circuited.
      this.hasBrick = false;
      this.isTowerOnly = false;
      this.devicePrefix = "Rcx";

      let ok = false;
      try {
        // Tiny settle delay so the reader loop is polling before we transmit
        await new Promise((r) => setTimeout(r, 100));
        ok = await this.alive(true);
      } catch (hsErr) {
        console.warn("USB Tower handshake error:", hsErr);
        ok = false;
      }

      if (ok) {
        // FULL BRICK MODE: the RCX answered through the USB tower
        this.hasBrick = true;
        this.isTowerOnly = false;
        this.devicePrefix = "Rcx";

        if (!this.name && this.manager && typeof this.manager._allocateName === "function") {
          this.name = this.manager._allocateName(this.devicePrefix);
        } else if (!this.name) {
          this.name = `${this.devicePrefix}99`;
        }

        this.status = "Connected";
        this.log(`USB Tower connected, full brick online. Name assigned: ${this.name} (IN ep: ${this._usbInEpNum}, OUT ep: ${this._usbOutEpNum})`);
        if (typeof window !== "undefined" && typeof window.logStatus === "function") {
          window.logStatus(`${this.name}: Connected via USB IR Tower with Rcx brick online.`);
        }
      } else {
        // TOWER-ONLY / REMOTE HANDSET MODE: no brick answered, tower stays open
        this._applyUsbTowerOnly("Brick offline. USB IR Tower connected in Remote-Only mode.");
      }
      return this.usbDevice;
    } catch (err) {
      this.log("USB Tower connection error: " + err);
      throw err;
    }
  }

  _applyUsbTowerOnly(reason) {
    this.hasBrick = false;
    this.isTowerOnly = true;
    this.devicePrefix = "RcxIR";

    if (!this.name && this.manager && typeof this.manager._allocateName === "function") {
      this.name = this.manager._allocateName(this.devicePrefix);
    } else if (!this.name) {
      this.name = `${this.devicePrefix}99`;
    }

    this.status = "Connected";
    this.log(`${reason} Name assigned: ${this.name} (IN ep: ${this._usbInEpNum}, OUT ep: ${this._usbOutEpNum})`);
    if (typeof window !== "undefined" && typeof window.logStatus === "function") {
      window.logStatus(`${this.name}: LEGO USB IR Tower connected (Tower-Only mode, brick powered off).`);
    }
  }

  async _startUsbReaderLoop() {
    if (this.isReading || !this.usbDevice) return;
    this.isReading = true;

    try {
      while (this.usbDevice && this.isReading) {
        try {
          const result = await this.usbDevice.transferIn(this._usbInEpNum || 2, this._usbInEpSize || 64);
          if (result && result.data && result.data.byteLength > 0) {
            const u8 = new Uint8Array(
              result.data.buffer,
              result.data.byteOffset,
              result.data.byteLength
            );
            this._handleIncomingRawBytes(u8);
          }
        } catch (err) {
          if (this.isReading) {
            await new Promise((r) => setTimeout(r, 60));
          }
        }
      }
    } finally {
      this.isReading = false;
    }
  }

  /**
   * Re-checks if the RCX brick has been powered on without having to reconnect the serial port.
   * If brick answers, automatically upgrades from "RcxIR1" to "Rcx1" (or "CM_IR1" to "CM1").
   */
  async checkBrickOnline() {
    const serialReady = !!(this.port && this.port.readable);
    const usbReady = !!(this.usbDevice && this.usbDevice.opened);
    if (!serialReady && !usbReady) return false;

    let ok = false;
    try {
      if (this.isCM) {
        ok = await this._handshakeCM(true);
      } else {
        ok = await this.alive(true);
      }
    } catch {
      ok = false;
    }

    if (ok && this.isTowerOnly) {
      // Brick was just powered on! Upgrade device prefix and name
      this.hasBrick = true;
      this.isTowerOnly = false;

      const oldName = this.name;
      if (this.name && this.manager && typeof this.manager._removeDevice === "function") {
        this.manager._removeDevice(this);
      }

      this.devicePrefix = this.isCM ? "CM" : "Rcx";
      if (this.manager && typeof this.manager._allocateName === "function") {
        this.name = this.manager._allocateName(this.devicePrefix);
      } else {
        this.name = `${this.devicePrefix}1`;
      }

      this.log(`Upgraded from ${oldName} to full brick online. New name: ${this.name}`);
      if (typeof window.logStatus === "function") {
        window.logStatus(`${this.name}: RCX brick detected and online!`);
      }
    } else if (!ok && this.hasBrick) {
      // Brick was powered off
      this.hasBrick = false;
      this.isTowerOnly = true;

      const oldName = this.name;
      if (this.name && this.manager && typeof this.manager._removeDevice === "function") {
        this.manager._removeDevice(this);
      }

      this.devicePrefix = this.isCM ? "CM_IR" : "RcxIR";
      if (this.manager && typeof this.manager._allocateName === "function") {
        this.name = this.manager._allocateName(this.devicePrefix);
      } else {
        this.name = `${this.devicePrefix}1`;
      }

      this.log(`Brick offline. Downgraded from ${oldName} to tower-only name: ${this.name}`);
      if (typeof window.logStatus === "function") {
        window.logStatus(`${this.name}: RCX brick powered off. Switched to Tower-Only mode.`);
      }
    }

    return ok;
  }

  async _startReaderLoop() {
    if (this.isReading || !this.port || !this.port.readable) return;
    this.isReading = true;

    try {
      while (this.port && this.port.readable && this.isReading) {
        try {
          this.reader = this.port.readable.getReader();
        } catch (err) {
          console.warn("Could not get reader lock:", err);
          break;
        }

        try {
          while (this.isReading) {
            const { value, done } = await this.reader.read();
            if (done) break;
            if (value && value.length > 0) {
              this._handleIncomingRawBytes(value);
            }
          }
        } catch (err) {
          if (err?.name === "ParityError" || err?.message?.includes("Parity")) {
            continue;
          }
          if (this.isReading) {
            console.warn(`[${this.devicePrefix}] Reader error:`, err);
          }
        } finally {
          try { this.reader.releaseLock(); } catch {}
          this.reader = null;
        }

        if (!this.isReading) break;
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (outerErr) {
      console.warn("Reader loop stopped:", outerErr);
    } finally {
      this.isReading = false;
    }
  }

  _handleIncomingRawBytes(chunk) {
    if (this.debug) {
      const hexStr = Array.from(chunk)
        .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
        .join(" ");
      console.log(`[${this.devicePrefix} ${this.name || ""}] RX RAW (${chunk.length}b): ${hexStr}`);
    }

    if (this.onPacketLogged) {
      this.onPacketLogged("rx", chunk);
    }

    const merged = new Uint8Array(this.readBuffer.length + chunk.length);
    merged.set(this.readBuffer);
    merged.set(chunk, this.readBuffer.length);
    this.readBuffer = merged;

    if (this.pendingReply) {
      const foundIdx = this.findSignature(this.readBuffer, this.pendingReply.signature);
      if (foundIdx !== -1) {
        const sigLen = this.pendingReply.signature.length;
        const needed = sigLen + 2 * this.pendingReply.vblen;

        if (this.readBuffer.length >= foundIdx + needed) {
          let vals = [];
          for (let i = 0; i < this.pendingReply.vblen; i++) {
            vals.push(this.readBuffer[foundIdx + sigLen + i * 2]);
          }

          const replyResult =
            this.pendingReply.vblen > 0
              ? Uint8Array.from(vals)
              : Uint8Array.from([0x00]);

          const pending = this.pendingReply;
          this.pendingReply = null;
          if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);

          this.readBuffer = this.readBuffer.slice(foundIdx + needed);
          pending.resolve(replyResult);
          return;
        }
      }
    }

    this._scanForRemotePackets();

    if (this.readBuffer.length > 512) {
      this.readBuffer = this.readBuffer.slice(this.readBuffer.length - 128);
    }
  }

  _scanForRemotePackets() {
    if (this.readBuffer.length < 5) return;

    const headerRcx = Uint8Array.from([0x55, 0xFF, 0x00]);
    const headerCm  = Uint8Array.from([0xFE, 0x00, 0x00, 0xFF]);

    let idx = this.findSignature(this.readBuffer, headerRcx);
    let hdrLen = 3;

    if (idx === -1) {
      idx = this.findSignature(this.readBuffer, headerCm);
      hdrLen = 4;
    }

    if (idx === -1) {
      this._checkRawComplementRemote();
      return;
    }

    const packetStart = idx + hdrLen;
    const decoded = this._decodeRcxPacketBody(this.readBuffer.slice(packetStart));

    if (decoded) {
      const { payload, totalBytesConsumed } = decoded;
      const fullPacket = this.readBuffer.slice(idx, packetStart + totalBytesConsumed);

      const keys = this._mapPayloadToRemoteKeys(payload);
      if (keys.length > 0) {
        this._dispatchRemoteEvent(keys, fullPacket, "ir_tower");
      }

      this.readBuffer = this.readBuffer.slice(packetStart + totalBytesConsumed);
    } else if (this.readBuffer.length > idx + 20) {
      this.readBuffer = this.readBuffer.slice(idx + 1);
    }
  }

  _decodeRcxPacketBody(bytes) {
    if (bytes.length < 4) return null;

    const payload = [];
    let sum = 0;
    let i = 0;

    while (i + 1 < bytes.length) {
      const b = bytes[i];
      const comp = bytes[i + 1];

      if (((b + comp) & 0xFF) !== 0xFF) {
        return null;
      }

      if (payload.length > 0 && b === (sum & 0xFF)) {
        return {
          payload: Uint8Array.from(payload),
          totalBytesConsumed: i + 2,
        };
      }

      payload.push(b);
      sum += b;
      i += 2;
    }

    return null;
  }

  _checkRawComplementRemote() {
    if (this.readBuffer.length < 2) return;
    for (let i = 0; i <= this.readBuffer.length - 2; i += 2) {
      const b1 = this.readBuffer[i];
      const b2 = this.readBuffer[i + 1];
      if (((b1 + b2) & 0xFF) === 0xFF) {
        const key = this._mapSingleByteToRemoteKey(b1);
        if (key && key.code !== 0) {
          this._dispatchRemoteEvent(key, this.readBuffer.slice(i, i + 2), "ir_tower");
          this.readBuffer = this.readBuffer.slice(i + 2);
          return;
        }
      }
    }
  }

  // Backward-compatible: returns only the primary (first) key
  _mapPayloadToRemoteKey(payload) {
    const keys = this._mapPayloadToRemoteKeys(payload);
    return keys.length ? keys[0] : null;
  }

  // Returns ALL keys carried by a packet (array, possibly empty).
  // The 0xD2 remote opcode carries a 16-bit bitmask of every key currently held,
  // so combos like A Fwd + C Fwd arrive in ONE packet.
  _mapPayloadToRemoteKeys(payload) {
    if (!payload || payload.length === 0) return [];
    const op = payload[0] & ~0x08;

    // 1. LEGO 16-bit Remote Control Opcode 0xD2 (Handset 9738)
    if (op === 0xD2 && payload.length >= 3) {
      const word = (payload[2] << 8) | payload[1];

      // Hardware-verified bitmask mapping for LEGO Remote Handset 9738 (priority order = result order)
      const table = [
        [0x0100, REMOTE_KEYS.MSG1],
        [0x0200, REMOTE_KEYS.MSG2],
        [0x0400, REMOTE_KEYS.MSG3],
        [0x0800, REMOTE_KEYS.A_FWD],
        [0x4000, REMOTE_KEYS.A_REV],
        [0x1000, REMOTE_KEYS.B_FWD],
        [0x8000, REMOTE_KEYS.B_REV],
        [0x2000, REMOTE_KEYS.C_FWD],
        [0x0001, REMOTE_KEYS.C_REV],
        [0x0002, REMOTE_KEYS.P1],
        [0x0004, REMOTE_KEYS.P2],
        [0x0008, REMOTE_KEYS.P3],
        [0x0010, REMOTE_KEYS.P4],
        [0x0020, REMOTE_KEYS.P5],
        [0x0040, REMOTE_KEYS.STOP],
        [0x0080, REMOTE_KEYS.BEEP],
      ];
      const keys = table.filter(([bit]) => word & bit).map(([, k]) => k);
      if (keys.length) return keys;
    }

    // 2. Direct Opcode 0xF7: Send Message 1, 2, or 3
    if (op === 0xF7 && payload.length >= 2) {
      const msgVal = payload[1];
      if (msgVal === 2) return [REMOTE_KEYS.MSG2];
      if (msgVal === 3) return [REMOTE_KEYS.MSG3];
      return [REMOTE_KEYS.MSG1];
    }

    // 3. Direct Opcode 0x91: Select Program
    if (op === 0x91 && payload.length >= 2) {
      const progKeys = [REMOTE_KEYS.P1, REMOTE_KEYS.P2, REMOTE_KEYS.P3, REMOTE_KEYS.P4, REMOTE_KEYS.P5];
      if (progKeys[payload[1]]) return [progKeys[payload[1]]];
    }

    // 4. Direct Opcode 0x51: Play Sound (Beep)
    if (op === 0x51) return [REMOTE_KEYS.BEEP];

    // 5. Direct Opcode 0x50: Stop All Tasks & Motors
    if (op === 0x50) return [REMOTE_KEYS.STOP];

    // 6. Direct Opcode 0xE1: Motor Direction (0x80 = fwd, 0x00 = rev) - bitmask A=1, B=2, C=4
    if (op === 0xE1 && payload.length >= 2) {
      const arg = payload[1];
      const isFwd = (arg & 0x80) !== 0;
      const motors = arg & 0x07;
      const keys = [];
      if (motors & 0x01) keys.push(isFwd ? REMOTE_KEYS.A_FWD : REMOTE_KEYS.A_REV);
      if (motors & 0x02) keys.push(isFwd ? REMOTE_KEYS.B_FWD : REMOTE_KEYS.B_REV);
      if (motors & 0x04) keys.push(isFwd ? REMOTE_KEYS.C_FWD : REMOTE_KEYS.C_REV);
      if (keys.length) return keys;
    }

    // 7. Direct Opcode 0x21: Motor On / Off (Bitmask A=1, B=2, C=4)
    if (op === 0x21 && payload.length >= 2) {
      const arg = payload[1];
      if (arg === 0x47) return [REMOTE_KEYS.STOP];
      const motors = arg & 0x07;
      const keys = [];
      if (motors & 0x01) keys.push(REMOTE_KEYS.A_FWD);
      if (motors & 0x02) keys.push(REMOTE_KEYS.B_FWD);
      if (motors & 0x04) keys.push(REMOTE_KEYS.C_FWD);
      if (keys.length) return keys;
    }

    // 8. Opcode 0x81: Stop task
    if (op === 0x81) return [REMOTE_KEYS.STOP];

    return [];
  }

  _mapSingleByteToRemoteKey(byte) {
    switch (byte) {
      case 0x01: return REMOTE_KEYS.MSG1;
      case 0x02: return REMOTE_KEYS.MSG2;
      case 0x03: return REMOTE_KEYS.MSG3;
      case 0x08: case 0x41: return REMOTE_KEYS.A_FWD;
      case 0x10: return REMOTE_KEYS.A_REV;
      case 0x20: case 0x42: return REMOTE_KEYS.B_FWD;
      case 0x40: return REMOTE_KEYS.B_REV;
      case 0x80: case 0x43: return REMOTE_KEYS.C_FWD;
      case 0x0100: return REMOTE_KEYS.C_REV;
      case 0x11: return REMOTE_KEYS.P1;
      case 0x12: return REMOTE_KEYS.P2;
      case 0x13: return REMOTE_KEYS.P3;
      case 0x14: return REMOTE_KEYS.P4;
      case 0x15: return REMOTE_KEYS.P5;
      case 0x50: return REMOTE_KEYS.STOP;
      case 0x51: return REMOTE_KEYS.BEEP;
      default: return null;
    }
  }

  // keyOrKeys: a single key object or an array of key objects (combo)
  _dispatchRemoteEvent(keyOrKeys, rawPacket = undefined, source = "ir_tower") {
    const keys = (Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys]).filter((k) => k && k.code !== 0);
    if (keys.length === 0) return;
    const keyInfo = keys[0]; // primary key (backward compatible)
    const names = keys.map((k) => k.name);
    const combo = names.join("+");

    this.currentRemoteKey = keyInfo;
    this.currentRemoteKeys = keys;
    this.lastRemoteKey = keyInfo;
    this.lastRemoteKeys = keys;
    this.remoteKeyTimestamp = Date.now();

    const event = {
      name: keyInfo.name,          // primary key
      code: keyInfo.code,
      names,                       // every key held
      codes: keys.map((k) => k.code),
      combo,                       // "A Fwd+C Fwd"
      isCombo: keys.length > 1,
      timestamp: this.remoteKeyTimestamp,
      rawPacket,
      source,
    };

    this.lastRemoteEvent = event;

    if (this.onPacketLogged && rawPacket) {
      this.onPacketLogged("remote", rawPacket, `Key: ${combo} (#${event.codes.join("+")})`);
    }

    console.log(
      `%c[${this.devicePrefix} ${this.name || ""}] 🎮 REMOTE HANDSET ${keys.length > 1 ? "COMBO" : "KEY"}: ${combo} (Code: ${event.codes.join("+")})`,
      "color: #10b981; font-weight: bold; font-size: 13px;"
    );

    for (const listener of this.remoteListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("Error in remote key listener:", err);
      }
    }
  }

  async _handshakeCM() {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const phrase = this.handshakePhrase || "Do you byte, when I knock?";
    const expected = this.expectedReplyPhrase || "Just a bit off the block!";

    const cmd = Uint8Array.from([this.handshakeOpcode, ...encoder.encode(phrase)]);
    const replyLen = expected.length;

    const replyBytes = await this.rcxCmd(cmd, replyLen);
    if (!replyBytes) return false;

    const replyText = decoder.decode(replyBytes);
    return replyText.includes(expected);
  }

  async writeBytes(bytes) {
    if (!this.writer && !this.usbDevice) return;
    if (this.onPacketLogged) {
      this.onPacketLogged("tx", bytes);
    }
    if (this.writer) {
      await this.writer.write(bytes);
    } else if (this.usbDevice) {
      await this.usbDevice.transferOut(this._usbOutEpNum || 1, bytes);
    }
  }

  mkSerBuffWr(cmd) {
    if (!cmd || cmd.length === 0) cmd = new Uint8Array([0x10]);

    let opCode = cmd[0];

    if (this.opCodeEx.has(opCode)) {
      this.NoReply = true;
    } else {
      this.NoReply = false;
    }

    if (opCode === this.lastOpCode && !this.opCodeEx.has(opCode)) {
      opCode ^= 0x08; // toggle bit
      cmd = Uint8Array.from([opCode, ...cmd.slice(1)]);
    }

    this.lastOpCode = opCode;

    let buff = [];
    let sum = 0;

    for (let b of cmd) {
      buff.push(b);
      buff.push(0xFF - b);
      sum += b;
    }

    buff.push(sum & 0xFF);
    buff.push((-1 - sum) & 0xFF);

    return Uint8Array.from([...this.headerBytes, ...buff]);
  }

  createRemotePacket(keyNameOrCode) {
    let keyInfo;
    if (typeof keyNameOrCode === "number") {
      keyInfo = REMOTE_KEY_BY_CODE[keyNameOrCode];
    } else {
      keyInfo =
        REMOTE_KEY_BY_NAME[String(keyNameOrCode).toLowerCase()] ||
        REMOTE_KEY_BY_NAME[normalizeKeyString(String(keyNameOrCode))];
    }

    if (!keyInfo) return new Uint8Array(0);

    let word = 0;
    switch (keyInfo.code) {
      case 1:  word = 0x0100; break; // Msg1
      case 2:  word = 0x0200; break; // Msg2
      case 3:  word = 0x0400; break; // Msg3
      case 4:  word = 0x0800; break; // A Fwd
      case 5:  word = 0x4000; break; // A Rev
      case 6:  word = 0x1000; break; // B Fwd
      case 7:  word = 0x8000; break; // B Rev
      case 8:  word = 0x2000; break; // C Fwd
      case 9:  word = 0x0001; break; // C Rev
      case 10: word = 0x0002; break; // P1
      case 11: word = 0x0004; break; // P2
      case 12: word = 0x0008; break; // P3
      case 13: word = 0x0010; break; // P4
      case 14: word = 0x0020; break; // P5
      case 15: word = 0x0040; break; // Stop
      case 16: word = 0x0080; break; // Beep
      default: word = 0;
    }

    const cmd = Uint8Array.from([0xD2, word & 0xFF, (word >> 8) & 0xFF]);
    return this.mkSerBuffWr(cmd);
  }

  async rcxCmd(cmd, vblen = 0, forceCheck = false) {
    if (this.isTowerOnly && !forceCheck && !this.NoReply && !this.opCodeEx.has(cmd[0])) {
      console.warn(
        `[${this.devicePrefix} ${this.name || ""}] Skipped command 0x${cmd[0].toString(16)}: RCX brick is offline (Tower-Only mode).`
      );
      return null;
    }

    return this.enqueue(async () => {
      const buff = this.mkSerBuffWr(cmd);

      const replyCode = buff[this.headerBytes.length + 1];
      const replyComp = buff[this.headerBytes.length];

      const signature = Uint8Array.from([
        ...this.replySignatureBase,
        replyCode,
        replyComp,
      ]);

      for (let attempt = 1; attempt <= 3; attempt++) {
        let replyPromise;

        if (this.NoReply) {
          replyPromise = Promise.resolve(Uint8Array.from([0x00]));
        } else {
          replyPromise = new Promise((resolve, reject) => {
            const timeoutTimer = setTimeout(() => {
              if (this.pendingReply) {
                this.pendingReply = null;
                resolve(null);
              }
            }, 1000);

            this.pendingReply = {
              signature,
              vblen,
              resolve,
              reject,
              timeoutTimer,
              startTime: performance.now(),
            };
          });
        }

        await this.writeBytes(buff);

        if (this.NoReply) {
          return Uint8Array.from([0x00]);
        }

        const result = await replyPromise;

        if (result !== null) {
          await new Promise((r) => setTimeout(r, 20));
          return result;
        }

        console.warn(
          `[${this.devicePrefix} ${this.name || ""}] No reply for cmd 0x${cmd[0].toString(16)} (attempt ${attempt})`
        );

        if (this.isCM) {
          await new Promise((r) => setTimeout(r, 500));
        } else {
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      console.warn(
        `[${this.devicePrefix} ${this.name || ""}] Command failed after 3 attempts: 0x${cmd[0].toString(16)}`
      );
      return null;
    });
  }

  findSignature(buffer, signature) {
    if (buffer.length < signature.length) return -1;
    for (let i = 0; i <= buffer.length - signature.length; i++) {
      let ok = true;
      for (let j = 0; j < signature.length; j++) {
        if (buffer[i + j] !== signature[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }
    return -1;
  }

  async disconnect() {
    this.stopRemoteKeepAlive();
    this.queueActive = false;
    this.isReading = false;

    if (this.pendingReply) {
      if (this.pendingReply.timeoutTimer) clearTimeout(this.pendingReply.timeoutTimer);
      this.pendingReply.resolve(null);
      this.pendingReply = null;
    }

    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    try { await this.usbDevice?.releaseInterface(0); } catch {}
    try { await this.usbDevice?.close(); } catch {}

    this.reader = null;
    this.writer = null;
    this.port = null;
    this.usbDevice = null;
    this.isUsbTower = false;
    this.readBuffer = new Uint8Array(0);

    this.portState = {};
    for (let p = 1; p <= 3; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }

    if (this.name && this.manager && typeof this.manager._removeDevice === "function") {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.hasBrick = false;
    this.isTowerOnly = false;
    this.clearRemoteKey();
    this.status = "Disconnected";
    this.log("Disconnected.");
  }

  shouldSendMulti(mask, mode, power = null) {
    let mustSend = false;

    for (let p = 1; p <= 3; p++) {
      if (mask & (1 << (p - 1))) {
        const st = this.portState[p];

        if (st.mode !== mode || (power !== null && st.power !== power)) {
          mustSend = true;
        }
      }
    }

    if (mustSend) {
      for (let p = 1; p <= 3; p++) {
        if (mask & (1 << (p - 1))) {
          this.portState[p].mode = mode;
          if (power !== null) this.portState[p].power = power;
        }
      }
    }

    return mustSend;
  }

  async alive(forceCheck = false) {
    const r = await this.rcxCmd(Uint8Array.from([0x10]), 0, forceCheck);
    return r !== null;
  }

  async pwroff() {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot power off: RCX brick is offline.`);
      return;
    }
    await this.rcxCmd(Uint8Array.from([0x60]));
  }

  async snd(soundType) {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot play brick sound: RCX brick is offline.`);
      return;
    }
    await this.rcxCmd(Uint8Array.from([0x51, soundType & 0xFF]));
  }

  async prg(progNo = 1) {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot select program: RCX brick is offline.`);
      return;
    }
    let p = progNo < 1 || progNo > 5 ? 0 : progNo - 1;
    await this.rcxCmd(Uint8Array.from([0x91, p]));
  }

  async start(taskNo = 0) {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot start task: RCX brick is offline.`);
      return;
    }
    let t = taskNo < 0 || taskNo > 9 ? 0 : taskNo;
    await this.rcxCmd(Uint8Array.from([0x71, t]));
  }

  async stop(taskNo = -1) {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot stop task: RCX brick is offline.`);
      return;
    }
    if (taskNo < 0 || taskNo > 9) await this.rcxCmd(Uint8Array.from([0x50]));
    else await this.rcxCmd(Uint8Array.from([0x81, taskNo]));
  }

  async msg(msgByte) {
    await this.rcxCmd(Uint8Array.from([0xF7, msgByte & 0xFF]));
  }

  async getval(source, arg = 0) {
    if (this.isTowerOnly) {
      console.warn(`[${this.name}] Cannot read value: RCX brick is offline.`);
      return null;
    }
    const vb = await this.rcxCmd(Uint8Array.from([0x12, source, arg]), 2);
    if (!vb) return null;
    let v = (vb[1] << 8) + vb[0];
    if (v >= 32768) v -= 65536;
    return v;
  }

  mot(mask) {
    return new RcxMotor(this, mask);
  }

  sensor(port) {
    return new RcxSensor(this, port);
  }
}

class RcxMotor {
  constructor(rcx, motors) {
    this.rcx = rcx;
    this.motors = motors & 0x07; // A=1, B=2, C=4
  }

  async on() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.on(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    if (!this.rcx.shouldSendMulti(this.motors, "on")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x80 | this.motors]));
  }

  async off() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.off(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    if (!this.rcx.shouldSendMulti(this.motors, "off")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x40 | this.motors]));
  }

  async float() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.float(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    if (!this.rcx.shouldSendMulti(this.motors, "float")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x00 | this.motors]));
  }

  async flip() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.flip(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x40 | this.motors]));
  }

  async f() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.f(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    if (!this.rcx.shouldSendMulti(this.motors, "f")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x80 | this.motors]));
  }

  async r() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.r(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    if (!this.rcx.shouldSendMulti(this.motors, "r")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x00 | this.motors]));
  }

  async pow(power) {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored motor.pow(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    const p = power & 0x07;
    if (!this.rcx.shouldSendMulti(this.motors, "pow", p)) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x13, this.motors, 0x02, p]));
  }
}

class RcxSensor {
  constructor(rcx, input) {
    this.rcx = rcx;
    this.input = Math.max(0, Math.min(2, input));
  }

  async type(typeNo) {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored sensor.type(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    return this.rcx.rcxCmd(Uint8Array.from([0x32, this.input, typeNo & 0xFF]));
  }

  async mode(modeCode) {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored sensor.mode(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    return this.rcx.rcxCmd(Uint8Array.from([0x42, this.input, modeCode & 0xFF]));
  }

  async clear() {
    if (this.rcx.isTowerOnly) {
      console.warn(`[${this.rcx.name}] Ignored sensor.clear(): RCX brick is offline (Tower-Only mode).`);
      return;
    }
    return this.rcx.rcxCmd(Uint8Array.from([0xD1, this.input]));
  }
}

if (typeof window !== "undefined") {
  window.LegoRcx = LegoRcx;
  window.REMOTE_KEYS = REMOTE_KEYS;
}