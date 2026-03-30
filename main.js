// Blockly is loaded globally from blockly.min.js
const javascriptGenerator = Blockly.JavaScript;

// import "./mqttClient.js";
// import "./field_password.js"; // (used by MQTT blocks)

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

let currentProjectName = "lego-project";
let currentProjectFileHandle = null;
let currentProjectFileHandleForStartIn = null;
let isDirty = false;

// ---------------- GLOBAL EXECUTION CONTROL ----------------

let currentExecution = null;
let stopRequested = false;
let debugLogPackets = false;
window.debugLogPackets = debugLogPackets;


// ---------- Non-blocking dialog helpers ----------

function openConfirmDialog(message) {
  return new Promise((resolve) => {
    const dialog = document.getElementById("confirmDialog");
    const msgEl = document.getElementById("confirmDialogMessage");

    msgEl.textContent = message;

    dialog.returnValue = "cancel";

    dialog.onclose = () => {
      resolve(dialog.returnValue === "ok");
    };

    dialog.showModal();
  });
}

async function openPromptDialog(message, defaultValue = "") {
  return new Promise((resolve) => {
    const dialog = document.getElementById("variableDialog");
    const input = document.getElementById("variableNameInput");

    // Update label text dynamically
    dialog.querySelector("label").textContent = message;

    input.value = defaultValue;
    input.select();

    dialog.returnValue = "cancel";

    dialog.onclose = () => {
      const ok = dialog.returnValue === "ok";
      const value = input.value.trim();
      resolve(ok ? value : null);
    };

    dialog.showModal();
    input.focus();
  });
}


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

// ---------------- helper to update the UI Project Name field ----------------
function updateProjectNameField() {
  const prefix = isDirty ? "● " : "";
  document.getElementById("projectNameField").value = prefix + currentProjectName;
}


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

// ---------- Override Blockly blocking dialogs ----------
Blockly.dialog.setPrompt(async (message, defaultValue, callback) => {
  const result = await openPromptDialog(message, defaultValue);
  callback(result);
});



// ---------------- RUN PROGRAM ----------------

