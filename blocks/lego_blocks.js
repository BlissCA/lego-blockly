// Blockly is global (loaded from blockly.min.js)


// ---------------- DEVICE DROPDOWNS ----------------

// All devices (if you still need it somewhere)
function getDeviceDropdown() {
  const devices = window.deviceManager?.devices || [];
  return devices.length
    ? devices.map(d => [d.name, d.name])
    : [['No devices', 'NONE']];
}

// Only LEGO Interface B devices
function getLegoBDropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("LegoB"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No Lego B', 'NONE']];
}

// Only RCX devices
function getRcxDropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("Rcx"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No RCX', 'NONE']];
}

// Update task dropdowns
function updateTaskDropdowns() {
  const blocks = workspace.getAllBlocks(false);

  for (const block of blocks) {
    if (block.getField && block.getField("TASK")) {
      const field = block.getField("TASK");
      const current = field.getValue();

      field.menuGenerator_ = window.TaskRegistry.map(t => [t, t]);

      if (!window.TaskRegistry.includes(current)) {
        field.setValue(window.TaskRegistry[0]);
      }
    }
  }
}

window.addEventListener("load", () => {

  Blockly.defineBlocksWithJsonArray([

    // ---------------- INPUT BLOCKS ----------------

    {
      "type": "lego_inp_on",
      "message0": "%1 inp %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "lego_out_float",
      "message0": "%1 out %2 FLOAT",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
      "colour": 20,
      "tooltip": "Power must be from 0 to 7"
    },

    {
      "type": "lego_out_onfor",
      "message0": "%1 out %2 ON FOR %3 x 0.1s",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
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
          "options": getLegoBDropdown
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
      "colour": 180
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
      "colour": 180
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
      "colour": 180
    },

    {
      "type": "ons_rising",
      "message0": "one-shot rising of %1",
      "args0": [
        { "type": "input_value", "name": "BOOL", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 180
    },

    {
      "type": "ons_falling",
      "message0": "one-shot falling of %1",
      "args0": [
        { "type": "input_value", "name": "BOOL", "check": "Boolean" }
      ],
      "output": "Boolean",
      "colour": 180
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
      "colour": 180,
      "tooltip": "Executes code after a delay without blocking other blocks.",
    },
    
    {
      "type": "after_named_time_do",
      "message0": "%1 after %2 sec\nDo %3",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        },
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
      "colour": 180,
      "tooltip": "Executes code after a delay without blocking other blocks.",
    },

    {
      "type": "cancel_named_timer",
      "message0": "%1 Cancel Timer",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 180,
      "tooltip": "Cancels Named Timer",
    },

    {
      "type": "named_timer_done",
      "message0": "%1 Done?",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 180,
      "tooltip": "Check if Timer is Done",
    },

    {
      "type": "named_timer_running",
      "message0": "%1 Running?",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 180,
      "tooltip": "Check if Timer is Running",
    },

    {
      "type": "named_timer_elapsed",
      "message0": "%1 Elapsed time?",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 180,
      "tooltip": "Time Elapsed in Seconds",
    },

    {
      "type": "named_timer_remaining",
      "message0": "%1 Remain time?",
      "args0": [
        {
          "type": "field_input",
          "name": "TIMER_NAME",
          "text": "T1",
          "spellcheck": false
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 180,
      "tooltip": "Time Remaining in Seconds",
    },

    {
      "type": "rcx_snd",
      "message0": "%1 sound %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "SOUND",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_prog",
      "message0": "%1 program %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PROG",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_starttask",
      "message0": "%1 start task %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "TASK",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_stoptask",
      "message0": "%1 stop task %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "TASK",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_stopall",
      "message0": "%1 stop all tasks",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_msg",
      "message0": "%1 msg %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "MSG",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_alive",
      "message0": "%1 alive?",
      "args0": [
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_pwroff",
      "message0": "%1 power off",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },
    {
      "type": "rcx_alive",
      "message0": "%1 alive?",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 20
    },

    // ---------------- RCX OUTPUT BLOCKS ----------------

    {
      "type": "rcx_mot_on",
      "message0": "%1 Motors %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_off",
      "message0": "%1 Motors %2 OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_float",
      "message0": "%1 Motors %2 FLOAT",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_flip",
      "message0": "%1 Motors %2 Flip",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_f",
      "message0": "%1 Motors %2 Set forward",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_r",
      "message0": "%1 Motors %2 Set reverse",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

    {
      "type": "rcx_mot_pow",
      "message0": "%1 Motors %2 set power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        {
          "type": "input_value",
          "name": "PORTS",
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
      "colour": 20,
      "tooltip": "Power must be from 0 to 7"
    },
    {
      "type": "logic_is_between",
      "message0": "%1 %2 %3 %4 %5",
      "args0": [
        {
          "type": "input_value",
          "name": "A",
          "check": "Number"
        },
        {
          "type": "field_dropdown",
          "name": "OP1",
          "options": [
            ["<=", "LEQ"],
            ["<", "LT"]
          ]
        },
        {
          "type": "input_value",
          "name": "X",
          "check": "Number"
        },
        {
          "type": "field_dropdown",
          "name": "OP2",
          "options": [
            ["<=", "LEQ"],
            ["<", "LT"]
          ]
        },
        {
          "type": "input_value",
          "name": "B",
          "check": "Number"
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 210,
      "tooltip": "Checks if X is between A and B. If A > B, the logic flips automatically.",
      "helpUrl": ""
    }

  ]);
});

Blockly.Blocks["lego_multi_out_on"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
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
    this.setTooltip("Power must be from 0 to 7");
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
    this.setTooltip("Returns a predefined constant value for Lego B output ports.");
  }
};

Blockly.Blocks['Rcx_MotPort'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["A", "1"], ["B", "2"], ["C", "4"], ["A+B", "3"], ["A+C", "5"], ["B+C", "6"], ["A+B+C", "7"]
      ]), "LETTER");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for RCX output ports.");
  }
};

Blockly.Blocks['Rcx_InpPort'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["1", "0"], ["2", "1"], ["3", "2"]
      ]), "INPPORT");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for RCX input ports.");
  }
};

