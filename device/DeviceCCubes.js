// DeviceCCubes.js
// Circuit Cubes Bluetooth Battery Cube BLE Driver
// Architecture and design patterns aligned with DeviceLegoWeDo2.js and lego-blockly device system

// ---------------- Nordic UART Service (NUS) UUIDs ----------------
export const CCUBES_SERVICE_NUS   = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"; // Nordic UART Service
export const CCUBES_CHAR_RX_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // RX Characteristic (Write command to Cube)
export const CCUBES_CHAR_TX_NOTIF = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // TX Characteristic (Notifications from Cube)

// Helper: clamp numeric value
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CCubes {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    // Web Bluetooth GATT handles
    this.device = null;
    this.server = null;
    this.serviceNus = null;
    this.charRx = null;
    this.charTx = null;

    // Device identity and status
    this.namePrefix = "CCubes"; // Manager allocates CCubes1, CCubes2, CCubes3, etc.
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;

    // Command queue
    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    // Cache of last commanded motor states to avoid flooding BLE during Blockly loops
    // Circuit Cubes outputs: 'a', 'b', 'c'
    this.portState = {
      a: null,
      b: null,
      c: null
    };

    // Telemetry received from cube
    this.lastNotification = "";
    this.rawTelemetry = [];

    // Bind event handlers
    this._onGattDisconnected = this._onGattDisconnected.bind(this);
    this._onTxNotification = this._onTxNotification.bind(this);
  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || this.namePrefix}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  // ---------------- Command Queueing ----------------

  enqueueCommand(fn) {
    if (!this.queueActive) {
      return Promise.resolve();
    }

    this.commandQueue = this.commandQueue
      .then(async () => {
        await fn();
      })
      .catch(err => {
        this.log("Queue command error: " + (err?.message || err));
      });

    return this.commandQueue;
  }

  // ---------------- Loop Optimization / Cache Helper ----------------
  // Avoids sending redundant BLE packets when called repeatedly in Blockly loops
  shouldSend(channel, power, force = false) {
    if (force) {
      this.portState[channel] = power;
      return true;
    }

    if (this.portState[channel] === power) {
      // Unchanged value; suppress transmission
      return false;
    }

    this.portState[channel] = power;
    return true;
  }

  resetPortStates() {
    this.portState = {
      a: null,
      b: null,
      c: null
    };
  }

  // ---------------- Channel / Port Normalization ----------------
  // Accepts 'A', 'B', 'C', 'a', 'b', 'c', 1, 2, 3, or 0
  _normalizeChannel(channel) {
    if (typeof channel === "string") {
      const s = channel.trim().toLowerCase();
      if (s === "a" || s === "1") return "a";
      if (s === "b" || s === "2") return "b";
      if (s === "c" || s === "3") return "c";
      if (s === "all" || s === "*") return "all";
    } else if (typeof channel === "number") {
      if (channel === 1) return "a";
      if (channel === 2) return "b";
      if (channel === 3) return "c";
      if (channel === 0) return "a";
    }
    return "a"; // Default fallback
  }

  // ---------------- Protocol Encoding ----------------
  // Format: dNNNc
  // d: direction '+' or '-'
  // NNN: speed 000..255 (3 digits with leading zeroes)
  // c: channel 'a', 'b', or 'c'
  _encodeCommand(channel, power) {
    const p = clamp(Math.round(power || 0), -255, 255);
    const direction = p < 0 ? "-" : "+";
    const magnitude = Math.abs(p);
    const speedStr = String(magnitude).padStart(3, "0");
    return `${direction}${speedStr}${channel}`;
  }

  // ---------------- Low-level BLE Write ----------------
  async _writeString(cmdString) {
    return this.enqueueCommand(async () => {
      if (!this.charRx) {
        throw new Error("RX characteristic not available");
      }

      const encoder = new TextEncoder();
      const bytes = encoder.encode(cmdString);

      if (this.charRx.writeValueWithoutResponse) {
        await this.charRx.writeValueWithoutResponse(bytes);
      } else {
        await this.charRx.writeValue(bytes);
      }

      // Small hardware pacing guard for Circuit Cubes UART queue
      await new Promise(r => setTimeout(r, 12));
    });
  }

  // ---------------- Connection Lifecycle ----------------

  async connect() {
    this.setStatus("connecting", "Requesting Circuit Cubes...");
    this.log("Connecting to Circuit Cubes Bluetooth Battery Cube...");

    if (!navigator.bluetooth) {
      const err = new Error("Web Bluetooth API is not available on this browser.");
      this.log(err.message);
      this.setStatus("idle", "Bluetooth not supported");
      throw err;
    }

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [CCUBES_SERVICE_NUS] },
          { namePrefix: "Tenka" },
          { namePrefix: "Circuit" },
          { namePrefix: "CC" }
        ],
        optionalServices: [CCUBES_SERVICE_NUS]
      });
    } catch (err) {
      this.log("No Circuit Cubes device selected");
      this.setStatus("idle", "No device selected");
      throw err;
    }

    this.device = device;

    // Lost-device detection handler
    this.device.addEventListener("gattserverdisconnected", this._onGattDisconnected);

    this.setStatus("connecting", "Connecting via BLE...");
    this.log(`Connecting to GATT server on ${device.name || "Circuit Cube"}...`);

    // Connect GATT server
    this.server = await device.gatt.connect();

    // Discover Nordic UART Service
    this.serviceNus = await this.server.getPrimaryService(CCUBES_SERVICE_NUS);

    // Discover RX Characteristic (device write command)
    this.charRx = await this.serviceNus.getCharacteristic(CCUBES_CHAR_RX_WRITE);

    // Discover TX Characteristic (device notifications, if supported)
    try {
      this.charTx = await this.serviceNus.getCharacteristic(CCUBES_CHAR_TX_NOTIF);
      if (this.charTx) {
        await this.charTx.startNotifications();
        this.charTx.addEventListener("characteristicvaluechanged", this._onTxNotification);
      }
    } catch (notifErr) {
      this.log("TX notifications not available or optional: " + (notifErr?.message || notifErr));
    }

    // Allocate Name via DeviceManager (CCubes1, CCubes2, etc.)
    if (!this.name) {
      this.name = this.manager?._allocateName ? this.manager._allocateName(this.namePrefix) : "CCubes1";
    }

    this.isConnected = true;
    this.queueActive = true;
    this.resetPortStates();

    this.log(`Connected as ${this.name}`);
    this.setStatus("connected", "Connected");
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new Event("serial-connected"));
  }

  async disconnect() {
    try {
      this.queueActive = false;

      // Stop motors cleanly before disconnect
      try {
        await this.motorStopAll();
      } catch (_) {}

      if (this.charTx) {
        this.charTx.removeEventListener("characteristicvaluechanged", this._onTxNotification);
      }

      if (this.device) {
        this.device.removeEventListener("gattserverdisconnected", this._onGattDisconnected);
      }

      if (this.server && this.server.connected) {
        await this.server.disconnect();
      }

      this.isConnected = false;
      this.setStatus("disconnected", "Disconnected");
      this.log("Disconnected cleanly.");
    } catch (err) {
      this.log("Disconnect error: " + (err?.message || err));
    }
  }

  async forceDisconnect() {
    try {
      this.queueActive = false;

      if (this.charTx) {
        this.charTx.removeEventListener("characteristicvaluechanged", this._onTxNotification);
      }

      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }

      this.isConnected = false;
      this.setStatus("disconnected", "Force disconnected");
      this.log("Force disconnect executed.");
    } catch (err) {
      this.log("Force disconnect error: " + (err?.message || err));
    }
  }

  _onGattDisconnected() {
    this.isConnected = false;
    this.queueActive = false;
    this.setStatus("disconnected", "GATT disconnected");
    this.log("GATT server disconnected — device lost.");
    this.manager?.handleDeviceLost?.(this);
  }

  _onTxNotification(event) {
    const value = event.target.value;
    let str = "";
    for (let i = 0; i < value.byteLength; i++) {
      str += String.fromCharCode(value.getUint8(i));
    }
    this.lastNotification = str;
    this.rawTelemetry.push({ time: Date.now(), data: str });
    if (this.rawTelemetry.length > 20) this.rawTelemetry.shift();
  }

  // ---------------- Motor Control API for Blockly ----------------

  /**
   * Set motor power for a specific channel (A, B, C)
   * @param {string|number} channel Port/Channel ('A', 'B', 'C', 1, 2, 3, or 'all')
   * @param {number} power Speed value (-255 to 255; negative for reverse, positive for forward, 0 to stop)
   * @param {boolean} force If true, bypasses loop command de-duplication cache
   */
  async motorPower(channel = "a", power = 100, force = false) {
    const ch = this._normalizeChannel(channel);

    if (ch === "all") {
      await this.motorPower("a", power, force);
      await this.motorPower("b", power, force);
      await this.motorPower("c", power, force);
      return;
    }

    const p = clamp(Math.round(Number(power) || 0), -255, 255);

    // Suppress redundant command if power hasn't changed inside a Blockly loop
    if (!this.shouldSend(ch, p, force)) {
      return;
    }

    const cmd = this._encodeCommand(ch, p);
    await this._writeString(cmd);
  }

  /**
   * Stop a single motor channel
   * @param {string|number} channel Channel ('A', 'B', 'C', 1, 2, 3)
   */
  async motorStop(channel = "a") {
    await this.motorPower(channel, 0, true);
  }

  /**
   * Stop all 3 motor outputs on the Circuit Cube
   */
  async motorStopAll() {
    await this.motorPower("a", 0, true);
    await this.motorPower("b", 0, true);
    await this.motorPower("c", 0, true);
  }

  /**
   * Run motor for a specified duration in milliseconds, then stop
   * @param {string|number} channel Port ('A', 'B', 'C', 1, 2, 3)
   * @param {number} power Speed (-255 to 255)
   * @param {number} durationMs Duration in ms
   */
  async motorTime(channel = "a", power = 100, durationMs = 1000) {
    await this.motorPower(channel, power, true);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.motorStop(channel);
  }

  /**
   * Get currently commanded power for a port
   * @param {string|number} channel
   * @returns {number}
   */
  getMotorPower(channel = "a") {
    const ch = this._normalizeChannel(channel);
    return this.portState[ch] ?? 0;
  }
}