Blockly.Blocks['lego_connect'] = {
  init: function() {
    this.appendDummyInput().appendField("connect to LEGO Interface B");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(60);
  }
};

Blockly.Blocks['lego_disconnect'] = {
  init: function() {
    this.appendDummyInput().appendField("disconnect");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(60);
  }
};

Blockly.Blocks['lego_set_output'] = {
  init: function() {
    this.appendDummyInput()
        .appendField("set output")
        .appendField(new Blockly.FieldDropdown([["A","0"],["B","1"]]), "PORT")
        .appendField("power");
    this.appendValueInput("POWER").setCheck("Number");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(60);
  }
};

Blockly.Blocks['lego_read_packet'] = {
  init: function() {
    this.appendDummyInput().appendField("latest packet");
    this.setOutput(true, "String");
    this.setColour(60);
  }
};
