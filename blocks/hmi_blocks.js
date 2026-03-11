/* global Blockly */

//
// HMI BUTTON
//
Blockly.Blocks["hmi_button"] = {
  init: function () {
    const id = this.id;
    window.hmi.button[id] = false;

    this.appendDummyInput()
      .appendField("HMI Button")
      .appendField(
        new Blockly.FieldImage(
          "img/play-button.png",
          60, 30,
          "*",
          function () {
            const block = this.getSourceBlock();   // ⭐ Correct block reference
            const bid = block.id;
            window.hmi.button[bid] = true;
          }
        ),
        "BTN"
      );

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
      .appendField(
        new Blockly.FieldImage("img/led_off.png", 20, 20, "*"),
        "LED"
      );
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

      // ⭐ THIS IS THE IMPORTANT PART
      const block = this.getSourceBlock();
      const id = block.id;
      window.hmi.slider[id] = Number(input.value);
    };

    Blockly.DropDownDiv.getContentDiv().appendChild(input);
    Blockly.DropDownDiv.showPositionedByField(this);
  }
}
Blockly.fieldRegistry.register("field_slider", FieldSlider);

Blockly.Blocks["hmi_slider"] = {
  init: function () {
    const id = this.id;
    window.hmi.slider[id] = 7; // default value

    this.appendDummyInput()
      .appendField("Slider")
      .appendField(new FieldSlider(7, 0, 7), "SLIDER");

    this.setOutput(true, "Number");
    this.setColour(200);
  }
};
//
// HMI DISPLAY
//
Blockly.Blocks["hmi_display"] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck("String")
      .appendField("Display text");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(160);
  }
};