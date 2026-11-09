// DeviceSpike3.js
// LEGO SPIKE Prime / Robot Inventor 88016 driver for Hub OS 3.x (SPIKE App 3 BLE protocol, GATT service fd02).
// Protocol reference: https://lego.github.io/spike-prime-docs/
//
// Same style as DeviceLegoLPF2.js (constructor(name, manager), connect(), disconnect(), async getters, motor* methods).
//
//  - Inputs (motors' position/speed/power, color, distance, force, IMU, battery) come from the hub's own
//    DeviceNotification stream: no program needed.
//  - Motor OUTPUT needs a small program on the hub: call  await dev.uploadMotorHelper()  once, then motorPower /
//    motorSpeed / motorAngle / motorTime / motorGoto / motorStop ... work through the message tunnel.
//  - Any other program can be uploaded (uploadProgram), started/stopped (startProgram/stopProgram) and talked to
//    (sendMessage / onTunnelMessage / waitForTunnelMessage).
//
// console access: window.deviceManager.devices[0]

import { SPIKE_MOTOR_HELPER_PY, SPIKE_MOTOR_HELPER_VERSION } from "./SpikeMotorHelper.js";

// ---------------- Constants (all from lego.github.io/spike-prime-docs) ----------------
export const SPIKE3_SERVICE_UUID = "0000fd02-0000-1000-8000-00805f9b34fb";
const RX_UUID = "0000fd02-0001-1000-8000-00805f9b34fb";   // we write here (hub's RX)
const TX_UUID = "0000fd02-0002-1000-8000-00805f9b34fb";   // hub notifies here (hub's TX)

const MSG = {
  INFO_REQ: 0x00, INFO_RES: 0x01,
  START_FILE_REQ: 0x0C, START_FILE_RES: 0x0D,
  CHUNK_REQ: 0x10, CHUNK_RES: 0x11,
  SET_NAME_REQ: 0x16, SET_NAME_RES: 0x17, GET_NAME_REQ: 0x18, GET_NAME_RES: 0x19,
  FLOW_REQ: 0x1E, FLOW_RES: 0x1F, FLOW_NOTIF: 0x20,
  CONSOLE: 0x21,
  NOTIF_REQ: 0x28, NOTIF_RES: 0x29,
  TUNNEL: 0x32, TUNNEL_ALT: 0x33,   // 0x33 is mentioned by community projects; the official docs only list 0x32 (accepted inbound for safety)
  DEVICE_NOTIF: 0x3C,
  CLEAR_SLOT_REQ: 0x46, CLEAR_SLOT_RES: 0x47
};

export const SPIKE3_STOP = { coast: 0, brake: 1, hold: 2, continue: 3, smartcoast: 4, smartbrake: 5, default: 0xFF };
export const SPIKE3_DIR = { cw: 0, clockwise: 0, ccw: 1, counterclockwise: 1, shortest: 2, longest: 3 };
const COLOR_NAMES = { 0: "black", 1: "magenta", 2: "purple", 3: "blue", 4: "azure", 5: "turquoise", 6: "green", 7: "yellow", 8: "orange", 9: "red", 10: "white", "-1": "none" };
// 0x30/0x31/0x41 are in LEGO's docs. 0x4B (LPF2 id 75) was seen on a Robot Inventor hub; both names come from the LPF2 device list, 0x4C is by analogy
const MOTOR_TYPES = { 0x30: "Medium Motor", 0x31: "Large Motor", 0x41: "Small Motor", 0x4B: "Medium Angular Motor", 0x4C: "Large Angular Motor" };

const SPIKE3 = {
  slots: 20,
  helperSlot: 19,            // slot used by uploadMotorHelper() (keeps slot 0 free for your own programs)
  startNameLayout: "nul",   // "nul" (name + 0x00, like the VS Code extension) or "fixed32" (LEGO docs)
  notifyIntervalMs: 50,      // DeviceNotification period requested after connecting
  requestTimeoutMs: 4000,
  helperReadyTimeoutMs: 8000,
  valueTimeoutMs: 1500,      // getters wait this long for the first value of a port
  attachedMs: 600,           // a port counts as "attached" if the hub reported it within this time
  settleMs: 1500,
  notifyAttempts: 4,
  debug: { traffic: false, tunnel: false }
};

const _sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- Framing: COBS (SPIKE variant) + XOR 3 + delimiter 2 ----------------
const COBS = { DELIM: 0x02, NO_DELIM: 0xFF, MAX_BLOCK: 84, OFFSET: 2, XOR: 0x03 };

export function cobsEncode(data) {
  const buf = [];
  let codeIndex = 0, block = 0;
  const begin = () => { codeIndex = buf.length; buf.push(COBS.NO_DELIM); block = 1; };
  begin();
  for (const byte of data) {
    if (byte > COBS.DELIM) { buf.push(byte); block++; }
    if (byte <= COBS.DELIM || block > COBS.MAX_BLOCK) {
      if (byte <= COBS.DELIM) buf[codeIndex] = byte * COBS.MAX_BLOCK + block + COBS.OFFSET;
      begin();
    }
  }
  buf[codeIndex] = block + COBS.OFFSET;
  return buf;
}

export function cobsDecode(data) {
  const out = [];
  const unescape = code => {
    if (code === 0xFF) return [null, COBS.MAX_BLOCK + 1];
    let value = Math.floor((code - COBS.OFFSET) / COBS.MAX_BLOCK);
    let block = (code - COBS.OFFSET) % COBS.MAX_BLOCK;
    if (block === 0) { block = COBS.MAX_BLOCK; value -= 1; }
    return [value, block];
  };
  if (!data.length) return new Uint8Array(0);
  let [value, block] = unescape(data[0]);
  for (let k = 1; k < data.length; k++) {
    const byte = data[k];
    block--;
    if (block > 0) { out.push(byte); continue; }
    if (value !== null) out.push(value);
    [value, block] = unescape(byte);
  }
  return Uint8Array.from(out);
}

/** message bytes -> frame (COBS, XOR 3, trailing 0x02) */
export function spikePack(data) {
  const enc = cobsEncode(data);
  const out = new Uint8Array(enc.length + 1);
  for (let i = 0; i < enc.length; i++) out[i] = enc[i] ^ COBS.XOR;
  out[enc.length] = COBS.DELIM;
  return out;
}

