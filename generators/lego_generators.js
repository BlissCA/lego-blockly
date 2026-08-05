const javascriptGenerator = Blockly.JavaScript;

javascriptGenerator.addReservedWords("shouldStop");

function sanitizeCustomName(name) {
  return name
    .trim()
    .replace(/\s+/g, "_")      // replace spaces with _
    .replace(/[^A-Za-z0-9_]/g, "") // remove invalid characters
    .replace(/^[0-9]/, "_$&"); // prevent starting with a number
}

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

javascriptGenerator.forBlock["lego_inp_count"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `deviceManager.getDeviceByName("${dev}").getCountOn(${port})`,
    javascriptGenerator.ORDER_NONE
  ];
};

// ---------------- Lego Interface B Output Port Letters A to H = 1 to 8 ----------------
javascriptGenerator.forBlock["Legob_outportalpha"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};


// ---------------- OUTPUT BLOCKS ----------------

javascriptGenerator.forBlock["lego_out"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const method  = block.getFieldValue("CMD");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.${method}(${port});
}
`;
};


function legoCmd(block, method) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.${method}(${port});
}
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

javascriptGenerator.forBlock["lego_out_offall"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outOffAll();
}
`;
};

javascriptGenerator.forBlock["lego_out_pow"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outPow(${port}, ${pwr});
}
`;
};

javascriptGenerator.forBlock["lego_out_onfor"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const time = javascriptGenerator.valueToCode(block, "TIME", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outOnFor(${port}, ${time});
}
`;
};

javascriptGenerator.forBlock["lego_out_resetrot"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setRot(${port}, ${count});
}
`;
};


javascriptGenerator.forBlock["lego_inp_count_reset"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setCountOn(${port}, ${count});
}
`;
};

javascriptGenerator.forBlock["lego_wait_until"] = function (block) {
  const cond = javascriptGenerator.valueToCode(block, "COND", javascriptGenerator.ORDER_NONE) || "false";

  return `
while (!(${cond})) {
  shouldStop();
  await new Promise(r => setTimeout(r, 10));
}
`;
};

javascriptGenerator.forBlock["lego_wait_time"] = function (block) {
  const secs = javascriptGenerator.valueToCode(block, "SECS", javascriptGenerator.ORDER_NONE) || "0";

  return `
shouldStop();
await new Promise(r => setTimeout(r, ${secs} * 1000));
`;
};

javascriptGenerator.forBlock["lego_print_value"] = function (block) {
  const value = javascriptGenerator.valueToCode(block, "VALUE", javascriptGenerator.ORDER_NONE) || '""';

  return `
shouldStop();
logStatus(String(${value}));
`;
};

