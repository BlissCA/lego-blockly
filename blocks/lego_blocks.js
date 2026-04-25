// Blockly is global (loaded from blockly.min.js)


class FieldInteractiveButton extends Blockly.FieldTextInput {
  static TYPE = 'field_interactive_button';
  static SERIALIZABLE = true;

  constructor(text = "Click me") {
    super(text);
    this.EDITABLE = false;
  }

  static fromJson(options) {
    return new FieldInteractiveButton(options.text);
  }

  initView() {
    super.initView();   // ⭐ IMPORTANT — gives us this.clickTarget_

    const group = Blockly.utils.dom.createSvgElement('g', {}, this.fieldGroup_);

    this.rect_ = Blockly.utils.dom.createSvgElement('rect', {
      rx: 6,
      ry: 6,
      fill: '#F4D800',
      stroke: '#C4A000',
      'stroke-width': 1
    }, group);

    this.textElement_ = Blockly.utils.dom.createSvgElement('text', {
      'class': 'blocklyText',
      x: 0,
      y: 0,
      'dominant-baseline': 'middle',
      'text-anchor': 'middle'
    }, group);

    this.textElement_.textContent = this.getValue();
    this.textElement_.style.fill = '#000';

    group.style.cursor = 'pointer';
    this.group_ = group;

    // ⭐ Correct way to attach interactive field events
    Blockly.browserEvents.conditionalBind(
      this.group_,
      "pointerdown",
      this,
      this.onClick_
    );
  }

  render_() {
    const paddingX = 10;
    const paddingY = 6;

    const textWidth = Blockly.utils.dom.getTextWidth(this.textElement_);
    const textHeight = 16;

    const width = textWidth + paddingX * 2;
    const height = textHeight + paddingY * 2;

    this.rect_.setAttribute('width', width);
    this.rect_.setAttribute('height', height);

    this.textElement_.setAttribute('x', width / 2);
    this.textElement_.setAttribute('y', height / 2 + 1);

    this.size_.width = width;
    this.size_.height = height;
  }

  setValue(newValue) {
    super.setValue(newValue);

    if (this.textElement_) {
      this.textElement_.textContent = newValue;
    }

    this.forceRerender();
  }

  onClick_(e) {
    e.preventDefault();
    e.stopPropagation();

    const block = this.getSourceBlock();
    if (!block) return;

    window.BlocklyButtonEvents[block.id] = true;
  }

  showEditor_() {
    return; // disable text editor
  }

  isClickable_() {
    return false;
  }

  isEditable() {
    return false;
  }
}

Blockly.fieldRegistry.register('field_interactive_button', FieldInteractiveButton);


/*
Blockly.serialization.registry.register(
  'field_interactive_button',
  {
    save: (field) => field.getValue(),
    load: (state) => new FieldInteractiveButton(state)
  }
);
*/

window.BlocklyButtonEvents = {};


Blockly.Extensions.register('lego_button_event_edit', function() {
  const wrap = this.getInput('EDIT_WRAP');
  const buttonField = this.getField('BTN');

  const pencil = new Blockly.FieldImage(
    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHZpZXdCb3g9IjAgMCAxMiAxMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNOC4zMzMzIDJMMTAgMy42NjY2N0wzLjY2NjY3IDEwSDIgVjguMzMzMzNMOCAyWiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=",
    12, 12, "*"
  );

  wrap.appendField(pencil, "EDIT");

  // Wait for SVG to exist
  setTimeout(() => {
    const svg = pencil.getSvgRoot();
    if (!svg) return;

    svg.style.cursor = "pointer";

    svg.addEventListener("click", () => {
      // --- Simple HTML overlay editor (no WidgetDiv) ---

      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.background = "rgba(0,0,0,0.2)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.zIndex = "9999";

      const panel = document.createElement("div");
      panel.style.background = "#fff";
      panel.style.padding = "8px 12px";
      panel.style.borderRadius = "4px";
      panel.style.boxShadow = "0 2px 6px rgba(0,0,0,0.3)";
      panel.style.display = "flex";
      panel.style.gap = "8px";
      panel.style.alignItems = "center";

      const label = document.createElement("span");
      label.textContent = "Button label:";
      label.style.fontFamily = "sans-serif";
      label.style.fontSize = "13px";

      const input = document.createElement("input");
      input.type = "text";
      input.value = buttonField.getValue();
      input.style.fontSize = "13px";
      input.style.padding = "3px 5px";
      input.style.minWidth = "140px";

      panel.appendChild(label);
      panel.appendChild(input);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      input.focus();
      input.select();

      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
      };

      const apply = () => {
        buttonField.setValue(input.value);
        close();
      };

      // Enter = apply
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") close();
      });

      // Clicking outside = close
      overlay.addEventListener("mousedown", (e) => {
        if (!panel.contains(e.target)) close();
      });
    });

  });
});

