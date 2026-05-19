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


// ---------------- UUIDs ----------------

// WeDo 2.0 primary service
const WEDO_SERVICE_UUID       = "00001523-1212-efde-1523-785feabcd123";

// Characteristics
const WEDO_CHAR_BUTTON        = "00001526-1212-efde-1523-785feabcd123";
const WEDO_CHAR_PORT_TYPE     = "00001527-1212-efde-1523-785feabcd123";
const WEDO_CHAR_SENSOR_VALUE  = "00001560-1212-efde-1523-785feabcd123";
const WEDO_CHAR_VALUE_FORMAT  = "00001561-1212-efde-1523-785feabcd123";
const WEDO_CHAR_INPUT_CMD     = "00001563-1212-efde-1523-785feabcd123";
const WEDO_CHAR_OUTPUT_CMD    = "00001565-1212-efde-1523-785feabcd123";
const WEDO_CHAR_DISCONNECT    = "0000152c-1212-efde-1523-785feabcd123";

// Device types
const WEDO_DEVICE_NONE        = 0x00;
const WEDO_DEVICE_MOTOR       = 0x01;
const WEDO_DEVICE_TILT        = 0x04;
const WEDO_DEVICE_MOTION      = 0x08;

// Internal tilt sensor port
const WEDO_INTERNAL_TILT_PORT = 0x03;

// Helpers
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

    this.namePrefix = "WeDo 2.0";
    this.status = "idle";
    this.statusMessage = "";
    this.isConnected = false;

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
    this.setStatus("connecting", "Requesting WeDo 2.0 hub...");
    this.log("Connecting to WeDo 2.0 hub...");

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [WEDO_SERVICE_UUID] } // WeDo 2.0 hubs only
        ],
        optionalServices: [
          WEDO_SERVICE_UUID
        ]
      });
    } catch (err) {
      this.log("No WeDo 2.0 hub selected");
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
    this.log(`Connecting to GATT server on ${device.name || "WeDo 2.0 hub"}...`);

    // Connect
    this.server = await device.gatt.connect();

    // Primary service
    this.service = await this.server.getPrimaryService(WEDO_SERVICE_UUID);

    // Characteristics
    this.charButton       = await this.service.getCharacteristic(WEDO_CHAR_BUTTON);
    this.charPortType     = await this.service.getCharacteristic(WEDO_CHAR_PORT_TYPE);
    this.charSensorValue  = await this.service.getCharacteristic(WEDO_CHAR_SENSOR_VALUE);
    this.charValueFormat  = await this.service.getCharacteristic(WEDO_CHAR_VALUE_FORMAT);
    this.charInputCmd     = await this.service.getCharacteristic(WEDO_CHAR_INPUT_CMD);
    this.charOutputCmd    = await this.service.getCharacteristic(WEDO_CHAR_OUTPUT_CMD);
    this.charDisconnect   = await this.service.getCharacteristic(WEDO_CHAR_DISCONNECT);

    // Notifications
    await this.charButton.startNotifications();
    this.charButton.addEventListener("characteristicvaluechanged", this._onButtonNotification);

    await this.charPortType.startNotifications();
    this.charPortType.addEventListener("characteristicvaluechanged", this._onPortTypeNotification);

    await this.charSensorValue.startNotifications();
    this.charSensorValue.addEventListener("characteristicvaluechanged", this._onSensorValueNotification);

    // Initialize ports
    this._initDefaultPorts();

    // Enable internal tilt sensor
    await this._enableSensorOnPort(WEDO_INTERNAL_TILT_PORT);

    // Allocate name
    if (!this.name) {
      this.name = this.manager._allocateName(this.namePrefix);
    }

    this.isConnected = true;
    this.queueActive = true;

    this.log(`Connected as ${this.name}`);
    this.setStatus("connected", "Connected");
    window.logStatus?.(`Connected: ${this.name}`);
    document.dispatchEvent(new Event("serial-connected"));
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

      this.isConnected = false;
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

      this.isConnected = false;
      this.setStatus("disconnected", "Force disconnected");
      this.log("Force disconnect executed.");
    } catch (err) {
      this.log("Force disconnect error: " + (err?.message || err));
    }
  }

  _onGattDisconnected() {
    this.isConnected = false;
    this.queueActive = false;
    this.setStatus("disconnected", "GATT disconnected");
    this.log("GATT disconnected.");
  }

  // ---------------- Port / Device Management ----------------

  _initDefaultPorts() {
    // WeDo 2.0 has two external ports (1 and 2) plus an internal tilt sensor on port 3.
    this.portDevices = {
      0x01: { type: WEDO_DEVICE_NONE,  isMotor: false, isSensor: false },
      0x02: { type: WEDO_DEVICE_NONE,  isMotor: false, isSensor: false },
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
    // Stub: many hubs send port type notifications automatically.
    // You can add explicit queries here if needed.
  }

  async _enableSensorOnPort(portId) {
    // Simplified input command to enable notifications on a port.
    // Format (common pattern): [len, portId, mode, enable]
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

  getTiltAngle() {
    const raw = this.getTiltRaw();
    return raw; // keep raw for now; mapping can be added later
  }

  // Motion sensor on external port (1 or 2)
  getMotionRaw(portId = 0x01) {
    return this.portValues[portId] ?? 0;
  }

  getDistance(portId = 0x01) {
    return this.getMotionRaw(portId);
  }

  // ---------------- Motor Control ----------------

  async setMotorPower(portId = 0x01, power = 50) {
    if (!this.portDevices[portId]?.isMotor) {
      this.log(`setMotorPower: port ${portId} is not a motor (type=${this.portDevices[portId]?.type || 0})`);
      return;
    }

    const p = clamp(power, -100, 100);

    // WeDo 2.0 Output Command (common pattern):
    // [len, portId, 0x01, 0x01, speedByte]
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

  async runMotorTimed(portId = 0x01, power = 50, durationMs = 1000) {
    await this.setMotorPower(portId, power);
    await new Promise(resolve => setTimeout(resolve, durationMs));
    await this.stopMotor(portId);
  }

  // ---------------- Hub Convenience ----------------

  async turnOffHub() {
    if (!this.charDisconnect) return;
    const bytes = new Uint8Array([0x01]);
    await this._write(this.charDisconnect, bytes);
    this.log("Turn off hub command sent.");
  }

  isButtonPressed() {
    return this.buttonPressed;
  }
}
