// DeviceLegoLPF2.js
// ES-module LEGO LPF2 (WeDo 2.0, Boost, Powered Up, Spike, etc.) driver.
// Standalone class, same architecture style as LegoInterfaceA_v2.

// Port Output Command constants
const MSG_PORT_OUTPUT_COMMAND = 0x81;
const SUBCMD_START_POWER      = 0x51;
const SUBCMD_START_SPEED      = 0x07;
const SUBCMD_START_SPEED_FOR_DEGREES = 0x0B;
const SUBCMD_GOTO_ABS_POS     = 0x0D;
const SUBCMD_GOTO_REL_POS     = 0x0A;

// Brake modes
const BRAKE_FLOAT = 0x00;
const BRAKE_BRAKE = 0x01;
const BRAKE_HOLD  = 0x02;

export class LegoLPF2 {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;

    this.hubId = 0x00;
    this.hubType = null;      // numeric hub type
    this.namePrefix = "LPF2_"; // WD2_, Boost, Pup, Spk, LPF2_

    this.status = "idle";
    this.statusMessage = "Idle";

    this.portInfo = {};      // portId -> { ioType, type, modes }
    this.portValues = {};    // portId -> last numeric value
    this.lastInputState = {}; // portId -> boolean
    this.countOn = {};       // portId -> rising-edge count
    this.rot = {};           // portId -> rotation (deg or ticks)

    this.commandQueue = Promise.resolve();
    this.queueActive = true;

    this._notifyBound = this._onNotification.bind(this);

    this.defaultBrakeMode = BRAKE_BRAKE; // default = Brake