const counterMutator = {
  autoReset: true,

  // Save mutation to XML
  mutationToDom: function() {
    const container = document.createElement("mutation");
    container.setAttribute("autoreset", this.autoReset ? "true" : "false");
    return container;
  },

  // Load mutation from XML
  domToMutation: function(xmlElement) {
    const val = xmlElement.getAttribute("autoreset");
    this.autoReset = (val !== "false"); // default true
  },

  // Save to JSON (Blockly 12+)
  saveExtraState: function() {
    return { autoreset: this.autoReset };
  },

  // Load from JSON
  loadExtraState: function(state) {
    this.autoReset = state.autoreset !== false;
  },

  // Build mutator UI
  decompose: function(workspace) {
    const containerBlock = workspace.newBlock("counter_mutator_container");
    containerBlock.initSvg();
    containerBlock.render();

    containerBlock.getField("AUTORESET")
      .setValue(this.autoReset ? "TRUE" : "FALSE");

    return containerBlock;
  },

  // Apply mutator UI changes
  compose: function(containerBlock) {
    this.autoReset =
      containerBlock.getField("AUTORESET").getValue() === "TRUE";
  }
};

Blockly.Extensions.registerMutator(
  "counter_mutator",
  counterMutator,
  null,
  []
);


const interactiveValueMutator = {

  mode: "NUMBER",
  options: ["A", "B", "C"],

  mutationToDom: function() {
    const container = document.createElement("mutation");
    container.setAttribute("mode", this.mode);
    container.setAttribute("options", this.options.join(","));
    return container;
  },

  domToMutation: function(xmlElement) {
    this.mode = xmlElement.getAttribute("mode") || "NUMBER";
    const opt = xmlElement.getAttribute("options");
    this.options = opt ? opt.split(",").map(s => s.trim()).filter(Boolean) : ["A","B","C"];
    this.updateShape_();
  },

  saveExtraState: function() {
    return { mode: this.mode, options: this.options };
  },

  loadExtraState: function(state) {
    this.mode = state.mode || "NUMBER";
    this.options = (state.options || ["A","B","C"]).map(s => s.trim()).filter(Boolean);
    this.updateShape_();
  },

  decompose: function(workspace) {
    const containerBlock = workspace.newBlock("interactive_value_mutator_container");
    containerBlock.initSvg();

    containerBlock.getField("MODE").setValue(this.mode);

    // Add OPTIONS row dynamically
    const optionsRow = containerBlock.appendDummyInput("OPTIONS_ROW")
      .appendField("Options (comma separated)")
      .appendField(new Blockly.FieldTextInput(this.options.join(",")), "OPTIONS");

    optionsRow.setVisible(this.mode === "DROPDOWN");

    containerBlock.render();
    return containerBlock;
  },

  compose: function(containerBlock) {
    this.mode = containerBlock.getField("MODE").getValue();

    const optionsField = containerBlock.getField("OPTIONS");
    if (optionsField) {
      this.options = optionsField.getValue()
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
    }

    const optionsRow = containerBlock.getInput("OPTIONS_ROW");
    if (optionsRow) {
      optionsRow.setVisible(this.mode === "DROPDOWN");
      containerBlock.render();
    }

    this.updateShape_();
  },

  updateShape_: function() {
    if (this.getInput("VALUE_INPUT")) {
      this.removeInput("VALUE_INPUT");
    }
    this.appendDummyInput("VALUE_INPUT");

    // Ensure we have a committedValue per block
    if (this.committedValue === undefined) {
      if (this.mode === "NUMBER") this.committedValue = 0;
      else if (this.mode === "TEXT") this.committedValue = "text";
      else if (this.mode === "DROPDOWN") this.committedValue = this.options[0] || "";
    }

    switch (this.mode) {

      case "NUMBER": {
        const field = new Blockly.FieldNumber(this.committedValue || 0);
        field.onFinishEditing_ = function(finalValue) {
          const block = this.getSourceBlock();
          if (block) block.committedValue = finalValue;
        };
        this.getInput("VALUE_INPUT").appendField(field, "VALUE");
        this.setOutput(true, "Number");
        this.setFieldValue("Number", "VALUE_LABEL");
        break;
      }

      case "TEXT": {
        const field = new Blockly.FieldTextInput(this.committedValue || "text");
        field.onFinishEditing_ = function(finalValue) {
          const block = this.getSourceBlock();
          if (block) block.committedValue = finalValue;
        };
        this.getInput("VALUE_INPUT").appendField(field, "VALUE");
        this.setOutput(true, "String");
        this.setFieldValue("Text", "VALUE_LABEL");
        break;
      }

      case "BOOLEAN": {
        const field = new Blockly.FieldCheckbox(
          this.committedValue === "FALSE" ? "FALSE" : "TRUE"
        );
        field.setValidator(function(newValue) {
          const block = this.getSourceBlock();
          if (block) block.committedValue = newValue;
          return newValue;
        });
        this.getInput("VALUE_INPUT").appendField(field, "VALUE");
        this.setOutput(true, "Boolean");
        this.setFieldValue("Boolean", "VALUE_LABEL");
        break;
      }

      case "DROPDOWN": {
        const opts = this.options.map(o => [o, o]);
        const field = new Blockly.FieldDropdown(opts, function(newValue) {
          const block = this.getSourceBlock();
          if (block) block.committedValue = newValue;
          return newValue;
        });
        // Initialize dropdown to committedValue if possible
        if (this.committedValue && this.options.includes(this.committedValue)) {
          field.setValue(this.committedValue);
        }
        this.getInput("VALUE_INPUT").appendField(field, "VALUE");
        this.setOutput(true, null);
        this.setFieldValue("Choice", "VALUE_LABEL");
        break;
      }
    }
  }

};

