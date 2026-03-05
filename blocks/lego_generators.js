Blockly.JavaScript['lego_connect'] = function() {
  return "await lego.connect();\n";
};

Blockly.JavaScript['lego_disconnect'] = function() {
  return "await lego.disconnect();\n";
};

Blockly.JavaScript['lego_set_output'] = function(block) {
  const port = block.getFieldValue('PORT');
  const power = Blockly.JavaScript.valueToCode(block, 'POWER', Blockly.JavaScript.ORDER_ATOMIC) || 0;
  return `await lego.setOutput(${port}, ${power});\n`;
};

Blockly.JavaScript['lego_read_packet'] = function() {
  return ["lego.latestPacket()", Blockly.JavaScript.ORDER_FUNCTION_CALL];
};
