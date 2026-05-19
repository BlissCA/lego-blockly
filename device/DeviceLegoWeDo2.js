// DeviceLegoWeDo2.js
// LEGO WeDo 2.0 BLE driver — LPF2-style architecture, multi-service

// ---------------- UUIDs ----------------

// Services
const WEDO_SERVICE_MAIN = "00001523-1212-efde-1523-785feabcd123"; // hub control
const WEDO_SERVICE_IO   = "00004f0e-1212-efde-1523-785feabcd123"; // sensor/motor I/O

// Main service characteristics (1523)
const WEDO_CHAR_BUTTON     = "00001526-1212-efde-1523-785feabcd123"; // notify (button)
const WEDO_CHAR_PORT_TYPE  = "00001527-1212-efde-1523-785feabcd123"; // notify (port attached/detached + type)
// Optional: turn off / disconnect if you ever want them
const WEDO_CHAR_TURNOFF    = "0000152b-1212-efde-1523-785feabcd123"; // write (turn off device)
const WEDO_CHAR_DISCONNECT = "0000152e-1212-efde-1523-785feabcd123"; // write (disconnect)

// IO service characteristics (4f0e)
const WEDO_CHAR_SENSOR_VALUE = "00001560-1212-efde-1523-785feabcd123"; // notify (sensor values)
const WEDO_CHAR_VALUE_FORMAT = "00001561-1212-efde-1523-785feabcd123"; // write (value format / mode)
const WEDO_CHAR_INPUT_CMD    = "00001563-1212-efde-1523-785feabcd123"; // write (input configuration)
const WEDO_CHAR_OUTPUT_CMD   = "00001565-1212-efde-1523-785feabcd123"; // write (motor output)