Blockly.Extensions.registerMutator(
  "interactive_value_mutator",
  interactiveValueMutator,
  null,
  []
);



class FieldSlider extends Blockly.FieldNumber {

  showEditor_() {
    const block = this.getSourceBlock();
    const min = block.min ?? 0;
    const max = block.max ?? 100;
    const step = block.step ?? 1;

    // Popup container
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.background = "white";
    div.style.border = "1px solid #ccc";
    div.style.padding = "8px";
    div.style.borderRadius = "6px";
    div.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    div.style.zIndex = 9999;

    // Position near block
    const rect = this.getClickTarget_().getBoundingClientRect();
    div.style.left = rect.left + "px";
    div.style.top = (rect.bottom + 4) + "px";

    // Value label
    const valueLabel = document.createElement("div");
    valueLabel.textContent = "Value: " + block.value;
    valueLabel.style.marginBottom = "6px";
    div.appendChild(valueLabel);

    // Slider
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = block.value;
    slider.style.width = "200px";
    div.appendChild(slider);

    // Min/Max labels
    const mm = document.createElement("div");
    mm.textContent = `Min: ${min}    Max: ${max}`;
    mm.style.marginTop = "6px";
    div.appendChild(mm);

    // Live update
    slider.addEventListener("input", () => {
      const v = Number(slider.value);
      block.value = v;
      block.setFieldValue(String(v), "SLIDER");
      valueLabel.textContent = "Value: " + v;
    });

    // --- Close logic ---

    let isClosed = false;
    const workspaceSvg = block.workspace.getParentSvg();

    const close = (event) => {
      if (isClosed) return;

      // Ignore clicks inside popup
      if (div.contains(event.target)) return;

      isClosed = true;

      if (div.parentNode) {
        div.parentNode.removeChild(div);
      }

      document.removeEventListener("pointerdown", close, true);
      workspaceSvg.removeEventListener("pointerdown", close, true);
    };

    // Capture phase so Blockly can't swallow the event
    document.addEventListener("pointerdown", close, true);
    workspaceSvg.addEventListener("pointerdown", close, true);

    document.body.appendChild(div);
  }
}


