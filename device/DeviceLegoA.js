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

			await new Promise(r => setTimeout(r, 50));

      // Flush again to ensure clean state
      //await this._drainReadBuffer();

      // 3) Send VERBOSE OFF
      await this._sendRaw("VERBOSE OFF");

			// 4) Read until we see VERBOSE OFF (ignore empty lines)
			let echo = "";
			for (let i = 0; i < 10; i++) {   // up to 10 attempts
				let line2 = await this._readLine(200);
				if (line2 === "VERBOSE OFF") {
					echo = line2;
					break;
				}
			}

			if (echo !== "VERBOSE OFF") {
				this._logStatus("Handshake failed: expected VERBOSE OFF echo");
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

		try {
			// 1) Turn ports off while queue is still active
			await this.portsOff();
		} catch (e) {
			this._logStatus("Error while turning ports off: " + e);
		}

		// 2) Stop the queue AFTER portsOff()
		this.queueActive = false;

		// 3) Close the port
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
				await new Promise(r => setTimeout(r, 5));   // small cooldown
      }
    });
  }

  async outOn(port) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      await this._sendRaw(`PORT ${port} ON`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async outOff(port) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      await this._sendRaw(`PORT ${port} OFF`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async pwm(port, power) {
    return this.enqueue(async () => {
      this._assertOutputPort(port);
      const level = this._clamp(power, 0, 255);
      await this._sendRaw(`PWM ${port} ${level}`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async comboL(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} LEFT`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async comboR(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} RIGHT`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async comboOff(cmb) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      await this._sendRaw(`COMBO ${c} OFF`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async comboPwmL(cmb, power) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      const level = this._clamp(power, 0, 255);
      await this._sendRaw(`CPWM ${c} LEFT ${level}`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  async comboPwmR(cmb, power) {
    return this.enqueue(async () => {
      const c = this._normalizeCombo(cmb);
      const level = this._clamp(power, 0, 255);
      await this._sendRaw(`CPWM ${c} RIGHT ${level}`);
			await new Promise(r => setTimeout(r, 5));   // small cooldown
    });
  }

  // ------------------------------------------------------------
  // INPUT COMMANDS (queued, reply = number only)
  // ------------------------------------------------------------

	async inputOn(port) {
		const v = await this.inputVal(port);
		return v >= 1020;
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
    //this._logTx(cmd);
    await this.writer.write(this._textEncoder.encode(cmd + "\n"));
  }

	async _readLine(timeoutMs = 200) {
		const reader = this.port.readable.getReader();
		let buffer = "";
		let done = false;

		// Timeout promise
		let timeoutId;
		const timeoutPromise = new Promise(resolve => {
			timeoutId = setTimeout(() => {
				done = true;
				resolve(null); // timeout
			}, timeoutMs);
		});

		// Read loop promise
		const readPromise = (async () => {
			try {
				while (!done) {
					const { value, done: streamDone } = await reader.read();
					if (streamDone) break;
					if (!value) continue;

					buffer += this._textDecoder.decode(value);

					// Check for newline
					const nl = buffer.indexOf("\n");
					if (nl !== -1) {
						const line = buffer.slice(0, nl).trim();
						buffer = buffer.slice(nl + 1);
						done = true;
						return line;
					}
				}
			} catch (_) {
				// Ignore read errors
			}
			return null;
		})();

		// Race timeout vs read
		const result = await Promise.race([readPromise, timeoutPromise]);

		clearTimeout(timeoutId);

		try { reader.releaseLock(); } catch (_) {}

		return result;
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
			// Stop any pending read loop
			if (this.reader) {
				try {
					// Only cancel if the reader still has a lock
					if (this.reader.releaseLock === undefined) {
						// Old reader object, ignore
					} else {
						try { await this.reader.cancel(); } catch (_) {}
						try { this.reader.releaseLock(); } catch (_) {}
					}
				} catch (_) {}
				this.reader = null;
			}

			// Close writer
			if (this.writer) {
				try { await this.writer.close(); } catch (_) {}
				try { this.writer.releaseLock(); } catch (_) {}
				this.writer = null;
			}

			// Close port
			if (this.port) {
				try { await this.port.close(); } catch (_) {}
				this.port = null;
			}

			// Give Web Serial time to fully release the port
			await new Promise(r => setTimeout(r, 30));

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
