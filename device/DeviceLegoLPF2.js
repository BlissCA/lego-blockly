// DeviceLegoLPF2.js
// ES-module LEGO LPF2 (WeDo 2.0, Boost, Powered Up, Spike, etc.) driver.
// Standalone class, same architecture style as LegoInterfaceA_v2.

// Port Output Command constants
const MSG_PORT_OUTPUT_COMMAND = 0x81;
const SUBCMD_START_POWER              = 0x01; // raw PWM
const SUBCMD_START_SPEED              = 0x07; // regulated speed
const SUBCMD_START_SPEED_FOR_TIME     = 0x09; // time-based movement
const SUBCMD_START_SPEED_FOR_DEGREES  = 0x0B; // angle-based movement
const SUBCMD_GOTO_ABS_POS             = 0x0D; // absolute position


// Brake modes
const BRAKE_FLOAT = 0x00;
const BRAKE_BRAKE = 0x7F;
const BRAKE_HOLD  = 0x7E;

const LPF2_DEBUG = {
  connect: true,   // logs during connect()
  traffic: true,  // logs for every notification/frame/message
};

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
    this.namePrefix = "LPF2_"; // Boost, Pup, Spk, LPF2_

    this.status = "idle";
    this.statusMessage = "Idle";

    this.portInfo = {};      // portId -> { ioType, type, modes }
    this.portValues = {};    // portId -> last numeric value
    this.lastInputState = {}; // portId -> boolean
    this.countOn = {};       // portId -> rising-edge count
    this.rot = {};           // portId -> rotation (deg or ticks)
		this.activeMode = {}; // port → mode

		this.userPortMap = {}; // user-friendly port names (A/B/C/D) mapped to port IDs

		this.motorCaps = {
			power: true,
			speed: false,
			angle: false,
			goto: false,
			time: false,
			combined: false
		};

    this.commandQueue = Promise.resolve();
    this.queueActive = true;

    this.defaultBrakeMode = BRAKE_BRAKE; // default = Brake

    this.readingActive = false;

		this._rxBuffer = [];     // byte buffer for incoming notifications
		this._notifyBound = this._onNotification.bind(this);

		// Default sensor modes per type
		this.defaultSensorModes = {
				distance: 0,
				colorDistance: 0, // color index
				color: 0,
				tilt: 0,
				tiltMulti: 0,
				imu: 0,           // accel
				force: 0,
				motor: 2,         // absolute position
				voltage: 0,
				current: 0
		};

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
		this.setStatus("connecting", "Requesting LPF2 hub...");
		this.log("Connecting to LPF2 hub...");

		let device;
		try {
			device = await navigator.bluetooth.requestDevice({
				filters: [
					{ services: ["00001623-1212-efde-1623-785feabcd123"] } // LPF2 hubs only
				],
				optionalServices: [
					"00001623-1212-efde-1623-785feabcd123"
				]
			});
		} catch (err) {
			this.log("No LPF2 hub selected");
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
		this.log(`Connecting to GATT server on ${device.name || "LPF2 hub"}...`);

		// Connect
		this.server = await device.gatt.connect();

		// LPF2 service + characteristic
		this.service = await this.server.getPrimaryService("00001623-1212-efde-1623-785feabcd123");
		this.char    = await this.service.getCharacteristic("00001624-1212-efde-1623-785feabcd123");

		// Notifications
		await this.char.startNotifications();
		this.char.addEventListener("characteristicvaluechanged", this._notifyBound);

		// Request hub type (LPF2 Hub Property 0x06)
		await this._write(new Uint8Array([
			0x05,       // length
			0x00,       // hub ID
			0x01,       // Hub Properties
			0x0B,       // Hub Type
			0x05        // Request Update
		]));

		this.readingActive = true;

		// Hub type detection 
		await this._waitForHubType();

		// LPF2 initialization
		await this._initializeLPF2();

		// Allocate name
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
		this._buildPortMap();
		this._setupMotorCaps();
		this.log("Port map: " + JSON.stringify(this.userPortMap));
		this.log("Motor caps: " + JSON.stringify(this.motorCaps));


		// ------------------------------------------------------------
		// STEP 2 — Request Mode Information for each port (LPF3-correct)
		// ------------------------------------------------------------
		for (const portStr of Object.keys(this.portInfo)) {
				const port = Number(portStr);

				// 1. Request Possible Modes (0x02)

				this._write(new Uint8Array([
						0x05, this.hubId, 0x21, port, 0x02
				]));

				await new Promise(r => setTimeout(r, 20));
		}

		
		// ------------------------------------------------------------
		// STEP 3 — Configure Input Format for each sensor port (safe version)
		// ------------------------------------------------------------
		for (const portStr of Object.keys(this.portInfo)) {
				const port = Number(portStr);
				const info = this.portInfo[port];
				let d = 1;

				if (!info) continue;

				// Skip motors
				if (info.type === "motorSimple" || info.type === "motorTacho" || info.type === "motor" || info.type === "current" || info.type === "volt") {
						continue;
				}
				switch (info.type) {
						case "tiltMulti":
							d=5;
							break;
						default:
							d=1;
				}

				// For now: always mode 0, delta=1, notifications=1
				await this._setInputFormat(port, 0, d, 1);

				await new Promise(r => setTimeout(r, 20));
		}


		this.log("LPF2 initialization complete.");
	}

	async _setInputFormat(port, mode, delta = 1, notifications = 1) {
			this.activeMode[port] = mode;
			const d = delta >>> 0;

			const msg = new Uint8Array([
					0x0A,
					this.hubId,
					0x41,
					port,
					mode,
					d & 0xFF,
					(d >> 8) & 0xFF,
					(d >> 16) & 0xFF,
					(d >> 24) & 0xFF,
					notifications ? 0x01 : 0x00	
			]);

			this._write(msg);
	}

	_handlePortInformation(msg) {
		const port = msg[3];
		const infoType = msg[4];

		const info = this.portInfo[port];
		if (!info) return;
		
		switch (infoType) {

			// 0x02 — Possible Modes (input/output bitmasks)
			case 0x02: {
				// Some hubs send only input or only output; guard on length
				if (msg.length < 7) {
					if (LPF2_DEBUG.traffic) {
						console.log("[LPF2] short 0x43/0x02 message, might be WeDo 2.0 sensor", msg);
					}
					info.modes = {};
					this._requestModeInfo(port, 0);
					return;
				}

				const inputMask  = msg[5] | (msg[6] << 8);
				const outputMask = (msg.length >= 9)
					? (msg[7] | (msg[8] << 8))
					: 0;

				info.inputModesMask  = inputMask;
				info.outputModesMask = outputMask;

				// Determine max mode index from masks
				const maxMode = Math.max(
					Math.floor(Math.log2(inputMask || 1)),
					Math.floor(Math.log2(outputMask || 1))
				);

				// Initialize mode table
				info.modes = {};
				for (let mode = 0; mode <= maxMode; mode++) {
					// For each mode, request detailed Mode Information via 0x22
					this._requestModeInfo(port, mode);
				}
				break;
			}

			// 0x03 — Input Modes
			case 0x03: {
				if (msg.length < 7) return;
				info.inputModesMask = msg[5] | (msg[6] << 8);
				break;
			}

			// 0x04 — Output Modes
			case 0x04: {
				if (msg.length < 7) return;
				info.outputModesMask = msg[5] | (msg[6] << 8);
				break;
			}

			// 0x01 — Mode Info (high‑level, optional)
			case 0x01: {
				// You can ignore this or store it if you want.
				// The detailed stuff comes from 0x44.
				break;
			}
		}
	}

	_requestModeInfo(port, mode) {
		const hubId = this.hubId;

		// Info types we care about: 0x00, 0x01, 0x02, 0x03, 0x04, 0x80
		const infoTypes = [0x00, 0x01, 0x02, 0x03, 0x04, 0x80];

		for (const infoType of infoTypes) {
			const msg = new Uint8Array([
				0x06,      // length
				hubId,     // hub ID
				0x22,      // Port Mode Information Request
				port,      // port ID
				mode,      // mode
				infoType   // infoType
			]);
			this._write(msg);
		}
	}


	_handlePortModeInfo(port, mode, infoType, payload) {
			if (!this.portInfo[port]) return;

			// Ensure mode table exists
			if (!this.portInfo[port].modes) {
					this.portInfo[port].modes = {};
			}
			if (!this.portInfo[port].modes[mode]) {
					this.portInfo[port].modes[mode] = {};
			}

			const m = this.portInfo[port].modes[mode];

			switch (infoType) {

					case 0x00: // Name (string)
							m.name = this._decodeString(payload);
							break;

					case 0x01: // Raw range
							m.rawRange = this._parseRange(payload);
							break;

					case 0x02: // Percent range
							m.percentRange = this._parseRange(payload);
							break;

					case 0x03: // SI range
							m.siRange = this._parseRange(payload);
							break;

					case 0x04: // Symbol (string)
							m.symbol = this._decodeString(payload);
							break;

					case 0x80: // Value format
							m.valueFormat = this._parseValueFormat(payload);
							break;
			}
	}

	_parseRange(payload) {
			const dv = new DataView(payload.buffer);
			const min = dv.getInt32(0, true);
			const max = dv.getInt32(4, true);
			return [min, max];
	}

	_parseValueFormat(payload) {
			// payload[0] = number of values
			// payload[1] = data type
			// payload[2] = total figures
			// payload[3] = decimals

			const count = payload[0];
			const dataType = payload[1];

			let type = "unknown";
			switch (dataType) {
					case 0x00: type = "Int8"; break;
					case 0x01: type = "Int16"; break;
					case 0x02: type = "Int32"; break;
					case 0x03: type = "Float32"; break;
			}

			return {
					count,
					type,
					figures: payload[2],
					decimals: payload[3]
			};
	}

  _waitForHubType(timeoutMs = 2000) {
		if (LPF2_DEBUG.connect) console.log("[LPF2] Waiting for hub type...");
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const check = () => {
				if (LPF2_DEBUG.connect) console.log("[LPF2] hubType =", this.hubType);
        if (this.hubType != null) {
          this._setHubType(this.hubType);
          resolve();
          return;
        }
        if (performance.now() - start > timeoutMs) {
					console.warn("[LPF2] Hub type timeout");
          reject(new Error("Hub type timeout"));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

	_setHubType(type) {
			this.hubType = type;

			// Fix Boost internal motors misclassified before hubType was known
			// if (type === 0x40) { // Boost Move Hub
			// 		for (const portId of [0, 1]) {
			// 				const info = this.portInfo[portId];
			// 				if (info && info.ioType === 0x27) {
			// 						info.type = "motor";
			// 						this.log(`Corrected Boost internal motor on port ${portId}`);
			// 				}
			// 		}
			// }

			switch (type) {

					case 0x20:
							this.namePrefix = "WeDo2_";
							break;

					case 0x40:
							this.namePrefix = "Boost";
							break;

					case 0x41:
							this.namePrefix = "City";
							break;

					case 0x42:
							this.namePrefix = "Remote";
							break;

					case 0x43:
							this.namePrefix = "Mario";
							break;

					case 0x44:
							this.namePrefix = "Duplo";
							break;

					case 0x45:
							this.namePrefix = "TechSmall";
							break;

					case 0x80:
							this.namePrefix = "Technic";
							break;

					case 0x81:
							this.namePrefix = "Inventor";
							break;

					case 0x83:
							this.namePrefix = "SpikePrime";
							break;

					case 0x84:
							this.namePrefix = "SpikeEss";
							break;

					case 0x64:
							this.namePrefix = "Bootloader";
							break;

					default:
							this.namePrefix = "LPF2_";
							break;
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

		if (LPF2_DEBUG.traffic) {
			console.log("[LPF2] Notification:", 
			Array.from(data).map(b => b.toString(16).padStart(2, "0")).join(" ")
		);
		}
		// Append incoming bytes to buffer
		for (let b of data) {
			this._rxBuffer.push(b);
		}

		// Try to extract complete LPF2 frames
		while (this._rxBuffer.length >= 2) {
			const length = this._rxBuffer[0];

			if (this._rxBuffer.length < length) {
				break;
			}

			const frame = this._rxBuffer.slice(0, length);
			this._rxBuffer = this._rxBuffer.slice(length);

			if (LPF2_DEBUG.traffic) {
				console.log("[LPF2] Frame:", 
					Array.from(frame).map(b => b.toString(16).padStart(2, "0")).join(" ")
				);
			}

			this._handleMessage(new Uint8Array(frame));
		}
	}

  _handleMessage(msg) {
    const len = msg[0];
    if (len < 3) return;
    const hubId = msg[1];
    const type = msg[2]

		if (LPF2_DEBUG.traffic) {
			console.log(`[LPF2] Message type 0x${type.toString(16)}:`,
				Array.from(msg).map(b => b.toString(16).padStart(2, "0")).join(" ")
			);
		}

		this.hubId = hubId;

    switch (type) {
      case 0x01: // Hub Properties
				if (LPF2_DEBUG.traffic) console.log("[LPF2] → Hub Properties");
        this._handleHubProperties(msg);
        break;
      case 0x04: // Hub Attached I/O
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Hub Attached I/O");
				}
        this._handleHubAttachedIO(msg);
        break;
			case 0x43: // Port Information
					this._handlePortInformation(msg);
					break;
			
			case 0x44: { // Port Mode Information
					const port = msg[3];
					const mode = msg[4];
					const infoType = msg[5];
					const payload = msg.slice(6);
					this._handlePortModeInfo(port, mode, infoType, payload);
					break;
			}
			case 0x45: // Port Value Single
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Port Value Single");
				}
        this._handlePortValueSingle(msg);
        break;
      case 0x46: // Port Value Combined
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Port Value Combined");
				}
        this._handlePortValueCombined(msg);
        break;
      default:
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Unknown message type");
				}
        break;
    }
  }

	_handleHubProperties(msg) {
		const property = msg[3];
		const op = msg[4];

		if (LPF2_DEBUG.traffic) {
			console.log("[LPF2] Hub Properties:",
				"property=0x" + property.toString(16),
				"op=0x" + op.toString(16),
				"len=" + msg.length
			);
		}

		if (property === 0x0B) {
			// Format A (Spike/Technic): len >= 6, hubType in msg[5]
			if (msg.length >= 6) {
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] Hub Type (Format A):", msg[5]);
				}
				this._setHubType(msg[5]);
				return;
			}

			// Format B (Boost/PoweredUp): hubType is op byte
			if (LPF2_DEBUG.traffic) {
				console.log("[LPF2] Hub Type (Format B):", op);
			}
			this._setHubType(op);
		}
	}

  _handleHubAttachedIO(msg) {
    // [len][hubId][0x04][portId][event][ioTypeL][ioTypeH][...]
    const portId = msg[3];
    const event = msg[4];
		const ioType = msg[5];

    if (event === 0x01) {
      const ioType = msg[5] | (msg[6] << 8);
      this._registerPort(portId, ioType);
			// ⭐ FIX: request possible modes again
			this._write(new Uint8Array([
					0x05, this.hubId, 0x21, portId, 0x02
			]));

    } else if (event === 0x00) {
      delete this.portInfo[portId];
      delete this.portValues[portId];
      delete this.lastInputState[portId];
      delete this.countOn[portId];
      delete this.rot[portId];
    }

		// Detect virtual ports (Technic, Spike, Powered Up)
		if (event === 0x02 && this.hubType !== 0x40) {
				if (!this.userPortMap) this.userPortMap = {};

				if (portId === 0x10) {
						this.userPortMap.AB = 0x10;
						this.log("Virtual port AB detected");
				}
				if (portId === 0x11) {
						this.userPortMap.CD = 0x11;
						this.log("Virtual port CD detected");
				}
		}

		// ⭐ FIX: rebuild port map dynamically
    this._buildPortMap();
		
		// Optionally re-log:
		// this.log("Ports detected: " + JSON.stringify(this.portInfo));
  }

	_registerPort(portId, ioType) {
			let type = "unknown";

			switch (ioType) {

					// ------------------------------------------------------------
					// Simple / Legacy Motors (Direct Power)
					// These do not support speed/degree commands; they use 0x51.
					// ------------------------------------------------------------
					case 0x0001: // Simple Medium Motor (88008)
							type = "motorSimple";
							break;

					case 0x0002: // Train Motor (88011)
							type = "motorSimple"; // also no tacho
							break;


					// ------------------------------------------------------------
					// Classic LPF2 Linear Motors (with tacho)
					// ------------------------------------------------------------
					// case 0x0015: // Medium Linear Motor
					// case 0x0016: // Large Linear Motor
					// 		type = "motorTacho";
					// 		break;


					// ------------------------------------------------------------
					// Modern Tacho Motors (Technic, SPIKE, Inventor)
					// These support StartSpeed (0x07) and MoveForDegrees (0x0B).
					// ------------------------------------------------------------
					case 0x002E: // Technic Large Motor (88013)
					case 0x002F: // Technic XL Motor (88014)
					case 0x0030: // Technic Medium Angular Motor
					case 0x0031: // Technic Large Angular Motor
					case 0x0041: // Small Angular Motor (Spike Essential)
							type = "motorTacho";
							break;


					// ------------------------------------------------------------
					// LWP3 r17 — Tacho Motor Definitions
					// 0x26 = External Motor with Tacho
					// 0x27 = Internal Motor with Tacho
					// ------------------------------------------------------------
					case 0x0026: // External Tacho Motor
					case 0x0027: // Internal Tacho Motor (Boost internal motors)
							type = "motorTacho";
							break;


					// ------------------------------------------------------------
					// Sensors & Accessories
					// ------------------------------------------------------------

					case 0x0005: // Button
							type = "button";
							break;

					case 0x0008: // LED Light (88005)
							type = "light";
							break;

					case 0x0014: // Voltage
							type = "volt";
							break;

					case 0x0015: // Curent
							type = "current";
							break;

					case 0x0016: // Piezo Tone (Sound)
							type = "sound";
							break;

					case 0x0017: // RGB Light
							type = "rgb";
							break;

					case 0x0022: // External Tilt Sensor (WeDo 2.0)
							type = "tilt";
							break;

					case 0x0023: // Motion/Distance Sensor (WeDo 2.0)
							type = "distance";
							break;

					// ------------------------------------------------------------
					// Color & Distance Sensor (Boost 88007)
					// NOTE: Some hubs report it as 0x25, others as 0x26.
					// ------------------------------------------------------------
					case 0x0025: // 37 dec – Vision / Color+Distance on Boost
					//case 0x0026: // 38 dec – Color & Distance Sensor (Boost)
							type = "colorDistance";
							break;


					// ------------------------------------------------------------
					// Multi-axis tilt (Boost)
					// ------------------------------------------------------------
					case 0x0028:
							type = "tiltMulti";
							break;


					// ------------------------------------------------------------
					// Modern Spike / Inventor Sensors
					// ------------------------------------------------------------
					case 0x003D: // Spike Color Sensor
							type = "color";
							break;

					case 0x003E: // Spike Ultrasonic Distance Sensor
							type = "distance";
							break;

					case 0x003F: // Spike Force Sensor (Touch)
							type = "force";
							break;

					case 0x0040: // Matrix Display (3x3 or 5x5)
							type = "matrix";
							break;


					// ------------------------------------------------------------
					// Internal Virtual Hub Ports
					// ------------------------------------------------------------
					case 0x0036: // Internal IMU (gyro/accel)
							type = "imu";
							break;

					case 0x003A: // Internal Tilt Sensor (Boost)
							type = "tiltMulti";
							break;

					case 0x003B: // Amperage Sensor
							type = "current";
							break;

					case 0x003C: // Voltage Sensor
							type = "voltage";
							break;

					default:
							break;
			}

			this.portInfo[portId] = { ioType, type };
	}

	_handlePortValueSingle(msg) {
			const port = msg[3];
			const payload = msg.subarray(4);

			const info = this.portInfo[port];
			if (!info) return;

			// No active mode yet → ignore early values
			const mode = this.activeMode[port];
			if (mode == null) return;

			// Mode table not ready yet
			if (!info.modes) return;

			const modeInfo = info.modes[mode];
			if (!modeInfo) return;

			const vf = modeInfo.valueFormat;
			if (!vf) return;

			const values = [];
			let offset = 0;

			// Ensure payload is long enough for expected data
			const bytesNeeded =
					vf.count *
					(vf.type === "Int8" ? 1 :
					vf.type === "Int16" ? 2 :
					vf.type === "Int32" ? 4 :
					vf.type === "Float32" ? 4 : 0);

			if (payload.length < bytesNeeded) {
					// Ignore incomplete early messages
					return;
			}

			for (let i = 0; i < vf.count; i++) {
					let v = 0;

					switch (vf.type) {
							case "Int8":
									v = (payload[offset] << 24) >> 24;
									offset += 1;
									break;

							case "Int16":
									v = (payload[offset] | (payload[offset+1] << 8));
									if (v & 0x8000) v |= 0xFFFF0000;
									offset += 2;
									break;

							case "Int32":
									v = (payload[offset] |
											(payload[offset+1] << 8) |
											(payload[offset+2] << 16) |
											(payload[offset+3] << 24));
									offset += 4;
									break;

							case "Float32":
									v = new DataView(payload.buffer, payload.byteOffset + offset, 4)
													.getFloat32(0, true);
									offset += 4;
									break;

							default:
									return; // unknown type
					}

					values.push(v);
			}

			// Store parsed values
			this.portValues[port] = (vf.count === 1 ? values[0] : values);

			// Motor encoder convenience
			if (info.type === "motorTacho" && vf.type === "Int32") {
					this.rot[port] = values[0];
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

	/**
	 * Create a combined virtual port (AB, CD, etc.)
	 * Works for Technic Hub, Powered Up Hub, City Hub.
	 * Ignored for Boost and Spike (they auto-create combined ports).
	 *
	 * @param {string|number} portName1 - e.g. "A" or 0
	 * @param {string|number} portName2 - e.g. "B" or 1
	 * @returns {Promise<number|null>} virtual port ID (0x10, 0x11, etc.)
	 */
	async createCombinedPort(portName1, portName2) {
			const hub = this.hubType;

			// Hubs that auto-create combined ports → do nothing
			if (hub === 0x40 || hub === 0x83 || hub === 0x81) {
					this.log("Hub auto-creates combined ports; skipping manual creation.");
					return null;
			}

			// Hubs that do NOT support combined mode
			if (hub === 0x84) {
					this.log("Spike Essential does not support combined ports.");
					return null;
			}

			// Resolve ports
			const p1 = this._resolvePort(portName1);
			const p2 = this._resolvePort(portName2);

			const hubId = this.hubId || 0x00;

			// LPF2 "Port Combination Setup" command
			const msg = new Uint8Array([
					0x06,       // length
					hubId,      // hub ID
					0x61,       // Port Output Command: Port Combination Setup
					0x01,       // subcommand: create virtual port
					p1 & 0xFF,  // port 1
					p2 & 0xFF   // port 2
			]);

			this.log(`Requesting combined port for ${portName1}+${portName2}...`);
			await this._write(msg);

			// Wait for hub to announce the virtual port
			const virtualPort = await this._waitForVirtualPort(p1, p2);

			if (virtualPort != null) {
					this.log(`Combined port created: ${virtualPort}`);
					return virtualPort;
			}

			this.log("Combined port creation timed out.");
			return null;
	}

	/**
	 * Wait for a virtual port that combines p1 and p2.
	 * Works for Technic, Powered Up, City hubs.
	 */
	_waitForVirtualPort(p1, p2) {
			return new Promise(resolve => {
					const start = performance.now();

					const check = () => {
							for (const portStr of Object.keys(this.portInfo)) {
									const portId = Number(portStr);
									const info = this.portInfo[portId];

									if (!info) continue;

									// Virtual ports are >= 0x10
									if (portId >= 0x10 && info.ioType === 0x0027) {
											// We cannot always check p1/p2 from ioType,
											// but hubs typically send correct mapping.
											resolve(portId);
											return;
									}
							}

							if (performance.now() - start > 1000) {
									resolve(null);
									return;
							}

							requestAnimationFrame(check);
					};

					check();
			});
	}

	_findMode(port, keywords) {
			const info = this.portInfo[port];
			if (!info || !info.modes) return 0;

			const modes = info.modes;

			// 1. Prefer RELATIVE position (POS)
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "pos") return Number(mode);
			}

			// 2. Then absolute position (APOS)
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "apos") return Number(mode);
			}

			// 3. Then speed
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "speed") return Number(mode);
			}

			// 4. Fallback: keyword search
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					for (const key of keywords) {
							if (name.includes(key)) {
									return Number(mode);
							}
					}
			}

			return 0;
	}

	_decodeString(bytes) {
			return String.fromCharCode(...bytes).replace(/\0/g, "");
	}


  // ---------------- Public API: Inputs ----------------

	_getDefaultMode(port) {
			const info = this.portInfo[port];
			if (!info) return 0;

			const t = info.type;
			return this.defaultSensorModes[t] ?? 0;
	}

	async _ensureMode(port, desiredMode) {
			const current = this.activeMode[port];

			if (current === desiredMode) {
					return;
			}

			await this._setInputFormat(port, desiredMode, 1, 1);

			// Give hub time to switch modes
			await new Promise(r => setTimeout(r, 20));
	}

	async getDistance(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["dist", "range"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getColor(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["color", "col"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getTilt(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["tilt", "orient", "angle"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? [0,0];
	}

	async getIMU(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["acc", "gyro", "imu"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? [0,0,0];
	}

	async getForce(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["force", "press", "touch"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getRot(portName) {
			const port = this._resolvePort(portName);

			// Prefer RELATIVE position
			const mode = this._findMode(port, ["pos", "angle", "rot"]);
			await this._ensureMode(port, mode);

			return this.rot[port] ?? 0;
	}


	getRaw(portName) {
			const port = this._resolvePort(portName);
			return this.portValues[port];
	}

	getMode(portName) {
			const port = this._resolvePort(portName);
			return this.activeMode[port];
	}

	getModeInfo(portName, mode) {
			const port = this._resolvePort(portName);
			return this.portInfo[port]?.modes?.[mode] ?? null;
	}

	getValueFormat(portName, mode) {
			const port = this._resolvePort(portName);
			return this.portInfo[port]?.modes?.[mode]?.valueFormat ?? null;
	}

	async setSensorMode(portName, mode) {
			const port = this._resolvePort(portName);
			await this._setInputFormat(port, mode, 1, 1);
	}


  // ---------------- Public API: Motors ----------------

	_buildPortMap() {
			this.userPortMap = {};

			const type = this.hubType;

			// ------------------------------------------------------------
			// BOOST MOVE HUB (0x40)
			// ------------------------------------------------------------
			if (type === 0x40) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					// Boost ALWAYS has combined ports AB and CD
					this.userPortMap.AB = 0x10;
					this.userPortMap.CD = 0x11;
					
					// internal tilt (Boost) – usually 58
					if (this.portInfo[58]) this.userPortMap.TILT = 58;

					return;
			}

			// ------------------------------------------------------------
			// CITY HUB (0x41) – 2-port hub
			// ------------------------------------------------------------
			if (type === 0x41) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					return;
			}

			// ------------------------------------------------------------
			// REMOTE (0x42) – handheld remote, usually buttons only
			// ------------------------------------------------------------
			if (type === 0x42) {
					// You may later map LEFT/RIGHT buttons here if needed
					return;
			}

			// ------------------------------------------------------------
			// DUPLO (0x44) – Duplo Train Hub
			// ------------------------------------------------------------
			if (type === 0x44) {
					if (this.portInfo[0]) this.userPortMap.A = 0; // motor
					if (this.portInfo[1]) this.userPortMap.B = 1; // color sensor
					return;
			}

			// ------------------------------------------------------------
			// TECHNIC SMALL (0x45) – 2-port Technic hub
			// ------------------------------------------------------------
			if (type === 0x45) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					return;
			}

			// ------------------------------------------------------------
			// TECHNIC HUB (0x80) – 4-port Technic
			// ------------------------------------------------------------
			if (type === 0x80) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					if (this.portInfo[0x10]) this.userPortMap.AB = 0x10;
					if (this.portInfo[0x11]) this.userPortMap.CD = 0x11;
					return;
			}

			// ------------------------------------------------------------
			// INVENTOR HUB (0x81) – 6-port
			// ------------------------------------------------------------
			if (type === 0x81) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;
					if (this.portInfo[4]) this.userPortMap.E = 4;
					if (this.portInfo[5]) this.userPortMap.F = 5;

					// internal IMU – usually 98
					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// SPIKE PRIME (0x83) – 6-port
			// ------------------------------------------------------------
			if (type === 0x83) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;
					if (this.portInfo[4]) this.userPortMap.E = 4;
					if (this.portInfo[5]) this.userPortMap.F = 5;

					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// SPIKE ESSENTIAL (0x84) – 4-port
			// ------------------------------------------------------------
			if (type === 0x84) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// Fallback – assume A–D on 0..3
			// ------------------------------------------------------------
			if (this.portInfo[0]) this.userPortMap.A = 0;
			if (this.portInfo[1]) this.userPortMap.B = 1;
			if (this.portInfo[2]) this.userPortMap.C = 2;
			if (this.portInfo[3]) this.userPortMap.D = 3;
	}

	_resolvePort(port) {
			// Allow numeric ports directly
			if (typeof port === "number") return port;

			// Convert string ports like "A", "B", "CD", "TILT", "IMU"
			if (typeof port === "string") {
					const p = this.userPortMap[port.toUpperCase()];
					if (p != null) return p;
			}

			throw new Error("Unknown port: " + port);
	}

	_setupMotorCaps() {
		const type = this.hubType;

		this.motorCaps = {
			power: true,
			speed: true,
			angle: false,
			goto: false,
			time: false,
			combined: !!(this.userPortMap.AB || this.userPortMap.CD)
		};

		if (type === 0x41 || type === 0x44 || type === 0x43 || type === 100) {
			this.motorCaps.angle = true;
			this.motorCaps.goto  = true;
			this.motorCaps.time  = true;
		}

		if (type === 0x42) {
			this.motorCaps.angle = false;
			this.motorCaps.goto  = false;
			this.motorCaps.time  = false;
		}
	}


	// ------------------ Motor Commands ----------------

	async motorPower(port, power) {
		if (!this.char) throw new Error("LPF2 not connected");

		port = this._resolvePort(port);

		power = Math.max(-127, Math.min(127, power|0));
		const hubId = this.hubId || 0x00;

		const msg = new Uint8Array([
			0x08,
			hubId,
			MSG_PORT_OUTPUT_COMMAND,
			port & 0xFF,
			0x11,
			SUBCMD_START_POWER,
			power & 0xFF,
			0x00 // profile
		]);

		await this._write(msg);
	}

	async motorSpeed(port, speed, maxPower = 100, useProfile = 0x00) {
			if (!this.char) throw new Error("LPF3 not connected");

			port = this._resolvePort(port);

			const hubId = this.hubId || 0x00;

			// LPF3: speed is signed Int8, -100..100
			speed = Math.max(-100, Math.min(100, speed|0));

			const msg = new Uint8Array([
					0x09,          // length = 9 bytes
					hubId,
					MSG_PORT_OUTPUT_COMMAND,
					port & 0xFF,
					0x11,
					SUBCMD_START_SPEED,   // 0x07
					speed & 0xFF,         // signed
					maxPower & 0xFF,
					useProfile & 0xFF
			]);

			await this._write(msg);
	}

	async motorAngle(port, angle, speed, endState = 0x00, useProfile = 0x00) {
			if (!this.char) throw new Error("LPF3 not connected");

			port = this._resolvePort(port);

			const hubId = this.hubId || 0x00;

			const a = angle | 0;

			// LPF3: speed is signed Int8, -100..100
			speed = Math.max(-100, Math.min(100, speed|0));

			const msg = new Uint8Array([
					0x0E,          // length = 14 bytes
					hubId,
					0x81,          // Port Output Command
					port & 0xFF,
					0x11,          // StartPower/Speed/Position command
					0x0B,          // SUBCMD_START_SPEED_FOR_DEGREES

					// Degrees (Int32 LE)
					a & 0xFF,
					(a >> 8) & 0xFF,
					(a >> 16) & 0xFF,
					(a >> 24) & 0xFF,

					speed & 0xFF,      // signed speed
					100,               // MaxPower
					endState & 0xFF,   // 0=float, 126=hold, 127=brake
					useProfile & 0xFF  // 0=no, 1=yes
			]);

			await this._write(msg);
	}

	async motorGoto(port, position, speed, endState = 0x7F, useProfile = 0x00) {
			if (!this.char) throw new Error("LPF3 not connected");

			port = this._resolvePort(port);
			
			const hubId = this.hubId || 0x00;

			// LPF3 spec: Speed must be 1..100
			if (speed <= 0) {
					// Speed 0 means STOP
					return this.motorStop(port, endState === 0x7F);
			}
			if (speed > 100) speed = 100;

			// Ensure 32-bit signed integer
			const p = position | 0;

			const msg = new Uint8Array([
					0x0E,          // length = 14 bytes
					hubId,
					0x81,          // Port Output Command
					port & 0xFF,
					0x11,          // StartPower/Speed/Position command
					0x0D,          // SUBCMD_GOTO_ABSOLUTE_POSITION

					// AbsPos (Int32 LE)
					p & 0xFF,
					(p >> 8) & 0xFF,
					(p >> 16) & 0xFF,
					(p >> 24) & 0xFF,

					speed & 0xFF,      // Speed (1..100)
					100,               // MaxPower
					endState & 0xFF,   // EndState
					useProfile & 0xFF  // UseProfile
			]);

			await this._write(msg);
	}

	async resetPosition(port, newPos = 0) {
			if (!this.char) throw new Error("LPF3 not connected");

			port = this._resolvePort(port);

			const hubId = this.hubId || 0x00;

			// LPF3: position is Int32 signed
			const p = newPos | 0;

			const msg = new Uint8Array([
					0x0B,          // length = 11 bytes
					hubId,
					0x81,          // Port Output Command
					port & 0xFF,
					0x11,          // StartPower/Speed/Position command
					0x51,          // WriteDirectModeData
					0x02,          // Mode 2 = POS (relative position)

					// Int32 LE
					p & 0xFF,
					(p >> 8) & 0xFF,
					(p >> 16) & 0xFF,
					(p >> 24) & 0xFF
			]);

			await this._write(msg);
	}
	
	async motorTime(port, ms, speed, endState = 0x00, useProfile = 0x00) {
			if (!this.char) throw new Error("LPF3 not connected");

			port = this._resolvePort(port);

			const hubId = this.hubId || 0x00;

			speed = Math.max(-100, Math.min(100, speed));

			const t = ms | 0; // ensure integer

			const msg = new Uint8Array([
					0x0C,          // length = 12 bytes
					hubId,
					0x81,          // Port Output Command
					port & 0xFF,
					0x11,          // StartPower/Speed/Position command
					0x09,          // SUBCMD_START_SPEED_FOR_TIME

					t & 0xFF,          // Time LSB
					(t >> 8) & 0xFF,    // Time MSB

					speed & 0xFF,       // Speed (signed)
					100,                // MaxPower
					endState & 0xFF,    // EndState
					useProfile & 0xFF   // UseProfile
			]);

			await this._write(msg);
	}

	async motorStop(port, brake = 0) {

			port = this._resolvePort(port);

			const hubId = this.hubId || 0x00;

			const value = brake ? 0x7F : 0x00;

			const msg = new Uint8Array([
					0x08,
					hubId,
					0x81,
					port,
					0x11,
					0x51,   // WriteDirectModeData
					0x00,   // Mode 0 = speed
					value   // 0 = float, 127 = brake
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
