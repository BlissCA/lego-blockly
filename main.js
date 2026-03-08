// Blockly is loaded globally from blockly.min.js
const javascriptGenerator = Blockly.JavaScript;

// Custom blocks + generators
import "./blocks/lego_blocks.js";
import "./generators/lego_generators.js";

// Toolbox
import toolbox from "./toolbox/toolbox.js";

// Device system
import "./device/webserial.js";
import "./device/deviceManager.js";

// ---------------- GLOBAL EXECUTION CONTROL ----------------

let currentExecution = null;
let stopRequested = false;

// Helper for generators to check stop condition
window.shouldStop = () => stopRequested;

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
      () => stopRequested
    );

    await currentExecution;

    if (!stopRequested) {
      logStatus("Program finished.");
    }
  } catch (err) {
    if (!stopRequested) {
      logStatus("Error: " + err);
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

  // Stop all motors on all devices
  for (const dev of window.deviceManager.devices) {
    try {
      for (let port = 1; port <= 8; port++) {
        await dev.outOff(port);
      }
    } catch (err) {
      console.warn("Motor stop error:", err);
    }
  }

  logStatus("Program stopped (devices remain connected).");
};

// ---------------- CONNECT ----------------

document.getElementById("connectBtn").onclick = async () => {
  try {
    await window.deviceManager.connectLegoInterfaceB();
    logStatus("Connected to LEGO Interface B.");
    refreshDevicesPanel();
  } catch (err) {
    logStatus("Connect error: " + err);
  }
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
