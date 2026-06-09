// ------------------------------------------------------------
// device/DeviceLegoPFIR.js
// LEGO Power Functions IR using FTDI DTR pin.
// Ported directly from Arduino PF IR implementation.
// ------------------------------------------------------------

export class LegoPFIR {
  constructor(name, manager) {
    this.name = name;
    this.manager = manager;

    this.port = null;
    this.status = "idle";

    // Timing (from Arduino code)
    this.TX_TIME_US = 156;      // oscillationWrite time
    this.START_PAUSE_US = 1014;
    this.HIGH_PAUSE_US = 546;
    this.LOW_PAUSE_US = 260;

    this.toggle = [0, 0, 0, 0]; // per-channel toggle bit

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
  // CONNECT
  // ------------------------------------------------------------
  async connect() {
    try {
      this._logStatus("Requesting serial port for LEGO PF IR…");

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

      if (!this.name) {
        this.name = this.manager._allocateName("PFIR");
      }
      this.status = "Connected";

      return true;

    } catch (err) {
      this._logStatus("Error during connect: " + err);
      await this._safeClose();

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
    this._logStatus("Disconnecting PF IR...");

    this.queueActive = false;
    await this._safeClose();

    this.status = "Disconnected";

    if (this.name) {
      this.manager._removeDevice(this);
      this.name = null;
    }

    this._logStatus("Disconnected.");
  }

  // ------------------------------------------------------------
  // TIMING HELPERS
  // ------------------------------------------------------------
  async sleepUs(us) {
    const start = performance.now();
    const target = start + us / 1000;
    while (performance.now() < target) {
      // busy wait
    }
  }

  async oscillationWrite(timeUs) {
    // Arduino: for (i = 0; i <= time/26; i++) { HIGH 13µs, LOW 13µs }
    const cycles = Math.floor(timeUs / 26);
    for (let i = 0; i <= cycles; i++) {
      await this.port.setSignals({ dataTerminalReady: true });
      await this.sleepUs(13);
      await this.port.setSignals({ dataTerminalReady: false });
      await this.sleepUs(13);
    }
  }

  async startPause() {
    await this.sleepUs(this.START_PAUSE_US);
  }

  async highPause() {
    await this.sleepUs(this.HIGH_PAUSE_US);
  }

  async lowPause() {
    await this.sleepUs(this.LOW_PAUSE_US);
  }

  async messagePause(channel, count) {
    // Arduino message_pause(channel, count)
    let a = 0;
    if (count === 0) {
      a = 4 - channel + 1;
    } else if (count === 1 || count === 2) {
      a = 5;
    } else if (count === 3 || count === 4) {
      a = 5 + (channel + 1) * 2;
    }
    await this.sleepUs(a * 77);
  }

  async startStopBit() {
    // Arduino: oscillationWrite(156); start_pause();
    await this.oscillationWrite(this.TX_TIME_US);
    await this.startPause();
  }

  // ------------------------------------------------------------
  // CORE SEND (pf_send)
// ------------------------------------------------------------
  async pfSend(code1, code2) {
    let x = 0x80;

    await this.startStopBit();

    // First byte
    while (x) {
      await this.oscillationWrite(this.TX_TIME_US);

      if (code1 & x) {
        await this.highPause();
      } else {
        await this.lowPause();
      }

      x >>= 1;
    }

    // Second byte
    x = 0x80;
    while (x) {
      await this.oscillationWrite(this.TX_TIME_US);

      if (code2 & x) {
        await this.highPause();
      } else {
        await this.lowPause();
      }

      x >>= 1;
    }

    await this.startStopBit();
    await this.sleepUs(10000); // delay(10)
  }

  // ------------------------------------------------------------
  // PF CONSTANTS (from Arduino code)
// ------------------------------------------------------------
  static get MODE() {
    return {
      COMBO_DIRECT_MODE: 0x01,
      SINGLE_PIN_CONTINUOUS: 0x02,
      SINGLE_PIN_TIMEOUT: 0x03,
      SINGLE_OUTPUT: 0x04
    };
  }

  static get PWM() {
    return {
      FLT: 0x0,
      FWD1: 0x1,
      FWD2: 0x2,
      FWD3: 0x3,
      FWD4: 0x4,
      FWD5: 0x5,
      FWD6: 0x6,
      FWD7: 0x7,
      BRK: 0x8,
      REV7: 0x9,
      REV6: 0xA,
      REV5: 0xB,
      REV4: 0xC,
      REV3: 0xD,
      REV2: 0xE,
      REV1: 0xF
    };
  }

  static get SPEED() {
    return {
      RED_FLT: 0x0,
      RED_FWD: 0x1,
      RED_REV: 0x2,
      RED_BRK: 0x3,
      BLUE_FLT: 0x0,
      BLUE_FWD: 0x4,
      BLUE_REV: 0x8,
      BLUE_BRK: 0xC
    };
  }

  static get CHANNEL() {
    return { CH1: 0x0, CH2: 0x1, CH3: 0x2, CH4: 0x3 };
  }

  static get OUTPUT() {
    return { RED: 0x0, BLUE: 0x1 };
  }

  // ------------------------------------------------------------
  // ARDUINO-EQUIVALENT: ComboMode
  // ------------------------------------------------------------
  async comboMode(blueSpeed, redSpeed, channel) {
    const MODE = LegoPFIR.MODE;
    let nib1 = channel;
    let nib2 = MODE.COMBO_DIRECT_MODE;
    let nib3 = blueSpeed | redSpeed;
    let nib4 = 0xF ^ nib1 ^ nib2 ^ nib3;

    for (let i = 0; i < 6; i++) {
      await this.messagePause(channel, i);
      await this.pfSend((nib1 << 4) | nib2, (nib3 << 4) | nib4);
    }
  }

  // ------------------------------------------------------------
  // ARDUINO-EQUIVALENT: SingleOutput
  // ------------------------------------------------------------
  async singleOutput(pwm, output, channel) {
    const MODE = LegoPFIR.MODE;

    let nib1 = this.toggle[channel] | channel;
    let nib2 = MODE.SINGLE_OUTPUT | output;
    let nib3 = pwm;
    let nib4 = 0xF ^ nib1 ^ nib2 ^ nib3;

    for (let i = 0; i < 6; i++) {
      await this.messagePause(channel, i);
      await this.pfSend((nib1 << 4) | nib2, (nib3 << 4) | nib4);
    }

    this.toggle[channel] = this.toggle[channel] === 0 ? 8 : 0;
  }

  // ------------------------------------------------------------
  // POWER MAPPING: -7..7 → PWM codes
  // ------------------------------------------------------------
  mapPowerToPWM(p) {
    const PWM = LegoPFIR.PWM;
    if (p === 0) return PWM.FLT;
    if (p > 0) {
      const step = Math.min(7, p);
      return PWM[`FWD${step}`];
    }
    const step = Math.min(7, -p);
    return PWM[`REV${step}`];
  }

  // ------------------------------------------------------------
  // PUBLIC API: motorPower (SingleOutput)
// ------------------------------------------------------------
  motorPower(channel, output, power) {
    return this.enqueue(async () => {
      const OUT = LegoPFIR.OUTPUT;
      const pwm = this.mapPowerToPWM(Math.max(-7, Math.min(7, power)));
      const outCode = (output === "A" || output === 0) ? OUT.RED : OUT.BLUE;
      await this.singleOutput(pwm, outCode, channel);
    });
  }

  // ------------------------------------------------------------
  // PUBLIC API: comboPWM (ComboMode)
// ------------------------------------------------------------
  comboPWM(channel, powerA, powerB) {
    return this.enqueue(async () => {
      const SPEED = LegoPFIR.SPEED;

      const mapSimple = p => {
        if (p === 0) return { red: SPEED.RED_FLT, blue: SPEED.BLUE_FLT };
        if (p > 0) return { red: SPEED.RED_FWD, blue: SPEED.BLUE_FWD };
        return { red: SPEED.RED_REV, blue: SPEED.BLUE_REV };
      };

      const a = mapSimple(Math.max(-7, Math.min(7, powerA)));
      const b = mapSimple(Math.max(-7, Math.min(7, powerB)));

      // ComboMode uses blue_speed | red_speed
      const blueSpeed = b.blue;
      const redSpeed = a.red;

      await this.comboMode(blueSpeed, redSpeed, channel);
    });
  }

  // ------------------------------------------------------------
  // STOP ALL
  // ------------------------------------------------------------
  stopAll() {
    return this.enqueue(async () => {
      const OUT = LegoPFIR.OUTPUT;
      const PWM = LegoPFIR.PWM;
      for (let ch = 0; ch < 4; ch++) {
        await this.singleOutput(PWM.FLT, OUT.RED, ch);
        await this.singleOutput(PWM.FLT, OUT.BLUE, ch);
      }
    });
  }

  // ------------------------------------------------------------
  // SAFE CLOSE
  // ------------------------------------------------------------
  async _safeClose() {
    try {
      if (this.reader) {
        try { await this.reader.cancel(); } catch (_) {}
        try { this.reader.releaseLock(); } catch (_) {}
        this.reader = null;
      }

      if (this.writer) {
        try { await this.writer.close(); } catch (_) {}
        try { this.writer.releaseLock(); } catch (_) {}
        this.writer = null;
      }

      if (this.port) {
        try { await this.port.close(); } catch (_) {}
        this.port = null;
      }

      await new Promise(r => setTimeout(r, 30));

    } catch (e) {
      this._logStatus("Error while closing port: " + e);
    }
  }

  // ------------------------------------------------------------
  // LOGGING
  // ------------------------------------------------------------
  _logStatus(msg) {
    console.log(`[PF IR] ${msg}`);
  }
}