Blockly.Blocks['rcx_getval'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 get val. Source: %2 Arg: %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        { "type": "field_dropdown", "name": "SOURCE", "options": [["VAR", "0"], ["TMR", "1"], ["MOT", "3"], ["PRG", "8"], ["SV", "9"], ["ST", "10"], ["SM", "11"], ["SR", "12"], ["SB", "13"], ["CLK", "14"], ["MSG", "15"] ]},
        {
          "type": "field_number",
          "name": "ARG",
          "value": 0,
          "min": 0,
          "max": 31,
          "precision": 1,
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 20
    });

    this.setFieldValue("9", "SOURCE");
    this.setTooltip("Sources: SV=Sensor Value, SR=Raw Value, SB=Boolean Value");
  }
};

/*
    # TypeRaw = 0
    # TypeTouch = 1
    # TypeTemp = 2
    # TypeLight = 3
    # TypeRot = 4
*/
Blockly.Blocks['rcx_sensortype'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 input: %2 type: %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
        { "type": "field_dropdown", "name": "TYPE", "options": [["RAW", "0"], ["TOUCH", "1"], ["TEMP", "2"], ["LIGHT", "3"], ["ROT", "4"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    });

    this.setFieldValue("1", "TYPE");
    this.setTooltip("Sensor Types");
  }
};

