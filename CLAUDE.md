# LEGO Blockly — notes for Claude

Browser app (Chrome) that programs LEGO hardware from Blockly blocks. No build step: plain ES modules, Blockly loaded as a global.
Hardware is reached through Web Bluetooth / Web Serial / WebUSB / WebSocket. Claude cannot reach any hardware: the owner tests in the browser and pastes console output.

## Layout
- `index.html`: connect dropdown (`<option value="SPIKE">…`), run / stop buttons.
- `main.js`: imports every driver and block file, the connect `switch` (`case "SPIKE": … connectLegoSpike3()`), run-program wrapper, STOP logic.
- `device/deviceManager.js`: `DeviceManager` (names like `Prefix1`, `getDeviceByName`, `connectXxx()` per driver, wake lock).
- `device/DeviceXxx.js`: one driver class per hardware family.
- `blocks/lego_blocks.js`, `generators/lego_generators.js`, `toolbox/toolbox.js`: block definitions, JavaScript generators, toolbox.
- `service-worker.js` (asset list + network-first), `version.js` (bump `LEGO_BLOCKLY_VERSION` to force a cache refresh).
- Docs: `README.md`, `LEGO_BLOCKLY_CONNECTIONS.md` (neither mentions SPIKE yet).

## Adding or extending a driver (checklist)
1. `device/DeviceXxx.js`: `export class Xxx { constructor(name, manager) … async connect() … async disconnect() }`. Use the manager hooks the other drivers use: `manager._allocateName(prefix)`, `updateDeviceEntry`, `appendLog`, `_removeDevice`, and `handleDeviceLost` on unexpected disconnect.
2. `deviceManager.js`: import the class, add `async connectXxx()` (copy `connectLegoLPF2`: try/catch, `_addDevice`, `_freeName` on failure).
3. `main.js`: `import "./device/DeviceXxx.js"`, a `case` in the connect switch. `index.html`: an `<option>`.
4. STOP: `main.js` has an if/else chain over device methods (`portsOff`, `stopMotor`, `stopAllMotors`…). A new driver must be reachable from it (SPIKE and LPF2 use `stopAllMotors`).
5. `service-worker.js`: add the file to `ASSETS`.
6. Blocks (below), then docs.

## Blocks, generators, toolbox conventions
- One dropdown helper per family at top level of `lego_blocks.js`, filtering `window.deviceManager.devices` by `d.constructor.name` (see `getLPF2Dropdown`, `getSpike3Dropdown`). Empty list returns a `['No …','NONE']` placeholder.
- Block JSON arrays live inside the `window.addEventListener("load", …)` handler; first argument of every block is the `DEVICE` dropdown (`"options": getXxxDropdown`). Prefix block types per family (`lpf2_*`, `spike_*`).
- Port / mode / axis choices are small constant blocks (`lpf2_ports`, `spike_stopmode`…) used as toolbox shadows so users can replace them with variables. Every value input gets a default shadow in `toolbox.js` (math_number, text, or a constant block). Toolbox categories are nested: family → Input / Output / Message / Misc.
- Generators (`javascriptGenerator.forBlock["type"]`): statements wrap in `{ shouldStop(); const dev = deviceManager.getDeviceByName("…"); if (!dev) throw new Error("Device lost"); await dev.method(...); }`. Reporters return `[ "(await deviceManager.getDeviceByName(\"…\").getX(port))", ORDER ]`. Always provide fallbacks for empty inputs.
- Generated code runs in an async wrapper in `main.js` with `deviceManager`, `getDeviceByName`, `shouldStop`. STOP sets `window.stopRequested`; any long wait inside a driver must poll it and return.

## File format
- `blocks/lego_blocks.js`, `generators/lego_generators.js`, `toolbox/toolbox.js`, `main.js` use CRLF line endings; `device/DeviceLegoSpike3.js` and `SpikeMotorHelper.js` use LF. Check with `git ls-files --eol` before patching and keep each file's style.
- Git stores LF; on a machine without `core.autocrlf`, `git diff` looks like every line changed (use `--ignore-cr-at-eol`).

## SPIKE hub (88016 Robot Inventor on SPIKE firmware, Hub OS 1.8.x) — `DeviceLegoSpike3.js`
- BLE service `fd02`; framing is COBS-style with XOR 3 (LEGO "spike-prime-docs"), CRC32 over data padded to a multiple of 4.
- Sensor values (motors, colour, distance, force, tilt, battery) come from the hub's DeviceNotification stream, no program needed. The colour message is 10 bytes on this firmware (the docs say 9).
- Programs: StartFileUpload must be `name + 0x00 + slot + crc` (NOT a padded 32-byte name, or the hub silently stores it wrongly). The file name is `program.py`.
- Motor/matrix/beep output needs the resident MicroPython helper (`SpikeMotorHelper.js`, uploaded on demand with the "Upload Motor Helper" block, default slot 19). It talks over the message tunnel (`hub.config["module_tunnel"]`, undocumented by LEGO). Replies look like `id,ok` / `id,done,X,(0,)` / `id,err,…`. Bump `SPIKE_MOTOR_HELPER_VERSION` and the `VER` in the Python when the helper changes; users must re-upload it.
- Verified on hardware (owner's tests): connect, notifications, upload + start, tunnel both ways, motor blocks, LED matrix, beep, hub light, set hub name, start/stop slot programs, upload program, message send/read/wait, most input blocks. Not yet verified: force sensor (owner has none), colour 'reflection' (an undocumented extra byte in the colour message), watchdog.

## Blockly 12.4.1 gotchas (loaded from unpkg in index.html)
- The core build has NO `text_multiline` block and no `Blockly.FieldMultilineInput`. Using `text_multiline` in the toolbox crashes every flyout. Multi-line text comes from the plugin `@blockly/field-multilineinput@6.0.2` (script tag in index.html) through the custom `spike_code` block (`getMultilineFieldClass()` in lego_blocks.js, with a safe single-line fallback).
- `Blockly.registry.getClass()` logs a console warning for anything not registered: check `hasItem()` first.
- Never put a block type in the toolbox before checking it is defined: one unknown type empties the whole toolbox.
