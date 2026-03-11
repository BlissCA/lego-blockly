/* global Blockly */

//
// HMI BUTTON (interactive)
//
Blockly.Blocks["hmi_button"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("HMI Button")
      .appendField(new Blockly.FieldTextInput("Button1"), "TAG")
      .appendField(
        new Blockly.FieldImage(
          "img/play-button.png",
          60, 30,
          "*",
          function () {
            const block = this.getSourceBlock();
            const tag = block.getFieldValue("TAG");
            window.hmi.button[tag] = true;
          }
        ),
        "BTN"
      );

    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
  }
};

//
// HMI BUTTON STATE (Boolean reporter)
//
Blockly.Blocks["hmi_button_state"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("Button")
      .appendField(new Blockly.FieldTextInput("Button1"), "TAG")
      .appendField("pressed?");
    this.setOutput(true, "Boolean");
    this.setColour(20);
  }
};

//
// HMI INDICATOR (LED)
//
Blockly.Blocks["hmi_indicator"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("Indicator")
      .appendField(new Blockly.FieldTextInput("LED1"), "TAG")
      .appendField(
        new Blockly.FieldImage("img/led_off.png", 20, 20, "*"),
        "LED"
      );
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(60);
  }
};

//
// HMI SLIDER
//
class FieldSlider extends Blockly.FieldNumber {
  showEditor_() {
    const input = document.createElement("input");
    input.type = "range";
    input.min = this.min_;
    input.max = this.max_;
    input.value = this.getValue();

    input.oninput = () => {
      this.setValue(input.value);

      const block = this.getSourceBlock();
      const tag = block.getFieldValue("TAG");
      window.hmi.slider[tag] = Number(input.value);
    };

    Blockly.DropDownDiv.getContentDiv().appendChild(input);
    Blockly.DropDownDiv.showPositionedByField(this);
  }
}
Blockly.fieldRegistry.register("field_slider", FieldSlider);

Blockly.Blocks["hmi_slider"] = {
  init: function () {
    this.appendDummyInput()
      .appendField("Slider")
      .appendField(new Blockly.FieldTextInput("Slider1"), "TAG")
      .appendField(new FieldSlider(50, 0, 100), "SLIDER");

    this.setOutput(true, "Number");
    this.setColour(200);

    const tag = this.getFieldValue("TAG");
    window.hmi.slider[tag] = 50;
  }
};

//
// HMI DISPLAY
//
Blockly.Blocks["hmi_display"] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck("String")
      .appendField("Display text to")
      .appendField(new Blockly.FieldTextInput("Display1"), "TAG");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(160);
  }
};