// Device types (WeDo 2.0 specific)
const WEDO_DEVICE_NONE   = 0x00;
const WEDO_DEVICE_MOTOR  = 0x01;
const WEDO_DEVICE_MOTION = 0x23;
const WEDO_DEVICE_TILT   = 0x22;

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

    this.serviceMain = null;
    this.serviceIO = null;

    this.charButton = null;
    this.charPortType = null;
    this.charTurnOff = null;
    this.charDisconnect = null;

    this.charSensorValue = null;
    this.charValueFormat = null;
    this.charInputCmd = null;
    this.charOutputCmd = null;

    this.namePrefix = "WeDo2_";
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
    // button
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

  async _writeInput(bytes) {
    //return this._write(this.charInputCmd, bytes);
    return this.enqueueCommand(async () => {
      if (!this.charInputCmd) return;
      await this.charInputCmd.writeValueWithoutResponse(bytes);
    });
  }

  async _writeOutput(bytes) {
    return this._write(this.charOutputCmd, bytes);
  }

  async _writeValueFormat(bytes) {
    return this._write(this.charValueFormat, bytes);
  }

  // ---------------- Connection Lifecycle ----------------

  async connect() {
    this.setStatus("connecting", "Requesting WeDo 2.0 hub...");
    this.log("Connecting to WeDo 2.0 hub...");

    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [WEDO_SERVICE_MAIN] }
        ],
        optionalServices: [
          WEDO_SERVICE_MAIN,
          WEDO_SERVICE_IO
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

    // Services
    this.serviceMain = await this.server.getPrimaryService(WEDO_SERVICE_MAIN);
    this.serviceIO   = await this.server.getPrimaryService(WEDO_SERVICE_IO).catch(() => null);

    // Main service characteristics
    this.charButton    = await this.serviceMain.getCharacteristic(WEDO_CHAR_BUTTON);
    this.charPortType  = await this.serviceMain.getCharacteristic(WEDO_CHAR_PORT_TYPE);
    this.charTurnOff   = await this.serviceMain.getCharacteristic(WEDO_CHAR_TURNOFF).catch(() => null);
    this.charDisconnect = await this.serviceMain.getCharacteristic(WEDO_CHAR_DISCONNECT).catch(() => null);

    // IO service characteristics
    if (this.serviceIO) {
      this.charSensorValue = await this.serviceIO.getCharacteristic(WEDO_CHAR_SENSOR_VALUE);
      this.charValueFormat = await this.serviceIO.getCharacteristic(WEDO_CHAR_VALUE_FORMAT);
      this.charInputCmd    = await this.serviceIO.getCharacteristic(WEDO_CHAR_INPUT_CMD);
      this.charOutputCmd   = await this.serviceIO.getCharacteristic(WEDO_CHAR_OUTPUT_CMD);
    }

    // Notifications
    await this.charButton.startNotifications();
    this.charButton.addEventListener("characteristicvaluechanged", this._onButtonNotification);

    await this.charPortType.startNotifications();
    this.charPortType.addEventListener("characteristicvaluechanged", this._onPortTypeNotification);

    if (this.charSensorValue) {
      await this.charSensorValue.startNotifications();
      this.charSensorValue.addEventListener("characteristicvaluechanged", this._onSensorValueNotification);
    }

    // Initialize ports
    this._initDefaultPorts();

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
    // WeDo 2.0 has two external ports (1 and 2).
    this.portDevices = {
      0x01: { type: WEDO_DEVICE_NONE,  isMotor: false, isSensor: false },
      0x02: { type: WEDO_DEVICE_NONE,  isMotor: false, isSensor: false }
    };
    this.log("Ports initialized: 1, 2 (external).");
  }

  _updatePortType(portId, ioType) {
    let isMotor = false;
    let isSensor = false;
    let typeName = "none";

    switch (ioType) {
      case WEDO_DEVICE_MOTOR:
        isMotor = true;
        typeName = "motor";
        break;
      case WEDO_DEVICE_MOTION:
        isSensor = true;
        typeName = "motion";
        break;
      case WEDO_DEVICE_TILT:
        isSensor = true;
        typeName = "tilt";
        break;
      default:
        typeName = `unknown (0x${ioType.toString(16)})`;
        break;
    }

    this.portDevices[portId] = {
      type: ioType,
      isMotor,
      isSensor
    };

    this.log(`Port ${portId} device type: ${typeName}`);

    if (isSensor) {
      this._enableSensorOnPort(portId).catch(err => {
        this.log("Enable sensor error: " + (err?.message || err));
      });
    }
  }

  async _enableSensorOnPort(portId) {
    if (!this.charInputCmd) return;
    const ioType = this.portDevices[portId]?.type || 0;
    if (ioType === WEDO_DEVICE_NONE || !this.portDevices[portId]?.isSensor) {
      this.log(`No device on port ${portId} to enable`);
      return;
    }

    // WeDo 2.0 input enable: [0x01, portId, 0x01]
    const bytes = new Uint8Array([
      0x01, 0x02,  // 1 & 2: Input Command Header
      portId,  // 3: Port ID
      ioType,  // 4: IO Type 
      0x01, // 5: Mode (0x01 = Discrete Tilt mode / Distance Mode)
      0x01,0x00,0x00,0x00, // 6-9: Delta
      0x02, // 10: Unit Format (0x02 =SI Units)
      0x01  // 11: Notificaiton Switch (0x01 = Enable)
    ]);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
    this.log(`EnableSensor cmd → [${hex}]`);
    await this._writeInput(bytes);
    await new Promise(r => setTimeout(r, 50)); // Short hardware pause
    const startPort = new Uint8Array([0x00, 0x01, portId]);
    await this._writeInput(startPort);

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
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, "0")).join(" ");
    this.log(`PortType notif raw: [${hex}]`);

    const portId = data[0];
    const connected = data[1];     // 0 = empty, 1 = something plugged
    const ioType = data[3];        // REAL device type

    if (!connected) {
      this.log(`Port ${portId} disconnected`);
      this._updatePortType(portId, 0x00);
      return;
    }

    this.log(`Decoded portType: port=${portId}, ioType=0x${ioType.toString(16)}`);

    this._updatePortType(portId, ioType);
  }


  _onSensorValueNotification(event) {
    const data = new Uint8Array(event.target.value.buffer);
    const hex = Array.from(data).map(b => b.toString(16).padStart(2, "0")).join(" ");
    this.log(`SensorValue notif raw: [${hex}]`);

    const unit = data[0];    // 0x01 = tilt angle / motion steps, 0x02 = SI units (distance in cm / tilt state)
    const portId = data[1];
    const value  = data.getFloat32(2, true); // true = Little Endian

  //  this.log(`Decoded sensorValue: port=${portId}, value=${value}`);

    this.portValues[portId] = data; // store full buffer, not just data[1].  Was: value;
  }

  // ---------------- Sensor Getters ----------------

  // Motion / distance sensor on external port (1 or 2)
  getMotionRaw(portId = 0x01) {
    return this.portValues[portId] ?? 0;
  }

  getDistance(portId = 0x01) {
    return this.getMotionRaw(portId);
  }

  // Tilt sensor (external) raw value
  getTiltRaw(portId = 0x01) {
    return this.portValues[portId] ?? 0;
  }

  getTiltState(portId = 0x01) {
    return this.getTiltRaw(portId);
  }

  // ---------------- Motor Control ----------------

  async setMotorPower(portId = 0x01, power = 50) {
    if (!this.portDevices[portId]?.isMotor) {
      this.log(`setMotorPower: port ${portId} is not a motor (type=${this.portDevices[portId]?.type || 0})`);
      return;
    }
    if (!this.charOutputCmd) {
      this.log("setMotorPower: output characteristic not available");
      return;
    }

    const p = clamp(power, -100, 100);
    const speedByte = p & 0xff;

    const bytes = new Uint8Array([0x01, portId, speedByte]);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(" ");
    this.log(`Motor cmd → [${hex}]`);

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
    if (!this.charTurnOff) return;
    const bytes = new Uint8Array([0x01]);
    await this._write(this.charTurnOff, bytes);
    this.log("Turn off hub command sent.");
  }

  isButtonPressed() {
    return this.buttonPressed;
  }
}
