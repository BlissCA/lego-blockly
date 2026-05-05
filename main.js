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
import "./device/DeviceLegoA.js";
import "./device/DeviceLegoA_v2.js";
import "./device/DeviceLegoA_ws.js";
import "./device/DeviceLegoB.js";
import "./device/DeviceLegoRcx.js";
import "./device/DeviceLegoWeDo1.js";
import "./device/DeviceLegoVLL.js";
import "./device/deviceManager.js";

let currentProjectName = "lego-project";
let currentProjectFileHandle = null;
let currentProjectFileHandleForStartIn = null;
let isDirty = false;

// ---------------- GLOBAL EXECUTION CONTROL ----------------

let currentExecution = null;
window.stopRequested = false;
let debugLogPackets = false;
window.debugLogPackets = debugLogPackets;
let highlightToggle  = false;
window.highlightToggle = highlightToggle;
let useCyberMaster = false;
window.useCyberMaster = useCyberMaster;
window.TaskRegistry = [];
window.isProgramRunning = false;


window.__interactiveValues = window.__interactiveValues || {};

window.__interactive_value = function(blockId) {
  const block = window.workspace.getBlockById(blockId);
  if (!block) return null;

  const mode = block.mode || "NUMBER";
  const val = (block.committedValue !== undefined)
    ? block.committedValue
    : block.getFieldValue("VALUE");

  switch (mode) {
    case "NUMBER": return Number(val);
    case "TEXT": return String(val);
    case "BOOLEAN": return val === "TRUE";
    case "DROPDOWN": return val;
  }
};

window.__interactive_slider = function(blockId) {
  const block = window.workspace.getBlockById(blockId);
  if (!block) return 0;
  return Number(block.value ?? 0);
};

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
      if (window.stopRequested) return;

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
      if (window.stopRequested) return;

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

window.NamedEventTimer.cancelAll = function() {
  for (const name in window.NamedEventTimers) {
    clearTimeout(window.NamedEventTimers[name].handle);
    delete window.NamedEventTimers[name];
  }
};


// ---------------- NAMED COUNTERS ----------------
// Global counter storage
window.__counters = window.__counters || {}; // { name: { acc:0, last:false } }

window.__counter_step = function(name, dir, preset, trigger, blockId, autoReset) {

  // Create counter if needed
  if (!window.__counters[name] || typeof window.__counters[name] !== "object") {
    window.__counters[name] = { acc: 0, last: {} };
  }

  const c = window.__counters[name];

  // If last was a boolean from old version → fix it
  if (typeof c.last !== "object") {
    c.last = {};
  }

  // Ensure last exists for this block instance
  if (c.last[blockId] === undefined) {
    c.last[blockId] = false;
  }

  const prev = c.last[blockId];
  const trig = !!trigger;

  // false → true transition for THIS block instance
  if (!prev && trig) {
    if (dir === "UP") c.acc++;
    else c.acc = Math.max(0, c.acc - 1);
  }

  // Update last for THIS block instance
  c.last[blockId] = trig;

  // Update ACC field on block
  if (window.workspace) {
    const block = window.workspace.getBlockById(blockId);
    if (block) {
      block.setFieldValue(String(c.acc), "ACC");
    }
  }

  const done = (c.acc >= preset);

  // Auto-reset AFTER returning DONE
  if (done && autoReset) {
    c.acc = 0;
  }

  return done;
};


window.__counter_reset = function(name) {
  if (!window.__counters[name]) {
    window.__counters[name] = { acc: 0, last: false };
  } else {
    window.__counters[name].acc = 0;
  }
};

window.__counter_set = function(name, value) {
  if (!window.__counters[name]) {
    window.__counters[name] = { acc: 0, last: false };
  }
  let v = Number(value);
  if (!Number.isFinite(v)) v = 0;
  v = Math.max(0, Math.floor(v));
  window.__counters[name].acc = v;
};

window.__counter_get = function(name) {
  if (!window.__counters[name]) {
    window.__counters[name] = { acc: 0, last: false };
  }
  return window.__counters[name].acc;
};


// ---------------- NAMED ASYNC TASKS ----------------

window.NamedTasks = {};
window.NamedTaskState = {};

