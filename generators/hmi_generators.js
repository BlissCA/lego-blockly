/* global Blockly */
const javascriptGenerator = Blockly.JavaScript;

//
// BUTTON STATE
//
javascriptGenerator.forBlock["hmi_button_state"] = function (block) {
  const tag = block.getFieldValue("TAG");
  return [`window.hmi.button["${tag}"] === true`, javascriptGenerator.ORDER_ATOMIC];
};

//
// INDICATOR
//
javascriptGenerator.forBlock["hmi_indicator"] = function (block) {
  const tag = block.getFieldValue("TAG");
  return `window.hmi.indicator["${tag}"] = true;\n`;
};

//
// SLIDER
//
javascriptGenerator.forBlock["hmi_slider"] = function (block) {
  const tag = block.getFieldValue("TAG");
  return [`window.hmi.slider["${tag}"]`, javascriptGenerator.ORDER_ATOMIC];
};

//
// DISPLAY
//
javascriptGenerator.forBlock["hmi_display"] = function (block) {
  const tag = block.getFieldValue("TAG");
  const text = javascriptGenerator.valueToCode(block, "TEXT", javascriptGenerator.ORDER_NONE) || '""';
  return `window.hmi.display["${tag}"] = ${text};\n`;
};