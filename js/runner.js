//
// runner.js
// LEGO Interface B – Code execution engine
//

// Helper: find a device by name
function getDeviceByName(name) {
  if (!window.deviceManager) return null;
  return window.deviceManager.devices.find(d => d.name === name) || null;
}

// Namespace for LEGO commands (optional convenience API)
window.lego = {

  async connect() {
    await window.deviceManager.connectLegoInterfaceB();
  },

  async disconnect() {
    await window.deviceManager.disconnectAll();
  },

  async setOutput(deviceName, port, value) {
    const dev = getDeviceByName(deviceName);
    if (!dev) {
      console.warn("Device not found:", deviceName);
      return;
    }

    try {
      const writer = dev.port.writable.getWriter();
      const cmd = new Uint8Array([port & 0xFF, value & 0xFF]);
      await writer.write(cmd);
      writer.releaseLock();
      dev.log(`Output: port=${port}, value=${value}`);
    } catch (err) {
      dev.log(`Output error: ${err.message}`);
    }
  },

  readPacket(deviceName) {
    const dev = getDeviceByName(deviceName);
    if (!dev) return null;
    return dev.lastPacket || null;
  }
};


//
// MAIN EXECUTION FUNCTION
//
window.runCode = async function () {

  // IMPORTANT:
  // Use the MAIN Blockly workspace, not window.workspace.
  const workspace = Blockly.getMainWorkspace();

  // Generate JavaScript code from blocks
  const code = Blockly.JavaScript.workspaceToCode(workspace);

  console.log("Generated code:\n", code);

  try {
    // Wrap user code in an async function so "await" works
    const asyncWrapper = new Function(`
      return (async () => {
        ${code}
      })();
    `);

    await asyncWrapper();

  } catch (err) {
    alert("Error:\n" + err);
    console.error(err);
  }
};