import { LegoPFIR } from "./DeviceLegoPFIR.js";

export class LegoPFIRrcx extends LegoPFIR {
  constructor(name, manager) {
    super(name, manager);

    this.port = null;
    this.writer = null;

    // RCX-specific timing
    this.T_US = 158;
    this.BYTE_US = 86.8;
    this.FRAME_REPEAT = 5;

    this.status = "disconnected";
  }

  // ------------------------------------------------------------
  // Override: connect() using Web Serial instead of BLE
  // ------------------------------------------------------------
  async connect() {
    try {
      this.log("Requesting RCX Serial IR Tower...");

      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });

      this.writer = this.port.writable.getWriter();

      if (!this.name) {
        this.name = this.manager._allocateName("PFIRrcx");
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
  // RCX PF IR bit-bang encoder
  // ------------------------------------------------------------
  async _sendPFIR(frame) {
    if (!this.writer) return;

    const items = this._buildPFIR(frame);
    const bytes = [];

    for (const item of items) {
      const count = Math.max(1, Math.round(item.duration / this.BYTE_US));
      const value = item.high ? 0xFF : 0x00;
      for (let i = 0; i < count; i++) {
        bytes.push(value);
      }
    }

    await this.writer.write(new Uint8Array(bytes));
  }

  // ------------------------------------------------------------
  // PF IR timing builder (same as earlier)
  // ------------------------------------------------------------
_buildPFIR(frame) {
  const items = [];

  const sendHigh = (us) => items.push({ high: true, duration: us });
  const sendLow  = (us) => items.push({ high: false, duration: us });

  const sendBit0 = () => {
    sendHigh(this.T_US);
    sendLow(this.T_US);
  };

  const sendBit1 = () => {
    sendHigh(this.T_US);
    sendLow(3 * this.T_US);
  };

  const sendStartStop = () => sendBit0();

  // Extract PF IR channel from nibble1
  const nibble1 = (frame >> 12) & 0x0F;
  const channel = nibble1 & 0x03;

  const computePause = (count) => {
    let a = 0;
    if (count === 0)
      a = 4 - channel + 1;
    else if (count === 1 || count === 2)
      a = 5;
    else if (count === 3 || count === 4)
      a = 5 + (channel + 1) * 2;

    return a * 77; // microseconds
  };

  const sendFrameOnce = (count) => {
    // Preamble: 16T high
    sendHigh(16 * this.T_US);

    // Start bit
    sendStartStop();

    // 16 bits MSB-first
    for (let i = 0; i < 16; i++) {
      const bit = (frame >> (15 - i)) & 1;
      bit ? sendBit1() : sendBit0();
    }

    // Stop bit
    sendStartStop();

    // Channel-dependent pause
    sendLow(computePause(count));
  };

  for (let rep = 0; rep < 6; rep++) {
    sendFrameOnce(rep);
  }

  return items;
}

}
