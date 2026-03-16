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

// ---------------- Lego Interface B Output Port Letters A to H = 1 to 8 ----------------
javascriptGenerator.forBlock["Legob_outportalpha"] = function (block) {
  // Get the numerical value mapped to the selected letter
  var code = block.getFieldValue('LETTER');
  // Order.ATOMIC ensures the value is treated as a single unit in math expressions
  return [code, Blockly.JavaScript.ORDER_ATOMIC];
};


// ---------------- OUTPUT BLOCKS ----------------

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

javascriptGenerator.forBlock["lego_out_float"] = b => legoCmd(b, "outFloat");
javascriptGenerator.forBlock["lego_out_rev"]   = b => legoCmd(b, "outRev");
javascriptGenerator.forBlock["lego_out_l"]     = b => legoCmd(b, "outL");
javascriptGenerator.forBlock["lego_out_r"]     = b => legoCmd(b, "outR");

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

javascriptGenerator.forBlock['timer_after'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  const preset = block.getFieldValue("PRESET");
  const statements = javascriptGenerator.statementToCode(block, "DO");

  return `
{
  shouldStop();
  const t = Timer.get("${name}");
  t.start(${preset});

  if (t.doneOnce()) {
    ${statements}
  }
}
`;
};

javascriptGenerator.forBlock['timer_reset'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  return `
{
  shouldStop();
  Timer.get("${name}").reset();
}
`;
};

javascriptGenerator.forBlock['timer_stop'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  return `
{
  shouldStop();
  Timer.get("${name}").stop();
}
`;
};

javascriptGenerator.forBlock['timer_value'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  return [`Timer.get("${name}").accum`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['timer_done'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  return [`Timer.get("${name}").done`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['timer_set_value'] = function(block) {
  const name = block.getFieldValue("TIMER_NAME");
  const val = javascriptGenerator.valueToCode(block, "VALUE", javascriptGenerator.ORDER_NONE) || "0";

  return `
{
  shouldStop();
  Timer.get("${name}").accum = ${val};
}
`;
};

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
  const name = block.getFieldValue('TIMER_NAME');
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

