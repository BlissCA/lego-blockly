// device/DeviceLegoRcx.js

export class LegoRcx {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.queue = Promise.resolve();
    this.queueActive = true;

    this.lastOpCode = 0;
    this.opCodeEx = new Set([0xF7]);
  }

  log(msg) {
    console.log(`[RCX ${this.name}] ${msg}`);
  }

  // ---------------- Queue ----------------
  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }

  // ---------------- Connect ----------------
  async connect(port) {
    this.port = port;

    await this.port.open({
      baudRate: 2400,
      dataBits: 8,
      stopBits: 1,
      parity: "odd",
      bufferSize: 256
    });

    this.writer = this.port.writable.getWriter();

    console.log(`[RCX ${this.name}] Connected.`);

    // Try alive ping
    const ok = await this.alive();
    if (!ok) {
      this.log("RCX did not respond. Power it on.");
      window.logStatus(`RCX ${this.name}: Please power on the RCX.`);
    }

  }

  // ---------------- Write ----------------
  async writeBytes(bytes) {
    if (!this.writer) return;
    console.log("Sent:", bytes);
    await this.writer.write(bytes);
  }

  // ---------------- RCX Protocol ----------------
  mkSerBuffWr(cmd) {
    if (!cmd || cmd.length === 0) cmd = new Uint8Array([0x10]);

    let opCode = cmd[0];

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

    return Uint8Array.from([0x55, 0xFF, 0x00, ...buff]);
  }

  async rcxCmd(cmd, vblen = 0) {
    return this.enqueue(async () => {

      const buff = this.mkSerBuffWr(cmd);

      const replyCode = buff[4];
      const replyComp = buff[3];
      const signature = Uint8Array.from([0x55, 0xFF, 0x00, replyCode, replyComp]);

      // Write command
      await this.writeBytes(buff);

      // ⭐ REQUIRED DELAY for RCX IR tower half‑duplex switching
      await new Promise(r => setTimeout(r, 20));

      const reader = this.port.readable.getReader();

      try {
        const t0 = performance.now();
        let collected = new Uint8Array(0);
        let found = -1;

        while (performance.now() < t0 + 200) {   // RCX replies within 50–100ms
          let readTimeout = false;

          const readPromise = reader.read();
          const timeoutPromise = new Promise(r => setTimeout(() => {
            readTimeout = true;
            r({ value: null, done: false });
          }, 20)); // 20ms timeout per read

          const { value, done } = await Promise.race([readPromise, timeoutPromise]);

          if (readTimeout) continue;
          if (done) break;
          if (!value) continue;

          let tmp = new Uint8Array(collected.length + value.length);
          tmp.set(collected);
          tmp.set(value, collected.length);
          collected = tmp;

          // Require at least 6 bytes (header + opcode + complement)
          if (collected.length >= 6) {
            found = this.findSignature(collected, signature);
            if (found !== -1) break;
          }
        }

        if (found === -1) {
          console.warn(`[RCX ${this.name}] No reply for cmd ${cmd[0].toString(16)}`);
          return null;
        }

        // Extract values
        if (vblen > 0) {
          const needed = signature.length + 2 * vblen;

          while (collected.length < found + needed) {
            let readTimeout = false;

            const readPromise = reader.read();
            const timeoutPromise = new Promise(r => setTimeout(() => {
              readTimeout = true;
              r({ value: null, done: false });
            }, 20));

            const { value, done } = await Promise.race([readPromise, timeoutPromise]);

            if (readTimeout) continue;
            if (done) break;
            if (!value) continue;

            let tmp = new Uint8Array(collected.length + value.length);
            tmp.set(collected);
            tmp.set(value, collected.length);
            collected = tmp;
          }

          let vals = [];
          for (let i = 0; i < vblen; i++) {
            vals.push(collected[found + signature.length + i * 2]);
          }
          return Uint8Array.from(vals);
        }

        return Uint8Array.from([0x00]);

      } catch (err) {
        console.warn(`[RCX ${this.name}] Read error:`, err);
        return null;

      } finally {
        try { reader.releaseLock(); } catch {}
      }
    });
  }

  findSignature(buffer, signature) {
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

  // ---------------- Disconnect ----------------
  async disconnect() {
    this.queueActive = false;

    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}

    this.reader = null;
    this.writer = null;
    this.port = null;

    console.log(`[RCX ${this.name}] Disconnected.`);
  }

  // ---------------- High-level commands ----------------

  async alive() {
    const r = await this.rcxCmd(Uint8Array.from([0x10]));
    return r !== null;
  }

  async pwroff() {
    await this.rcxCmd(Uint8Array.from([0x60]));
  }

  async snd(soundType) {
    await this.rcxCmd(Uint8Array.from([0x51, soundType & 0xFF]));
  }

  async prg(progNo = 1) {
    let p = (progNo < 1 || progNo > 5) ? 0 : progNo - 1;
    await this.rcxCmd(Uint8Array.from([0x91, p]));
  }

  async start(taskNo = 0) {
    let t = (taskNo < 0 || taskNo > 9) ? 0 : taskNo;
    await this.rcxCmd(Uint8Array.from([0x71, t]));
  }

  async stop(taskNo = -1) {
    if (taskNo < 0 || taskNo > 9)
      await this.rcxCmd(Uint8Array.from([0x50]));
    else
      await this.rcxCmd(Uint8Array.from([0x81, taskNo]));
  }

  async msg(msgByte) {
    await this.rcxCmd(Uint8Array.from([0xF7, msgByte & 0xFF]));
  }

  async getval(source, arg = 0) {
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
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x80 | this.motors]));
  }

  async off() {
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x40 | this.motors]));
  }

  async float() {
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x00 | this.motors]));
  }

  async flip() {
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x40 | this.motors]));
  }

  async f() {
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x80 | this.motors]));
  }

  async r() {
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x00 | this.motors]));
  }

  async pow(power) {
    const p = power & 0x07;
    return this.rcx.rcxCmd(Uint8Array.from([0x13, this.motors, 0x02, p]));
  }
}

class RcxSensor {
  constructor(rcx, input) {
    this.rcx = rcx;
    this.input = Math.max(0, Math.min(2, input));
  }

  async type(typeNo) {
    return this.rcx.rcxCmd(Uint8Array.from([0x32, this.input, typeNo & 0xFF]));
  }

  async mode(modeCode) {
    return this.rcx.rcxCmd(Uint8Array.from([0x42, this.input, modeCode & 0xFF]));
  }

  async clear() {
    return this.rcx.rcxCmd(Uint8Array.from([0xD1, this.input]));
  }
}

window.LegoRcx = LegoRcx;
