import { LegoPFIR } from "./DeviceLegoPFIR.js";

/**
 * LegoPFIRrcx
 * Optimized, battery-saving transmitter for LEGO Power Functions IR
 * via an RCX Serial IR Tower (LEGO 9713) using Web Serial at 115200 baud.
 * 
 * Battery-Saving Design:
 *  - NO background keep-alive pulses or timers: the 9713 tower stays completely asleep
 *    when idle to strictly preserve 9V battery life.
 *  - On-Demand Power: Every motor command transmission automatically powers the tower's
 *    TX amplifier and lights the green LED during the command.
 *  - 115200 baud bit-banging with dual-motor frame interleaving (~27ms dual-motor startup).
 *  - Physical 10-bit serial framing alignment eliminating bit-drift across long packets.
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
    this.PAUSE_BIT_0 = 263;
    this.PAUSE_BIT_1 = 553;
    this.PAUSE_START_STOP = 1030; // 39 cycles (~1026 µs) + optical margin
    this.FRAME_REPEAT = 4; // LEGO remotes transmit 5x; 4-5 repeats eliminates transient packet drops
    this.USE_WAKE_LEADER = true; // Wakes 9V tower amplifier from sleep before Frame 0

    this.isTransmitting = false;
    this.lastTxTime = 0;

    // Optional telemetry callback for UI
    this.onTxActivity = null;

    this.status = "disconnected";
  }

  // ------------------------------------------------------------
  // Configuration Methods for Tuning
  // ------------------------------------------------------------
  setFrameRepeat(count) {
    this.FRAME_REPEAT = Math.max(1, Math.min(10, count));
  }

  setWakeLeader(enabled) {
    this.USE_WAKE_LEADER = enabled;
  }

  setTiming(tUs, pause0, pause1, pauseSS) {
    if (tUs !== undefined) this.T_US = tUs;
    if (pause0 !== undefined) this.PAUSE_BIT_0 = pause0;
    if (pause1 !== undefined) this.PAUSE_BIT_1 = pause1;
    if (pauseSS !== undefined) this.PAUSE_START_STOP = pauseSS;
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

      this.log(`Connected as ${this.name} (115200 baud battery-saver TX mode)`);
      this.setStatus("connected", "Connected");
    } catch (err) {
      this.log(`Connect error: ${err}`);
      this.setStatus("error", "Connection failed");
      throw err;
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

    // Step 0: Pre-burst Wake Leader (Wakes 9V tower amplifier before Frame 0)
    if (this.USE_WAKE_LEADER) {
      sendHigh(250);
      sendLow(2500);
    }

    // Official LEGO PF Specification Timings (38 kHz carrier, 1 cycle = ~26.32 µs):
    const sendBit0 = () => {
      sendHigh(this.T_US);
      sendLow(this.PAUSE_BIT_0);
    };

    const sendBit1 = () => {
      sendHigh(this.T_US);
      sendLow(this.PAUSE_BIT_1);
    };

    const sendStartStop = () => {
      sendHigh(this.T_US);
      sendLow(this.PAUSE_START_STOP);
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
