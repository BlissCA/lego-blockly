import { LegoPFIR } from "./DeviceLegoPFIR.js";

/**
 * LegoPFIRrcx
 * Extends LegoPFIR to transmit and receive LEGO Power Functions IR commands
 * via an RCX Serial IR Tower (LEGO 9713) using Web Serial at 115200 baud.
 * 
 * Features:
 *  - 115200 baud bit-banging with dual-motor frame interleaving (~27ms startup).
 *  - TSOP1138 receiver monitoring via monitorRcxRead(state).
 *  - 9V battery VCC Keep-Alive pulses (0xFF) sent every 2.5s only if no TX in last 2.0s.
 *  - In-flight frame protection (waits for incoming handset frame before transmitting).
 *  - Optical self-echo suppression with 35ms blanking tail during motor transmissions.
 *  - High-precision PF IR frame demodulator with LRC checksum validation.
 *  - Seamless compatibility with readHandset(channel, port).
 */
export class LegoPFIRrcx extends LegoPFIR {
  constructor(name, manager) {
    super(name, manager);

    this.port = null;
    this.writer = null;
    this.reader = null;

    // RCX-specific timing
    this.T_US = 158;
    this.BYTE_US = 86.8;
    this.FRAME_REPEAT = 2;

    // Rx & Keep-Alive Monitoring State
    this.isMonitoring = false;
    this.isTransmitting = false;
    this.lastTxTime = 0;
    this.lastKeepAliveTime = 0;
    this.keepAliveTimer = null;
    this.readLoopActive = false;

    // Pulse Demodulator State
    this.rxState = "IDLE"; // "IDLE" | "IN_FRAME"
    this.lastMarkTime = 0;
    this.currentBits = 0;
    this.bitCount = 0;

    // Optional event listener hook for UI/diagnostics
    this.onHandsetEvent = null;
    this.onKeepAlivePulse = null;
    this.onRxActivity = null;

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
  // Public API: Enable / Disable TSOP1138 Monitoring & VCC Keep-Alive
  // ------------------------------------------------------------
  monitorRcxRead(enabled = true) {
    this.isMonitoring = enabled;
    this.log(`Monitor RCX Read: ${enabled ? "ENABLED" : "DISABLED"}`);

    if (enabled) {
      this._startKeepAlive();
      if (this.port?.readable && !this.readLoopActive) {
        this._startReadLoop();
      }
    } else {
      this._stopKeepAlive();
      this._stopReadLoop();
    }
  }

  // Case-insensitive alias
  MonitorRcxRead(enabled = true) {
    this.monitorRcxRead(enabled);
  }

  // ------------------------------------------------------------
  // Keep-Alive: Sends pulses to wake/recharge the RCX 9V battery VCC circuit.
  // The RCX 9713 Serial Tower turns on its internal VCC and green power LED
  // when activity is detected on the TX line and keeps it on for ~4-5 seconds.
  // ------------------------------------------------------------
  _startKeepAlive() {
    this._stopKeepAlive();

    // Send an immediate wake pulse right when monitoring is enabled
    this._sendKeepAlivePulse();

    this.keepAliveTimer = setInterval(async () => {
      if (!this.writer || !this.isMonitoring || this.isTransmitting) return;

      const now = performance.now();
      // Send keep-alive pulse every ~2.0s if no real motor command was transmitted in last 1.8s
      if (now - this.lastTxTime >= 1800) {
        // In-flight protection: never disrupt an incoming handset frame
        if (this.rxState === "IN_FRAME") return;

        await this._sendKeepAlivePulse();
      }
    }, 1000); // Check every second
  }

  async _sendKeepAlivePulse() {
    if (!this.writer || this.isTransmitting) return;
    try {
      // The RCX 9713 power detector requires sufficient pulse width / energy to charge
      // the capacitive envelope detector on TXD. Sending [0x00, 0x00] in 8N1 provides
      // consecutive active low periods (~86.8µs each, ~190µs total) which reliably
      // triggers the tower's mono-stable switch and illuminates the green LED,
      // while being completely ignored by LEGO PF receivers (which require a 158µs Mark + 1026µs Pause Start Bit).
      await this.writer.write(new Uint8Array([0x00, 0x00]));
      this.lastKeepAliveTime = performance.now();
      this.onKeepAlivePulse?.();
    } catch (e) {
      // Ignore transient serial write collisions
    }
  }

  _stopKeepAlive() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  // ------------------------------------------------------------
  // Override: connect() using Web Serial (No RTS/CTS/DTR flow control)
  // ------------------------------------------------------------
  async connect() {
    try {
      this.log("Requesting RCX Serial IR Tower...");

      this.port = await navigator.serial.requestPort();
      // Standard 3-wire serial (TX/RX/GND) at 115200 baud
      await this.port.open({ baudRate: 115200 });

      this.writer = this.port.writable.getWriter();

      if (!this.name) {
        this.name = this.manager?._allocateName?.("PFIRrcx") || "PFIRrcx";
      }

      this.log(`Connected as ${this.name}`);
      this.setStatus("connected", "Connected");

      // If monitoring was enabled before connecting, boot background reader
      if (this.isMonitoring) {
        this._startKeepAlive();
        this._startReadLoop();
      }
    } catch (err) {
      this.log(`Connect error: ${err}`);
      this.setStatus("error", "Connection failed");
      throw err;
    }
  }

  // ------------------------------------------------------------
  // Background Serial Reader Loop
  // ------------------------------------------------------------
  async _startReadLoop() {
    if (this.readLoopActive || !this.port?.readable) return;
    this.readLoopActive = true;

    try {
      while (this.isMonitoring && this.port?.readable) {
        this.reader = this.port.readable.getReader();
        try {
          while (this.isMonitoring) {
            const { value, done } = await this.reader.read();
            if (done) break;

            // Optical Echo Suppression: Ignore bytes echoed by TX LEDs
            if (this.isTransmitting) {
              continue;
            }

            if (value && value.length > 0) {
              this.onRxActivity?.();
              this._processRxChunk(value);
            }
          }
        } finally {
          this.reader.releaseLock();
          this.reader = null;
        }
      }
    } catch (err) {
      if (this.status === "connected") {
        this.log(`Serial read loop error: ${err?.message || err}`);
      }
    } finally {
      this.readLoopActive = false;
    }
  }

  async _stopReadLoop() {
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
  }

  // ------------------------------------------------------------
  // TSOP 1138 Pulse Demodulator
  // ------------------------------------------------------------
  _processRxChunk(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      const now = performance.now();
      const elapsed = now - this.lastMarkTime;

      // Timeout: If more than 16ms elapsed between marks, reset parser
      if (elapsed > 16) {
        if (this.rxState !== "IDLE") {
          console.debug(`[RCX RX] Timeout (${elapsed.toFixed(2)}ms), resetting parser.`);
        }
        this.rxState = "IDLE";
        this.bitCount = 0;
        this.currentBits = 0;
      }

      // Ignore secondary byte arrivals within < 0.20ms (belonging to the same 158µs Mark burst)
      if (elapsed < 0.20) {
        continue;
      }

      const delta = elapsed;
      this.lastMarkTime = now;

      // State 1: IDLE - Look for Start Bit Pause (~1.026ms, period ~1.18ms)
      if (this.rxState === "IDLE") {
        if (delta >= 0.85 && delta <= 2.20) {
          this.rxState = "IN_FRAME";
          this.bitCount = 0;
          this.currentBits = 0;
          console.log(`[RCX RX] Start bit detected! Delta: ${delta.toFixed(2)}ms. Listening for 16 bits...`);
        }
        continue;
      }

      // State 2: IN_FRAME - Process 16 Data Bits
      if (this.rxState === "IN_FRAME") {
        if (delta >= 0.25 && delta <= 0.54) {
          // Bit 0: Pause ~263µs (period ~421µs)
          this.currentBits = (this.currentBits << 1) | 0;
          this.bitCount++;
        } else if (delta > 0.54 && delta <= 0.95) {
          // Bit 1: Pause ~553µs (period ~711µs)
          this.currentBits = (this.currentBits << 1) | 1;
          this.bitCount++;
        } else {
          // Glitch or noise
          console.warn(`[RCX RX] Bit ${this.bitCount} glitch with delta ${delta.toFixed(2)}ms, resetting to IDLE.`);
          this.rxState = "IDLE";
          this.bitCount = 0;
          this.currentBits = 0;
          continue;
        }

        // If all 16 bits have been captured, validate & dispatch
        if (this.bitCount === 16) {
          console.log(`[RCX RX] 16 bits captured: 0x${this.currentBits.toString(16).padStart(4, '0').toUpperCase()}`);
          this._finalizeIncomingFrame(this.currentBits);
          this.rxState = "IDLE";
          this.bitCount = 0;
          this.currentBits = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------
  // Checksum Validation & Base LegoPFIR Event Dispatch
  // ------------------------------------------------------------
  _finalizeIncomingFrame(frame) {
    const nibble1 = (frame >> 12) & 0x0F;
    const nibble2 = (frame >> 8) & 0x0F;
    const nibble3 = (frame >> 4) & 0x0F;
    const nibble4 = frame & 0x0F;

    // Verify PF LRC Checksum: 0xF ^ nibble1 ^ nibble2 ^ nibble3 ^ nibble4 === 0
    if ((nibble1 ^ nibble2 ^ nibble3 ^ nibble4) !== 0x0F) {
      console.warn(`[RCX RX] Discarding frame 0x${frame.toString(16).padStart(4, '0')} due to invalid LRC checksum.`);
      return; // Discard invalid/corrupted frame
    }

    // Pass valid frame into base class _handleRemoteEvent so readHandset() works
    const dataView = new DataView(new Uint8Array([
      (frame >> 8) & 0xFF,
      frame & 0xFF
    ]).buffer);

    this._handleRemoteEvent(dataView);

    // Also support Single Output mode (0x4 / 0x5) in case handset uses single output mode
    const channel = nibble1 & 0x03;
    const toggle = (nibble1 >> 3) & 0x01;
    const isTrain = ((nibble2 & 0b0110) === 0b0110) || ((nibble2 & 0b0100) === 0b0100);

    let mode = isTrain ? "train" : "combo";
    let port = 0;
    let eventName = "unknown";

    if (isTrain) {
      port = nibble2 & 0x01;
      if (nibble3 === 4) eventName = "inc";
      else if (nibble3 === 5) eventName = "dec";
      else if (nibble3 === 8) eventName = "stop";
    } else if (nibble2 === 0x1) {
      // Combo Direct mode
      const portA = nibble3 & 0x03;
      const portB = (nibble3 >> 2) & 0x03;
      const val = port === 0 ? portA : portB;
      eventName = val === 0 ? "stop" : val === 1 ? "fwd" : val === 2 ? "rev" : "none";
    } else if ((nibble2 & 0b1100) === 0b0100) {
      // Single output mode (Mode 0x4 or 0x5)
      port = nibble2 & 0x01;
      const val = nibble3;
      eventName = val === 0 ? "stop" : (val >= 1 && val <= 7) ? "fwd" : "rev";
      const entry = this.pfirEvents[channel][port];
      if (entry && entry.eventPrev !== val) {
        entry.eventPrev = val;
        entry.event = eventName;
        entry.newEvent = true;
      }
    }

    this.onHandsetEvent?.({
      channel,
      port,
      mode,
      event: eventName,
      toggle,
      rawFrame: frame,
      timestamp: Date.now()
    });

    this.log(`Received Handset Frame: 0x${frame.toString(16).padStart(4, '0').toUpperCase()} (Ch ${channel + 1}, Port ${port === 0 ? 'A' : 'B'}: ${eventName})`);
  }

  // ------------------------------------------------------------
  // Override: raw write with Optical Echo Blanking & In-Flight Protection
  // ------------------------------------------------------------
  async _writeRaw(payload) {
    // In-Flight Protection: If currently in the middle of receiving a handset frame,
    // wait up to 30ms for it to finish so we do not corrupt it.
    if (this.rxState === "IN_FRAME") {
      const waitStart = performance.now();
      while (this.rxState === "IN_FRAME" && performance.now() - waitStart < 30) {
        await new Promise(r => setTimeout(r, 4));
      }
    }

    // Activate Optical Echo Blanking
    this.isTransmitting = true;
    this.lastTxTime = performance.now();
    // Reset RX parser so self-transmitted bursts are ignored
    this.rxState = "IDLE";
    this.bitCount = 0;
    this.currentBits = 0;

    try {
      const frames = [];
      for (let i = 0; i < payload.length; i += 2) {
        frames.push((payload[i] << 8) | payload[i + 1]);
      }

      if (frames.length > 0) {
        await this._sendPFIR(frames);
      }
    } finally {
      this.lastTxTime = performance.now();
      // Echo Blanking Tail: The high-intensity TX LEDs reflect into the TSOP1138.
      // Wait 35ms after transmission for the sensor AGC to settle before reenabling RX.
      setTimeout(() => {
        this.isTransmitting = false;
        this.rxState = "IDLE";
      }, 35);
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
      const wireState = item.high ? 0 : 1;
      
      for (let i = 0; i < bitCount; i++) {
        wireBits.push(wireState);
      }
    }

    // Step 2: Pack into 8N1 serial frames
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

    // Official LEGO PF Specification Timings (38 kHz):
    const sendBit0 = () => {
      sendHigh(this.T_US);
      sendLow(263);
    };

    const sendBit1 = () => {
      sendHigh(this.T_US);
      sendLow(553);
    };

    const sendStartStop = () => {
      sendHigh(this.T_US);
      sendLow(1026);
    };

    const sendSingleFrame = (frame) => {
      sendStartStop();
      for (let i = 0; i < 16; i++) {
        const bit = (frame >> (15 - i)) & 1;
        bit ? sendBit1() : sendBit0();
      }
      sendStartStop();
    };

    const nibble1 = (frameList[0] >> 12) & 0x0F;
    const channel = nibble1 & 0x03;

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

    // Interleave transmission across repeats:
    // Pass 0: [Frame A] -> 16ms pause -> [Frame B] -> Channel Pause
    // Pass 1: [Frame A] -> 16ms pause -> [Frame B] -> Channel Pause
    for (let rep = 0; rep < this.FRAME_REPEAT; rep++) {
      for (let fIdx = 0; fIdx < frameList.length; fIdx++) {
        sendSingleFrame(frameList[fIdx]);

        if (fIdx < frameList.length - 1) {
          sendLow(16000);
        }
      }

      if (rep < this.FRAME_REPEAT - 1) {
        sendLow(computePause(rep));
      }
    }

    return items;
  }

  // ------------------------------------------------------------
  // Clean Disconnect
  // ------------------------------------------------------------
  async disconnect() {
    this.monitorRcxRead(false);
    await this._stopReadLoop();

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
