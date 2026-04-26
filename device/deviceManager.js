// device/deviceManager.js

import { LegoInterfaceA } from './DeviceLegoA.js';
import { LegoInterfaceA_v2 } from './DeviceLegoA_v2.js';
import { LegoInterfaceB } from './DeviceLegoB.js';
import { LegoRcx } from './DeviceLegoRcx.js';
import { LegoWeDo1 } from './DeviceLegoWeDo1.js';
import { LegoVLL } from './DeviceLegoVLL.js';

export class DeviceManager {
  constructor() {
    this.devices = [];

    // Name management
    this.usedNames = new Set();
    this.freeNames = [];
  }

  // -------------------------
  // Name Allocation (generalized)
  // -------------------------

  _allocateName(prefix) {
    // Reuse freed names matching this prefix
    for (let i = 0; i < this.freeNames.length; i++) {
      const name = this.freeNames[i];
      if (name.startsWith(prefix)) {
        this.freeNames.splice(i, 1);
        this.usedNames.add(name);
        return name;
      }
    }

    // Otherwise create next prefix#
    let i = 1;
    while (this.usedNames.has(`${prefix}${i}`)) {
      i++;
    }

    const name = `${prefix}${i}`;
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
  // Connect LEGO Interface A
  // -------------------------

  async connectLegoInterfaceA() {
    const dev = new LegoInterfaceA(null, this);

    try {
      await dev.connect();
      this._addDevice(dev);
      return dev;

    } catch (err) {
      console.warn("Lego A Connection failed:", err);
      await dev.disconnect();
      this._freeName(dev.name);
      return null;
    }
  }

  // -------------------------
  // Connect LEGO Interface A V2
  // -------------------------

  async connectLegoInterfaceA_v2() {
    const dev = new LegoInterfaceA_v2(null, this);

    try {
      await dev.connect();
      this._addDevice(dev);
      return dev;

    } catch (err) {
      console.warn("Lego A V2 Connection failed:", err);
      await dev.disconnect();
      this._freeName(dev.name);
      return null;
    }
  }

  // -------------------------
  // Connect LEGO Interface B
  // -------------------------

  async connectLegoInterfaceB() {
    const dev = new LegoInterfaceB(null, this);

    try {
      await dev.connect();
      this._addDevice(dev);
      return dev;

    } catch (err) {
      console.warn("Lego B Connection failed:", err);
      await dev.forceDisconnect();
      this._freeName(dev.name);
      return null;
    }
  }

  // -------------------------
  // Connect LEGO RCX
  // -------------------------

  async connectRcx() {
    const dev = new LegoRcx(null, this);

    try {
      await dev.connect();
      if (dev.status === "Connected") {
        this._addDevice(dev);
        return dev;
      } else {
        return null;
      }

    } catch (err) {
      console.warn("RCX connection failed:", err);
      await dev.disconnect();
      return null;
    }
  }

  // -------------------------
  // Connect LEGO WeDo 1.0
  // -------------------------

  async connectLegoWeDo1() {
    const dev = new LegoWeDo1(null, this);

    try {
      await dev.connect();
      if (dev.status === "Connected") {
        this._addDevice(dev);
        return dev;
      } else {
        return null;
      }

    } catch (err) {
      console.warn("WeDo 1.0 connection failed:", err);
      await dev.disconnect();
      return null;
    }
  }

  // -------------------------
  // Connect LEGO VLL Serial
  // -------------------------

  async connectLegoVLL() {
    const dev = new LegoVLL(null, this);

    try {
      await dev.connect();
      this._addDevice(dev);
      return dev;

    } catch (err) {
      console.warn("Lego VLL Connection failed:", err);
      await dev.disconnect();
      this._freeName(dev.name);
      return null;
    }
  }

  // -------------------------
  // Disconnect All
  // -------------------------

  async disconnectAll() {
    for (const dev of [...this.devices]) {
      await dev.disconnect();
      if (dev.name) {
        this._removeDevice(dev);
      }
    }

    this.devices = [];
    this.usedNames.clear();
    this.freeNames = [];

    window.logStatus?.("All devices disconnected.");
  }

  // -------------------------
  // Handle Device Loss
  // -------------------------

  handleDeviceLost(dev) {
    window.logStatus?.(`Lost device ${dev.name}`);

    if (window.currentExecution) {
      window.stopRequested = true;
      window.logStatus?.("Program stopped due to device loss.");
    }

    dev.forceDisconnect();
    this._removeDevice(dev);
    window.refreshDevicesPanel?.();
  }

  // -------------------------
  // Lookup
  // -------------------------

  getDeviceByName(name) {
    return this.devices.find(d => d.name === name) || null;
  }
}

window.deviceManager = new DeviceManager();