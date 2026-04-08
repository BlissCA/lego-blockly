// device/DeviceLegoRcx.js

export class LegoRcx {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    // ---------------- RCX vs CyberMaster configuration ----------------
    this.isCM = !!window.useCyberMaster;

    if (this.isCM) {
      // CyberMaster
      this.devicePrefix = "CM";

      // CM header: 0xFE 0x00 0x00 0xFF
      this.headerBytes = Uint8Array.from([0xFE, 0x00, 0x00, 0xFF]);

      // CM reply signature: only 0xFF (we still append replyCode + replyComp later)
      this.replySignatureBase = Uint8Array.from([0xFF]);

      // CM handshake: A5 + "Do you byte, when I knock?" → expect "Just a bit off the block!"
      this.handshakeOpcode = 0xA5;
      this.handshakePhrase = "Do you byte, when I knock?";
      this.expectedReplyPhrase = "Just a bit off the block!";
    } else {
      // RCX
      this.devicePrefix = "Rcx";

      // RCX header: 0x55 0xFF 0x00
      this.headerBytes = Uint8Array.from([0x55, 0xFF, 0x00]);

      // RCX reply signature base: 0x55 0xFF 0x00
      this.replySignatureBase = Uint8Array.from([0x55, 0xFF, 0x00]);

      // RCX handshake: alive opcode 0x10
      this.handshakeOpcode = 0x10;
      this.handshakePhrase = null;
      this.expectedReplyPhrase = null;
    }

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.status = "idle";

    this.queue = Promise.resolve();
    this.queueActive = true;

    this.lastOpCode = 0;
    this.opCodeEx = new Set([0xF7]);
    this.NoReply = false;

