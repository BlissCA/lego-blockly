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

javascriptGenerator.forBlock['cancel_named_timer'] = function(block) {
  const name = block.getFieldValue('TIMER_NAME');
  return `
{
  shouldStop();
  NamedEventTimer.cancel("${name}");
}
`;
};

javascriptGenerator.forBlock['named_timer_done'] = function(block) {
  const name = block.getFieldValue('TIMER_NAME');
  return [`NamedEventTimer.isDone("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_running'] = function(block) {
  const name = block.getFieldValue('TIMER_NAME');
  return [`NamedEventTimer.isRunning("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_elapsed'] = function(block) {
  const name = block.getFieldValue('TIMER_NAME');
  return [`NamedEventTimer.elapsed("${name}")`, javascriptGenerator.ORDER_ATOMIC];
};

javascriptGenerator.forBlock['named_timer_remaining'] = function(block) {
  const name = block.getFieldValue('TIMER_NAME');
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