/** frame (optional leading 0x01, trailing 0x02) -> message bytes */
export function spikeUnpack(frame) {
  let start = 0, end = frame.length;
  if (frame[0] === 0x01) start = 1;
  if (end > start && frame[end - 1] === 0x02) end--;
  const x = new Uint8Array(end - start);
  for (let i = start; i < end; i++) x[i - start] = frame[i] ^ COBS.XOR;
  return cobsDecode(x);
}

// ---------------- CRC32 (standard CRC-32, seedable like zlib.crc32) ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes, seed = 0) {
  let c = (seed ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function spikeBaseName(bleName, fallback) {
  let n = String(bleName ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!n) return fallback;
  if (/^\d/.test(n)) n = "H" + n;
  n = n.slice(0, 12);
  if (/\d$/.test(n)) n += "_";
  return n;
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const hexOf = u8 => Array.from(u8, b => b.toString(16).padStart(2, "0")).join(" ");

// Smallest possible program that uses the tunnel: used by testTunnel() to tell "tunnel problem" from "helper problem".
// Program for probeProgram(): does things you can SEE and HEAR on the hub, so "did it run?" does not depend on notifications.
const PROBE_PY = `import time
print("probe: start")
try:
    from hub import light_matrix
    light_matrix.set_pixel(0, 0, 100)
    light_matrix.set_pixel(4, 4, 100)
    light_matrix.set_pixel(2, 2, 100)
    print("probe: matrix ok")
except Exception as e:
    print("probe: matrix err " + repr(e))
try:
    from hub import sound
    sound.beep(880, 400, 100)
    print("probe: beep ok")
except Exception as e:
    print("probe: beep err " + repr(e))
try:
    import hub
    tun = hub.config["module_tunnel"]
    tun.send(b"probe-tunnel")
    print("probe: tunnel ok")
except Exception as e:
    print("probe: tunnel err " + repr(e))
time.sleep(4)
print("probe: end")
`;

const TUNNEL_TEST_PY = `import hub
import time
print("mini start")
tun = hub.config["module_tunnel"]
def cb(d):
    tun.send(b"echo:" + bytes(d))
tun.callback(cb)
tun.send(b"mini-ready")
print("mini ready")
while True:
    time.sleep_ms(50)
`;

export class LegoSpike3 {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;
    this.namePrefix = "Spk3_";

    this.device = null; this.server = null; this.service = null; this.rx = null; this.tx = null;
    this.status = "idle"; this.statusMessage = "Idle";

    this.info = null;                 // InfoResponse
    this.hubName = null;
    this.userPortMap = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };

    // streamed state (DeviceNotification)
    this.battery = null;
    this.imu = null;
    this.matrix5x5 = null;
    this.motors = {};                 // port -> { deviceType, absPos, power, speed, pos }
    this.colors = {};                 // port -> { color, r, g, b }
    this.distances = {};              // port -> mm (-1 = nothing detected)
    this.forces = {};                 // port -> { value, pressed }
    this.matrices3x3 = {};
    this.portDevice = {};             // port -> "motor" | "color" | "distance" | "force" | "matrix3x3"
    this._seen = {};                  // port -> performance.now() of the last report
    this._waiters = [];

    // program / tunnel state
    this.runningSlot = null;
    this.programRunning = false;
    this.helperReady = false;
    this.helperVersion = null;
    this._seq = 0;
    this._calls = new Map();          // helper call id -> { done, resolve, reject, timer }
    this._tunnelListeners = new Set();
    this._consoleListeners = new Set();
    this._lastTunnel = null;

    // diagnostics
    this._rxTrace = [];               // last 60 messages from the hub other than DeviceNotification
    this._notifTap = null;
    this.parseWarnings = 0;           // DeviceNotifications whose layout did not match the documentation
    this._warnedLayout = false;

    // transport
    this._queue = Promise.resolve();
    this.queueActive = true;
    this._pending = {};               // response type -> [ { resolve, reject, timer } ]
    this._rxState = "lo"; this._lo = []; this._hi = [];
    this._notifyBound = this._onNotification.bind(this);
    this._connecting = false;
    this.ready = false;
  }

  // ---------------- Status + logging ----------------
  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }
  log(msg) {
    console.log(`[${this.name || this.namePrefix}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  // ---------------- Connect / disconnect ----------------
  async connect() {
    this.setStatus("connecting", "Requesting SPIKE hub...");
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({ filters: [{ services: [SPIKE3_SERVICE_UUID] }] });
    } catch (err) {
      this.log("No SPIKE hub selected");
      this.setStatus("idle", "No device selected");
      throw err;
    }
    this.device = device;
    this.queueActive = true; this._queue = Promise.resolve();
    this._rxState = "lo"; this._lo = []; this._hi = [];
    this._connecting = true;

    if (!this._onGattDisc) {
      this._onGattDisc = () => {
        if (this._connecting) { this.log("GATT link dropped during connect."); return; }
        this.log("GATT server disconnected — device lost.");
        this.manager?.handleDeviceLost?.(this);
        this.forceDisconnect().catch(() => {});
      };
    }
    device.removeEventListener("gattserverdisconnected", this._onGattDisc);
    device.addEventListener("gattserverdisconnected", this._onGattDisc);

    try {
      this.setStatus("connecting", "Connecting via BLE...");
      this.log(`Connecting to GATT server on ${device.name || "SPIKE hub"}...`);
      this.server = device.gatt.connected ? device.gatt : await device.gatt.connect();
      await _sleep(SPIKE3.settleMs);
      this.service = await this.server.getPrimaryService(SPIKE3_SERVICE_UUID);
      this.rx = await this.service.getCharacteristic(RX_UUID);
      this.tx = await this.service.getCharacteristic(TX_UUID);
      this.tx.removeEventListener("characteristicvaluechanged", this._notifyBound);
      this.tx.addEventListener("characteristicvaluechanged", this._notifyBound);
      let lastErr;
      for (let a = 1; a <= SPIKE3.notifyAttempts; a++) {
        try { await this.tx.startNotifications(); lastErr = null; break; }
        catch (e) { lastErr = e; this.log(`startNotifications ${a}/${SPIKE3.notifyAttempts}: ${e?.message || e}`); await _sleep(1000); }
      }
      if (lastErr) throw lastErr;
      this._connecting = false;
    } catch (err) {
      this._connecting = false;
      this.log("Connection failed: " + (err?.message || err));
      this.setStatus("idle", "Connection failed");
      try { if (device.gatt?.connected) device.gatt.disconnect(); } catch {}
      device.removeEventListener("gattserverdisconnected", this._onGattDisc);
      this.device = this.server = this.service = this.rx = this.tx = null;
      throw err;
    }

    // Handshake: InfoRequest first (gives the max packet / chunk sizes)
    try {
      this.info = await this.getInfo();
    } catch (err) {
      await this.forceDisconnect().catch(() => {});
      this.setStatus("idle", "Connection failed");
      throw new Error("The hub did not answer the InfoRequest: " + (err?.message || err));
    }
    this.log(`Hub OS ${this.info.fwMajor}.${this.info.fwMinor}.${this.info.fwBuild}, RPC ${this.info.rpcMajor}.${this.info.rpcMinor}.${this.info.rpcBuild}, ` +
             `max packet ${this.info.maxPacket}, max message ${this.info.maxMessage}, max chunk ${this.info.maxChunk}`);

    try { this.hubName = await this.getHubName(); } catch { this.hubName = null; }
    if (!this.name) this.name = this.manager._allocateName(spikeBaseName(this.hubName || this.device?.name, this.namePrefix));

    await this.setNotificationInterval(SPIKE3.notifyIntervalMs);
    this.ready = true;
    this.log(`Connected as ${this.name}`);
    this.setStatus("connected", "Connected");
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new CustomEvent("serial-ready", { detail: { device: this } }));
    document.dispatchEvent(new Event("serial-connected"));
  }

  async disconnect() {
    this.log("Disconnecting...");
    this.setStatus("disconnected", "Disconnecting...");
    if (this.helperReady && this.rx) { try { await this._helperSend("sa"); } catch {} }
    this.queueActive = false;
    try { await this._queue; } catch {}
    await this._teardown(true);
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this._queue = Promise.resolve();
    await this._teardown(false);
  }

  async _teardown(clean) {
    for (const list of Object.values(this._pending)) for (const p of list) { clearTimeout(p.timer); p.reject(new Error("disconnected")); }
    this._pending = {};
    for (const [, c] of this._calls) { clearTimeout(c.timer); c.reject(new Error("disconnected")); }
    this._calls.clear();
    this.helperReady = false; this.programRunning = false; this.ready = false;
    try { if (this.tx) { this.tx.removeEventListener("characteristicvaluechanged", this._notifyBound); try { await this.tx.stopNotifications(); } catch {} } } catch {}
    try { if (this.device?.gatt?.connected) await this.device.gatt.disconnect(); } catch (e) { if (clean) this.log("BLE disconnect error: " + (e?.message || e)); }
    if (this.name) { this.manager?._removeDevice?.(this); this.name = null; }
    this.device = this.server = this.service = this.rx = this.tx = null;
  }

  // ---------------- Transport ----------------
  _enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this._queue = this._queue.then(fn).catch(err => this.log("Queue error: " + (err?.message || err)));
    return this._queue;
  }

  /** Frame a message and write it in packets of at most the hub's max packet size. */
  _send(msg) {
    const frame = spikePack(msg);
    if (SPIKE3.debug.traffic) console.log("[SPIKE3] TX", Array.from(msg).map(b => b.toString(16).padStart(2, "0")).join(" "));
    return this._enqueue(async () => {
      if (!this.rx) return;
      const size = this.info?.maxPacket > 0 ? this.info.maxPacket : frame.length;
      for (let i = 0; i < frame.length; i += size) {
        const packet = frame.slice(i, i + size);
        if (this.rx.writeValueWithoutResponse) await this.rx.writeValueWithoutResponse(packet);
        else await this.rx.writeValue(packet);
      }
    });
  }

  /** Send a message and wait for the response with the given type. */
  _request(msg, resType, timeoutMs = SPIKE3.requestTimeoutMs) {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const list = this._pending[resType] || [];
        const i = list.indexOf(entry); if (i >= 0) list.splice(i, 1);
        reject(new Error(`No response (0x${resType.toString(16)}) from the hub within ${timeoutMs} ms`));
      }, timeoutMs);
      (this._pending[resType] ||= []).push(entry);
      this._send(msg).catch(e => { clearTimeout(entry.timer); reject(e); });
    });
  }

  _onNotification(event) {
    const bytes = new Uint8Array(event.target.value.buffer, event.target.value.byteOffset, event.target.value.byteLength);
    for (const b of bytes) {
      if (b === 0x01) {                          // start of a high-priority message
        if (this._rxState === "hi") { this._lo = []; this._hi = []; }   // sync error
        this._rxState = "hi"; this._hi = [];
      } else if (b === 0x02) {                   // end of the message in progress
        const q = this._rxState === "hi" ? this._hi : this._lo;
        if (q.length) this._onFrame(Uint8Array.from(q));
        if (this._rxState === "hi") this._hi = []; else this._lo = [];
        this._rxState = "lo";
      } else {
        (this._rxState === "hi" ? this._hi : this._lo).push(b);
      }
    }
  }

  _onFrame(frame) {
    let msg;
    try { msg = spikeUnpack(frame); } catch (e) { this.log("Bad frame: " + (e?.message || e)); return; }
    if (!msg.length) return;
    if (SPIKE3.debug.traffic && msg[0] !== MSG.DEVICE_NOTIF) console.log("[SPIKE3] RX", Array.from(msg).map(b => b.toString(16).padStart(2, "0")).join(" "));
    // never let an exception escape into the BLE event handler
    try { this._handleMessage(msg); }
    catch (e) { this.log(`Error while handling message 0x${msg[0].toString(16)}: ${e?.message || e}`); }
  }

  _trace(msg) {
    const t = msg[0];
    let what;
    if (t === MSG.CONSOLE) { let end = msg.indexOf(0, 1); if (end < 0) end = msg.length; what = "console: " + dec.decode(msg.slice(1, end)).trim(); }
    else if (t === MSG.TUNNEL || t === MSG.TUNNEL_ALT) what = "tunnel: " + dec.decode(msg.slice(3));
    else if (t === MSG.FLOW_NOTIF) what = "program " + (msg[1] === 0 ? "started" : "stopped");
    else what = "hex " + hexOf(msg.slice(0, 40));
    this._rxTrace.push({ t: Math.round(performance.now()), type: "0x" + t.toString(16), what });
    if (this._rxTrace.length > 60) this._rxTrace.shift();
  }
  /** Last messages received from the hub (console output, tunnel, program start/stop, responses). */
  getRxTrace() { return this._rxTrace.map(r => ({ ...r })); }

  /** Collect the first `count` raw DeviceNotification messages (hex) arriving within `ms`. Paste the result when a sensor is not recognised. */
  captureNotifications({ ms = 1500, count = 3 } = {}) {
    return new Promise(resolve => {
      const out = [];
      const timer = setTimeout(() => finish(), ms);
      const finish = () => { this._notifTap = null; clearTimeout(timer); resolve(out); };
      this._notifTap = msg => { out.push(hexOf(msg)); if (out.length >= count) finish(); };
    });
  }

  _handleMessage(msg) {
    const type = msg[0];
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    if (type !== MSG.DEVICE_NOTIF) this._trace(msg);
    switch (type) {
      case MSG.DEVICE_NOTIF:
        if (this._notifTap) this._notifTap(msg);
        this._parseDeviceNotification(msg); return;
      case MSG.TUNNEL: case MSG.TUNNEL_ALT: {
        const size = msg.length >= 3 ? dv.getUint16(1, true) : 0;
        this._onTunnel(msg.slice(3, 3 + size));
        return;
      }
      case MSG.CONSOLE: {
        let end = msg.indexOf(0, 1); if (end < 0) end = msg.length;
        const text = dec.decode(msg.slice(1, end));
        for (const cb of this._consoleListeners) { try { cb(text); } catch (e) { this.log("Console listener error: " + (e?.message || e)); } }
        this.log("[hub] " + text.replace(/\s+$/, ""));
        return;
      }
      case MSG.FLOW_NOTIF: {
        const action = msg[1];
        this.programRunning = action === 0;
        if (action !== 0) { this.helperReady = false; this._failCalls("the program on the hub stopped"); }
        this.log(`Program ${action === 0 ? "started" : "stopped"}`);
        return;
      }
      case MSG.INFO_RES: case MSG.START_FILE_RES: case MSG.CHUNK_RES: case MSG.FLOW_RES:
      case MSG.CLEAR_SLOT_RES: case MSG.NOTIF_RES: case MSG.GET_NAME_RES: case MSG.SET_NAME_RES: {
        const waiting = this._pending[type]?.shift();
        if (waiting) { clearTimeout(waiting.timer); waiting.resolve(msg); }
        return;
      }
      default: return;
    }
  }

  // ---------------- Hub info / name ----------------
  async getInfo() {
    const m = await this._request(new Uint8Array([MSG.INFO_REQ]), MSG.INFO_RES);
    const dv = new DataView(m.buffer, m.byteOffset, m.byteLength);
    return {
      rpcMajor: m[1], rpcMinor: m[2], rpcBuild: dv.getUint16(3, true),
      fwMajor: m[5], fwMinor: m[6], fwBuild: dv.getUint16(7, true),
      maxPacket: dv.getUint16(9, true), maxMessage: dv.getUint16(11, true), maxChunk: dv.getUint16(13, true),
      productGroup: dv.getUint16(15, true)
    };
  }

  async getHubName() {
    const m = await this._request(new Uint8Array([MSG.GET_NAME_REQ]), MSG.GET_NAME_RES);
    let end = m.indexOf(0, 1); if (end < 0) end = m.length;
    return dec.decode(m.slice(1, end));
  }

  /** Rename the hub (max 29 ASCII characters). */
  async setHubName(name) {
    const clean = String(name ?? "").replace(/[^\x20-\x7e]/g, "").slice(0, 29);
    if (!clean) throw new Error("setHubName: name is empty");
    const body = new Uint8Array(1 + 30); body[0] = MSG.SET_NAME_REQ; body.set(enc.encode(clean), 1);
    const r = await this._request(body, MSG.SET_NAME_RES);
    if (r[1] !== 0) throw new Error("The hub refused the new name");
    this.hubName = clean;
    return clean;
  }

  /** DeviceNotification period in ms (0 = off). */
  async setNotificationInterval(ms) {
    const m = new Uint8Array([MSG.NOTIF_REQ, ms & 0xFF, (ms >> 8) & 0xFF]);
    const r = await this._request(m, MSG.NOTIF_RES);
    if (r[1] !== 0) this.log("The hub refused the notification interval");
    return r[1] === 0;
  }

  // ---------------- Device notifications (inputs) ----------------
  _parseDeviceNotification(msg) {
    if (msg.length < 3) return;
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    const size = dv.getUint16(1, true);
    const end = Math.min(msg.length, 3 + size);
    const now = performance.now();
    let o = 3, aligned = true;
    const seen = (port, kind) => { this._seen[port] = now; this.portDevice[port] = kind; };
    // Sub-messages are not self-describing, so one wrong size misreads everything after it. Sizes follow LEGO's docs,
    // except the colour sensor: the docs say 9 bytes but Hub OS 1.8.149 sends 10 (an extra byte after the colour,
    // most likely the reflected-light value). Both are accepted; the length that lines up with the next message wins.
    const LENS = { 0x00: [2], 0x01: [21], 0x02: [26], 0x0A: [12], 0x0B: [4], 0x0C: [10, 9], 0x0D: [4], 0x0E: [11] };
    const headerOk = p => {
      const t = msg[p], l = LENS[t];
      if (!l || p + Math.min(...l) > end) return false;
      if (t >= 0x0A && msg[p + 1] > 5) return false;                          // port A..F
      if (t === 0x01 && (msg[p + 1] > 5 || msg[p + 2] > 5)) return false;     // hub faces
      if (t === 0x00 && msg[p + 1] > 100) return false;                       // battery %
      return true;
    };
    while (o < end) {
      if (!headerOk(o)) { aligned = false; break; }
      const t = msg[o];
      // only the colour message has two possible sizes and needs a look-ahead; the others are accepted as soon as they fit
      const cands = LENS[t];
      const len = cands.length === 1 ? (o + cands[0] <= end ? cands[0] : undefined)
                                     : cands.find(l => o + l <= end && (o + l === end || headerOk(o + l)));
      if (len === undefined) { aligned = false; break; }
      switch (t) {
        case 0x00: this.battery = msg[o + 1]; break;
        case 0x01:
          this.imu = {
            up: msg[o + 1], yawFace: msg[o + 2],
            yaw: dv.getInt16(o + 3, true), pitch: dv.getInt16(o + 5, true), roll: dv.getInt16(o + 7, true),
            acc: [dv.getInt16(o + 9, true), dv.getInt16(o + 11, true), dv.getInt16(o + 13, true)],
            gyro: [dv.getInt16(o + 15, true), dv.getInt16(o + 17, true), dv.getInt16(o + 19, true)]
          };
          break;
        case 0x02: this.matrix5x5 = Array.from(msg.slice(o + 1, o + 26)); break;
        case 0x0A: {
          const port = msg[o + 1];
          this.motors[port] = { deviceType: msg[o + 2], absPos: dv.getInt16(o + 3, true), power: dv.getInt16(o + 5, true), speed: dv.getInt8(o + 7), pos: dv.getInt32(o + 8, true) };
          seen(port, "motor"); break;
        }
        case 0x0B: { const port = msg[o + 1]; this.forces[port] = { value: msg[o + 2], pressed: msg[o + 3] === 1 }; seen(port, "force"); break; }
        case 0x0C: {
          const port = msg[o + 1];
          const k = len === 10 ? 1 : 0;      // 10-byte layout: type, port, color, reflection, r, g, b
          this.colors[port] = { color: dv.getInt8(o + 2), reflection: k ? msg[o + 3] : null, r: dv.getUint16(o + 3 + k, true), g: dv.getUint16(o + 5 + k, true), b: dv.getUint16(o + 7 + k, true) };
          seen(port, "color"); break;
        }
        case 0x0D: { const port = msg[o + 1]; this.distances[port] = dv.getInt16(o + 2, true); seen(port, "distance"); break; }
        case 0x0E: { const port = msg[o + 1]; this.matrices3x3[port] = Array.from(msg.slice(o + 2, o + 11)); seen(port, "matrix3x3"); break; }
      }
      o += len;
    }
    if (!aligned) {
      this.parseWarnings++;
      if (!this._warnedLayout) {
        this._warnedLayout = true;
        this.log(`Unexpected DeviceNotification layout at byte ${o} of ${end}; the rest of that notification was ignored. Raw: ${hexOf(msg.slice(0, end))}  (repeats are only counted in parseWarnings; use captureNotifications() to grab more)`);
      }
    }
    if (this._waiters.length) { const w = this._waiters; this._waiters = []; for (const f of w) f(); }
  }

  _resolvePort(port) {
    if (typeof port === "number" && port >= 0 && port <= 5) return port;
    if (typeof port === "string") { const p = this.userPortMap[port.trim().toUpperCase()]; if (p != null) return p; }
    throw new Error("Unknown port: " + port + " (use A..F)");
  }
  _portName(p) { return "ABCDEF"[p]; }

  /** true if the hub reported a device on that port in the last moments */
  isAttached(portName, kind) {
    const p = this._resolvePort(portName);
    const fresh = performance.now() - (this._seen[p] ?? -1e9) < Math.max(SPIKE3.attachedMs, SPIKE3.notifyIntervalMs * 5);
    return fresh && (!kind || this.portDevice[p] === kind);
  }

  /** { A: "motor", B: "color", ... } of the ports with a device */
  getAttached() {
    const out = {};
    for (let p = 0; p < 6; p++) if (this.isAttached(p)) out["ABCDEF"[p]] = this.portDevice[p];
    return out;
  }

  async _value(store, port, label) {
    const t0 = performance.now();
    while (store[port] === undefined) {
      if (!this.rx) throw new Error("SPIKE hub not connected");
      if (performance.now() - t0 > SPIKE3.valueTimeoutMs) throw new Error(`${label}: no ${label.toLowerCase()} reported on port ${this._portName(port)} (is it plugged in?)`);
      await new Promise(r => { this._waiters.push(r); setTimeout(r, 100); });
    }
    return store[port];
  }

  async getColor(portName) { const p = this._resolvePort(portName); return (await this._value(this.colors, p, "Color")).color; }
  async getColorName(portName) { return COLOR_NAMES[await this.getColor(portName)] ?? "unknown"; }
  /** Extra byte the colour sensor reports on Hub OS 1.8.149 (undocumented, most likely reflected light 0..100). Unverified. */
  async getReflection(portName) { const c = await this._value(this.colors, this._resolvePort(portName), "Color"); if (c.reflection == null) throw new Error("This hub does not report a reflection value"); return c.reflection; }
  async getColorRGB(portName) { const c = await this._value(this.colors, this._resolvePort(portName), "Color"); return [c.r, c.g, c.b]; }
  /** distance in millimetres (40..2000), -1 = nothing detected */
  async getDistance(portName) { return this._value(this.distances, this._resolvePort(portName), "Distance"); }
  /** 0..100 */
  async getForce(portName) { return (await this._value(this.forces, this._resolvePort(portName), "Force")).value; }
  async isForcePressed(portName) { return (await this._value(this.forces, this._resolvePort(portName), "Force")).pressed; }
  /** relative position in degrees (counter you can reset with resetPosition) */
  async getRot(portName) { return (await this._value(this.motors, this._resolvePort(portName), "Motor")).pos; }
  /** absolute position in degrees, -180..179 */
  async getAbsPos(portName) { return (await this._value(this.motors, this._resolvePort(portName), "Motor")).absPos; }
  /** speed, -100..100 (%) */
  async getSpeed(portName) { return (await this._value(this.motors, this._resolvePort(portName), "Motor")).speed; }
  /** applied power, -10000..10000 */
  async getPower(portName) { return (await this._value(this.motors, this._resolvePort(portName), "Motor")).power; }
  async getMotorType(portName) { const t = (await this._value(this.motors, this._resolvePort(portName), "Motor")).deviceType; return MOTOR_TYPES[t] || ("type 0x" + t.toString(16)); }
  /** [pitch, roll] in degrees (hub frame) */
  async getTilt() { const i = await this._imu(); return [i.pitch, i.roll]; }
  /** accelerometer [x, y, z] */
  async getIMU() { return (await this._imu()).acc; }
  async getGyro() { return (await this._imu()).gyro; }
  async getYaw() { return (await this._imu()).yaw; }
  async getBattery() { const t0 = performance.now(); while (this.battery == null && performance.now() - t0 < SPIKE3.valueTimeoutMs) await _sleep(50); return this.battery ?? -1; }
  async _imu() { const t0 = performance.now(); while (!this.imu) { if (performance.now() - t0 > SPIKE3.valueTimeoutMs) throw new Error("IMU: no data from the hub"); await _sleep(30); } return this.imu; }

  // ---------------- Programs: upload / start / stop / clear ----------------
  _slot(slot) { const s = Number(slot); if (!Number.isInteger(s) || s < 0 || s >= SPIKE3.slots) throw new Error(`Program slot must be 0..${SPIKE3.slots - 1}`); return s; }

  async clearSlot(slot) {
    const r = await this._request(new Uint8Array([MSG.CLEAR_SLOT_REQ, this._slot(slot)]), MSG.CLEAR_SLOT_RES);
    return r[1] === 0;
  }

  /**
   * Upload Python source into a slot. The hub only runs a file named "program.py", so that is the default name.
   * Flow (official examples): ClearSlot -> StartFileUpload -> TransferChunk... -> (optional) start.
   */
  async uploadProgram(source, { slot = 0, name = "program.py", start = false, clear = true } = {}) {
    slot = this._slot(slot);
    if (!this.info) throw new Error("Not connected");
    let bytes = typeof source === "string" ? enc.encode(source) : Uint8Array.from(source);
    // CRC is computed on a multiple of 4 bytes: pad with newlines (harmless in Python) instead of NULs
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) { const b = new Uint8Array(bytes.length + pad); b.set(bytes); b.fill(0x0A, bytes.length); bytes = b; }
    const nameBytes = enc.encode(name);
    if (nameBytes.length > 31) throw new Error("File name too long (max 31 characters)");

    this.log(`Uploading ${name} (${bytes.length} bytes) to slot ${slot}...`);
    if (clear) await this.clearSlot(slot);

    // Real hubs (Hub OS 1.8.149, and the working VS Code extension by PeterStaev) read the name as a NUL-terminated string:
    // name, 0x00, slot, crc32. LEGO's docs show a fixed 32-byte name field; with that layout the hub reads the slot
    // from the first padding byte (= 0) and the CRC from zeros. "nul" is the default, "fixed32" is the documented layout.
    const fixed = SPIKE3.startNameLayout === "fixed32";
    const nl = fixed ? 32 : nameBytes.length + 1;
    const startMsg = new Uint8Array(1 + nl + 1 + 4);
    startMsg[0] = MSG.START_FILE_REQ; startMsg.set(nameBytes, 1); startMsg[1 + nl] = slot;
    new DataView(startMsg.buffer).setUint32(2 + nl, crc32(bytes), true);
    const sr = await this._request(startMsg, MSG.START_FILE_RES);
    if (sr[1] !== 0) throw new Error("The hub refused the upload (StartFileUpload not acknowledged)");

    const chunk = Math.max(4, (this.info.maxChunk || 512) & ~3);   // multiple of 4 keeps the running CRC aligned
    let running = 0;
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.subarray(i, Math.min(bytes.length, i + chunk));
      running = crc32(part, running);
      const m = new Uint8Array(1 + 4 + 2 + part.length);
      const dv = new DataView(m.buffer);
      m[0] = MSG.CHUNK_REQ; dv.setUint32(1, running, true); dv.setUint16(5, part.length, true); m.set(part, 7);
      const cr = await this._request(m, MSG.CHUNK_RES);
      if (cr[1] !== 0) throw new Error(`The hub refused the data chunk at byte ${i} (CRC or size problem)`);
    }
    this.log(`Upload to slot ${slot} done.`);
    if (start) await this.startProgram(slot);
    return { slot, bytes: bytes.length };
  }

  async startProgram(slot = 0) {
    slot = this._slot(slot);
    const r = await this._request(new Uint8Array([MSG.FLOW_REQ, 0x00, slot]), MSG.FLOW_RES);
    if (r[1] !== 0) throw new Error(`The hub refused to start slot ${slot} (empty slot, or no program.py in it)`);
    this.runningSlot = slot; this.programRunning = true;
    return true;
  }

  async stopProgram(slot = this.runningSlot ?? 0) {
    slot = this._slot(slot);
    const r = await this._request(new Uint8Array([MSG.FLOW_REQ, 0x01, slot]), MSG.FLOW_RES);
    this.programRunning = false; this.helperReady = false;
    this._failCalls("the program on the hub was stopped");
    return r[1] === 0;
  }

  // ---------------- Tunnel: messages to / from a program running on the hub ----------------
  /** Send text (string) or bytes to the running program. Works with any program that registers a tunnel callback. */
  sendMessage(data) {
    const payload = typeof data === "string" ? enc.encode(data) : Uint8Array.from(data);
    const m = new Uint8Array(3 + payload.length);
    m[0] = MSG.TUNNEL; m[1] = payload.length & 0xFF; m[2] = (payload.length >> 8) & 0xFF; m.set(payload, 3);
    if (this.info?.maxMessage && m.length > this.info.maxMessage) throw new Error(`Message too long (${m.length} > ${this.info.maxMessage} bytes)`);
    if (SPIKE3.debug.tunnel) console.log("[SPIKE3] tunnel ->", typeof data === "string" ? data : payload);
    return this._send(m);
  }

  /** cb(text, bytes) for every tunnel message from the hub. Returns an unsubscribe function. */
  onTunnelMessage(cb) { this._tunnelListeners.add(cb); return () => this._tunnelListeners.delete(cb); }
  onConsole(cb) { this._consoleListeners.add(cb); return () => this._consoleListeners.delete(cb); }
  getLastTunnelMessage() { return this._lastTunnel; }

  /** Resolves with the text of the next tunnel message (matching `match`: string prefix, RegExp or function), or null on timeout / STOP. */
  waitForTunnelMessage(match = null, timeoutMs = 5000) {
    const test = match == null ? () => true : typeof match === "function" ? match : match instanceof RegExp ? t => match.test(t) : t => t.startsWith(String(match));
    return new Promise(resolve => {
      const t0 = performance.now();
      const off = this.onTunnelMessage(text => { if (test(text)) { off(); clearInterval(tick); resolve(text); } });
      const tick = setInterval(() => {
        if (window?.stopRequested || !this.rx || (timeoutMs > 0 && performance.now() - t0 > timeoutMs)) { off(); clearInterval(tick); resolve(null); }
      }, 50);
    });
  }

  _onTunnel(bytes) {
    const text = dec.decode(bytes);
    this._lastTunnel = text;
    if (SPIKE3.debug.tunnel) console.log("[SPIKE3] tunnel <-", text);
    this._handleHelperReply(text);
    for (const cb of this._tunnelListeners) { try { cb(text, bytes); } catch (e) { this.log("Tunnel listener error: " + (e?.message || e)); } }
  }

  // ---------------- Motor helper (resident MicroPython program) ----------------
  /**
   * Diagnostic for "the hub acknowledges the start request but nothing seems to run". Uploads a program that lights
   * three pixels on the hub's matrix, beeps, prints to the console and sends one tunnel message, starts it, and reports
   * what came back. WATCH AND LISTEN to the hub while it runs (about `seconds` s) and note what you see and hear.
   * Options: slot; clear (false = skip ClearSlot before uploading); startDelayMs (pause between upload and start).
   */
  async probeProgram({ slot = SPIKE3.helperSlot, clear = true, startDelayMs = 0, seconds = 7 } = {}) {
    if (this.programRunning) { try { await this.stopProgram(); await _sleep(300); } catch {} }
    this.helperReady = false;
    this.log(`Probe: slot ${slot}, clear=${clear}, startDelay=${startDelayMs} ms. Watch and listen to the hub now (3 pixels + a beep expected).`);
    await this.uploadProgram(PROBE_PY, { slot, name: "program.py", clear });
    if (startDelayMs) await _sleep(startDelayMs);
    this._rxTrace = [];
    await this.startProgram(slot);
    await _sleep(seconds * 1000);
    const trace = this.getRxTrace();
    const report = {
      slot, clear, startDelayMs,
      flowNotification: trace.some(r => r.what.startsWith("program ")),
      console: trace.filter(r => r.what.startsWith("console:")).map(r => r.what),
      tunnel: trace.filter(r => r.what.startsWith("tunnel:")).map(r => r.what),
      trace
    };
    try { await this.stopProgram(slot); } catch {}
    this.log(`Probe result: flowNotification=${report.flowNotification}, console lines=${report.console.length}, tunnel messages=${report.tunnel.length}. Did the hub light pixels / beep?`);
    return report;
  }

  /**
   * Smallest end-to-end check of "upload program -> start it -> talk through the tunnel": uploads a tiny echo
   * program, starts it, waits for its hello, sends "ping" and waits for "echo:ping". Returns
   * { slot, gotReady, gotEcho, trace }. If gotReady is false, paste the report: `trace` shows what the hub did.
   */
  async testTunnel({ slot = SPIKE3.helperSlot, timeoutMs = 6000 } = {}) {
    if (this.programRunning) { try { await this.stopProgram(); await _sleep(300); } catch {} }
    this.helperReady = false;
    await this.uploadProgram(TUNNEL_TEST_PY, { slot, name: "program.py" });
    this._rxTrace = [];
    const hello = this.waitForTunnelMessage(t => t.startsWith("mini-ready"), timeoutMs);
    await this.startProgram(slot);
    const gotReady = !!(await hello);
    let gotEcho = false;
    if (gotReady) {
      const echo = this.waitForTunnelMessage(t => t === "echo:ping", 3000);
      await this.sendMessage("ping");
      gotEcho = !!(await echo);
    }
    const trace = this.getRxTrace();
    try { await this.stopProgram(slot); } catch {}
    this.log(`Tunnel test: hello=${gotReady} echo=${gotEcho}`);
    return { slot, gotReady, gotEcho, trace };
  }

  /**
   * Upload the motor helper into a slot and start it. Call it once in your Blockly flow before any motor block.
   * Replaces whatever program is in that slot (default slot 19).
   */
  async uploadMotorHelper({ slot = SPIKE3.helperSlot, start = true } = {}) {
    if (this.programRunning) { try { await this.stopProgram(); await _sleep(300); } catch {} }
    await this.uploadProgram(SPIKE_MOTOR_HELPER_PY, { slot, name: "program.py" });
    if (!start) return { slot, started: false };
    this._rxTrace = [];
    const ready = this.waitForTunnelMessage(/^0,rdy,/, SPIKE3.helperReadyTimeoutMs);
    await this.startProgram(slot);
    const text = await ready;
    if (!text) {
      const seen = this.getRxTrace().map(r => `${r.type} ${r.what}`).join(" | ") || "nothing at all (no console output, no program start/stop notification)";
      this.log("Motor helper start-up trace: " + seen);
      throw new Error(`The motor helper did not answer within ${SPIKE3.helperReadyTimeoutMs} ms. What the hub sent meanwhile: ${seen}. ` +
                      "Run  await dev.testTunnel()  to check the tunnel with a minimal program, and  await dev.stopProgram()  to stop the helper.");
    }
    this.helperReady = true;
    this.helperVersion = Number(text.split(",")[2]);
    if (this.helperVersion !== SPIKE_MOTOR_HELPER_VERSION) this.log(`Helper version ${this.helperVersion} (driver expects ${SPIKE_MOTOR_HELPER_VERSION})`);
    this.log("Motor helper running.");
    return { slot, started: true, version: this.helperVersion };
  }

  /** Stop the motor helper program (motors coast). */
  async stopMotorHelper() {
    if (this.helperReady) { try { await this._helperSend("sa"); } catch {} }
    await this.stopProgram();
  }

  _requireHelper() {
    if (!this.helperReady) throw new Error("Motor helper not running on the hub. Call uploadMotorHelper() first (Blockly: 'Upload motor helper').");
  }

  _failCalls(why) {
    for (const [, c] of this._calls) { clearTimeout(c.timer); c.reject(new Error("Motor command cancelled: " + why)); }
    this._calls.clear();
  }

  _handleHelperReply(text) {
    const f = text.split(",");
    if (f.length < 2 || !/^\d+$/.test(f[0])) return;
    const id = Number(f[0]);
    if (id === 0) return;
    const c = this._calls.get(id);
    if (!c) { if (f[1] === "err") this.log("Helper error: " + f.slice(2).join(",")); return; }
    if (f[1] === "ok") { if (!c.done) this._finishCall(id, c, f.slice(2).join(",")); }
    else if (f[1] === "done") { this._finishCall(id, c, Number(f[3])); }
    else if (f[1] === "err") { clearTimeout(c.timer); this._calls.delete(id); c.reject(new Error("Hub: " + f.slice(2).join(","))); }
  }
  _finishCall(id, c, value) { clearTimeout(c.timer); this._calls.delete(id); c.resolve(value); }

  /** Send a helper command. wait: "ok" (default) | "done" | false (fire and forget). */
  _helperSend(cmd, { wait = false, timeoutMs = 120000 } = {}) {
    this._requireHelper();
    const id = (this._seq = (this._seq % 99999) + 1);
    const line = `${id},${cmd}`;
    if (!wait) { return this.sendMessage(line); }
    return new Promise((resolve, reject) => {
      const call = { done: wait === "done", resolve, reject, timer: null };
      call.timer = setTimeout(() => { this._calls.delete(id); reject(new Error(`Motor command timed out: ${cmd}`)); }, timeoutMs);
      this._calls.set(id, call);
      this.sendMessage(line).catch(e => { clearTimeout(call.timer); this._calls.delete(id); reject(e); });
      if (call.done) {   // give STOP a chance to release a long wait
        const iv = setInterval(() => {
          if (!this._calls.has(id)) return clearInterval(iv);
          if (window?.stopRequested) { clearInterval(iv); clearTimeout(call.timer); this._calls.delete(id); resolve(undefined); }
        }, 50);
      }
    });
  }

  _stop(mode, dflt = SPIKE3_STOP.brake) {
    if (mode == null) return dflt;
    if (typeof mode === "boolean") return mode ? SPIKE3_STOP.brake : SPIKE3_STOP.coast;
    if (typeof mode === "number") return mode;
    const v = SPIKE3_STOP[String(mode).toLowerCase().replace(/[\s_-]/g, "")];
    if (v === undefined) throw new Error("Unknown stop mode: " + mode + " (coast, brake, hold, continue, smartcoast, smartbrake)");
    return v;
  }
  _dir(d) {
    if (d == null) return SPIKE3_DIR.shortest;
    if (typeof d === "number") return d;
    const v = SPIKE3_DIR[String(d).toLowerCase().replace(/[\s_-]/g, "")];
    if (v === undefined) throw new Error("Unknown direction: " + d + " (cw, ccw, shortest, longest)");
    return v;
  }
  _int(v, what, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`${what} must be a number`);
    return Math.max(lo, Math.min(hi, Math.round(n)));
  }
  /** speed -> deg/s. unit "pct" (default): 100 % ~ 1000 deg/s (approximate, a SPIKE motor tops out around 1000-1100); "dps": degrees per second */
  _dps(speed, unit) { return unit === "dps" ? this._int(speed, "speed", -2000, 2000) : this._int(Number(speed) * 10, "speed", -2000, 2000); }

  // ------------------ Motor commands (need the helper) ----------------
  /** Raw power, -100..100 % (duty cycle, no speed regulation) */
  motorPower(port, power) {
    const p = this._portName(this._resolvePort(port));
    return this._helperSend(`pw,${p},${this._int(Number(power) * 100, "power", -10000, 10000)}`);
  }

  /** Regulated speed (keeps running). opts: { unit: "pct"|"dps", accel (deg/s2, default 1000), wait } */
  motorSpeed(port, speed, { unit = "pct", accel = 1000, wait = false } = {}) {
    const p = this._portName(this._resolvePort(port));
    return this._helperSend(`sp,${p},${this._dps(speed, unit)},${this._int(accel, "accel", 1, 100000)}`, { wait: wait ? "ok" : false });
  }

  /** Run for a number of degrees. Resolves when done (opts.wait=false: returns right away). Status code of the hub is returned. */
  motorAngle(port, degrees, speed, { stop = "brake", accel = 1000, decel = 1000, unit = "pct", wait = true } = {}) {
    const p = this._portName(this._resolvePort(port));
    const cmd = `rd,${p},${this._int(degrees, "degrees", -2147483648, 2147483647)},${this._dps(speed, unit)},${this._stop(stop)},${this._int(accel, "accel", 1, 100000)},${this._int(decel, "decel", 1, 100000)}`;
    return this._helperSend(cmd, { wait: wait ? "done" : "ok" });
  }

  /** Run for a time in ms. */
  motorTime(port, ms, speed, { stop = "brake", accel = 1000, decel = 1000, unit = "pct", wait = true } = {}) {
    const p = this._portName(this._resolvePort(port));
    const cmd = `rt,${p},${this._int(ms, "time", 0, 2147483647)},${this._dps(speed, unit)},${this._stop(stop)},${this._int(accel, "accel", 1, 100000)},${this._int(decel, "decel", 1, 100000)}`;
    return this._helperSend(cmd, { wait: wait ? "done" : "ok" });
  }

  /** Go to an ABSOLUTE position (-180..179 degrees, the motor's own zero mark). direction: shortest | longest | cw | ccw. */
  motorGoto(port, position, speed, { direction = "shortest", stop = "hold", accel = 1000, decel = 1000, unit = "pct", wait = true } = {}) {
    const p = this._portName(this._resolvePort(port));
    const cmd = `ra,${p},${this._int(position, "position", -360, 359)},${this._dps(Math.abs(Number(speed)), unit)},${this._dir(direction)},${this._stop(stop, SPIKE3_STOP.hold)},${this._int(accel, "accel", 1, 100000)},${this._int(decel, "decel", 1, 100000)}`;
    return this._helperSend(cmd, { wait: wait ? "done" : "ok" });
  }

  /** Go to a position on the RELATIVE counter (see getRot / resetPosition). */
  motorGotoRelative(port, position, speed, { stop = "hold", accel = 1000, decel = 1000, unit = "pct", wait = true } = {}) {
    const p = this._portName(this._resolvePort(port));
    const cmd = `rr,${p},${this._int(position, "position", -2147483648, 2147483647)},${this._dps(Math.abs(Number(speed)), unit)},${this._stop(stop, SPIKE3_STOP.hold)},${this._int(accel, "accel", 1, 100000)},${this._int(decel, "decel", 1, 100000)}`;
    return this._helperSend(cmd, { wait: wait ? "done" : "ok" });
  }

  /** mode: "coast" | "brake" | "hold" | "continue" | "smartcoast" | "smartbrake" (or true = brake, false = coast) */
  motorStop(port, mode = "brake") {
    const p = this._portName(this._resolvePort(port));
    return this._helperSend(`st,${p},${this._stop(mode)}`);
  }

  /** Zero (or set) the relative position counter. */
  resetPosition(port, newPos = 0) {
    const p = this._portName(this._resolvePort(port));
    return this._helperSend(`rs,${p},${this._int(newPos, "position", -2147483648, 2147483647)}`);
  }

  /** Safety: the helper stops every motor if it hears nothing for `ms` (0 = off). Useful with keyboard / remote driving. */
  motorWatchdog(ms) { return this._helperSend(`wd,${this._int(ms, "watchdog", 0, 600000)}`); }

  /** Used by the STOP button: stop every motor (coast). Does nothing if the helper is not running. */
  stopAllMotors() {
    if (!this.helperReady) return;
    this._helperSend("sa").catch(() => {});
  }
}

LegoSpike3.CONFIG = SPIKE3;
LegoSpike3.PROBE_PY = PROBE_PY;
LegoSpike3.TUNNEL_TEST_PY = TUNNEL_TEST_PY;