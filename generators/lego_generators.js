import { javascriptGenerator } from "https://unpkg.com/blockly@12.4.1/javascript.js?module";

// INPUT BLOCKS
javascriptGenerator.forBlock["lego_inp_on"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return [`getDeviceByName("${dev}").inputOn(${port})`, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock["lego_inp_val"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return [`getDeviceByName("${dev}").inputVal(${port})`, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock["lego_inp_tempf"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return [`getDeviceByName("${dev}").inputTempF(${port})`, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock["lego_inp_tempc"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return [`getDeviceByName("${dev}").inputTempC(${port})`, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock["lego_inp_rot"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return [`getDeviceByName("${dev}").getRot(${port})`, javascriptGenerator.ORDER_NONE];
};

// OUTPUT BLOCKS
function legoCmd(block, method) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  return `await getDeviceByName("${dev}").${method}(${port});\n`;
}

javascriptGenerator.forBlock["lego_out_on"] = b => legoCmd(b, "outOn");
javascriptGenerator.forBlock["lego_out_onl"] = b => legoCmd(b, "outOnL");
javascriptGenerator.forBlock["lego_out_onr"] = b => legoCmd(b, "outOnR");
javascriptGenerator.forBlock["lego_out_off"] = b => legoCmd(b, "outOff");
javascriptGenerator.forBlock["lego_out_float"] = b => legoCmd(b, "outFloat");
javascriptGenerator.forBlock["lego_out_rev"] = b => legoCmd(b, "outRev");
javascriptGenerator.forBlock["lego_out_l"] = b => legoCmd(b, "outL");
javascriptGenerator.forBlock["lego_out_r"] = b => legoCmd(b, "outR");

javascriptGenerator.forBlock["lego_out_pow"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  const pwr = block.getFieldValue("PWR");
  return `await getDeviceByName("${dev}").outPow(${port}, ${pwr});\n`;
};

javascriptGenerator.forBlock["lego_out_onfor"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const port = block.getFieldValue("PORT");
  const time = block.getFieldValue("TIME");
  return `await getDeviceByName("${dev}").outOnFor(${port}, ${time});\n`;
};