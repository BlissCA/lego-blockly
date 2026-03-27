// Blockly is loaded globally from blockly.min.js
const javascriptGenerator = Blockly.JavaScript;

import "./mqttClient.js";
import "./field_password.js";

// Custom blocks + generators
import "./blocks/lego_blocks.js";
//import "./blocks/hmi_blocks.js";
import "./generators/lego_generators.js";
//import "./generators/hmi_generators.js";

// Toolbox
import toolbox from "./toolbox/toolbox.js";

// Device system
import "./device/DeviceLegoB.js";
import "./device/DeviceLegoRcx.js";
import "./device/deviceManager.js";

// ---------------- GLOBAL EXECUTION CONTROL ----------------

let currentExecution = null;
let stopRequested = false;
let debugLogPackets = false;
window.debugLogPackets = debugLogPackets;

// ----------------- function to auto-select serial/bluetooth port ----------------
window.autoSelectPort = async function () {
  const os = navigator.userAgentData?.platform || navigator.platform;

  // --- Try Bluetooth SPP (HC-05) ---
  async function tryBluetoothSPP() {
    try {
      return await await navigator.serial.requestPort({
        allowedBluetoothServiceClassIds: [0x1101],
        filters: [{ bluetoothServiceClassId: 0x1101 }]
      });
    } catch (err) {
      if (err instanceof TypeError) {
        // Chrome does not support RFCOMM
        return null;
      }
      throw err; // user cancelled or other error
    }
  }

  // --- Try USB Serial ---
  async function tryUSB() {
    try {
      return await navigator.serial.requestPort();
    } catch (err) {
      return null; // user cancelled or no USB devices
    }
  }

  // --- Android: Prefer Bluetooth ---
  if (/Android/i.test(os)) {
    const bt = await tryBluetoothSPP();
    if (bt) return bt;
    throw new Error("Bluetooth SPP not supported on this Android Chrome.");
  }

  // --- Desktop: Prefer USB ---
  const usb = await tryUSB();
  if (usb) return usb;

  // --- Desktop fallback: Bluetooth ---
  const bt = await tryBluetoothSPP();
  if (bt) return bt;

  throw new Error("No compatible serial transport available.");
};

// ---------------- EVENT-DRIVEN TIMER SCHEDULER ----------------

//window.ScheduledEvents = [];

window.TimerScheduler = {
  schedule(delaySeconds, callback) {
    const handle = setTimeout(async () => {
      // If program was stopped in the meantime, do nothing
      if (stopRequested) return;

      try {
        await callback();
      } catch (err) {
        console.error("Timer callback error:", err);
        window.logStatus("Timer error: " + err);
      }
    }, delaySeconds * 1000);

    return handle;
  }
};

// ---------------- NAMED EVENT-DRIVEN TIMERS ----------------

window.NamedEventTimers = {};

window.NamedEventTimer = {
  start(name, delaySeconds, callback) {
    // Cancel existing timer with same name
    if (window.NamedEventTimers[name]) {
      clearTimeout(window.NamedEventTimers[name].handle);
    }

    const startTime = performance.now();
    const duration = delaySeconds * 1000;

    // Create or reset timer state
    window.NamedEventTimers[name] = {
      handle: null,
      done: false,
      running: true,
      startTime,
      duration
    };

    const handle = setTimeout(async () => {
      if (stopRequested) return;

      try {
        await callback();
      } catch (err) {
        console.error("Named timer error:", err);
        window.logStatus("Timer error: " + err);
      }

      // Mark timer as done
      const t = window.NamedEventTimers[name];
      if (t) {
        t.done = true;
        t.running = false;
      }

    }, duration);

    // Store handle
    window.NamedEventTimers[name].handle = handle;
  },

  cancel(name) {
    if (window.NamedEventTimers[name]) {
      clearTimeout(window.NamedEventTimers[name].handle);
      delete window.NamedEventTimers[name];
    }
  },

  isDone(name) {
    return window.NamedEventTimers[name]?.done === true;
  },

  isRunning(name) {
    return window.NamedEventTimers[name]?.running === true;
  },

  elapsed(name) {
    const t = window.NamedEventTimers[name];
    if (!t) return 0;
    if (t.done) return t.duration / 1000;
    return (performance.now() - t.startTime) / 1000;
  },

  remaining(name) {
    const t = window.NamedEventTimers[name];
    if (!t) return 0;
    if (t.done) return 0;
    const rem = t.duration - (performance.now() - t.startTime);
    return Math.max(0, rem / 1000);
  }
};

// Helper for generators to check stop condition
window.shouldStop = () => {
  if (stopRequested) {
    throw new Error("Program stopped");
  }
};


// ---------------- One Shot Management ----------------
// Memory for all ONS blocks (keyed by block ID)
window._onsMemory = {};

window.ONS = function(id, currentValue) {
  const prev = window._onsMemory[id] ?? false;
  window._onsMemory[id] = currentValue;

  // Rising edge
  return (!prev && currentValue);
};

window.ONSF = function(id, currentValue) {
  const prev = window._onsMemory[id] ?? false;
  window._onsMemory[id] = currentValue;

  // Falling edge
  return (prev && !currentValue);
};


/* // ---------------- HMI STATE ----------------
window.hmi = {
  button: {},
  slider: {},
  indicator: {},
  display: {}
};

// Reset button presses each scan
window.resetHMI = function () {
  for (const id in window.hmi.button) {
    window.hmi.button[id] = false;
  }
}; */


