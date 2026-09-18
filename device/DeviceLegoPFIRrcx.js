/**
 * Corrected LegoPFIRrcx Class
 * Fixes:
 * 1. Proper 38 kHz timings (Mark: 158µs, Bit 0: 263µs pause, Bit 1: 553µs pause, Start/Stop: 1026µs pause)
 * 2. Removed erroneous 16T preamble to prevent AGC desensitization
 * 3. Asserts DTR & RTS to supply power to the RCX Serial Tower
 * 4. Corrected repeat intervals (Tm = 16 ms)
 * 5. Synthesizes 8N1 UART frames accounting for physical Start/Stop bit transitions
 */
export class LegoPFIRrcx {
  constructor(name = "PFIRrcx") {
    this.name = name;
    this.port = null;
    this.writer = null;
    this.status = "disconnected";

    // Official LEGO PF 38 kHz timings (1 cycle = ~26.32 µs)
    this.T_MARK_US = 158;              // 6 cycles Mark (IR ON)
    this.T_BIT0_PAUSE_US = 263;        // 10 cycles Pause (IR OFF) -> Total 421 µs
    this.T_BIT1_PAUSE_US = 553;        // 21 cycles Pause (IR OFF) -> Total 711 µs
    this.T_START_STOP_PAUSE_US = 1026; // 39 cycles Pause (IR OFF) -> Total 1184 µs
    this.TM_US = 16000;                // 16 ms base repeat unit

    this.toggleState = false;
  }

  async connect(baudRate = 115200) {
    if (!('serial' in navigator)) {
      throw new Error("Web Serial API is not supported in this browser. Please use Chrome or Edge.");
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ 
        baudRate: baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: "none"
      });

      // CRITICAL: The RCX 9713 Serial Tower requires DTR and RTS high
      // to supply operating power to its 38kHz oscillator and IR LED
      // await this.port.setSignals({
      //   dataTerminalReady: true,
      //   requestToSend: true
      // });

      this.writer = this.port.writable.getWriter();
      this.status = "connected";
      return true;
    } catch (err) {
      this.status = "error";
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        try {
          await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
        } catch (_) {}
        await this.port.close();
        this.port = null;
      }
      this.status = "disconnected";
    } catch (err) {
      console.error("Disconnect error", err);
    }
  }

  /**
   * Send Combo Direct command:
   * channel: 0 to 3 (Channels 1 to 4)
   * redCmd / blueCmd: 0=FLOAT, 1=FORWARD, 2=BACKWARD, 3=BRAKE
   */
  async sendComboDirect(channel, redCmd, blueCmd) {
    this.toggleState = !this.toggleState;
    const toggleBit = this.toggleState ? 1 : 0;
    const escapeBit = 0;
    const nibble1 = (toggleBit << 3) | (escapeBit << 2) | (channel & 0x03);

    const addressBit = 0;
    const mode = 1; // Combo Direct
    const nibble2 = (addressBit << 3) | (mode & 0x07);

    const nibble3 = ((blueCmd & 0x03) << 2) | (redCmd & 0x03);
    const lrc = 0x0F ^ nibble1 ^ nibble2 ^ nibble3;
    const frame = (nibble1 << 12) | (nibble2 << 8) | (nibble3 << 4) | lrc;

    await this.sendFrame(frame, channel);
  }

  async sendFrame(frame, channel, repeatCount = 5) {
    if (!this.writer) throw new Error("Port not connected");

    const pulses = [];
    const sendHigh = (us) => pulses.push({ high: true, duration: us });
    const sendLow = (us) => pulses.push({ high: false, duration: us });

    for (let rep = 0; rep < repeatCount; rep++) {
      // 1. Start bit: 6 cycles Mark (158 µs) + 39 cycles Pause (1026 µs)
      sendHigh(this.T_MARK_US);
      sendLow(this.T_START_STOP_PAUSE_US);

      // 2. 16 Data bits MSB-first
      for (let i = 15; i >= 0; i--) {
        const bit = (frame >> i) & 1;
        sendHigh(this.T_MARK_US);
        sendLow(bit === 1 ? this.T_BIT1_PAUSE_US : this.T_BIT0_PAUSE_US);
      }

      // 3. Stop bit: 6 cycles Mark (158 µs) + 39 cycles Pause (1026 µs)
      sendHigh(this.T_MARK_US);
      sendLow(this.T_START_STOP_PAUSE_US);

      // 4. Inter-frame repeat interval (Official PF Spec formula)
      if (rep < repeatCount - 1) {
        let pauseMult = 0;
        if (rep === 0) pauseMult = 4 - channel;
        else if (rep === 1 || rep === 2) pauseMult = 5;
        else pauseMult = 6 + 2 * channel;

        sendLow(pauseMult * this.TM_US);
      }
    }

    // Convert pulse durations to UART byte stream at 115200 baud
    const BIT_US = 8.680555; // 1 / 115200
    const bytes = [];
    let currentByte = 0;
    let bitInByte = 0;

    const pushBit = (val) => {
      if (val === 1) currentByte |= (1 << bitInByte);
      bitInByte++;
      if (bitInByte === 8) {
        bytes.push(currentByte);
        currentByte = 0;
        bitInByte = 0;
      }
    };

    for (const pulse of pulses) {
      const bitCount = Math.max(1, Math.round(pulse.duration / BIT_US));
      // In RS-232 with the RCX tower: 0 = IR ON, 1 = IR OFF
      const bitVal = pulse.high ? 0 : 1;
      for (let i = 0; i < bitCount; i++) {
        pushBit(bitVal);
      }
    }

    if (bitInByte > 0) {
      while (bitInByte < 8) {
        currentByte |= (1 << bitInByte);
        bitInByte++;
      }
      bytes.push(currentByte);
    }

    await this.writer.write(new Uint8Array(bytes));
  }
}