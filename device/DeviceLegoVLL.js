// device/DeviceVLL.js
// LEGO VLL Visible Light Link using FTDI DTR Pin.

// Sentinel thrown inside a VLL frame when cancelVLL() interrupts it
const VLL_ABORT = Symbol("VLL_ABORT");

export class LegoVLL {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.status = "idle";

    this.preambleMs = 1000;
    this.unitMs = 20;
    this.spinMs = 25;       // busy-wait this last stretch of each pulse (see sleepUntil)

    // ---------------- VLL sending / cancel ----------------
    this.vllQueue = Promise.resolve(); // serializes sendVLL calls
    this._cancelGen = 0;    // bumped by cancelVLL(): skips codes not yet started
    this._abortGen = 0;     // bumped by cancelVLL({ immediate: true }): interrupts the frame in flight
    this._vllWake = null;   // wakes the current wait early when a cancel happens

    // ---------------- Queue ----------------
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
      this._logStatus("Requesting serial port for LEGO VLL…");

      // User selects port
      try {
        this.port = await window.autoSelectPort();
      } catch (err) {
        this._logStatus("User cancelled port selection");
        throw err;
      }

      await this.port.open({
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: "none"
      });

      await this.port.setSignals({ dataTerminalReady: false });

      this._logStatus("Serial port opened.");

      // Allocate name only after successful handshake
      if (!this.name) {
        this.name = this.manager._allocateName("VLL");
      }
      this.status = "Connected";

