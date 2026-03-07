// device/deviceManager.js

import { LegoInterfaceB } from './webserial.js';

export class DeviceManager {
  constructor() {
    this.devices = [];
    this._nextId = 1;
  }

  _allocateName() {
    return `LegoB${this._nextId++}`;
  }

  updateDeviceEntry(device) {
    window.updateDeviceEntry?.(device);
    window.refreshDevicesPanel?.();
  }

  appendLog(device, message) {
    window.appendLog?.(device, message);
  }

  _addDevice(dev) {
    this.devices.push(dev);
    window.logStatus?.(`Connected: ${dev.name}`);
    window.renderDeviceEntry?.(dev);
    window.refreshDevicesPanel?.();
  }

  _removeDevice(dev) {
    const idx = this.devices.indexOf(dev);
    if (idx >= 0) this.devices.splice(idx, 1);
    window.logStatus?.(`Disconnected: ${dev.name}`);
    window.refreshDevicesPanel?.();
  }

  async connectLegoInterfaceB() {
    const name = this._allocateName();
    const dev = new LegoInterfaceB(name, this);
    await dev.connect();
    this._addDevice(dev);
    return dev;
  }

  async disconnectAll() {
    for (const dev of [...this.devices]) {
      await dev.disconnect();
      this._removeDevice(dev);
    }
    this.devices = [];          // optional but clean
    this._nextId = 1;           // ← reset numbering
    window.logStatus?.("All devices disconnected.");
  }

  getDeviceByName(name) {
    return this.devices.find(d => d.name === name) || null;
  }
}

window.deviceManager = new DeviceManager();