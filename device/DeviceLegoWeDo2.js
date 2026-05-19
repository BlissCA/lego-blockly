// DeviceLegoWeDo2.js
// LEGO WeDo 2.0 BLE driver

// WeDo 2.0 GATT UUIDs (16‑bit, expanded to 128‑bit by the browser)
// Service:        00001523-1212-efde-1523-785feabcd123
// Button:         00001526-1212-efde-1523-785feabcd123
// Port Type:      00001527-1212-efde-1523-785feabcd123
// Sensor Value:   00001560-1212-efde-1523-785feabcd123
// Value Format:   00001561-1212-efde-1523-785feabcd123
// Input Command:  00001563-1212-efde-1523-785feabcd123
// Output Command: 00001565-1212-efde-1523-785feabcd123
// Disconnect:     0000152c-1212-efde-1523-785feabcd123

const WEDO_SERVICE_UUID       = "00001523-1212-efde-1523-785feabcd123";
const WEDO_CHAR_BUTTON        = "00001526-1212-efde-1523-785feabcd123";
const WEDO_CHAR_PORT_TYPE     = "00001527-1212-efde-1523-785feabcd123";
const WEDO_CHAR_SENSOR_VALUE  = "00001560-1212-efde-1523-785feabcd123";
const WEDO_CHAR_VALUE_FORMAT  = "00001561-1212-efde-1523-785feabcd123";
const WEDO_CHAR_INPUT_CMD     = "00001563-1212-efde-1523-785feabcd123";
const WEDO_CHAR_OUTPUT_CMD    = "00001565-1212-efde-1523-785feabcd123";
const WEDO_CHAR_DISCONNECT    = "0000152c-1212-efde-1523-785feabcd123";


// Known device types (from WeDo 2.0 protocol reverse‑engineering)
const WEDO_DEVICE_NONE        = 0x00;
const WEDO_DEVICE_MOTOR       = 0x01;
const WEDO_DEVICE_TILT        = 0x04;
const WEDO_DEVICE_MOTION      = 0x08;

// Internal tilt sensor port (fixed)
const WEDO_INTERNAL_TILT_PORT = 0x03;

