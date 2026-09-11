export class LegoPFIR {
  constructor(name, manager) {
    this.manager = manager;
    this.name = name || null;

    this.device = null;
    this.server = null;
    this.service = null;

    this.txChar = null;
    this.rxChar = null;

    this.commandQueue = [];
    this.commandRunning = false;

    this.status = "disconnected";

    // RX memory: last PF frame per channel (0–3)
    this.rxTable = [null, null, null, null];
  }

  // ------------------------------------------------------------
  // Logging helpers
  // ------------------------------------------------------------
  log(msg) {
    console.log(`[PFIR ${this.name}] ${msg}`);
    this.manager?.appendLog?.(this.name, msg);
  }

  setStatus(status, msg) {
    this.status = status;
    this.manager?.updateDeviceEntry?.(this.name, status, msg);
  }

  // ------------------------------------------------------------
  // Command queue
  // ------------------------------------------------------------
  enqueueCommand(fn) {
    this.commandQueue.push(fn);
    if (!this.commandRunning) {
      this.commandRunning = true;
      this._runQueue();
    }
  }

  async _runQueue() {
    while (this.commandQueue.length > 0) {
      const fn = this.commandQueue.shift();
      try {
        await fn();
      } catch (err) {
        this.log(`Command error: ${err}`);
      }
    }
    this.commandRunning = false;
  }

  // ------------------------------------------------------------
  // BLE Connect
  // ------------------------------------------------------------
  async connect() {
    try {
      this.log("Requesting PF-IR Gateway...");

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "PF-IR-Gateway" }],
        optionalServices: ["6e400001-b5a3-f393-e0a9-e50e24dcca9e"]
      });

      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService("6e400001-b5a3-f393-e0a9-e50e24dcca9e");

      this.txChar = await this.service.getCharacteristic("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
      this.rxChar = await this.service.getCharacteristic("6e400003-b5a3-f393-e0a9-e50e24dcca9e");

      await this.rxChar.startNotifications();
      this.rxChar.addEventListener("characteristicvaluechanged", evt => {
        this._handleRemoteEvent(evt.target.value);
      });

      if (!this.name) {
        this.name = this.manager._allocateName("PFIR");
      }

      this.log(`Connected as ${this.name}`);
      this.setStatus("connected", "Connected");
      window.logStatus?.(`Connected: ${this.name}`);

      this.device.addEventListener("gattserverdisconnected", () => {
        this.log("Disconnected");
        this.setStatus("disconnected", "Disconnected");
      });

    } catch (err) {
      this.log(`Connect error: ${err}`);
      this.setStatus("error", "Connection failed");
    }
  }

  // ------------------------------------------------------------
  // Disconnect (send STOP frames)
  // ------------------------------------------------------------
  async disconnect() {
    try {
      const stopFrames = [
        0x040B, 0x050A,
        0x140B, 0x150A,
        0x240B, 0x250A,
        0x340B, 0x350A
      ];

      for (const frame of stopFrames) {
        await this._writeFrame(frame);
      }

      if (this.device?.gatt.connected) {
        this.device.gatt.disconnect();
      }

      this.log("Disconnected");
      this.setStatus("disconnected", "Disconnected");

    } catch (err) {
      this.log(`Disconnect error: ${err}`);
    }
  }

  // ------------------------------------------------------------
  // Write PF IR frame (2 bytes)
  // ------------------------------------------------------------
  async _writeFrame(frame) {
    if (!this.txChar) return;

    const data = new Uint8Array([
      (frame >> 8) & 0xFF,
      frame & 0xFF
    ]);

    await this.txChar.writeValueWithoutResponse(data);
  }

  sendFrame(frame) {
    this.enqueueCommand(() => this._writeFrame(frame));
  }

  // ------------------------------------------------------------
  // RX Notify handler
  // ------------------------------------------------------------
  _handleRemoteEvent(dataView) {
    const high = dataView.getUint8(0);
    const low  = dataView.getUint8(1);
    const frame = (high << 8) | low;

    const channel = (frame >> 12) & 0x03;

    this.rxTable[channel] = frame;

    this.log(`Remote CH${channel}: 0x${frame.toString(16).padStart(4, "0")}`);

    this.manager?.onDeviceEvent?.(this.name, {
      type: "pfir-remote",
      channel,
      frame
    });
  }

  // ------------------------------------------------------------
  // Handset RC reader
  // ------------------------------------------------------------
  readHandsetRC(channel, port) {
    const frame = this.rxTable[channel];
    if (frame === null) return 0;

    const mode = (frame >> 8) & 0x0F;
    const pwm  = (frame >> 4) & 0x0F;

    // Single Output mode: 0x4 = A, 0x5 = B
    if (mode !== 0x4 && mode !== 0x5) return 0;

    const isPortA = (mode === 0x4);
    if ((port === 0 && !isPortA) || (port === 1 && isPortA)) return 0;

    if (pwm === 0x8) return 3;     // Brake
    if (pwm === 0x0) return 0;     // Float
    if (pwm >= 1 && pwm <= 7) return 1; // Forward
    if (pwm >= 9 && pwm <= 15) return 2; // Backward

    return 0;
  }

  // ------------------------------------------------------------
  // PF IR Output Methods
  // ------------------------------------------------------------

  // Single Output PWM mode
    motor_Single(channel, output, pwmNibble) {
    const nibble1 = channel & 0x03;
    const nibble2 = (output === 1) ? 0x5 : 0x4;   // 0=A(0x4), 1=B(0x5)
    const nibble3 = pwmNibble & 0x0F;             // 0–15 from Blockly
    const nibble4 = 0xF ^ nibble1 ^ nibble2 ^ nibble3;

    const frame =
        (nibble1 << 12) |
        (nibble2 << 8)  |
        (nibble3 << 4)  |
        nibble4;

    this.sendFrame(frame);
    }


  // Combo PWM mode (Blue + Red)
    motor_Combo(channel, pwmBlue, pwmRed) {
    const ESCAPE = 0x4;

    const nibble1 = (ESCAPE | (channel & 0x03));  // ESCAPE + channel
    const nibble2 = pwmBlue & 0x0F;               // 0–15 from Blockly
    const nibble3 = pwmRed  & 0x0F;               // 0–15 from Blockly
    const nibble4 = 0xF ^ nibble1 ^ nibble2 ^ nibble3;

    const frame =
        (nibble1 << 12) |
        (nibble2 << 8)  |
        (nibble3 << 4)  |
        nibble4;

    this.sendFrame(frame);
    }

}