const interactiveSliderMutator = {

  min: 0,
  max: 100,
  step: 1,
  value: 0,

  mutationToDom: function() {
    const container = document.createElement("mutation");
    container.setAttribute("min", this.min);
    container.setAttribute("max", this.max);
    container.setAttribute("step", this.step);
    container.setAttribute("value", this.value);
    return container;
  },

  domToMutation: function(xml) {
    this.min = Number(xml.getAttribute("min")) || 0;
    this.max = Number(xml.getAttribute("max")) || 100;
    this.step = Number(xml.getAttribute("step")) || 1;
    this.value = Number(xml.getAttribute("value")) || 0;
    this.updateShape_();
  },

  saveExtraState: function() {
    return {
      min: this.min,
      max: this.max,
      step: this.step,
      value: this.value
    };
  },

  loadExtraState: function(state) {
    this.min = state.min ?? 0;
    this.max = state.max ?? 100;
    this.step = state.step ?? 1;
    this.value = state.value ?? 0;
    this.updateShape_();
  },

  decompose: function(ws) {
    const block = ws.newBlock("interactive_slider_mutator_container");
    block.initSvg();

    block.getField("MIN").setValue(this.min);
    block.getField("MAX").setValue(this.max);
    block.getField("STEP").setValue(this.step);

    block.render();
    return block;
  },

  compose: function(containerBlock) {
    this.min = Number(containerBlock.getField("MIN").getValue());
    this.max = Number(containerBlock.getField("MAX").getValue());
    this.step = Number(containerBlock.getField("STEP").getValue());

    // Clamp current value
    this.value = Math.min(this.max, Math.max(this.min, this.value));

    this.updateShape_();
  },

  updateShape_: function() {
   // Replace label with slider field
    if (this.getField("SLIDER")) {
      this.removeInput("SLIDER_INPUT");
    }

    const input = this.appendDummyInput("SLIDER_INPUT");
    input.appendField(new FieldSlider(this.value), "SLIDER");
  }

};

Blockly.Extensions.registerMutator(
  "interactive_slider_mutator",
  interactiveSliderMutator,
  null,
  []
);



// ---------------- DEVICE DROPDOWNS ----------------

// All devices (if you still need it somewhere)
function getDeviceDropdown() {
  const devices = window.deviceManager?.devices || [];
  return devices.length
    ? devices.map(d => [d.name, d.name])
    : [['No devices', 'NONE']];
}

// Only LEGO Interface A devices
function getLegoADropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("LegoA"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No Lego A', 'NONE']];
}

// Only LEGO Interface B devices
function getLegoBDropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("LegoB"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No Lego B', 'NONE']];
}

// RCX + CyberMaster devices
function getRcxDropdown() {
  const devices = window.deviceManager?.devices || [];

  // Accept both "Rcx" and "CM" prefixes
  const list = devices.filter(d =>
    d.name.startsWith("Rcx") ||
    d.name.startsWith("CM")
  );

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No RCX/CM', 'NONE']];
}

