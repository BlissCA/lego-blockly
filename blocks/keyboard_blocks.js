// =====================================================================
//  Keyboard key detection for Lego Blockly
//  Load AFTER blockly.min.js and AFTER lego_generators.js (needs Blockly.JavaScript)
//  Provides:
//    - field "field_key_capture"  : click it, press a key / combo, it is recorded
//    - block "keyboard_key"       : [key ...] [is held | was pressed]  -> Boolean
//    - window.KeyboardInput       : runtime used by the generated code
// =====================================================================

// ---------------- Key naming helpers ----------------
const KEY_MODS = ["ctrl", "alt", "shift", "meta"];            // fixed canonical order

const KEY_LABELS = {
  Space: "Space", Enter: "Enter", Escape: "Esc", Tab: "Tab", Backspace: "Backspace", Delete: "Del",
  Insert: "Ins", Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
  ArrowLeft: "Arrow-L", ArrowRight: "Arrow-R", ArrowUp: "Arrow-U", ArrowDown: "Arrow-D",
  Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/",
  NumpadAdd: "Num+", NumpadSubtract: "Num-", NumpadMultiply: "Num*", NumpadDivide: "Num/",
  NumpadDecimal: "Num.", NumpadEnter: "NumEnter",
  ShiftLeft: "Shift (L)", ShiftRight: "Shift (R)", ControlLeft: "Ctrl (L)", ControlRight: "Ctrl (R)",
  AltLeft: "Alt (L)", AltRight: "Alt (R)", MetaLeft: "Win/Cmd (L)", MetaRight: "Win/Cmd (R)",
  CapsLock: "CapsLock", ContextMenu: "Menu", PrintScreen: "PrtSc", ScrollLock: "ScrollLock", Pause: "Pause"
};

function keyCodeLabel(code) {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);            // KeyA -> A
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);          // Digit5 -> 5
  if (/^Numpad[0-9]$/.test(code)) return "Num" + code.slice(6); // Numpad5 -> Num5
  return code;                                                  // F1..F12, etc.
}

function keyIsModifierCode(code) {
  return /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(code);
}

function keyModOfCode(code) {
  if (code.startsWith("Shift")) return "shift";
  if (code.startsWith("Control")) return "ctrl";
  if (code.startsWith("Alt")) return "alt";
  if (code.startsWith("Meta")) return "meta";
  return null;
}

// "ctrl+shift+KeyA" -> {mods:["ctrl","shift"], code:"KeyA"}
function keyParse(value) {
  const parts = String(value || "").split("+").filter(Boolean);
  const code = parts.pop() || "";
  const mods = KEY_MODS.filter(m => parts.includes(m));
  return { mods, code };
}

function keyLabel(value) {
  const { mods, code } = keyParse(value);
  if (!code) return "(click, press a key)";
  const m = mods.map(x => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" }[x]));
  return m.concat(keyCodeLabel(code)).join("+");
}

// ---------------- Runtime ----------------
window.KeyboardInput = (function () {
  const down = new Set();           // physical key codes currently held
  const pressed = new Map();        // combo -> timestamp of a fresh (non-repeat) key press
  const watched = new Map();       // code  -> last time a block asked about it
  const PRESS_TTL_MS = 1000;       // a "was pressed" event expires if nobody asks
  const WATCH_TTL_MS = 2000;       // keys asked about recently get preventDefault (no page scroll, etc.)

  function isTypingTarget(t) {
    return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
  }

  function currentMods(ignoreKind) {
    const mods = [];
    for (const c of down) {
      const k = keyModOfCode(c);
      if (k && k !== ignoreKind && !mods.includes(k)) mods.push(k);
    }
    return KEY_MODS.filter(m => mods.includes(m));
  }

  function comboOfEvent(e) {
    const mods = KEY_MODS.filter(m => e[m + "Key"]);
    return mods.concat(e.code).join("+");
  }

  function sameMods(a, b) {
    return a.length === b.length && a.every((m, i) => m === b[i]);
  }

  function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;
    const wt = watched.get(e.code);
    if (wt && performance.now() - wt < WATCH_TTL_MS) e.preventDefault();
    down.add(e.code);
    if (!e.repeat) pressed.set(comboOfEvent(e), performance.now());
  }

  function onKeyUp(e) {
    down.delete(e.code);
    // Releasing Meta (Win/Cmd) swallows the keyup of the other keys on many systems
    if (e.code.startsWith("Meta")) { for (const c of [...down]) if (!keyIsModifierCode(c)) down.delete(c); }
  }

  function reset() { down.clear(); pressed.clear(); watched.clear(); }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  window.addEventListener("blur", reset);

  return {
    // true while the key (with exactly these modifiers) is held down
    isHeld(value) {
      const { mods, code } = keyParse(value);
      if (!code) return false;
      watched.set(code, performance.now());
      if (!down.has(code)) return false;
      return sameMods(mods, currentMods(keyModOfCode(code)));
    },
    // true ONCE per physical key press (consumed when read)
    wasPressed(value) {
      const { mods, code } = keyParse(value);
      if (!code) return false;
      watched.set(code, performance.now());
      const combo = mods.concat(code).join("+");
      const t = pressed.get(combo);
      if (t === undefined) return false;
      pressed.delete(combo);
      return performance.now() - t < PRESS_TTL_MS;
    },
    reset
  };
})();