window.NamedTask = {
  start(name, asyncFunc) {
    // If program is stopping, do not start tasks
    if (window.stopRequested) return;

    // If already running, do not start another instance
    const state = window.NamedTaskState[name];
    if (state && state.running) {
      return;
    }

    // Initialize state
    window.NamedTaskState[name] = {
      running: true,
      done: false,
      cancelled: false,
      error: null
    };

    // Launch async task (fire-and-forget)
    const handle = (async () => {
      try {
        await asyncFunc();
        if (!window.NamedTaskState[name]?.cancelled && !window.stopRequested) {
          window.NamedTaskState[name].done = true;
        }
      } catch (err) {
        console.error("Named task error:", err);
        window.logStatus?.("Task error: " + err);
        if (window.NamedTaskState[name]) {
          window.NamedTaskState[name].error = err;
        }
      } finally {
        if (window.NamedTaskState[name]) {
          window.NamedTaskState[name].running = false;
        }
      }
    })();

    window.NamedTasks[name] = handle;
  },

  cancel(name) {
    const state = window.NamedTaskState[name];
    if (state) {
      state.cancelled = true;
    }
  },

  isRunning(name) {
    return window.NamedTaskState[name]?.running === true;
  },

  isDone(name) {
    return window.NamedTaskState[name]?.done === true;
  },

  hasError(name) {
    return window.NamedTaskState[name]?.error != null;
  }
};

window.NamedTask.stopAll = function() {
  for (const name in window.NamedTaskState) {
    window.NamedTaskState[name].cancelled = true;
  }
};

window.TaskShouldStop = function(name) {
  return window.stopRequested || window.NamedTaskState[name]?.cancelled;
};

function extractTasksFromJson(json) {
  window.TaskRegistry.length = 0;

  function scan(obj) {
    if (!obj) return;

    // Both task types must be recognized
    if ((obj.type === "task_definition" || obj.type === "task_loop_definition")
        && obj.fields && obj.fields.TASK) {

      const name = obj.fields.TASK;
      if (!window.TaskRegistry.includes(name)) {
        window.TaskRegistry.push(name);
      }
    }

    if (obj.children) {
      for (const child of obj.children) scan(child);
    }

    if (obj.inputs) {
      for (const key in obj.inputs) {
        const input = obj.inputs[key];
        if (input.block) scan(input.block);
      }
    }
  }

  if (json && json.blocks && json.blocks.blocks) {
    for (const block of json.blocks.blocks) {
      scan(block);
    }
  }
}