/*
    #    ModeRaw = 0x00		Value in 0...1023.
    #    ModeBool = 0x20	Either 0 or 1. (default for Touch sensor type)
    #    ModeEdge = 0x40	Number of boolean transitions.
    #    ModePulse = 0x60	Number of boolean transitions divided by two. 
    #    ModePct = 0x80		Raw value scaled to 0..100. (default for Light sensor type)
    #    ModeTempC = 0xA0	1/10ths of a degree, -19.8..69.5. (default for Temperature sensor type)
    #    ModeTempF = 0xC0	1/10ths of a degree, -3.6..157.1.
    #    ModeAngle = 0xE0	1/16ths of a rotation, represented as a signed short.  (Default for Rotation sensor type)

    # 	 Ex.: >>> rcx.sensor(rcx.inp1).mode(rcx.ModeRaw) # configures input 1 for raw value. (Slope 0)
    # 	 Ex.: with slope >>> rcx.sensor(inp1).mode(rcx.ModeBool + 15) # configures input 1 for boolean value with slope of 15.
*/
Blockly.Blocks['rcx_sensormode'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 input: %2 mode: %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
        { "type": "field_dropdown", "name": "MODE", "options": [["RAW", "0x00"], ["BOOL", "0x20"], ["EDGE", "0x40"], ["PULSE", "0x60"], ["PCT", "0x80"], ["TEMP_C", "0xA0"], ["TEMP_F", "0xC0"], ["ANGLE", "0xE0"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    });

    this.setFieldValue("0x00", "MODE");
    this.setTooltip("Sensor Modes");
  }
};

Blockly.Blocks['rcx_sensorclear'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 input: %2 clrear rot.count",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    });

    this.setTooltip("Rotation clear count to 0");
  }
};

Blockly.Blocks['rcx_getinpval'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 inp %2 value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getRcxDropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 20
    });

    this.setTooltip("Get Value of Input Port");
  }
};

// ---------------- TASK BLOCKS ----------------
Blockly.Blocks['task_definition'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldTextInput("Task1"), "TASK")
      .appendField("do");

    this.appendStatementInput("DO")
      .setCheck(null);

    this.setColour(290);
    this.setTooltip("Define a named asynchronous task");
    this.setHelpUrl("");
  }
};

Blockly.Blocks['task_start'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("start task")
      .appendField(new Blockly.FieldDropdown(() =>
        window.TaskRegistry.map(t => [t, t])
      ), "TASK");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
  }
};

Blockly.Blocks['task_stop'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("stop task")
      .appendField(new Blockly.FieldDropdown(() =>
        window.TaskRegistry.map(t => [t, t])
      ), "TASK");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
  }
};

Blockly.Blocks['task_is_running'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(() =>
        window.TaskRegistry.map(t => [t, t])
      ), "TASK")
      .appendField("is running");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};

Blockly.Blocks['task_is_done'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(() =>
        window.TaskRegistry.map(t => [t, t])
      ), "TASK")
      .appendField("is done");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};

Blockly.Blocks['task_has_error'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(() =>
        window.TaskRegistry.map(t => [t, t])
      ), "TASK")
      .appendField("has error");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};


/* NOT USING MQTT FOR NOW SINCE IT REQUIRES WSS SECURE CONNECTION WHICH IS HARD TO SETUP LOCALLY. MAY RECONSIDER IN THE FUTURE IF THERE'S A GOOD USE CASE FOR IT.
// ---------------- MQTT BLOCKS ----------------

Blockly.Blocks["mqtt_config"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("MQTT connect to")
      .appendField(new Blockly.FieldTextInput("192.168.1.10"), "HOST")
      .appendField("port")
      .appendField(new Blockly.FieldNumber(9001, 1, 65535), "PORT");

    this.appendDummyInput()
      .appendField("username")
      .appendField(new Blockly.FieldTextInput(""), "USERNAME");

    this.appendDummyInput()
      .appendField("password")
      .appendField(new Blockly.FieldPassword(""), "PASSWORD");

    this.appendDummyInput()
      .appendField("TLS")
      .appendField(new Blockly.FieldCheckbox("FALSE"), "TLS");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks["mqtt_publish"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("MQTT publish topic")
      .appendField(new Blockly.FieldTextInput("robot/status"), "TOPIC");
    this.appendValueInput("MSG")
      .setCheck("String")
      .appendField("message");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks["mqtt_subscribe"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("MQTT subscribe topic")
      .appendField(new Blockly.FieldTextInput("robot/cmd"), "TOPIC");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(230);
  }
};

Blockly.Blocks["mqtt_on_message"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("when MQTT message on topic")
      .appendField(new Blockly.FieldTextInput("robot/cmd"), "TOPIC");
    this.appendStatementInput("DO")
      .setCheck(null)
      .appendField("do");
    this.setColour(230);
  }
};
*/
