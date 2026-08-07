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

  //  if (!this.isBluetooth) {
  //    return cmd;
  //  }
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
			let collected = new Uint8Array(0);

			const append = (value) => {
					const tmp = new Uint8Array(collected.length + value.length);
					tmp.set(collected);
					tmp.set(value, collected.length);
					collected = tmp;
			};

			// ---------------------------------------------------------
			// SERIAL (Bluetooth SPP or CDC USB)
			// ---------------------------------------------------------
			if (this.isBluetooth) {
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

			// ---------------------------------------------------------
			// USB (WebUSB bulk endpoints)
			// ---------------------------------------------------------
			if (this.isWebUSB) {

				this.log("Waiting for Reply (USB)...");

				const result = await this.device.transferIn(2, 64);

				if (result.status === 'ok') {
						// Convert DataView to Uint8Array for easy checking
						const replyBytes = new Uint8Array(result.data.buffer);
						
						console.log("Raw USB Reply received:", replyBytes);
						return null; // For now, we are not processing the USB reply further
						
						// A successful KeepAlive reply over USB will be exactly 7 bytes long:
						// replyBytes[0] = 0x02 (Reply marker)
						// replyBytes[1] = 0x0D (Command echo)
						// replyBytes[2] = 0x00 (Status: Success)
						// replyBytes[3-6] = 4 bytes representing the Limit Counter (Current sleep timer tick)
				}
				if (result.status !== 'ok') this.log("Reply Not OK (USB)...");
				/*
					while (performance.now() - t0 < timeoutMs) {
							const chunk = await this._readUsbChunk();
							if (!chunk) continue;

							append(chunk);

							// Same framing as Bluetooth
							if (collected.length >= 2) {
									const len = collected[0] | (collected[1] << 8);

									if (collected.length >= 2 + len) {
											const pkt = collected.slice(2, 2 + len);
											if (pkt[0] !== 0x02) return null;
											if (pkt[1] !== expectedOpcode) return null;
											return pkt;
									}
							}
					}

					return null;
				*/
			}

			return null;
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
    return !!reply;
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
  async messageWrite(inbox, text) {
    const enc = new TextEncoder();
    const bytes = enc.encode(text + "\0");
    const size = Math.min(bytes.length, 59);
    const payload = [
      inbox & 0xFF,
      size & 0xFF,
      ...Array.from(bytes.slice(0, size))
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
  async messageRead(remoteInbox, localInbox, remove = false) {
    const payload = [
      remoteInbox & 0xFF,
      localInbox & 0xFF,
      remove ? 1 : 0
    ];
    const reply = await this._sendCommand(0x13, payload, true);
    if (!reply) return null;

    const inbox = reply[3];
    const size = reply[4];
    const data = reply.slice(5, 5 + size);
    const dec = new TextDecoder();
    const text = dec.decode(data).replace(/\0.*$/, "");
    return { inbox, text };
  }
}

window.LegoNxt = LegoNxt;