// Helper for generators to check stop condition
window.shouldStop = () => {
  if (window.stopRequested) {
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

window.ONCHG = function(id, currentValue) {
  const prev = window._onsMemory[id] ?? currentValue;
  window._onsMemory[id] = currentValue;

  // Value Changed
  return (prev !== currentValue);
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

window.onbeforeunload = (e) => {
  if (isDirty) {
    e.preventDefault();
    e.returnValue = "";   // Required for Chrome
  }
};

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


Blockly.Css.register(`
  /* Target the text element directly to override default styles */
  .blockly-watch-display.blocklyText {
    fill: #00ff00 !important;
    font-size: 24px !important;    /* Much larger font */
    font-weight: bold !important;
    font-family: 'Courier New', monospace !important;
  }
`);



// ---------------- BLOCKLY WORKSPACE ----------------

window.workspace = Blockly.inject("blocklyDiv", {
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

window.updateBlockDisplay = function(blockId, value) {
  const block = window.workspace.getBlockById(blockId);
  if (!block) return;

  let formatted = value;

  if (typeof value === "number") {
    formatted = Number(value.toFixed(4)).toString();
  }

  block.setFieldValue(formatted, "DISPLAY_FIELD");
};

function onProgramFinished() {
  window.isProgramRunning = false;

  const btn = document.getElementById("runBtn");
  btn.classList.remove("running");

  logStatus("Program finished.");
}

window.highlightBlock = function(id) {
  const isEnabled = highlightToggle;

  if (isEnabled) {
    window.workspace.highlightBlock(id);
  } else {
    window.workspace.highlightBlock(null);
  }
};

// ---------------- RUN PROGRAM ----------------

document.getElementById("runBtn").onclick = async () => {
  if (window.isProgramRunning) {
    console.log("Program already running — ignoring Run click.");
    logStatus("Program already running...  Press stop then Run again...");
    return;
  }
  window.isProgramRunning = true;

  window.BlocklyButtonEvents = {};

  // Turn button green
  const btn = document.getElementById("runBtn");
  btn.classList.add("running");

  if (highlightToggle) {
    // Inject the highlight call into generated code
    javascriptGenerator.STATEMENT_PREFIX = 'highlightBlock(%1);\n';
    javascriptGenerator.addReservedWords('highlightBlock');
  } else {
    // Disable highlighting by clearing the prefix
    javascriptGenerator.STATEMENT_PREFIX = null;
    // Clear any remaining highlights on the workspace
    workspace.highlightBlock(null);
  }


  // 1. Generate code
  let code = javascriptGenerator.workspaceToCode(workspace);

  // ------------------------------------------------------------
  // 1b. Make all user-defined functions async
  // ------------------------------------------------------------
  // Matches lines starting with "function NAME("
  code = code.replace(/(^|\n)function\s+([A-Za-z0-9_]+)\s*\(/g,
                      "$1async function $2(");

  // ------------------------------------------------------------
  // 1c. Extract all user-defined function names
  // ------------------------------------------------------------
  const functionNames = [...code.matchAll(/async function\s+([A-Za-z0-9_]+)\s*\(/g)]
    .map(m => m[1]);

  // ------------------------------------------------------------
  // 1d. Add "await" ONLY to calls of those functions
  // ------------------------------------------------------------
  for (const name of functionNames) {
    // Skip task functions later (we will prefix them)
    if (name.startsWith("__task_")) continue;

    // Match standalone calls:   NAME(...);
    const callRegex = new RegExp(`(^|\\s)(${name})\\((.*?)\\);`, "gm");
    code = code.replace(callRegex, `$1await $2($3);`);
  }

  console.log("Generated code:\n", code);
  logStatus("Running program...");

  window.stopRequested = false;

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

//    if (!window.stopRequested) {
//      logStatus("Program finished.");
//    }

  } catch (err) {
    if (!window.stopRequested) {
      logStatus(err);
      console.error(err);
      NamedTask.stopAll();
      NamedEventTimer.cancelAll();
      //window.stopRequested = true;
    }
  } finally {
    currentExecution = null;
    onProgramFinished();
    workspace.highlightBlock(null);
  }
};

// ---------------- STOP PROGRAM (Option A) ----------------

document.getElementById("stopBtn").onclick = async () => {
  NamedTask.stopAll();
  NamedEventTimer.cancelAll();

  if (!window.isProgramRunning) return;

  window.stopRequested = true;

  logStatus("Stopping program...");

  for (const dev of window.deviceManager.devices) {
    try {
      if (dev.portsOff) {
        // LEGO Interface A
        await dev.portsOff();
      } else if (dev.outOff) {
        // LEGO Interface B
        for (let port = 1; port <= 8; port++) {
          await dev.outOff(port);
        }
      } else if (dev.mot) {
        // RCX: stop all motors A, B, C
        await dev.mot(0x01).off();
        await dev.mot(0x02).off();
        await dev.mot(0x04).off();
      } else if (dev.stopMotor) {
        // WeDo 1.0: stop all motors
        await dev.stopMotor();
      }

    } catch (err) {
      console.warn("Output stop error:", err);
    }
  }
  // mqttClient.stop();
  logStatus("Program stopped (devices remain connected).");

  window.isProgramRunning = false;
  const btn = document.getElementById("runBtn");
  btn.classList.remove("running");

};

document.getElementById("connectDeviceBtn").onclick = async () => {
  const sel = document.getElementById("deviceSelect").value;
  let dev = null;

  switch (sel) {
    case "A":
      dev = await window.deviceManager.connectLegoInterfaceA();
      break;

    case "A_V2":
      dev = await window.deviceManager.connectLegoInterfaceA_v2();
      break;

    case "A_WS":
      dev = await window.deviceManager.connectLegoInterfaceA_ws();
      break;

    case "B":
      dev = await window.deviceManager.connectLegoInterfaceB();
      break;

    case "RCX":
      window.useCyberMaster = false;
      dev = await window.deviceManager.connectRcx();   // your unified RCX/CM class
      break;

    case "CM":
      window.useCyberMaster = true;
      dev = await window.deviceManager.connectRcx();   // your unified RCX/CM class
      break;

    case "WD1":
      dev = await window.deviceManager.connectLegoWeDo1();   // your unified RCX/CM class
      break;

    case "VLLSER":
      dev = await window.deviceManager.connectLegoVLL();   // your unified VLL Serial class
      break;

    default:
      console.warn("Unknown device type:", sel);
  }
  if (dev) {
    // Success is already logged by deviceManager._addDevice()
    // So we don't log anything here.
  } else {
    // User cancelled OR handshake failed
    logStatus("Connection cancelled or device not responding.");
  }

  refreshDevicesPanel();
};


// ---------------- DISCONNECT ALL ----------------

document.getElementById("disconnectBtn").onclick = async () => {
  try {
    await window.deviceManager.disconnectAll();
  //  logStatus("Disconnected all devices.");  // Already in devicemanager
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
  extractTasksFromJson(json);

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

document.getElementById("highlightToggle").onchange = e => {
  highlightToggle = e.target.checked;
  window.highlightToggle = highlightToggle;
  console.log("Highlight execution:", highlightToggle);
};

/*
document.getElementById("useCyberMaster").onchange = e => {
  useCyberMaster = e.target.checked;
  window.useCyberMaster = useCyberMaster;
  console.log("Using CyberMaster:", useCyberMaster);
};
*/

// ---------------- NEW PROJECT ----------------

document.getElementById("newProjectBtn").onclick = async () => {
  if (isDirty) {
    const ok = await openConfirmDialog(
      "You have unsaved changes. Create a new project anyway?"
    );
    if (!ok) return;
  }

  // Clear Blockly workspace
//  try {
//    Blockly.Events.disable();
    workspace.clear();
//  } finally {
//    Blockly.Events.enable();
//  }

  // Reset project metadata
  currentProjectName = "lego-project";
  currentProjectFileHandle = null;
  //currentProjectFileHandleForStartIn = null;

  // Update UI
  isDirty = false;
  updateProjectNameField();

  logStatus("New project created.");
};


workspace.addChangeListener(function(event) {
  // --- 1. Ignore UI-only events (toolbox clicks, selections, drags) ---
  if (event.isUiEvent) return;

  // --- 2. Mark workspace as dirty (your existing logic) ---
  if (!isDirty) {
    isDirty = true;
    updateProjectNameField();
  }

  // --- 3. TASK DELETED (including trashcan move) ---
  if (event.type === Blockly.Events.BLOCK_DELETE) {
    const xml = event.oldXml;
    const deletedNames = [];

    // Recursively scan deleted XML for task_definition blocks
    function scan(xmlNode) {
      if (!xmlNode) return;

      if (xmlNode.getAttribute) {
        const type = xmlNode.getAttribute("type");
        if (type === "task_definition" || type === "task_loop_definition") {
          const field = xmlNode.querySelector('field[name="TASK"]');
          if (field) deletedNames.push(field.textContent);
        }
      }

      for (const child of xmlNode.children || []) {
        scan(child);
      }
    }

    scan(xml);

    // Remove deleted task names from registry
    for (const name of deletedNames) {
      const idx = window.TaskRegistry.indexOf(name);
      if (idx !== -1) window.TaskRegistry.splice(idx, 1);
    }

    // Fix dropdowns in all blocks
    const blocks = workspace.getAllBlocks(false);
    for (const block of blocks) {
      const field = block.getField("TASK");
      if (field) {
        const value = field.getValue();
        if (!window.TaskRegistry.includes(value)) {
          const fallback = window.TaskRegistry[0] || "__none__";
          field.setValue(fallback);
        }
      }
    }
  }

  // --- 4. TASK RESTORED FROM TRASH (BLOCK_CREATE) ---
  // Unique name on creation + add to registry if new
  if (event.type === Blockly.Events.BLOCK_CREATE) {
    const ids = event.ids || [];

    for (const id of ids) {
      const block = workspace.getBlockById(id);
      if (!block) continue;

      // --- FIX: Ignore toolbox flyout clones ---
      if (block.isInFlyout) continue;

      if (block.type === "task_definition" || block.type === "task_loop_definition") {

        // 1. Read the name from the block (usually "Task1")
        let name = block.getFieldValue("TASK");
        if (block.getParent()) continue;

        // 2. If the name already exists, generate a unique one
        if (window.TaskRegistry.includes(name)) {
          const base = "Task";
          let counter = 1;
          while (window.TaskRegistry.includes(base + counter)) {
            counter++;
          }
          name = base + counter;

          block.setFieldValue(name, "TASK");
        }

        // 3. Update oldTaskName for rename logic
        block.oldTaskName = name;

        // 4. Add to registry
        if (!window.TaskRegistry.includes(name)) {
          window.TaskRegistry.push(name);
        }
      }
    }
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

    // If there's an updated SW waiting, activate it immediately
    if (reg.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    // If a new SW is installed, activate it immediately
    reg.addEventListener("updatefound", () => {
      const newWorker = reg.installing;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });

    // Reload when the new SW takes control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });

  });
}

window.addEventListener("DOMContentLoaded", () => {
  const label = document.getElementById("version-label");
  if (label) {
    label.textContent = "Version: " + LEGO_BLOCKLY_VERSION;
  }
});
