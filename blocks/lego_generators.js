function getDeviceByName(name) {
  return window.deviceManager.devices.find(d => d.name === name);
}

//
// INPUT BLOCKS
//

Blockly.JavaScript['lego_inp_on'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return [
    'getDeviceByName("${devName}").inputOn(${port})',
    Blockly.JavaScript.ORDER_NONE
  ];
};

Blockly.JavaScript['lego_inp_val'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return [
    'getDeviceByName("${devName}").inputVal(${port})',
    Blockly.JavaScript.ORDER_NONE
  ];
};

Blockly.JavaScript['lego_inp_tempf'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return [
    'getDeviceByName("${devName}").inputTempF(${port})',
    Blockly.JavaScript.ORDER_NONE
  ];
};

Blockly.JavaScript['lego_inp_tempc'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return [
    'getDeviceByName("${devName}").inputTempC(${port})',
    Blockly.JavaScript.ORDER_NONE
  ];
};

Blockly.JavaScript['lego_inp_rot'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return [
    'getDeviceByName("${devName}").getRot(${port})',
    Blockly.JavaScript.ORDER_NONE
  ];
};


//
// OUTPUT BLOCKS
//

function legoCmd(block, method) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return `await getDeviceByName("${devName}").${method}(${port});\n`;
}

Blockly.JavaScript['lego_out_on']    = b => legoCmd(b, "outOn");
Blockly.JavaScript['lego_out_onl']   = b => legoCmd(b, "outOnL");
Blockly.JavaScript['lego_out_onr']   = b => legoCmd(b, "outOnR");
Blockly.JavaScript['lego_out_off']   = b => legoCmd(b, "outOff");
Blockly.JavaScript['lego_out_float'] = b => legoCmd(b, "outFloat");
Blockly.JavaScript['lego_out_rev']   = b => legoCmd(b, "outRev");
Blockly.JavaScript['lego_out_l']     = b => legoCmd(b, "outL");
Blockly.JavaScript['lego_out_r']     = b => legoCmd(b, "outR");

Blockly.JavaScript['lego_out_pow'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const pwr  = block.getFieldValue('PWR');
  return `await getDeviceByName("${devName}").outPow(${port}, ${pwr});\n`;
};

Blockly.JavaScript['lego_out_onfor'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const time = block.getFieldValue('TIME');
  return `await getDeviceByName("${devName}").outOnFor(${port}, ${time});\n`;
};