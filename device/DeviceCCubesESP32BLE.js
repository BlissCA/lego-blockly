// device/DeviceCCubesESP32BLE.js
// Circuit Cubes ESP32 Wireless BLE Multi-Role Bridge Driver
// Connects PC to ESP32 wirelessly via Web Bluetooth, while ESP32 bridges to Circuit Cubes

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export class CCubesESP32BLE {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.service = null;
    this.charRx = null;
    this.charTx = null;

    this.namePrefix = "Cubesp";
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;
    this.isWireless = true;

    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    this.cubePortState = {
      1: { a: null, b: null, c: null },
      2: { a: null, b: null, c: null }
    };

    this.cubes = {
      1: { isConnected: false, mac: "", name: "Cube 1" },
      2: { isConnected: false, mac: "", name: "Cube 2" }
    };

    this._scanActive = false;
    this._discoveredCubes = [];
    this._scanResolve = null;

    this._assignResolvers = { 1: null, 2: null };
    this._incomingBuffer = "";

    this._handleNotification = this._handleNotification.bind(this);
    this._onGattDisconnect = this._onGattDisconnect.bind(this);
  }

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || this.namePrefix} (Wireless)] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  enqueueCommand(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.commandQueue = this.commandQueue.then(async () => {
      await fn();
    }).catch(err => {
      this.log("Queue error: " + (err?.message || err));
    });
    return this.commandQueue;
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

  _normalizeCubeIndex(cube) {
    return Number(cube) === 2 ? 2 : 1;
  }

  shouldSend(cubeIdx, channel, power, force = false) {
    if (!this.cubePortState[cubeIdx]) {
      this.cubePortState[cubeIdx] = { a: null, b: null, c: null };
    }
    if (force) {
      this.cubePortState[cubeIdx][channel] = power;
      return true;
    }
    if (this.cubePortState[cubeIdx][channel] === power) return false;
    this.cubePortState[cubeIdx][channel] = power;
    return true;
  }

  async writeLine(line) {
    return this.enqueueCommand(async () => {
      if (!this.charRx) throw new Error("Wireless bridge characteristic not available");
      const data = line.endsWith("\n") ? line : line + "\n";
      console.log(`[ESP32-BLE TX] ${line.trim()}`);
      const bytes = new TextEncoder().encode(data);
      const CHUNK_SIZE = 20;
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const chunk = bytes.slice(offset, offset + CHUNK_SIZE);
        if (this.charRx.writeValueWithoutResponse) {
          await this.charRx.writeValueWithoutResponse(chunk);
        } else {
          await this.charRx.writeValue(chunk);
        }
        if (offset + CHUNK_SIZE < bytes.length) {
          await new Promise(r => setTimeout(r, 15));
        }
      }
    });
  }

  _handleNotification(event) {
    const value = event.target.value;
    const text = new TextDecoder().decode(value);
    this._incomingBuffer += text;

    const lines = this._incomingBuffer.split("\n");
    this._incomingBuffer = lines.pop();

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.length > 0) {
        this._handleIncomingLine(line);
      }
    }
  }

  _handleIncomingLine(line) {
    if (line.startsWith("PONG")) {
      this.log("Wireless Bridge Handshake: " + line);
      return;
    }
    if (line.startsWith("LOG:")) {
      this.log(line.substring(4));
      return;
    }
    if (line.startsWith("FOUND:")) {
      const parts = line.substring(6).split(":");
      if (parts.length >= 3) {
        const mac = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]}:${parts[5]}`.toUpperCase();
        const name = parts[6] || "TenkaCube";
        const rssi = parseInt(parts[7] || "-60", 10);
        if (!this._discoveredCubes.some(c => c.mac === mac)) {
          const cubeItem = { mac, name, rssi };
          this._discoveredCubes.push(cubeItem);
          this.log(`Discovered Circuit Cube: ${name} (${mac}) RSSI: ${rssi} dBm`);
          window.dispatchEvent(new CustomEvent("cubesp-cube-found", { detail: cubeItem }));
        }
      }
      return;
    }
    if (line === "SCAN_DONE") {
      this._scanActive = false;
      this.log(`BLE Scan complete. Found ${this._discoveredCubes.length} Circuit Cube(s).`);
      if (this._scanResolve) {
        this._scanResolve([...this._discoveredCubes]);
        this._scanResolve = null;
      }
      window.dispatchEvent(new CustomEvent("cubesp-scan-done", { detail: this._discoveredCubes }));
      return;
    }
    if (line.startsWith("STATUS:")) {
      const parts = line.substring(7).split(":");
      const cubeNum = parseInt(parts[0], 10);
      const state = parts[1];
      const mac = parts.slice(2).join(":");

      if (cubeNum === 1 || cubeNum === 2) {
        if (state === "CONNECTED") {
          this.cubes[cubeNum].isConnected = true;
          this.cubes[cubeNum].mac = mac;
          this.cubePortState[cubeNum] = { a: null, b: null, c: null };
          this.log(`Cube #${cubeNum} CONNECTED to ${mac}`);
          window.logStatus?.(`Cube #${cubeNum} connected (${mac})`);
          if (this._assignResolvers[cubeNum]) {
            this._assignResolvers[cubeNum].resolve({ success: true, cube: cubeNum, mac });
            this._assignResolvers[cubeNum] = null;
          }
        } else if (state === "DISCONNECTED") {
          this.cubes[cubeNum].isConnected = false;
          this.cubePortState[cubeNum] = { a: null, b: null, c: null };
          this.log(`Cube #${cubeNum} disconnected.`);
          window.logStatus?.(`Cube #${cubeNum} disconnected`);
        } else if (state === "FAILED") {
          this.cubes[cubeNum].isConnected = false;
          this.log(`Cube #${cubeNum} connection FAILED.`);
          window.logStatus?.(`Cube #${cubeNum} connection failed`);
          if (this._assignResolvers[cubeNum]) {
            this._assignResolvers[cubeNum].reject(new Error(`Cube #${cubeNum} connection failed`));
            this._assignResolvers[cubeNum] = null;
          }
        }
        this.manager?.updateDeviceEntry?.(this);
        window.dispatchEvent(new CustomEvent("cubesp-status-changed", { detail: this.cubes }));
      }
      return;
    }
  }

  async connect() {
    this.setStatus("connecting", "Requesting ESP32 Wireless Bridge via Bluetooth...");
    if (!navigator.bluetooth) throw new Error("Web Bluetooth API is not supported in this browser.");

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: "CCubes_ESP32_Bridge" }, { namePrefix: "CCubes" }],
      optionalServices: [NUS_SERVICE_UUID]
    });

    this.device = device;
    this.device.addEventListener("gattserverdisconnected", this._onGattDisconnect);

    await this._openGatt();

    if (!this.name) this.name = this.manager._allocateName(this.namePrefix);
    this.queueActive = true;

    await this.writeLine("PING");
    await this.writeLine("STATUS");

    this.log(`Connected wirelessly to ${this.name} (${this.device.name})`);
    this.setStatus("connected", "Wireless Bridge Connected");
    window.logStatus?.(`Connected: ${this.name} (Wireless)`);
    document.dispatchEvent(new Event("serial-connected"));
  }

  // Opens GATT + notifications on this.device (used by connect() and by auto-reconnect)
  async _openGatt() {
    try { this.charTx?.removeEventListener("characteristicvaluechanged", this._handleNotification); } catch (_) {}
    this._incomingBuffer = "";
    this.server = await this.device.gatt.connect();
    this.service = await this.server.getPrimaryService(NUS_SERVICE_UUID);
    this.charRx = await this.service.getCharacteristic(NUS_CHAR_RX_UUID);
    this.charTx = await this.service.getCharacteristic(NUS_CHAR_TX_UUID);
    await this.charTx.startNotifications();
    this.charTx.addEventListener("characteristicvaluechanged", this._handleNotification);
    this.isConnected = true;
  }

  async disconnect() {
    try {
      this.queueActive = false;
      try { if (this.charRx) await this.writeLine("STOP_ALL"); } catch (_) {}
      if (this.charTx) {
        try {
          await this.charTx.stopNotifications();
          this.charTx.removeEventListener("characteristicvaluechanged", this._handleNotification);
        } catch (_) {}
      }
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
      this.isConnected = false;
      this.cubes[1].isConnected = false;
      this.cubes[2].isConnected = false;
      this.setStatus("disconnected", "Disconnected");
      this.log("Disconnected cleanly.");
    } catch (err) {
      this.log("Disconnect error: " + (err?.message || err));
    }
  }

  async forceDisconnect() {
    this.queueActive = false;
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); } catch (_) {}
    this.isConnected = false;
    this.setStatus("disconnected", "Force disconnected");
  }

  _onGattDisconnect() {
    this.log("ESP32 Wireless Bridge GATT connection lost.");
    this.isConnected = false;
    // queueActive is false after disconnect()/forceDisconnect(): that was deliberate
    if (!this.queueActive || this._reconnecting) return;
    this._reconnectBridge();
  }

  // The ESP32 keeps its Cube links alive and re-advertises, so just reconnect to it.
  async _reconnectBridge() {
    this._reconnecting = true;
    this.setStatus("connecting", "Bridge link lost, reconnecting...");
    this.commandQueue = Promise.resolve();
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (!this.queueActive) { this._reconnecting = false; return; }
      await new Promise(r => setTimeout(r, attempt === 1 ? 700 : 1500));
      try {
        this.log(`Reconnecting to bridge (attempt ${attempt}/6)...`);
        await this._openGatt();
        this._reconnecting = false;
        this.setStatus("connected", "Wireless Bridge Connected");
        this.log("Bridge reconnected.");
        await this.writeLine("STATUS");   // resync which Cubes are still connected
        return;
      } catch (err) {
        this.log("Reconnect failed: " + (err?.message || err));
      }
    }
    this._reconnecting = false;
    this.log("Could not reconnect to the bridge.");
    this.manager?.handleDeviceLost?.(this);
  }

  async scan(durationSeconds = 4) {
    if (!this.isConnected) throw new Error("Wireless bridge is not connected.");
    if (this._scanActive) return [...this._discoveredCubes];
    this._scanActive = true;
    this._discoveredCubes = [];

    const promise = new Promise((resolve) => {
      this._scanResolve = resolve;
      setTimeout(() => {
        if (this._scanResolve) {
          this._scanActive = false;
          this._scanResolve([...this._discoveredCubes]);
          this._scanResolve = null;
        }
      }, (durationSeconds + 3) * 1000);
    });

    await this.writeLine(`SCAN:${durationSeconds}`);
    return promise;
  }

  async scanForMacList(durationSeconds = 4) {
    const list = await this.scan(durationSeconds);
    return list.map(c => c.mac);
  }

  async assignCube(cubeIndex, macAddress) {
    const idx = this._normalizeCubeIndex(cubeIndex);
    const mac = String(macAddress || "").trim().toUpperCase();
    if (!mac || mac.length < 11) throw new Error(`Invalid MAC: "${macAddress}"`);

    if (this.cubes[idx]?.isConnected && this.cubes[idx]?.mac === mac) {
      this.log(`Cube #${idx} is already paired and connected to ${mac}.`);
      return { success: true, cube: idx, mac, alreadyConnected: true };
    }

    const promise = new Promise((resolve, reject) => {
      this._assignResolvers[idx] = { resolve, reject };
      setTimeout(() => {
        if (this._assignResolvers[idx]) {
          this._assignResolvers[idx].reject(new Error(`Connection to ${mac} timed out (Cube is off or out of range).`));
          this._assignResolvers[idx] = null;
        }
      }, 10000);
    });

    await this.writeLine(`ASSIGN:${idx}:${mac}`);
    return promise;
  }

  async disconnectCube(cubeIndex) {
    const idx = this._normalizeCubeIndex(cubeIndex);
    await this.writeLine(`DISCONNECT:${idx}`);
  }

  async motorPower(cubeIndex = 1, channel = "a", power = 100, force = false) {
    const idx = this._normalizeCubeIndex(cubeIndex);
    const ch  = this._normalizeChannel(channel);
    const p   = clamp(Math.round(Number(power) || 0), -255, 255);
    if (!this.shouldSend(idx, ch, p, force)) return;
    await this.writeLine(`MOTOR:${idx}:${ch}:${p}`);
  }

  async motorStop(cubeIndex = 1, channel = "a") {
    await this.motorPower(cubeIndex, channel, 0, true);
  }

  async motorStopAll(cubeIndex = 0) {
    if (cubeIndex === 0 || cubeIndex === "all") {
      this.cubePortState[1] = { a: 0, b: 0, c: 0 };
      this.cubePortState[2] = { a: 0, b: 0, c: 0 };
      await this.writeLine("STOP_ALL");
    } else {
      const idx = this._normalizeCubeIndex(cubeIndex);
      this.cubePortState[idx] = { a: 0, b: 0, c: 0 };
      await this.writeLine(`STOP:${idx}`);
    }
  }

  async motorTime(cubeIndex = 1, channel = "a", power = 100, durationMs = 1000) {
    await this.motorPower(cubeIndex, channel, power, true);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.motorStop(cubeIndex, channel);
  }

  getMotorPower(cubeIndex = 1, channel = "a") {
    const idx = this._normalizeCubeIndex(cubeIndex);
    const ch  = this._normalizeChannel(channel);
    return this.cubePortState[idx]?.[ch] ?? 0;
  }

  isCubeConnected(cubeIndex = 1) {
    const idx = this._normalizeCubeIndex(cubeIndex);
    return this.cubes[idx]?.isConnected ?? false;
  }
}
