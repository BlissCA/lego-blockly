import { LegoPFIR } from "./DeviceLegoPFIR.js";

/**
 * LegoPFIRrcx
 * Optimized, high-precision transmitter for LEGO Power Functions IR
 * via an RCX Serial IR Tower (LEGO 9713) using Web Serial at 115200 baud.
 * 
 * Features:
 *  - 115200 baud bit-banging with dual-motor frame interleaving (~27ms dual-motor startup).
 *  - Physical 10-bit serial framing alignment eliminating bit-drift across long packets.
 *  - RCX 9V Tower VCC Wake/Energizer: sends an active wake pulse ([0x00, 0x00]) to light
 *    the tower's green power LED and keep the 9V IR transmitter amplifier energized.
 *  - Streamlined TX-only architecture: zero background reader overhead or framing glitch interrupts.
 *  - Safe fallback for readHandset(channel, port): returns "none".
 */
export class LegoPFIRrcx extends LegoPFIR {
  constructor(name, manager) {
    super(name, manager);

    this.port = null;
    this.writer = null;

    // RCX-specific timing parameters
    this.T_US = 158;
    this.BYTE_US = 86.8;
    this.FRAME_REPEAT = 2; // 2 repeats with interleaving is fast (~38ms) and optically reliable

    // Tower 9V VCC Power Management
    this.isTransmitting = false;
    this.lastTxTime = 0;
    this.keepAliveTimer = null;
    this.autoKeepAliveEnabled = true;

    // Optional telemetry callbacks for UI
    this.onKeepAlivePulse = null;
    this.onTxActivity = null;

    this.status = "disconnected";
  }