// CyberMaster devices
function getCMDropdown() {
  const devices = window.deviceManager?.devices || [];

  // Accept both "Rcx" and "CM" prefixes
  const list = devices.filter(d => d.name.startsWith("CM"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No CyberMaster', 'NONE']];
}

// Only WeDo 1.0 devices
function getWedo1Dropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("WD1_"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No WeDo 1.0', 'NONE']];
}

// Only VLL devices
function getVLLDropdown() {
  const devices = window.deviceManager?.devices || [];
  const list = devices.filter(d => d.name.startsWith("VLL"));

  return list.length
    ? list.map(d => [d.name, d.name])
    : [['No VLL', 'NONE']];
}


window.addEventListener("load", () => {

  Blockly.defineBlocksWithJsonArray([
    {
      "type": "lego_button_event",
      "message0": "when button %1 %2 clicked %3 Do %4",
      "args0": [
        { "type": "field_interactive_button", "name": "BTN", "text": "Click me" },

        /* Inline dummy to hold the pencil */
        { "type": "input_dummy", "name": "EDIT_WRAP", "align": "RIGHT" },

        { "type": "input_dummy" },
        { "type": "input_statement", "name": "DO" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 180,
      "tooltip": "Runs the DO section when this block's button is clicked.",
      "helpUrl": "",
      "extensions": ["lego_button_event_edit"]
    }
  ]);


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
      "type": "lego_out",
      "message0": "%1 out %2 %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoBDropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        },
        { "type": "field_dropdown", "name": "CMD", "options": [["ON", "outOn"],["ON LEFT", "outOnL"], ["ON RIGHT", "outOnR"], ["OFF", "outOff"], ["FLOAT", "outFloat"], ["SET LEFT", "outL"], ["SET RIGHT", "outR"], ["REVERSE", "outRev"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20
    },

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
      "type": "val_changed",
      "message0": "Value changed? %1",
      "args0": [
        { "type": "input_value", "name": "VALUE", "check": null }
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
    },
    {
      "type": "legoa_inp_on",
      "message0": "%1 inp %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 35,
      "tooltip": "Returns true if the input port is ON, false if OFF"
    },
    {
      "type": "legoa_inp_val",
      "message0": "%1 inp %2 value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 35,
      "tooltip": "Returns the Input value 0-1023"
    },
    {
      "type": "legoa_out",
      "message0": "%1 out %2 %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        },
        { "type": "field_dropdown", "name": "CMD", "options": [["ON", "outOn"], ["OFF", "outOff"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn ON (max speed) or OFF the output port. For variable speed use the PWM block."
    },
    {
      "type": "legoa_out_on",
      "message0": "%1 out %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30
    },
    {
      "type": "legoa_out_off",
      "message0": "%1 out %2 OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
      "type": "legoa_out_offall",
      "message0": "%1 out ALL OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 20,
      "tooltip": "Turn off all output ports"
    },
    {
      "type": "legoa_out_pwm",
      "message0": "%1 out %2 power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
            "fields": { "NUM": 255 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn ON using PWM value from 0 to 255 (0=OFF)"
    },

    {
      "type": "legoa_combo",
      "message0": "%1 combo %2 %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        },
        { "type": "field_dropdown", "name": "CMD", "options": [["ON Left", "comboL"],["ON Right", "comboR"], ["OFF", "comboOff"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn ON (Left/Right) at max speed or turn OFF the motor using combo port."
    },

    {
      "type": "legoa_combo_l",
      "message0": "%1 combo %2 ON Left",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30
    },

    {
      "type": "legoa_combo_r",
      "message0": "%1 combo %2 ON Right",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30
    },

    {
      "type": "legoa_combo_off",
      "message0": "%1 combo %2 OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn off both sides of the motor"
    },
    {
      "type": "legoa_combo_pwml",
      "message0": "%1 combo %2 L power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
            "fields": { "NUM": 255 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Power the motor using PWM value from 0 to 255 (0=Stop)"
    },
    {
      "type": "legoa_combo_pwmr",
      "message0": "%1 combo %2 R power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
            "fields": { "NUM": 255 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Power the motor using PWM value from 0 to 255 (0=Stop)"
    },


    {
      "type": "legoa2_inp_on",
      "message0": "%1 inp %2 ON",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Boolean",
      "colour": 35,
      "tooltip": "Returns true if the input port is ON, false if OFF"
    },
    {
      "type": "legoa2_inp_rot",
      "message0": "%1 inp %2 rotation count",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        }
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 35,
      "tooltip": "Returns the Input value 0-1023"
    },
    {
      "type": "legoa2_out_resetrot",
      "message0": "%1 inp %2 set rot.count to %3",
      "args0": [
        {
          "type": "field_dropdown",
          "name": "DEVICE",
          "options": getLegoADropdown
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
      "colour": 35
    },    
    {
      "type": "legoa2_out",
      "message0": "%1 out %2 %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
        {
          "type": "input_value",
          "name": "PORT",
          "check": "Number",
        },
        { "type": "field_dropdown", "name": "CMD", "options": [["ON", "ON"], ["OFF", "OFF"] ]}
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn ON (max speed) or OFF the output port. For variable speed use the PWM block."
    },
    {
      "type": "legoa2_out_offall",
      "message0": "%1 out ALL OFF",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 35,
      "tooltip": "Turn off all output ports"
    },
    {
      "type": "legoa2_out_pwm",
      "message0": "%1 out %2 power %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
            "fields": { "NUM": 255 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Turn ON using PWM value from 0 to 255 (0=OFF)"
    },

    {
      "type": "legoa2_combo_pwm",
      "message0": "%1 combo %2 power %3 dir %4",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getLegoADropdown },
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
            "fields": { "NUM": 255 }
          }
        },
        {
          "type": "input_value",
          "name": "DIR",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 0 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 30,
      "tooltip": "Power the motor (combo port) using PWM value from 0 to 255 (0=Stop) at specified direction (0=Left, 1=Right)"
    }    

  ]);

  Blockly.defineBlocksWithJsonArray([
    {
      "type": "counter_block",
      "message0": "%1 Count %2 Pre: %3 Acc: %4 on: %5",
      "args0": [
        {
          "type": "field_input",
          "name": "NAME",
          "text": "C1"
        },
        {
          "type": "input_value",
          "name": "DIR",
          "check": "String"
        },
        {
          "type": "input_value",
          "name": "PRESET",
          "check": "Number"
        },
        {
          "type": "field_label",
          "name": "ACC",
          "text": "0"
        },
        {
          "type": "input_value",
          "name": "TRIGGER",
          "check": "Boolean"
        }
      ],
      "mutator": "counter_mutator",
      "inputsInline": true,
      "output": "Boolean",
      "colour": 190,
      "tooltip": "Counts on false→true transitions. Returns true when accumulated count reaches preset.",
      "helpUrl": ""
    },
    {
      "type": "counter_reset",
      "message0": "%1 Reset",
      "args0": [
        {
          "type": "field_input",
          "name": "NAME",
          "text": "C1"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 190,
      "tooltip": "Reset the counter accumulated value to 0.",
      "helpUrl": ""
    },
    {
      "type": "counter_set",
      "message0": "Set %1 acc to %2",
      "args0": [
        {
          "type": "field_input",
          "name": "NAME",
          "text": "C1"
        },
        {
          "type": "input_value",
          "name": "VALUE",
          "check": "Number"
        }
      ],
      "previousStatement": null,
      "nextStatement": null,
      "colour": 190,
      "tooltip": "Set the counter accumulated value.",
      "helpUrl": ""
    },
    {
      "type": "counter_get",
      "message0": "Get %1 acc value",
      "args0": [
        {
          "type": "field_input",
          "name": "NAME",
          "text": "C1"
        }
      ],
      "output": "Number",
      "colour": 190,
      "tooltip": "Get the counter accumulated value.",
      "helpUrl": ""
    }
  ]);

  Blockly.defineBlocksWithJsonArray([{
    "type": "counter_mutator_container",
    "message0": "Auto-reset when done %1",
    "args0": [
      {
        "type": "field_checkbox",
        "name": "AUTORESET",
        "checked": true
      }
    ],
    "colour": 190,
    "tooltip": "Automatically reset accumulator after DONE is reached.",
    "helpUrl": ""
  }]);

});

Blockly.Blocks['counter_dir'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
            ["▲", "UP"],
            ["▼", "DOWN"]
          ]), "COUNTDIR");

    this.setOutput(true, "String");
    this.setColour(230);
    this.setTooltip("Returns a predefined string for Counter Direction.");
  }
};

Blockly.Blocks["lego_multi_out"] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(getLegoBDropdown), "DEVICE")
      .appendField("Multi Out ")
      .appendField(new Blockly.FieldDropdown([
        ["ON", "multiOutOn"], ["OFF", "multiOutOff"], ["FLOAT", "multiOutFloat"],["SET LEFT", "multiOutL"], ["SET RIGHT", "multiOutR"], ["REVERSE", "multiOutRev"]
      ]), "CMD");

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

Blockly.Blocks['Legoa_outportnum'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["0", "0"], ["1", "1"], ["2", "2"], ["3", "3"],
        ["4", "4"], ["5", "5"]
      ]), "NUM");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for Lego A output ports.");
  }
};

Blockly.Blocks['Legoa_comboalpha'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["A", "0"], ["B", "1"], ["C", "2"]
      ]), "LETTER");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for Lego A Combo ports.");
  }
};

Blockly.Blocks['Legoa_inputnum'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["6", "6"], ["7", "7"]
      ]), "NUM");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for Lego A output ports.");
  }
};

