// device/DeviceCCubes.js
// Circuit Cubes Bluetooth Battery Cube BLE Driver
// Architecture and design patterns aligned with DeviceLegoWeDo2.js and lego-blockly

export const CCUBES_SERVICE_NUS   = "6e400001-b5a3-f393-e0a9-e50e24dcca9e"; // Standard Nordic UART Service
export const CCUBES_CHAR_RX_WRITE = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // RX Write Characteristic
export const CCUBES_CHAR_TX_NOTIF = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // TX Notify Characteristic

// Alternative service UUIDs found on some Tenka hardware revisions
export const CCUBES_SERVICE_FFF0  = "0000fff0-0000-1000-8000-00805f9b34fb";
export const CCUBES_SERVICE_FFE0  = "0000ffe0-0000-1000-8000-00805f9b34fb";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CCubes {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.serviceNus = null;
    this.charRx = null;
    this.charTx = null;

    this.namePrefix = "CCubes";
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;

    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    this.portState = {
      a: null,
      b: null,
      c: null
    };

    this.lastNotification = "";
    this.rawTelemetry = [];

    this._onGattDisconnected = this._onGattDisconnected.bind(this);
    this._onTxNotification = this._onTxNotification.bind(this);
  }

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || this.namePrefix}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

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

  shouldSend(channel, power, force = false) {
    if (force) {
      this.portState[channel] = power;
      return true;
    }

    if (this.portState[channel] === power) {
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
    return "a";
  }

  _encodeCommand(channel, power) {
    const p = clamp(Math.round(power || 0), -255, 255);
    const direction = p < 0 ? "-" : "+";
    const magnitude = Math.abs(p);
    const speedStr = String(magnitude).padStart(3, "0");
    return `${direction}${speedStr}${channel}`;
  }

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

      await new Promise(r => setTimeout(r, 10));
    });
  }

  async connect() {
    this.setStatus("connecting", "Requesting Circuit Cubes...");
    this.log("Connecting to Circuit Cubes Bluetooth Battery Cube...");

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [CCUBES_SERVICE_NUS] },
          { namePrefix: "Tenka" },
          { namePrefix: "Circuit" }
        ],
        optionalServices: [
          CCUBES_SERVICE_NUS,
          CCUBES_SERVICE_FFF0,
          CCUBES_SERVICE_FFE0
        ]
      });
    } catch (err) {
      this.log("No Circuit Cubes device selected");
      this.setStatus("idle", "No device selected");
      throw err;
    }

    this.device = device;

    this.device.addEventListener("gattserverdisconnected", () => {
      this.log("GATT server disconnected — device lost.");
      this.manager?.handleDeviceLost?.(this);
      this.forceDisconnect().catch(() => {});
    });

    this.setStatus("connecting", "Connecting via BLE...");
    this.log(`Connecting to GATT server on ${device.name || "Circuit Cube"}...`);

    this.server = await device.gatt.connect();

    // Auto-detect service: Nordic NUS (6e40) -> FFF0 -> FFE0
    let foundService = null;
    let foundRx = null;
    let foundTx = null;

    try {
      foundService = await this.server.getPrimaryService(CCUBES_SERVICE_NUS);
      foundRx = await foundService.getCharacteristic(CCUBES_CHAR_RX_WRITE);
      foundTx = await foundService.getCharacteristic(CCUBES_CHAR_TX_NOTIF).catch(() => null);
      this.log("Connected via Nordic UART Service (NUS)");
    } catch (nusErr) {
      this.log("NUS 6e40 not found, trying FFF0 alternative service...");
      try {
        foundService = await this.server.getPrimaryService(CCUBES_SERVICE_FFF0);
        foundRx = await foundService.getCharacteristic("0000fff2-0000-1000-8000-00805f9b34fb")
          .catch(() => foundService.getCharacteristic("0000fff1-0000-1000-8000-00805f9b34fb"));
        foundTx = await foundService.getCharacteristic("0000fff1-0000-1000-8000-00805f9b34fb").catch(() => null);
        this.log("Connected via FFF0 UART Service");
      } catch (fffErr) {
        this.log("FFF0 not found, trying FFE0 alternative service...");
        foundService = await this.server.getPrimaryService(CCUBES_SERVICE_FFE0);
        foundRx = await foundService.getCharacteristic("0000ffe1-0000-1000-8000-00805f9b34fb");
        foundTx = foundRx;
        this.log("Connected via FFE0 UART Service");
      }
    }

    this.serviceNus = foundService;
    this.charRx = foundRx;
    this.charTx = foundTx;

    if (this.charTx && this.charTx.startNotifications) {
      try {
        await this.charTx.startNotifications();
        this.charTx.addEventListener("characteristicvaluechanged", this._onTxNotification);
      } catch (_) {}
    }

    if (!this.name) {
      this.name = this.manager._allocateName(this.namePrefix);
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

      try {
        await this.motorStopAll();
      } catch (_) {}

      if (this.charTx) {
        this.charTx.removeEventListener("characteristicvaluechanged", this._onTxNotification);
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

      if (this.device && this.device.gatt && this.device.gatt.connected) {
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

  async motorPower(channel = "a", power = 100, force = false) {
    const ch = this._normalizeChannel(channel);

    if (ch === "all") {
      await this.motorPower("a", power, force);
      await this.motorPower("b", power, force);
      await this.motorPower("c", power, force);
      return;
    }

    const p = clamp(Math.round(Number(power) || 0), -255, 255);

    if (!this.shouldSend(ch, p, force)) {
      return;
    }

    const cmd = this._encodeCommand(ch, p);
    await this._writeString(cmd);
  }

  async motorStop(channel = "a") {
    await this.motorPower(channel, 0, true);
  }

  async motorStopAll() {
    await this.motorPower("a", 0, true);
    await this.motorPower("b", 0, true);
    await this.motorPower("c", 0, true);
  }

  async motorTime(channel = "a", power = 100, durationMs = 1000) {
    await this.motorPower(channel, power, true);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.motorStop(channel);
  }

  getMotorPower(channel = "a") {
    const ch = this._normalizeChannel(channel);
    return this.portState[ch] ?? 0;
  }
}