  // ------------------------------------------------------------
  // Override: _scheduleFlush()
  // Wait a short 15ms window so that consecutive 'await dev.motor_Single()'
  // calls in Blockly are coalesced into this.pendingFrames before flushing.
  // ------------------------------------------------------------
  _scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => this._flush(), 15);
  }

  // ------------------------------------------------------------
  // Web Serial Connection
  // ------------------------------------------------------------
  async connect() {
    try {
      this.log("Requesting RCX Serial IR Tower...");

      this.port = await navigator.serial.requestPort();

      // Standard 3-wire serial (TX/RX/GND) at 115200 baud
      await this.port.open({ baudRate: 115200 });

      // Safely assert DTR and RTS to activate RS-232 level shifter if supported
      try {
        await this.port.setSignals?.({ dataTerminalReady: true, requestToSend: true });
      } catch (_) {}

      this.writer = this.port.writable.getWriter();

      if (!this.name) {
        this.name = this.manager?._allocateName?.("PFIRrcx") || "PFIRrcx";
      }

      this.log(`Connected as ${this.name} (115200 baud TX mode)`);
      this.setStatus("connected", "Connected");

      // Wake the tower immediately to turn on the green LED and power the 9V IR amplifier
      await this.wakeTower();

      // Start tower power maintainer
      this._startKeepAlive();
    } catch (err) {
      this.log(`Connect error: ${err}`);
      this.setStatus("error", "Connection failed");
      throw err;
    }
  }

  // ------------------------------------------------------------
  // Tower 9V VCC Power Management
  // The RCX 9713 Serial Tower contains a capacitive envelope detector
  // on the TX line that turns on its internal 9V amplifier and green
  // power LED when activity is detected, maintaining power for ~4-5 seconds.
  // ------------------------------------------------------------
  async wakeTower() {
    if (!this.writer || this.isTransmitting) return;
    try {
      // Sending [0x00, 0x00] in 8N1 provides ~190µs of continuous active low,
      // which reliably triggers the tower's mono-stable switch and illuminates the green LED.
      await this.writer.write(new Uint8Array([0x00, 0x00]));
      this.lastTxTime = performance.now();
      this.onKeepAlivePulse?.();
      console.log("[RCX TOWER] 9V VCC Wake pulse sent. Green LED energized.");
    } catch (e) {
      // Ignore transient write collisions
    }
  }

  _startKeepAlive() {
    this._stopKeepAlive();
    if (!this.autoKeepAliveEnabled) return;

    this.keepAliveTimer = setInterval(async () => {
      if (!this.writer || this.isTransmitting) return;
      const now = performance.now();
      // Refresh tower power if no real motor commands were sent in the last 3.5s
      if (now - this.lastTxTime >= 3500) {
        await this.wakeTower();
      }
    }, 2000);
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // Set whether the background power pulse is active
  setAutoKeepAlive(enabled) {
    this.autoKeepAliveEnabled = enabled;
    if (enabled && this.status === "connected") {
      this._startKeepAlive();
    } else {
      this._stopKeepAlive();
    }
  }

  // ------------------------------------------------------------
  // Public API: readHandset(channel, port)
  // Clean fallback: Returns "none" in TX-only mode.
  // ------------------------------------------------------------
  readHandset(channel, port) {
    return "none";
  }

  // ------------------------------------------------------------
  // Direct Raw Write
  // ------------------------------------------------------------
  async _writeRaw(payload) {
    this.isTransmitting = true;
    this.lastTxTime = performance.now();

    try {
      const frames = [];
      for (let i = 0; i < payload.length; i += 2) {
        frames.push((payload[i] << 8) | payload[i + 1]);
      }

      if (frames.length > 0) {
        await this._sendPFIR(frames);
        this.onTxActivity?.(frames.length);
      }
    } finally {
      this.lastTxTime = performance.now();
      this.isTransmitting = false;
    }
  }

  // ------------------------------------------------------------
  // RCX PF IR bit-bang encoder (Framing-aligned 115200 Baud)
  // ------------------------------------------------------------
  async _sendPFIR(frames) {
    if (!this.writer) return;

    const frameList = Array.isArray(frames) ? frames : [frames];
    const items = this._buildPFIR(frameList);

    // 1 Serial Bit at 115,200 baud = 8.68055 microseconds
    const BIT_US = 8.68055;

    // Step 1: Build continuous array of raw serial wire states (0 or 1)
    const wireBits = [];

    for (const item of items) {
      const bitCount = Math.max(1, Math.round(item.duration / BIT_US));
      // Inverted Logic: item.high (IR ON) = 0, item.high == false (IR OFF) = 1
      const wireState = item.high ? 0 : 1;

      for (let i = 0; i < bitCount; i++) {
        wireBits.push(wireState);
      }
    }

    // Step 2: Pack into 8N1 serial frames with 10-bit physical alignment
    const finalBytes = [];
    let bitIndex = 0;

    while (bitIndex < wireBits.length) {
      let dataByte = 0;

      for (let lsb = 0; lsb < 8; lsb++) {
        const physicalIdx = bitIndex + 1 + lsb;
        const bitValue = (physicalIdx < wireBits.length) ? wireBits[physicalIdx] : 1;
        if (bitValue === 1) {
          dataByte |= (1 << lsb);
        }
      }

      finalBytes.push(dataByte);
      bitIndex += 10;
    }

    // Flush down Web Serial stream
    await this.writer.write(new Uint8Array(finalBytes));
  }

  // ------------------------------------------------------------
  // PF IR timing builder with Interleaving Support
  // ------------------------------------------------------------
  _buildPFIR(frames) {
    const frameList = Array.isArray(frames) ? frames : [frames];
    const items = [];

    const sendHigh = (us) => items.push({ high: true, duration: us });
    const sendLow  = (us) => items.push({ high: false, duration: us });

    // Official LEGO PF Specification Timings (38 kHz carrier, 1 cycle = ~26.32 µs):
    const sendBit0 = () => {
      sendHigh(this.T_US); // 158 µs (6 cycles of 38 kHz)
      sendLow(263);        // 263 µs pause (10 cycles)
    };

    const sendBit1 = () => {
      sendHigh(this.T_US); // 158 µs (6 cycles of 38 kHz)
      sendLow(553);        // 553 µs pause (21 cycles)
    };

    const sendStartStop = () => {
      sendHigh(this.T_US); // 158 µs (6 cycles of 38 kHz)
      sendLow(1026);       // 1026 µs pause (39 cycles)
    };

    const sendSingleFrame = (frame) => {
      sendStartStop();
      for (let i = 0; i < 16; i++) {
        const bit = (frame >> (15 - i)) & 1;
        bit ? sendBit1() : sendBit0();
      }
      sendStartStop();
    };

    // Extract PF IR channel from first frame for repeat pause formula
    const nibble1 = (frameList[0] >> 12) & 0x0F;
    const channel = nibble1 & 0x03;

    // Official repeat pause formula: Tm = 16 ms (16,000 µs)
    const computePause = (count) => {
      let a = 0;
      if (count === 0)
        a = 4 - channel;
      else if (count === 1 || count === 2)
        a = 5;
      else if (count === 3 || count === 4)
        a = 6 + 2 * channel;
      else
        a = 5;

      return a * 16000;
    };

    const repeatCount = this.FRAME_REPEAT;

    // Interleave transmission:
    // Pass 0: [Frame A] -> 16ms pause -> [Frame B] -> Channel Pause
    // Pass 1: [Frame A] -> 16ms pause -> [Frame B] -> Channel Pause
    for (let rep = 0; rep < repeatCount; rep++) {
      for (let fIdx = 0; fIdx < frameList.length; fIdx++) {
        sendSingleFrame(frameList[fIdx]);

        if (fIdx < frameList.length - 1) {
          sendLow(16000);
        }
      }

      if (rep < repeatCount - 1) {
        sendLow(computePause(rep));
      }
    }

    return items;
  }

  // ------------------------------------------------------------
  // Clean Disconnect
  // ------------------------------------------------------------
  async disconnect() {
    this._stopKeepAlive();

    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
        this.port = null;
      }

      this.log("Disconnected");
      this.setStatus("disconnected", "Disconnected");
    } catch (err) {
      this.log(`Disconnect error: ${err?.message || err}`);
    }
  }
}
