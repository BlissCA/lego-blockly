// device/DeviceVLL.js
// LEGO VLL Visible Light Link using FTDI DTR Pin.

export class LegoVLL {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.status = "idle";

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

		this.queueActive = false;

		await this._safeClose();

    this.status = "Disconnected";

		if (this.name) {
			this.manager._removeDevice(this);
			this.name = null;
		}

		this._logStatus("Disconnected.");
	}

  async sleepPrecise(ms) {
    const start = performance.now();
    while (performance.now() - start < ms) {
      // Busy wait
    }
  }

  async pulse(on, durationMs) {
    await this.port.setSignals({ dataTerminalReady: on });
    await this.sleepPrecise(durationMs);
  }

  async sendVLL(data7) {
    const unit = 20;

    const bit0 = async () => {
      await this.pulse(true, 2 * unit);
      await this.pulse(false, 1 * unit);
    }

    const bit1 = async () => {
      await this.pulse(true, 1 * unit);
      await this.pulse(false, 2 * unit);
    }

    function checksum(n) {
      return 7 - ((n + (n >> 2) + (n >> 4)) & 7);
    }

    // 1. Preamble
    await this.pulse(true, 1000);

    // 2. Start bit
    await this.pulse(false, unit);

    // 3. Checksum (3 bits, MSB first)
    let c = checksum(data7);
    for (let i = 2; i >= 0; i--) {
      (c >> i & 1) ? await bit1() : await bit0();
    }

    // 4. Data (7 bits, MSB first)
    for (let i = 6; i >= 0; i--) {
      (data7 >> i & 1) ? await bit1() : await bit0();
    }

    // 5. Stop bit
    await this.pulse(true, unit);
    await this.pulse(false, 3 * unit);

    // 6. Postamble
    //await this.pulse(true, 120);
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