Blockly.Blocks['Legoa_dir'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["L", "0"], ["R", "1"]
      ]), "NUM");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for Lego A Combo ports direction.");
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

Blockly.Blocks['wedo1_portinp'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["A", "1"], ["B", "2"]
      ]), "LETTER");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for WeDo 1.0 ports.");
  }
};

Blockly.Blocks['wedo1_motport'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["A", "1"], ["B", "2"], ["A+B", "3"]
      ]), "LETTER");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for WeDo 1.0 ports.");
  }
};

Blockly.Blocks['wedo1_tiltval'] = {
  init: function() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ["FLAT", "0"], ["FWD", "1"], ["LEFT", "2"], ["RIGHT", "3"], ["BACK", "4"]
      ]), "TILTVAL");

    this.setOutput(true, "Number");
    this.setColour(230);
    this.setTooltip("Returns a predefined constant value for WeDo 1.0 Tilt Sensor values.");
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

Blockly.Blocks['wedo1_tilt'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 inp %2 tilt value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 40
    });

    this.setTooltip("Get Tilt Value of Input Port (0=Flat, 1=fwd, 2=left, 3=right, 4=back)");
  }
};

Blockly.Blocks['wedo1_tiltraw'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 inp %2 tilt raw val",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 40
    });

    this.setTooltip("Get Tilt Raw Value of Input Port");
  }
};

Blockly.Blocks['wedo1_distance'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 inp %2 distance value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 40
    });

    this.setTooltip("Get Distance Value of Input Port");
  }
};

Blockly.Blocks['wedo1_distanceraw'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 inp %2 distance raw value",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
      ],
      "inputsInline": true,
      "output": "Number",
      "colour": 40
    });

    this.setTooltip("Get Distance Raw Value of Input Port");
  }
};