      return true;

    } catch (err) {
      this._logStatus("Error during connect: " + err);
      await this._safeClose();

      // Free name if allocated
      if (this.name) {
        this.manager._removeDevice(this);
        this.name = null;
      }

      throw err;
    }
  }

  // ------------------------------------------------------------
  // DISCONNECT
  // ------------------------------------------------------------
	async disconnect() {
		this._logStatus("Disconnecting VLL...");

		await this.cancelVLL(); // stop any VLL transmission before closing the port

		this.queueActive = false;

		await this._safeClose();

    this.status = "Disconnected";

		if (this.name) {
			this.manager._removeDevice(this);
			this.name = null;
		}

		this._logStatus("Disconnected.");
	}

  // ------------------------------------------------------------
  // VLL TIMING
  // ------------------------------------------------------------

  // Wait until `deadline` (performance.now() time). The bulk of a long wait (the
  // 1000 ms preamble) uses setTimeout so the page stays responsive and cancelVLL()
  // can interrupt it; the last `spinMs` are busy-waited for precision. With the
  // default spinMs (25) every 20-60 ms pulse is fully busy-waited, as before.
  async sleepUntil(deadline) {
    const coarse = deadline - performance.now() - this.spinMs;
    if (coarse > 0) {
      const interrupted = await new Promise(resolve => {
        let timer;
        const finish = (wasInterrupted) => {
          clearTimeout(timer);
          if (this._vllWake === finish) this._vllWake = null;
          resolve(wasInterrupted === true);
        };
        timer = setTimeout(finish, coarse);
        this._vllWake = finish;
      });
      if (interrupted) return;
    }
    while (performance.now() < deadline) {
      // Busy wait
    }
  }

  async sleepPrecise(ms) {
    await this.sleepUntil(performance.now() + ms);
  }

  // `gen` is the abort generation of the frame being sent: if cancelVLL() has bumped
  // it since, the pulse is dropped by throwing VLL_ABORT.
  async pulse(on, durationMs, gen = this._abortGen) {
    if (gen !== this._abortGen) throw VLL_ABORT;
    await this.port.setSignals({ dataTerminalReady: on });
    await this.sleepPrecise(durationMs);
    if (gen !== this._abortGen) throw VLL_ABORT;
  }

  // ------------------------------------------------------------
  // VLL SENDING
  // ------------------------------------------------------------

  // Turn the `codes` argument into a validated array of integers 0-127.
  // Accepts: a number, an array of numbers, or a comma-separated string ("1, 2, 3").
  parseVLLCodes(codes) {
    let items;
    if (typeof codes === "number") {
      items = [codes];
    } else if (typeof codes === "string") {
      items = codes.split(",").map(s => s.trim()).filter(s => s !== "");
    } else if (Array.isArray(codes)) {
      items = codes;
    } else {
      throw new TypeError("VLL codes must be a number, an array or a comma-separated string");
    }

    if (items.length === 0) {
      throw new RangeError("No VLL code provided");
    }

    return items.map(item => {
      const n = typeof item === "string" ? Number(item.trim()) : item;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 127) {
        throw new RangeError(`VLL code must be an integer from 0 to 127, got ${JSON.stringify(item)}`);
      }
      return n;
    });
  }

  // Send one or more VLL codes.
  //   codes: a number 0-127, an array of codes, or a comma-separated string.
  // Everything is validated before anything is sent. Calls are queued so two
  // transmissions never overlap. Resolves to { sent, total, cancelled }.
  sendVLL(codes) {
    if (!this.port) {
      return Promise.reject(new Error("VLL device is not connected"));
    }

    let list;
    try {
      list = this.parseVLLCodes(codes);
    } catch (err) {
      return Promise.reject(err);
    }

    // A cancelVLL() issued after this call bumps the generation and skips this call
    const cancelGen = this._cancelGen;

    const run = async () => {
      let sent = 0;
      for (let i = 0; i < list.length; i++) {
        if (this._cancelGen !== cancelGen) break;

        const completed = await this._sendVLLCode(list[i]);
        if (!completed) break;
        sent++;
      }
      return { sent, total: list.length, cancelled: sent < list.length };
    };
    this.vllQueue = this.vllQueue.then(run, run);
    return this.vllQueue;
  }

  // Cancel VLL transmissions.
  //   - Calls queued behind the current one are dropped.
  //   - Codes of the current call that have not started are dropped.
  //   - immediate = true (default): the frame being sent is interrupted at once.
  //     immediate = false: that one frame is finished first.
  // The DTR line is switched off. Resolves once the VLL queue is idle again.
  cancelVLL({ immediate = true } = {}) {
    this._cancelGen++;
    if (immediate) {
      this._abortGen++;
      if (this._vllWake) this._vllWake(true);
    }
    return this.vllQueue.then(() => {}, () => {});
  }

  // Send a single 7-bit code (frame: preamble, start, checksum, data, stop).
  // Resolves true if the whole frame was sent, false if it was interrupted by cancelVLL().
  async _sendVLLCode(data7) {
    const unit = this.unitMs;
    const gen = this._abortGen;

    const bit0 = async () => {
      await this.pulse(true, 2 * unit, gen);
      await this.pulse(false, 1 * unit, gen);
    };

    const bit1 = async () => {
      await this.pulse(true, 1 * unit, gen);
      await this.pulse(false, 2 * unit, gen);
    };

    const checksum = (n) => 7 - ((n + (n >> 2) + (n >> 4)) & 7);

    try {
      // 1. Preamble
      await this.pulse(true, this.preambleMs, gen);

      // 2. Start bit
      await this.pulse(false, unit, gen);

      // 3. Checksum (3 bits, MSB first)
      const c = checksum(data7);
      for (let i = 2; i >= 0; i--) {
        if ((c >> i) & 1) await bit1(); else await bit0();
      }

      // 4. Data (7 bits, MSB first)
      for (let i = 6; i >= 0; i--) {
        if ((data7 >> i) & 1) await bit1(); else await bit0();
      }

      // 5. Stop bit
      await this.pulse(true, unit, gen);
      await this.pulse(false, 3 * unit, gen);

      // 6. Postamble
      //await this.pulse(false, 1000, gen);
      return true;
    } catch (err) {
      if (err === VLL_ABORT) return false; // cancelled: not an error
      throw err;
    } finally {
      // Never leave the light on if the transmission is interrupted
      try { await this.port?.setSignals({ dataTerminalReady: false }); } catch {}
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
  // LOGGING
  // ------------------------------------------------------------

  _logStatus(msg) {
    console.log(`[VLL Serial] ${msg}`);
  }

}