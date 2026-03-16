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
    },

    {
      "type": "after_time_do",
      "message0": "after %1 sec\nDo %2",
      "args0": [
        {
          "type": "input_value",
          "name": "TIME",
          "check": "Number"
        },
        {
          "type": "input_statement",
          "name": "DO"
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 60,
      "tooltip": "Executes code after a delay without blocking other blocks.",
    }

  ]);
});

Blockly.Blocks["lego_multi_out_on"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out ON");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_out_off"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out OFF");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_out_float"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out Float");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_out_Rev"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out Reverse");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_out_L"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out Set Left");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_out_R"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out Set Right");

    this.appendDummyInput()
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");

    this.appendDummyInput()
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

Blockly.Blocks["lego_multi_pow"] = {
  init: function () {
    this.appendDummyInput("ROW1")
      .appendField(new Blockly.FieldDropdown(getDeviceDropdown), "DEVICE")
      .appendField("Multi Out Set Pwr");

    this.appendValueInput("PWR")
      .setCheck("Number")
    this.setInputsInline(true);
    this.appendEndRowInput();

    this.appendDummyInput("ROW2")
      .appendField("A")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P1")
      .appendField("B")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P2")
      .appendField("C")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P3")
      .appendField("D")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P4");
    this.appendEndRowInput();

    this.appendDummyInput("ROW3")
      .appendField("E")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P5")
      .appendField("F")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P6")
      .appendField("G")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P7")
      .appendField("H")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "P8");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

// ---------------- TIMER BLOCKS ----------------

Blockly.Blocks['timer_after'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME")
        .appendField("After")
        .appendField(new Blockly.FieldNumber(5, 0), "PRESET")
        .appendField("sec Do");

    this.appendStatementInput("DO")
        .setCheck(null);

    this.setPreviousStatement(true);   // ✅ allow block before
    this.setNextStatement(true);       // ✅ allow block after
    this.setColour(230);
    this.setTooltip("Starts the timer and runs the enclosed blocks once when time elapses.");
    this.setHelpUrl("");
  }
};

Blockly.Blocks['timer_reset'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Reset Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks['timer_stop'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Stop Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks['timer_value'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME")
        .appendField("Value");

    this.setOutput(true, "Number");
    this.setColour(230);
  }
};

Blockly.Blocks['timer_done'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME")
        .appendField("Done?");

    this.setOutput(true, "Boolean");
    this.setColour(230);
  }
};

Blockly.Blocks['timer_set_value'] = {
  init: function() {
    this.appendValueInput("VALUE")
        .setCheck("Number")
        .appendField("Set Timer")
        .appendField(new Blockly.FieldTextInput("Timer1"), "TIMER_NAME")
        .appendField("Value to");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks['Legob_outportalpha'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["A", "1"], ["B", "2"], ["C", "3"], ["D", "4"],
        ["E", "5"], ["F", "6"], ["G", "7"], ["H", "8"]
      ]), "LETTER");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value.");
  }
};