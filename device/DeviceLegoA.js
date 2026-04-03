// device/DeviceLegoA.js
// LEGO Interface A (Arduino 9750 sketch)
// Synchronous request→reply model (like RCX)
// Per‑device queue (like RCX)
// No read loop, no unsolicited data.

export class LegoInterfaceA {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this._textDecoder = new TextDecoder();
    this._textEncoder = new TextEncoder();

    this.connected = false;

    // ---------------- Queue (RCX-style) ----------------
    this.queue = Promise.resolve();
    this.queueActive = true;
  }

  // ------------------------------------------------------------
  // QUEUE
  // ------------------------------------------------------------
  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }

  // ------------------------------------------------------------
  // CONNECT (not queued)
  // ------------------------------------------------------------
  async connect() {
    try {
      this._logStatus("Requesting serial port for LEGO Interface A…");

      // User selects port
      try {
        this.port = await window.autoSelectPort();
      } catch (err) {
        this._logStatus("User cancelled port selection");
        throw err;
      }

      await this.port.open({ baudRate: 9600 });
      this._logStatus("Serial port opened.");

      this.writer = this.port.writable.getWriter();

      // --------------------------------------------------------
      // HANDSHAKE: VERBOSE ON → (optional echo)
      //            VERBOSE OFF → (mandatory echo)
      // --------------------------------------------------------

      // Flush any garbage
      await this._drainReadBuffer();

      // 1) Send VERBOSE ON
      await this._sendRaw("VERBOSE ON");

      // 2) Try reading optional echo
      let line = await this._readLine(100);
      if (line === "VERBOSE ON") {
        this._logStatus("VERBOSE ON echo received.");
      } else {
        this._logStatus("No VERBOSE ON echo (verbose was OFF before).");
      }

      // Flush again to ensure clean state
      await this._drainReadBuffer();

      // 3) Send VERBOSE OFF
      await this._sendRaw("VERBOSE OFF");

      // 4) MUST read the echo
      line = await this._readLine(200);
      if (line !== "VERBOSE OFF") {
        this._logStatus("Handshake failed: expected VERBOSE OFF echo, got: " + line);
        await this._safeClose();
        throw new Error("LEGO Interface A handshake failed");
      }

      this._logStatus("Arduino handshake OK. VERBOSE OFF, numeric-only mode.");

      // Allocate name only after successful handshake
      if (!this.name) {
        this.name = this.manager._allocateName("LegoA");
      }
      this.connected = true;

      return true;

    } catch (err) {
      this._logStatus("Error during connect: " + err);
      await this._safeClose();

      // Free name if allocated
      if (this.name) {
        this.manager._freeName(this.name);
        this.name = null;
      }

      throw err;
    }
  }

  // ------------------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------------------
  async disconnect() {
    this._logStatus("Disconnecting LEGO Interface A…");

    this.queueActive = false;

    try {
      await this.portsOff();
    } catch (e) {
      this._logStatus("Error while turning ports off: " + e);
    }

    await this._safeClose();
    this.connected = false;

    if (this.name) {
      this.manager._freeName(this.name);
      this.name = null;
    }

    this._logStatus("Disconnected.");
  }

  // ------------------------------------------------------------
  // OUTPUT COMMANDS (queued, no reply expected)
  // ------------------------------------------------------------

  async portsOff() {
    return this.enqueue(async () => {
      for (let p = 0; p <= 5; p++) {
        await this._sendRaw(`PORT ${p} OFF`);
      }
    });
  }

  async outOn(port) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      await this._sendRaw(`PORT ${port} ON`);
    });
  }

  async outOff(port) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      await this._sendRaw(`PORT ${port} OFF`);
    });
  }

  async pwm(port, power) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      const level = this._clamp(power, 0, 255);
      await this._sendRaw(`PWM ${port} ${level}`);
    });
  }

  async comboL(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} LEFT`);
    });
  }

  async comboR(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} RIGHT`);
    });
  }

  async comboOff(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} OFF`);
    });
  }

  async comboPwm(cmb, power) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      const level = this._clamp(power, 0, 255);
      await this._sendRaw(`CPWM ${c} LEFT ${level}`);
    });
  }

  // ------------------------------------------------------------
  // INPUT COMMANDS (queued, reply = number only)
  // ------------------------------------------------------------

  async inputOn(port) {
    return this.inputVal(port);
  }

  async inputVal(port) {
    return this.enqueue(async () => {
      this._assertInputPort(port);
      if (!this.connected || !this.port) {
        this._logStatus("inputVal called while not connected.");
        return 0;
      }

      // Flush before reading
      await this._drainReadBuffer();

      // Send INPUT command
      await this._sendRaw(`INPUT ${port}`);

      // Read numeric reply
      const line = await this._readLine(200);
      if (/^\d+$/.test(line)) {
        return parseInt(line, 10);
      }

      this._logStatus("Invalid INPUT reply: " + line);
      return 0;
    });
  }

  // ------------------------------------------------------------
  // INTERNAL HELPERS
  // ------------------------------------------------------------

  async _sendRaw(cmd) {
    if (!this.writer) {
      this._logStatus("Writer not available, cannot send: " + cmd);
      return;
    }
    this._logTx(cmd);
    await this.writer.write(this._textEncoder.encode(cmd + "\n"));
  }

  async _readLine(timeoutMs) {
    if (!this.port || !this.port.readable) return "";

    const reader = this.port.readable.getReader();
    let buffer = "";

    try {
      const timeout = setTimeout(() => reader.cancel(), timeoutMs);

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += this._textDecoder.decode(value);
          const idx = buffer.indexOf("\n");
          if (idx !== -1) {
            clearTimeout(timeout);
            return buffer.slice(0, idx).trim();
          }
        }
      }

      return "";

    } catch (_) {
      return "";
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }
  }

  async _drainReadBuffer() {
    if (!this.port || !this.port.readable) return;

    let reader;
    try {
      reader = this.port.readable.getReader();

      const readPromise = reader.read();
      const timeoutPromise = new Promise(resolve =>
        setTimeout(resolve, 10, { timeout: true })
      );

      await Promise.race([readPromise, timeoutPromise]);

    } catch (_) {
      // ignore
    } finally {
      try { reader?.releaseLock(); } catch (_) {}
    }
  }

  async _safeClose() {
    try {
      if (this.reader) {
        try { await this.reader.cancel(); } catch (_) {}
        this.reader = null;
      }
      if (this.writer) {
        try { await this.writer.close(); } catch (_) {}
        this.writer = null;
      }
      if (this.port) {
        try { await this.port.close(); } catch (_) {}
        this.port = null;
      }
    } catch (e) {
      this._logStatus("Error while closing port: " + e);
    }
  }

  // ------------------------------------------------------------
  // VALIDATION + UTILITIES
  // ------------------------------------------------------------

  _normalizeCombo(cmb) {
    if (typeof cmb === "number") {
      if (cmb === 0) return "A";
      if (cmb === 1) return "B";
      if (cmb === 2) return "C";
    }
    if (typeof cmb === "string") {
      const c = cmb.trim().toUpperCase();
      if (c === "A" || c === "B" || c === "C") return c;
    }
    throw new Error("Invalid combo port (expected A/B/C or 0/1/2): " + cmb);
  }

  _assertOutputPort(port) {
    if (port < 0 || port > 5) {
      throw new Error("Output port must be between 0 and 5: " + port);
    }
  }

  _assertInputPort(port) {
    if (port !== 6 && port !== 7) {
      throw new Error("Input port must be 6 or 7: " + port);
    }
  }

  _clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  // ------------------------------------------------------------
  // LOGGING
  // ------------------------------------------------------------

  _logStatus(msg) {
    console.log(`[LegoInterfaceA] ${msg}`);
  }

  _logTx(line) {
    console.log(`[LegoInterfaceA TX] ${line.trim()}`);
  }
}
