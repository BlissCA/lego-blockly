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
      "message0": "%1 inp %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 60,
      "tooltip": "Returns true if the input port is ON"
    },

    {
      "type": "lego_inp_val",
      "message0": "%1 inp %2 value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 60,
      "tooltip": "Returns the 10‑bit analog value"
    },

    {
      "type": "lego_inp_tempf",
      "message0": "%1 inp %2 temp.°F",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 60,
      "tooltip": "Returns temperature in Fahrenheit"
    },

    {
      "type": "lego_inp_tempc",
      "message0": "%1 inp %2 temp.°C",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 60,
      "tooltip": "Returns temperature in Celsius"
    },

    {
      "type": "lego_inp_rot",
      "message0": "%1 inp %2 rotation count",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 60,
      "tooltip": "Returns rotation counter"
    },

    // ---------------- OUTPUT BLOCKS ----------------

    {
      "type": "lego_out_on",
      "message0": "%1 out %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_onl",
      "message0": "%1 out %2 ON Left",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_onr",
      "message0": "%1 out %2 ON Right",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_off",
      "message0": "%1 out %2 OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_offall",
      "message0": "%1 out ALL OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_float",
      "message0": "%1 outp %2 FLOAT",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_rev",
      "message0": "%1 out %2 REVERSE",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_l",
      "message0": "%1 out %2 SET LEFT",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_r",
      "message0": "%1 out %2 SET RIGHT",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_pow",
      "message0": "%1 out %2 set power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getDeviceDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
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
      "inputsInline": true,
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
      "inputsInline": true,
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
    },

    {
      "type": "lego_wait_until",
      "message0": "wait until %1",
      "args0": [
        {
          "type": "input_value",
          "name": "COND",
          "check": "Boolean"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 60
    },

    {
      "type": "lego_wait_time",
      "message0": "wait %1 seconds",
      "args0": [
        {
          "type": "input_value",
          "name": "SECS",
          "check": "Number"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 60
    },

    {
      "type": "lego_print_value",
      "message0": "print value %1",
      "args0": [
        {
          "type": "input_value",
          "name": "VALUE"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 60
    },

    {
      "type": "ons_rising",
      "message0": "one-shot rising of %1",
      "args0": [
        { "type": "input_value", "name": "BOOL", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 60
    },

    {
      "type": "ons_falling",
      "message0": "one-shot falling of %1",
      "args0": [
        { "type": "input_value", "name": "BOOL", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 60
    }


  ]);
});

Blockly.Blocks["lego_multi_out_on"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out ON");

    this.appendDummyInput()
      .appendField("1")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("2")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("3")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("4")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("5")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("6")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("7")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("8")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(160);
  }
};

Blockly.Blocks["lego_multi_out_off"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out OFF");

    this.appendDummyInput()
      .appendField("1")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("2")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("3")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("4")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("5")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("6")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("7")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("8")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(160);
  }
};