    this.readingActive = false;
  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || this.namePrefix}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  // ---------------- Command Queueing ----------------

  enqueueCommand(fn) {
    if (!this.queueActive) {
      return Promise.resolve();
    }

    this.commandQueue = this.commandQueue
      .then(() => fn())
      .catch(err => {
        this.log("Queue command error: " + (err?.message || err));
      });

    return this.commandQueue;
  }

  async _write(bytes) {
    return this.enqueueCommand(async () => {
      if (!this.char) return;
      await this.char.writeValue(bytes);
    });
  }

  // ---------------- Connect ----------------

	async connect() {
		this.setStatus("connecting", "Requesting LPF2 device...");
		this.log("Connecting to LPF2 device...");

		let device;
		try {
			// WeDo 2.0 does NOT advertise its service UUID → must use acceptAllDevices
			device = await navigator.bluetooth.requestDevice({
				optionalServices: [
					"00001523-1212-efde-1523-785feabcd123", // WeDo 2.0
					"00001623-1212-efde-1623-785feabcd123"  // Boost/PoweredUp/Spike
				]
			});
		} catch (err) {
			this.log("No LPF2 device selected");
			this.setStatus("idle", "No device selected");
			throw err;
		}

		this.device = device;

		// Lost-device detection
		this.device.addEventListener("gattserverdisconnected", () => {
			this.log("GATT server disconnected — device lost.");
			this.manager?.handleDeviceLost?.(this);
			this.forceDisconnect().catch(() => {});
		});

		this.setStatus("connecting", "Connecting via BLE...");
		this.log(`Connecting to GATT server on ${device.name || "LPF2 device"}...`);

		try {
			this.server = await device.gatt.connect();
		} catch (err) {
			this.log("BLE connection failed");
			this.setStatus("error", "BLE connection failed");
			throw err;
		}

		// ------------------------------------------------------------
		// STEP 1 — Wait for GATT table to populate (WeDo 2.0 requirement)
		// ------------------------------------------------------------
		await new Promise(r => setTimeout(r, 5000));

		// Force Chrome to refresh GATT table
		try {
			await this.server.getPrimaryServices();
		} catch (e) {}

		// ------------------------------------------------------------
		// STEP 2 — Try WeDo 2.0 service (1523)
		// ------------------------------------------------------------
		let isWeDo = false;

		try {
			const service = await this.server.getPrimaryService("00001523-1212-efde-1523-785feabcd123");

			// WeDo 2.0 uses TWO characteristics
			this.writeChar  = await service.getCharacteristic("00001524-1212-efde-1523-785feabcd123");
			this.notifyChar = await service.getCharacteristic("00001525-1212-efde-1523-785feabcd123");

			await this.notifyChar.startNotifications();
			this.notifyChar.addEventListener("characteristicvaluechanged", this._notifyBound);

			this.char = this.writeChar;
			this.service = service;
			this.isWeDo = true;
			isWeDo = true;

			this.log("Detected WeDo 2.0 hub");
		}
		catch (err1) {

			// ------------------------------------------------------------
			// STEP 3 — Retry WeDo 2.0 detection (WeDo often needs 2 attempts)
			// ------------------------------------------------------------
			await new Promise(r => setTimeout(r, 5000));
			try {
				const service = await this.server.getPrimaryService("00001523-1212-efde-1523-785feabcd123");

				this.writeChar  = await service.getCharacteristic("00001524-1212-efde-1523-785feabcd123");
				this.notifyChar = await service.getCharacteristic("00001525-1212-efde-1523-785feabcd123");

				await this.notifyChar.startNotifications();
				this.notifyChar.addEventListener("characteristicvaluechanged", this._notifyBound);

				this.char = this.writeChar;
				this.service = service;
				this.isWeDo = true;
				isWeDo = true;

				this.log("Detected WeDo 2.0 hub (2nd attempt)");
			}
			catch (err2) {

				// ------------------------------------------------------------
				// STEP 4 — Not WeDo → must be Boost/PoweredUp/Spike (1623)
				// ------------------------------------------------------------
				const service = await this.server.getPrimaryService("00001623-1212-efde-1623-785feabcd123");
				const char = await service.getCharacteristic("00001624-1212-efde-1623-785feabcd123");

				await char.startNotifications();
				char.addEventListener("characteristicvaluechanged", this._notifyBound);

				this.service = service;
				this.char = char;
				this.isWeDo = false;

				this.log("Detected Boost/PoweredUp/Spike hub");
			}
		}

		this.readingActive = true;

		// ------------------------------------------------------------
		// STEP 5 — Hub type detection (from BLE name)
		// ------------------------------------------------------------
		this._detectHubTypeFromDeviceName(device.name || "");

		// ------------------------------------------------------------
		// STEP 6 — LPF2 initialization (Boost/Spike only)
		// ------------------------------------------------------------
		if (!isWeDo) {
			try {
				await this._initializeLPF2();
			} catch (err) {
				this.log("LPF2 initialization failed");
				this.setStatus("error", "Initialization failed");
				throw err;
			}
		}

		// ------------------------------------------------------------
		// STEP 7 — Allocate device name
		// ------------------------------------------------------------
		if (!this.name) {
			this.name = this.manager._allocateName(this.namePrefix);
		}

		this.log(`Connected as ${this.name}`);
		this.setStatus("connected", "Connected");
		document.dispatchEvent(new Event("serial-connected"));
	}

	
	// ---------------- LPF2 Initialization Sequence ----------------

	async _initializeLPF2() {
		this.log("Initializing LPF2 hub...");

		// ------------------------------------------------------------
		// STEP 1 — Wait for initial Hub Attached I/O messages
		// ------------------------------------------------------------
		// Boost/Spike send port attach messages immediately after notifications start.
		// WeDo 2.0 is slower, so we wait a bit.
		await new Promise(r => setTimeout(r, 300));

		// If no ports detected yet, wait a bit more
		if (Object.keys(this.portInfo).length === 0) {
			await new Promise(r => setTimeout(r, 300));
		}

		this.log("Ports detected: " + JSON.stringify(this.portInfo));

		// ------------------------------------------------------------
		// STEP 2 — Request Mode Information for each port
		// ------------------------------------------------------------
		for (const portStr of Object.keys(this.portInfo)) {
			const port = Number(portStr);

			// Request "Mode Info" (0x01)
			await this._write(new Uint8Array([
				0x05,
				this.hubId,
				0x21,   // Port Information Request
				port,
				0x01    // Mode Info
			]));

			// Request "Possible Modes" (0x02)
			await this._write(new Uint8Array([
				0x05,
				this.hubId,
				0x21,
				port,
				0x02
			]));

			// Request "Input Modes" (0x03)
			await this._write(new Uint8Array([
				0x05,
				this.hubId,
				0x21,
				port,
				0x03
			]));

			// Request "Output Modes" (0x04)
			await this._write(new Uint8Array([
				0x05,
				this.hubId,
				0x21,
				port,
				0x04
			]));

			// Small delay to avoid overwhelming the hub
			await new Promise(r => setTimeout(r, 30));
		}

		// ------------------------------------------------------------
		// STEP 3 — Configure Input Format for each sensor port
		// ------------------------------------------------------------
		for (const portStr of Object.keys(this.portInfo)) {
			const port = Number(portStr);
			const info = this.portInfo[port];

			// Only sensors need input format setup
			if (!info) continue;
			if (info.type === "motor" || info.type === "trainMotor") continue;

			// Default to mode 0, delta=1, notifications enabled
			await this._write(new Uint8Array([
				0x0A,
				this.hubId,
				0x41,   // Input Format Setup (Single)
				port,
				0x00,   // mode
				0x01,   // delta
				0x00,   // unit
				0x01    // notifications enabled
			]));

			await new Promise(r => setTimeout(r, 20));
		}

		this.log("LPF2 initialization complete.");
	}


  _detectHubTypeFromDeviceName(name) {
    const n = name.toLowerCase();
    if (n.includes("wedo")) {
      this._setHubType(0x40);
    } else if (n.includes("boost")) {
      this._setHubType(0x41);
    } else if (n.includes("hub") && n.includes("powered")) {
      this._setHubType(0x42);
    } else if (n.includes("spike") || n.includes("prime") || n.includes("inventor")) {
      this._setHubType(0x43);
    }
  }

  _waitForHubType(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const check = () => {
        if (this.hubType != null) {
          this._setHubType(this.hubType);
          resolve();
          return;
        }
        if (performance.now() - start > timeoutMs) {
          reject(new Error("Hub type timeout"));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  _setHubType(hubType) {
    if (this.hubType != null) return;
    this.hubType = hubType;
    switch (hubType) {
      case 0x40: this.namePrefix = "WD2_";   break; // WeDo 2.0
      case 0x41: this.namePrefix = "Boost"; break; // Boost Move Hub
      case 0x42: this.namePrefix = "Pup";   break; // Powered Up
      case 0x43: this.namePrefix = "Spk";   break; // Spike / Inventor
      default:   this.namePrefix = "LPF2_";  break;
    }
  }

  // ---------------- Disconnect ----------------

  async disconnect() {
    this.queueActive = false;
    this.log("Disconnecting...");
    this.setStatus("disconnected", "Disconnecting...");

    this.readingActive = false;

    try {
      await this.commandQueue;
    } catch {}

    try {
      if (this.char) {
        this.char.removeEventListener("characteristicvaluechanged", this._notifyBound);
        try { await this.char.stopNotifications(); } catch {}
      }
    } catch {}

    try {
      if (this.device && this.device.gatt.connected) {
        await this.device.gatt.disconnect();
      }
    } catch (err) {
      this.log(`BLE disconnect error: ${err.message || err}`);
    }

    if (this.name) {
      this.manager?._removeDevice?.(this);
      this.name = null;
    }

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;

    this.setStatus("disconnected", "Disconnected");
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this.commandQueue = Promise.resolve();
    this.readingActive = false;

    try {
      if (this.char) {
        this.char.removeEventListener("characteristicvaluechanged", this._notifyBound);
        try { await this.char.stopNotifications(); } catch {}
      }
    } catch {}

    try {
      if (this.device && this.device.gatt.connected) {
        await this.device.gatt.disconnect();
      }
    } catch {}

    if (this.name) {
      this.manager?._removeDevice?.(this);
      this.name = null;
    }

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;
  }

  // ---------------- Notification Handling ----------------

  _onNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    let offset = 0;
    while (offset < data.length) {
      const len = data[offset];
      if (len === 0 || offset + len > data.length) break;
      const msg = data.subarray(offset, offset + len);
      this._handleMessage(msg);
      offset += len;
    }
  }

  _handleMessage(msg) {
    const len = msg[0];
    if (len < 3) return;
    const hubId = msg[1];
    const type = msg[2];

    this.hubId = hubId;

    switch (type) {
      case 0x01: // Hub Properties
        this._handleHubProperties(msg);
        break;
      case 0x04: // Hub Attached I/O
        this._handleHubAttachedIO(msg);
        break;
      case 0x45: // Port Value Single
        this._handlePortValueSingle(msg);
        break;
      case 0x46: // Port Value Combined
        this._handlePortValueCombined(msg);
        break;
      default:
        break;
    }
  }

  _handleHubProperties(msg) {
    // msg[3] = property, msg[4] = operation, rest = payload
    const property = msg[3];
    const op = msg[4];
    // Some hubs report HW/FW/version/name here; hub type is usually via Attached I/O.
    // We keep this hook for future refinement if needed.
    // Example: property 0x03 might encode HW version that implies hub type.
    // Not strictly needed if we already detect from name or attached I/O.
		if (msg[3] === 0x06 && msg.length >= 6) {
			const hubType = msg[5];
			this._setHubType(hubType);
		}	
  }

  _handleHubAttachedIO(msg) {
    // [len][hubId][0x04][portId][event][ioTypeL][ioTypeH][...]
    const portId = msg[3];
    const event = msg[4];

    if (event === 0x01) {
      const ioType = msg[5] | (msg[6] << 8);
      this._registerPort(portId, ioType);
    } else if (event === 0x00) {
      delete this.portInfo[portId];
      delete this.portValues[portId];
      delete this.lastInputState[portId];
      delete this.countOn[portId];
      delete this.rot[portId];
    }
  }

  _registerPort(portId, ioType) {
    let type = "unknown";
    switch (ioType) {
      case 0x0001: type = "motor"; break;
      case 0x0002: type = "trainMotor"; break;
      case 0x0005: type = "tilt"; break;
      case 0x0008: type = "colorDistance"; break;
      case 0x0015: type = "mediumLinearMotor"; break;
      case 0x0016: type = "largeLinearMotor"; break;
      case 0x0025: type = "force"; break;
      case 0x0026: type = "color"; break;
      case 0x0027: type = "distance"; break;
      case 0x0028: type = "tiltMulti"; break;
      default: break;
    }

    this.portInfo[portId] = { ioType, type };
  }

  _handlePortValueSingle(msg) {
    const portId = msg[3];
    const payload = msg.subarray(4);

    const info = this.portInfo[portId];
    let value = 0;

    if (!info) {
      if (payload.length === 1) value = payload[0];
      else if (payload.length >= 2) value = payload[0] | (payload[1] << 8);
    } else {
      switch (info.type) {
        case "motor":
        case "mediumLinearMotor":
        case "largeLinearMotor":
          if (payload.length >= 4) {
            value = (payload[0] | (payload[1] << 8) | (payload[2] << 16) | (payload[3] << 24)) | 0;
            this.rot[portId] = value;
          } else if (payload.length >= 1) {
            value = payload[0];
          }
          break;
        case "tilt":
        case "tiltMulti":
          if (payload.length >= 1) value = payload[0];
          break;
        case "distance":
          if (payload.length >= 1) value = payload[0];
          break;
        case "color":
          if (payload.length >= 1) value = payload[0];
          break;
        case "colorDistance":
          if (payload.length >= 1) value = payload[0];
          break;
        case "force":
          if (payload.length >= 1) value = payload[0];
          break;
        default:
          if (payload.length === 1) value = payload[0];
          else if (payload.length >= 2) value = payload[0] | (payload[1] << 8);
          break;
      }
    }

    this.portValues[portId] = value;

    const current = this._booleanFromValue(portId, value);
    if (this.lastInputState[portId] === undefined) {
      this.lastInputState[portId] = current;
      if (this.countOn[portId] == null) this.countOn[portId] = 0;
    } else {
      if (!this.lastInputState[portId] && current) {
        this.countOn[portId] = (this.countOn[portId] || 0) + 1;
      }
      this.lastInputState[portId] = current;
    }
  }

  _handlePortValueCombined(msg) {
    // For now, we ignore combined values; can be extended later.
  }

  _booleanFromValue(portId, value) {
    const info = this.portInfo[portId];
    if (!info) return !!value;
    switch (info.type) {
      case "tilt":
      case "tiltMulti":
      case "distance":
      case "colorDistance":
      case "force":
        return value > 0;
      default:
        return !!value;
    }
  }

  // ---------------- Public API: Inputs ----------------

  inputOn(port) {
    const v = this.portValues[port];
    if (v == null) return false;
    return this._booleanFromValue(port, v);
  }

  getCountOn(port) {
    return this.countOn[port] || 0;
  }

  setCountOn(port, value = 0) {
    this.countOn[port] = value;
  }

  getRot(port) {
    return this.rot[port] || 0;
  }

  getTilt(port) {
    return this.portValues[port] ?? 0;
  }

  getDistance(port) {
    return this.portValues[port] ?? 0;
  }

  getColor(port) {
    return this.portValues[port] ?? 0;
  }

  getForce(port) {
    return this.portValues[port] ?? 0;
  }

  // ---------------- Public API: Motors ----------------

  async motorPower(port, power) {
    if (!this.char) throw new Error("LPF2 not connected");
    power = Math.max(-100, Math.min(100, Math.round(power)));
    const hubId = this.hubId || 0x00;
    const len = 0x08;
    const msg = new Uint8Array([
      len,
      hubId,
      MSG_PORT_OUTPUT_COMMAND,
      port & 0xFF,
      0x11,
      SUBCMD_START_POWER,
      0x00,          // no feedback
      power & 0xFF
    ]);
    await this._write(msg);
  }

  async motorSpeed(port, speed, maxPower = 100, useProfile = 0x00) {
    if (!this.char) throw new Error("LPF2 not connected");
    speed = Math.max(-100, Math.min(100, Math.round(speed)));
    maxPower = Math.max(0, Math.min(100, Math.round(maxPower)));
    const hubId = this.hubId || 0x00;
    const len = 0x0A;
    const msg = new Uint8Array([
      len,
      hubId,
      MSG_PORT_OUTPUT_COMMAND,
      port & 0xFF,
      0x11,
      SUBCMD_START_SPEED,
      0x00,          // no feedback
      speed & 0xFF,
      maxPower & 0xFF,
      useProfile & 0xFF
    ]);
    await this._write(msg);
  }

  async motorAngle(port, angle, speed, brakeMode = this.defaultBrakeMode) {
    if (!this.char) throw new Error("LPF2 not connected");
    speed = Math.max(-100, Math.min(100, Math.round(speed)));
    const hubId = this.hubId || 0x00;
    const a = angle | 0;
    const len = 0x0E;
    const msg = new Uint8Array([
      len,
      hubId,
      MSG_PORT_OUTPUT_COMMAND,
      port & 0xFF,
      0x11,
      SUBCMD_START_SPEED_FOR_DEGREES,
      0x00,          // no feedback
      a & 0xFF,
      (a >> 8) & 0xFF,
      (a >> 16) & 0xFF,
      (a >> 24) & 0xFF,
      speed & 0xFF,
      brakeMode & 0xFF,
      0x00           // useProfile
    ]);
    await this._write(msg);
  }

  async motorGoto(port, position, speed, brakeMode = this.defaultBrakeMode) {
    if (!this.char) throw new Error("LPF2 not connected");
    speed = Math.max(-100, Math.min(100, Math.round(speed)));
    const hubId = this.hubId || 0x00;
    const p = position | 0;
    const len = 0x0E;
    const msg = new Uint8Array([
      len,
      hubId,
      MSG_PORT_OUTPUT_COMMAND,
      port & 0xFF,
      0x11,
      SUBCMD_GOTO_ABS_POS,
      0x00,          // no feedback
      p & 0xFF,
      (p >> 8) & 0xFF,
      (p >> 16) & 0xFF,
      (p >> 24) & 0xFF,
      speed & 0xFF,
      brakeMode & 0xFF,
      0x00           // useProfile
    ]);
    await this._write(msg);
  }

  async motorStop(port, brakeMode = this.defaultBrakeMode) {
    if (!this.char) throw new Error("LPF2 not connected");
    const hubId = this.hubId || 0x00;
    const len = 0x08;
    const msg = new Uint8Array([
      len,
      hubId,
      MSG_PORT_OUTPUT_COMMAND,
      port & 0xFF,
      0x11,
      SUBCMD_START_POWER,
      0x00,          // no feedback
      brakeMode === BRAKE_FLOAT ? 0x00 : 0x00 // power=0; brake mode handled by profile in more advanced cmds
    ]);
    await this._write(msg);
  }

  // Convenience mapping for Blockly (string → brake mode)
  brakeModeFromString(mode) {
    switch ((mode || "").toLowerCase()) {
      case "float": return BRAKE_FLOAT;
      case "hold":  return BRAKE_HOLD;
      case "brake":
      default:      return BRAKE_BRAKE;
    }
  }
}
