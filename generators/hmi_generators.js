import { javascriptGenerator } from "blockly/javascript";

//
// BUTTON
//
javascriptGenerator.forBlock["hmi_button"] = function (block) {
  const id = block.id;
  return [`window.hmi.button["${id}"] === true`, javascriptGenerator.ORDER_ATOMIC];
};

//
// INDICATOR
//
javascriptGenerator.forBlock["hmi_indicator"] = function (block) {
  const id = block.id;
  return [`window.hmi.indicator["${id}"]`, javascriptGenerator.ORDER_ATOMIC];
};

//
// SLIDER
//
javascriptGenerator.forBlock["hmi_slider"] = function (block) {
  const id = block.id;
  return [`window.hmi.slider["${id}"]`, javascriptGenerator.ORDER_ATOMIC];
};

//
// DISPLAY
//
javascriptGenerator.forBlock["hmi_display"] = function (block) {
  const text = javascriptGenerator.valueToCode(block, "TEXT", javascriptGenerator.ORDER_NONE) || '""';
  const id = block.id;
  return `window.hmi.display["${id}"] = ${text};\n`;
};