Blockly.Blocks['wedo1_motor'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 motor %2 speed %3",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown },
        { "type": "input_value", "name": "PORT", "check": "Number" },
        {
          "type": "input_value",
          "name": "SPEED",
          "check": "Number",
          "shadow": {
            "type": "math_number",
            "fields": { "NUM": 100 }
          }
        }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 40,
     });

    this.setTooltip("Speed must be from -100 to 100, 0=Stop");
  }
};

Blockly.Blocks['wedo1_motorstop'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 stop motors",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getWedo1Dropdown }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 40,
     });

    this.setTooltip("Stops all motors on the selected device");
  }
};

Blockly.Blocks['vll_senddata'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 VLL send data %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getVLLDropdown },
        { "type": "input_value", "name": "DATA", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 50,
     });

    this.setTooltip("Send data via VLL serial connection DTR pin");
  }
};
Blockly.Blocks['vll_preamblems'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 VLL set preamble (ms) %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getVLLDropdown },
        { "type": "input_value", "name": "MS", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 50,
     });

    this.setTooltip("Set the preamble duration");
  }
};
Blockly.Blocks['vll_unitms'] = {
  init: function() {
    this.jsonInit({
      "message0": "%1 VLL set unit (ms) %2",
      "args0": [
        { "type": "field_dropdown", "name": "DEVICE", "options": getVLLDropdown },
        { "type": "input_value", "name": "MS", "check": "Number" }
      ],
      "inputsInline": true,
      "previousStatement": null,
      "nextStatement": null,
      "colour": 50,
     });

    this.setTooltip("Set the unit duration for VLL min pulse width");
  }
};

//  LOOP WHILE / UNTIL WITH YIELD (for cooperative multitasking)
Blockly.Blocks['loop_forever'] = {
  init: function() {
    this.appendValueInput("COND")
      .setCheck("Boolean")
      .appendField("loop")
      .appendField(new Blockly.FieldDropdown([
          ["while", "WHILE"],
          ["until", "UNTIL"]
      ]), 'MODE');
    this.appendStatementInput("DO")
      .setCheck(null);

    //this.setInputsInline(true);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(180);
    this.setTooltip("Repeat while/until the condition is met with an implicit yield at each iteration.");
  }
};

// YIELD CONTROL (for cooperative multitasking)
Blockly.Blocks['yield'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("yield");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(180);
    this.setTooltip("Yield control to allow other tasks and the UI to run.");
  }
};


// ---------------- TASK BLOCKS ----------------

// Utility: dynamic dropdown with fallback
function taskDropdown() {
  const list = window.TaskRegistry;
  return list.length ? list.map(t => [t, t]) : [["<no tasks>", "__none__"]];
}

// TASK DEFINITION
Blockly.Blocks['task_definition'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldTextInput("Task1"), "TASK")
      .appendField("do");

    this.appendStatementInput("DO")
      .setCheck(null);

    this.setColour(290);

    // FIX: Store the actual initial name, not a hardcoded one
    this.oldTaskName = this.getFieldValue("TASK");
  },

  onchange: function(event) {
    if (!event || event.type !== Blockly.Events.BLOCK_CHANGE) return;
    if (event.blockId !== this.id) return;
    if (event.name !== "TASK") return;

    const oldName = this.oldTaskName;
    const newName = this.getFieldValue("TASK");

    if (oldName === newName) return;

    // --- 1. Prevent duplicate names ---
    if (window.TaskRegistry.includes(newName)) {
      this.setFieldValue(oldName, "TASK");
      return;
    }

    // --- 2. Update registry ---
    const idx = window.TaskRegistry.indexOf(oldName);
    if (idx !== -1) {
      window.TaskRegistry[idx] = newName;
    } else {
      window.TaskRegistry.push(newName);
    }

    // --- 3. Update other blocks referencing this task ---
    const blocks = workspace.getAllBlocks(false);
    for (const block of blocks) {
      if (block.type === "task_definition" || block.type === "task_loop_definition") {
        continue;
      }

      const field = block.getField("TASK");
      if (field && field.getValue() === oldName) {
        field.getOptions(false);
        field.setValue(newName);
      }
    }

    this.oldTaskName = newName;
  }
  
};

// START TASK
Blockly.Blocks['task_start'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("start task")
      .appendField(new Blockly.FieldDropdown(taskDropdown), "TASK");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
  }
};

// STOP TASK
Blockly.Blocks['task_stop'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("stop task")
      .appendField(new Blockly.FieldDropdown(taskDropdown), "TASK");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
  }
};

// TASK IS RUNNING
Blockly.Blocks['task_is_running'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(taskDropdown), "TASK")
      .appendField("is running");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};

// TASK IS DONE
Blockly.Blocks['task_is_done'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(taskDropdown), "TASK")
      .appendField("is done");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};

