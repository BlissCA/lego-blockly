//
// lego_blocks.js
// LEGO Interface B blocks with dynamic device dropdowns
//

// ------------------------------------------------------------
// Dynamic dropdown function
// ------------------------------------------------------------
function getDeviceDropdown() {
  const devices = window.deviceManager?.devices || [];
  return devices.length
    ? devices.map(d => [d.name, d.name])
    : [["No devices", "NONE"]];
}

// ------------------------------------------------------------
// Block definitions
// ------------------------------------------------------------
Blockly.defineBlocksWithJsonArray([
/*
  {
    "type": "lego_connect",
    "message0": "connect new LEGO Interface B",
    "previousStatement": null,
    "nextStatement": null,
    "colour": 60,
    "tooltip": "Connect a new LEGO Interface B",
    "helpUrl": ""
  },

  {
    "type": "lego_disconnect",
    "message0": "disconnect all LEGO devices",
    "previousStatement": null,
    "nextStatement": null,
    "colour": 60,
    "tooltip": "Disconnect all LEGO devices",
    "helpUrl": ""
  },

  {
    "type": "lego_set_output",
    "message0": "device %1 set output %2 to %3",
    "args0": [
      {
        "type": "field_dropdown",
        "name": "DEVICE",
        "options": getDeviceDropdown
      },
      {
        "type": "field_dropdown",
        "name": "PORT",
        "options": [
          ["A", "0"],
          ["B", "1"],
          ["C", "2"],
          ["D", "3"]
        ]
      },
      {
        "type": "input_value",
        "name": "VALUE",
        "check": "Number"
      }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 60,
    "tooltip": "Set motor/relay output on the selected device",
    "helpUrl": ""
  },

  {
    "type": "lego_read_packet",
    "message0": "device %1 read last packet",
    "args0": [
      {
        "type": "field_dropdown",
        "name": "DEVICE",
        "options": getDeviceDropdown
      }
    ],
    "output": null,
    "colour": 60,
    "tooltip": "Read the last 19-byte packet from the selected device",
    "helpUrl": ""
  },
*/

  // -----------------------------
  // INPUT BLOCKS
  // -----------------------------

  {
    "type": "lego_inp_on",
    "message0": "device %1 input ON port %2",
    "args0": [
      {
        "type": "field_dropdown",
        "name": "DEVICE",
        "options": getDeviceDropdown
      },
      {
        "type": "field_number",
        "name": "PORT",
        "value": 1,
        "min": 0,
        "max": 8
      }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 0, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 0, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 0, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 0, "max": 8 }
    ],
    "output": "Number",
    "colour": 60,
    "tooltip": "Returns rotation counter"
  },


  // -----------------------------
  // OUTPUT COMMAND BLOCKS
  // -----------------------------

  {
    "type": "lego_out_on",
    "message0": "device %1 output ON port %2",
    "args0": [
      { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 },
      { "type": "field_number", "name": "PWR", "value": 7, "min": 0, "max": 7 }
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
      { "type": "field_number", "name": "PORT", "value": 1, "min": 1, "max": 8 },
      { "type": "field_number", "name": "TIME", "value": 50, "min": 0, "max": 255 }
    ],
    "previousStatement": null,
    "nextStatement": null,
    "colour": 20
  }

]);
