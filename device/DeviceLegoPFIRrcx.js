import { LegoPFIR } from "./DeviceLegoPFIR.js";

export class LegoPFIRrcx extends LegoPFIR {
  constructor(name, manager) {
    super(name, manager);

    this.port = null;
    this.writer = null;

    // RCX-specific timing (1 cycle of 38 kHz = 26.32 µs; 6 cycles mark = 158 µs)
    this.T_US = 158;
    this.BYTE_US = 86.8;
    this.FRAME_REPEAT = 5;

    this.status = "disconnected";
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
  // Override: raw write → RCX bit-bang
  // ------------------------------------------------------------
  async _writeRaw(payload) {
    // payload = Uint8Array of PF IR frames (2 bytes each)
    for (let i = 0; i < payload.length; i += 2) {
      const frame = (payload[i] << 8) | payload[i + 1];
      await this._sendPFIR(frame);
    }
  }

  // ------------------------------------------------------------
  // RCX PF IR bit-bang encoder (Framing-aligned 115200 Baud)
  // ------------------------------------------------------------
  async _sendPFIR(frame) {
    if (!this.writer) return;

    const items = this._buildPFIR(frame);
    
    // 1 Serial Bit at 115,200 baud = 8.68055 microseconds
    const BIT_US = 8.68055;
    
    // Step 1: Build continuous array of raw serial wire states (0 or 1)
    const wireBits = [];
    
    for (const item of items) {
      const bitCount = Math.max(1, Math.round(item.duration / BIT_US));
      // Inverted Logic for RCX Tower: item.high (IR ON) = 0, item.high == false (IR OFF) = 1
      const wireState = item.high ? 0 : 1;
      
      for (let i = 0; i < bitCount; i++) {
        wireBits.push(wireState);
      }
    }

    // Step 2: Pack into 8N1 serial frames with 10-bit physical alignment
    // Physical wire frame: [Start=0] [D0] [D1] [D2] [D3] [D4] [D5] [D6] [D7] [Stop=1]
    const finalBytes = [];
    let bitIndex = 0;

    while (bitIndex < wireBits.length) {
      let dataByte = 0;

      // Data bits D0..D7 correspond to wire slots 1..8
      for (let lsb = 0; lsb < 8; lsb++) {
        const physicalIdx = bitIndex + 1 + lsb;
        const bitValue = (physicalIdx < wireBits.length) ? wireBits[physicalIdx] : 1;
        if (bitValue === 1) {
          dataByte |= (1 << lsb);
        }
      }

      finalBytes.push(dataByte);
      // Advance by 10 wire bits because the UART sends 10 physical bits per byte!
      bitIndex += 10;
    }

    await this.writer.write(new Uint8Array(finalBytes));
  }

  // ------------------------------------------------------------
  // PF IR timing builder (Official LEGO PF 38 kHz Specification)
  // ------------------------------------------------------------
  _buildPFIR(frame) {
    const items = [];

    const sendHigh = (us) => items.push({ high: true, duration: us });
    const sendLow  = (us) => items.push({ high: false, duration: us });

    // Bit 0: 6 cycles Mark (158 µs) + 10 cycles Pause (263 µs)
    const sendBit0 = () => {
      sendHigh(this.T_US);
      sendLow(263);
    };

    // Bit 1: 6 cycles Mark (158 µs) + 21 cycles Pause (553 µs)
    const sendBit1 = () => {
      sendHigh(this.T_US);
      sendLow(553);
    };

    // Start & Stop bit: 6 cycles Mark (158 µs) + 39 cycles Pause (1026 µs)
    const sendStartStop = () => {
      sendHigh(this.T_US);
      sendLow(1026);
    };

    // Extract PF IR channel from nibble1
    const nibble1 = (frame >> 12) & 0x0F;
    const channel = nibble1 & 0x03;

    // Official repeat pause formula: Tm = 16 ms = 16,000 µs
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

    const sendFrameOnce = (count) => {
      // 1. Start bit
      sendStartStop();

      // 2. 16 bits MSB-first
      for (let i = 0; i < 16; i++) {
        const bit = (frame >> (15 - i)) & 1;
        bit ? sendBit1() : sendBit0();
      }

      // 3. Stop bit
      sendStartStop();

      // 4. Inter-frame repeat pause
      if (count < this.FRAME_REPEAT - 1) {
        sendLow(computePause(count));
      }
    };

    for (let rep = 0; rep < this.FRAME_REPEAT; rep++) {
      sendFrameOnce(rep);
    }

    return items;
  }
}