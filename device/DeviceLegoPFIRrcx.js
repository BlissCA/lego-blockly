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

    this.ignoreRxUntil = 0;

    // Pulse Demodulator State
    this.rxState = "IDLE"; // "IDLE" | "AWAITING_START_INTERVAL" | "IN_FRAME"
    this.lastMarkTime = 0;
    this.currentBits = 0;
    this.bitCount = 0;
    this.frameIntervals = [];
    this.rxFrameTimer = null;

    // Optional event listener hook for UI/diagnostics
    this.onHandsetEvent = null;
    this.onKeepAlivePulse = null;
    this.onRxActivity = null;

    this.status = "disconnected";
  }

  // Arm watchdog timer so rxState can never remain stuck in IN_FRAME
  _armFrameTimeout() {
    if (this.rxFrameTimer) clearTimeout(this.rxFrameTimer);
    this.rxFrameTimer = setTimeout(() => {
      if (this.rxState !== "IDLE") {
        this.rxState = "IDLE";
        this.bitCount = 0;
        this.currentBits = 0;
        this.frameIntervals = [];
      }
    }, 45);
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
    this.isTransmitting = true;
    const now = performance.now();
    this.lastTxTime = now;
    this.lastKeepAliveTime = now;
    // Suppress optical reflections for 45ms to absorb full echo and TSOP AGC recovery
    this.ignoreRxUntil = now + 45;

    try {
      // The RCX 9713 power detector requires sufficient pulse width / energy to charge
      // the capacitive envelope detector on TXD. Sending [0x00, 0x00] in 8N1 provides
      // consecutive active low periods (~86.8µs each, ~190µs total) which reliably
      // triggers the tower's mono-stable switch and illuminates the green LED,
      // while being completely ignored by LEGO PF receivers.
      await this.writer.write(new Uint8Array([0x00, 0x00]));
      this.onKeepAlivePulse?.();
    } catch (e) {
      // Ignore transient serial write collisions
    } finally {
      setTimeout(() => {
        this.isTransmitting = false;
        if (this.rxState !== "IN_FRAME") {
          this.rxState = "IDLE";
          this.bitCount = 0;
          this.currentBits = 0;
          this.frameIntervals = [];
        }
        // Setting lastMarkTime = 0 ensures the next real handset mark is treated as Mark 0
        this.lastMarkTime = 0;
      }, 45);
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

            const now = performance.now();
            // Optical Echo Suppression: Ignore bytes echoed by TX LEDs or keep-alive pulses
            if (this.isTransmitting || now < this.ignoreRxUntil) {
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
  // TSOP 1138 Pulse Demodulator & Signal Processor
  // ------------------------------------------------------------
  _checkLrc(frame) {
    const n1 = (frame >> 12) & 0x0F;
    const n2 = (frame >> 8) & 0x0F;
    const n3 = (frame >> 4) & 0x0F;
    const n4 = frame & 0x0F;
    return ((n1 ^ n2 ^ n3 ^ n4) === 0x0F);
  }

  _tryAdaptiveDecode(intervals) {
    if (intervals.length !== 16) return null;
    // Scan sliding decision thresholds between 0.40ms and 0.85ms in 0.02ms steps
    for (let th = 0.40; th <= 0.85; th += 0.02) {
      let candidate = 0;
      for (let i = 0; i < 16; i++) {
        const bit = intervals[i] > th ? 1 : 0;
        candidate = (candidate << 1) | bit;
      }
      if (this._checkLrc(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  _processRxPulse(delta) {
    // 1. Timeout / Idle Quiet Period Detection:
    // If more than 20ms elapsed since last mark, we were in channel silence (>60ms between PF repeats).
    // This mark is guaranteed to be Mark 0 (the Start mark)!
    if (delta > 20) {
      this.rxState = "AWAITING_START_INTERVAL";
      this.bitCount = 0;
      this.currentBits = 0;
      this.frameIntervals = [];
      this._armFrameTimeout();
      console.log(`[RCX RX] Mark 0 (Start mark) detected after ${delta.toFixed(1)}ms silence. Awaiting start interval...`);
      return;
    }

    // 2. State: AWAITING_START_INTERVAL (measuring interval to Mark 1)
    // Nominal Start bit period = 158µs mark + 1026µs pause = 1.184ms.
    // Accept wide range: 0.60ms to 4.50ms to accommodate USB latency / OS timer jitter.
    if (this.rxState === "AWAITING_START_INTERVAL") {
      if (delta >= 0.60 && delta <= 4.50) {
        this.rxState = "IN_FRAME";
        this.bitCount = 0;
        this.currentBits = 0;
        this.frameIntervals = [];
        this._armFrameTimeout();
        console.log(`[RCX RX] Start bit verified (interval: ${delta.toFixed(2)}ms). Listening for 16 data bits...`);
      } else {
        // Delta was out of range (isolated noise), reset parser
        this.rxState = "IDLE";
      }
      return;
    }

    // 3. State: IN_FRAME - Process 16 Data Bits
    if (this.rxState === "IN_FRAME") {
      this._armFrameTimeout();
      this.frameIntervals.push(delta);

      // Nominal bit periods:
      // Bit 0: 158µs mark + 263µs pause = 0.421ms
      // Bit 1: 158µs mark + 553µs pause = 0.711ms
      // Decision midpoint: 0.565ms
      const bit = (delta > 0.565) ? 1 : 0;
      this.currentBits = (this.currentBits << 1) | bit;
      this.bitCount++;

      console.log(`[RCX RX] Bit ${this.bitCount}/16 = ${bit} (delta: ${delta.toFixed(2)}ms)`);

      // Once all 16 bits are captured:
      if (this.bitCount === 16) {
        if (this.rxFrameTimer) clearTimeout(this.rxFrameTimer);

        let finalFrame = this.currentBits;
        let lrcOk = this._checkLrc(finalFrame);

        // If direct decode failed checksum, test adaptive thresholding on intervals
        if (!lrcOk && this.frameIntervals.length === 16) {
          const recovered = this._tryAdaptiveDecode(this.frameIntervals);
          if (recovered !== null) {
            finalFrame = recovered;
            lrcOk = true;
            console.log(`[RCX RX] Adaptive thresholding successfully recovered valid frame: 0x${finalFrame.toString(16).toUpperCase()}`);
          }
        }

        if (lrcOk) {
          console.log(`[RCX RX SUCCESS] 16 bits captured & verified: 0x${finalFrame.toString(16).padStart(4, '0').toUpperCase()}`);
          this._finalizeIncomingFrame(finalFrame);
        } else {
          console.warn(`[RCX RX] Discarding frame 0x${finalFrame.toString(16).padStart(4, '0')} (LRC checksum mismatch). Intervals: [${this.frameIntervals.map(d => d.toFixed(2)).join(', ')}]`);
        }

        this.rxState = "IDLE";
        this.bitCount = 0;
        this.currentBits = 0;
        this.frameIntervals = [];
      }
    }
  }

  _processRxChunk(chunk) {
    const now = performance.now();
    const elapsed = this.lastMarkTime > 0 ? (now - this.lastMarkTime) : 9999;

    // Optical Echo Blanking Check: discard transmission reflections
    if (this.isTransmitting || now < this.ignoreRxUntil) {
      return;
    }

    // Always log raw reception so user immediately sees incoming data
    const hex = Array.from(chunk)
      .map((b) => '0x' + b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    console.log(`[RCX RX RAW] ${chunk.length} byte(s) [${hex}] | delta: ${elapsed.toFixed(2)}ms | State: ${this.rxState}`);

    // If USB serial driver buffered entire frame (18 marks) in one or two chunks:
    if (chunk.length >= 16) {
      console.log(`[RCX RX BATCH] Full frame buffer received (${chunk.length} bytes)!`);
    }

    // Debounce secondary bytes from the same 158µs IR pulse:
    // (At 115200 baud, one 158µs carrier burst can generate 1-2 UART bytes within ~0.15ms)
    if (elapsed < 0.15) {
      return;
    }

    const delta = elapsed;
    this.lastMarkTime = now;

    this._processRxPulse(delta);
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
      return;
    }

    const channel = nibble1 & 0x03;
    const toggle = (nibble1 >> 3) & 0x01;
    const now = Date.now();

    // Pass valid frame into base class _handleRemoteEvent
    const dataView = new DataView(new Uint8Array([
      (frame >> 8) & 0xFF,
      frame & 0xFF
    ]).buffer);

    this._handleRemoteEvent(dataView);

    // Update pfirEvents explicitly for all remote models & modes:
    if (nibble2 === 0x1) {
      // Combo Direct mode (8885 remote: Red=Port A, Blue=Port B)
      const portACmd = nibble3 & 0x03;
      const portBCmd = (nibble3 >> 2) & 0x03;
      const mapCmd = (c) => (c === 0 ? "stop" : c === 1 ? "fwd" : c === 2 ? "rev" : "brake");

      const evA = mapCmd(portACmd);
      const evB = mapCmd(portBCmd);

      // Port A (Red)
      const entryA = this.pfirEvents[channel][0];
      entryA.event = evA;
      entryA.eventPrev = portACmd;
      entryA.newEvent = true;
      entryA.lastEventTime = now;

      // Port B (Blue)
      const entryB = this.pfirEvents[channel][1];
      entryB.event = evB;
      entryB.eventPrev = portBCmd;
      entryB.newEvent = true;
      entryB.lastEventTime = now;

      console.log(`[RCX RX] Handset Ch ${channel + 1}: Port A (Red) = ${evA.toUpperCase()}, Port B (Blue) = ${evB.toUpperCase()} [Frame 0x${frame.toString(16).padStart(4, '0').toUpperCase()}]`);

      this.onHandsetEvent?.({
        channel,
        port: 0,
        mode: "combo",
        event: evA,
        toggle,
        rawFrame: frame,
        timestamp: now
      });

      if (evB !== "stop") {
        this.onHandsetEvent?.({
          channel,
          port: 1,
          mode: "combo",
          event: evB,
          toggle,
          rawFrame: frame,
          timestamp: now
        });
      }
    } else if ((nibble2 & 0b1100) === 0b0100) {
      // Single output PWM mode (Mode 0x4=Port A, Mode 0x5=Port B)
      const port = nibble2 & 0x01;
      const pwm = nibble3;
      const evName = pwm === 0 ? "stop" : (pwm >= 1 && pwm <= 7) ? "fwd" : (pwm === 8) ? "brake" : "rev";

      const entry = this.pfirEvents[channel][port];
      entry.event = evName;
      entry.eventPrev = pwm;
      entry.newEvent = true;
      entry.lastEventTime = now;

      console.log(`[RCX RX] Handset Single PWM Ch ${channel + 1}: Port ${port === 0 ? 'A' : 'B'} = ${evName.toUpperCase()} (PWM ${pwm}) [Frame 0x${frame.toString(16).padStart(4, '0').toUpperCase()}]`);

      this.onHandsetEvent?.({
        channel,
        port,
        mode: "combo",
        event: evName,
        toggle,
        rawFrame: frame,
        timestamp: now
      });
    } else if ((nibble2 & 0b1110) === 0b0110) {
      // Train remote (8879: inc/dec/stop)
      const port = nibble2 & 0x01;
      let evName = "none";
      if (nibble3 === 4) evName = "inc";
      else if (nibble3 === 5) evName = "dec";
      else if (nibble3 === 8) evName = "stop";

      const entry = this.pfirEvents[channel][port];
      entry.event = evName;
      entry.newEvent = true;
      entry.lastEventTime = now;

      console.log(`[RCX RX] Handset Train Remote Ch ${channel + 1}: Port ${port === 0 ? 'A' : 'B'} = ${evName.toUpperCase()} [Frame 0x${frame.toString(16).padStart(4, '0').toUpperCase()}]`);

      this.onHandsetEvent?.({
        channel,
        port,
        mode: "train",
        event: evName,
        toggle,
        rawFrame: frame,
        timestamp: now
      });
    }
  }

  // ------------------------------------------------------------
  // Public API: readHandset(channel, port)
  // channel: 0..3 (Channels 1..4)
  // port: 0 (Red / Port A) or 1 (Blue / Port B)
  // Returns: "fwd", "rev", "stop", "inc", "dec", or "none"
  // Supports both leading-edge event dispatch and continuous held state.
  // ------------------------------------------------------------
  readHandset(channel, port) {
    if (!this.pfirEvents[channel] || !this.pfirEvents[channel][port]) return "none";
    const entry = this.pfirEvents[channel][port];

    if (entry.newEvent) {
      entry.newEvent = false;
      return entry.event;
    }

    const now = Date.now();
    if (entry.lastEventTime && (now - entry.lastEventTime < 450)) {
      if (entry.event && entry.event !== "none") {
        return entry.event;
      }
    }

    return "none";
  }

  // Diagnostic helper to test frame decoding directly from console:
  // e.g. dev.injectTestFrame(0x411B) -> Ch 1 Port A=FWD, Port B=STOP
  injectTestFrame(frame) {
    let n1 = (frame >> 12) & 0x0f;
    let n2 = (frame >> 8) & 0x0f;
    let n3 = (frame >> 4) & 0x0f;
    let n4 = frame & 0x0f;
    const expectedLrc = 0x0f ^ n1 ^ n2 ^ n3;
    if (n4 !== expectedLrc) {
      console.log(`[RCX RX TEST] Notice: Frame 0x${frame.toString(16).padStart(4, '0')} has checksum 0x${n4.toString(16).toUpperCase()}, expected 0x${expectedLrc.toString(16).toUpperCase()}. Auto-correcting to 0x${((n1<<12)|(n2<<8)|(n3<<4)|expectedLrc).toString(16).padStart(4, '0').toUpperCase()}`);
      frame = (n1 << 12) | (n2 << 8) | (n3 << 4) | expectedLrc;
    }
    console.log(`[RCX RX TEST] Injecting synthetic 16-bit frame 0x${frame.toString(16).padStart(4, '0').toUpperCase()}`);
    this._finalizeIncomingFrame(frame);
  }

  // Convenient direct command injection for quick testing:
  // e.g. dev.injectTestCommand(0, 0, "fwd") -> Sets Ch 1 Port A (Red) = FWD
  injectTestCommand(channel, port, action) {
    const actVal = action === "fwd" ? 1 : action === "rev" ? 2 : 0;
    const n1 = channel & 0x03; // toggle=0, esc=0, ch
    const n2 = 0x01;           // Combo direct mode
    const n3 = (port === 0) ? (actVal & 0x03) : ((actVal & 0x03) << 2);
    const n4 = 0x0f ^ n1 ^ n2 ^ n3;
    const frame = (n1 << 12) | (n2 << 8) | (n3 << 4) | n4;
    console.log(`[RCX RX TEST] Injecting command Ch ${channel + 1} Port ${port === 0 ? 'A (Red)' : 'B (Blue)'} = ${action.toUpperCase()} (Frame: 0x${frame.toString(16).padStart(4, '0').toUpperCase()})`);
    this._finalizeIncomingFrame(frame);
  }

  // High-fidelity synthetic pulse injector: feeds exact timing intervals into _processRxPulse
  // to verify the state machine, timing windows, bit assembly, and event dispatch end-to-end.
  async injectTestPulses(frame = 0x411B) {
    console.log(`[RCX RX TEST] Starting synthetic pulse sequence for frame 0x${frame.toString(16).padStart(4, '0').toUpperCase()}...`);

    // 1. Initial idle mark after quiet period (delta > 20ms triggers Mark 0 detection)
    this._processRxPulse(50.0);

    // Short pause for console log readability
    await new Promise(r => setTimeout(r, 10));

    // 2. Start bit pause (nominal 1.184ms)
    this._processRxPulse(1.184);

    // 3. 16 data bits
    for (let i = 0; i < 16; i++) {
      const bit = (frame >> (15 - i)) & 1;
      // Bit 0 = 0.421ms, Bit 1 = 0.711ms
      const deltaMs = bit ? 0.711 : 0.421;
      await new Promise(r => setTimeout(r, 5));
      this._processRxPulse(deltaMs);
    }

    // 4. Stop bit pause (nominal 1.184ms)
    await new Promise(r => setTimeout(r, 10));
    this._processRxPulse(1.184);
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
    const now = performance.now();
    this.lastTxTime = now;
    // Suppress reflections for 80ms while transmission completes
    this.ignoreRxUntil = now + 80;

    // Reset RX parser so self-transmitted bursts are ignored
    this.rxState = "IDLE";
    this.bitCount = 0;
    this.currentBits = 0;
    this.frameIntervals = [];

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
      // Wait 45ms after transmission for the sensor AGC to settle before reenabling RX.
      setTimeout(() => {
        this.isTransmitting = false;
        if (this.rxState !== "IN_FRAME") {
          this.rxState = "IDLE";
          this.bitCount = 0;
          this.currentBits = 0;
          this.frameIntervals = [];
        }
        this.lastMarkTime = 0;
      }, 45);
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
