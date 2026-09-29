// device/DeviceCCubesESP32.js
// Circuit Cubes ESP32 Serial-to-BLE Bridge Driver
// Architecture aligned with DeviceLegoWeDo2.js, DeviceCCubes.js and lego-blockly

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class CCubesESP32 {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    // Web Serial Handles
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.readLoopActive = false;

    // Device identity and naming
    this.namePrefix = "Cubesp"; // Manager allocates Cubesp1, Cubesp2, etc.
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;

    // Command queue for outbound serial transmissions
    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    // Cache of port powers per cube to suppress redundant serial writes during Blockly loops
    this.cubePortState = {
      1: { a: null, b: null, c: null },
      2: { a: null, b: null, c: null }
    };

    // Sub-cube BLE connection statuses
    this.cubes = {
      1: { isConnected: false, mac: "", name: "Cube 1" },
      2: { isConnected: false, mac: "", name: "Cube 2" }
    };

    // Active BLE scan state & resolvers
    this._scanActive = false;
    this._discoveredCubes = [];
    this._scanResolve = null;

    // Active ASSIGN pending resolvers
    this._assignResolvers = {
      1: null,
      2: null
    };

    this._handleIncomingLine = this._handleIncomingLine.bind(this);
    this._onSerialDisconnect = this._onSerialDisconnect.bind(this);
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
    const num = Number(cube);
    if (num === 2) return 2;
    return 1;
  }

  shouldSend(cubeIdx, channel, power, force = false) {
    if (!this.cubePortState[cubeIdx]) {
      this.cubePortState[cubeIdx] = { a: null, b: null, c: null };
    }

    if (force) {
      this.cubePortState[cubeIdx][channel] = power;
      return true;
    }

    if (this.cubePortState[cubeIdx][channel] === power) {
      return false;
    }

    this.cubePortState[cubeIdx][channel] = power;
    return true;
  }

  async writeLine(line) {
    return this.enqueueCommand(async () => {
      if (!this.writer) {
        throw new Error("Serial writer not available");
      }
      const data = line.endsWith("\n") ? line : line + "\n";
      await this.writer.write(data);
    });
  }

  async _startReadLoop() {
    this.readLoopActive = true;
    let lineBuffer = "";

    try {
      while (this.readLoopActive && this.port && this.port.readable) {
        const textDecoder = new TextDecoderStream();
        this.readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            lineBuffer += value;
            const lines = lineBuffer.split("\n");
            lineBuffer = lines.pop();

            for (const rawLine of lines) {
              const line = rawLine.trim();
              if (line.length > 0) {
                this._handleIncomingLine(line);
              }
            }
          }
        }
      }
    } catch (err) {
      if (this.readLoopActive) {
        this.log("Serial read error: " + (err?.message || err));
      }
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch (_) {}
      }
    }
  }

  _handleIncomingLine(line) {
    if (line.startsWith("PONG")) {
      this.log("Bridge Handshake: " + line);
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

        const exists = this._discoveredCubes.some(c => c.mac === mac);
        if (!exists) {
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
          this.log(`Cube #${cubeNum} CONNECTED to ${mac}`);
          window.logStatus?.(`Cube #${cubeNum} connected (${mac})`);

          if (this._assignResolvers[cubeNum]) {
            this._assignResolvers[cubeNum].resolve({ success: true, cube: cubeNum, mac });
            this._assignResolvers[cubeNum] = null;
          }
        } else if (state === "DISCONNECTED") {
          this.cubes[cubeNum].isConnected = false;
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
    this.setStatus("connecting", "Requesting ESP32 Serial Port...");
    this.log("Opening USB Serial connection to ESP32 Bridge...");

    if (!navigator.serial) {
      const err = new Error("Web Serial API is not supported in this browser. Please use Chrome or Edge on Windows.");
      this.log(err.message);
      this.setStatus("idle", "Web Serial not supported");
      throw err;
    }

    let port;
    try {
      port = await navigator.serial.requestPort();
    } catch (err) {
      this.log("No serial port selected");
      this.setStatus("idle", "No port selected");
      throw err;
    }

    this.port = port;
    navigator.serial.addEventListener("disconnect", this._onSerialDisconnect);

    try {
      await this.port.open({ baudRate: 115200 });
    } catch (openErr) {
      this.log("Failed to open serial port: " + openErr.message);
      this.setStatus("idle", "Port open failed");
      throw openErr;
    }

    const textEncoder = new TextEncoderStream();
    this.writableStreamClosed = textEncoder.readable.pipeTo(this.port.writable);
    this.writer = textEncoder.writable.getWriter();

    this._startReadLoop();

    if (!this.name) {
      this.name = this.manager._allocateName(this.namePrefix);
    }

    this.isConnected = true;
    this.queueActive = true;

    await this.writeLine("PING");
    await this.writeLine("STATUS");

    this.log(`Connected as ${this.name} via USB Serial at 115200 baud`);
    this.setStatus("connected", "Bridge Connected");
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new Event("serial-connected"));
  }

  async disconnect() {
    try {
      this.queueActive = false;
      this.readLoopActive = false;

      try {
        if (this.writer) {
          await this.writer.write("STOP_ALL\n");
        }
      } catch (_) {}

      navigator.serial?.removeEventListener("disconnect", this._onSerialDisconnect);

      if (this.reader) {
        await this.reader.cancel().catch(() => {});
        this.reader = null;
      }

      if (this.writer) {
        await this.writer.close().catch(() => {});
        this.writer = null;
      }

      if (this.readableStreamClosed) await this.readableStreamClosed.catch(() => {});
      if (this.writableStreamClosed) await this.writableStreamClosed.catch(() => {});

      if (this.port) {
        await this.port.close().catch(() => {});
        this.port = null;
      }

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
    this.readLoopActive = false;
    this.queueActive = false;

    try {
      if (this.reader) await this.reader.cancel().catch(() => {});
      if (this.writer) await this.writer.close().catch(() => {});
      if (this.port) await this.port.close().catch(() => {});
    } catch (_) {}

    this.isConnected = false;
    this.setStatus("disconnected", "Force disconnected");
    this.log("Force disconnect executed.");
  }

  _onSerialDisconnect(event) {
    if (event.port === this.port) {
      this.log("ESP32 USB cable was unplugged.");
      this.manager?.handleDeviceLost?.(this);
    }
  }

  async scan(durationSeconds = 4) {
    if (!this.isConnected) {
      throw new Error("ESP32 Bridge is not connected via USB.");
    }

    if (this._scanActive) {
      return [...this._discoveredCubes];
    }

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
      }, (durationSeconds + 2) * 1000);
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

    if (!mac || mac.length < 11) {
      throw new Error(`Invalid MAC address: "${macAddress}"`);
    }

    this.log(`Requesting bridge to connect Cube #${idx} to MAC ${mac}...`);

    const promise = new Promise((resolve, reject) => {
      this._assignResolvers[idx] = { resolve, reject };
      setTimeout(() => {
        if (this._assignResolvers[idx]) {
          this._assignResolvers[idx].reject(new Error(`Connection to ${mac} timed out.`));
          this._assignResolvers[idx] = null;
        }
      }, 12000);
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

    if (!this.shouldSend(idx, ch, p, force)) {
      return;
    }

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