document.getElementById("runBtn").onclick = async () => {
  // 1. Generate code
  let code = javascriptGenerator.workspaceToCode(workspace);

  // 1b. Make all user-defined functions async
  // Matches lines starting with "function NAME("
  code = code.replace(/(^|\n)function\s+([A-Za-z0-9_]+)\s*\(/g,
                      "$1async function $2(");

  console.log("Generated code:\n", code);
  logStatus("Running program...");

  stopRequested = false;

  // 2. Wrap the generated code in an async IIFE
  const asyncWrapper = new Function(
    "getDeviceByName",
    "deviceManager",
    "shouldStop",
    `
      return (async () => {
        ${code}
      })();
    `
  );

  try {
    // 3. Execute the wrapped async program
    currentExecution = asyncWrapper(
      name => window.getDeviceByName(name),
      window.deviceManager,
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
  // mqttClient.stop();
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

document.getElementById("saveBtn").onclick = async () => {
  const json = Blockly.serialization.workspaces.save(Blockly.getMainWorkspace());
  const text = JSON.stringify(json, null, 2);

  if (currentProjectFileHandle) {
    isDirty = false;
    updateProjectNameField();

    let perm = await currentProjectFileHandle.queryPermission({ mode: "readwrite" });

    if (perm !== "granted") {
      // Instead of requesting permission, fallback to Save As
      return saveProjectAs();
    }

    const writable = await currentProjectFileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    logStatus(`Saved: ${currentProjectName}.json`);
    return;
  }

  await saveProjectAs();
};

// ---------------- SAVE AS PROJECT ----------------
async function saveProjectAs() {
  const json = Blockly.serialization.workspaces.save(Blockly.getMainWorkspace());
  const text = JSON.stringify(json, null, 2);

  const handle = await window.showSaveFilePicker({
  //  id: currentProjectName,
    suggestedName: currentProjectName + ".json",
    types: [
      {
        description: "LEGO Project",
        accept: { "application/json": [".json"] }
      }
    ],
    startIn: currentProjectFileHandleForStartIn || "downloads"
  });

  currentProjectFileHandle = handle;
  currentProjectFileHandleForStartIn = handle; // Remember for next time
  currentProjectName = handle.name.replace(/\.json$/, "");

  isDirty = false;
  updateProjectNameField();

  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();

  logStatus(`Saved as: ${currentProjectName}.json`);
}

document.getElementById("saveAsBtn").onclick = saveProjectAs;


// ---------------- LOAD PROJECT ----------------

document.getElementById("loadBtn").onclick = async () => {
  if (isDirty) {
    const ok = await openConfirmDialog(
      "You have unsaved changes. Load another project anyway?"
    );
    if (!ok) return;
  }

  const [handle] = await window.showOpenFilePicker({
  //  id: currentProjectName,
    types: [
      {
        description: "LEGO Project",
        accept: { "application/json": [".json"] }
      }
    ],
    startIn: currentProjectFileHandleForStartIn || "downloads"
  });

  const file = await handle.getFile();
  const text = await file.text();
  const json = JSON.parse(text);

  try {
    Blockly.Events.disable();
    workspace.clear();
    Blockly.serialization.workspaces.load(json, workspace);
  } finally {
    Blockly.Events.enable();
  }


  currentProjectFileHandle = handle;
  // Request write permission immediately after loading
  const perm = await currentProjectFileHandle.requestPermission({ mode: "read" });

  currentProjectFileHandleForStartIn = handle; // Remember for next time
  currentProjectName = handle.name.replace(/\.json$/, "");

  isDirty = false;
  updateProjectNameField();

  logStatus(`Loaded: ${currentProjectName}.json`);
};


document.getElementById("clearStatusBtn").onclick = () => {
  document.getElementById("statusLog").textContent = "";
};

document.getElementById("debugPackets").onchange = e => {
  debugLogPackets = e.target.checked;
  window.debugLogPackets = debugLogPackets;
  console.log("Debug packet logging:", debugLogPackets);
};

document.getElementById("newProjectBtn").onclick = async () => {
  if (isDirty) {
    const ok = await openConfirmDialog(
      "You have unsaved changes. Create a new project anyway?"
    );
    if (!ok) return;
  }

  // Clear Blockly workspace
  try {
    Blockly.Events.disable();
    workspace.clear();
  } finally {
    Blockly.Events.enable();
  }

  // Reset project metadata
  currentProjectName = "lego-project";
  currentProjectFileHandle = null;
  //currentProjectFileHandleForStartIn = null;

  // Update UI
  isDirty = false;
  updateProjectNameField();

  logStatus("New project created.");
};

workspace.addChangeListener((event) => {
  if (event.isUiEvent) return; // ignore toolbox clicks, selections, etc.

  if (!isDirty) {
    isDirty = true;
    updateProjectNameField();
  }
});


// ------------------------------  Keyboard shortcuts ------------------------------
document.addEventListener("keydown", onShortcut, { capture: true });

function onShortcut(e) {
  // Do not interfere with typing in text fields
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  const key = e.key.toLowerCase();

  // --- Ctrl+S → Save ---
  if (e.ctrlKey && !e.shiftKey && key === "s") {
    e.preventDefault();
    document.getElementById("saveBtn").click();
    return;
  }

  // --- Ctrl+Shift+S → Save As ---
  if (e.ctrlKey && e.shiftKey && key === "s") {
    e.preventDefault();
    document.getElementById("saveAsBtn").click();
    return;
  }

  // --- Ctrl+O → Load ---
  if (e.ctrlKey && key === "o") {
    e.preventDefault();
    document.getElementById("loadBtn").click();
    return;
  }

  // --- Ctrl+Alt+N → New Project ---
  if (e.ctrlKey && e.altKey && key === "n") {
    e.preventDefault();
    document.getElementById("newProjectBtn").click();
    return;
  }
}


// ------------------------------
// PWA Service Worker Registration
// ------------------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").then(reg => {

    // When the new SW activates, reload the page
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

  });
}

document.getElementById("version-label").textContent =
  "Version: " + LEGO_BLOCKLY_VERSION;
