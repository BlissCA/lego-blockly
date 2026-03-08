function getDeviceDropdown() {
  const devices = window.deviceManager?.devices || [];
  return devices.length
    ? devices.map(d => [d.name, d.name])
    : [['No devices', 'NONE']];
}

// Helper to auto‑insert default number blocks
function attachDefaultNumber(block, inputName, defaultValue) {
  const input = block.getInput(inputName);
  if (!input) return;

  if (!input.connection.targetConnection) {
    const num = block.workspace.newBlock("math_number");
    num.setFieldValue(String(defaultValue), "NUM");
    num.initSvg();
    num.render();
    num.outputConnection.connect(input.connection);
  }
}

Blockly.defineBlocksWithJsonArray([
  // ---------------- INPUT BLOCKS ----------------

  {
    "type": "lego_inp_on",
    "message0": "device %1 input ON port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "output": "Boolean",
    "colour": 60,
    "tooltip": "Returns true if the input port is ON"
  },
  {
    "type": "lego_inp_val",
    "message0": "device %1 input value port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "output": "Number",
    "colour": 60,
    "tooltip": "Returns the 10‑bit analog value"
  },
  {
    "type": "lego_inp_tempf",
    "message0": "device %1 temperature °F port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "output": "Number",
    "colour": 60,
    "tooltip": "Returns temperature in Fahrenheit"
  },
  {
    "type": "lego_inp_tempc",
    "message0": "device %1 temperature °C port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "output": "Number",
    "colour": 60,
    "tooltip": "Returns temperature in Celsius"
  },
  {
    "type": "lego_inp_rot",
    "message0": "device %1 rotation count port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "output": "Number",
    "colour": 60,
    "tooltip": "Returns rotation counter"
  },

  // ---------------- OUTPUT BLOCKS ----------------

  {
    "type": "lego_out_on",
    "message0": "device %1 output ON port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_onl",
    "message0": "device %1 output ON Left port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_onr",
    "message0": "device %1 output ON Right port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_off",
    "message0": "device %1 output OFF port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_float",
    "message0": "device %1 output FLOAT port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_rev",
    "message0": "device %1 output REVERSE port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_l",
    "message0": "device %1 output SET LEFT port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_r",
    "message0": "device %1 output SET RIGHT port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_pow",
    "message0": "device %1 set power port %2 power %3",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" },
      { "type": "input_value", "name": "PWR" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  },
  {
    "type": "lego_out_onfor",
    "message0": "device %1 output ON FOR port %2 time %3",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "input_value", "name": "PORT" },
      { "type": "input_value", "name": "TIME" }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  }
]);

// ---------------- AUTO‑INSERT DEFAULT NUMBER BLOCKS ----------------

const DEFAULTS = {
  PORT: 1,
  PWR: 7,
  TIME: 50
};

Blockly.getMainWorkspace().addChangeListener(function (event) {
  if (event.type !== Blockly.Events.BLOCK_CREATE) return;

  const ws = Blockly.getMainWorkspace();
  const createdIds = event.ids;

  createdIds.forEach(id => {
    const block = ws.getBlockById(id);
    if (!block) return;

    ["PORT", "PWR", "TIME"].forEach(name => {
      if (block.getInput(name)) {
        attachDefaultNumber(block, name, DEFAULTS[name]);
      }
    });
  });
});