// TASK HAS ERROR
Blockly.Blocks['task_has_error'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task")
      .appendField(new Blockly.FieldDropdown(taskDropdown), "TASK")
      .appendField("has error");

    this.setOutput(true, "Boolean");
    this.setColour(290);
  }
};

// STOP ALL TASKS
Blockly.Blocks['task_stop_all'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("stop all tasks");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
    this.setTooltip("Stops all running tasks");
  }
};

// TASK LOOP DEFINITION
Blockly.Blocks['task_loop_definition'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("task loop")
      .appendField(new Blockly.FieldTextInput("Task1"), "TASK")
      .appendField("do");

    this.appendStatementInput("DO")
      .setCheck(null);

    this.setColour(290);

    // Store initial name
    this.oldTaskName = "Task1";
  },

  onchange: function(event) {
    if (!event || event.type !== Blockly.Events.BLOCK_CHANGE) return;
    if (event.blockId !== this.id) return;
    if (event.name !== "TASK") return;

    const oldName = this.oldTaskName;
    const newName = this.getFieldValue("TASK");

    if (oldName === newName) return;

    // --- 1. Prevent duplicate names ---
    if (window.TaskRegistry.includes(newName)) {
      this.setFieldValue(oldName, "TASK");
      return;
    }

    // --- 2. Update registry ---
    const idx = window.TaskRegistry.indexOf(oldName);
    if (idx !== -1) {
      window.TaskRegistry[idx] = newName;
    } else {
      window.TaskRegistry.push(newName);
    }

    // --- 3. Refresh ALL dropdowns BEFORE updating references ---
    const blocks = workspace.getAllBlocks(false);

    // --- 4. Update other blocks referencing this task ---
    for (const block of blocks) {
      // Skip task definition blocks
      if (block.type === "task_definition" || block.type === "task_loop_definition") {
        continue;
      }

      const field = block.getField("TASK");
      if (field && field.getValue() === oldName) {
        field.getOptions(false);   // refresh dropdown options
        field.setValue(newName);   // safe now
      }
    }


    this.oldTaskName = newName;
  }

};

// TASK SLEEP
Blockly.Blocks['task_sleep'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("sleep")
      .appendField(new Blockly.FieldNumber(100, 0), "MS")
      .appendField("ms");

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(290);
    this.setTooltip("Pause this task for a number of milliseconds without blocking.");
  }
};

Blockly.Blocks['display_value'] = {
  init: function() {
    // 1. Create a simple label
    const displayField = new Blockly.FieldLabel("?", "blockly-watch-display");
    
    this.appendDummyInput()
        .appendField("display")
        .appendField(displayField, "DISPLAY_FIELD")
        .appendField("←");

    // 3. Keep it inline for the single-row look
    this.appendValueInput("VALUE").setCheck(null);
    this.setInputsInline(true);
    
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour("#191970");
  }
};

Blockly.defineBlocksWithJsonArray([{
  "type": "interactive_value",
  "message0": "Interactive %1",
  "args0": [
    { "type": "field_label", "name": "VALUE_LABEL", "text": "" }
  ],
  "inputsInline": true,
  "output": null,
  "colour": 180,
  "mutator": "interactive_value_mutator",
  "tooltip": "A live-editable value that updates during program execution.",
  "helpUrl": ""
}]);


Blockly.defineBlocksWithJsonArray([{
  "type": "interactive_value_mutator_container",
  "message0": "Mode %1",
  "args0": [
    {
      "type": "field_dropdown",
      "name": "MODE",
      "options": [
        ["Number", "NUMBER"],
        ["Text", "TEXT"],
        ["Boolean", "BOOLEAN"],
        ["Dropdown", "DROPDOWN"]
      ]
    }
  ],
  "colour": 180
}]);

Blockly.defineBlocksWithJsonArray([{
  "type": "interactive_slider",
  "message0": "Slider",
  "inputsInline": true,
  "output": "Number",
  "colour": 180,
  "mutator": "interactive_slider_mutator",
  "tooltip": "Interactive slider",
  "helpUrl": ""
}]);

Blockly.defineBlocksWithJsonArray([{
  "type": "interactive_slider_mutator_container",
  "message0": "Min %1",
  "args0": [
    { "type": "field_number", "name": "MIN", "value": 0 }
  ],
  "message1": "Max %1",
  "args1": [
    { "type": "field_number", "name": "MAX", "value": 100 }
  ],
  "message2": "Step %1",
  "args2": [
    { "type": "field_number", "name": "STEP", "value": 1 }
  ],
  "colour": 200
}]);


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