// ---------------- STATUS LOG ----------------

function logStatus(msg) {
  const el = document.getElementById("statusLog");
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

window.logStatus = logStatus;

// ---------------- DEVICE PANEL ----------------

function refreshDevicesPanel() {
  const listEl = document.getElementById("devicesList");
  const dm = window.deviceManager;

  if (!dm || dm.devices.length === 0) {
    listEl.textContent = "No devices connected.";
    return;
  }

  listEl.innerHTML = "";
  dm.devices.forEach(dev => {
    const div = document.createElement("div");
    div.textContent = `${dev.name} – ${dev.status || "OK"}`;
    listEl.appendChild(div);
  });
}

window.refreshDevicesPanel = refreshDevicesPanel;

// Expose for generators
window.getDeviceByName = function (name) {
  if (!window.deviceManager) return null;
  return window.deviceManager.devices.find(d => d.name === name) || null;
};

// ---------------- BLOCKLY WORKSPACE ----------------

const workspace = Blockly.inject("blocklyDiv", {
  toolbox,
  renderer: "geras",
  theme: Blockly.Themes.Classic,
  zoom: {
    controls: true,   // ← THIS enables the + / – / reset buttons
    wheel: true,
    startScale: 1.0,
    maxScale: 3,
    minScale: 0.3,
    scaleSpeed: 1.2
  }
});

// ---------------- RUN PROGRAM ----------------

document.getElementById("runBtn").onclick = async () => {
  const code = javascriptGenerator.workspaceToCode(workspace);
  console.log("Generated code:\n", code);
  logStatus("Running program...");

  stopRequested = false;

  const asyncWrapper = new Function(
    "getDeviceByName",
    "deviceManager",
    "Blockly",
    "shouldStop",
    `
      return (async () => {
        ${code}
      })();
    `
  );

  try {
    currentExecution = asyncWrapper(
      name => window.getDeviceByName(name),
      window.deviceManager,
      Blockly,
      window.shouldStop
    );

    await currentExecution;

    if (!stopRequested) {
      logStatus("Program finished.");
    }
  } catch (err) {
    if (!stopRequested) {
      logStatus(err);
      console.error(err);
    }
  } finally {
    currentExecution = null;
  }
};

// ---------------- STOP PROGRAM (Option A) ----------------

document.getElementById("stopBtn").onclick = async () => {
  stopRequested = true;
  logStatus("Stopping program...");

  for (const dev of window.deviceManager.devices) {
    try {
      if (dev.outOff) {
        // LEGO Interface B
        for (let port = 1; port <= 8; port++) {
          await dev.outOff(port);
        }
      } else if (dev.mot) {
        // RCX: stop all motors A, B, C
        await dev.mot(0x01).off();
        await dev.mot(0x02).off();
        await dev.mot(0x04).off();
      }
    } catch (err) {
      console.warn("Output stop error:", err);
    }
  }

  logStatus("Program stopped (devices remain connected).");
};

// ---------------- CONNECT Lego Interface B ----------------

document.getElementById("connectBtnLegoB").onclick = async () => {
  const dev = await window.deviceManager.connectLegoInterfaceB();

  if (dev) {
    // Success is already logged by deviceManager._addDevice()
    // So we don't log anything here.
  } else {
    // User cancelled OR handshake failed
    logStatus("Connection cancelled or device not responding.");
  }

  refreshDevicesPanel();
};

// ---------------- CONNECT Lego RCX ----------------

document.getElementById("connectBtnRcx").onclick = async () => {
  const dev = await window.deviceManager.connectRcx();

  if (!dev) {
    logStatus("RCX connection cancelled or device not responding.");
  }

  refreshDevicesPanel();
};


// ---------------- DISCONNECT ALL ----------------

document.getElementById("disconnectBtn").onclick = async () => {
  try {
    await window.deviceManager.disconnectAll();
    logStatus("Disconnected all devices.");
    refreshDevicesPanel();
  } catch (err) {
    logStatus("Disconnect error: " + err);
  }
};

// ---------------- SAVE PROJECT ----------------

document.getElementById("saveBtn").addEventListener("click", () => {
  const json = Blockly.serialization.workspaces.save(Blockly.getMainWorkspace());
  const text = JSON.stringify(json, null, 2);

  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "lego-project.json";
  a.click();

  URL.revokeObjectURL(url);
  logStatus("Project saved as lego-project.json");
});

// ---------------- LOAD PROJECT ----------------

document.getElementById("loadBtn").onclick = () => {
  const input = document.getElementById("fileInput");
  input.value = "";
  input.click();
};

document.getElementById("fileInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const json = JSON.parse(text);

    // Clear current workspace
    workspace.clear();

    // Load JSON into workspace (Blockly 12)
    Blockly.serialization.workspaces.load(json, workspace);

    logStatus("Project loaded.");
  } catch (err) {
    logStatus("Load error: " + err);
  }
};

document.getElementById("clearStatusBtn").onclick = () => {
  document.getElementById("statusLog").textContent = "";
};

document.getElementById("debugPackets").onchange = e => {
  debugLogPackets = e.target.checked;
  window.debugLogPackets = debugLogPackets;
  console.log("Debug packet logging:", debugLogPackets);
};

document.getElementById("clearWorkspaceBtn").onclick = () => {
  if (confirm("Clear all blocks?")) {
    workspace.clear();
    workspace.clearUndo();
  }
};