// Clamp helper
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class LegoWeDo2 {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.service = null;

    this.charButton = null;
    this.charPortType = null;
    this.charSensorValue = null;
    this.charValueFormat = null;
    this.charInputCmd = null;
    this.charOutputCmd = null;
    this.charDisconnect = null;

    this.namePrefix = "WeDo2_";
    this.status = "disconnected";
    this.statusMessage = "";
 
    // Command queue
    this.queueActive = true;
    this.commandQueue = Promise.resolve();

    // Port state
    // portDevices[portId] = { type, isMotor, isSensor }
    this.portDevices = {};
    // portValues[portId] = last raw value (0‑255)
    this.portValues = {};
    // button state
    this.buttonPressed = false;

    // Bind handlers
    this._onGattDisconnected = this._onGattDisconnected.bind(this);
    this._onButtonNotification = this._onButtonNotification.bind(this);
    this._onPortTypeNotification = this._onPortTypeNotification.bind(this);
    this._onSensorValueNotification = this._onSensorValueNotification.bind(this);
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
      .then(async () => {
        await fn();
      })
      .catch(err => {
        this.log("Queue command error: " + (err?.message || err));
      });

    return this.commandQueue;
  }

  async _write(characteristic, bytes) {
    return this.enqueueCommand(async () => {
      if (!characteristic) return;
      await characteristic.writeValue(bytes);
    });
  }

  async _writeOutput(bytes) {
    return this._write(this.charOutputCmd, bytes);
  }

  async _writeInput(bytes) {
    return this._write(this.charInputCmd, bytes);
  }

  // ---------------- Connection Lifecycle ----------------

  async connect() {
    try {
      this.setStatus("connecting", "Requesting WeDo 2.0 device…");

    device = await navigator.bluetooth.requestDevice({
      filters: [
          { services: [WEDO_SERVICE_UUID] }
      ],
      optionalServices: [WEDO_SERVICE_UUID]
    });

      this.device.addEventListener("gattserverdisconnected", this._onGattDisconnected);

      this.setStatus("connecting", "Connecting GATT…");
      this.server = await this.device.gatt.connect();

      this.service = await this.server.getPrimaryService(WEDO_SERVICE_UUID);

      // Get characteristics
      this.charButton       = await this.service.getCharacteristic(WEDO_CHAR_BUTTON);
      this.charPortType     = await this.service.getCharacteristic(WEDO_CHAR_PORT_TYPE);
      this.charSensorValue  = await this.service.getCharacteristic(WEDO_CHAR_SENSOR_VALUE);
      this.charValueFormat  = await this.service.getCharacteristic(WEDO_CHAR_VALUE_FORMAT);
      this.charInputCmd     = await this.service.getCharacteristic(WEDO_CHAR_INPUT_CMD);
      this.charOutputCmd    = await this.service.getCharacteristic(WEDO_CHAR_OUTPUT_CMD);
      this.charDisconnect   = await this.service.getCharacteristic(WEDO_CHAR_DISCONNECT);

      // Start notifications
      await this.charButton.startNotifications();
      this.charButton.addEventListener("characteristicvaluechanged", this._onButtonNotification);

      await this.charPortType.startNotifications();
      this.charPortType.addEventListener("characteristicvaluechanged", this._onPortTypeNotification);

      await this.charSensorValue.startNotifications();
      this.charSensorValue.addEventListener("characteristicvaluechanged", this._onSensorValueNotification);

      // Allocate name
      if (!this.name) {
        this.name = this.manager._allocateName(this.namePrefix);
      }

      this.queueActive = true;
      this.setStatus("connected", "Connected");
      this.log(`Connected to ${this.device.name || "WeDo 2.0"}`);

      // Initialize known ports (two external ports + internal tilt)
      this._initDefaultPorts();

      // Enable internal tilt sensor notifications
      await this._enableSensorOnPort(WEDO_INTERNAL_TILT_PORT);

      // Ask hub to report port types for external ports
      // (Some stacks send these automatically; this is a safe nudge.)
      await this._requestPortTypes();

    } catch (err) {
      this.setStatus("error", "Connection failed");
      this.log("Connection failed: " + (err?.message || err));
      throw err;
    }
  }

  async disconnect() {
    try {
      this.queueActive = false;

      if (this.charButton) {
        this.charButton.removeEventListener("characteristicvaluechanged", this._onButtonNotification);
      }
      if (this.charPortType) {
        this.charPortType.removeEventListener("characteristicvaluechanged", this._onPortTypeNotification);
      }
      if (this.charSensorValue) {
        this.charSensorValue.removeEventListener("characteristicvaluechanged", this._onSensorValueNotification);
      }

      if (this.server && this.server.connected) {
        await this.server.disconnect();
      }

      this.setStatus("disconnected", "Disconnected");
      this.log("Disconnected cleanly.");
    } catch (err) {
      this.log("Disconnect error: " + (err?.message || err));
    }
  }

  async forceDisconnect() {
    try {
      this.queueActive = false;

      if (this.device && this.device.gatt.connected) {
        this.device.gatt.disconnect();
      }

      this.setStatus("disconnected", "Force disconnected");
      this.log("Force disconnect executed.");
    } catch (err) {
      this.log("Force disconnect error: " + (err?.message || err));
    }
  }

  _onGattDisconnected() {
    this.queueActive = false;
    this.setStatus("disconnected", "GATT disconnected");
    this.log("GATT disconnected.");
  }

  // ---------------- Port / Device Management ----------------

  _initDefaultPorts() {
    // WeDo 2.0 has two external ports (1 and 2) plus an internal tilt sensor on port 3.
    // We start with unknown types for external ports; port type notifications will refine this.
    this.portDevices = {
      0x01: { type: WEDO_DEVICE_NONE, isMotor: false, isSensor: false },
      0x02: { type: WEDO_DEVICE_NONE, isMotor: false, isSensor: false },
      [WEDO_INTERNAL_TILT_PORT]: { type: WEDO_DEVICE_TILT, isMotor: false, isSensor: true }
    };
    this.log("Ports initialized: 1, 2 (external), 3 (internal tilt).");
  }

  _updatePortType(portId, deviceType) {
    const isMotor = deviceType === WEDO_DEVICE_MOTOR;
    const isSensor = deviceType === WEDO_DEVICE_TILT || deviceType === WEDO_DEVICE_MOTION;

    this.portDevices[portId] = {
      type: deviceType,
      isMotor,
      isSensor
    };

    let typeName = "none";
    if (deviceType === WEDO_DEVICE_MOTOR) typeName = "motor";
    else if (deviceType === WEDO_DEVICE_TILT) typeName = "tilt";
    else if (deviceType === WEDO_DEVICE_MOTION) typeName = "motion";

    this.log(`Port ${portId} device type: ${typeName}`);
  }

  async _requestPortTypes() {
    // Many hubs send port type notifications automatically on connect.
    // If needed, you can send specific input commands here to query ports.
    // We keep this as a stub for now to stay compatible with existing stacks.
  }

  async _enableSensorOnPort(portId) {
    // WeDo 2.0 Input Command format (simplified):
    // [len, portId, mode, flags...]
    // For basic value notifications, most stacks use:
    //   len = 0x01, mode = 0x01 (default), flags = 0x01 (enable)
    //
    // Here we use a conservative pattern that works with common implementations.
    const len = 0x01;
    const mode = 0x01;
    const enable = 0x01;
    const bytes = new Uint8Array([len, portId, mode, enable]);
    await this._writeInput(bytes);
    this.log(`Enabled sensor notifications on port ${portId}`);
  }

  // ---------------- Notification Handlers ----------------

  _onButtonNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    // Button characteristic usually sends a single byte: 0x00 (released) or 0x01 (pressed)
    const state = data[0] || 0;
    this.buttonPressed = !!state;
    this.log(`Button ${this.buttonPressed ? "pressed" : "released"}`);
  }

  _onPortTypeNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    // Typical format: [portId, deviceType, ...]
    const portId = data[0];
    const deviceType = data[1];

    this._updatePortType(portId, deviceType);

    // If this is a sensor, enable notifications for it
    if (this.portDevices[portId]?.isSensor) {
      this._enableSensorOnPort(portId).catch(err => {
        this.log("Enable sensor error: " + (err?.message || err));
      });
    }
  }

  _onSensorValueNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    // Typical format: [portId, value, ...]
    const portId = data[0];
    const value = data[1];

    this.portValues[portId] = value;
    this.manager?.updatePortValue?.(this, portId, value);
  }

  // ---------------- Sensor Getters ----------------

  // Internal tilt sensor (port 3)
  getTiltRaw() {
    return this.portValues[WEDO_INTERNAL_TILT_PORT] ?? 0;
  }

  // Convenience: map raw tilt value to a simple angle bucket if desired
  getTiltAngle() {
    const raw = this.getTiltRaw();
    // Many stacks map 0‑7 to discrete tilt states; you can adapt this mapping as needed.
    return raw;
  }

  // Motion sensor on external port (1 or 2)
  getMotionRaw(portId = 0x01) {
    return this.portValues[portId] ?? 0;
  }

  // Distance in arbitrary units (0‑10 or 0‑100 depending on firmware)
  getDistance(portId = 0x01) {
    return this.getMotionRaw(portId);
  }

  // ---------------- Motor Control ----------------

  // Set motor power on port (1 or 2), power in range -100..100
  async setMotorPower(portId = 0x01, power = 50) {
    if (!this.portDevices[portId]?.isMotor) {
      this.log(`setMotorPower: port ${portId} is not a motor (type=${this.portDevices[portId]?.type || 0})`);
      return;
    }

    const p = clamp(power, -100, 100);

    // WeDo 2.0 Output Command format (from protocol summary):
    // [len, portId, 0x01, 0x01, speedByte]
    // len = 0x04 (bytes after len)
    // speedByte is signed: 0x00..0x63 for forward, 0x9D..0xFF for reverse (two's complement)
    const len = 0x04;
    let speedByte = p & 0xff;
    if (p < 0) {
      speedByte = 0x100 + p; // two's complement
    }

    const bytes = new Uint8Array([len, portId, 0x01, 0x01, speedByte]);
    await this._writeOutput(bytes);
    this.log(`Motor port ${portId} power set to ${p}`);
  }

  async stopMotor(portId = 0x01) {
    await this.setMotorPower(portId, 0);
    this.log(`Motor port ${portId} stopped`);
  }

  // Simple timed run (ms) at given power
  async runMotorTimed(portId = 0x01, power = 50, durationMs = 1000) {
    await this.setMotorPower(portId, power);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.stopMotor(portId);
  }

  // ---------------- Hub Convenience ----------------

  async turnOffHub() {
    if (!this.charDisconnect) return;
    // Disconnect characteristic usually accepts a single 0x01 to power off
    const bytes = new Uint8Array([0x01]);
    await this._write(this.charDisconnect, bytes);
    this.log("Turn off hub command sent.");
  }

  isButtonPressed() {
    return this.buttonPressed;
  }
}
