// device/DeviceLegoRcx.js

export class LegoRcx {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.readLoopActive = false;
    this.incoming = new Uint8Array(0);   // shared buffer

    this.queue = Promise.resolve();
    this.queueActive = true;

    this.lastOpCode = 0;
    this.opCodeEx = new Set([0xF7]);
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

    // Start background reader
    this.readLoopActive = true;
    this.startReadLoop();

    console.log(`[RCX ${this.name}] Connected.`);
  }

  // ---------------- Background Reader ----------------
  async startReadLoop() {
    this.reader = this.port.readable.getReader();

    try {
      while (this.readLoopActive) {
        const { value, done } = await this.reader.read();
        if (done || !value) break;

        // Append to buffer
        let tmp = new Uint8Array(this.incoming.length + value.length);
        tmp.set(this.incoming);
        tmp.set(value, this.incoming.length);
        this.incoming = tmp;
      }
    } catch (err) {
      console.warn("Reader stopped:", err);
    } finally {
      try { this.reader.releaseLock(); } catch {}
    }
  }

  // ---------------- Write ----------------
  async writeBytes(bytes) {
    if (!this.writer) return;
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

      // Expected signature
      const replyCode = buff[4];
      const replyComp = buff[3];
      const signature = Uint8Array.from([0x55, 0xFF, 0x00, replyCode, replyComp]);

      // Clear buffer
      this.incoming = new Uint8Array(0);

      // Write command
      await this.writeBytes(buff);

      // Wait for reply
      const t0 = performance.now();
      let found = -1;

      while (performance.now() < t0 + 1000) {
        found = this.findSignature(this.incoming, signature);
        if (found !== -1) break;
        await new Promise(r => setTimeout(r, 5));
      }

      if (found === -1) {
        console.warn(`[RCX ${this.name}] No reply for cmd ${cmd[0].toString(16)}`);
        return null;
      }

      if (vblen > 0) {
        const needed = signature.length + 2 * vblen;

        while (this.incoming.length < found + needed) {
          if (performance.now() > t0 + 1000) break;
          await new Promise(r => setTimeout(r, 5));
        }

        let vals = [];
        for (let i = 0; i < vblen; i++) {
          vals.push(this.incoming[found + signature.length + i * 2]);
        }
        return Uint8Array.from(vals);
      }

      return Uint8Array.from([0x00]);
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
    this.readLoopActive = false;

    try { await this.reader?.cancel(); } catch {}
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
}

window.LegoRcx = LegoRcx;
