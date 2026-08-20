// DeviceSBrick.js
// Full SBrick / SBrick Plus / SBrick Light BLE driver
// High-level API + low-level protocol + OTA + notifications + queueing
// Architecture identical to LegoWeDo2.js

// ---------------------------------------------------------------------------
// UUIDs (from SBrick BLE Protocol Revision 26)
// ---------------------------------------------------------------------------

// Remote Control Service
const SBRICK_REMOTE_CONTROL_SERVICE_UUID =
  "4dc591b0-857c-41de-b5f1-15abda665b0c";

// Remote Control Commands Characteristic
const SBRICK_REMOTE_CONTROL_CHAR_UUID =
  "02b8cbcc-0e25-4bda-8790-a15f53e6010f";

// Quick Drive Characteristic (notifications)
const SBRICK_QUICK_DRIVE_CHAR_UUID =
  "489a6ae0-c1ab-4c9c-bdb2-11d373c1b7fb";

// OTA Service
const SBRICK_OTA_SERVICE_UUID =
  "1d14d6ee-fd63-4fa1-bfa4-8f47b42119f0";

// OTA Control Characteristic
const SBRICK_OTA_CONTROL_CHAR_UUID =
  "f7bf3564-fb6d-4e53-88a4-5e37e0326063";

// OTA Data Characteristic
const SBRICK_OTA_DATA_CHAR_UUID =
  "984227f3-34fc-4045-a5d0-2c581f81a153";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Clamp a number between min and max
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Normalize channel: accept "A"–"D" or 0–3
function normalizeChannel(ch) {
  if (typeof ch === "string") {
    const map = { A: 0, B: 1, C: 2, D: 3 };
    const key = ch.trim().toUpperCase();
    if (map[key] !== undefined) return map[key];
  }
  return clamp(Number(ch), 0, 3);
}

// Convert Uint8Array to hex string for logging
function hex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join(" ");
}

// Sleep helper
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// SBrick Class Definition
// ---------------------------------------------------------------------------

export class SBrick {
  constructor(name, manager) {
    // DeviceManager integration
    this.manager = manager;
    this.name = name || null;   // Will be auto-assigned on connect()

    // BLE device + GATT
    this.device = null;
    this.server = null;

    // Services
    this.remoteService = null;
    this.otaService = null;

    // Characteristics
    this.remoteChar = null;       // Remote control commands
    this.quickDriveChar = null;   // Notifications
    this.otaControlChar = null;   // OTA control
    this.otaDataChar = null;      // OTA data

    // Status
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;

    // Command queue (same architecture as LegoWeDo2)
    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    // Pending response for command 0x04 notifications
    this.pendingResponse = null;

    // Hardware detection
    this.productId = null;     // 0x00 = SBrick, 0x01 = SBrick Light
    this.hwVersion = { major: 0, minor: 0 };
    this.fwVersion = { major: 0, minor: 0 };
    this.isLight = false;      // Auto-detected

    // Keepalive
    this.keepAliveTimer = null;
    this.keepAliveIntervalMs = 300; // Send keepalive every 300ms

    // Bind notification handlers
    this._onQuickDriveNotification =
      this._onQuickDriveNotification.bind(this);

    // Logging prefix
    this.namePrefix = "Sbr";
  }

  // -------------------------------------------------------------------------
  // Status + Logging (same pattern as LegoWeDo2)
  // -------------------------------------------------------------------------

  setStatus(status, message = "") {
    this.status = status;
    this.statusMessage = message;
    if (this.manager?.updateDeviceEntry) {
      this.manager.updateDeviceEntry(this);
    }
  }

  log(msg) {
    const prefix = this.name || this.namePrefix;
    console.log(`[${prefix}] ${msg}`);
    if (this.manager?.appendLog) {
      this.manager.appendLog(this, msg);
    }
  }

