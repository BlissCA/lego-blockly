// Blockly is global (loaded from blockly.min.js)

function getDeviceDropdown() {
  const devices = window.deviceManager?.devices || [];
  return devices.length
    ? devices.map(d => [d.name, d.name])
    : [['No devices', 'NONE']];
}

window.addEventListener("load", () => {

  Blockly.defineBlocksWithJsonArray([

    // ---------------- INPUT BLOCKS ----------------

    {
      "type": "lego_inp_on",
      "message0": "device %1 input ON port %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        }
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
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 1 }
          }
        },
        {
          "type": "input_value",
          "name": "PWR",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 7 }
          }
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_onfor",
      "message0": "%1 out %2 ON FOR %3 x 0.1s",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        },
        {
          "type": "input_value",
          "name": "TIME",
          "check": "Number",
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_resetrot",
      "message0": "%1 inp %2 set rot.count to %3",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "DEVICE",
          "options": getDeviceDropdown
        },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number"
        },
        {
          "type": "input_value",
          "name": "COUNT",
          "check": "Number"
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    }    

  ]);
});