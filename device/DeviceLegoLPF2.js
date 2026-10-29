// DeviceLegoLPF2.js
// ES-module LEGO LPF2 (WeDo 2.0, Boost, Powered Up, Spike, etc.) driver.
// Standalone class, same architecture style as LegoInterfaceA_v2.

// Port Output Command constants
const MSG_PORT_OUTPUT_COMMAND = 0x81;
const SUBCMD_START_POWER              = 0x01; // raw PWM
const SUBCMD_START_SPEED              = 0x07; // regulated speed
const SUBCMD_START_SPEED_FOR_TIME     = 0x09; // time-based movement
const SUBCMD_START_SPEED_FOR_DEGREES  = 0x0B; // angle-based movement
const SUBCMD_GOTO_ABS_POS             = 0x0D; // absolute position


// LPF2 BLE UUIDs + connection tuning
const LPF2_SERVICE_UUID = "00001623-1212-efde-1623-785feabcd123";
const LPF2_CHAR_UUID    = "00001624-1212-efde-1623-785feabcd123";
const LPF2_CONNECT = {
  attempts: 4,          // full connect sequences before giving up
  retryDelayMs: 1500,   // pause between attempts (lets the BLE stack release the old link)
  settleFirstMs: 2500,  // wait after the 1st gatt.connect() (pairing prompt / service changed)
  settleMs: 800         // wait after later attempts
};
const _sleep = ms => new Promise(r => setTimeout(r, ms));

// Technic Move Hub: minimum notification delta per ioType when a sensor is subscribed on demand.
// A delta of 1 on an IMU reports almost every change and floods the link when the hub is moved.
// These are STARTING VALUES (the real scale of each ioType is not verified): raise them if the link
// still drops while the hub moves, lower them if sensor readings feel too coarse.
const MOVEHUB_MIN_DELTA = {
  57: 10,   // accelerometer was 50
  58: 10,   // gyro was 50
  59: 1,    // position (tilt angles)
  93: 10    // orientation (quaternion, 16-bit) was 300
};

// Sensor reads (getIMU, getTilt, ...): how long to wait for the hub's first value, and what to do
// when it never comes. The read first subscribes, then asks for the value, then re-subscribes.
const LPF2_SENSOR = {
  timeoutMs: 10000,                 // give up after this long (per call)
  firstWaitMs: 800,                 // after subscribing + the first value request, wait this long for a frame
  pollMs: 600,                      // then ask again every pollMs
  throwOnTimeout: true,             // false = log the error in the console and return undefined (callers use a default) instead
  // Technic Move Hub: right after connecting, subscribe to these ports (safe MOVEHUB_MIN_DELTA) so the
  // first read finds a running stream. Every extra stream is extra traffic when the hub moves: keep it small.
  prewarm: true,
  prewarmPorts: { IMU: ["acc", "gyro", "imu"] },
  prewarmMs: 30000,                 // stop trying in the background after this long
  prewarmHelpers: false             // experiment: also stream accelerometer+gyro (made the link drop when moving the hub)
};

// Technic Move Hub: the Control+ app sends two "calibration" frames to the drive channel (port 0x36) right
// after connecting (flags byte 0x10 = INIT, then 0x08 = CALIBRATE; source: maxswinkels/42176-controller).
// They make the STEERING motor (port C) sweep to its end stops. EXPERIMENT: maybe the hub's IMU only wakes up
// after this. Keep false unless the steering can move freely (steering rack mounted, nothing blocking it).
const LPF2_MOVEHUB = {
  lightsOffOnConnect: true,         // switch the 6 lights off after connecting (the hub often leaves some on)
  calibrateOnConnect: false,
  initWaitMs: 800,                  // pause between the INIT and CALIBRATE frames
  port: 0x36                        // drive virtual port (used if the port map has no DRIVEVM)
};

// Brake modes
const BRAKE_FLOAT = 0x00;
const BRAKE_BRAKE = 0x7F;
const BRAKE_HOLD  = 0x7E;

const LPF2_DEBUG = {
  connect: true,   // logs during connect()
  traffic: false,  // logs for every notification/frame/message
  motors: true,    // logs every motor frame sent + hub errors for motor commands (set false when everything works)

  // Device discovery (prints copy/paste profiles to the console)
  autoRelearn: true, // re-learn a cached profile when the hub reports MORE modes than the cached entry has
  relearn: []        // ioTypes to force re-learning even if cached, e.g. [23, 37]  (or true = all)
};

// Button names reported by the Handset (and "GREEN" = hub button on any hub)
const HANDSET_BUTTONS = ["A_PLUS", "A_RED", "A_MINUS", "B_PLUS", "B_RED", "B_MINUS", "GREEN"];

// LWP3 indicator-light color indexes (LED mode 0)
const LPF2_COLORS = {
  OFF: 0, BLACK: 0, PINK: 1, PURPLE: 2, BLUE: 3, LIGHTBLUE: 4, CYAN: 5,
  GREEN: 6, YELLOW: 7, ORANGE: 8, RED: 9, WHITE: 10
};

// Friendly names used when printing new profiles
const IOTYPE_NAMES = {
  1: "Simple Medium Motor", 2: "Train Motor", 5: "Button", 8: "Light",
  20: "Hub Voltage", 21: "Hub Current", 22: "Piezo Tone", 23: "Hub RGB LED",
  34: "WeDo2 Tilt Sensor", 35: "WeDo2 Motion Sensor", 37: "Boost Color & Distance Sensor",
  38: "Boost External Motor", 39: "Boost Internal Motor", 40: "Boost Internal Tilt",
  46: "Technic Large Motor", 47: "Technic XL Motor", 48: "Spike Medium Motor", 49: "Spike Large Motor",
  54: "Hub Gesture", 55: "Handset Buttons", 56: "Handset RSSI",
  57: "Hub Accelerometer", 58: "Hub Gyro", 59: "Hub Tilt Position", 60: "Hub Temperature",
  61: "Spike Color Sensor", 62: "Spike Distance Sensor", 63: "Spike Force Sensor", 64: "Matrix Display",
  65: "Technic Small Angular Motor", 75: "Technic Medium Angular Motor", 76: "Technic Large Angular Motor"
};

function _formatProfileForDictionary(ioType, profile) {
  const j = v => (v === undefined || v === null) ? "null /* MISSING */" : JSON.stringify(v);
  const modes = Object.entries(profile.modes).map(([mode, m]) => `
      ${mode}: {
        name: ${JSON.stringify(m.name ?? `MODE${mode}`)},
        symbol: ${JSON.stringify(m.symbol ?? "")},
        valueFormat: ${j(m.valueFormat)},
        rawRange: ${j(m.rawRange)},
        percentRange: ${j(m.percentRange)},
        siRange: ${j(m.siRange)}
      }`).join(",");

  return `
  ${ioType}: {
    name: ${JSON.stringify(profile.name || "Unknown Device")},
    defaultMode: ${profile.defaultMode ?? 0},
    modes: {${modes}
    }
  },`;
}

