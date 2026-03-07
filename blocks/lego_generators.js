import {javascriptGenerator} from 'https://unpkg.com/blockly/javascript.js';

// INPUT BLOCKS

javascriptGenerator.forBlock['lego_inp_on'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const code = `getDeviceByName("${devName}").inputOn(${port})`;
  return [code, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock['lego_inp_val'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const code = `getDeviceByName("${devName}").inputVal(${port})`;
  return [code, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock['lego_inp_tempf'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const code = `getDeviceByName("${devName}").inputTempF(${port})`;
  return [code, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock['lego_inp_tempc'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const code = `getDeviceByName("${devName}").inputTempC(${port})`;
  return [code, javascriptGenerator.ORDER_NONE];
};

javascriptGenerator.forBlock['lego_inp_rot'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const code = `getDeviceByName("${devName}").getRot(${port})`;
  return [code, javascriptGenerator.ORDER_NONE];
};

// OUTPUT BLOCKS

function legoCmd(block, method) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  return `await getDeviceByName("${devName}").${method}(${port});\n`;
}

javascriptGenerator.forBlock['lego_out_on']    = b => legoCmd(b, 'outOn');
javascriptGenerator.forBlock['lego_out_onl']   = b => legoCmd(b, 'outOnL');
javascriptGenerator.forBlock['lego_out_onr']   = b => legoCmd(b, 'outOnR');
javascriptGenerator.forBlock['lego_out_off']   = b => legoCmd(b, 'outOff');
javascriptGenerator.forBlock['lego_out_float'] = b => legoCmd(b, 'outFloat');
javascriptGenerator.forBlock['lego_out_rev']   = b => legoCmd(b, 'outRev');
javascriptGenerator.forBlock['lego_out_l']     = b => legoCmd(b, 'outL');
javascriptGenerator.forBlock['lego_out_r']     = b => legoCmd(b, 'outR');

javascriptGenerator.forBlock['lego_out_pow'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const pwr  = block.getFieldValue('PWR');
  return `await getDeviceByName("${devName}").outPow(${port}, ${pwr});\n`;
};

javascriptGenerator.forBlock['lego_out_onfor'] = function(block) {
  const devName = block.getFieldValue('DEVICE');
  const port = block.getFieldValue('PORT');
  const time = block.getFieldValue('TIME');
  return `await getDeviceByName("${devName}").outOnFor(${port}, ${time});\n`;
};