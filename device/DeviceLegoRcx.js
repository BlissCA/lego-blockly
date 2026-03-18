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
    this.opCodeEx = new Set([0xF7]); // same as Python: opCodeEx = (0xf7, -1)

    this.status = "idle";
    this.statusMessage = "Idle";
  }

  log(msg) {
    console.log(`[RCX ${this.name}] ${msg}`);
  }

  setStatus(status, msg) {
    this.status = status;
    this.statusMessage = msg;
    document.dispatchEvent(new CustomEvent("device-status", {
      detail: { name: this.name, status, msg }
    }));
  }

  // ---------------- Queue ----------------
  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => this.log("Queue error: " + err));
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

    this.setStatus("connected", "Connected");
    this.log("Connected.");

    // Try alive ping
    const ok = await this.alive();
    if (!ok) {
      this.log("RCX did not respond. Power it on.");
    }
  }

  // ---------------- Disconnect ----------------
  async disconnect() {
    this.log("Disconnecting...");
    this.queueActive = false;

    try { await this.queue; } catch {}

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
      }
    } catch {}

    try {
      if (this.writer) {
        this.writer.releaseLock();
      }
    } catch {}

    try {
      if (this.port) {
        await this.port.close();
      }
    } catch {}

    this.reader = null;
    this.writer = null;
    this.port = null;

    this.setStatus("disconnected", "Disconnected");
    this.log("Disconnected.");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this.queue = Promise.resolve();

    try { await this.reader?.cancel(); } catch {}
    try { this.reader?.releaseLock(); } catch {}
    try { this.writer?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}

    this.reader = null;
    this.writer = null;
    this.port = null;

    this.manager._freeName(this.name);
    this.name = null;

    this.setStatus("disconnected", "Disconnected");
  }

  // ---------------- Low-level write ----------------
  async writeBytes(bytes) {
    if (!this.port || !this.writer) return;
    await this.writer.write(bytes);
  }

  // ---------------- RCX Protocol ----------------

  mkSerBuffWr(cmd) {
    if (!cmd || cmd.length === 0) cmd = new Uint8Array([0x10]);

    let opCode = cmd[0];

    // Toggle opcode bit if same as last time
    if (opCode === this.lastOpCode && !this.opCodeEx.has(opCode)) {
      if ((opCode & 0x08) === 0) opCode |= 0x08;
      else opCode &= ~0x08;

      cmd = Uint8Array.from([opCode, ...cmd.slice(1)]);
    }

    this.lastOpCode = opCode;

    // Build buffer with complement bytes
    let buff = [];
    let sum = 0;

    for (let b of cmd) {
      buff.push(b);
      buff.push(0xFF - b);
      sum += b;
    }

    buff.push(sum & 0xFF);
    buff.push((-1 - sum) & 0xFF);

    // Add header
    return Uint8Array.from([0x55, 0xFF, 0x00, ...buff]);
  }

  async rcxCmd(cmd, vblen = 0) {
    return this.enqueue(async () => {
      if (!this.port) return null;

      const buff = this.mkSerBuffWr(cmd);
      console.log("Sent:", buff);

      // Expected reply signature
      const replyCode = buff[4];
      const replyComp = buff[3];
      const signature = Uint8Array.from([0x55, 0xFF, 0x00, replyCode, replyComp]);

      // Clear input
      const reader = this.port.readable.getReader();
      await reader.cancel().catch(() => {});
      reader.releaseLock();

      // Write
      await this.writeBytes(buff);

      // Read loop
      const readReader = this.port.readable.getReader();
      let collected = new Uint8Array(0);
      let found = -1;
      const t0 = performance.now();

      try {
        while (found === -1 && performance.now() < t0 + 1000) {
          const { value, done } = await readReader.read();
          if (done || !value) break;

          // Append
          let tmp = new Uint8Array(collected.length + value.length);
          tmp.set(collected);
          tmp.set(value, collected.length);
          collected = tmp;

          // Search signature
          found = this.findSignature(collected, signature);
        }
      } finally {
        readReader.releaseLock();
      }

      if (found === -1) return null;

      if (vblen > 0) {
        const needed = signature.length + 2 * vblen;
        while (collected.length < found + needed) {
          const { value, done } = await readReader.read();
          if (done || !value) break;
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
