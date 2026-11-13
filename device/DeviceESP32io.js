// device/DeviceESP32io.js
// ESP32io: generic ESP32 I/O board (sketch SketchArduino/ESP32io/ESP32io.ino) over BLE.
// Transport: Nordic UART Service, one text command per line (protocol described at the top of the sketch).
//
//  - The program first tells the board what is wired on each GPIO (configXxx methods: switch, sensor, LED,
//    servo, H-bridge, encoder...). The board releases everything when the PC connects or disconnects.
//  - Input values (DIN, AIN, ENC) are pushed by the board when they change and kept here: getters are instant.
//  - Outputs are sent without waiting for a reply (the board only answers errors); setup commands wait for OK.
//  - A port is named by its first pin: an encoder on 18+19 is port 18, an L298N on EN 25 / IN 26, 27 is port 25.
//
// console access: window.deviceManager.devices[0]   (set dev.debug = true to see every line sent/received)

export const ESP32IO_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";   // we write here (board's RX)
const TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";   // board notifies here (board's TX)

// Advertised manufacturer data: company 0xFFFF (Bluetooth SIG test ID) + "LBio"
const ESP32IO_MARKER = { companyIdentifier: 0xFFFF, dataPrefix: new Uint8Array([0x4C, 0x42, 0x69, 0x6F]) };

const ESP32IO = {
  fwName: "ESP32io",
  requestTimeoutMs: 2000,
  chunk: 20,                 // write size that fits the default BLE MTU
  nameMaxLen: 20,
  adcMax: 4095,
  adcVolts: 3.3
};

// Digital input presets (value 1 = pressed / beam blocked / surface seen)
export const ESP32IO_PRESETS = {
  digital:    { pull: "NONE", active: "HIGH", debounce: 10 },
  switch_no:  { pull: "UP",   active: "LOW",  debounce: 20 },   // contact between the pin and GND, open at rest
  switch_nc:  { pull: "UP",   active: "HIGH", debounce: 20 },   // contact between the pin and GND, closed at rest
  ir_barrier: { pull: "NONE", active: "HIGH", debounce: 2 },    // slotted opto module (LM393): HIGH when the beam is blocked
  tcrt5000:   { pull: "NONE", active: "LOW",  debounce: 2 }     // TCRT5000 module D0: LOW when it sees a reflecting surface
};

// H-bridge boards: HB2 = two PWM inputs, HB3 = enable (PWM) + two direction pins
export const ESP32IO_HBRIDGES = {
  DRV8833: "HB2", MX1508: "HB2", L9110S: "HB2", "ZK-5AD": "HB2",   // ZK-5AD: TA6586 chips
  L298N: "HB3", L293D: "HB3", TB6612: "HB3"
};

const ENC_MULT = { X1: 1, X2: 2, X4: 4 };

// Same format as the CAPS reply. Used for dropdowns before a board is connected.
export const ESP32IO_CAPS_WROOM32 =
  "4:IOP 13:IOP 14:IOP 16:IOP 17:IOP 18:IOP 19:IOP 21:IOP 22:IOP 23:IOP 25:IODP 26:IODP 27:IOP " +
  "32:IOAP 33:IOAP 34:IA 35:IA 36:IA 39:IA PWM=16 ENC=8";

/** "4:IOP ... PWM=16 ENC=8" -> { pins: { 4: "IOP", ... }, pwm: 16, enc: 8 } */
export function parseESP32ioCaps(text) {
  const caps = { pins: {}, pwm: 0, enc: 0 };
  for (const tok of String(text).trim().split(/\s+/)) {
    let m;
    if ((m = /^(\d+):([A-Z]+)$/.exec(tok))) caps.pins[Number(m[1])] = m[2];
    else if ((m = /^PWM=(\d+)$/.exec(tok))) caps.pwm = Number(m[1]);
    else if ((m = /^ENC=(\d+)$/.exec(tok))) caps.enc = Number(m[1]);
  }
  return caps;
}

// Device Manager name from the BLE name (same rules as the SPIKE driver)
function esp32ioBaseName(bleName, fallback) {
  let n = String(bleName ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!n) return fallback;
  if (/^\d/.test(n)) n = "E" + n;
  n = n.slice(0, 12);
  if (/\d$/.test(n)) n += "_";
  return n;
}

/** 25, "25", "GPIO25", "IO25" -> 25 */
function pinNum(pin) {
  const m = /(\d+)\s*$/.exec(String(pin ?? ""));
  if (!m) throw new Error(`ESP32io: bad pin "${pin}"`);
  return Number(m[1]);
}

