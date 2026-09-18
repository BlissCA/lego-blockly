import { LegoPFIR } from "./DeviceLegoPFIR.js";

export class LegoPFIRrcx extends LegoPFIR {
  constructor(name, manager) {
    super(name, manager);

    this.port = null;
    this.writer = null;

    // RCX-specific timing
    this.T_US = 158;
    this.BYTE_US = 86.8;
    // 2 repeats with interleaving gives ~27ms startup and clean optical reception
    this.FRAME_REPEAT = 2;

    this.status = "disconnected";
  }

  // ------------------------------------------------------------
  // Override: _scheduleFlush()
  // Wait a 15ms window so consecutive 'await dev.motor_Single()'
  // calls in Blockly are coalesced into this.pendingFrames before flushing.
  // ------------------------------------------------------------
  _scheduleFlush() {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => this._flush(), 15);
  }

  // ------------------------------------------------------------
  // Override: connect() using Web Serial (No RTS/CTS/DTR flow control)
  // ------------------------------------------------------------
  async connect() {
    try {
      this.log("Requesting RCX Serial IR Tower...");

      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.writer = this.port.writable.getWriter();

      if (!this.name) {
        this.name = this.manager?._allocateName?.("PFIRrcx") || "PFIRrcx";
      }

      this.log(`Connected as ${this.name}`);
      this.setStatus("connected", "Connected");

    } catch (err) {
      this.log(`Connect error: ${err}`);
      this.setStatus("error", "Connection failed");
    }
  }

  // ------------------------------------------------------------
  // Override: disconnect()
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
      this.log(`Disconnect error: ${err}`);
    }
  }

  // ------------------------------------------------------------
  // Override: raw write → RCX bit-bang with Frame Interleaving
  // ------------------------------------------------------------
  async _writeRaw(payload) {
    // Unpack all frames in this batched payload
    const frames = [];
    for (let i = 0; i < payload.length; i += 2) {
      frames.push((payload[i] << 8) | payload[i + 1]);
    }

    if (frames.length > 0) {
      await this._sendPFIR(frames);
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
    // RESULT: Both Motor A and Motor B start within ~27ms of each other!
    for (let rep = 0; rep < this.FRAME_REPEAT; rep++) {
      for (let fIdx = 0; fIdx < frameList.length; fIdx++) {
        sendSingleFrame(frameList[fIdx]);

        // Between frames in the same pass, pause 16 ms
        if (fIdx < frameList.length - 1) {
          sendLow(16000);
        }
      }

      // Inter-pass repeat pause
      if (rep < this.FRAME_REPEAT - 1) {
        sendLow(computePause(rep));
      }
    }

    return items;
  }
}