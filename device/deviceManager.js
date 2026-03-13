// device/deviceManager.js

import { LegoInterfaceB } from './webserial.js';

export class DeviceManager {
  constructor() {
    this.devices = [];

    // Name management
    this.usedNames = new Set();
    this.freeNames = [];
  }

  // -------------------------
  // Name Allocation
  // -------------------------

  _allocateName() {
    // Reuse freed names first
    if (this.freeNames.length > 0) {
      const name = this.freeNames.shift();
      this.usedNames.add(name);
      return name;
    }

    // Otherwise create the next LegoB#
    let i = 1;
    while (this.usedNames.has(`LegoB${i}`)) {
      i++;
    }

    const name = `LegoB${i}`;
    this.usedNames.add(name);
    return name;
  }

  _freeName(name) {
    if (!name) return;
    if (this.usedNames.has(name)) {
      this.usedNames.delete(name);
      this.freeNames.push(name);
    }
  }

  // -------------------------
  // UI Helpers
  // -------------------------

  updateDeviceEntry(device) {
    window.updateDeviceEntry?.(device);
    window.refreshDevicesPanel?.();
  }

  appendLog(device, message) {
    window.appendLog?.(device, message);
  }

  // -------------------------
  // Device List Management
  // -------------------------

  _addDevice(dev) {
    this.devices.push(dev);
    window.logStatus?.(`Connected: ${dev.name}`);
    window.renderDeviceEntry?.(dev);
    window.refreshDevicesPanel?.();
  }

  _removeDevice(dev) {
    const idx = this.devices.indexOf(dev);
    if (idx >= 0) this.devices.splice(idx, 1);

    // Free the name
    this._freeName(dev.name);

    window.logStatus?.(`Disconnected: ${dev.name}`);
    window.refreshDevicesPanel?.();
  }

  // -------------------------
  // Connect a LEGO Interface B
  // -------------------------

  async connectLegoInterfaceB() {
    const dev = new LegoInterfaceB(null, this);

    try {
      await dev.connect();      // name allocated inside connect()
      this._addDevice(dev);
      return dev;

    } catch (err) {
      console.warn("Connection failed:", err);

      // Cleanup even if handshake never completed
      await dev.forceDisconnect();

      return null;
    }
  }

  // -------------------------
  // Disconnect All
  // -------------------------

  async disconnectAll() {
    for (const dev of [...this.devices]) {
      await dev.disconnect();
      this._removeDevice(dev);
    }

    this.devices = [];
    this.usedNames.clear();
    this.freeNames = [];

    window.logStatus?.("All devices disconnected.");
  }

  // -------------------------
  // Lookup
  // -------------------------

  getDeviceByName(name) {
    return this.devices.find(d => d.name === name) || null;
  }
}

window.deviceManager = new DeviceManager();