// ------------------------------------------------------------
// LPF2 Device Profiles (cached mode info for known ioTypes)
// ------------------------------------------------------------
export const LPF2_DEVICE_PROFILES = {
  39: {
    name: "Boost Internal Motor",
    defaultMode: 2,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: { count: 1, type: "Int8", figures: 1, decimals: 0 },
        rawRange: [-1027080192, 1120403456],
        percentRange: [-1027080192, 1120403456],
        siRange: [-1027080192, 1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: { count: 1, type: "Int8", figures: 4, decimals: 0 },
        rawRange: [-1027080192, 1120403456],
        percentRange: [-1027080192, 1120403456],
        siRange: [-1027080192, 1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: { count: 1, type: "Int32", figures: 4, decimals: 0 },
        rawRange: [-1011613696, 1135869952],
        percentRange: [-1027080192, 1120403456],
        siRange: [-1011613696, 1135869952]
      }
    }
  },
  37: {
    name: "Boost Color & Distance Sensor",
    defaultMode: 0,
    modes: {
      0: {
        name: "COLOR",
        symbol: "IDX",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      1: {
        name: "PROX",
        symbol: "DIS",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      2: {
        name: "COUNT",
        symbol: "CNT",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      3: {
        name: "REFLT",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      4: {
        name: "AMBI",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      5: {
        name: "COL O",
        symbol: "IDX",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      6: {
        name: "RGB I",
        symbol: "RAW",
        valueFormat: {"count":3,"type":"Int16","figures":5,"decimals":0},
        rawRange: [0,1149222912],
        percentRange: [0,1120403456],
        siRange: [0,1149222912]
      },
      7: {
        name: "IR Tx",
        symbol: "N/A",
        valueFormat: {"count":1,"type":"Int16","figures":5,"decimals":0},
        rawRange: [0,1199570688],
        percentRange: [0,1120403456],
        siRange: [0,1199570688]
      },
      8: {
        name: "SPEC 1",
        symbol: "N/A",
        valueFormat: {"count":4,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      },
      9: {
        name: "DEBUG",
        symbol: "N/A",
        valueFormat: {"count":2,"type":"Int16","figures":5,"decimals":0},
        rawRange: [0,1149222912],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      10: {
        name: "CALIB",
        symbol: "N/A",
        valueFormat: {"count":8,"type":"Int16","figures":5,"decimals":0},
        rawRange: [0,1199570688],
        percentRange: [0,1120403456],
        siRange: [0,1199570688]
      }
    }
  },
  40: {
    name: "Boost Internal Tilt",
    defaultMode: 0,
    modes: {
      0: {
        name: "ANGLE",
        symbol: "DEG",
        valueFormat: {"count":2,"type":"Int8","figures":3,"decimals":0},
        rawRange: [-1028390912,1119092736],
        percentRange: [-1027080192,1120403456],
        siRange: [-1028390912,1119092736]
      },
      1: {
        name: "TILT",
        symbol: "DIR",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      2: {
        name: "ORINT",
        symbol: "DIR",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1084227584],
        percentRange: [0,1120403456],
        siRange: [0,1084227584]
      },
      3: {
        name: "IMPCT",
        symbol: "IMP",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      4: {
        name: "ACCEL",
        symbol: "ACC",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [-1031667712,1115815936],
        percentRange: [-1027080192,1120403456],
        siRange: [-1031667712,1115815936]
      },
      5: {
        name: "OR_CF",
        symbol: "SID",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1086324736],
        percentRange: [0,1120403456],
        siRange: [0,1086324736]
      },
      6: {
        name: "IM_CF",
        symbol: "SEN",
        valueFormat: {"count":2,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      },
      7: {
        name: "CALIB",
        symbol: "CAL",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  },
  21: {
    name: "Hub Current",
    defaultMode: 0,
    modes: {
      0: {
        name: "CUR L",
        symbol: "mA",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1166012416],
        percentRange: [0,1120403456],
        siRange: [0,1166178304]
      },
      1: {
        name: "CUR S",
        symbol: "mA",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1166012416],
        percentRange: [0,1120403456],
        siRange: [0,1166178304]
      }
    }
  },
  20: {
    name: "Hub Voltage",
    defaultMode: 0,
    modes: {
      0: {
        name: "VLT L",
        symbol: "mv",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1162346496],
        percentRange: [0,1120403456],
        siRange: [0,1170735104]
      },
      1: {
        name: "VLT S",
        symbol: "mv",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1162346496],
        percentRange: [0,1120403456],
        siRange: [0,1170735104]
      }
    }
  },
  34: {
    name: "WeDo2 Tilt Sensor",
    defaultMode: 0,
    modes: {
      0: {
        name: "LPF2-ANGLE",
        symbol: "DEG",
        valueFormat: {"count":2,"type":"Int8","figures":3,"decimals":0},
        rawRange: [-1036779520,1110704128],
        percentRange: [-1027080192,1120403456],
        siRange: [-1036779520,1110704128]
      },
      1: {
        name: "LPF2-TILT",
        symbol: "DIR",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      2: {
        name: "LPF2-CRASH",
        symbol: "CNT",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      3: {
        name: "LPF2-CAL",
        symbol: "CAL",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [-1036779520,1110704128],
        percentRange: [-1027080192,1120403456],
        siRange: [-1036779520,1110704128]
      }
    }
  },
  35: {
    name: "WeDo2 Motion Sensor",
    defaultMode: 0,
    modes: {
      0: {
        name: "LPF2-DETECT",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      1: {
        name: "LPF2-COUNT",
        symbol: "CNT",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      2: {
        name: "LPF2-CAL",
        symbol: "RAW",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [0,1149222912],
        percentRange: [0,1120403456],
        siRange: [0,1149222912]
      }
    }
  },
  23: {
    name: "Hub RGB LED",
    defaultMode: 0,
    modes: {
      0: {
        name: "COL 0",
        symbol: "idx",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      1: {
        name: "RGB 0",
        symbol: "rgb",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  },
  66: {
    name: "ioType 66",
    defaultMode: 0,
    modes: {

      0: {
        name: "TRIGGER",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      1: {
        name: "CANVAS",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      2: {
        name: "VAR",
        symbol: "",
        valueFormat: {"count":1,"type":"Int32","figures":1,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      }
    }
  },
  1: {
    name: "ioType 1",
    defaultMode: 0,
    modes: {

      0: {
        name: "LPF2-MMOTOR",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      }
    }
  },
  38: {
    name: "Boost External Motor",
    defaultMode: 0,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int32","figures":6,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      3: {
        name: "TEST",
        symbol: "TST",
        valueFormat: {"count":5,"type":"Int16","figures":6,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      }
    }
  },

  60: {
    name: "ioType 60",
    defaultMode: 0,
    modes: {

      0: {
        name: "TEMP",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int16","figures":5,"decimals":1},
        rawRange: [-1000275968,1147207680],
        percentRange: [-1027080192,1120403456],
        siRange: [-1028390912,1119092736]
      }
    }
  },
  57: {
    name: "Hub Accelerometer",
    defaultMode: 0,
    modes: {
      0: {
        name: "GRV",
        symbol: "mG",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-956301312,1191182336],
        percentRange: [-1027080192,1120403456],
        siRange: [-973471744,1174011904]
      },
      1: {
        name: "CAL",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":0,"decimals":0},
        rawRange: [1065353216,1065353216],
        percentRange: [-1027080192,1120403456],
        siRange: [1065353216,1065353216]
      }
    }
  },
  58: {
    name: "ioType 58",
    defaultMode: 0,
    modes: {

      0: {
        name: "ROT",
        symbol: "DPS",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-958449961,1189033687],
        percentRange: [-1027080192,1120403456],
        siRange: [-990248960,1157234688]
      }
    }
  },
  59: {
    name: "Hub Tilt Position",
    defaultMode: 0,
    modes: {
      0: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-1020002304,1127481344],
        percentRange: [-1027080192,1120403456],
        siRange: [-1020002304,1127481344]
      },
      1: {
        name: "IMP",
        symbol: "CNT",
        valueFormat: {"count":1,"type":"Int32","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      2: {
        name: "CFG",
        symbol: "",
        valueFormat: {"count":2,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  },
  54: {
    name: "ioType 54",
    defaultMode: 0,
    modes: {

      0: {
        name: "GEST",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1082130432],
        percentRange: [0,1120403456],
        siRange: [0,1082130432]
      }
    }
  },
  46: {
    name: "Technic Large Motor",
    defaultMode: 0,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      3: {
        name: "APOS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      4: {
        name: "LOAD",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1123942400],
        percentRange: [0,1120403456],
        siRange: [0,1123942400]
      },
      5: {
        name: "CALIB",
        symbol: "RAW",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [0,1140850688],
        percentRange: [0,1120403456],
        siRange: [0,1140850688]
      }
    }
  },
  47: {
    name: "Technic XL Motor",
    defaultMode: 0,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      3: {
        name: "APOS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      4: {
        name: "LOAD",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1123942400],
        percentRange: [0,1120403456],
        siRange: [0,1123942400]
      },
      5: {
        name: "CALIB",
        symbol: "RAW",
        valueFormat: {"count":3,"type":"Int16","figures":3,"decimals":0},
        rawRange: [0,1140850688],
        percentRange: [0,1120403456],
        siRange: [0,1140850688]
      }
    }
  },
  55: {
    name: "Handset Buttons",
    defaultMode: 0,
    modes: {
      0: {
        name: "RCKEY",
        symbol: "btn",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [-1082130432,1065353216],
        percentRange: [-1027080192,1120403456],
        siRange: [-1082130432,1065353216]
      },
      1: {
        name: "KEYA ",
        symbol: "btn",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [-1082130432,1065353216],
        percentRange: [-1027080192,1120403456],
        siRange: [-1082130432,1065353216]
      },
      2: {
        name: "KEYR ",
        symbol: "btn",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [-1082130432,1065353216],
        percentRange: [-1027080192,1120403456],
        siRange: [-1082130432,1065353216]
      },
      3: {
        name: "KEYD ",
        symbol: "btn",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1088421888],
        percentRange: [0,1120403456],
        siRange: [0,1088421888]
      },
      4: {
        name: "KEYSD",
        symbol: "btn",
        valueFormat: {"count":3,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1065353216],
        percentRange: [0,1120403456],
        siRange: [0,1065353216]
      }
    }
  },
  56: {
    name: "Handset RSSI",
    defaultMode: 0,
    modes: {
      0: {
        name: "RSSI ",
        symbol: "dbm",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [-1029701632,-1041235968],
        percentRange: [0,1120403456],
        siRange: [-1029701632,-1041235968]
      }
    }
  },
  86: {
    name: "ioType 86",
    defaultMode: 0,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      3: {
        name: "GOPOS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [-1020002304,1127415808],
        percentRange: [-1027080192,1120403456],
        siRange: [-1020002304,1127415808]
      },
      4: {
        name: "STATS",
        symbol: "DEG",
        valueFormat: {"count":3,"type":"Int32","figures":10,"decimals":0},
        rawRange: [0,1333788672],
        percentRange: [0,0],
        siRange: [0,1333788672]
      }
    }
  },
  87: {
    name: "ioType 87",
    defaultMode: 0,
    modes: {
      0: {
        name: "POWER",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      1: {
        name: "SPEED",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      },
      2: {
        name: "POS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int32","figures":4,"decimals":0},
        rawRange: [-1011613696,1135869952],
        percentRange: [-1027080192,1120403456],
        siRange: [-1011613696,1135869952]
      },
      3: {
        name: "GOPOS",
        symbol: "DEG",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [-1020002304,1127415808],
        percentRange: [-1027080192,1120403456],
        siRange: [-1020002304,1127415808]
      },
      4: {
        name: "STATS",
        symbol: "DEG",
        valueFormat: {"count":3,"type":"Int32","figures":10,"decimals":0},
        rawRange: [0,1333788672],
        percentRange: [0,0],
        siRange: [0,1333788672]
      }
    }
  },
  88: {
    name: "ioType 88",
    defaultMode: 0,
    modes: {
      0: {
        name: "6LEDS",
        symbol: "BIN",
        valueFormat: {"count":2,"type":"Int8","figures":8,"decimals":0},
        rawRange: [0,1115422720],
        percentRange: [0,0],
        siRange: [0,1115422720]
      }
    }
  },
  89: {
    name: "ioType 89",
    defaultMode: 0,
    modes: {
      0: {
        name: "PLAYVM",
        symbol: "na",
        valueFormat: {"count":8,"type":"Int8","figures":4,"decimals":0},
        rawRange: [-1027080192,1120403456],
        percentRange: [-1027080192,1120403456],
        siRange: [-1027080192,1120403456]
      }
    }
  },
  93: {
    name: "ioType 93",
    defaultMode: 0,
    modes: {
      0: {
        name: "ORINT",
        symbol: "QUA",
        valueFormat: {"count":4,"type":"Int16","figures":3,"decimals":0},
        rawRange: [-998637568,1148846080],
        percentRange: [-1027080192,1120403456],
        siRange: [-1082130432,1065353216]
      }
    }
  },
  92: {
    name: "ioType 92",
    defaultMode: 0,
    modes: {
      0: {
        name: "ChgAct",
        symbol: "Var",
        valueFormat: {"count":4,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,0],
        percentRange: [0,0],
        siRange: [0,0]
      },
      1: {
        name: "PlyAct",
        symbol: "Var",
        valueFormat: {"count":4,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,0],
        percentRange: [0,0],
        siRange: [0,0]
      },
      2: {
        name: "Last",
        symbol: "Var",
        valueFormat: {"count":3,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,0],
        percentRange: [0,0],
        siRange: [0,0]
      },
      3: {
        name: "Total",
        symbol: "Var",
        valueFormat: {"count":3,"type":"Int32","figures":4,"decimals":0},
        rawRange: [0,0],
        percentRange: [0,0],
        siRange: [0,0]
      }
    }
  },
  94: {
    name: "ioType 94",
    defaultMode: 0,
    modes: {
      0: {
        name: "GEST_BITMAP",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  },
  95: {
    name: "ioType 95",
    defaultMode: 0,
    modes: {
      0: {
        name: "GEN_GEST",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  },
  8: {
    name: "Light",
    defaultMode: 0,
    modes: {
      0: {
        name: "LPF2-LIGHT",
        symbol: "",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [-1054867456,1092616192],
        percentRange: [-1027080192,1120403456],
        siRange: [-1054867456,1092616192]
      }
    }
  },
  61: {
    name: "Spike Color Sensor",
    defaultMode: 0,
    modes: {
      0: {
        name: "COLOR",
        symbol: "IDX",
        valueFormat: {"count":1,"type":"Int8","figures":2,"decimals":0},
        rawRange: [0,1092616192],
        percentRange: [0,1120403456],
        siRange: [0,1092616192]
      },
      1: {
        name: "REFLT",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      2: {
        name: "AMBI",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      3: {
        name: "LIGHT",
        symbol: "PCT",
        valueFormat: {"count":3,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      4: {
        name: "RREFL",
        symbol: "RAW",
        valueFormat: {"count":2,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1149239296],
        percentRange: [0,1120403456],
        siRange: [0,1149239296]
      },
      5: {
        name: "RGB I",
        symbol: "RAW",
        valueFormat: {"count":4,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1149239296],
        percentRange: [0,1120403456],
        siRange: [0,1149239296]
      },
      6: {
        name: "HSV",
        symbol: "RAW",
        valueFormat: {"count":3,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1135869952],
        percentRange: [0,1120403456],
        siRange: [0,1135869952]
      },
      7: {
        name: "SHSV",
        symbol: "RAW",
        valueFormat: {"count":4,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1135869952],
        percentRange: [0,1120403456],
        siRange: [0,1135869952]
      },
      8: {
        name: "DEBUG",
        symbol: "RAW",
        valueFormat: {"count":4,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1199570688],
        percentRange: [0,1120403456],
        siRange: [0,1199570688]
      },
      9: {
        name: "CALIB",
        symbol: "",
        valueFormat: {"count":7,"type":"Int16","figures":5,"decimals":0},
        rawRange: [0,1199570688],
        percentRange: [0,1120403456],
        siRange: [0,1199570688]
      }
    }
  },
  62: {
    name: "Spike Distance Sensor",
    defaultMode: 0,
    modes: {
      0: {
        name: "DISTL",
        symbol: "CM",
        valueFormat: {"count":1,"type":"Int16","figures":5,"decimals":1},
        rawRange: [0,1159479296],
        percentRange: [0,1120403456],
        siRange: [0,1132068864]
      },
      1: {
        name: "DISTS",
        symbol: "CM",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":1},
        rawRange: [0,1134559232],
        percentRange: [0,1120403456],
        siRange: [0,1107296256]
      },
      2: {
        name: "SINGL",
        symbol: "CM",
        valueFormat: {"count":1,"type":"Int16","figures":5,"decimals":1},
        rawRange: [0,1159479296],
        percentRange: [0,1120403456],
        siRange: [0,1132068864]
      },
      3: {
        name: "LISTN",
        symbol: "ST",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1065353216],
        percentRange: [0,1120403456],
        siRange: [0,1065353216]
      },
      4: {
        name: "TRAW",
        symbol: "uS",
        valueFormat: {"count":1,"type":"Int32","figures":5,"decimals":0},
        rawRange: [0,1180943360],
        percentRange: [0,1120403456],
        siRange: [0,1180943360]
      },
      5: {
        name: "LIGHT",
        symbol: "PCT",
        valueFormat: {"count":4,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1120403456],
        percentRange: [0,1120403456],
        siRange: [0,1120403456]
      },
      6: {
        name: "PING",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int8","figures":1,"decimals":0},
        rawRange: [0,1065353216],
        percentRange: [0,1120403456],
        siRange: [0,1065353216]
      },
      7: {
        name: "ADRAW",
        symbol: "PCT",
        valueFormat: {"count":1,"type":"Int16","figures":4,"decimals":0},
        rawRange: [0,1149239296],
        percentRange: [0,1120403456],
        siRange: [0,1149239296]
      },
      8: {
        name: "CALIB",
        symbol: "PCT",
        valueFormat: {"count":7,"type":"Int8","figures":3,"decimals":0},
        rawRange: [0,1132396544],
        percentRange: [0,1120403456],
        siRange: [0,1132396544]
      }
    }
  }
};


export class LegoLPF2 {
  constructor(name, manager) {
    this.name = name || null;
    this.manager = manager;

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;

    this.hubId = 0x00;
    this.hubType = null;      // numeric hub type
    this.namePrefix = "LPF2_"; // Boost, Pup, Spk, LPF2_

    this.status = "idle";
    this.statusMessage = "Idle";

    this.portInfo = {};      // portId -> { ioType, type, modes }
    this.portValues = {};    // portId -> last numeric value
    this._valueModeOf = {};  // portId -> mode of the last value actually received from the hub
    this._valueWaiters = {}; // portId -> callbacks waiting for the next value
    this.lastInputState = {}; // portId -> boolean
    this.countOn = {};       // portId -> rising-edge count
    this.rot = {};           // portId -> rotation (deg or ticks)
	this.activeMode = {}; // port → mode

	this.userPortMap = {}; // user-friendly port names (A/B/C/D) mapped to port IDs

	this.motorCaps = {
	power: true,
	speed: false,
	angle: false,
	goto: false,
	time: false,
	combined: false
	};

    this.commandQueue = Promise.resolve();
    this.queueActive = true;

    this.defaultBrakeMode = BRAKE_BRAKE; // default = Brake

    this.readingActive = false;

		this._rxBuffer = [];     // byte buffer for incoming notifications
		this._notifyBound = this._onNotification.bind(this);

		// Default sensor modes per type
		this.defaultSensorModes = {
				distance: 0,
				colorDistance: 0, // color index
				color: 0,
				tilt: 0,
				tiltMulti: 0,
				imu: 0,           // accel
				force: 0,
				motor: 2,         // absolute position
				voltage: 0,
				current: 0
		};

		this.ready = false;
		this._readyResolve = null;
		this.readyPromise = new Promise(res => (this._readyResolve = res));

		this._readyTrackingActive = false;
		this._pendingModeInfo = 0;

		this._unknownProfiles = {};
		this._unknownProfilesComplete = {};

		this._pendingPortInfo = 0;   // outstanding Port Information (Mode Info) requests
		this._learnOwner = {};       // ioType -> port id currently learning it
		this._profileTimers = {};    // ioType -> flush timer
		this._readyTimer = null;

		// Handset / hub button state
		this.buttons = {};
		for (const n of HANDSET_BUTTONS) this.buttons[n] = false;
		this.handsetKey = { A: "NONE", B: "NONE" };
		this._buttonLatch = {};
		this._buttonListeners = new Set();
		this._ledMode = {};          // portId -> current LED mode

  }

  // ---------------- Status + Logging ----------------

  setStatus(status, message) {
    this.status = status;
    if (message) this.statusMessage = message;
    this.manager?.updateDeviceEntry?.(this);
  }

  log(msg) {
    console.log(`[${this.name || this.namePrefix}] ${msg}`);
    this.manager?.appendLog?.(this, msg);
  }

  // ---------------- Command Queueing ----------------

	enqueueCommand(fn) {
		if (!this.queueActive) {
			return Promise.resolve();
		}

		this.commandQueue = this.commandQueue
			.then(async () => {
				await fn();
			})
			.catch(err => {
				this.log("Queue command error: " + (err?.message || err));
			})

		return this.commandQueue;
	}

  async _write(bytes) {
    return this.enqueueCommand(async () => {
      if (!this.char) return;
      await this.char.writeValue(bytes);
    });
  }

	_onReady() {
		if (this.ready) return;

		this.ready = true;
		this._readyTrackingActive = false;

		clearTimeout(this._readyTimer);
			if (Object.keys(this._unknownProfiles).length) {
				window.logStatus?.(`${this.name}: Check Console log for new Device info.`);
			}

		if (this._readyResolve) {
			this._readyResolve();
			this._readyResolve = null;
		}

		document.dispatchEvent(new CustomEvent("serial-ready", {
			detail: { device: this }
		}));

		if (this.hubType === 0x84 && LPF2_MOVEHUB.lightsOffOnConnect) {
			this.lightsOff().catch(e => this.log("lightsOff: " + (e?.message || e)));
			setTimeout(() => { if (this.char) this.lightsOff().catch(() => {}); }, 1500);   // the hub may switch some on again after connecting
		}
		if (this.hubType === 0x84 && LPF2_MOVEHUB.calibrateOnConnect) this.calibrateSteering().catch(e => this.log("calibrateSteering: " + (e?.message || e)));
		if (this.hubType === 0x84 && LPF2_SENSOR.prewarm) this._prewarmMoveHub();
	}

	/**
	 * Technic Move Hub: the two frames the Control+ app sends after connecting (INIT 0x10, CALIBRATE 0x08 in the
	 * flags byte of the 13-byte drive frame, speed 0, steering 0, lights on). The steering motor sweeps to its
	 * end stops, so make sure it can move. Call manually with: await dev.calibrateSteering()
	 */
	async calibrateSteering() {
		if (this.hubType !== 0x84) throw new Error("calibrateSteering: only for the Technic Move Hub");
		const port = this.userPortMap?.DRIVEVM ?? LPF2_MOVEHUB.port;
		const frame = (flags) => new Uint8Array([0x0d, this.hubId || 0x00, 0x81, port, 0x11, 0x51, 0x00, 0x03, 0x00, 0x00, 0x00, flags, 0x00]);
		this.log("calibrateSteering: sending INIT (0x10) then CALIBRATE (0x08) to port " + port);
		await this._write(frame(0x10));
		await _sleep(LPF2_MOVEHUB.initWaitMs);
		await this._write(frame(0x08));
	}

	/**
	 * Technic Move Hub: start the IMU streams right after connecting (like the Control+ app does), so the
	 * hub's IMU is warmed up and the first getIMU/getTilt is answered from the stream.
	 * Runs in the background; failures only log.
	 */
	async _prewarmMoveHub() {
		const cfg = LPF2_SENSOR;
		this._connectedAt ??= performance.now();
		if (cfg.prewarmHelpers) {
			for (const [p, i] of Object.entries(this.portInfo)) {
				if (i.ioType !== 57 && i.ioType !== 58) continue;   // accelerometer, gyro
				const port = Number(p);
				const mode = this._findMode(port, ["acc", "gyro", "imu"]);
				try { await this._setInputFormat(port, mode, 1, 1, { wait: true }); this.log(`prewarm: subscribed helper port ${port} (ioType ${i.ioType}, mode ${mode})`); }
				catch (e) { this.log(`prewarm helper ${port}: ${e?.message || e}`); }
			}
			await _sleep(300);
		}
		setTimeout(() => {   // diagnostics: what does each internal sensor deliver?
			const dump = Object.entries(this.portInfo).filter(([, i]) => [57, 58, 59, 93].includes(i.ioType))
				.map(([p, i]) => `${p}(io${i.ioType})=${JSON.stringify(this.portValues[p])}`).join(" ");
			this.log(`prewarm status after 5 s: ${dump}`);
		}, 5000);
		for (const [name, keywords] of Object.entries(cfg.prewarmPorts)) {
			const port = this.userPortMap?.[name];
			if (port === undefined || !this.portInfo[port]) continue;
			const mode = this._findMode(port, keywords);
			this._readSensor(port, mode, `prewarm ${name}`, { timeoutMs: cfg.prewarmMs, throwOnTimeout: false })
				.catch(e => this.log(`prewarm ${name}: ${e?.message || e}`));
		}
	}


	// ---------------- Connect ----------------

	/**
	 * Connect the GATT server, find the LPF2 service/characteristic and start notifications,
	 * retrying the whole sequence if the hub drops the link (typical when the hub wants
	 * pairing/encryption and the OS is still negotiating it).
	 */
	// Replace lines 1120-1135 in DeviceLegoLPF2.js with:
	async _connectGatt(device) {
		let lastErr;

		this.setStatus("connecting", "Connecting via BLE...");
		const server = device.gatt.connected ? device.gatt : await device.gatt.connect();

		// Settle delay for Windows 11 encryption negotiation
		await _sleep(LPF2_CONNECT.settleFirstMs);

		const service = await server.getPrimaryService(LPF2_SERVICE_UUID);
		const char    = await service.getCharacteristic(LPF2_CHAR_UUID);

		// Retry startNotifications WITHOUT disconnecting the GATT link
		for (let attempt = 1; attempt <= LPF2_CONNECT.attempts; attempt++) {
			try {
				await char.startNotifications();
				if (!device.gatt.connected) throw new Error("GATT link dropped");
				return { server, service, char };
			} catch (err) {
				lastErr = err;
				this.log(`GATT notification attempt ${attempt}/${LPF2_CONNECT.attempts} notice: ${err?.message || err}`);
				if (attempt < LPF2_CONNECT.attempts) {
					await _sleep(LPF2_CONNECT.retryDelayMs);
				}
			}
		}

		throw lastErr || new Error("Could not subscribe to LPF2 notifications");
	}

	async connect() {
		this.setStatus("connecting", "Requesting LPF2 hub...");
		this.log("Connecting to LPF2 hub...");

		let device;
		try {
			device = await navigator.bluetooth.requestDevice({
				filters: [
					{ services: ["00001623-1212-efde-1623-785feabcd123"] } // LPF2 hubs only
				],
				optionalServices: [
					"00001623-1212-efde-1623-785feabcd123"
				]
			});
		} catch (err) {
			this.log("No LPF2 hub selected");
			this.setStatus("idle", "No device selected");
			throw err;
		}

		this.device = device;

		// Fresh state for this attempt (a previous failed attempt may have left these off)
		this.queueActive = true;
		this.commandQueue = Promise.resolve();
		this._rxBuffer = [];
		this._connecting = true;

		// Lost-device detection. Registered once per device object, and ignored while
		// connect() is still running so a drop during pairing doesn't wipe the state
		// and cause the misleading "Cannot retrieve services" error.
		if (!this._onGattDisc) {
			this._onGattDisc = () => {
				if (this._connecting) {
					this.log("GATT link dropped during connect (retrying if attempts remain).");
					return;
				}
				this.log("GATT server disconnected — device lost.");
				this.manager?.handleDeviceLost?.(this);
				this.forceDisconnect().catch(() => {});
			};
		}
		device.removeEventListener("gattserverdisconnected", this._onGattDisc);
		device.addEventListener("gattserverdisconnected", this._onGattDisc);

		this.setStatus("connecting", "Connecting via BLE...");
		this.log(`Connecting to GATT server on ${device.name || "LPF2 hub"}...`);

		try {
			// Connect + discover service/characteristic + start notifications (with retries).
			// startNotifications() is where an Insufficient Authentication / pairing request
			// gets triggered, so it is part of the retried block.
			const link = await this._connectGatt(device);
			this.server  = link.server;
			this.service = link.service;
			this.char    = link.char;

			this.char.removeEventListener("characteristicvaluechanged", this._notifyBound);
			this.char.addEventListener("characteristicvaluechanged", this._notifyBound);
			this._connecting = false;
		} catch (err) {
			this._connecting = false;
			this.log("Connection failed: " + (err?.message || err));
			this.setStatus("idle", "Connection failed");

			// Release the link so the next click doesn't hit "Connection already in progress"
			try { if (device.gatt?.connected) device.gatt.disconnect(); } catch {}
			device.removeEventListener("gattserverdisconnected", this._onGattDisc);

			this.device = null;
			this.server = null;
			this.service = null;
			this.char = null;

			// Typical symptom of a hub that needs an encrypted (bonded) link that the OS has not set up
			const text = String(err?.message || err);
			if (/already in progress|authentication|authoriz|encrypt|GATT Server is disconnected/i.test(text)) {
				const hint = "The hub needs a paired (encrypted) Bluetooth link, and a web page cannot create it. " +
					"Pair it once in the operating system first (Windows: Settings > Bluetooth & devices > Add device, " +
					"hub LED blinking), then click Connect again.";
				this.log(hint);
				const wrapped = new Error(`${text} — ${hint}`);
				wrapped.cause = err;
				throw wrapped;
			}
			throw err;
		}

		this.ready = false;
		this._readyTrackingActive = false;
		this._pendingModeInfo = 0;
		this.readyPromise = new Promise(res => (this._readyResolve = res));
			this._pendingPortInfo = 0;

		// Request hub type (LPF2 Hub Property 0x06)
		await this._write(new Uint8Array([
			0x05,       // length
			0x00,       // hub ID
			0x01,       // Hub Properties
			0x0B,       // Hub Type
			0x05        // Request Update
		]));

		this.readingActive = true;

		// Hub type detection (if the hub never answers, release the link so a retry can start clean)
		try {
			await this._waitForHubType();
		} catch (err) {
			await this.forceDisconnect().catch(() => {});
			this.setStatus("idle", "Connection failed");
			throw err;
		}

		// Allocate name
		if (!this.name) {
			this.name = this.manager._allocateName(this.namePrefix);
		}

		// LPF2 initialization
		await this._initializeLPF2();

		this.log(`Connected as ${this.name}`);
		this.setStatus("connected", "Connected");
		window.logStatus?.(`Connected: ${this.name}`);
		document.dispatchEvent(new Event("serial-connected"));

	}

	
	// ---------------- LPF2 Initialization Sequence ----------------

	async _initializeLPF2() {
		this._connectedAt = performance.now();
		this._imuLive = false;
		this.log("Initializing LPF2 hub...");

    this._readyTrackingActive = false;   // OFF until the initial attach messages are in

		// ------------------------------------------------------------
		// STEP 1 — Wait for initial Hub Attached I/O messages
		// ------------------------------------------------------------
		// Boost/Spike send port attach messages immediately after notifications start.
		// WeDo 2.0 is slower, so we wait a bit.

		await new Promise(r => setTimeout(r, 300));

		// If no ports detected yet, wait a bit more
		if (Object.keys(this.portInfo).length === 0) {
			await new Promise(r => setTimeout(r, 300));
		}

		this.log("Ports detected: " + JSON.stringify(Object.fromEntries(Object.entries(this.portInfo).map(([p, i]) => [p, { ioType: i.ioType, type: i.type }]))));
		this._buildPortMap();
		this._setupMotorCaps();
		this.log("Port map: " + JSON.stringify(this.userPortMap));
		this.log("Motor caps: " + JSON.stringify(this.motorCaps));


		// ------------------------------------------------------------
		// STEP 2 — Request Mode Information for each port (LPF3-correct)
		// ------------------------------------------------------------
		this._readyTrackingActive = true;

		/* SKIP because Hub sends port info automatically on connect
		for (const portStr of Object.keys(this.portInfo)) {
				const port = Number(portStr);

				// 1. Request Possible Modes (0x02)

				this._write(new Uint8Array([
						0x05, this.hubId, 0x21, port, 0x02
				]));

				await new Promise(r => setTimeout(r, 20));
		}
		*/
		
		// ------------------------------------------------------------
		// STEP 3 — Configure Input Format for each sensor port (safe version)
		// ------------------------------------------------------------
		for (const portStr of Object.keys(this.portInfo)) {
				const port = Number(portStr);
				const info = this.portInfo[port];
				let d = 1;

				if (!info) continue;

				// Technic Move Hub: every device on it is internal (IMU, gesture, drive VM, lights...).
				// Subscribing to all of them at connect time with delta 1 makes the hub flood the link
				// as soon as it is moved, and the connection drops. Subscribe on demand instead
				// (_ensureMode / setSensorMode), where _setInputFormat applies safe deltas.
				if (this.hubType === 0x84) continue;

				// Skip motors
				if (info.type === "motorSimple" || info.type === "motorTacho" || info.type === "motor" || info.type === "current" || info.type === "volt" || info.type === "temperature" || info.type === "rgb" || info.type === "rssi") {
						continue;
				}
				switch (info.type) {
						case "tiltMulti":
							d=5;
							break;
						default:
							d=1;
				}

				// For now: always mode 0, delta=1, notifications=1
				await this._setInputFormat(port, 0, d, 1);

				await new Promise(r => setTimeout(r, 20));
		}


		// Handset: the green button is the hub button → arrives as Hub Properties updates
			if (this.hubType === 0x42) {
				await this.enableHubButton();
			}

			// Safety net: never wait forever for discovery replies
			clearTimeout(this._readyTimer);
			this._readyTimer = setTimeout(() => {
				if (!this.ready) {
					console.warn("[LPF2] Discovery did not finish in time; continuing.");
					this._onReady();
				}
			}, 10000);
			this._checkReady();

			this.log("LPF2 initialization complete.");
	}

	async _setInputFormat(port, mode, delta = 1, notifications = 1, { wait = false } = {}) {
			// Technic Move Hub protection
			if (this.hubType === 0x84) {
					const io = this.portInfo[port]?.ioType;
					// 88 = LED state (read-only), 89 = drive VM: never subscribe to these
					if (io === 88 || io === 89) {
							this.log(`Not subscribing to port ${port} (ioType ${io}) on the Technic Move hub.`);
							return;
					}
					// Never delta 0 (notification storm); IMU ports get a coarser minimum delta
					delta = Math.max(delta | 0, 1, MOVEHUB_MIN_DELTA[io] || 1);
			}

			// A new mode means the cached value belongs to another mode: it is not "fresh" any more
			if (this.activeMode[port] !== mode) delete this._valueModeOf[port];

			this.activeMode[port] = mode;
			const d = delta >>> 0;

			const msg = new Uint8Array([
					0x0A,
					this.hubId,
					0x41,
					port,
					mode,
					d & 0xFF,
					(d >> 8) & 0xFF,
					(d >> 16) & 0xFF,
					(d >> 24) & 0xFF,
					notifications ? 0x01 : 0x00	
			]);

			// Default stays fire-and-forget (as before); sensor reads pass { wait: true } to know it was sent
			const sent = this._write(msg);
			if (wait) await sent;
	}

	// ---------------- Port Information / Mode discovery ----------------
	//
	// LWP3 flow used here:
	//   Hub Attached I/O (0x04)  ->  we send Port Information Request (0x21) with info type 0x01 (MODE INFO)
	//   Port Information (0x43, type 0x01) -> [len][hub][0x43][port][0x01][capabilities][totalModes][inMask:2][outMask:2]
	//   For ioTypes without a cached profile we then send Port Mode Information Requests (0x22)
	//   and collect the Port Mode Information replies (0x44) into a copy/paste-able profile.
	//
	// NOTE: info type 0x02 is "possible MODE COMBINATIONS". The hub only answers it for ports with the
	// "Logical Combinable" capability, so it must NOT be used to detect devices (the Handset never answers it).

	_handlePortInformation(msg) {
		const port = msg[3];
		const infoType = msg[4];
		const info = this.portInfo[port];

		if (infoType === 0x01) {
			try {
				if (info) this._handleModeInfoReply(port, info, msg);
			} finally {
				this._pendingPortInfo = Math.max(0, this._pendingPortInfo - 1);
				this._checkReady();
			}
			return;
		}

		if (!info) return;

		// 0x02 — Possible mode combinations (list of 16-bit masks). Only informational.
		if (infoType === 0x02) {
			const combos = [];
			for (let i = 5; i + 1 < msg.length; i += 2) combos.push(msg[i] | (msg[i + 1] << 8));
			info.modeCombinations = combos;
		}
	}

	_handleModeInfoReply(port, info, msg) {
		if (msg.length < 11) {
			console.warn(`LPF2: short Mode Info reply for port ${port}:`, Array.from(msg));
			return;
		}

		const capabilities = msg[5];
		const totalModes   = msg[6];

		info.capabilities    = capabilities;
		info.canOutput       = !!(capabilities & 0x01);
		info.canInput        = !!(capabilities & 0x02);
		info.combinable      = !!(capabilities & 0x04);
		info.synchronizable  = !!(capabilities & 0x08);
		info.totalModes      = totalModes;
		info.maxMode         = Math.max(0, totalModes - 1);
		info.inputModesMask  = msg[7] | (msg[8] << 8);
		info.outputModesMask = msg[9] | (msg[10] << 8);

		if (totalModes === 0) return;

		const ioType = info.ioType;
		const cached = LPF2_DEVICE_PROFILES[ioType];
		const cachedCount = cached ? Object.keys(cached.modes).length : 0;

		const forced = LPF2_DEBUG.relearn === true ||
			(Array.isArray(LPF2_DEBUG.relearn) && LPF2_DEBUG.relearn.includes(ioType));
		const outdated = !!cached && !!LPF2_DEBUG.autoRelearn && cachedCount < totalModes;

		// Known and complete → use the cached profile, no 0x22 traffic
		if (cached && !forced && !outdated) {
			info.modes = cached.modes;
			info.defaultMode = cached.defaultMode;
			console.log(`LPF2: Loaded cached profile for ioType ${ioType} (${cached.name}) on port ${port}`);
			return;
		}

		if (cached && outdated) {
			console.warn(
				`LPF2: cached profile for ioType ${ioType} (${cached.name}) has ${cachedCount} mode(s) ` +
				`but the hub reports ${totalModes}. Re-learning it.`
			);
		}
		if (cached) info.defaultMode = cached.defaultMode;

		this._learnModes(port, info, !!cached);
	}

	_learnModes(port, info, replacesCached) {
		const ioType = info.ioType;
		info.modes = {};
		info.learning = true;

		// Already learned earlier in this session (e.g. the 2nd Handset button port) → reuse it
		if (this._unknownProfilesComplete[ioType]) {
			info.modes = this._unknownProfiles[ioType].modes;
			info.learning = false;
			return;
		}

		// Another port with the same ioType is already being learned → follower, wait for it
		const owner = this._learnOwner[ioType];
		if (owner != null && owner !== port && this.portInfo[owner]?.ioType === ioType) return;

		this._learnOwner[ioType] = port;
		this._unknownProfiles[ioType] = {
			name: IOTYPE_NAMES[ioType] || `ioType ${ioType}`,
			defaultMode: info.defaultMode ?? 0,
			modes: {},
			maxMode: info.maxMode,
			replaces: replacesCached,
			requested: 0,
			received: 0
		};

		console.warn(
			`LPF2: ${replacesCached ? "Outdated" : "Unknown"} ioType ${ioType} (${IOTYPE_NAMES[ioType] || "no name"}) ` +
			`on port ${port}. Requesting info for ${info.maxMode + 1} mode(s)...`
		);

		for (let mode = 0; mode <= info.maxMode; mode++) {
			this._requestModeInfo(port, mode);
		}
		this._scheduleProfileFlush(ioType, 5000);
	}

	_requestModeInfo(port, mode) {
		const hubId = this.hubId;
		const profile = this._unknownProfiles[this.portInfo[port]?.ioType];

		// Info types we care about: 0x00 name, 0x01 raw, 0x02 pct, 0x03 si, 0x04 symbol, 0x80 value format
		const infoTypes = [0x00, 0x01, 0x02, 0x03, 0x04, 0x80];

		for (const infoType of infoTypes) {
			this._pendingModeInfo++;
			if (profile) profile.requested++;

			const msg = new Uint8Array([
				0x06,      // length
				hubId,     // hub ID
				0x22,      // Port Mode Information Request
				port,      // port ID
				mode,      // mode
				infoType   // infoType
			]);
			this._write(msg);
		}
	}

	_handlePortModeInfo(port, mode, infoType, payload) {
		const info = this.portInfo[port];
		if (!info || !info.learning) return;   // only ports we asked about

		if (!info.modes) info.modes = {};
		if (!info.modes[mode]) info.modes[mode] = {};
		const m = info.modes[mode];

		switch (infoType) {
			case 0x00: m.name = this._decodeString(payload); break;       // Name
			case 0x01: m.rawRange = this._parseRange(payload); break;     // Raw range
			case 0x02: m.percentRange = this._parseRange(payload); break; // Percent range
			case 0x03: m.siRange = this._parseRange(payload); break;      // SI range
			case 0x04: m.symbol = this._decodeString(payload); break;     // Symbol
			case 0x80: m.valueFormat = this._parseValueFormat(payload); break; // Value format
		}

		this._pendingModeInfo = Math.max(0, this._pendingModeInfo - 1);

		const ioType = info.ioType;
		const profile = this._unknownProfiles[ioType];

		if (profile && !this._unknownProfilesComplete[ioType]) {
			profile.received++;
			profile.modes[mode] = {
				name: m.name,
				symbol: m.symbol,
				valueFormat: m.valueFormat,
				rawRange: m.rawRange,
				percentRange: m.percentRange,
				siRange: m.siRange
			};

			if (this._profileIsComplete(profile)) {
				this._finishProfile(ioType, false);
			} else {
				// If some replies never come, still print what we have after a quiet period
				this._scheduleProfileFlush(ioType, 1500);
			}
		}

		this._checkReady();
	}

	_profileIsComplete(profile) {
		if (Object.keys(profile.modes).length !== profile.maxMode + 1) return false;
		return Object.values(profile.modes).every(m =>
			m.name !== undefined &&
			m.symbol !== undefined &&     // allow ""
			m.valueFormat &&
			m.rawRange &&
			m.percentRange &&
			m.siRange
		);
	}

	_scheduleProfileFlush(ioType, delayMs) {
		clearTimeout(this._profileTimers[ioType]);
		this._profileTimers[ioType] = setTimeout(() => {
			delete this._profileTimers[ioType];
			if (this._unknownProfilesComplete[ioType]) return;

			// Stop waiting for replies that never came
			const p = this._unknownProfiles[ioType];
			if (p) this._pendingModeInfo = Math.max(0, this._pendingModeInfo - Math.max(0, p.requested - p.received));

			this._finishProfile(ioType, true);
			this._checkReady();
		}, delayMs);
	}

	_finishProfile(ioType, partial) {
		if (this._unknownProfilesComplete[ioType]) return;
		this._unknownProfilesComplete[ioType] = true;

		clearTimeout(this._profileTimers[ioType]);
		delete this._profileTimers[ioType];

		const profile = this._unknownProfiles[ioType];

		// Hand the learned modes to every port with this ioType
		const ports = [];
		for (const [p, i] of Object.entries(this.portInfo)) {
			if (i.ioType !== ioType) continue;
			ports.push(p);
			if (i.learning) {
				if (!i.modes || Object.keys(i.modes).length === 0) i.modes = profile.modes;
				i.learning = false;
			}
		}

		// Build the printable profile (fill holes, remember what is missing)
		const missing = [];
		const printable = { name: profile.name, defaultMode: profile.defaultMode, modes: {} };
		for (let mode = 0; mode <= profile.maxMode; mode++) {
			const m = profile.modes[mode];
			if (!m) {
				missing.push(`mode ${mode} (no reply at all)`);
				printable.modes[mode] = {};
				continue;
			}
			for (const f of ["name", "symbol", "valueFormat", "rawRange", "percentRange", "siRange"]) {
				if (m[f] === undefined) missing.push(`mode ${mode} ${f}`);
			}
			printable.modes[mode] = m;
		}

		console.log(
			`%cLPF2: ${missing.length ? "PARTIAL" : "COMPLETE"} PROFILE for ${profile.replaces ? "outdated" : "unknown"} ` +
			`ioType ${ioType} (${profile.name}) on port(s) ${ports.join(", ")}`,
			"color: #0f0; font-weight: bold;"
		);
		console.log(
			profile.replaces
				? `   → In LPF2_DEVICE_PROFILES, REPLACE the existing "${ioType}: {...}" entry with the block below:`
				: "   → Copy/paste the block below inside LPF2_DEVICE_PROFILES (it ends with a comma):"
		);
		if (missing.length) {
			console.warn("LPF2: the hub did not report: " + missing.join(", ") +
				". They are printed as null — fill them in by hand or reconnect and try again.");
		}
		console.log(_formatProfileForDictionary(ioType, printable));
		this.log(`New device info for ioType ${ioType} (${profile.name}) printed to the console.`);
	}

	// Ready = every Mode Info reply and every requested Mode Information reply has arrived (or timed out)
	_checkReady() {
		if (!this._readyTrackingActive || this.ready) return;
		if (this._pendingPortInfo > 0 || this._pendingModeInfo > 0) return;
		this._onReady();
	}

	_handleHubError(msg) {
		// [len][hub][0x05][offending command type][error code]
		const cmd = msg[3];
		const code = msg[4];
		const names = {
			0x01: "ACK", 0x02: "MACK", 0x03: "buffer overflow", 0x04: "timeout",
			0x05: "command not recognized", 0x06: "invalid use", 0x07: "overcurrent", 0x08: "internal error"
		};
		// Discovery-related commands are worth showing, the rest only in traffic mode.
		// Port output commands (0x81) are shown too: a refused motor command is otherwise invisible.
		if (cmd === 0x21 || cmd === 0x22 || cmd === 0x41 || (cmd === 0x81 && LPF2_DEBUG.motors) || LPF2_DEBUG.traffic) {
			let extra = "";
			if (cmd === 0x81 && this._lastOut) {
				const ago = Math.round(performance.now() - this._lastOut.t);
				extra = ` (last motor command: port ${this._lastOut.port}, subcommand 0x${this._lastOut.sub.toString(16)}, ${ago} ms ago)`;
			}
			this.log(`Hub error for command 0x${cmd.toString(16)}: ${names[code] || "code 0x" + code.toString(16)}${extra}`);
		}
	}

	_parseRange(payload) {
		// Ranges are IEEE-754 float32 values; they are kept as their raw Int32 bit pattern
		// (e.g. 1120403456 = 100.0) to stay consistent with the existing LPF2_DEVICE_PROFILES entries.
		if (payload.length < 8) return [0, 0];
		const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
		return [dv.getInt32(0, true), dv.getInt32(4, true)];
	}

	_parseValueFormat(payload) {
			// payload[0] = number of values
			// payload[1] = data type
			// payload[2] = total figures
			// payload[3] = decimals

			const count = payload[0];
			const dataType = payload[1];

			let type = "unknown";
			switch (dataType) {
					case 0x00: type = "Int8"; break;
					case 0x01: type = "Int16"; break;
					case 0x02: type = "Int32"; break;
					case 0x03: type = "Float32"; break;
			}

			return {
					count,
					type,
					figures: payload[2],
					decimals: payload[3]
			};
	}

  _waitForHubType(timeoutMs = 2000) {
		if (LPF2_DEBUG.connect) console.log("[LPF2] Waiting for hub type...");
    return new Promise((resolve, reject) => {
      const start = performance.now();
      const check = () => {
				if (LPF2_DEBUG.connect) console.log("[LPF2] hubType =", this.hubType);
        if (this.hubType != null) {
          this._setHubType(this.hubType);
          resolve();
          return;
        }
        if (performance.now() - start > timeoutMs) {
					console.warn("[LPF2] Hub type timeout");
          reject(new Error("Hub type timeout"));
          return;
        }
        requestAnimationFrame(check);
      };
      check();
    });
  }

	_setHubType(type) {
			this.hubType = type;

			// Fix Boost internal motors misclassified before hubType was known
			// if (type === 0x40) { // Boost Move Hub
			// 		for (const portId of [0, 1]) {
			// 				const info = this.portInfo[portId];
			// 				if (info && info.ioType === 0x27) {
			// 						info.type = "motor";
			// 						this.log(`Corrected Boost internal motor on port ${portId}`);
			// 				}
			// 		}
			// }

			switch (type) {

					case 0x20:
							this.namePrefix = "WeDo2_";
							break;

					case 0x40:
							this.namePrefix = "Boost";
							break;

					case 0x41:
							this.namePrefix = "City";
							break;

					case 0x42:
							this.namePrefix = "Remote";
							break;

					case 0x43:
							this.namePrefix = "Mario";
							break;

					case 0x44:
							this.namePrefix = "Duplo";
							break;

					case 0x45:
							this.namePrefix = "TechS";  // Technic Small Hub
							break;

					case 0x46:
							this.namePrefix = "Luigi";  // Technic Small Hub
							break;

					case 0x47:
							this.namePrefix = "Peach";  // Technic Small Hub
							break;

					case 0x80:
							this.namePrefix = "Tech";  // Technic Large Hub
							break;

					case 0x82:
							this.namePrefix = "SpkP";  // Spike Prime
							break;

					case 0x81:
							this.namePrefix = "Invent";  // MindstormsInventor Hub
							break;


					case 0x83:
							this.namePrefix = "SpkE";  // Spike Essential
							break;

					case 0x84:
							this.namePrefix = "TechM"; // Technic Move Hub
							break;

					case 0x64:
							this.namePrefix = "Bootloader";
							break;

					default:
							this.namePrefix = "LPF2_";
							break;
			}
	}


  // ---------------- Disconnect ----------------

  async disconnect() {
    this.queueActive = false;
    this.log("Disconnecting...");
    this.setStatus("disconnected", "Disconnecting...");

    this.readingActive = false;

    try {
      await this.commandQueue;
    } catch {}

    // Technic Move Hub: stop the motors and end the session with the LWP3 "Disconnect" hub action
    // before dropping the BLE link. Community drivers report that dropping the link without it can
    // leave the hub refusing drive commands in the next session.
    if (this.hubType === 0x84 && this.char && this.device?.gatt?.connected) {
      try {
        for (const key of ["A", "B", "C"]) {
          const p = this.userPortMap?.[key];
          if (p == null) continue;
          await this.char.writeValue(new Uint8Array([0x07, this.hubId || 0x00, MSG_PORT_OUTPUT_COMMAND, p & 0xFF, 0x10, SUBCMD_START_POWER, 0x00]));
        }
        await this.char.writeValue(new Uint8Array([0x04, this.hubId || 0x00, 0x02, 0x02])); // Hub Action: Disconnect
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        this.log(`Hub disconnect action failed: ${err.message || err}`);
      }
    }

    try {
      if (this.char) {
        this.char.removeEventListener("characteristicvaluechanged", this._notifyBound);
        try { await this.char.stopNotifications(); } catch {}
      }
    } catch {}

    try {
      if (this.device && this.device.gatt.connected) {
        await this.device.gatt.disconnect();
      }
    } catch (err) {
      this.log(`BLE disconnect error: ${err.message || err}`);
    }

    if (this.name) {
      this.manager?._removeDevice?.(this);
      this.name = null;
    }

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;

    //this.setStatus("disconnected", "Disconnected"); // already done in deviceManager (_removeDevice)
    document.dispatchEvent(new Event("serial-disconnected"));
    this.log("Disconnected cleanly.");
  }

  async forceDisconnect() {
    this.queueActive = false;
    this.commandQueue = Promise.resolve();
    this.readingActive = false;

    try {
      if (this.char) {
        this.char.removeEventListener("characteristicvaluechanged", this._notifyBound);
        try { await this.char.stopNotifications(); } catch {}
      }
    } catch {}

    try {
      if (this.device && this.device.gatt.connected) {
        await this.device.gatt.disconnect();
      }
    } catch {}

    if (this.name) {
      this.manager?._removeDevice?.(this);
      this.name = null;
    }

    this.device = null;
    this.server = null;
    this.service = null;
    this.char = null;
  }

  // ---------------- Notification Handling ----------------

	_onNotification(event) {
		const data = new Uint8Array(event.target.value.buffer);

		if (LPF2_DEBUG.traffic) {
			console.log("[LPF2] Notification:", 
			Array.from(data).map(b => b.toString(16).padStart(2, "0")).join(" ")
		);
		}
		// Append incoming bytes to buffer
		for (let b of data) {
			this._rxBuffer.push(b);
		}

		// Try to extract complete LPF2 frames
		while (this._rxBuffer.length >= 2) {
			const length = this._rxBuffer[0];

			if (this._rxBuffer.length < length) {
				break;
			}

			const frame = this._rxBuffer.slice(0, length);
			this._rxBuffer = this._rxBuffer.slice(length);

			if (LPF2_DEBUG.traffic) {
				console.log("[LPF2] Frame:", 
					Array.from(frame).map(b => b.toString(16).padStart(2, "0")).join(" ")
				);
			}

			this._handleMessage(new Uint8Array(frame));
		}
	}

  _handleMessage(msg) {
    const len = msg[0];
    if (len < 3) return;
    const hubId = msg[1];
    const type = msg[2]

		if (LPF2_DEBUG.traffic) {
			console.log(`[LPF2] Message type 0x${type.toString(16)}:`,
				Array.from(msg).map(b => b.toString(16).padStart(2, "0")).join(" ")
			);
		}

		this.hubId = hubId;

    switch (type) {
      case 0x01: // Hub Properties
				if (LPF2_DEBUG.traffic) console.log("[LPF2] → Hub Properties");
        this._handleHubProperties(msg);
        break;
      case 0x04: // Hub Attached I/O
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Hub Attached I/O");
				}
        this._handleHubAttachedIO(msg);
        break;
			case 0x05: // Generic error message
						this._handleHubError(msg);
						break;

				case 0x43: // Port Information
					this._handlePortInformation(msg);
					break;
			
			case 0x44: { // Port Mode Information
					const port = msg[3];
					const mode = msg[4];
					const infoType = msg[5];
					const payload = msg.slice(6);
					this._handlePortModeInfo(port, mode, infoType, payload);
					break;
			}
			case 0x45: // Port Value Single
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Port Value Single");
				}
        this._handlePortValueSingle(msg);
        break;
      case 0x46: // Port Value Combined
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Port Value Combined");
				}
        this._handlePortValueCombined(msg);
        break;

				case 0x82: {
						// Minimum length = 5
						const count = (msg.length - 3) / 2;

						for (let i = 0; i < count; i++) {
								const port = msg[3 + i*2];
								const status = msg[4 + i*2];

								const info = this.portInfo[port];
								if (!info) continue;

								// Save the full bitfield
								info.cmdFbkSts = status;
						}
						break;
				}

      default:
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] → Unknown message type");
				}
        break;
    }
  }

	_handleHubProperties(msg) {
		const property = msg[3];
		const op = msg[4];

		if (LPF2_DEBUG.traffic) {
			console.log("[LPF2] Hub Properties:",
				"property=0x" + property.toString(16),
				"op=0x" + op.toString(16),
				"len=" + msg.length
			);
		}

		if (property === 0x02 && op === 0x06) {
			// Hub button update: [len][hub][0x01][0x02][0x06][0|1]  (green button on the Handset)
			this._setButtonState("GREEN", (msg[5] | 0) !== 0);
			return;
		}

		if (property === 0x0B) {
			// Format A (Spike/Technic): len >= 6, hubType in msg[5]
			if (msg.length >= 6) {
				if (LPF2_DEBUG.traffic) {
					console.log("[LPF2] Hub Type (Format A):", msg[5]);
				}
				this._setHubType(msg[5]);
				return;
			}

			// Format B (Boost/PoweredUp): hubType is op byte.
			// op 0x06 means "Update" (not a hub type), so ignore it.
			if (op === 0x06) return;
			if (LPF2_DEBUG.traffic) {
				console.log("[LPF2] Hub Type (Format B):", op);
			}
			this._setHubType(op);
		}
	}

  _handleHubAttachedIO(msg) {
    // [len][hubId][0x04][portId][event][ioTypeL][ioTypeH][...]
    const portId = msg[3];
    const event = msg[4];
		const ioType = msg[5];

    if (event === 0x01) {
      const ioType = msg[5] | (msg[6] << 8);
      this._registerPort(portId, ioType);
			// Ask for MODE INFO (info type 0x01): total mode count + input/output masks
				this._pendingPortInfo++;
			this._write(new Uint8Array([
					0x05, this.hubId, 0x21, portId, 0x01
			]));

    } else if (event === 0x00) {
      delete this.portInfo[portId];
      delete this.portValues[portId];
      delete this._valueModeOf[portId];
      delete this.lastInputState[portId];
      delete this.countOn[portId];
      delete this.rot[portId];
			delete 	this.activeMode[portId];
    }

		// Detect virtual ports (Technic, Spike, Powered Up)
		if (event === 0x02 && this.hubType !== 0x40) {
				if (!this.userPortMap) this.userPortMap = {};

				(this._virtualPorts ||= {})[portId] = true;
				if (portId === 0x10) {
						this.userPortMap.AB = 0x10;
						this.log("Virtual port AB detected");
				}
				if (portId === 0x11) {
						this.userPortMap.CD = 0x11;
						this.log("Virtual port CD detected");
				}
		}

		// ⭐ FIX: rebuild port map dynamically
    this._buildPortMap();
		
		// Optionally re-log:
		// this.log("Ports detected: " + JSON.stringify(this.portInfo));
  }

	_registerPort(portId, ioType) {
			let type = "unknown";

			switch (ioType) {

					// ------------------------------------------------------------
					// Simple / Legacy Motors (Direct Power)
					// These do not support speed/degree commands; they use 0x51.
					// ------------------------------------------------------------
					case 0x0001: // Simple Medium Motor (88008)
							type = "motorSimple";
							break;

					case 0x0002: // Train Motor (88011)
							type = "motorSimple"; // also no tacho
							break;


					// ------------------------------------------------------------
					// Classic LPF2 Linear Motors (with tacho)
					// ------------------------------------------------------------
					// case 0x0015: // Medium Linear Motor
					// case 0x0016: // Large Linear Motor
					// 		type = "motorTacho";
					// 		break;


					// ------------------------------------------------------------
					// Modern Tacho Motors (Technic, SPIKE, Inventor)
					// These support StartSpeed (0x07) and MoveForDegrees (0x0B).
					// ------------------------------------------------------------
					case 0x002E: // 46 Technic Large Motor (88013)
					case 0x002F: // 47 Technic XL Motor (88014)
					case 0x0030: // 48 SPIKE Prime Medium Motor
					case 0x0031: // 49 SPIKE Prime Large Motor
					case 0x0041: // 65 Technic Small Angular Motor
					case 0x004B: // 75 Technic Medium Angular Motor, gray
					case 0x004C: // 76 Technic Large Angular motor, gray
					case 0x0056: // 86 Technic Move Hub 88019 Integrated Motor A/B
					case 0x0057: // 87 Technic Move Hub 88019 Integrated Motor C
							type = "motorTacho";
							break;


					// ------------------------------------------------------------
					// LWP3 r17 — Tacho Motor Definitions
					// 0x26 = External Motor with Tacho
					// 0x27 = Internal Motor with Tacho
					// ------------------------------------------------------------
					case 0x0026: // 38 External Tacho Motor
					case 0x0027: // 39 Internal Tacho Motor (Boost internal motors)
							type = "motorTacho";
							break;


					// ------------------------------------------------------------
					// Sensors & Accessories
					// ------------------------------------------------------------

					case 0x0005: // Button
							type = "button";
							break;

					case 0x0008: // LED Light (88005)
					case 0x0058: // 88 Technic Move Hub (88019) 6-LED Head/Tail Lights (Port 3)
							type = "light";
							break;

					case 0x0014: // 20 Powered Up Hub battery voltage
							type = "volt";
							break;

					case 0x0015: // 21 Powered Up Hub battery current
							type = "current";
							break;

					case 0x0016: // 22 Powered Up Hub piezo tone
							type = "sound";
							break;

					case 0x0017: // 23 Powered Up Hub indicator light
							type = "rgb";
							break;

					case 0x0022: // 34 WeDo 2.0 Tilt Sensor
							type = "tilt";
							break;

					case 0x0023: // 35 WeDo 2.0 Motion Sensor
							type = "distance";
							break;

					case 0x0024: // 36 WeDo 2.0 generic device
							type = "distance";
							break;

					case 0x0025: // 37 BOOST Color and Distance Sensor
							type = "colorDistance";
							break;

					case 0x0028: // 40 BOOST Move Hub built-in accelerometer (tilt sensor)
							type = "tiltMulti";
							break;


					// ------------------------------------------------------------
					// Modern Spike / Inventor Sensors
					// ------------------------------------------------------------
					case 0x003D: // 61 Spike Color Sensor
							type = "color";
							break;

					case 0x003E: // 62 Spike Ultrasonic Distance Sensor
							type = "distance";
							break;

					case 0x003F: // 63 Spike Force Sensor (Touch)
							type = "force";
							break;

					case 0x0040: // 64 Matrix Display (3x3 or 5x5)
							type = "matrix";
							break;


					// ------------------------------------------------------------
					// Internal Virtual Hub Ports
					// ------------------------------------------------------------
					case 0x0036: // 54 Powered Up hub IMU gesture
							type = "gesture";
							break;
					case 0x0037: // 55 Powered Up Handset Buttons
							type = "buttons";
							break;
					case 0x0038: // 56 Powered Up hub Bluetooth RSSI
							type = "rssi";
							break;
					case 0x0039: // 57 Powered Up hub IMU accelerometer
							type = "accelerometer";
							break;

					case 0x003A: // 58 Powered Up hub IMU gyro
							type = "gyro";
							break;

					case 0x003B: // 59 Powered Up hub IMU position
							type = "position";
							break;

					case 0x003C: // 60 Powered Up hub IMU temperature
							type = "temperature";
							break;

					default:
							break;
			}

			this.portInfo[portId] = { ioType, type };
			this.portInfo[portId].cmdFbkSts = 0; // for motors, tracks whether command feedback
	}

	_handlePortValueSingle(msg) {
			const port = msg[3];
			const payload = msg.subarray(4);

			const info = this.portInfo[port];
			if (!info) return;

			// Handset buttons: decode the key code directly so it works even before the
				// ioType 55 profile has been learned/pasted. Mode 0 = key code (Int8).
				if (info.type === "buttons" && msg.length >= 5 && (this.activeMode[port] ?? 0) === 0) {
					this._handleHandsetKey(port, (msg[4] << 24) >> 24);
				}

				// No active mode yet → ignore early values
			const mode = this.activeMode[port];
			if (mode == null) return;

			// Mode table not ready yet
			if (!info.modes) return;

			const modeInfo = info.modes[mode];
			if (!modeInfo) return;

			const vf = modeInfo.valueFormat;
			if (!vf) return;

			const values = [];
			let offset = 0;

			// Ensure payload is long enough for expected data
			const bytesNeeded =
					vf.count *
					(vf.type === "Int8" ? 1 :
					vf.type === "Int16" ? 2 :
					vf.type === "Int32" ? 4 :
					vf.type === "Float32" ? 4 : 0);

			if (payload.length < bytesNeeded) {
					// Ignore incomplete early messages
					return;
			}

			for (let i = 0; i < vf.count; i++) {
					let v = 0;

					switch (vf.type) {
							case "Int8":
									v = (payload[offset] << 24) >> 24;
									offset += 1;
									break;

							case "Int16":
									v = (payload[offset] | (payload[offset+1] << 8));
									if (v & 0x8000) v |= 0xFFFF0000;
									offset += 2;
									break;

							case "Int32":
									v = (payload[offset] |
											(payload[offset+1] << 8) |
											(payload[offset+2] << 16) |
											(payload[offset+3] << 24));
									offset += 4;
									break;

							case "Float32":
									v = new DataView(payload.buffer, payload.byteOffset + offset, 4)
													.getFloat32(0, true);
									offset += 4;
									break;

							default:
									return; // unknown type
					}

					values.push(v);
			}

			// Store parsed values
			this.portValues[port] = (vf.count === 1 ? values[0] : values);

			// Remember that a real value arrived in this mode and wake up anyone waiting for it
			this._valueModeOf[port] = mode;
			(this._valueAt ||= {})[port] = performance.now();
			if (info.ioType === 93) this._looksLive(93, this.portValues[port]);   // records that the IMU is awake
			const waiting = this._valueWaiters[port];
			if (waiting && waiting.length) {
				this._valueWaiters[port] = [];
				for (const wake of waiting) wake();
			}

			// Motor encoder convenience
			if (info.type === "motorTacho" && vf.type === "Int32") {
					this.rot[port] = values[0];
			}
	}

  _handlePortValueCombined(msg) {
    // For now, we ignore combined values; can be extended later.
  }

  _booleanFromValue(portId, value) {
    const info = this.portInfo[portId];
    if (!info) return !!value;
    switch (info.type) {
      case "tilt":
      case "tiltMulti":
      case "distance":
      case "colorDistance":
      case "force":
        return value > 0;
      default:
        return !!value;
    }
  }

	/**
	 * Create a combined virtual port (AB, CD, etc.)
	 * Works for Technic Hub, Powered Up Hub, City Hub.
	 * Ignored for Boost and Spike (they auto-create combined ports).
	 *
	 * @param {string|number} portName1 - e.g. "A" or 0
	 * @param {string|number} portName2 - e.g. "B" or 1
	 * @returns {Promise<number|null>} virtual port ID (0x10, 0x11, etc.)
	 */
	async createCombinedPort(portName1, portName2) {
			const hub = this.hubType;

			// Hubs that auto-create combined ports → do nothing
			if (hub === 0x40 || hub === 0x83 || hub === 0x81) {
					this.log("Hub auto-creates combined ports; skipping manual creation.");
					return null;
			}

			// Hubs that do NOT support combined mode
			if (hub === 0x83) {
					this.log("Spike Essential does not support combined ports.");
					return null;
			}

			// Resolve ports
			const p1 = this._resolvePort(portName1);
			const p2 = this._resolvePort(portName2);

			const hubId = this.hubId || 0x00;

			// LPF2 "Port Combination Setup" command
			const msg = new Uint8Array([
					0x06,       // length
					hubId,      // hub ID
					0x61,       // Port Output Command: Port Combination Setup
					0x01,       // subcommand: create virtual port
					p1 & 0xFF,  // port 1
					p2 & 0xFF   // port 2
			]);

			this.log(`Requesting combined port for ${portName1}+${portName2}...`);
			await this._write(msg);

			// Wait for hub to announce the virtual port
			const virtualPort = await this._waitForVirtualPort(p1, p2);

			if (virtualPort != null) {
					this.log(`Combined port created: ${virtualPort}`);
					return virtualPort;
			}

			this.log("Combined port creation timed out.");
			return null;
	}

	/**
	 * Wait for a virtual port that combines p1 and p2.
	 * Works for Technic, Powered Up, City hubs.
	 */
	_waitForVirtualPort(p1, p2) {
			return new Promise(resolve => {
					const start = performance.now();

					const check = () => {
							for (const portStr of Object.keys(this.portInfo)) {
									const portId = Number(portStr);
									const info = this.portInfo[portId];

									if (!info) continue;

									// Virtual ports are >= 0x10
									if (portId >= 0x10 && info.ioType === 0x0027) {
											// We cannot always check p1/p2 from ioType,
											// but hubs typically send correct mapping.
											resolve(portId);
											return;
									}
							}

							if (performance.now() - start > 1000) {
									resolve(null);
									return;
							}

							requestAnimationFrame(check);
					};

					check();
			});
	}

	_findMode(port, keywords) {
			const info = this.portInfo[port];
			if (!info || !info.modes) return 0;

			const modes = info.modes;

			// 1. Prefer RELATIVE position (POS)
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "pos") return Number(mode);
			}

			// 2. Then absolute position (APOS)
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "apos") return Number(mode);
			}

			// 3. Then speed
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					if (name === "speed") return Number(mode);
			}

			// 4. Fallback: keyword search
			for (const mode in modes) {
					const name = modes[mode].name?.toLowerCase() ?? "";
					for (const key of keywords) {
							if (name.includes(key)) {
									return Number(mode);
							}
					}
			}

			return 0;
	}

	_decodeString(bytes) {
			return String.fromCharCode(...bytes).replace(/\0/g, "");
	}


  // ---------------- Public API: Inputs ----------------

	_getDefaultMode(port) {
			const info = this.portInfo[port];
			if (!info) return 0;

			const t = info.type;
			return this.defaultSensorModes[t] ?? 0;
	}

	async _ensureMode(port, desiredMode) {
			const current = this.activeMode[port];

			if (current === desiredMode) {
					return;
			}

			await this._setInputFormat(port, desiredMode, 1, 1);

			// Give hub time to switch modes
			await new Promise(r => setTimeout(r, 20));
	}

	/**
	 * Does a reading look like real sensor data? A stuck/idle IMU reports all zeros.
	 * ioType 93 (Technic Move hub orientation) is a unit quaternion scaled by 1000: 4 values whose
	 * length stays at ~1000 (measured 999.0 .. 1000.1 over 236 real frames). Other types: accepted as is.
	 */
	_looksLive(ioType, value) {
		if (ioType === 93) {
			if (!Array.isArray(value) || value.length !== 4) return false;
			const ok = Math.abs(Math.hypot(value[0], value[1], value[2], value[3]) - 1000) <= 100;
			if (ok) this._imuLive = true;
			return ok;
		}
		// Tilt (ioType 59) is computed by the same IMU: all zeros while the IMU sleeps. Only believe zeros
		// once the orientation port has proven the IMU is awake (a flat hub is then genuinely 0,0,0).
		if (ioType === 59 && Array.isArray(value) && value.every(v => v === 0)) return !!this._imuLive;
		return true;
	}

	/**
	 * Read a sensor value that really came from the hub, and only a value that arrived AFTER this call
	 * started (never the last cached one: a frozen sensor must produce an error, not an old number).
	 * Subscribes once if needed, then asks the hub for the current value (read-only request) every
	 * pollMs until a plausible fresh frame arrives. Fails (console error, and an exception unless
	 * LPF2_SENSOR.throwOnTimeout is false) after LPF2_SENSOR.timeoutMs.
	 */
	async _readSensor(port, mode, label = "sensor", opts = {}) {
		const cfg = { ...LPF2_SENSOR, ...opts };
		const t0 = performance.now();
		const left = () => cfg.timeoutMs - (performance.now() - t0);
		const since = () => Math.round((performance.now() - (this._connectedAt ?? t0)) / 1000);

		const fail = (why) => {
			const text = `${label}: no value from port ${port} (${why}) after ${Math.round(performance.now() - t0)} ms (${since()} s since connect)`;
			console.error(`[LPF2] ${text}`);
			this.log(text);
			if (cfg.throwOnTimeout) throw new Error(text);
			return undefined;
		};

		const info = this.portInfo[port];
		if (!info) return fail("port not attached");

		// Values are silently dropped until the mode table (value format) is known
		while (!this.portInfo[port]?.modes?.[mode]?.valueFormat) {
			if (!this.portInfo[port]) return fail("port detached");
			if (left() <= 0) return fail("mode information not available yet");
			await _sleep(50);
		}

		const ioType = info.ioType;
		// A frame newer than `t` that looks like real data?
		const freshSince = (t) => (this._valueAt?.[port] ?? 0) >= t && this._valueModeOf[port] === mode &&
			this.portValues[port] !== undefined && this._looksLive(ioType, this.portValues[port]);

		const TIMED_OUT = Symbol("timed out");
		const bounded = (promise) => new Promise((resolve, reject) => {
			const timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, left()));
			promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
		});
		const ask = () => this._write(new Uint8Array([0x05, this.hubId || 0x00, 0x21, port, 0x00])); // Port Information Request: Port Value

		// Subscribe once (no-op for the hub if it already is subscribed to this mode)
		try {
			if (this._valueModeOf[port] !== mode || this.activeMode[port] !== mode) {
				if (await bounded(this._setInputFormat(port, mode, 1, 1, { wait: true })) === TIMED_OUT) return fail("the Bluetooth write queue is busy");
			}
		} catch (err) { this.log(`${label}: subscribe failed: ${err?.message || err}`); }

		let asked = 0, lastFrame = 0;
		for (;;) {
			if (!this.char) return fail("hub disconnected");
			if (left() <= 0) break;
			const tAsk = performance.now();
			try { if (await bounded(ask()) === TIMED_OUT) return fail("the Bluetooth write queue is busy"); asked++; }
			catch (err) { this.log(`${label}: value request failed: ${err?.message || err}`); }
			// wait for a frame newer than this request
			const until = tAsk + (asked === 1 ? cfg.firstWaitMs : cfg.pollMs);
			while (performance.now() < until && left() > 0) {
				if (freshSince(tAsk)) {
					this.log(`${label}: value ${JSON.stringify(this.portValues[port])} arrived after ${Math.round(performance.now() - t0)} ms (${since()} s since connect)`);
					return this.portValues[port];
				}
				await _sleep(15);
			}
		}
		const got = (this._valueAt?.[port] ?? 0) >= t0 && this._valueModeOf[port] === mode ? this.portValues[port] : undefined;
		if (got !== undefined) return fail(`the hub only returns invalid data ${JSON.stringify(got)} (its IMU is probably still asleep)`);
		return fail("the hub did not send a fresh value: its sensor stream looks frozen");
	}

	async getDistance(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["prox", "distance", "dist", "range", "distl"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getColor(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["color"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getTilt(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["tilt", "angle","lpf2-angle"]);

			const value = await this._readSensor(port, mode, "getTilt");
			return value ?? [0,0];
	}

	async getIMU(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["acc", "gyro", "imu"]);

			const value = await this._readSensor(port, mode, "getIMU");
			return value ?? [0,0,0];
	}

	async getForce(portName) {
			const port = this._resolvePort(portName);

			const mode = this._findMode(port, ["force", "press", "touch"]);
			await this._ensureMode(port, mode);

			return this.portValues[port] ?? 0;
	}

	async getRot(portName) {
			const port = this._resolvePort(portName);

			// Prefer RELATIVE position
			const mode = this._findMode(port, ["pos", "angle", "rot"]);
			await this._ensureMode(port, mode);

			return this.rot[port] ?? 0;
	}


	getRaw(portName) {
			const port = this._resolvePort(portName);
			return this.portValues[port];
	}

	getMode(portName) {
			const port = this._resolvePort(portName);
			return this.activeMode[port];
	}

	getModeInfo(portName, mode) {
			const port = this._resolvePort(portName);
			return this.portInfo[port]?.modes?.[mode] ?? null;
	}

	getValueFormat(portName, mode) {
			const port = this._resolvePort(portName);
			return this.portInfo[port]?.modes?.[mode]?.valueFormat ?? null;
	}

	async setSensorMode(portName, mode) {
			const port = this._resolvePort(portName);
			await this._setInputFormat(port, mode, 1, 1);
	}


  // ---------------- Public API: Motors ----------------

	_buildPortMap() {
			this.userPortMap = {};

			const type = this.hubType;

			// ------------------------------------------------------------
			// BOOST MOVE HUB (0x40)
			// ------------------------------------------------------------
			if (type === 0x40) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					// Boost ALWAYS has combined ports AB and CD
					this.userPortMap.AB = 0x10;
					this.userPortMap.CD = 0x11;
					
					// internal tilt (Boost) – usually 58
					if (this.portInfo[58]) this.userPortMap.TILT = 58;

					return;
			}

			// ------------------------------------------------------------
			// CITY HUB (0x41) – 2-port hub
			// ------------------------------------------------------------
			if (type === 0x41) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					return;
			}

			// ------------------------------------------------------------
			// REMOTE (0x42) – handheld remote, usually buttons only
			// ------------------------------------------------------------
			if (type === 0x42) {
					if (this.portInfo[0]) this.userPortMap.A = 0;       // left  group: + / red / -
					if (this.portInfo[1]) this.userPortMap.B = 1;       // right group: + / red / -
					if (this.portInfo[52]) this.userPortMap.LED = 52;   // indicator LED
					if (this.portInfo[59]) this.userPortMap.VOLT = 59;  // battery voltage
					if (this.portInfo[60]) this.userPortMap.RSSI = 60;  // bluetooth signal
					return;
			}

			// ------------------------------------------------------------
			// DUPLO (0x44) – Duplo Train Hub
			// ------------------------------------------------------------
			if (type === 0x44) {
					if (this.portInfo[0]) this.userPortMap.A = 0; // motor
					if (this.portInfo[1]) this.userPortMap.B = 1; // color sensor
					return;
			}

			// ------------------------------------------------------------
			// TECHNIC SMALL (0x45) – 2-port Technic hub
			// ------------------------------------------------------------
			if (type === 0x45) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					return;
			}

			// ------------------------------------------------------------
			// TECHNIC HUB (0x80) – 4-port Technic
			// ------------------------------------------------------------
			if (type === 0x80) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					if (this.portInfo[0x10]) this.userPortMap.AB = 0x10;
					if (this.portInfo[0x11]) this.userPortMap.CD = 0x11;
					
					if (this.portInfo[97]) this.userPortMap.ACC = 97;  // internal imu-accelerometer
					if (this.portInfo[98]) this.userPortMap.GYRO = 98;  // internal imu-gyro
					if (this.portInfo[99]) this.userPortMap.TILT = 99;  // internal imu-tilt
					if (this.portInfo[100]) this.userPortMap.GEST = 100;  // internal imu-Gesture, 0 — None / Flat / Stationary, 1 — Tap / Bump, 2 — Free Fall, 3 — Shake, 4 — Impact / Crash

					return;
			}

			// ------------------------------------------------------------
			// INVENTOR HUB (0x81) – 6-port
			// ------------------------------------------------------------
			if (type === 0x81) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;
					if (this.portInfo[4]) this.userPortMap.E = 4;
					if (this.portInfo[5]) this.userPortMap.F = 5;

					// internal IMU – usually 98
					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// SPIKE PRIME (0x82) – 6-port
			// ------------------------------------------------------------
			if (type === 0x82) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;
					if (this.portInfo[4]) this.userPortMap.E = 4;
					if (this.portInfo[5]) this.userPortMap.F = 5;

					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// SPIKE ESSENTIAL (0x83) – 4-port
			// ------------------------------------------------------------
			if (type === 0x83) {
					if (this.portInfo[0]) this.userPortMap.A = 0;
					if (this.portInfo[1]) this.userPortMap.B = 1;
					if (this.portInfo[2]) this.userPortMap.C = 2;
					if (this.portInfo[3]) this.userPortMap.D = 3;

					if (this.portInfo[98]) this.userPortMap.IMU = 98;

					return;
			}

			// ------------------------------------------------------------
			// Technic Move Hub (0x84) – 3-motor ports, 6 LEDs, IMU etc
			// ------------------------------------------------------------
			if (type === 0x84) { // Technic Move Hub 88019 (3 integrated motors, 6 LEDs, IMU)
				// Map by what the hub really announced (ioType) and store the REAL port id.
				// (The old code tested portInfo[50..57] but stored 0..4, so B and C were
				//  only mapped if unrelated ports happened to exist.)
				const portsOf = (io) => Object.keys(this.portInfo)
					.map(Number)
					.filter(p => this.portInfo[p].ioType === io)
					.sort((a, b) => a - b);

				const drive    = portsOf(0x56); // 86: integrated motor A/B (drive)
				const steering = portsOf(0x57); // 87: integrated motor C (steering servo)
				const leds     = portsOf(0x58); // 88: 6-LED head/tail lights
				const imu      = portsOf(0x5D); // 93: orientation (IMU)
				const playVm   = portsOf(0x59); // 89: drive VM (needs an encrypted link; do not poke)
				const tilt     = portsOf(0x3B); // 59: tilt sensor (internal)
				const gyro	   = portsOf(0x3A); // 58: gyro sensor (internal)

				if (drive[0]    != null) this.userPortMap.A = drive[0];
				if (drive[1]    != null) this.userPortMap.B = drive[1];
				if (steering[0] != null) this.userPortMap.C = steering[0];
				if (leds[0]     != null) this.userPortMap.LEDS = leds[0];
				if (imu[0]      != null) this.userPortMap.IMU = imu[0];
				if (playVm[0]   != null) this.userPortMap.DRIVEVM = playVm[0];
				if (tilt[0]     != null) this.userPortMap.TILT = tilt[0];
				if (gyro[0]     != null) this.userPortMap.GYRO = gyro[0];
				// Combined AB only exists if the hub announced a virtual port for it
				if (this._virtualPorts?.[0x10]) this.userPortMap.AB = 0x10;
				return;
			}

			// ------------------------------------------------------------
			// Fallback – assume A–D on 0..3
			// ------------------------------------------------------------
			if (this.portInfo[0]) this.userPortMap.A = 0;
			if (this.portInfo[1]) this.userPortMap.B = 1;
			if (this.portInfo[2]) this.userPortMap.C = 2;
			if (this.portInfo[3]) this.userPortMap.D = 3;
	}

	_resolvePort(port) {
			// Allow numeric ports directly
			if (typeof port === "number") return port;

			// Convert string ports like "A", "B", "CD", "TILT", "IMU"
			if (typeof port === "string") {
					const p = this.userPortMap[port.toUpperCase()];
					if (p != null) return p;
			}

			throw new Error("Unknown port: " + port);
	}

	_setupMotorCaps() {
		const type = this.hubType;

		this.motorCaps = {
			power: true,
			speed: true,
			angle: false,
			goto: false,
			time: false,
			combined: !!(this.userPortMap.AB || this.userPortMap.CD)
		};

		if (type === 0x41 || type === 0x44 || type === 0x43 || type === 100 || type === 0x80 || type === 0x84) {
			this.motorCaps.angle = true;
			this.motorCaps.goto  = true;
			this.motorCaps.time  = true;
		}

		if (type === 0x42) {
			this.motorCaps.angle = false;
			this.motorCaps.goto  = false;
			this.motorCaps.time  = false;
		}

		// Technic Move Hub: power control is known to work; "go to absolute position" is reported
		// to be rejected or even crash the hub (Pybricks discussion #1733), so it is switched off.
		if (type === 0x84) {
			this.motorCaps.goto = false;
		}
	}

	async waitForMotorCompletion(port, timeoutMs = 120000) {
		return new Promise((resolve, reject) => {
			const start = performance.now();

			const check = () => {
				// ⭐ STOP button pressed → abort wait immediately
				if (window.stopRequested) {
						return resolve();
				}

				const info = this.portInfo[port];
				if (!info) {
					// Port disappeared → resolve silently
					return resolve();
				}

				const sts = info.cmdFbkSts | 0;

				// 0x04 = discarded, 0x10 = busy/full → treat as error
				if (sts & 0x04) {
					info.cmdFbkSts = 0;
					return reject(new Error(`Motor command on port ${port} was discarded (0x04)`));
				}
				if (sts & 0x10) {
					info.cmdFbkSts = 0;
					return reject(new Error(`Motor command on port ${port} rejected (busy/full, 0x10)`));
				}

				// 0x02 = command completed
				if (sts & 0x02) {
					info.cmdFbkSts = 0;
					return resolve();
				}

				// Timeout
				if (performance.now() - start > timeoutMs) {
					return reject(new Error(`Motor command on port ${port} timed out`));
				}

				requestAnimationFrame(check);
			};

			check();
		});
	}

	async _sendMotorCommand(port, payload, { waitFbk = false, timeoutMs = 120000 } = {}) {
		if (!this.char) throw new Error("LPF2 not connected");

		port = this._resolvePort(port);
		const hubId = this.hubId || 0x00;

		// If we want feedback, clear previous status
		if (waitFbk && this.portInfo[port]) {
			this.portInfo[port].cmdFbkSts = 0;
		}

		// Build full message: [len][hubId][0x81][port][startup/feedback][...payload]
		const msg = new Uint8Array(5 + payload.length);
		msg[0] = msg.length;
		msg[1] = hubId;
		msg[2] = MSG_PORT_OUTPUT_COMMAND;
		msg[3] = port & 0xFF;
		msg[4] = waitFbk ? 0x11 : 0x10; // Execute Immediately + (optional) Command Feedback Status

		msg.set(payload, 5);

		// Remember the last output command so a hub error can be matched to it
		this._lastOut = { port: port & 0xFF, sub: payload[0], t: performance.now() };
		if (LPF2_DEBUG.motors) {
			const portName = Object.keys(this.userPortMap || {}).find(k => this.userPortMap[k] === port);
			this.log(`TX motor port ${port}${portName ? ` (${portName})` : ""}: ` +
				Array.from(msg).map(b => b.toString(16).padStart(2, "0")).join(" "));
		}

		await this._write(msg);

		if (waitFbk) {
			await this.waitForMotorCompletion(port, timeoutMs);
		}
	}


	// ------------------ Motor Commands ----------------

	async motorPower(port, power) {
		power = Math.max(-127, Math.min(127, power | 0));

		// StartPower (0x01) takes ONE value byte in the LWP3 spec. The extra "profile" byte below is
		// tolerated by older hubs, but the Technic Move hub is strict, so send the exact form there.
		const payload = this.hubType === 0x84
			? new Uint8Array([SUBCMD_START_POWER, power & 0xFF])
			: new Uint8Array([SUBCMD_START_POWER, power & 0xFF, 0x00 /* profile */]);

		await this._sendMotorCommand(port, payload, { waitFbk: false });
	}

	async motorSpeed(port, speed, maxPower = 100, useProfile = 0x00) {
		speed = Math.max(-100, Math.min(100, speed | 0));
		maxPower = Math.max(0, Math.min(100, maxPower | 0));

		const payload = new Uint8Array([
			SUBCMD_START_SPEED,
			speed & 0xFF,
			maxPower & 0xFF,
			useProfile & 0xFF
		]);

		await this._sendMotorCommand(port, payload, { waitFbk: false });
	}

	async motorAngle(port, angle, speed, endState = 0x00, useProfile = 0x00, waitFbk = true) {
		const a = angle | 0;
		speed = Math.max(-100, Math.min(100, speed | 0));

		const payload = new Uint8Array([
			SUBCMD_START_SPEED_FOR_DEGREES,

			// Degrees (Int32 LE)
			a & 0xFF,
			(a >> 8) & 0xFF,
			(a >> 16) & 0xFF,
			(a >> 24) & 0xFF,

			speed & 0xFF,   // signed speed
			100,            // MaxPower
			endState & 0xFF,
			useProfile & 0xFF
		]);

		await this._sendMotorCommand(port, payload, { waitFbk });
	}

	async motorGoto(port, position, speed, endState = 0x7F, useProfile = 0x00, waitFbk = true) {
		// Technic Move Hub: GotoAbsolutePosition is reported to be rejected or to crash the hub
		// (Pybricks discussion #1733). Refuse it with a clear message instead of risking a freeze.
		if (this.hubType === 0x84 && !this.allowMoveHubGoto) {
			throw new Error("Go-to-position is not supported on the Technic Move hub (it can crash the hub). " +
				"Use motor power / speed instead, or set hub.allowMoveHubGoto = true to try it anyway.");
		}

		// LPF3 spec: Speed must be 1..100
		if (speed <= 0) {
			return this.motorStop(port, endState === 0x7F);
		}
		if (speed > 100) speed = 100;

		const p = position | 0;

		const payload = new Uint8Array([
			SUBCMD_GOTO_ABS_POS,

			// AbsPos (Int32 LE)
			p & 0xFF,
			(p >> 8) & 0xFF,
			(p >> 16) & 0xFF,
			(p >> 24) & 0xFF,

			speed & 0xFF,   // Speed (1..100)
			100,            // MaxPower
			endState & 0xFF,
			useProfile & 0xFF
		]);

		await this._sendMotorCommand(port, payload, { waitFbk });
	}

	async resetPosition(port, newPos = 0) {
		const p = newPos | 0;

		const payload = new Uint8Array([
			0x51,  // WriteDirectModeData
			0x02,  // Mode 2 = POS (relative position)

			p & 0xFF,
			(p >> 8) & 0xFF,
			(p >> 16) & 0xFF,
			(p >> 24) & 0xFF
		]);

		await this._sendMotorCommand(port, payload, { waitFbk: false });
	}
	
	async motorTime(port, ms, speed, endState = 0x00, useProfile = 0x00, waitFbk = true) {
		const t = ms | 0;
		speed = Math.max(-100, Math.min(100, speed | 0));

		const payload = new Uint8Array([
			SUBCMD_START_SPEED_FOR_TIME,

			// Time (Int16 LE, ms)
			t & 0xFF,
			(t >> 8) & 0xFF,

			speed & 0xFF,   // Speed (signed)
			100,            // MaxPower
			endState & 0xFF,
			useProfile & 0xFF
		]);

		await this._sendMotorCommand(port, payload, { waitFbk });
	}

	async motorStop(port, brake = 0) {
		const value = brake ? 0x7F : 0x00;

		// Technic Move Hub: use StartPower (0 = float, 127 = brake); power control is reported to work on it
		const payload = this.hubType === 0x84
			? new Uint8Array([SUBCMD_START_POWER, value])
			: new Uint8Array([
				0x51,  // WriteDirectModeData
				0x00,  // Mode 0 = speed
				value  // 0 = float, 127 = brake
			]);

		await this._sendMotorCommand(port, payload, { waitFbk: false });
	}

	stopAllMotors() {
		const hubId = this.hubId || 0x00;

		// Technic Move Hub: only the three integrated motors, with StartPower 0 (float).
		// Never write to the LED / IMU / drive-VM ports (writes to internal ports can freeze this hub).
		if (this.hubType === 0x84) {
			for (const key of ["A", "B", "C"]) {
				const port = this.userPortMap[key];
				if (port == null || !this.portInfo[port]) continue;
				this._sendMotorCommand(port, new Uint8Array([SUBCMD_START_POWER, 0x00]), { waitFbk: false })
					.catch(() => {});
			}
			return;
		}

		for (const key of Object.keys(this.userPortMap)) {
			const port = this.userPortMap[key];
			if (port == null) continue;

			const info = this.portInfo[port];
			if (!info) continue;

			// Only stop motors / lights / sound if you want
			if (info.type !== "motorSimple" &&
					info.type !== "motorTacho" &&
					info.type !== "rgb" &&
					info.type !== "sound" &&
					info.type !== "light") {
				continue;
			}

			const payload = new Uint8Array([
				0x51,  // WriteDirectModeData
				0x00,  // Mode 0 = speed
				0x00   // float
			]);

			// Fire-and-forget, no await
			this._sendMotorCommand(port, payload, { waitFbk: false });
		}
	}


  // =====================================================================
  //  Buttons — Handset (88010: 3 buttons on port A, 3 on port B, + green button)
  //  Also works for the hub button of other hubs (reported as "GREEN").
  //
  //  Button names:  A_PLUS  A_RED  A_MINUS  B_PLUS  B_RED  B_MINUS  GREEN
  //  Accepted spellings: "A+", "a plus", "A_PLUS", "left red", "B-", "green", "hub" ...
  //
  //  Port A and port B are reported on separate hub ports, so one key on A and one key
  //  on B can be held at the same time. Within one side the handset reports a single key.
  // =====================================================================

  _normButtonName(name) {
    let s = String(name ?? "").trim().toUpperCase();
    s = s.replace(/^LEFT/, "A").replace(/^RIGHT/, "B");
    s = s.replace(/\+/g, "_PLUS").replace(/[-−]/g, "_MINUS");
    s = s.replace(/[\s_]+/g, "_");
    s = s.replace(/^([AB])(PLUS|MINUS|RED|UP|DOWN|STOP)/, "$1_$2");
    s = s.replace(/_UP$/, "_PLUS").replace(/_DOWN$/, "_MINUS").replace(/_STOP$/, "_RED");
    if (s === "HUB" || s === "HUB_BUTTON" || s === "GREEN_BUTTON") s = "GREEN";
    if (!HANDSET_BUTTONS.includes(s)) {
      throw new Error(`Unknown button: ${name} (use ${HANDSET_BUTTONS.join(", ")})`);
    }
    return s;
  }

  _setButtonState(name, pressed) {
    if (this.buttons[name] === pressed) return;
    this.buttons[name] = pressed;
    if (pressed) this._buttonLatch[name] = true;

    const detail = { device: this, button: name, pressed };
    for (const cb of this._buttonListeners) {
      try { cb(detail); } catch (e) { this.log("Button listener error: " + (e?.message || e)); }
    }
    if (typeof document !== "undefined" && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(new CustomEvent("lpf2-button", { detail }));
    }
  }

  // Handset key code on a button port: 0 = released, 1 = plus, 0x7F = red, 0xFF (-1) = minus
  _handleHandsetKey(port, code) {
    let side = null;
    if (port === this.userPortMap.A) side = "A";
    else if (port === this.userPortMap.B) side = "B";
    else if (port === 0) side = "A";
    else if (port === 1) side = "B";
    if (!side) return;

    const key = code === 1 ? "PLUS" : code === -1 ? "MINUS" : code === 0x7F ? "RED" : null;
    this.handsetKey[side] = key ?? "NONE";

    for (const k of ["PLUS", "RED", "MINUS"]) {
      this._setButtonState(`${side}_${k}`, key === k);
    }
  }

  // Hub Properties: Button (0x02) → Enable Updates, then ask for the current state
  async enableHubButton() {
    await this._write(new Uint8Array([0x05, this.hubId, 0x01, 0x02, 0x02]));
    await this._write(new Uint8Array([0x05, this.hubId, 0x01, 0x02, 0x05]));
  }

  /** true while the button is held down */
  isButtonPressed(name) {
    return !!this.buttons[this._normButtonName(name)];
  }

  /** true once per press since the last call (does not miss quick taps between polls) */
  wasButtonPressed(name) {
    const n = this._normButtonName(name);
    const v = !!this._buttonLatch[n];
    this._buttonLatch[n] = false;
    return v;
  }

  clearButtonLatch() {
    this._buttonLatch = {};
  }

  /** e.g. ["A_PLUS", "B_RED"] */
  getPressedButtons() {
    return HANDSET_BUTTONS.filter(n => this.buttons[n]);
  }

  /** key currently held on one side: "PLUS" | "RED" | "MINUS" | "NONE" */
  getHandsetKey(side) {
    const s = this._normButtonName(String(side) + "_RED").slice(0, 1); // accepts "A", "B", "left", "right"
    return this.handsetKey[s];
  }

  /** Subscribe to changes. cb({ button, pressed, device }). Returns an unsubscribe function. */
  onButton(cb) {
    this._buttonListeners.add(cb);
    return () => this._buttonListeners.delete(cb);
  }

  /** Resolves true when the button reaches the wanted state, false on timeout / STOP / disconnect. */
  waitForButton(name, { pressed = true, timeoutMs = 0 } = {}) {
    const n = this._normButtonName(name);
    return new Promise(resolve => {
      const start = performance.now();
      const tick = () => {
        if (this.buttons[n] === pressed) return resolve(true);
        if ((typeof window !== "undefined" && window.stopRequested) || !this.char) return resolve(false);
        if (timeoutMs > 0 && performance.now() - start > timeoutMs) return resolve(false);
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  /** Resolves with the name of the next button pressed (or null on timeout / STOP / disconnect). */
  waitForAnyButton({ timeoutMs = 0 } = {}) {
    this._buttonLatch = {};
    return new Promise(resolve => {
      const start = performance.now();
      const tick = () => {
        const hit = HANDSET_BUTTONS.find(n => this._buttonLatch[n]);
        if (hit) return resolve(hit);
        if ((typeof window !== "undefined" && window.stopRequested) || !this.char) return resolve(null);
        if (timeoutMs > 0 && performance.now() - start > timeoutMs) return resolve(null);
        setTimeout(tick, 20);
      };
      tick();
    });
  }

  // =====================================================================
  //  Hub indicator LED (Handset port 52, also Technic/City/etc. RGB light)
  //  Mode 0 = color index (0..10), Mode 1 = RGB (3 bytes)
  // =====================================================================

  _findLedPort() {
    if (this.userPortMap.LED != null) return this.userPortMap.LED;
    for (const [id, info] of Object.entries(this.portInfo)) {
      if (info.type === "rgb") return Number(id);
    }
    return null;
  }

  async _setLedMode(port, mode) {
    if (this._ledMode[port] === mode) return;
    this._ledMode[port] = mode;
    // Port Input Format Setup: select the mode, notifications OFF (LED is output only)
    await this._write(new Uint8Array([0x0A, this.hubId, 0x41, port, mode, 1, 0, 0, 0, 0x00]));
  }

  /** color: index 0..10 or name: off, pink, purple, blue, lightblue, cyan, green, yellow, orange, red, white */
  async setLedColor(color) {
    const port = this._findLedPort();
    if (port == null) throw new Error("This hub has no indicator LED");

    const idx = typeof color === "number"
      ? color
      : LPF2_COLORS[String(color).toUpperCase().replace(/[\s_-]/g, "")];

    if (!((idx >= 0 && idx <= 10) || idx === 255)) throw new Error("Unknown LED color: " + color);

    await this._setLedMode(port, 0);
    await this._sendMotorCommand(port, new Uint8Array([0x51, 0x00, idx]), { waitFbk: false });
  }

  /** r, g, b: 0..255 */
  async setLedRGB(r, g, b) {
    const port = this._findLedPort();
    if (port == null) throw new Error("This hub has no indicator LED");

    const c = v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));

    await this._setLedMode(port, 1);
    await this._sendMotorCommand(port, new Uint8Array([0x51, 0x01, c(r), c(g), c(b)]), { waitFbk: false });
  }

  /** One entry point for Blockly: index, color name, "#rrggbb", [r,g,b] or {r,g,b} */
  async setLed(value) {
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())) {
      const h = value.trim();
      return this.setLedRGB(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));
    }
    if (Array.isArray(value) && value.length >= 3) return this.setLedRGB(value[0], value[1], value[2]);
    if (value && typeof value === "object") return this.setLedRGB(value.r, value.g, value.b);
    return this.setLedColor(value);
  }

  // ---------------- Technic Move Hub: the 6 lights (port 0x35) ----------------
  // Frame (seen in move-hub.site's log): 09 00 81 <port> 11 51 00 <mask> <brightness>
  //   mask = one bit per light (bit0 = light 1 ... bit5 = light 6), brightness 0..100 (0x64).
  // The hub applies the brightness to every light in the mask, so each light can have its own brightness.
  // Lights 1-4 are at the steering end, 5-6 at the rear (as numbered on move-hub.site). If a light does not
  // match its number, change LIGHT_BITS below.
  static LIGHT_BITS = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20];

  _lightsPort() { return this.userPortMap?.LEDS ?? 0x35; }

  async _lightsWrite(mask, brightness) {
    if (this.hubType !== 0x84) throw new Error("lights: only implemented for the Technic Move Hub");
    const b = Math.max(0, Math.min(100, Math.round(Number(brightness) || 0)));
    await this._write(new Uint8Array([0x09, this.hubId || 0x00, 0x81, this._lightsPort(), 0x11, 0x51, 0x00, mask & 0x3f, b]));
  }

  /** One light: setLight(3, 100). n = 1..6, brightness 0..100 (0 = off). */
  async setLight(n, brightness = 100) {
    const i = Number(n) - 1;
    if (!(i >= 0 && i < 6)) throw new Error("setLight: light number must be 1..6");
    await this._lightsWrite(LegoLPF2.LIGHT_BITS[i], brightness);
    (this._lightLevels ||= [0, 0, 0, 0, 0, 0])[i] = Math.max(0, Math.min(100, Number(brightness) || 0));
  }

  /**
   * Several lights at once. levels = array of 6 brightness values (index 0 = light 1), or an object
   * {1: 100, 3: 50}, or an array of light numbers [1,2,5] (= those lights at `brightness`).
   * Lights that are not mentioned are left as they are.
   */
  async setLights(levels, brightness = 100) {
    const out = {};   // light index -> brightness
    if (Array.isArray(levels) && levels.length === 6 && levels.some(v => v > 6 || v === 0)) levels.forEach((v, i) => out[i] = v);
    else if (Array.isArray(levels)) levels.forEach(n => out[Number(n) - 1] = brightness);
    else if (levels && typeof levels === "object") for (const [n, v] of Object.entries(levels)) out[Number(n) - 1] = v;
    else throw new Error("setLights: expected an array or an object");
    const groups = new Map();   // brightness -> mask (one frame per distinct brightness)
    for (const [i, v] of Object.entries(out)) {
      if (!(i >= 0 && i < 6)) throw new Error("setLights: light number must be 1..6");
      const b = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      groups.set(b, (groups.get(b) || 0) | LegoLPF2.LIGHT_BITS[i]);
      (this._lightLevels ||= [0, 0, 0, 0, 0, 0])[i] = b;
    }
    for (const [b, mask] of groups) await this._lightsWrite(mask, b);
  }

  async lightsOn(brightness = 100) { await this._lightsWrite(0x3f, brightness); this._lightLevels = Array(6).fill(Math.max(0, Math.min(100, brightness))); }
  async lightsOff() { await this._lightsWrite(0x3f, 0); this._lightLevels = Array(6).fill(0); }

  async ledOff() {
    return this.setLedColor(0);
  }

  // Convenience mapping for Blockly (string → brake mode)
  brakeModeFromString(mode) {
    switch ((mode || "").toLowerCase()) {
      case "float": return BRAKE_FLOAT;
      case "hold":  return BRAKE_HOLD;
      case "brake":
      default:      return BRAKE_BRAKE;
    }
  }
}

LegoLPF2.SENSOR = LPF2_SENSOR;
LegoLPF2.MOVEHUB = LPF2_MOVEHUB;