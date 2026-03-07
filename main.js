// Load Blockly from CDN (ES modules)
import * as Blockly from 'https://unpkg.com/blockly/core.js';
import {javascriptGenerator} from 'https://unpkg.com/blockly/javascript.js';

// Standard blocks (all built-in categories)
import 'https://unpkg.com/blockly/blocks.js';

// Custom LEGO blocks & generators
import './blocks/lego_blocks.js';
import './generators/lego_generators.js';

// Toolbox definition
import toolbox from './toolbox/toolbox.js';

// Your existing WebSerial + device manager
import './device/webserial.js';
import './device/deviceManager.js';

// Helper: log to status pane
function logStatus(msg) {
  const el = document.getElementById('statusLog');
  const time = new Date().toLocaleTimeString();
  el.textContent += `[${time}] ${msg}\n`;
  el.scrollTop = el.scrollHeight;
}

// Helper: expose getDeviceByName globally for generators
window.getDeviceByName = function(name) {
  if (!window.deviceManager) return null;
  return window.deviceManager.devices.find(d => d.name === name) || null;
};

// Helper: refresh devices list in right panel
function refreshDevicesPanel() {
  const listEl = document.getElementById('devicesList');
  const dm = window.deviceManager;
  if (!dm || !dm.devices || dm.devices.length === 0) {
    listEl.textContent = 'No devices connected.';
    return;
  }
  listEl.innerHTML = '';
  dm.devices.forEach(dev => {
    const div = document.createElement('div');
    div.textContent = `${dev.name} – ${dev.status || 'OK'}`;
    listEl.appendChild(div);
  });
}

// Let deviceManager call this when devices change (optional)
window.refreshDevicesPanel = refreshDevicesPanel;
window.logStatus = logStatus;

// Inject Blockly
const workspace = Blockly.inject('blocklyDiv', {
  toolbox,
  renderer: 'geras',
  theme: Blockly.Themes.Classic,
});

// RUN button
document.getElementById('runBtn').onclick = async () => {
  const code = javascriptGenerator.workspaceToCode(workspace);
  console.log('Generated code:\n', code);
  logStatus('Running program...');

  try {
    const asyncWrapper = new Function(`
      return (async () => {
        ${code}
      })();
    `);
    await asyncWrapper();
    logStatus('Program finished.');
  } catch (err) {
    logStatus('Error: ' + err);
    console.error(err);
  }
};

// CONNECT button
document.getElementById('connectBtn').onclick = async () => {
  try {
    await window.deviceManager.connectLegoInterfaceB();
    logStatus('Connected to LEGO Interface B.');
    refreshDevicesPanel();
  } catch (err) {
    logStatus('Connect error: ' + err);
  }
};

// DISCONNECT button
document.getElementById('disconnectBtn').onclick = async () => {
  try {
    await window.deviceManager.disconnectAll();
    logStatus('Disconnected all devices.');
    refreshDevicesPanel();
  } catch (err) {
    logStatus('Disconnect error: ' + err);
  }
};

// SAVE button (export XML)
document.getElementById('saveBtn').onclick = () => {
  const xml = Blockly.Xml.workspaceToDom(workspace);
  const xmlText = Blockly.Xml.domToPrettyText(xml);
  const blob = new Blob([xmlText], {type: 'text/xml'});
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'lego-project.xml';
  a.click();

  URL.revokeObjectURL(url);
  logStatus('Project saved as lego-project.xml');
};

// LOAD button (import XML)
document.getElementById('loadBtn').onclick = () => {
  const input = document.getElementById('fileInput');
  input.value = '';
  input.click();
};

document.getElementById('fileInput').onchange = e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const xml = Blockly.Xml.textToDom(reader.result);
      workspace.clear();
      Blockly.Xml.domToWorkspace(xml, workspace);
      logStatus('Project loaded from XML.');
    } catch (err) {
      logStatus('Load error: ' + err);
    }
  };
  reader.readAsText(file);
};