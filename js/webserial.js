const lego = {
  port: null,
  reader: null,
  latest: null,

  async connect() {
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 19200 });

    this.reader = this.port.readable.getReader();
    this.readLoop();
  },

  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
  },

  async readLoop() {
    let buffer = new Uint8Array(0);

    while (this.reader) {
      const { value, done } = await this.reader.read();
      if (done) break;

      if (value) {
        // Append new bytes
        const tmp = new Uint8Array(buffer.length + value.length);
        tmp.set(buffer);
        tmp.set(value, buffer.length);
        buffer = tmp;

        // Process 19-byte packets
        while (buffer.length >= 19) {
          const packet = buffer.slice(0, 19);
          buffer = buffer.slice(19);

          this.latest = packet;
        }
      }
    }
  },

  latestPacket() {
    return this.latest ? Array.from(this.latest).join(",") : "";
  },

  async setOutput(port, power) {
    if (!this.port) return;

    const cmd = new Uint8Array([0x55, port, power, 0x00]); // placeholder
    const writer = this.port.writable.getWriter();
    await writer.write(cmd);
    writer.releaseLock();
  }
};