    // Cache of last output states
    // New Output Cache that work for both single and multiple commands.
    this.portState = {};
    for (let p = 1; p <= 3; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }
  }

  log(msg) {
    console.log(`[${this.devicePrefix} ${this.name}] ${msg}`);
  }

  // ---------------- Queue ----------------
  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }

  // ---------------- Connect ----------------
  async connect() {
    this.log("Requesting serial port...");

    // 1. User selects a port (or autoSelectPort picks the last used one)
    try {
      this.port = await window.autoSelectPort();
    } catch (err) {
      this.log("User cancelled port selection");
      throw err;  // bubble up to deviceManager
    }

    // 2. Open the port
    await this.port.open({
      baudRate: 2400,
      dataBits: 8,
      stopBits: 1,
      parity: "odd",
      bufferSize: 3 * 32 * 1024
    });

    this.writer = this.port.writable.getWriter();

    // 3. Handshake
    let ok;
    if (this.isCM) {
      ok = await this._handshakeCM();
    } else {
      ok = await this.alive();
    }

    if (!ok) {
      this.log(`${this.devicePrefix} did not respond. Power it on.`);
      window.logStatus(`${this.devicePrefix}: Please power on the device and Reconnect.`);
      this.disconnect();
    } else {

      // ⭐ Allocate name ONLY NOW
      if (!this.name) {
        this.name = this.manager._allocateName(this.devicePrefix);
      }

      this.log("Connected.");
      this.status = "Connected";
    }
  }

  // ---------------- CyberMaster handshake (using rcxCmd) ----------------
  async _handshakeCM() {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const phrase = this.handshakePhrase;           // "Do you byte, when I knock?"
    const expected = this.expectedReplyPhrase;     // "Just a bit off the block!"

    // Build command: [A5] + phrase bytes
    const cmd = Uint8Array.from([
      this.handshakeOpcode,                        // 0xA5
      ...encoder.encode(phrase)
    ]);

    // Expected reply length (ASCII chars)
    const replyLen = expected.length;

    // Use rcxCmd — it handles retries, signature, complements, buffering
    const replyBytes = await this.rcxCmd(cmd, replyLen);
    if (!replyBytes) return false;

    const replyText = decoder.decode(replyBytes);
    return replyText.includes(expected);
  }

  // ---------------- Write ----------------
  async writeBytes(bytes) {
    if (!this.writer) return;
    //if (this.isCM) 
    console.log("Sent:", bytes.toHex().match(/.{1,2}/g).join(' '));
    await this.writer.write(bytes);
  }

  // ---------------- RCX / CM Protocol ----------------
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

    // Header is now dynamic (RCX vs CM)
    return Uint8Array.from([...this.headerBytes, ...buff]);
  }

  async rcxCmd(cmd, vblen = 0) {
    return this.enqueue(async () => {

      const buff = this.mkSerBuffWr(cmd);

      // For RCX: headerBytes = [0x55, 0xFF, 0x00]
      // For CM:  headerBytes = [0xFE, 0x00, 0x00, 0xFF]
      // replyCode and replyComp are always the first two bytes after header
      const replyCode = buff[this.headerBytes.length + 1];
      const replyComp = buff[this.headerBytes.length];

      // Signature = base signature (RCX: 55 FF 00, CM: FF) + replyCode + replyComp
      const signature = Uint8Array.from([
        ...this.replySignatureBase,
        replyCode,
        replyComp
      ]);

      console.log("Signature:", signature.toHex().match(/.{1,2}/g).join(' '));

      // Try up to 3 times
      for (let attempt = 1; attempt <= 3; attempt++) {

        // Write command
        await this.writeBytes(buff);

        // Allow IR tower to switch TX→RX
        //await new Promise(r => setTimeout(r, 20));

        if (this.NoReply) {
          // No-reply command (e.g. msg) → return immediately
          return Uint8Array.from([0x00]);
        }

        const reader = this.port.readable.getReader();

        try {
          const t0 = performance.now();
          let collected = new Uint8Array(0);
          let found = -1;

          // Read until signature found or timeout
          while (performance.now() < t0 + 1000) {  // was 200

            let value = null;
            let done = false;

            try {
              const readPromise = reader.read();
              const timeoutPromise = new Promise(r => setTimeout(() => {
                r({ value: null, done: false });
              }, 340)); // was 20

              ({ value, done } = await Promise.race([readPromise, timeoutPromise]));

            } catch (err) {
              // Ignore parity errors
              if (err?.name === "ParityError" || err?.message?.includes("Parity")) {
                continue;
              }
              console.warn(`[${this.devicePrefix} ${this.name}] Read error:`, err);
              break;
            }

            if (done) break;
            if (!value) continue;

            // Append bytes
            let tmp = new Uint8Array(collected.length + value.length);
            tmp.set(collected);
            tmp.set(value, collected.length);
            collected = tmp;

            if (collected.length >= buff.length + signature.length + 2) {
              found = this.findSignature(collected, signature);
              if (found !== -1) break;
            }
          }
          console.log("collected:", collected?.toHex()?.match(/.{1,2}/g)?.join(' '));

          // If reply found → extract values and return
          if (found !== -1) {

            if (vblen > 0) {
              const needed = signature.length + 2 * vblen;

              while (collected.length < found + needed) {
                const readPromise = reader.read();
                const timeoutPromise = new Promise(r => setTimeout(() => {
                  r({ value: null, done: false });
                }, 340)); // was 20

                const { value, done } = await Promise.race([readPromise, timeoutPromise]);
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
              // ⭐ Mandatory cool‑down delay after successful RCX/CM command
              await new Promise(r => setTimeout(r, 20));
              return Uint8Array.from(vals);
            }

            // ⭐ Mandatory cool‑down delay after successful RCX/CM command
            await new Promise(r => setTimeout(r, 20));
            return Uint8Array.from([0x00]);
          }

          // No reply → retry
          console.warn(`[${this.devicePrefix} ${this.name}] No reply for cmd ${cmd[0].toString(16)} (attempt ${attempt})`);

        } finally {
          try { reader.releaseLock(); } catch {}
        }

        // Small delay before retry
        await new Promise(r => setTimeout(r, 30));
      }

      // All retries failed
      console.warn(
        `[${this.devicePrefix} ${this.name}] Command failed after 3 attempts: ${cmd[0].toString(16)}`
      );
      return null;
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

    this.portState = {};
    for (let p = 1; p <= 3; p++) {
      this.portState[p] = { mode: "off", power: 7 };
    }

    // Free the name if it was allocated
    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this.status = "Disconnected";
  }

  // ---------------- Helper Method to Update Cache for multiple port commands ----------------
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

    // Update states
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
    if (!this.rcx.shouldSendMulti(this.motors, "on")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x80 | this.motors]));
  }

  async off() {
    if (!this.rcx.shouldSendMulti(this.motors, "off")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x40 | this.motors]));
  }

  async float() {
    if (!this.rcx.shouldSendMulti(this.motors, "float")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0x21, 0x00 | this.motors]));
  }

  async flip() {
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x40 | this.motors]));
  }

  async f() {
    if (!this.rcx.shouldSendMulti(this.motors, "f")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x80 | this.motors]));
  }

  async r() {
    if (!this.rcx.shouldSendMulti(this.motors, "r")) return;
    return this.rcx.rcxCmd(Uint8Array.from([0xE1, 0x00 | this.motors]));
  }

  async pow(power) {
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
