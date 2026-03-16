// Blockly is loaded globally from blockly.min.js
const javascriptGenerator = Blockly.JavaScript;

async function init() {

  // ---------------- LOAD BLOCKS + GENERATORS FIRST ----------------
  await import("./blocks/lego_blocks.js");
  // await import("./blocks/hmi_blocks.js");
  await import("./generators/lego_generators.js");
  // await import("./generators/hmi_generators.js");

  // ---------------- LOAD TOOLBOX ----------------
  const toolbox = (await import("./toolbox/toolbox.js")).default;

  // ---------------- LOAD DEVICE SYSTEM ----------------
  await import("./device/webserial.js");
  await import("./device/deviceManager.js");

  // ---------------- GLOBAL EXECUTION CONTROL ----------------

  let currentExecution = null;
  let stopRequested = false;
  let debugLogPackets = false;
  window.debugLogPackets = debugLogPackets;

  // Helper for generators to check stop condition
  window.shouldStop = () => {
    if (stopRequested) {
      throw new Error("Program stopped");
    }
  };

  // ---------------- One Shot Management ----------------
  window._onsMemory = {};

  window.ONS = function(id, currentValue) {
    const prev = window._onsMemory[id] ?? false;
    window._onsMemory[id] = currentValue;
    return (!prev && currentValue);
  };

  window.ONSF = function(id, currentValue) {
    const prev = window._onsMemory[id] ?? false;
    window._onsMemory[id] = currentValue;
    return (prev && !currentValue);
  };

  // ---------------- Named TIMER implementation ----------------

  window.Timers = {};

  class NamedTimer {
    constructor(name) {
      this.name = name;
      this.reset();
    }

    reset() {
      this.accum = 0;
      this.preset = 0;
      this.running = false;
      this.done = false;
      this._fired = false;
      this.lastUpdate = performance.now();
    }

    start(presetSeconds) {
      this.preset = presetSeconds;
      this.accum = 0;
      this.running = true;
      this.done = false;
      this._fired = false;
      this.lastUpdate = performance.now();
    }

    stop() {
      this.running = false;
    }

    update() {
      if (!this.running) return;

      const now = performance.now();
      const dt = (now - this.lastUpdate) / 1000;
      this.lastUpdate = now;

      this.accum += dt;

      if (this.accum >= this.preset) {
        this.done = true;
      }
    }

    doneOnce() {
      if (this.done && !this._fired) {
        this._fired = true;
        return true;
      }
      return false;
    }
  }

  window.Timer = {
    get(name) {
      if (!window.Timers[name]) {
        window.Timers[name] = new NamedTimer(name);
      }
      window.Timers[name].update();
      return window.Timers[name];
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
      controls: true,
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

  // ---------------- STOP PROGRAM ----------------

  document.getElementById("stopBtn").onclick = async () => {
    stopRequested = true;
    logStatus("Stopping program...");

    for (const dev of window.deviceManager.devices) {
      try {
        for (let port = 1; port <= 8; port++) {
          await dev.outOff(port);
        }
      } catch (err) {
        console.warn("Output stop error:", err);
      }
    }

    logStatus("Program stopped (devices remain connected).");
  };

  // ---------------- CONNECT ----------------

  document.getElementById("connectBtn").onclick = async () => {
    const dev = await window.deviceManager.connectLegoInterfaceB();

    if (!dev) {
      logStatus("Connection cancelled or device not responding.");
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

      workspace.clear();
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
}

init();