// ---------------- Field: click, then press the key ----------------
class FieldKeyCapture extends Blockly.Field {
  static TYPE = "field_key_capture";
  static SERIALIZABLE = true;

  constructor(value) {
    super(value || "Space");
    this.CURSOR = "pointer";
    this.SERIALIZABLE = true;
  }

  static fromJson(options) {
    return new FieldKeyCapture(options["value"]);
  }

  doClassValidator_(newValue) {
    return typeof newValue === "string" && newValue.length ? newValue : null;
  }

  getText_() {
    return keyLabel(this.getValue());
  }

  showEditor_() {
    const div = Blockly.DropDownDiv.getContentDiv();
    div.innerHTML = "";

    const panel = document.createElement("div");
    panel.tabIndex = 0;
    panel.style.cssText =
      "padding:10px;min-width:220px;background:#fff;border-radius:4px;display:flex;flex-direction:column;" +
      "gap:8px;font:12px sans-serif;color:#333;outline:none;";

    const hint = document.createElement("div");
    hint.textContent = "Press a key or combination (e.g. Ctrl+A)";
    const live = document.createElement("div");
    live.style.cssText =
      "height:28px;line-height:28px;text-align:center;border:2px solid #4a90d9;border-radius:4px;" +
      "background:#f4f9ff;font:bold 14px sans-serif;";
    live.textContent = keyLabel(this.getValue());

    // Quick pick for keys that can't be typed here (reserved by the browser) or for touch/mouse users
    const sel = document.createElement("select");
    sel.style.cssText = "font:12px sans-serif;padding:3px;";
    const opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "Or pick a special key...";
    sel.appendChild(opt0);
    const quick = ["Space", "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
      "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
      "F1", "F2", "F3", "F4", "F6", "F7", "F8", "F9", "F10", "F12"];
    quick.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = keyCodeLabel(c);
      sel.appendChild(o);
    });

    const note = document.createElement("div");
    note.style.cssText = "font-size:10px;color:#888;";
    note.textContent = "Some browser shortcuts (Ctrl+W, Ctrl+T, Alt+F4, ...) cannot be intercepted.";

    panel.append(hint, live, sel, note);
    div.appendChild(panel);

    const commit = (val) => {
      this.setValue(val);
      Blockly.DropDownDiv.hideIfOwner(this, true);
    };

    sel.addEventListener("change", () => { if (sel.value) commit(sel.value); });

    // Capture state
    let mainPressed = false;
    let lastModCode = null;
    const heldMods = new Set();

    panel.addEventListener("keydown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (keyIsModifierCode(e.code)) {
        heldMods.add(keyModOfCode(e.code));
        lastModCode = e.code;
        live.textContent = KEY_MODS.filter(m => heldMods.has(m))
          .map(m => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Win" }[m])).join("+") + "+...";
        return;
      }
      mainPressed = true;
      const mods = KEY_MODS.filter(m => e[m + "Key"]);
      commit(mods.concat(e.code).join("+"));
    }, true);

    panel.addEventListener("keyup", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // A modifier pressed and released on its own = the modifier itself is the key
      if (keyIsModifierCode(e.code) && !mainPressed && lastModCode === e.code) {
        commit(e.code);
      }
    }, true);

    Blockly.DropDownDiv.setColour("#ffffff", "#bbb");
    Blockly.DropDownDiv.showPositionedByField(this);
    setTimeout(() => panel.focus(), 0);
  }
}

Blockly.fieldRegistry.register("field_key_capture", FieldKeyCapture);

// ---------------- Block ----------------
Blockly.defineBlocksWithJsonArray([
  {
    "type": "keyboard_key",
    "message0": "key %1 %2",
    "args0": [
      { "type": "field_key_capture", "name": "KEY", "value": "Space" },
      {
        "type": "field_dropdown",
        "name": "MODE",
        "options": [
          ["is held", "HELD"],
          ["was pressed", "PRESSED"]
        ]
      }
    ],
    "inputsInline": true,
    "output": "Boolean",
    "colour": 160,
    "tooltip": "Click the key box, then press a key or combination (Ctrl+A, Arrow-L, PgUp...).\n" +
               "is held: true as long as the key is down.\n" +
               "was pressed: true once per key press (use in a loop with IF)."
  }
]);

// ---------------- Generator ----------------
Blockly.JavaScript.forBlock["keyboard_key"] = function (block) {
  const key = block.getFieldValue("KEY") || "";
  const fn = block.getFieldValue("MODE") === "PRESSED" ? "wasPressed" : "isHeld";
  return [`KeyboardInput.${fn}(${JSON.stringify(key)})`, Blockly.JavaScript.ORDER_FUNCTION_CALL];
};

// ---------------- Toolbox entry (add to "Interactive Control" in toolbox.js) ----------------
//   { "kind": "block", "type": "keyboard_key" },
//
// ---------------- Optional: call KeyboardInput.reset() when the program starts/stops ----------------
