// device/DeviceLegoA.js
// Lego Interface A.
// Must use Arduino board with Sketch Lego9750.ino or compatible.
//

// DeviceLegoA.js

export class LegoInterfaceA {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this._rxBuffer = "";
    this._pendingReply = null;   // for VERBOSE OFF handshake
    this._pendingInput = null;   // for INPUT 6/7 value
    this._textDecoder = new TextDecoder();
    this._textEncoder = new TextEncoder();

    this.connected = false;
  }

  // ---------- Public API ----------

  async connect() {
    try {
      this._logStatus("Requesting serial port for LEGO Interface A…");
        // 1. User selects a port
        try {
        this.port = await window.autoSelectPort();  // WAS: await navigator.serial.requestPort();
        } catch (err) {
        this.log("User cancelled port selection");
        throw err;  // bubble up to deviceManager
        }

      // 2. NOW allocate the name

      if (!this.name) {
        this.name = this.manager._allocateName("LegoA");
      }
    
      await this.port.open({ baudRate: 9600 });

      this._logStatus("Serial port opened. Draining buffer…");
      await this._drainReadBuffer();

      this.writer = this.port.writable.getWriter();
      this._startReadLoop();

      this._logStatus("Performing VERBOSE handshake…");
      await this._sendCommand("VERBOSE ON", false); // ignore reply

      const ok = await this._waitForReply("VERBOSE OFF", 1000);
      if (!ok) {
        this._logStatus("Please connect Arduino (no VERBOSE OFF reply).");
        await this._safeClose();
        return false;
      }

      this._logStatus("Arduino handshake OK. VERBOSE OFF, ready.");
      this.connected = true;
      return true;
    } catch (err) {
      this._logStatus("Error during connect: " + err);
      await this._safeClose();
      return false;
    }
  }

  async disconnect() {
    this._logStatus("Disconnecting LEGO Interface A…");
    try {
      // Turn all ports off before disconnecting
      await this.portsOff();
    } catch (e) {
      this._logStatus("Error while turning ports off: " + e);
    }
    await this._safeClose();
    this.connected = false;

    // Free the name if it was allocated
    if (this.name) {
      this.manager._freeName(this.name);
      this.name = null;
    }

 //   this.setStatus("disconnected", "Disconnected");

    this._logStatus("Disconnected.");
  }

  // Turn all outputs OFF (0..5)
  async portsOff() {
    for (let p = 0; p <= 5; p++) {
      await this.outOff(p);
    }
  }

  // ---------- Outputs ----------

  async outOn(port) {
    this._assertOutputPort(port);
    await this._sendCommand(`PORT ${port} ON`, false);
  }

  async outOff(port) {
    this._assertOutputPort(port);
    await this._sendCommand(`PORT ${port} OFF`, false);
  }

  async pwm(port, power) {
    this._assertOutputPort(port);
    const level = this._clamp(power, 0, 255);
    await this._sendCommand(`PWM ${port} ${level}`, false);
  }

  async comboL(cmb) {
    const c = this._normalizeCombo(cmb);
    await this._sendCommand(`COMBO ${c} LEFT`, false);
  }

  async comboR(cmb) {
    const c = this._normalizeCombo(cmb);
    await this._sendCommand(`COMBO ${c} RIGHT`, false);
  }

  async comboOff(cmb) {
    const c = this._normalizeCombo(cmb);
    await this._sendCommand(`COMBO ${c} OFF`, false);
  }

  async comboPwm(cmb, power) {
    const c = this._normalizeCombo(cmb);
    const level = this._clamp(power, 0, 255);
    // CPWM A|B|C LEFT|RIGHT [0..255]
    // For now, assume LEFT direction for PWM; can be extended later.
    await this._sendCommand(`CPWM ${c} LEFT ${level}`, false);
  }

  // ---------- Inputs ----------

  // Alias-style method: request value for port 6 or 7
  async inputOn(port) {
    return this.inputVal(port);
  }

  // Request value for port 6 or 7, returns Promise<number>
  async inputVal(port) {
    this._assertInputPort(port);
    if (!this.connected || !this.port) {
      this._logStatus("inputVal called while not connected.");
      return 0;
    }

    // If a previous input request is pending, cancel it
    if (this._pendingInput && this._pendingInput.timeoutId) {
      clearTimeout(this._pendingInput.timeoutId);
      this._pendingInput = null;
    }

    const cmd = `INPUT ${port}`;
    this._logStatus(`Requesting input value: ${cmd}`);

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this._logStatus(`Timeout waiting for ${cmd} reply. Returning 0.`);
        if (this._pendingInput && this._pendingInput.cmd === cmd) {
          this._pendingInput = null;
        }
        resolve(0);
      }, 1000);

      this._pendingInput = {
        cmd,
        resolve,
        timeoutId,
      };

      await this._sendCommand(cmd, false);
    });
  }

  // ---------- Internal helpers ----------

  async _sendCommand(cmd, logReply = true) {
    if (!this.writer) {
      this._logStatus("Writer not available, cannot send: " + cmd);
      return;
    }
    const line = cmd + "\n";
    this._logTx(line);
    await this.writer.write(this._textEncoder.encode(line));
    // logReply is kept for parity with other devices; here we don't wait for output replies.
  }

  async _waitForReply(matchText, timeoutMs) {
    // Cancel any previous reply waiter
    if (this._pendingReply && this._pendingReply.timeoutId) {
      clearTimeout(this._pendingReply.timeoutId);
      this._pendingReply = null;
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (this._pendingReply && this._pendingReply.matchText === matchText) {
          this._pendingReply = null;
        }
        resolve(false);
      }, timeoutMs);

      this._pendingReply = {
        matchText,
        resolve,
        timeoutId,
      };
    });
  }

  async _drainReadBuffer() {
    if (!this.port || !this.port.readable) return;

    try {
      const tempReader = this.port.readable.getReader();
      while (true) {
        const { value, done } = await tempReader.read();
        if (done || !value) break;
        // discard everything
      }
      tempReader.releaseLock();
    } catch (e) {
      // ignore errors while draining
    }

    this._rxBuffer = "";
  }

  _startReadLoop() {
    if (!this.port || !this.port.readable) return;

    const reader = this.port.readable.getReader();
    this.reader = reader;

    const loop = async () => {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const text = this._textDecoder.decode(value);
            this._onData(text);
          }
        }
      } catch (e) {
        this._logStatus("Read loop error: " + e);
      } finally {
        reader.releaseLock();
        this.reader = null;
      }
    };

    loop();
  }

  _onData(chunk) {
    this._rxBuffer += chunk;
    let idx;
    while ((idx = this._rxBuffer.indexOf("\n")) !== -1) {
      const line = this._rxBuffer.slice(0, idx).trim();
      this._rxBuffer = this._rxBuffer.slice(idx + 1);
      if (line.length === 0) continue;
      this._handleLine(line);
    }
  }

  _handleLine(line) {
    this._logRx(line);

    // 1) Handshake / generic reply waiter
    if (this._pendingReply) {
      if (line.includes(this._pendingReply.matchText)) {
        const { resolve, timeoutId } = this._pendingReply;
        clearTimeout(timeoutId);
        this._pendingReply = null;
        resolve(true);
        return;
      }
    }

    // 2) INPUT value (numeric only when VERBOSE OFF)
    if (this._pendingInput) {
      if (/^\d+$/.test(line)) {
        const value = parseInt(line, 10);
        const { resolve, timeoutId } = this._pendingInput;
        clearTimeout(timeoutId);
        this._pendingInput = null;
        resolve(value);
        return;
      }
    }

    // 3) Otherwise, just log it (could be leftover verbose or debug)
  }

  async _safeClose() {
    try {
      if (this.reader) {
        try {
          await this.reader.cancel();
        } catch (_) {}
        this.reader = null;
      }
      if (this.writer) {
        try {
          await this.writer.close();
        } catch (_) {}
        this.writer = null;
      }
      if (this.port) {
        try {
          await this.port.close();
        } catch (_) {}
        this.port = null;
      }
    } catch (e) {
      this._logStatus("Error while closing port: " + e);
    }
  }

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

  // ---------- Logging helpers (adapt to your status log system) ----------

  _logStatus(msg) {
    // Replace with your status log integration if needed
    console.log(`[LegoInterfaceA] ${msg}`);
  }

  _logTx(line) {
    console.log(`[LegoInterfaceA TX] ${line.trim()}`);
  }

  _logRx(line) {
    console.log(`[LegoInterfaceA RX] ${line}`);
  }
}