  // -------------------------------------------------------------------------
  // Connect — identical architecture to LegoWeDo2
  // -------------------------------------------------------------------------
  async connect() {
    this.setStatus("connecting", "Requesting SBrick device...");
    this.log("Connecting to SBrick...");

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SBRICK_REMOTE_CONTROL_SERVICE_UUID] },
          { namePrefix: "SBrick" },
          { namePrefix: "SBrick Light" }
        ],
        optionalServices: [
          SBRICK_REMOTE_CONTROL_SERVICE_UUID,
          SBRICK_OTA_SERVICE_UUID
        ]
      });
    } catch (err) {
      this.log("No SBrick selected.");
      this.setStatus("idle", "No device selected");
      throw err;
    }

    this.device = device;

    // Auto-disconnect detection
    this.device.addEventListener("gattserverdisconnected", () => {
      this.log("GATT server disconnected — device lost.");
      this.manager?.handleDeviceLost?.(this);
      this.forceDisconnect().catch(() => {});
    });

    this.setStatus("connecting", "Connecting via BLE...");
    this.log(`Connecting to GATT server on ${device.name || "SBrick"}...`);

    // Connect to GATT
    this.server = await device.gatt.connect();

    // -----------------------------------------------------------------------
    // Discover services
    // -----------------------------------------------------------------------
    this.remoteService = await this.server.getPrimaryService(
      SBRICK_REMOTE_CONTROL_SERVICE_UUID
    );

    // OTA service is optional (depends on hardware revision)
    try {
      this.otaService = await this.server.getPrimaryService(
        SBRICK_OTA_SERVICE_UUID
      );
    } catch (e) {
      this.otaService = null;
    }

    // -----------------------------------------------------------------------
    // Discover characteristics
    // -----------------------------------------------------------------------
    this.remoteChar = await this.remoteService.getCharacteristic(
      SBRICK_REMOTE_CONTROL_CHAR_UUID
    );

		try {
			this.quickDriveChar = await this.remoteService.getCharacteristic(
				SBRICK_QUICK_DRIVE_CHAR_UUID
			);

			await this.quickDriveChar.startNotifications();
			this.quickDriveChar.addEventListener(
				"characteristicvaluechanged",
				this._onQuickDriveNotification
			);
		} catch (e) {
			this.quickDriveChar = null;
			this.log("QuickDrive characteristic not available (older firmware?) — notifications disabled.");
		}

    if (this.otaService) {
      try {
        this.otaControlChar = await this.otaService.getCharacteristic(
          SBRICK_OTA_CONTROL_CHAR_UUID
        );
        this.otaDataChar = await this.otaService.getCharacteristic(
          SBRICK_OTA_DATA_CHAR_UUID
        );
      } catch (e) {
        this.otaControlChar = null;
        this.otaDataChar = null;
      }
    }

    // -----------------------------------------------------------------------
    // Auto-assign name
    // -----------------------------------------------------------------------
    if (!this.name) {
      this.name = this.manager._allocateName("Sbr");
    }

    this.isConnected = true;
    this.queueActive = true;

    this.log(`Connected as ${this.name}`);
    this.setStatus("connected", "Connected");

    // Start keepalive
    this._startKeepAlive();

    // Notify UI
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new Event("serial-connected"));
  }

  // -------------------------------------------------------------------------
  // Disconnect — identical architecture to LegoWeDo2
  // -------------------------------------------------------------------------
  async disconnect() {
    try {
      this.queueActive = false;

      if (this.quickDriveChar) {
        this.quickDriveChar.removeEventListener(
          "characteristicvaluechanged",
          this._onQuickDriveNotification
        );
      }

      if (this.server && this.server.connected) {
        await this.server.disconnect();
      }

      this.isConnected = false;
      this.setStatus("disconnected", "Disconnected");
      this.log("Disconnected cleanly.");
    } catch (err) {
      this.log("Disconnect error: " + (err?.message || err));
    }
  }

  // -------------------------------------------------------------------------
  // Force Disconnect — identical architecture to LegoWeDo2
  // -------------------------------------------------------------------------
  async forceDisconnect() {
    try {
      this.queueActive = false;

      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }

      this.isConnected = false;
      this.setStatus("disconnected", "Force disconnected");
      this.log("Force disconnect executed.");
    } catch (err) {
      this.log("Force disconnect error: " + (err?.message || err));
    }
  }

  // -------------------------------------------------------------------------
  // Queueing system — identical architecture to LegoWeDo2
  // -------------------------------------------------------------------------
  enqueueCommand(fn) {
    if (!this.queueActive) {
      return Promise.resolve();
    }

    this.commandQueue = this.commandQueue
      .then(async () => {
        await fn();
      })
      .catch(err => {
        this.log("Queue command error: " + (err?.message || err));
      });

    return this.commandQueue;
  }

  // -------------------------------------------------------------------------
  // Low-level write to remote control characteristic
  // -------------------------------------------------------------------------
  async _writeRemote(bytes) {
    return this.enqueueCommand(async () => {
      if (!this.remoteChar) {
        throw new Error("Remote control characteristic not available");
      }
      await this.remoteChar.writeValue(bytes);
    });
  }

  // -------------------------------------------------------------------------
  // Send a protocol command (opcode + payload)
  // expectResponse = true → wait for 0x04 Command Response record
  // -------------------------------------------------------------------------
  async _sendCommand(opcode, payload = [], expectResponse = false) {
    const bytes = new Uint8Array([opcode, ...payload]);

    // Write command
    await this._writeRemote(bytes);
		
		// Reset keepalive timer
		if (this.keepAliveTimer) {
			clearInterval(this.keepAliveTimer);
			this._startKeepAlive();
		}

    // No response expected → done
    if (!expectResponse) return null;

    // Response expected → wait for Quick Drive notification
    return new Promise((resolve, reject) => {
      this.pendingResponse = { resolve, reject, opcode };

      // Timeout protection
      setTimeout(() => {
        if (this.pendingResponse) {
          this.pendingResponse = null;
          reject(new Error(`SBrick command timeout (opcode 0x${opcode.toString(16)})`));
        }
      }, 1000);
    });
  }
 
  // -------------------------------------------------------------------------
  // Quick Drive Notification Handler
  // -------------------------------------------------------------------------
  _onQuickDriveNotification(event) {
    const value = event.target.value;
    const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);

    // SBrick notifications contain multiple "records":
    // [len][type][payload...] [len][type][payload...] ...
    let offset = 0;

    while (offset < data.length) {
      const len = data[offset];
      if (len === 0 || offset + 1 + len > data.length) break;

      const type = data[offset + 1];
      const record = data.slice(offset + 1, offset + 1 + len);

      switch (type) {
        // ---------------------------------------------------------------
        // 0x00 — Product Type (hardware + firmware + product ID)
        // ---------------------------------------------------------------
        case 0x00: {
          // record = [0x00, productId, hwMajor, hwMinor, fwMajor, fwMinor]
          if (record.length >= 6) {
            this.productId = record[1]; // 00 = SBrick, 01 = SBrick Light
            this.hwVersion = { major: record[2], minor: record[3] };
            this.fwVersion = { major: record[4], minor: record[5] };

            this.isLight = (this.productId === 0x01);

            this.log(
              `Product Type → ${this.isLight ? "SBrick Light" : "SBrick"} ` +
              `(HW ${this.hwVersion.major}.${this.hwVersion.minor}, ` +
              `FW ${this.fwVersion.major}.${this.fwVersion.minor})`
            );
          }
          break;
        }

        // ---------------------------------------------------------------
        // 0x02 — Device Identifier (6 bytes)
        // ---------------------------------------------------------------
        case 0x02: {
          const idBytes = record.slice(1);
          this.deviceId = hex(idBytes);
          this.log(`Device ID → ${this.deviceId}`);
          break;
        }

        // ---------------------------------------------------------------
        // 0x04 — Command Response
        // ---------------------------------------------------------------
        case 0x04: {
          const returnCode = record[1];
          const returnValue = record.slice(2);

          if (this.pendingResponse) {
            const { resolve, reject } = this.pendingResponse;
            this.pendingResponse = null;

            if (returnCode === 0x00) {
              resolve(returnValue);
            } else {
              reject(new Error(`SBrick error 0x${returnCode.toString(16)}`));
            }
          }
          break;
        }

        // ---------------------------------------------------------------
        // 0x05 — Thermal Protection Status
        // ---------------------------------------------------------------
        case 0x05: {
          const status = record[1]; // 0 = OK, 1 = Over limit
          this.thermalProtectionActive = (status === 1);
          this.log(
            `Thermal Protection → ${this.thermalProtectionActive ? "ACTIVE" : "OK"}`
          );
          break;
        }

        // ---------------------------------------------------------------
        // 0x06 — Voltage Measurement (ADC)
        // ---------------------------------------------------------------
        case 0x06: {
          // record = [0x06, measurement bytes...]
          const payload = record.slice(1);

          // Each measurement is 2 bytes:
          // upper 12 bits = ADC value
          // lower 4 bits = channel number
          const measurements = [];

          for (let i = 0; i < payload.length; i += 2) {
            const raw = (payload[i] << 8) | payload[i + 1];
            const adc = raw >> 4;
            const channel = raw & 0x0F;
            measurements.push({ adc, channel });
          }

          this.lastVoltageMeasurements = measurements;

          // Auto voltage + temperature extraction
          for (const m of measurements) {
            if (m.channel === 8) {
              this.lastVoltage = this._convertVoltage(m.adc);
            }
            if (m.channel === 9) {
              this.lastTemperature = this._convertTemperature(m.adc);
            }
          }

          break;
        }

        // ---------------------------------------------------------------
        // 0x07 — Signal Completed
        // ---------------------------------------------------------------
        case 0x07: {
          this.log("Signal Completed");
          if (this.onSignalCompleted) {
            this.onSignalCompleted();
          }
          break;
        }

        default:
          // Unknown or unused record type
          break;
      }

      offset += 1 + len;
    }
  }

  // -------------------------------------------------------------------------
  // Voltage conversion (auto-detect SBrick vs SBrick Light)
  // -------------------------------------------------------------------------
  _convertVoltage(adc) {
    if (this.isLight) {
      return (adc * 0.42567) / 127.0;
    } else {
      return (adc * 0.83875) / 127.0;
    }
  }

  // -------------------------------------------------------------------------
  // Temperature conversion (same formula for all SBrick variants)
  // -------------------------------------------------------------------------
  _convertTemperature(adc) {
    return adc / 0.13461 - 160.0;
  }
  

  // -------------------------------------------------------------------------
  // Drive a single motor
  // direction: 0 = reverse, 1 = forward
  // power: 0–255
  // -------------------------------------------------------------------------
  async motorDrive(channel, direction = 1, power = 255) {
    const ch = normalizeChannel(channel);
    const dir = clamp(direction, 0, 1);
    const pwr = clamp(power, 0, 255);

    const payload = [ch, dir, pwr];

    await this._sendCommand(0x01, payload, false);
    this.log(`motorDrive: ch=${ch}, dir=${dir}, power=${pwr}`);
  }

  // -------------------------------------------------------------------------
  // Set motor power (direction auto-determined)
  // Negative power → reverse
  // Positive power → forward
  // -------------------------------------------------------------------------
  async motorPower(channel, power = 100) {
    const ch = normalizeChannel(channel);
    const p = clamp(power, -255, 255);

    const direction = p >= 0 ? 1 : 0;
    const magnitude = Math.abs(p);

    const payload = [ch, direction, magnitude];

    await this._sendCommand(0x01, payload, false);
    this.log(`motorPower: ch=${ch}, power=${p}`);
  }

  // -------------------------------------------------------------------------
  // Stop motor (freewheel)
  // -------------------------------------------------------------------------
  async motorStop(channel) {
    const ch = normalizeChannel(channel);
    const payload = [ch, 1, 0]; // direction=1, power=0
    await this._sendCommand(0x01, payload, false);
    this.log(`motorStop: ch=${ch}`);
  }

  // -------------------------------------------------------------------------
  // Brake motor (hard stop)
  // Uses command 0x00 Brake
  // -------------------------------------------------------------------------
  async motorBrake(channel) {
    const ch = normalizeChannel(channel);
    const payload = [ch];
    await this._sendCommand(0x00, payload, false);
    this.log(`motorBrake: ch=${ch}`);
  }

  // -------------------------------------------------------------------------
  // Multi-channel drive
  // triples = [{ channel, direction, power }, ...]
  // -------------------------------------------------------------------------
  async motorDriveMulti(triples) {
    const payload = [];

    for (const t of triples) {
      const ch = normalizeChannel(t.channel);
      const dir = clamp(t.direction, 0, 1);
      const pwr = clamp(t.power, 0, 255);
      payload.push(ch, dir, pwr);
    }

    await this._sendCommand(0x01, payload, false);
    this.log(`motorDriveMulti: ${JSON.stringify(triples)}`);
  }

  // -------------------------------------------------------------------------
  // Multi-channel brake
  // channels = ["A", "B"] or [0, 1]
  // -------------------------------------------------------------------------
  async motorBrakeMulti(channels) {
    const payload = channels.map(ch => normalizeChannel(ch));
    await this._sendCommand(0x00, payload, false);
    this.log(`motorBrakeMulti: ${channels}`);
  }

  // -------------------------------------------------------------------------
  // PWM Brake (command 0x13)
  // pairs = [{ channel, power }, ...]
  // -------------------------------------------------------------------------
  async motorBrakePwm(pairs) {
    const payload = [];

    for (const p of pairs) {
      const ch = normalizeChannel(p.channel);
      const power = clamp(p.power, 0, 255);
      payload.push(ch, power);
    }

    await this._sendCommand(0x13, payload, false);
    this.log(`motorBrakePwm: ${JSON.stringify(pairs)}`);
  }

	// ---------------------------------------------------------------------------
	// Stop ALL motors and ALL lights (emergency stop)
	// ---------------------------------------------------------------------------
	async motorStopAll() {
	// Stop motors on channels 0–3
	for (let ch = 0; ch < 4; ch++) {
			await this._sendCommand(0x01, [ch, 1, 0], false); // direction=1, power=0
	}

	// Clear PWM brake on all channels
	for (let ch = 0; ch < 4; ch++) {
			await this._sendCommand(0x13, [ch, 0], false);
	}

	// Turn off all lights
	await this._sendCommand(0x36, [0, 0, 0], false);

	this.log("motorStopAll: all motors and lights OFF");
	}


  // -------------------------------------------------------------------------
  // Set lights on a single channel (command 0x34)
  // SBrick Light supports RGB, SBrick supports PWM brightness
  //
  // For SBrick:
  //   r,g,b are treated as a single brightness value (0–255)
  //
  // For SBrick Light:
  //   r,g,b are true RGB values (0–255 each)
  // -------------------------------------------------------------------------
  async setLight(channel, r = 255, g = 255, b = 255) {
    const ch = normalizeChannel(channel);

    const R = clamp(r, 0, 255);
    const G = clamp(g, 0, 255);
    const B = clamp(b, 0, 255);

    const payload = [ch, R, G, B];

    await this._sendCommand(0x34, payload, false);
    this.log(`setLight: ch=${ch}, rgb=(${R},${G},${B})`);
  }

  // -------------------------------------------------------------------------
  // Read light state on a single channel (command 0x35)
  // Returns [R, G, B]
  // -------------------------------------------------------------------------
  async getLight(channel) {
    const ch = normalizeChannel(channel);

    const payload = [ch];
    const resp = await this._sendCommand(0x35, payload, true);

    if (!resp || resp.length < 3) {
      this.log(`getLight: invalid response for ch=${ch}`);
      return { r: 0, g: 0, b: 0 };
    }

    const r = resp[0];
    const g = resp[1];
    const b = resp[2];

    this.log(`getLight: ch=${ch}, rgb=(${r},${g},${b})`);
    return { r, g, b };
  }

  // -------------------------------------------------------------------------
  // Set all lights (command 0x36)
  // SBrick Light supports full RGB
  // SBrick supports brightness only (use R as brightness)
  // -------------------------------------------------------------------------
  async setAllLights(r = 255, g = 255, b = 255) {
    const R = clamp(r, 0, 255);
    const G = clamp(g, 0, 255);
    const B = clamp(b, 0, 255);

    const payload = [R, G, B];

    await this._sendCommand(0x36, payload, false);
    this.log(`setAllLights: rgb=(${R},${G},${B})`);
  }

  // -------------------------------------------------------------------------
  // Read all lights (command 0x37)
  // Returns array of { channel, r, g, b }
  // -------------------------------------------------------------------------
  async getAllLights() {
    const resp = await this._sendCommand(0x37, [], true);

    if (!resp || resp.length % 4 !== 0) {
      this.log("getAllLights: invalid response");
      return [];
    }

    const results = [];
    for (let i = 0; i < resp.length; i += 4) {
      const ch = resp[i];
      const r = resp[i + 1];
      const g = resp[i + 2];
      const b = resp[i + 3];
      results.push({ channel: ch, r, g, b });
    }

    this.log(`getAllLights: ${JSON.stringify(results)}`);
    return results;
  }


  // -------------------------------------------------------------------------
  // Read raw ADC value from a specific channel (command 0x0F)
  // Returns: { adc, channel }
  // -------------------------------------------------------------------------
  async readAdc(channel) {
    const ch = normalizeChannel(channel);

    const resp = await this._sendCommand(0x0F, [ch], true);

    if (!resp || resp.length < 2) {
      this.log(`readAdc: invalid response for ch=${ch}`);
      return { adc: 0, channel: ch };
    }

    const raw = (resp[0] << 8) | resp[1];
    const adc = raw >> 4;
    const chan = raw & 0x0F;

    this.log(`readAdc: ch=${chan}, adc=${adc}`);
    return { adc, channel: chan };
  }

  // -------------------------------------------------------------------------
  // Read battery voltage (channel 8)
  // Auto-detects SBrick vs SBrick Light voltage formula
  // -------------------------------------------------------------------------
  async readVoltage() {
    const { adc } = await this.readAdc(8);
    const voltage = this._convertVoltage(adc);

    this.lastVoltage = voltage;
    this.log(`readVoltage: ${voltage.toFixed(2)} V`);

    return voltage;
  }

  // -------------------------------------------------------------------------
  // Read internal temperature (channel 9)
  // -------------------------------------------------------------------------
  async readTemperature() {
    const { adc } = await this.readAdc(9);
    const temp = this._convertTemperature(adc);

    this.lastTemperature = temp;
    this.log(`readTemperature: ${temp.toFixed(1)} °C`);

    return temp;
  }

  // -------------------------------------------------------------------------
  // Read all ADC channels (0–9)
  // Returns array of { channel, adc }
  // -------------------------------------------------------------------------
  async readAllAdc() {
    const results = [];

    for (let ch = 0; ch <= 9; ch++) {
      try {
        const r = await this.readAdc(ch);
        results.push(r);
      } catch (e) {
        this.log(`readAllAdc: error on channel ${ch}: ${e.message}`);
      }
    }

    this.log(`readAllAdc: ${JSON.stringify(results)}`);
    return results;
  }

  // -------------------------------------------------------------------------
  // Convenience: read both voltage + temperature together
  // -------------------------------------------------------------------------
  async readStatus() {
    const voltage = await this.readVoltage();
    const temperature = await this.readTemperature();

    return { voltage, temperature };
  }


  // -------------------------------------------------------------------------
  // Authenticate as OWNER (command 0x20)
  // Password must be 4 bytes
  // -------------------------------------------------------------------------
  async authenticateOwner(password) {
    const bytes = this._normalizePassword(password);
    const resp = await this._sendCommand(0x20, bytes, true);

    const ok = resp && resp[0] === 0x00;
    this.log(`authenticateOwner: ${ok ? "OK" : "FAILED"}`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Authenticate as GUEST (command 0x21)
  // Password must be 4 bytes
  // -------------------------------------------------------------------------
  async authenticateGuest(password) {
    const bytes = this._normalizePassword(password);
    const resp = await this._sendCommand(0x21, bytes, true);

    const ok = resp && resp[0] === 0x00;
    this.log(`authenticateGuest: ${ok ? "OK" : "FAILED"}`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Set password (command 0x22)
  // Password must be 4 bytes
  // -------------------------------------------------------------------------
  async setPassword(password) {
    const bytes = this._normalizePassword(password);
    const resp = await this._sendCommand(0x22, bytes, true);

    const ok = resp && resp[0] === 0x00;
    this.log(`setPassword: ${ok ? "OK" : "FAILED"}`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Clear password (command 0x23)
  // -------------------------------------------------------------------------
  async clearPassword() {
    const resp = await this._sendCommand(0x23, [], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`clearPassword: ${ok ? "OK" : "FAILED"}`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Set authentication timeout (command 0x24)
  // timeoutSec: 0–255 seconds
  // -------------------------------------------------------------------------
  async setAuthTimeout(timeoutSec = 30) {
    const t = clamp(timeoutSec, 0, 255);
    const resp = await this._sendCommand(0x24, [t], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`setAuthTimeout: ${ok ? "OK" : "FAILED"} (${t}s)`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Get authentication timeout (command 0x25)
  // Returns timeout in seconds
  // -------------------------------------------------------------------------
  async getAuthTimeout() {
    const resp = await this._sendCommand(0x25, [], true);

    if (!resp || resp.length < 1) {
      this.log("getAuthTimeout: invalid response");
      return 0;
    }

    const timeout = resp[0];
    this.log(`getAuthTimeout: ${timeout}s`);
    return timeout;
  }

  // -------------------------------------------------------------------------
  // Query authentication state (command 0x26)
  // Returns:
  //   0 = no authentication required
  //   1 = guest authenticated
  //   2 = owner authenticated
  // -------------------------------------------------------------------------
  async getAuthState() {
    const resp = await this._sendCommand(0x26, [], true);

    if (!resp || resp.length < 1) {
      this.log("getAuthState: invalid response");
      return 0;
    }

    const state = resp[0];
    this.log(`getAuthState: ${state}`);
    return state;
  }

  // -------------------------------------------------------------------------
  // Query password state (command 0x27)
  // Returns:
  //   0 = no password set
  //   1 = password set
  // -------------------------------------------------------------------------
  async getPasswordState() {
    const resp = await this._sendCommand(0x27, [], true);

    if (!resp || resp.length < 1) {
      this.log("getPasswordState: invalid response");
      return 0;
    }

    const state = resp[0];
    this.log(`getPasswordState: ${state}`);
    return state;
  }

  // -------------------------------------------------------------------------
  // Helper: normalize password to 4 bytes
  // Accepts string or array
  // -------------------------------------------------------------------------
  _normalizePassword(password) {
    if (typeof password === "string") {
      // Convert string to bytes (ASCII)
      const bytes = Array.from(password).map(c => c.charCodeAt(0));
      while (bytes.length < 4) bytes.push(0);
      return bytes.slice(0, 4);
    }

    if (Array.isArray(password)) {
      const bytes = password.slice(0, 4).map(v => clamp(v, 0, 255));
      while (bytes.length < 4) bytes.push(0);
      return bytes;
    }

    // Default: no password
    return [0, 0, 0, 0];
  }


  // -------------------------------------------------------------------------
  // Get Brick ID (6-byte unique identifier)
  // Already parsed from notification type 0x02
  // -------------------------------------------------------------------------
  async getBrickId() {
    // If already known, return immediately
    if (this.deviceId) {
      this.log(`getBrickId: ${this.deviceId}`);
      return this.deviceId;
    }

    // Otherwise request it explicitly (command 0x02)
    const resp = await this._sendCommand(0x02, [], true);

    if (!resp || resp.length < 6) {
      this.log("getBrickId: invalid response");
      return null;
    }

    const idBytes = resp.slice(0, 6);
    this.deviceId = hex(idBytes);

    this.log(`getBrickId: ${this.deviceId}`);
    return this.deviceId;
  }

  // -------------------------------------------------------------------------
  // Get firmware version (from Product Type record 0x00)
  // Returns: { major, minor }
  // -------------------------------------------------------------------------
  async getFirmwareVersion() {
    // If already detected from notifications
    if (this.fwVersion.major || this.fwVersion.minor) {
      this.log(
        `getFirmwareVersion: ${this.fwVersion.major}.${this.fwVersion.minor}`
      );
      return this.fwVersion;
    }

    // Force a product type query (command 0x00)
    const resp = await this._sendCommand(0x00, [], true);

    if (!resp || resp.length < 6) {
      this.log("getFirmwareVersion: invalid response");
      return { major: 0, minor: 0 };
    }

    this.productId = resp[1];
    this.hwVersion = { major: resp[2], minor: resp[3] };
    this.fwVersion = { major: resp[4], minor: resp[5] };
    this.isLight = (this.productId === 0x01);

    this.log(
      `getFirmwareVersion: ${this.fwVersion.major}.${this.fwVersion.minor}`
    );
    return this.fwVersion;
  }

  // -------------------------------------------------------------------------
  // Get hardware version (from Product Type record 0x00)
  // Returns: { major, minor }
  // -------------------------------------------------------------------------
  async getHardwareVersion() {
    // If already known
    if (this.hwVersion.major || this.hwVersion.minor) {
      this.log(
        `getHardwareVersion: ${this.hwVersion.major}.${this.hwVersion.minor}`
      );
      return this.hwVersion;
    }

    // Force a product type query
    const resp = await this._sendCommand(0x00, [], true);

    if (!resp || resp.length < 6) {
      this.log("getHardwareVersion: invalid response");
      return { major: 0, minor: 0 };
    }

    this.productId = resp[1];
    this.hwVersion = { major: resp[2], minor: resp[3] };
    this.fwVersion = { major: resp[4], minor: resp[5] };
    this.isLight = (this.productId === 0x01);

    this.log(
      `getHardwareVersion: ${this.hwVersion.major}.${this.hwVersion.minor}`
    );
    return this.hwVersion;
  }

  // -------------------------------------------------------------------------
  // Get device name (command 0x31)
  // Returns a string
  // -------------------------------------------------------------------------
  async getDeviceName() {
    const resp = await this._sendCommand(0x31, [], true);

    if (!resp || resp.length < 1) {
      this.log("getDeviceName: invalid response");
      return "";
    }

    // Response is ASCII bytes
    const name = String.fromCharCode(...resp);
    this.log(`getDeviceName: "${name}"`);
    return name;
  }

  // -------------------------------------------------------------------------
  // Set device name (command 0x30)
  // Name must be ASCII, max 16 bytes
  // -------------------------------------------------------------------------
  async setDeviceName(name) {
    const ascii = Array.from(name).map(c => c.charCodeAt(0));
    const bytes = ascii.slice(0, 16); // max length 16

    const resp = await this._sendCommand(0x30, bytes, true);

    const ok = resp && resp[0] === 0x00;
    this.log(`setDeviceName: ${ok ? "OK" : "FAILED"} ("${name}")`);

    if (ok) {
      this.name = name;
      this.manager?.updateDeviceEntry?.(this);
    }

    return ok;
  }


  // -------------------------------------------------------------------------
  // Set watchdog timeout (command 0x28)
  // timeoutSec: 0–255 seconds
  // -------------------------------------------------------------------------
  async setWatchdogTimeout(timeoutSec = 10) {
    const t = clamp(timeoutSec, 0, 255);
    const resp = await this._sendCommand(0x28, [t], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`setWatchdogTimeout: ${ok ? "OK" : "FAILED"} (${t}s)`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Get watchdog timeout (command 0x29)
  // Returns timeout in seconds
  // -------------------------------------------------------------------------
  async getWatchdogTimeout() {
    const resp = await this._sendCommand(0x29, [], true);

    if (!resp || resp.length < 1) {
      this.log("getWatchdogTimeout: invalid response");
      return 0;
    }

    const timeout = resp[0];
    this.log(`getWatchdogTimeout: ${timeout}s`);
    return timeout;
  }

  // -------------------------------------------------------------------------
  // Set thermal limit (command 0x2A)
  // limitCelsius: 0–255 °C
  // -------------------------------------------------------------------------
  async setThermalLimit(limitCelsius = 80) {
    const t = clamp(limitCelsius, 0, 255);
    const resp = await this._sendCommand(0x2A, [t], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`setThermalLimit: ${ok ? "OK" : "FAILED"} (${t}°C)`);
    return ok;
  }

  // -------------------------------------------------------------------------
  // Get thermal limit (command 0x2B)
  // Returns limit in °C
  // -------------------------------------------------------------------------
  async getThermalLimit() {
    const resp = await this._sendCommand(0x2B, [], true);

    if (!resp || resp.length < 1) {
      this.log("getThermalLimit: invalid response");
      return 0;
    }

    const limit = resp[0];
    this.log(`getThermalLimit: ${limit}°C`);
    return limit;
  }

  // -------------------------------------------------------------------------
  // Set connection parameters (command 0x2C)
  // intervalMin, intervalMax, latency, timeout
  // All values are 16-bit except latency (8-bit)
  // -------------------------------------------------------------------------
  async setConnectionParameters(intervalMin, intervalMax, latency, timeout) {
    const iMin = clamp(intervalMin, 0, 65535);
    const iMax = clamp(intervalMax, 0, 65535);
    const lat = clamp(latency, 0, 255);
    const to  = clamp(timeout, 0, 65535);

    const payload = [
      iMin >> 8, iMin & 0xFF,
      iMax >> 8, iMax & 0xFF,
      lat,
      to >> 8, to & 0xFF
    ];

    const resp = await this._sendCommand(0x2C, payload, true);

    const ok = resp && resp[0] === 0x00;
    this.log(
      `setConnectionParameters: ${ok ? "OK" : "FAILED"} ` +
      `(min=${iMin}, max=${iMax}, latency=${lat}, timeout=${to})`
    );

    return ok;
  }

  // -------------------------------------------------------------------------
  // Get connection parameters (command 0x2D)
  // Returns: { intervalMin, intervalMax, latency, timeout }
  // -------------------------------------------------------------------------
  async getConnectionParameters() {
    const resp = await this._sendCommand(0x2D, [], true);

    if (!resp || resp.length < 7) {
      this.log("getConnectionParameters: invalid response");
      return {
        intervalMin: 0,
        intervalMax: 0,
        latency: 0,
        timeout: 0
      };
    }

    const intervalMin = (resp[0] << 8) | resp[1];
    const intervalMax = (resp[2] << 8) | resp[3];
    const latency     = resp[4];
    const timeout     = (resp[5] << 8) | resp[6];

    const result = { intervalMin, intervalMax, latency, timeout };

    this.log(`getConnectionParameters: ${JSON.stringify(result)}`);
    return result;
  }

  // -------------------------------------------------------------------------
  // Send signal (command 0x2E)
  // Notification handled in Part 5 (record type 0x07)
  // -------------------------------------------------------------------------
  async sendSignal() {
    const resp = await this._sendCommand(0x2E, [], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`sendSignal: ${ok ? "OK" : "FAILED"}`);

    return ok;
  }


  // -------------------------------------------------------------------------
  // Enter DFU mode (command 0x40)
  // Device will switch to OTA service
  // -------------------------------------------------------------------------
  async otaEnterDfu() {
    const resp = await this._sendCommand(0x40, [], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`otaEnterDfu: ${ok ? "OK" : "FAILED"}`);

    if (!ok) return false;

    // After entering DFU, the device disconnects and reconnects
    this.log("Device entering DFU mode — waiting for reconnection...");
    return true;
  }

  // -------------------------------------------------------------------------
  // Write a firmware chunk (OTA Data characteristic)
  // chunk: Uint8Array (max 20 bytes)
  // -------------------------------------------------------------------------
  async otaWriteChunk(chunk) {
    if (!this.otaDataChar) {
      throw new Error("OTA Data characteristic not available");
    }

    const bytes = new Uint8Array(chunk);

    if (bytes.length > 20) {
      throw new Error("OTA chunk too large (max 20 bytes)");
    }

    await this.enqueueCommand(async () => {
      await this.otaDataChar.writeValue(bytes);
    });

    this.log(`otaWriteChunk: ${bytes.length} bytes`);
  }

  // -------------------------------------------------------------------------
  // Finalize DFU (command 0x41)
  // -------------------------------------------------------------------------
  async otaFinalize() {
    const resp = await this._sendCommand(0x41, [], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`otaFinalize: ${ok ? "OK" : "FAILED"}`);

    return ok;
  }

  // -------------------------------------------------------------------------
  // Reboot from DFU (command 0x42)
  // -------------------------------------------------------------------------
  async otaRebootFromDfu() {
    const resp = await this._sendCommand(0x42, [], true);

    const ok = resp && resp[0] === 0x00;
    this.log(`otaRebootFromDfu: ${ok ? "OK" : "FAILED"}`);

    return ok;
  }

  // -------------------------------------------------------------------------
  // High-level OTA upload helper
  // firmware: Uint8Array
  // -------------------------------------------------------------------------
  async otaUploadFirmware(firmware) {
    this.log(`OTA upload started — ${firmware.length} bytes`);

    // Enter DFU mode
    const okEnter = await this.otaEnterDfu();
    if (!okEnter) {
      this.log("OTA aborted: cannot enter DFU mode");
      return false;
    }

    // Write chunks
    const CHUNK_SIZE = 20;
    for (let i = 0; i < firmware.length; i += CHUNK_SIZE) {
      const chunk = firmware.slice(i, i + CHUNK_SIZE);
      await this.otaWriteChunk(chunk);
    }

    // Finalize
    const okFinalize = await this.otaFinalize();
    if (!okFinalize) {
      this.log("OTA aborted: finalize failed");
      return false;
    }

    // Reboot
    const okReboot = await this.otaRebootFromDfu();
    if (!okReboot) {
      this.log("OTA aborted: reboot failed");
      return false;
    }

    this.log("OTA upload completed successfully.");
    return true;
  }


  // -------------------------------------------------------------------------
  // Start keepalive timer
  // Reads uptime every 5 seconds using command 0x29
  // If it fails → assume disconnect
  // -------------------------------------------------------------------------
  _startKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    this.keepAliveTimer = setInterval(async () => {
      if (!this.isConnected || !this.queueActive) return;

      try {
        // Command 0x29 returns watchdog timeout, but also acts as a ping
        await this._sendCommand(0x29, [], true);
        this.log("keepalive: OK");
      } catch (err) {
        this.log("keepalive: FAILED → device lost");
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;

        this.isConnected = false;
        this.setStatus("disconnected", "Keepalive failed");

        // Notify manager
        this.manager?.handleDeviceLost?.(this);

        // Force disconnect
        await this.forceDisconnect();
      }
    }, this.keepAliveIntervalMs);
  }

  // -------------------------------------------------------------------------
  // Stop keepalive timer
  // -------------------------------------------------------------------------
  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Override disconnect to stop keepalive
  // -------------------------------------------------------------------------
  async disconnect() {
    this._stopKeepAlive();
    return await super.disconnect?.();
  }

  // -------------------------------------------------------------------------
  // Override forceDisconnect to stop keepalive
  // -------------------------------------------------------------------------
  async forceDisconnect() {
    this._stopKeepAlive();
    return await super.forceDisconnect?.();
  }



}
