const javascriptGenerator = Blockly.JavaScript;

javascriptGenerator.addReservedWords("shouldStop");

// ---------------- INPUT BLOCKS ----------------

javascriptGenerator.forBlock["lego_inp_on"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").inputOn(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lego_inp_val"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").inputVal(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lego_inp_tempf"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").inputTempF(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lego_inp_tempc"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").inputTempC(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lego_inp_rot"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").getRot(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

// ---------------- OUTPUT BLOCKS ----------------

function legoCmd(block, method) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
if (shouldStop()) return;
await deviceManager.getDeviceByName("${dev}").${method}(${port});
`;
}

javascriptGenerator.forBlock["lego_out_on"]    = b => legoCmd(b, "outOn");
javascriptGenerator.forBlock["lego_out_onl"]   = b => legoCmd(b, "outOnL");
javascriptGenerator.forBlock["lego_out_onr"]   = b => legoCmd(b, "outOnR");
javascriptGenerator.forBlock["lego_out_off"]   = b => legoCmd(b, "outOff");
javascriptGenerator.forBlock["lego_out_float"] = b => legoCmd(b, "outFloat");
javascriptGenerator.forBlock["lego_out_rev"]   = b => legoCmd(b, "outRev");
javascriptGenerator.forBlock["lego_out_l"]     = b => legoCmd(b, "outL");
javascriptGenerator.forBlock["lego_out_r"]     = b => legoCmd(b, "outR");

javascriptGenerator.forBlock["lego_out_pow"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
if (shouldStop()) return;
await deviceManager.getDeviceByName("${dev}").outPow(${port}, ${pwr});
`;
};

javascriptGenerator.forBlock["lego_out_onfor"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const time = javascriptGenerator.valueToCode(block, "TIME", javascriptGenerator.ORDER_NONE) || "0";

  return `
if (shouldStop()) return;
await deviceManager.getDeviceByName("${dev}").outOnFor(${port}, ${time});
`;
};

javascriptGenerator.forBlock["lego_out_resetrot"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
if (shouldStop()) return;
await deviceManager.getDeviceByName("${dev}").setRot(${port}, ${count});
`;
};