const _sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round2 = v => Math.round(v * 100) / 100;

export class ESP32io {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.service = null;
    this.rx = null;
    this.tx = null;

    this.namePrefix = ESP32IO.fwName;
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;
    this.isWireless = true;
    this.debug = false;

    this.info = null;          // { fw, version, board, mac }
    this.caps = null;          // parseESP32ioCaps()
    this.hubName = null;       // BLE name reported by the board

    this.ports = {};           // first pin -> { type, ... } as configured by this driver
    this.values = {};          // first pin -> last input value pushed by the board
    this._lastSet = {};        // first pin -> last output value sent

    this.queueActive = true;
    this._queue = Promise.resolve();
    this._pending = new Map(); // request id -> { resolve, reject, timer, cmd }
    this._nextId = 1;
    this._rxBuf = "";
    this._dec = new TextDecoder();
    this._keepAlive = null;
    this._connecting = false;

    this._onNotify = this._onNotify.bind(this);
    this._onGattDisc = this._onGattDisc.bind(this);
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

  // ---------------- Connection ----------------
  async connect() {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth API is not supported in this browser.");
    this.setStatus("connecting", "Requesting ESP32io via Bluetooth...");

    const device = await navigator.bluetooth.requestDevice({
      filters: [
        { manufacturerData: [ESP32IO_MARKER] },
        { namePrefix: ESP32IO.fwName }
      ],
      optionalServices: [ESP32IO_SERVICE_UUID]
    });
    this.device = device;
    this._connecting = true;
    device.removeEventListener("gattserverdisconnected", this._onGattDisc);
    device.addEventListener("gattserverdisconnected", this._onGattDisc);

    try {
      this.setStatus("connecting", "Connecting via BLE...");
      this.log(`Connecting to GATT server on ${device.name || "ESP32io"}...`);
      this.server = await device.gatt.connect();
      this.service = await this.server.getPrimaryService(ESP32IO_SERVICE_UUID);
      this.rx = await this.service.getCharacteristic(RX_UUID);
      this.tx = await this.service.getCharacteristic(TX_UUID);
      this.tx.removeEventListener("characteristicvaluechanged", this._onNotify);
      this.tx.addEventListener("characteristicvaluechanged", this._onNotify);
      await this.tx.startNotifications();
      this.queueActive = true;

      // "ESP32io <version> <board> <ble name> <mac>"
      const hello = (await this.request("HELLO")).split(" ");
      if (hello[0] !== ESP32IO.fwName) throw new Error(`Not an ESP32io board (HELLO: ${hello.join(" ")})`);
      this.info = { fw: hello[0], version: Number(hello[1]), board: hello[2], mac: hello[4] };
      this.hubName = hello[3] || null;
      this.caps = parseESP32ioCaps(await this.request("CAPS"));
      this._connecting = false;
    } catch (err) {
      this._connecting = false;
      this.log("Connection failed: " + (err?.message || err));
      this.setStatus("idle", "Connection failed");
      await this._teardown(false);
      throw err;
    }

    if (!this.name) this.name = this.manager._allocateName(esp32ioBaseName(this.hubName || device.name, this.namePrefix));
    this.isConnected = true;
    this.log(`Connected as ${this.name}: ${this.info.board}, firmware v${this.info.version}, MAC ${this.info.mac}`);
    this.setStatus("connected", "Connected");
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new CustomEvent("serial-ready", { detail: { device: this } }));
    document.dispatchEvent(new Event("serial-connected"));
  }

  async disconnect() {
    this.log("Disconnecting...");
    this.setStatus("disconnected", "Disconnecting...");
    // The board also releases everything when the link drops: this only makes the stop immediate
    if (this.rx) { try { await this.request("RESET", 1000); } catch {} }
    this.queueActive = false;
    try { await this._queue; } catch {}
    await this._teardown(true);
    this.setStatus("disconnected", "Disconnected");
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this._queue = Promise.resolve();
    await this._teardown(false);
    this.setStatus("disconnected", "Force disconnected");
  }

  // The Device Manager removes the device from its list (disconnectAll / handleDeviceLost): not done here
  async _teardown(clean) {
    for (const [, p] of this._pending) { clearTimeout(p.timer); p.reject(new Error("disconnected")); }
    this._pending.clear();
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
    this.isConnected = false;
    this.device?.removeEventListener("gattserverdisconnected", this._onGattDisc);
    try {
      if (this.tx) {
        this.tx.removeEventListener("characteristicvaluechanged", this._onNotify);
        try { await this.tx.stopNotifications(); } catch {}
      }
    } catch {}
    try { if (this.device?.gatt?.connected) this.device.gatt.disconnect(); }
    catch (e) { if (clean) this.log("BLE disconnect error: " + (e?.message || e)); }
    this.server = this.service = this.rx = this.tx = null;
    this.ports = {};
    this.values = {};
    this._lastSet = {};
    this._rxBuf = "";
  }

  _onGattDisc() {
    if (this._connecting) { this.log("GATT link dropped during connect."); return; }
    this.log("GATT server disconnected — device lost.");
    this.manager?.handleDeviceLost?.(this);
  }

  // ---------------- Transport ----------------
  _enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this._queue = this._queue.then(fn).catch(err => this.log("Queue error: " + (err?.message || err)));
    return this._queue;
  }

  _write(line) {
    return this._enqueue(async () => {
      if (!this.rx) throw new Error("not connected");
      if (this.debug) console.log(`[${this.name || this.namePrefix} TX] ${line}`);
      const bytes = new TextEncoder().encode(line + "\n");
      for (let off = 0; off < bytes.length; off += ESP32IO.chunk) {
        const part = bytes.slice(off, off + ESP32IO.chunk);
        if (this.rx.writeValueWithoutResponse) await this.rx.writeValueWithoutResponse(part);
        else await this.rx.writeValue(part);
      }
    });
  }

  /** Send a command and wait for its OK (resolves with the reply data) or ERR (rejects).
   *  onOk runs as soon as the OK line is read, before any line that follows it (await resumes later). */
  request(cmd, timeoutMs = ESP32IO.requestTimeoutMs, onOk = null) {
    if (!this.rx) return Promise.reject(new Error(`${this.name || this.namePrefix}: not connected`));
    const id = this._nextId;
    this._nextId = this._nextId >= 9999 ? 1 : this._nextId + 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`ESP32io: no reply to "${cmd}"`));
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, timer, cmd, onOk });
      this._write(`${id} ${cmd}`);
    });
  }

  /** Fire-and-forget: the board only answers if the command fails. */
  send(cmd) {
    if (!this.rx) throw new Error(`${this.name || this.namePrefix}: not connected`);
    return this._write(`0 ${cmd}`);
  }

  _onNotify(event) {
    const v = event.target.value;
    this._rxBuf += this._dec.decode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength), { stream: true });
    const lines = this._rxBuf.split("\n");
    this._rxBuf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (line) this._onLine(line);
    }
  }

  _onLine(line) {
    if (line.startsWith("V ")) {
      for (const pair of line.slice(2).split(" ")) {
        const eq = pair.indexOf("=");
        if (eq > 0) this.values[Number(pair.slice(0, eq))] = Number(pair.slice(eq + 1));
      }
      if (this.debug) console.log(`[${this.name || this.namePrefix} RX] ${line}`);
      return;
    }
    if (this.debug) console.log(`[${this.name || this.namePrefix} RX] ${line}`);
    if (line.startsWith("L ")) { this.log(line.slice(2)); return; }

    const m = /^(\d+) (OK|ERR)(?: (.*))?$/.exec(line);
    if (!m) { this.log("Unexpected: " + line); return; }
    const id = Number(m[1]);
    const data = m[3] ?? "";
    if (id === 0) { this.log("Error: " + data); console.warn(`[${this.name}] ${data}`); return; }
    const p = this._pending.get(id);
    if (!p) return;
    this._pending.delete(id);
    clearTimeout(p.timer);
    if (m[2] === "OK") { p.onOk?.(data); p.resolve(data); }
    else p.reject(new Error(`${this.name || this.namePrefix}: ${data}`));
  }

  // ---------------- Board ----------------
  /** Round-trip time over BLE. Example: await dev.ping(20) -> { min, avg, max } in ms */
  async ping(count = 10) {
    const times = [];
    for (let i = 0; i < count; i++) {
      if (window.stopRequested) break;
      const t0 = performance.now();
      await this.request("PING");
      times.push(performance.now() - t0);
    }
    const r = {
      min: Math.round(Math.min(...times)),
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      max: Math.round(Math.max(...times))
    };
    this.log(`Ping x${times.length}: min ${r.min} ms, avg ${r.avg} ms, max ${r.max} ms`);
    return r;
  }

  /** Rename the board (BLE name, 1-20 characters A-Z a-z 0-9 _ -). Visible the next time it advertises. */
  async setHubName(name) {
    const clean = String(name ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, ESP32IO.nameMaxLen);
    if (!clean) throw new Error("setHubName: name is empty");
    await this.request(`NAME ${clean}`);
    this.hubName = clean;
    this.log(`Board name set to "${clean}" (visible after the board advertises again: disconnect / reconnect)`);
    return clean;
  }

  /** Release every pin (outputs off). */
  async reset() {
    await this.request("RESET");
    this.ports = {};
    this.values = {};
    this._lastSet = {};
  }

  /** Minimum time between two value reports from the board (5-1000 ms, default 20). */
  async setReportRate(ms) {
    await this.request(`RATE ${Math.round(clamp(Number(ms) || 20, 5, 1000))}`);
  }

  /** The board stops all outputs if it hears nothing for `ms` (0 = off). The driver then sends a keep-alive. */
  async setWatchdog(ms) {
    ms = Math.round(clamp(Number(ms) || 0, 0, 60000));
    await this.request(`WDT ${ms}`);
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
    if (ms > 0) this._keepAlive = setInterval(() => { if (this.rx) this.send("PING").catch(() => {}); }, Math.max(100, Math.floor(ms / 3)));
  }

  /** Pins for a dropdown: [[label, "25"], ...]. need: "in", "out", "adc", "dac", "pull" or "" (any). */
  pinOptions(need = "") {
    const caps = this.caps || parseESP32ioCaps(ESP32IO_CAPS_WROOM32);
    const flag = { in: "I", out: "O", adc: "A", dac: "D", pull: "P" }[need] || "";
    const out = [];
    for (const [pin, f] of Object.entries(caps.pins)) {
      if (flag && !f.includes(flag)) continue;
      const notes = [];
      if (!f.includes("O")) notes.push("input only");
      if (f.includes("A")) notes.push("analog");
      if (f.includes("D")) notes.push("DAC");
      out.push([`GPIO${pin}${notes.length ? " (" + notes.join(", ") + ")" : ""}`, String(pin)]);
    }
    return out;
  }

  // ---------------- Setup (one call per wired device) ----------------
  async _cfg(pin, rest, port) {
    const p = pinNum(pin);
    // The board sends its lines in order: values read before the OK belong to the old setup
    // (e.g. the count left by the previous run), values after it are fresh
    await this.request(`CFG ${p} ${rest}`, undefined, () => {
      delete this.values[p];
      this.ports[p] = port;
    });
    delete this._lastSet[p];
    // Inputs: the board pushes the first value right after the OK
    if (["DIN", "AIN", "ENC"].includes(port.type)) {
      for (let i = 0; i < 40 && this.values[p] === undefined; i++) await _sleep(10);
    }
    return p;
  }

  /** Digital input. pull: "UP" | "DOWN" | "NONE", active: level that reads as 1 ("HIGH" | "LOW"), debounce in ms. */
  configDigitalIn(pin, { pull = "NONE", active = "HIGH", debounce = 10 } = {}) {
    pull = String(pull).toUpperCase();
    active = String(active).toUpperCase();
    return this._cfg(pin, `DIN ${pull} ${active} ${Math.round(debounce)}`, { type: "DIN", pull, active, debounce });
  }

  /** Digital input from a preset: "switch_no", "switch_nc", "ir_barrier", "tcrt5000", "digital" (see ESP32IO_PRESETS). */
  configInput(pin, preset = "digital") {
    const p = ESP32IO_PRESETS[String(preset).toLowerCase()];
    if (!p) throw new Error(`ESP32io: unknown input preset "${preset}"`);
    return this.configDigitalIn(pin, p);
  }

  /** Digital output (LED, relay, buzzer). invert: 1 drives the pin LOW (active-low relay boards). */
  configDigitalOut(pin, invert = false) {
    return this._cfg(pin, invert ? "DOUT INV" : "DOUT", { type: "DOUT", invert: !!invert });
  }

  /** PWM output 0-100 % (LED brightness...). */
  configPWM(pin, freq = 1000) {
    return this._cfg(pin, `PWM ${Math.round(freq)}`, { type: "PWM", freq });
  }

  /** Analog input 0-4095 (ADC1 pins only). delta: smallest change that is reported. */
  configAnalogIn(pin, delta = 16) {
    return this._cfg(pin, `AIN ${Math.round(clamp(delta, 1, 4095))}`, { type: "AIN", delta });
  }

  /** True analog output 0-100 % (ESP32 GPIO 25 and 26 only). */
  configDAC(pin) {
    return this._cfg(pin, "DAC", { type: "DAC" });
  }

  /** Hobby servo (SG90...). type 180: angle 0-180. type 360 (continuous): speed -100..100. Pulse range in us is optional. */
  configServo(pin, type = 180, minUs = null, maxUs = null) {
    const t = Number(type) === 360 ? 360 : 180;
    let rest = `SERVO ${t}`;
    if (minUs != null && maxUs != null) rest += ` ${Math.round(minUs)} ${Math.round(maxUs)}`;
    return this._cfg(pin, rest, { type: "SERVO", range: t });
  }

  /** H-bridge with two PWM inputs (DRV8833, MX1508, L9110S, ZK-5AD). Port = in1. */
  configHBridge2(in1, in2, freq = 20000) {
    return this._cfg(in1, `HB2 ${pinNum(in2)} ${Math.round(freq)}`, { type: "HB2", pins: [pinNum(in1), pinNum(in2)], freq });
  }

  /** H-bridge with enable (PWM) + two direction pins (L298N, L293D, TB6612). Port = en. */
  configHBridge3(en, in1, in2, freq = 1000) {
    return this._cfg(en, `HB3 ${pinNum(in1)} ${pinNum(in2)} ${Math.round(freq)}`, { type: "HB3", pins: [pinNum(en), pinNum(in1), pinNum(in2)], freq });
  }

  /** H-bridge by board name. L298N / L293D / TB6612: (en, in1, in2). DRV8833 / MX1508 / L9110S / ZK-5AD: (in1, in2). */
  configHBridge(board, a, b, c = null, freq = null) {
    const kind = ESP32IO_HBRIDGES[String(board).toUpperCase()];
    if (!kind) throw new Error(`ESP32io: unknown H-bridge "${board}" (${Object.keys(ESP32IO_HBRIDGES).join(", ")})`);
    if (kind === "HB2") return this.configHBridge2(a, b, freq ?? 20000);
    if (c == null) throw new Error(`ESP32io: ${board} needs 3 pins (EN, IN1, IN2)`);
    return this.configHBridge3(a, b, c, freq ?? 1000);
  }

  /** Quadrature encoder (rotary knob, N20 motor). ppr = pulses per motor turn, gear = gearbox ratio (100 for 1:100). */
  configEncoder(a, b, { mode = "X4", ppr = 7, gear = 1, pull = "UP", reverse = false } = {}) {
    mode = String(mode).toUpperCase();
    if (!ENC_MULT[mode]) throw new Error(`ESP32io: encoder mode X1, X2 or X4`);
    pull = String(pull).toUpperCase() === "NONE" ? "NONE" : "UP";
    return this._cfg(a, `ENC ${pinNum(b)} ${mode} ${pull}`,
      { type: "ENC", pins: [pinNum(a), pinNum(b)], mode, ppr: Number(ppr) || 7, gear: Number(gear) || 1, reverse: !!reverse });
  }

  /** Release one port (outputs go off). */
  async release(pin) {
    const p = pinNum(pin);
    await this.request(`REL ${p}`);
    delete this.ports[p];
    delete this.values[p];
    delete this._lastSet[p];
  }

  // ---------------- Outputs ----------------
  _port(pin, types) {
    const p = pinNum(pin);
    const port = this.ports[p];
    if (!port) throw new Error(`${this.name}: GPIO${p} is not configured (add its setup block first)`);
    if (types && !types.includes(port.type)) throw new Error(`${this.name}: GPIO${p} is set up as ${port.type}, not ${types.join(" / ")}`);
    return p;
  }

  _set(p, value) {
    const v = round2(value);
    if (this._lastSet[p] === v) return Promise.resolve();
    this._lastSet[p] = v;
    return this.send(`SET ${p} ${v}`);
  }

  digitalWrite(pin, on) { return this._set(this._port(pin, ["DOUT"]), on ? 1 : 0); }
  pwmWrite(pin, percent) { return this._set(this._port(pin, ["PWM"]), clamp(Number(percent) || 0, 0, 100)); }
  dacWrite(pin, percent) { return this._set(this._port(pin, ["DAC"]), clamp(Number(percent) || 0, 0, 100)); }
  servoAngle(pin, angle) { return this._set(this._servo(pin, 180), clamp(Number(angle) || 0, 0, 180)); }
  servoSpeed(pin, speed) { return this._set(this._servo(pin, 360), clamp(Number(speed) || 0, -100, 100)); }

  /** Servo port check: a 180 servo takes an angle, a 360 (continuous) servo a speed. */
  _servo(pin, range) {
    const p = this._port(pin, ["SERVO"]);
    if (this.ports[p].range !== range) {
      throw new Error(range === 180
        ? `${this.name}: GPIO${p} is a 360 (continuous) servo: use the "servo speed" block (-100..100)`
        : `${this.name}: GPIO${p} is a 180 servo: use the "servo angle" block (0..180)`);
    }
    return p;
  }

  /** H-bridge power -100..100 (same name as the LPF2 / SPIKE drivers). */
  motorPower(pin, power) { return this._set(this._port(pin, ["HB2", "HB3"]), clamp(Number(power) || 0, -100, 100)); }

  /** Stop one output. H-bridges coast, or brake when brake is true. */
  motorStop(pin, brake = false) {
    const p = this._port(pin);
    this._lastSet[p] = 0;
    return this.send(`STOP ${p} ${brake ? "BRAKE" : "COAST"}`);
  }

  /** Last value sent to an output. */
  getOutput(pin) { return this._lastSet[pinNum(pin)] ?? 0; }

  /** All outputs off (STOP button). Waits for the board to confirm. */
  async stopAllMotors(brake = false) {
    if (!this.rx) return;
    for (const p of Object.keys(this._lastSet)) this._lastSet[p] = 0;
    await this.request(brake ? "STOP BRAKE" : "STOP");
  }

  // ---------------- Inputs (instant: values pushed by the board) ----------------
  getValue(pin) { return this.values[this._port(pin, ["DIN", "AIN", "ENC"])] ?? null; }

  /** Digital input: true when active (pressed / beam blocked / surface seen). */
  getDigital(pin) { return this.values[this._port(pin, ["DIN"])] === 1; }

  /** Analog input: raw 0-4095. */
  getAnalog(pin) { return this.values[this._port(pin, ["AIN"])] ?? 0; }
  getAnalogPercent(pin) { return Math.round(this.getAnalog(pin) / ESP32IO.adcMax * 1000) / 10; }
  /** Approximate volts (the ESP32 ADC is not linear near 0 V and 3.3 V). */
  getAnalogVolts(pin) { return round2(this.getAnalog(pin) * ESP32IO.adcVolts / ESP32IO.adcMax); }

  _countsPerTurn(port) { return port.ppr * ENC_MULT[port.mode] * port.gear; }

  /** Encoder count. */
  getCount(pin) {
    const p = this._port(pin, ["ENC"]);
    const c = this.values[p] ?? 0;
    return this.ports[p].reverse ? -c : c;
  }

  /** Encoder position in degrees of the output shaft (same name as the LPF2 driver). */
  getRot(pin) {
    const p = this._port(pin, ["ENC"]);
    return Math.round(this.getCount(p) * 360 / this._countsPerTurn(this.ports[p]));
  }

  /** Encoder position in turns of the output shaft. */
  getRotations(pin) {
    const p = this._port(pin, ["ENC"]);
    return round2(this.getCount(p) / this._countsPerTurn(this.ports[p]));
  }

  /** Set the encoder count (default 0). */
  async resetCount(pin, preset = 0) {
    const p = this._port(pin, ["ENC"]);
    const raw = Math.round(Number(preset) || 0) * (this.ports[p].reverse ? -1 : 1);
    await this.request(`ZERO ${p} ${raw}`, undefined, () => { this.values[p] = raw; });
  }

  /** Set the encoder position in degrees (same name as the LPF2 driver). */
  resetPosition(pin, degrees = 0) {
    const p = this._port(pin, ["ENC"]);
    return this.resetCount(p, Math.round((Number(degrees) || 0) * this._countsPerTurn(this.ports[p]) / 360));
  }

  /** Wait until an input matches: a value, or a function (value) => boolean. timeoutMs 0 = no limit. Stops on STOP. */
  async waitFor(pin, target, timeoutMs = 0) {
    const p = this._port(pin, ["DIN", "AIN", "ENC"]);
    const test = typeof target === "function" ? target : v => v === Number(target);
    const t0 = performance.now();
    while (!test(this.values[p])) {
      if (window.stopRequested) return false;
      if (!this.isConnected) throw new Error("Device lost");
      if (timeoutMs > 0 && performance.now() - t0 > timeoutMs) return false;
      await _sleep(10);
    }
    return true;
  }
}