javascriptGenerator.forBlock["ons_rising"] = function(block) {
  const bool = javascriptGenerator.valueToCode(block, "BOOL", javascriptGenerator.ORDER_NONE) || "false";
  const id = block.id;
  return [`ONS("${id}", ${bool})`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["ons_falling"] = function(block) {
  const bool = javascriptGenerator.valueToCode(block, "BOOL", javascriptGenerator.ORDER_NONE) || "false";
  const id = block.id;
  return [`ONSF("${id}", ${bool})`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["val_changed"] = function(block) {
  const value = javascriptGenerator.valueToCode(block, "VALUE", javascriptGenerator.ORDER_NONE) || "false";
  const id = block.id;
  return [`ONCHG("${id}", ${value})`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["lego_multi_out"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const method  = block.getFieldValue("CMD");

  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.${method}(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_on"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutOn(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_off"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutOff(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_float"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutFloat(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_Rev"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutRev(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_L"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutL(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_out_R"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  let mask = 0;

  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutR(0x${mask.toString(16)});
}
`;
};

javascriptGenerator.forBlock["lego_multi_pow"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const pwr = javascriptGenerator.valueToCode(block, "PWR", javascriptGenerator.ORDER_NONE) || "0";

  let mask = 0;
  for (let p = 1; p <= 8; p++) {
    if (block.getFieldValue("P" + p) === "TRUE") {
      mask |= (1 << (p - 1));
    }
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.multiOutPower(${pwr}, 0x${mask.toString(16)});
}
`;
};

// ---------------- TIMER GENERATORS ----------------

javascriptGenerator.forBlock['after_time_do'] = function(block) {
  const time = javascriptGenerator.valueToCode(block, 'TIME', javascriptGenerator.ORDER_ATOMIC) || '0';
  const branch = javascriptGenerator.statementToCode(block, 'DO');

  return `
{
  shouldStop();
  TimerScheduler.schedule(${time}, async () => {
    shouldStop();
    ${branch}
  });
}
`;
};

javascriptGenerator.forBlock['after_named_time_do'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  const time = javascriptGenerator.valueToCode(block, 'TIME', javascriptGenerator.ORDER_ATOMIC) || '0';
  const branch = javascriptGenerator.statementToCode(block, 'DO');

  return `
{
  shouldStop();
  NamedEventTimer.start("${name}", ${time}, async () => {
    shouldStop();
    ${branch}
  });
}
`;
};

javascriptGenerator.forBlock['cancel_named_timer'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  return `
{
  shouldStop();
  NamedEventTimer.cancel("${name}");
}
`;
};

javascriptGenerator.forBlock['named_timer_done'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  return [`NamedEventTimer.isDone("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_running'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  return [`NamedEventTimer.isRunning("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_elapsed'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  return [`NamedEventTimer.elapsed("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_remaining'] = function(block) {
  const name = sanitizeCustomName(block.getFieldValue('TIMER_NAME'));
  return [`NamedEventTimer.remaining("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

// ---------------- RCX DEVICE GENERATORS ----------------

// ---------------- Lego RCX Output Port Letters A, B, C = 1, 2, 4 ----------------
javascriptGenerator.forBlock["Rcx_MotPort"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["Rcx_InpPort"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('INPPORT');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["rcx_mot_on"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).on();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_off"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).off();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_float"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).float();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_flip"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).flip();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_f"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).f();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_r"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).r();
}
`;
};

javascriptGenerator.forBlock["rcx_mot_pow"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.mot(${ports}).pow(${pwr});
}
`;
};

javascriptGenerator.forBlock["rcx_snd"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const sound = javascriptGenerator.valueToCode(block, "SOUND", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.snd(${sound});
}
`;
};

javascriptGenerator.forBlock["rcx_msg"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const msg = javascriptGenerator.valueToCode(block, "MSG", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.msg(${msg});
}
`;
};

javascriptGenerator.forBlock["rcx_prog"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const prog = javascriptGenerator.valueToCode(block, "PROG", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.prg(${prog});
}
`;
};

javascriptGenerator.forBlock["rcx_starttask"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const task = javascriptGenerator.valueToCode(block, "TASK", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.start(${task});
}
`;
};

javascriptGenerator.forBlock["rcx_stoptask"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const task = javascriptGenerator.valueToCode(block, "TASK", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.stop(${task});
}
`;
};

javascriptGenerator.forBlock["rcx_stopall"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
 
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.stop(-1);
}
`;
};

javascriptGenerator.forBlock["rcx_pwroff"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
 
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.pwroff();
}
`;
};

javascriptGenerator.forBlock["rcx_alive"] = function (block) {
  const dev = block.getFieldValue("DEVICE");

  return [
    `await deviceManager.getDeviceByName("${dev}").alive()`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["rcx_getval"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const source = block.getFieldValue("SOURCE");
  const arg  = block.getFieldValue("ARG");

  return [
    `await deviceManager.getDeviceByName("${dev}").getval(${source}, ${arg})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["rcx_getinpval"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getval(9, ${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["rcx_sensortype"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const type  = block.getFieldValue("TYPE");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.sensor(${port}).type(${type});
}
`;
};

javascriptGenerator.forBlock["rcx_sensormode"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const mode  = block.getFieldValue("MODE");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.sensor(${port}).mode(${mode});
}
`;
};

javascriptGenerator.forBlock["rcx_sensorclear"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.sensor(${port}).clear();
}
`;
};


// ---------------- NXT DEVICE GENERATORS ----------------

// ---------------- Lego NXT Output Port Letters A, B, C = 0, 1, 2 ----------------
javascriptGenerator.forBlock["Nxt_MotPort"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

// ---------------- Lego NXT Input Port 1, 2, 3, 4 = 0, 1, 2, 3 ----------------
javascriptGenerator.forBlock["Nxt_InpPort"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('INPPORT');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["nxt_mot_pow"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ports = javascriptGenerator.valueToCode(block, "PORTS", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";
  const mode = javascriptGenerator.valueToCode(block, "MODE",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setOutputState(${ports}, ${pwr}, ${mode}, 0x00, 0x00, 0x20, 0);
}
`;
};

javascriptGenerator.forBlock["nxt_playtone"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const freq = javascriptGenerator.valueToCode(block, "FREQ", javascriptGenerator.ORDER_NONE) || "0";
  const duration = javascriptGenerator.valueToCode(block, "DURATION", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.playTone(${freq}, ${duration});
}
`;
};


javascriptGenerator.forBlock['logic_is_between'] = function(block, generator) {
  const A = generator.valueToCode(block, 'A', javascriptGenerator.ORDER_NONE) || '0';
  const X = generator.valueToCode(block, 'X', javascriptGenerator.ORDER_NONE) || '0';
  const B = generator.valueToCode(block, 'B', javascriptGenerator.ORDER_NONE) || '0';

  const op1 = block.getFieldValue('OP1'); // LEQ or LT
  const op2 = block.getFieldValue('OP2'); // LEQ or LT

  const jsOp1 = (op1 === 'LEQ') ? '<=' : '<';
  const jsOp2 = (op2 === 'LEQ') ? '<=' : '<';

  const code =
    `((${A} <= ${B}) ? ` +
      `(${A} ${jsOp1} ${X} && ${X} ${jsOp2} ${B})` +
      ` : ` +
      `(${X} >= ${A} || ${X} <= ${B}))`;

  return [code, javascriptGenerator.ORDER_LOGICAL_OR];
};

// ---------------- LOOP WHILE/UNTIL WITH YIELD GENERATORS ----------------
javascriptGenerator.forBlock['loop_forever'] = function(block) {
  const cond = javascriptGenerator.valueToCode(block, "COND", javascriptGenerator.ORDER_NONE) || "false";
  const mode = block.getFieldValue("MODE"); // WHILE or UNTIL
  const finalCond = (mode === "WHILE") ? `!(${cond})` : cond;
  const statements = javascriptGenerator.statementToCode(block, 'DO');

  return `
while (!(${finalCond})) {
  if (shouldStop()) return;
  ${statements}
  await new Promise(r => setTimeout(r, 0));
}
`;
};

// ---------------- YIELD GENERATOR ----------------
javascriptGenerator.forBlock['yield'] = function(block) {
  return `await new Promise(r => setTimeout(r, 0));\n`;
};



// ---------------- NAMED TASK GENERATORS ----------------
javascriptGenerator.forBlock['task_definition'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  const statements = javascriptGenerator.statementToCode(block, 'DO');

  const funcName = `__task_${taskName}`;

  return `
async function ${funcName}() {
  try {
    NamedTaskState["${taskName}"] = {
      running: true,
      done: false,
      cancelled: false,
      error: null
    };

    while (!TaskShouldStop("${taskName}")) {
      ${statements}
      break;
    }

    if (!NamedTaskState["${taskName}"].cancelled && !window.stopRequested) {
      NamedTaskState["${taskName}"].done = true;
    }
  } catch (e) {
    if (e && e.message === "Program stopped") {
      NamedTaskState["${taskName}"].cancelled = true;
    } else {
      console.error("Task error in ${taskName}:", e);
      NamedTaskState["${taskName}"].error = e;
    }
  } finally {
    NamedTaskState["${taskName}"].running = false;
  }
}
`;
};

javascriptGenerator.forBlock['task_start'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  return `NamedTask.start("${taskName}", __task_${taskName});\n`;
};


javascriptGenerator.forBlock['task_stop'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  return `NamedTask.cancel("${taskName}");\n`;
};

javascriptGenerator.forBlock['task_is_running'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  return [`NamedTask.isRunning("${taskName}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['task_is_done'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  return [`NamedTask.isDone("${taskName}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['task_has_error'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  return [`NamedTask.hasError("${taskName}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['task_stop_all'] = function(block) {
  return `window.NamedTask.stopAll();\n`;
};

javascriptGenerator.forBlock['task_loop_definition'] = function(block) {
  const rawTaskName = block.getFieldValue('TASK');
  const taskName = sanitizeCustomName(rawTaskName);
  const statements = javascriptGenerator.statementToCode(block, 'DO');

  const funcName = `__task_${taskName}`;

  return `
async function ${funcName}() {
  try {
    NamedTaskState["${taskName}"] = {
      running: true,
      done: false,
      cancelled: false,
      error: null
    };

    while (!TaskShouldStop("${taskName}")) {
      if (shouldStop()) return;
      ${statements}
      await new Promise(r => setTimeout(r, 0));
    }

    if (!NamedTaskState["${taskName}"].cancelled && !window.stopRequested) {
      NamedTaskState["${taskName}"].done = true;
    }
  } catch (e) {
    if (e && e.message === "Program stopped") {
      NamedTaskState["${taskName}"].cancelled = true;
    } else {
      console.error("Task error in ${taskName}:", e);
      NamedTaskState["${taskName}"].error = e;
    }
  } finally {
    NamedTaskState["${taskName}"].running = false;
  }
}
`;
};

// ---------------- SLEEP GENERATOR ----------------
javascriptGenerator.forBlock['task_sleep'] = function(block) {
  const ms = block.getFieldValue('MS');
  return `
await new Promise(resolve => setTimeout(resolve, ${ms}));
`;
};


// ---------------- LEGO INTERFACE A DEVICE GENERATORS ------------------

// ---------------- Lego Interface A Combo Port Letters A to C = 0 to 2 ----------------
javascriptGenerator.forBlock["Legoa_comboalpha"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

// ---------------- Lego Interface A Output Port Numbers 0, 1, 2, 3, 4, 5 = 0, 1, 2, 3, 4, 5 ----------------
javascriptGenerator.forBlock["Legoa_outportnum"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('NUM');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

// ---------------- Lego Interface A Input Port Numbers 6, 7 = 6, 7 ----------------
javascriptGenerator.forBlock["Legoa_inputnum"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('NUM');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

// ---------------- Lego Interface A Direction Numbers L, R = 0, 1 ----------------
javascriptGenerator.forBlock["Legoa_dir"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('NUM');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};


javascriptGenerator.forBlock["legoa_inp_on"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").inputOn(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["legoa_inp_val"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").inputVal(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["legoa_out"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const method  = block.getFieldValue("CMD");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.${method}(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_out_on"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outOn(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_out_off"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outOff(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_out_offall"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.portsOff();
}
`;
};

javascriptGenerator.forBlock["legoa_out_pwm"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.pwm(${port},${pwr});
}
`;
};

javascriptGenerator.forBlock["legoa_combo"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const method = block.getFieldValue("CMD");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.${method}(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_combo_l"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.comboL(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_combo_r"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.comboR(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_combo_off"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.comboOff(${port});
}
`;
};

javascriptGenerator.forBlock["legoa_combo_pwml"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.comboPwmL(${port},${pwr});
}
`;
};

javascriptGenerator.forBlock["legoa_combo_pwmr"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.comboPwmR(${port},${pwr});
}
`;
};


// ------------------ LEGO INTERFACE A V2 GENERATORS ----------------

javascriptGenerator.forBlock["legoa2_inp_on"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").inputOn(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["legoa2_inp_rot"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getRot(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["legoa2_out_resetrot"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setRot(${port}, ${count});
}
`;
};

javascriptGenerator.forBlock["legoa2_inp_count"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getCountOn(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["legoa2_inp_count_reset"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setCountOn(${port}, ${count});
}
`;
};

javascriptGenerator.forBlock["legoa2_out"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const cmd  = block.getFieldValue("CMD");
  const pwr = (cmd === "ON") ? "255" : "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outPwm(${port}, ${pwr});
}
`;
};

javascriptGenerator.forBlock["legoa2_out_offall"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.portsOff();
}
`;
};

javascriptGenerator.forBlock["legoa2_out_pwm"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outPwm(${port},${pwr});
}
`;
};

javascriptGenerator.forBlock["legoa2_combo_pwm"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";
  const dir  = javascriptGenerator.valueToCode(block, "DIR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.outCombo(${port},${pwr}, ${dir});
}
`;
};

// ---------------- PF IR GENERATORS ----------------

javascriptGenerator.forBlock["Legopf_channel"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('CHANNEL');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["Legopf_output"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('OUTPUT');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["Legopf_pwm"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('PWM');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["legopf_single"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const channel = javascriptGenerator.valueToCode(block, "CHANNEL", javascriptGenerator.ORDER_NONE) || "0";
  const output = javascriptGenerator.valueToCode(block, "OUTPUT", javascriptGenerator.ORDER_NONE) || "0";
  const pwm = javascriptGenerator.valueToCode(block, "PWM", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.pf_Single(${channel},${output}, ${pwm});
}
`;
};

javascriptGenerator.forBlock["legopf_combo"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const channel = javascriptGenerator.valueToCode(block, "CHANNEL", javascriptGenerator.ORDER_NONE) || "0";
  const pwm_b = javascriptGenerator.valueToCode(block, "PWM_B", javascriptGenerator.ORDER_NONE) || "0";
  const pwm_r = javascriptGenerator.valueToCode(block, "PWM_R", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.pf_Combo(${channel},${pwm_b}, ${pwm_r});
}
`;
};

// ---------------- LEGO WeDo 1.0 GENERATORS ----------------

javascriptGenerator.forBlock["wedo1_portinp"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["wedo1_motport"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["wedo1_tiltval"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('TILTVAL');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["wedo1_tilt"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getTilt(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo1_tiltraw"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getTiltRaw(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo1_distance"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getDistance(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo1_distanceraw"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";

  return [
    `await deviceManager.getDeviceByName("${dev}").getDistanceRaw(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo1_motor"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "0";
  const speed  = javascriptGenerator.valueToCode(block, "SPEED",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motor(${port},${speed});
}
`;
};

javascriptGenerator.forBlock["wedo1_motorstop"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.stopMotor();
}
`;
};

// ------------------ LEGO VLL Serial GENERATORS ----------------
javascriptGenerator.forBlock["vll_senddata"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const data = javascriptGenerator.valueToCode(block, "DATA", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.sendVLL(parseInt(${data}, 10));
}
`;
};

javascriptGenerator.forBlock["vll_preamblems"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ms = javascriptGenerator.valueToCode(block, "MS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  dev.preambleMs = ${ms};
}
`;
};

javascriptGenerator.forBlock["vll_unitms"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const ms = javascriptGenerator.valueToCode(block, "MS", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  dev.unitMs = ${ms};
}
`;
};

// ---------------- LEGO POWER FUNCTION 2 (LPF2) GENERATORS ------------------

// ---------------- LPF2 Ports ----------------
javascriptGenerator.forBlock["lpf2_ports"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LPF2PORTS');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [`"${code}"`, Blockly.JavaScript.ORDER_ATOMIC];

};
javascriptGenerator.forBlock["lpf2_endstate"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LPF2ENDSTATE');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};
javascriptGenerator.forBlock["lpf2_axis"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LPF2AXIS');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["lpf2_get_distance"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';

  return [
    `await deviceManager.getDeviceByName("${dev}").getDistance(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lpf2_get_color"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';

  return [
    `await deviceManager.getDeviceByName("${dev}").getColor(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lpf2_get_tilt"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const axis = javascriptGenerator.valueToCode(block, "AXIS", javascriptGenerator.ORDER_NONE) || "0";
  return [
    `(await deviceManager.getDeviceByName("${dev}").getTilt(${port}))[${axis}]`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lpf2_get_rot"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';

  return [
    `await deviceManager.getDeviceByName("${dev}").getRot(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["lpf2_reset_rot"] = function (block) {
  const dev   = block.getFieldValue("DEVICE");
  const port  = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const count = javascriptGenerator.valueToCode(block, "COUNT", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.resetPosition(${port}, ${count});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_power"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorPower(${port},${pwr});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_stop"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const brake  = javascriptGenerator.valueToCode(block, "BRAKE",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorStop(${port},${brake});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_speed"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const speed = javascriptGenerator.valueToCode(block, "SPEED", javascriptGenerator.ORDER_NONE) || "50";
  const maxPwr = javascriptGenerator.valueToCode(block, "MAXPWR", javascriptGenerator.ORDER_NONE) || "100";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorSpeed(${port},${speed},${maxPwr});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_angle"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const angle = javascriptGenerator.valueToCode(block, "ANGLE", javascriptGenerator.ORDER_NONE) || "360";
  const speed = javascriptGenerator.valueToCode(block, "SPEED", javascriptGenerator.ORDER_NONE) || "50";
  const endState = javascriptGenerator.valueToCode(block, "ENDSTATE", javascriptGenerator.ORDER_NONE) || "127";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorAngle(${port},${angle},${speed},${endState});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_goto"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const pos  = javascriptGenerator.valueToCode(block, "POS",  javascriptGenerator.ORDER_NONE) || "0";
  const speed = javascriptGenerator.valueToCode(block, "SPEED", javascriptGenerator.ORDER_NONE) || "50";
  const endState = javascriptGenerator.valueToCode(block, "ENDSTATE", javascriptGenerator.ORDER_NONE) || "127";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorGoto(${port},${pos},${speed},${endState});
}
`;
};

javascriptGenerator.forBlock["lpf2_mot_time"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || '"A"';
  const time = javascriptGenerator.valueToCode(block, "TIME", javascriptGenerator.ORDER_NONE) || "1000";
  const speed = javascriptGenerator.valueToCode(block, "SPEED", javascriptGenerator.ORDER_NONE) || "50";
  const endState = javascriptGenerator.valueToCode(block, "ENDSTATE", javascriptGenerator.ORDER_NONE) || "127";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorTime(${port},${time},${speed},${endState});
}
`;
};


// ---------------- LEGO WeDo 2.0 GENERATORS ------------------

// ---------------- WeDo 2.0 Ports ----------------
javascriptGenerator.forBlock["wedo2_ports"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('WEDO2PORTS');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [`"${code}"`, Blockly.JavaScript.ORDER_ATOMIC];

};

javascriptGenerator.forBlock["wedo2_get_distance"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "1";

  return [
    `await deviceManager.getDeviceByName("${dev}").getDistance(${port})`, 
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo2_get_tilt"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "1";
  const axis = block.getFieldValue("AXIS") || "x";  // <-- IMPORTANT: read field directly

  return [
    `(await deviceManager.getDeviceByName("${dev}").getTilt(${port})).${axis}`,
    javascriptGenerator.ORDER_NONE
  ];
};


javascriptGenerator.forBlock["wedo2_isButtonPressed"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  return [
    `await deviceManager.getDeviceByName("${dev}").isButtonPressed()`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["wedo2_mot_power"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "1";
  const pwr  = javascriptGenerator.valueToCode(block, "PWR",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorPower(${port},${pwr});
}
`;
};

javascriptGenerator.forBlock["wedo2_mot_stop"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "1";
  const brake  = javascriptGenerator.valueToCode(block, "BRAKE",  javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorStop(${port},${brake});
}
`;
};

javascriptGenerator.forBlock["wedo2_mot_time"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const port = javascriptGenerator.valueToCode(block, "PORT", javascriptGenerator.ORDER_NONE) || "1";
  const time = javascriptGenerator.valueToCode(block, "TIME", javascriptGenerator.ORDER_NONE) || "1000";
  const power = javascriptGenerator.valueToCode(block, "POWER", javascriptGenerator.ORDER_NONE) || "50";
  const brake = javascriptGenerator.valueToCode(block, "BRAKE", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.motorTime(${port},${time},${power},${brake});
}
`;
};

javascriptGenerator.forBlock["wedo2_led"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const color = javascriptGenerator.valueToCode(block, "COLOR", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.ledRGB(${color});
}
`;
};


// ---------------- LEGO ToyPad Generators ----------------

javascriptGenerator.forBlock["tpad_region"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('TPADREGION');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["tpad_regionled"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('TPADREGIONLED');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};

javascriptGenerator.forBlock["tpad_get_taghex"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "1";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "1";

  return [
    `(await deviceManager.getDeviceByName("${dev}").getTagHex(${region}))`,
    javascriptGenerator.ORDER_NONE
  ];
};

javascriptGenerator.forBlock["tpad_set_led"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  const colorR = javascriptGenerator.valueToCode(block, "ColorR", javascriptGenerator.ORDER_NONE) || "0";
  const colorG = javascriptGenerator.valueToCode(block, "ColorG", javascriptGenerator.ORDER_NONE) || "0";
  const colorB = javascriptGenerator.valueToCode(block, "ColorB", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setLED(${region}, ${colorR}, ${colorG}, ${colorB});
}
`;
};

javascriptGenerator.forBlock["tpad_set_led_cp"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  // Get the hex string from the color field (e.g. "#ff0000")
  const hexColor = block.getFieldValue("COLOR");

  // Helper to convert hex to RGB
  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setLED(${region}, ${r}, ${g}, ${b});
}
`;
};

javascriptGenerator.forBlock["tpad_set_led_sliders"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  
  const val = block.getFieldValue("RGB_VALUE");
  
  let r, g, b;
  if (typeof val === 'string') {
    // Standard case: "255,255,255"
    const parts = val.split(',');
    r = parts[0]; g = parts[1]; b = parts[2];
  } else if (val && typeof val === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    r = val.r; g = val.g; b = val.b;
  } else {
    r = 255; g = 255; b = 255;
  }
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setLED(${region}, ${r}, ${g}, ${b});
}
`;
};

javascriptGenerator.forBlock["tpad_set_leds_sliders"] = function (block) {
  const dev = block.getFieldValue("DEVICE");
  
  const val_c = block.getFieldValue("RGB_VALUE_C");
  const val_l = block.getFieldValue("RGB_VALUE_L");
  const val_r = block.getFieldValue("RGB_VALUE_R");
  
  let rc, gc, bc, rl, gl, bl, rr, gr, br;
  if (typeof val_c === 'string') {
    // Standard case: "255,255,255"
    const parts = val_c.split(',');
    rc = parts[0]; gc = parts[1]; bc = parts[2];
  } else if (val_c && typeof val_c === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rc = val_c.r; gc = val_c.g; bc = val_c.b;
  } else {
    rc = 255; gc = 0; bc = 0;
  }

  if (typeof val_l === 'string') {
    // Standard case: "255,255,255"
    const parts = val_l.split(',');
    rl = parts[0]; gl = parts[1]; bl = parts[2];
  } else if (val_l && typeof val_l === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rl = val_l.r; gl = val_l.g; bl = val_l.b;
  } else {
    rl = 255; gl = 0; bl = 0;
  }

  if (typeof val_r === 'string') {
    // Standard case: "255,255,255"
    const parts = val_r.split(',');
    rr = parts[0]; gr = parts[1]; br = parts[2];
  } else if (val_r && typeof val_r === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rr = val_r.r; gr = val_r.g; br = val_r.b;
  } else {
    rr = 255; gr = 0; br = 0;
  }

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setLEDS(${rc}, ${gc}, ${bc}, ${rl}, ${gl}, ${bl}, ${rr}, ${gr}, ${br});
}
`;
};

javascriptGenerator.forBlock["tpad_led_off"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.setLED(${region}, 0, 0, 0);
}
`;
};

javascriptGenerator.forBlock["tpad_flash_led"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  const colorR = javascriptGenerator.valueToCode(block, "ColorR", javascriptGenerator.ORDER_NONE) || "0";
  const colorG = javascriptGenerator.valueToCode(block, "ColorG", javascriptGenerator.ORDER_NONE) || "0";
  const colorB = javascriptGenerator.valueToCode(block, "ColorB", javascriptGenerator.ORDER_NONE) || "0";
  const t1 = javascriptGenerator.valueToCode(block, "T1", javascriptGenerator.ORDER_NONE) || "10";
  const t2 = javascriptGenerator.valueToCode(block, "T2", javascriptGenerator.ORDER_NONE) || "10";
  const cnt = javascriptGenerator.valueToCode(block, "CNT", javascriptGenerator.ORDER_NONE) || "255";
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.flashLED(${region}, ${colorR}, ${colorG}, ${colorB}, ${t1}, ${t2}, ${cnt});
}
`;
};

javascriptGenerator.forBlock["tpad_flash_led_sliders"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  const t1 = javascriptGenerator.valueToCode(block, "T1", javascriptGenerator.ORDER_NONE) || "10";
  const t2 = javascriptGenerator.valueToCode(block, "T2", javascriptGenerator.ORDER_NONE) || "10";
  const cnt = javascriptGenerator.valueToCode(block, "CNT", javascriptGenerator.ORDER_NONE) || "255";
  
  const val = block.getFieldValue("RGB_VALUE");
  
  let r, g, b;
  if (typeof val === 'string') {
    // Standard case: "255,255,255"
    const parts = val.split(',');
    r = parts[0]; g = parts[1]; b = parts[2];
  } else if (val && typeof val === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    r = val.r; g = val.g; b = val.b;
  } else {
    r = 255; g = 255; b = 255;
  }
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.flashLED(${region}, ${r}, ${g}, ${b}, ${t1}, ${t2}, ${cnt});
}
`;
};

javascriptGenerator.forBlock["tpad_flash_leds_sliders"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");

  const t1_c = javascriptGenerator.valueToCode(block, "T1_C", javascriptGenerator.ORDER_NONE) || "10";
  const t2_c = javascriptGenerator.valueToCode(block, "T2_C", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_c = javascriptGenerator.valueToCode(block, "CNT_C", javascriptGenerator.ORDER_NONE) || "255";  
  const val_c = block.getFieldValue("RGB_VALUE_C");

  const t1_l = javascriptGenerator.valueToCode(block, "T1_L", javascriptGenerator.ORDER_NONE) || "10";
  const t2_l = javascriptGenerator.valueToCode(block, "T2_L", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_l = javascriptGenerator.valueToCode(block, "CNT_L", javascriptGenerator.ORDER_NONE) || "255";
  const val_l = block.getFieldValue("RGB_VALUE_L");

  const t1_r = javascriptGenerator.valueToCode(block, "T1_R", javascriptGenerator.ORDER_NONE) || "10";
  const t2_r = javascriptGenerator.valueToCode(block, "T2_R", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_r = javascriptGenerator.valueToCode(block, "CNT_R", javascriptGenerator.ORDER_NONE) || "255";
  const val_r = block.getFieldValue("RGB_VALUE_R");
  
  let rc, gc, bc;
  if (typeof val_c === 'string') {
    // Standard case: "255,255,255"
    const parts = val_c.split(',');
    rc = parts[0]; gc = parts[1]; bc = parts[2];
  } else if (val_c && typeof val_c === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rc = val_c.r; gc = val_c.g; bc = val_c.b;
  } else {
    rc = 255; gc = 255; bc = 255;
  }

  
  let rl, gl, bl;
  if (typeof val_l === 'string') {
    // Standard case: "255,255,255"
    const parts = val_l.split(',');
    rl = parts[0]; gl = parts[1]; bl = parts[2];
  } else if (val_l && typeof val_l === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rl = val_l.r; gl = val_l.g; bl = val_l.b;
  } else {
    rl = 255; gl = 255; bl = 255;
  }

    let rr, gr, br;
  if (typeof val_r === 'string') {
    // Standard case: "255,255,255"
    const parts = val_r.split(',');
    rr = parts[0]; gr = parts[1]; br = parts[2];
  } else if (val_r && typeof val_r === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rr = val_r.r; gr = val_r.g; br = val_r.b;
  } else {
    rr = 255; gr = 255; br = 255;
  }
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.flashLEDS(${rc}, ${gc}, ${bc}, ${t1_l}, ${t2_l}, ${cnt_l}, ${rl}, ${gl}, ${bl}, ${t1_l}, ${t2_l}, ${cnt_l}, ${rr}, ${gr}, ${br}, ${t1_r}, ${t2_r}, ${cnt_r});
}
`;
};

javascriptGenerator.forBlock["tpad_fade_led"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  const colorR = javascriptGenerator.valueToCode(block, "ColorR", javascriptGenerator.ORDER_NONE) || "0";
  const colorG = javascriptGenerator.valueToCode(block, "ColorG", javascriptGenerator.ORDER_NONE) || "0";
  const colorB = javascriptGenerator.valueToCode(block, "ColorB", javascriptGenerator.ORDER_NONE) || "0";
  const t1 = javascriptGenerator.valueToCode(block, "T1", javascriptGenerator.ORDER_NONE) || "10";
  const cnt = javascriptGenerator.valueToCode(block, "CNT", javascriptGenerator.ORDER_NONE) || "0";
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.fadeLED(${region}, ${colorR}, ${colorG}, ${colorB}, ${t1}, ${cnt});
}
`;
};

javascriptGenerator.forBlock["tpad_fade_led_sliders"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");
  //const region = block.getFieldValue("REGION") || "0";  // <-- IMPORTANT: read field directly
  const region = javascriptGenerator.valueToCode(block, "REGION", javascriptGenerator.ORDER_NONE) || "0";
  const t1 = javascriptGenerator.valueToCode(block, "T1", javascriptGenerator.ORDER_NONE) || "10";
  const cnt = javascriptGenerator.valueToCode(block, "CNT", javascriptGenerator.ORDER_NONE) || "0";
  
  const val = block.getFieldValue("RGB_VALUE");
  
  let r, g, b;
  if (typeof val === 'string') {
    // Standard case: "255,255,255"
    const parts = val.split(',');
    r = parts[0]; g = parts[1]; b = parts[2];
  } else if (val && typeof val === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    r = val.r; g = val.g; b = val.b;
  } else {
    r = 255; g = 255; b = 255;
  }
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.fadeLED(${region}, ${r}, ${g}, ${b}, ${t1}, ${cnt});
}
`;
};


javascriptGenerator.forBlock["tpad_fade_leds_sliders"] = function (block) {
  const dev  = block.getFieldValue("DEVICE");

  const t1_c = javascriptGenerator.valueToCode(block, "T1_C", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_c = javascriptGenerator.valueToCode(block, "CNT_C", javascriptGenerator.ORDER_NONE) || "255";  
  const val_c = block.getFieldValue("RGB_VALUE_C");

  const t1_l = javascriptGenerator.valueToCode(block, "T1_L", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_l = javascriptGenerator.valueToCode(block, "CNT_L", javascriptGenerator.ORDER_NONE) || "255";
  const val_l = block.getFieldValue("RGB_VALUE_L");

  const t1_r = javascriptGenerator.valueToCode(block, "T1_R", javascriptGenerator.ORDER_NONE) || "10";
  const cnt_r = javascriptGenerator.valueToCode(block, "CNT_R", javascriptGenerator.ORDER_NONE) || "255";
  const val_r = block.getFieldValue("RGB_VALUE_R");
  
  let rc, gc, bc;
  if (typeof val_c === 'string') {
    // Standard case: "255,255,255"
    const parts = val_c.split(',');
    rc = parts[0]; gc = parts[1]; bc = parts[2];
  } else if (val_c && typeof val_c === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rc = val_c.r; gc = val_c.g; bc = val_c.b;
  } else {
    rc = 255; gc = 255; bc = 255;
  }

  
  let rl, gl, bl;
  if (typeof val_l === 'string') {
    // Standard case: "255,255,255"
    const parts = val_l.split(',');
    rl = parts[0]; gl = parts[1]; bl = parts[2];
  } else if (val_l && typeof val_l === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rl = val_l.r; gl = val_l.g; bl = val_l.b;
  } else {
    rl = 255; gl = 255; bl = 255;
  }

    let rr, gr, br;
  if (typeof val_r === 'string') {
    // Standard case: "255,255,255"
    const parts = val_r.split(',');
    rr = parts[0]; gr = parts[1]; br = parts[2];
  } else if (val_r && typeof val_r === 'object') {
    // Blockly v12 State object case: {r: 255, g: 255, b: 255}
    rr = val_r.r; gr = val_r.g; br = val_r.b;
  } else {
    rr = 255; gr = 255; br = 255;
  }
  
  return `
{
  shouldStop();
  const dev = deviceManager.getDeviceByName("${dev}");
  if (!dev) throw new Error("Device lost");
  await dev.fadeLEDS(${rc}, ${gc}, ${bc}, ${t1_c}, ${cnt_c}, ${rl}, ${gl}, ${bl}, ${t1_l}, ${cnt_l}, ${rr}, ${gr}, ${br}, ${t1_r}, ${cnt_r});
}
`;
};



javascriptGenerator.forBlock['lego_button_event'] = function(block) {
  const branch = Blockly.JavaScript.statementToCode(block, 'DO');
  const id = block.id;

  return `
    if (window.BlocklyButtonEvents["${id}"]) {
      window.BlocklyButtonEvents["${id}"] = false;
      ${branch}
    }
  `;
};

javascript.javascriptGenerator.forBlock['display_value'] = function(block, generator) {
  const value = generator.valueToCode(block, 'VALUE', javascript.Order.ATOMIC) || 'null';
  // This generates a function call that your interpreter will handle
  return `updateBlockDisplay('${block.id}', ${value});\n`;
};

// ---------------- COUNTER GENERATORS ----------------
javascriptGenerator.forBlock['counter_block'] = function(block) {
  const rawName = block.getFieldValue('NAME');
  const name = sanitizeCustomName(rawName);
  const dir = javascriptGenerator.valueToCode(block, 'DIR', javascriptGenerator.ORDER_NONE) || "'UP'";
  const preset =
    javascriptGenerator.valueToCode(block, 'PRESET', javascriptGenerator.ORDER_NONE) || '0';
  const trigger =
    javascriptGenerator.valueToCode(block, 'TRIGGER', javascriptGenerator.ORDER_NONE) || 'false';
  
  const autoReset = block.autoReset ? "true" : "false";

  const code = `__counter_step("${name}", ${dir}, ${preset}, ${trigger}, "${block.id}", ${autoReset})`;
  return [code, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator.forBlock['counter_reset'] = function(block) {
  const rawName = block.getFieldValue('NAME');
  const name = sanitizeCustomName(rawName);
  const code = `__counter_reset("${name}");\n`;
  return code;
};

javascriptGenerator.forBlock['counter_set'] = function(block) {
  const rawName = block.getFieldValue('NAME');
  const name = sanitizeCustomName(rawName);
  const value =
    javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_NONE) || '0';
  const code = `__counter_set("${name}", ${value});\n`;
  return code;
};

javascriptGenerator.forBlock['counter_get'] = function(block) {
  const rawName = block.getFieldValue('NAME');
  const name = sanitizeCustomName(rawName);
  const code = `__counter_get("${name}")`;
  return [code, javascriptGenerator.ORDER_FUNCTION_CALL];
};

// ---------------- COUNTER DIRECTION ----------------
javascriptGenerator.forBlock["counter_dir"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('COUNTDIR');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return ["'" + code + "'", javascriptGenerator.ORDER_ATOMIC];
};


javascriptGenerator.forBlock['interactive_value'] = function(block) {
  return [`__interactive_value("${block.id}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

javascriptGenerator.forBlock['interactive_slider'] = function(block) {
  return [`__interactive_slider("${block.id}")`, javascriptGenerator.ORDER_FUNCTION_CALL];
};



// ---------------- Bitwise Generators ----------------
//
javascriptGenerator.forBlock['bitwise_operation'] = function(block) {
  const op = block.getFieldValue('OP');

  let order;
  switch (op) {
    case '&': order = javascriptGenerator.ORDER_BITWISE_AND; break;
    case '|': order = javascriptGenerator.ORDER_BITWISE_OR; break;
    case '^': order = javascriptGenerator.ORDER_BITWISE_XOR; break;
    case '<<':
    case '>>': order = javascriptGenerator.ORDER_BITWISE_SHIFT; break;
    default: order = javascriptGenerator.ORDER_NONE;
  }

  const A = javascriptGenerator.valueToCode(block, 'A', order) || '0';
  const B = javascriptGenerator.valueToCode(block, 'B', order) || '0';

  return [`(${A} ${op} ${B})`, order];
};

javascriptGenerator.forBlock['bitwise_not'] = function(block) {
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_NOT) || '0';
  return [`(~${A})`, javascriptGenerator.ORDER_BITWISE_NOT];
};

javascriptGenerator.forBlock['bitwise_testbit'] = function(block) {
  const bit = javascriptGenerator.valueToCode(block, 'BIT', javascriptGenerator.ORDER_NONE) || '0';
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_SHIFT) || '0';
  return [`((((${A}) >> (${bit})) & 1) === 1)`, javascriptGenerator.ORDER_LOGICAL_AND];
};

javascriptGenerator.forBlock['bitwise_setbit'] = function(block) {
  const bit = javascriptGenerator.valueToCode(block, 'BIT', javascriptGenerator.ORDER_NONE) || '0';
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_OR) || '0';
  return [`(${A} | (1 << ${bit}))`, javascriptGenerator.ORDER_BITWISE_OR];
};

javascriptGenerator.forBlock['bitwise_clearbit'] = function(block) {
  const bit = javascriptGenerator.valueToCode(block, 'BIT', javascriptGenerator.ORDER_NONE) || '0';
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_AND) || '0';
  return [`(${A} & ~(1 << ${bit}))`, javascriptGenerator.ORDER_BITWISE_AND];
};

javascriptGenerator.forBlock['bitwise_togglebit'] = function(block) {
  const bit = javascriptGenerator.valueToCode(block, 'BIT', javascriptGenerator.ORDER_NONE) || '0';
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_XOR) || '0';
  return [`(${A} ^ (1 << ${bit}))`, javascriptGenerator.ORDER_BITWISE_XOR];
};

javascriptGenerator.forBlock['bitwise_mask'] = function(block) {
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_AND) || '0';
  const mask = javascriptGenerator.valueToCode(block, 'MASK', javascriptGenerator.ORDER_BITWISE_AND) || '0';
  return [`(${A} & ${mask})`, javascriptGenerator.ORDER_BITWISE_AND];
};

javascriptGenerator.forBlock['bitwise_rotate'] = function(block) {
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_SHIFT) || '0';
  const bits = javascriptGenerator.valueToCode(block, 'BITS', javascriptGenerator.ORDER_NONE) || '0';
  const dir = block.getFieldValue('DIR');

  if (dir === "LEFT") {
    return [
      `((((${A}) << ${bits}) | ((${A}) >>> (32 - ${bits}))) >>> 0)`,
      javascriptGenerator.ORDER_BITWISE_SHIFT
    ];
  } else {
    return [
      `((((${A}) >>> ${bits}) | ((${A}) << (32 - ${bits}))) >>> 0)`,
      javascriptGenerator.ORDER_BITWISE_SHIFT
    ];
  }
};

javascriptGenerator.forBlock['bitwise_extract'] = function(block) {
  const start = javascriptGenerator.valueToCode(block, 'START', javascriptGenerator.ORDER_NONE) || '0';
  const end = javascriptGenerator.valueToCode(block, 'END', javascriptGenerator.ORDER_NONE) || '0';
  const A = javascriptGenerator.valueToCode(block, 'A', javascriptGenerator.ORDER_BITWISE_SHIFT) || '0';

  return [
    `(((${A}) >> ${start}) & ((1 << (${end} - ${start} + 1)) - 1))`,
    javascriptGenerator.ORDER_BITWISE_SHIFT
  ];
};


//-------------- Format number to Decimal, Hexadecimal, Binary ----------------
javascriptGenerator.forBlock['format_number'] = function(block) {
  const value = javascriptGenerator.valueToCode(block, 'VALUE', javascriptGenerator.ORDER_NONE) || '0';
  const radix = block.getFieldValue('RADIX');

  let code;
  switch (radix) {
    case "HEX":
      code = `("0x" + (${value}).toString(16))`;
      break;
    case "BIN":
      code = `("0b" + (${value}).toString(2))`;
      break;
    default:
      code = `(${value}).toString()`;
  }

  return [code, javascriptGenerator.ORDER_ATOMIC];
};


/* NOT USING MQTT FOR NOW SINCE IT REQUIRES WSS SECURE CONNECTION WHICH IS HARD TO SETUP LOCALLY. MAY RECONSIDER IN THE FUTURE IF THERE'S A GOOD USE CASE FOR IT.
// ---------------- MQTT GENERATORS ----------------
javascriptGenerator.forBlock["mqtt_config"] = function (block) {
  const host = block.getFieldValue("HOST");
  const port = block.getFieldValue("PORT");
  const tls = block.getFieldValue("TLS") === "TRUE";
  const username = block.getFieldValue("USERNAME");
  const password = block.getFieldValue("PASSWORD");

  const code = `
try {
  await mqttClient.connect({
    host: "${host}",
    port: ${port},
    useTls: ${tls},
    username: "${username}",
    password: "${password}"
  });
} catch (e) {
  logStatus("MQTT connection failed: " + e);
}
`;
  return code;
};

javascriptGenerator.forBlock["mqtt_publish"] = function (block) {
  const topic = block.getFieldValue("TOPIC");
  const msg = javascriptGenerator.valueToCode(block, "MSG", javascriptGenerator.ORDER_NONE) || '""';

  const code = `
await mqttClient.publish("${topic}", String(${msg}));
`;
  return code;
};

javascriptGenerator.forBlock["mqtt_subscribe"] = function (block) {
  const topic = block.getFieldValue("TOPIC");

  const code = `
await mqttClient.subscribe("${topic}");
`;
  return code;
};

javascriptGenerator.forBlock["mqtt_on_message"] = function (block) {
  const topic = block.getFieldValue("TOPIC");
  const statements = javascriptGenerator.statementToCode(block, "DO");

  const code = `
mqttClient.onMessage("${topic}", async (topic, payload) => {
  const MQTT_TOPIC = topic;
  const MQTT_PAYLOAD = payload;
  ${statements}
});
`;
  return code;
};
*/