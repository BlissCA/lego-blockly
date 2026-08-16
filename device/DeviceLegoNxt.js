// device/DeviceLegoNxt.js

export class LegoNxt {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.reader = null;
    this.writer = null;

    this.status = "idle";

    this.queue = Promise.resolve();
    this.queueActive = true;

    this.isBluetooth = false;

    this.lsPortInitialized = [false, false, false, false]; // index 0 = port 1, index 1 = port 2, etc.
  }

  log(msg) {
    console.log(`[Nxt ${this.name || "?"}] ${msg}`);
  }

  enqueue(fn) {
    if (!this.queueActive) return Promise.resolve();
    this.queue = this.queue.then(fn).catch(err => console.error(err));
    return this.queue;
  }


	async connect() {
			this.log("Connecting to NXT...");

			// ---------------------------------------------------------
			// STEP 1 — Try Bluetooth first (filtered)
			// ---------------------------------------------------------
			try {
					// Always show Serial picker
					this.port = await navigator.serial.requestPort();
					this.isBluetooth = true;

					// --- Open BT serial port ---
					await this.port.open({
							baudRate: 115200,
							dataBits: 8,
							stopBits: 1,
							parity: "none",
							bufferSize: 32 * 1024
					});

					this.writer = this.port.writable.getWriter();
					this.reader = this.port.readable.getReader();

					const ok = await this.keepAlive();
					if (!ok) {
							this.log("NXT did not respond to KeepAlive (BT).");
							window.logStatus("Nxt: Please power on the device and Reconnect.");
							await this.disconnect();
							return;
					}

					if (!this.name) {
							this.name = this.manager._allocateName("Nxt");
					}

					this.log("Connected via Bluetooth.");
					this.status = "Connected";
					return;

			} catch (err) {
					if (err.name === "AbortError") {
							this.log("User cancelled Bluetooth port selection.");
					} else {
							this.log("Bluetooth connection failed:", err);
					}
			}

			// ---------------------------------------------------------
			// STEP 2 — Serial canceled → ALWAYS show WebUSB picker
			// ---------------------------------------------------------
			this.log("Requesting NXT USB device...");

			try {
					this.device = await navigator.usb.requestDevice({
							filters: [{ vendorId: 0x0694 }]
					});

			} catch (err) {
					this.log("User cancelled USB device selection.");
					throw new Error("No NXT Bluetooth or USB device available.");
			}

			// ---------------------------------------------------------
			// STEP 3 — Connect via USB
			// ---------------------------------------------------------
			this.isWebUSB = true;

			await this.device.open();
			await this.device.selectConfiguration(1);
			await this.device.claimInterface(0);

			this.usbOut = 1;
			this.usbIn  = 2;

			this.log("Sending KeepAlive USB...");

			const ok = await this.keepAlive();
			if (!ok) {
					this.log("NXT did not respond to KeepAlive (USB).");
					window.logStatus("Nxt: Please power on the device and Reconnect.");
					await this.disconnect();
					return;
			}

			if (!this.name) {
					this.name = this.manager._allocateName("Nxt");
			}

			this.log("Connected via USB.");
			this.status = "Connected";
	}


	async disconnect() {
		this.queueActive = false;

		try { this.reader?.releaseLock(); } catch {}
		try { this.writer?.releaseLock(); } catch {}

		if (this.isWebUSB && this.device) {
			try { await this.device.close(); } catch {}
		} else {
			try { await this.port?.close(); } catch {}
		}

		this.reader = null;
		this.writer = null;
		this.port = null;
		this.device = null;

		if (this.name) {
			this.manager._removeDevice(this);
			this.name = null;
		}

		this.status = "Disconnected";
	}

  resetPortStates() {
      this.lsPortInitialized = [false, false, false, false];
  }

  // ---------------- Low-level packet I/O ----------------

	async writeBytes(bytes) {
		// --- USB transport ---
		if (this.isWebUSB && this.device) {
			await this.device.transferOut(this.usbOut, bytes);
			return;
		}

		// --- Serial transport ---
		if (!this.writer) return;
		await this.writer.write(bytes);
	}

  _buildCommand(opcode, payload = [], noReply = false) {
    const type = noReply ? 0x80 : 0x00;
    const cmd = Uint8Array.from([type, opcode, ...payload]);

		if (this.isWebUSB) {
			const usbPacket = new Uint8Array(64); // Initializes all 64 bytes to 0x00
			usbPacket.set(cmd);                   // Copies your command bytes into the front
			return usbPacket;
		}

    const len = cmd.length;
    const lsb = len & 0xFF;
    const msb = (len >> 8) & 0xFF;
    return Uint8Array.from([lsb, msb, ...cmd]);
  }

	async _readReply(expectedOpcode) {
		const timeoutMs = 1000;
		const t0 = performance.now();

		// ---------------------------------------------------------
		// USB (LEGO Windows driver — fixed 64-byte packets)
		// ---------------------------------------------------------
		if (this.isWebUSB) {
			this.log("Waiting for Reply (USB)...");

			while (performance.now() - t0 < timeoutMs) {
				const result = await this.device.transferIn(this.usbIn, 64);
				if (!result || result.status !== "ok") continue;

				const reply = new Uint8Array(result.data.buffer);

				// Must start with reply telegram type
				if (reply[0] !== 0x02) continue;

				// Must match opcode
				if (reply[1] !== expectedOpcode) continue;

				// Trim trailing zeros
				let end = reply.length;
				while (end > 0 && reply[end - 1] === 0x00) end--;

				const pkt = reply.slice(0, end);
				return pkt;
			}

			return null;
		}

		// ---------------------------------------------------------
		// BLUETOOTH (framed packets with length header)
		// ---------------------------------------------------------
		let collected = new Uint8Array(0);

		const append = (chunk) => {
			const tmp = new Uint8Array(collected.length + chunk.length);
			tmp.set(collected);
			tmp.set(chunk, collected.length);
			collected = tmp;
		};

		const readChunk = async () => {
			const { value, done } = await this.reader.read();
			if (done || !value) return null;
			append(value);
			return value.length;
		};

		// Read length header
		while (collected.length < 2 && performance.now() - t0 < timeoutMs) {
			const n = await readChunk();
			if (!n) break;
		}
		if (collected.length < 2) return null;

		const len = collected[0] | (collected[1] << 8);

		// Read full packet
		while (collected.length < 2 + len && performance.now() - t0 < timeoutMs) {
			const n = await readChunk();
			if (!n) break;
		}
		if (collected.length < 2 + len) return null;

		const pkt = collected.slice(2, 2 + len);
		if (pkt[0] !== 0x02) return null;
		if (pkt[1] !== expectedOpcode) return null;

		return pkt;
	}

  async _sendCommand(opcode, payload = [], expectReply = true) {
    return this.enqueue(async () => {
      const noReply = !expectReply;
      const buff = this._buildCommand(opcode, payload, noReply);
      await this.writeBytes(buff);

      if (!expectReply) return null;

      const reply = await this._readReply(opcode);
      if (!reply) return null;
			
      const status = reply[2];
      if (status !== 0x00) {
        this.log(`NXT error for opcode 0x${opcode.toString(16)}: status 0x${status.toString(16)}`);
        return null;
      }
      return reply;
    });
  }

  _clamp(v, min, max) {
    v = Number(v);
    if (isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
	}

	_isValidNxtBtPort(port) {
		const info = port.getInfo();

		// Reject inbound ports (Windows marks them differently)
		if (info.serialNumber && info.serialNumber.includes("IN")) return false;

		// Prefer ports with names
		if (port.displayName && port.displayName.includes("NXT")) return true;
		if (port.displayName && port.displayName.includes("Mindstorms")) return true;

		// Otherwise accept outbound SPP ports (no USB IDs)
		if (!info.usbVendorId && !info.usbProductId) return true;

		return false;
	}

	async _readUsbChunk() {
		try {
			const result = await this.device.transferIn(this.usbIn, 64);
			if (!result || !result.data) return null;
			return new Uint8Array(result.data.buffer);
		} catch {
			return null;
		}
	}

  // ---------------- High-level commands ----------------

  // 0x0D KeepAlive (response required)
	async keepAlive() {
		const reply = await this._sendCommand(0x0D, [], true);
		if (!reply) return null;

		// reply[0] = 0x02 (reply telegram)
		// reply[1] = 0x0D (opcode)
		const status = reply[2];

		// Sleep timeout (ULONG, little-endian)
		const sleepTimeoutMs =
				reply[3] |
				(reply[4] << 8) |
				(reply[5] << 16) |
				(reply[6] << 24);

		return {
			ok: status === 0,
			status,
			sleepTimeoutMs,
			sleepTimeoutMinutes: sleepTimeoutMs / 60000
		};
	}

  // 0x00 StartProgram (no response)
  async startProgram(name) {
    const enc = new TextEncoder();
    const bytes = enc.encode(name);
    const buf = new Uint8Array(20);
    buf.fill(0);
    buf.set(bytes.slice(0, 19), 0);
    await this._sendCommand(0x00, Array.from(buf), false);
  }

  // 0x01 StopProgram (no response)
  async stopProgram() {
    await this._sendCommand(0x01, [], false);
  }

  // 0x02 PlaySoundFile (no response)
  async playSoundFile(name, loop = false) {
    const enc = new TextEncoder();
    const bytes = enc.encode(name);
    const buf = new Uint8Array(20);
    buf.fill(0);
    buf.set(bytes.slice(0, 19), 0);
    const payload = [loop ? 1 : 0, ...buf];
    await this._sendCommand(0x02, payload, false);
  }

  // 0x03 PlayTone (no response)
  async playTone(freqHz, durationMs) {
    const f = this._clamp(freqHz, 200, 14000);
    const d = this._clamp(durationMs, 0, 0xFFFF);
    const payload = [
      f & 0xFF,
      (f >> 8) & 0xFF,
      d & 0xFF,
      (d >> 8) & 0xFF
    ];
    await this._sendCommand(0x03, payload, false);
  }

  // 0x04 SetOutputState (no response)
  async setOutputState(port, power, mode, regulationMode, turnRatio, runState, tachoLimit = 0) {
    const p = port & 0xFF;
    const pw = this._clamp(power, -100, 100);
    const m = mode & 0xFF;
    const reg = regulationMode & 0xFF;
    const tr = this._clamp(turnRatio, -100, 100);
    const rs = runState & 0xFF;
    const tl = tachoLimit >>> 0;

    const payload = [
      p,
      pw,
      m,
      reg,
      tr,
      rs,
      tl & 0xFF,
      (tl >> 8) & 0xFF,
      (tl >> 16) & 0xFF,
      (tl >> 24) & 0xFF
    ];
    await this._sendCommand(0x04, payload, false);
  }

  // 0x05 SetInputMode (no response)
  async setInputMode(port, sensorType, sensorMode) {
    const payload = [
      port & 0xFF,
      sensorType & 0xFF,
      sensorMode & 0xFF
    ];
    await this._sendCommand(0x05, payload, false);
  }

  // 0x06 GetOutputState (response required)
  async getOutputState(port) {
    const reply = await this._sendCommand(0x06, [port & 0xFF], true);
    if (!reply) return null;

    return {
      port: reply[3],
      power: reply[4],
      mode: reply[5],
      regulationMode: reply[6],
      turnRatio: reply[7],
      runState: reply[8],
      tachoLimit:
        reply[9] |
        (reply[10] << 8) |
        (reply[11] << 16) |
        (reply[12] << 24),
      tachoCount:
        reply[13] |
        (reply[14] << 8) |
        (reply[15] << 16) |
        (reply[16] << 24),
      blockTachoCount:
        reply[17] |
        (reply[18] << 8) |
        (reply[19] << 16) |
        (reply[20] << 24),
      rotationCount:
        reply[21] |
        (reply[22] << 8) |
        (reply[23] << 16) |
        (reply[24] << 24)
    };
  }

  // 0x07 GetInputValues (response required)
  async getInputValues(port) {
    const reply = await this._sendCommand(0x07, [port & 0xFF], true);
    if (!reply) return null;

    return {
      port: reply[3],
      valid: !!reply[4],
      calibrated: !!reply[5],
      sensorType: reply[6],
      sensorMode: reply[7],
      rawValue: reply[8] | (reply[9] << 8),
      normalizedValue: reply[10] | (reply[11] << 8),
      scaledValue: (reply[12] | (reply[13] << 8)),
      calibratedValue: (reply[14] | (reply[15] << 8))
    };
  }

  // 0x08 ResetInputScaledValue (no response)
  async resetInputScaledValue(port) {
    await this._sendCommand(0x08, [port & 0xFF], false);
  }

  // 0x09 MessageWrite (no response)
  async messageWrite(inbox, value, isNumber = false) {
    let bytes;

    if (isNumber) {
      // Float32 LE + null terminator
      const buf = new ArrayBuffer(4);
      const view = new DataView(buf);
      view.setFloat32(0, value, true); // little-endian
      bytes = [...new Uint8Array(buf), 0x00];
    } else {
      // ASCII text + null terminator
      const enc = new TextEncoder();
      bytes = [...enc.encode(value), 0x00];
    }

    const size = Math.min(bytes.length, 59);

    const payload = [
      inbox & 0xFF,
      size & 0xFF,
      ...bytes.slice(0, size)
    ];

    await this._sendCommand(0x09, payload, false);
  }

  // 0x0A ResetMotorPosition (no response)
  async resetMotorPosition(port, relative = false) {
    const payload = [
      port & 0xFF,
      relative ? 1 : 0
    ];
    await this._sendCommand(0x0A, payload, false);
  }

  // 0x0B GetBatteryLevel (response required)
  async getBatteryLevel() {
    const reply = await this._sendCommand(0x0B, [], true);
    if (!reply) return null;
    const mv = reply[3] | (reply[4] << 8);
    return mv;
  }

  // 0x0C StopSoundPlayback (no response)
  async stopSoundPlayback() {
    await this._sendCommand(0x0C, [], false);
  }

  // 0x11 GetCurrentProgramName (response required)
  async getCurrentProgramName() {
    const reply = await this._sendCommand(0x11, [], true);
    if (!reply) return null;

    const nameBytes = reply.slice(3, 23);
    const dec = new TextDecoder();
    const text = dec.decode(nameBytes).replace(/\0.*$/, "");
    return text;
  }

  // 0x13 MessageRead (response required)
  async messageRead(remoteInbox, localInbox = 0, remove = true, isNumber = false) {
    const payload = [
      (remoteInbox + 10) & 0xFF,
      localInbox & 0xFF,
      remove ? 1 : 0
    ];

    const reply = await this._sendCommand(0x13, payload, true);
    if (!reply) return null;

    const size = reply[4];
    if (size === 0) return null;

    // Convert Uint8Array → normal array
    let data = Array.from(reply.slice(5, 5 + size));

    // Remove trailing null
    if (data[data.length - 1] === 0) {
      data.pop();
    }

    if (isNumber) {
      if (data.length !== 4) return null;
      const buf = new Uint8Array(data).buffer;
      const view = new DataView(buf);
      return view.getFloat32(0, true);
    }

    const dec = new TextDecoder();
    return dec.decode(new Uint8Array(data));
  }

  async lsTransaction(port, txBytes, rxLength) {
    try {
      const idx = port - 1;

      // ---------------------------------------------------------
      // 1. Initialize LS mode only once per port
      // ---------------------------------------------------------
      if (!this.lsPortInitialized[idx]) {
        await this._sendCommand(0x05, [port, 0x0B, 0x00], true);
        this.lsPortInitialized[idx] = true;
      }

      // ---------------------------------------------------------
      // 2. LSWRITE
      // ---------------------------------------------------------
      const txLen = txBytes.length;

      await this._sendCommand(0x0F, [
        port,
        txLen,
        rxLength,
        ...txBytes
      ], true);

      // ---------------------------------------------------------
      // 3. If rxLength = 0 → write-only transaction
      // ---------------------------------------------------------
      if (rxLength === 0) {
        return [];   // no data expected
      }

      // ---------------------------------------------------------
      // 4. Poll LSGETSTATUS until rxLength bytes are available
      // ---------------------------------------------------------
      let available = 0;
      let attempts = 0;

      while (available < rxLength && attempts < 20) {
        await new Promise(r => setTimeout(r, 15));

        const status = await this._sendCommand(0x0E, [port], true);
        if (!status) break;

        if (status[2] === 0x00) {
          available = status[3];
        }

        attempts++;
      }

      if (available < rxLength) {
        return null; // timeout
      }

      // ---------------------------------------------------------
      // 5. LSREAD
      // ---------------------------------------------------------
      const read = await this._sendCommand(0x10, [port], true);
      if (!read || read[2] !== 0x00) {
        return null;
      }

      const data = read.slice(4, 4 + rxLength);
      return Array.from(data);

    } catch (err) {
      console.error("LS transaction failed:", err);
      return null;
    }
  }

}

window.LegoNxt = LegoNxt;
