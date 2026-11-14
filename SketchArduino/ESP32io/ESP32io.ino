/*
  =============================================================================
  ESP32io: generic ESP32 I/O board for LEGO Blockly (ESP32io.ino)
  =============================================================================
  Powered by NimBLE-Arduino (https://github.com/h2zero/NimBLE-Arduino)

  Compatible with:
    - ESP32 (ESP-WROOM-32, ESP32 DevKitC, NodeMCU-32S)
    - ESP32-S3 (ESP32-S3 DevKitC-1)
    - ESP32 Arduino Core 3.x (tested to compile with 3.3.12)
    - NimBLE-Arduino 2.x (tested to compile with 2.5.1)

  What it does:
    The web app (driver device/DeviceESP32io.js, class ESP32io) tells the ESP32 what is wired
    on each GPIO (switch, sensor, LED, servo, H-bridge, encoder...), then reads and drives them.
    Nothing is stored except the BLE name and the motor calibrations: the pin setup is sent by the Blockly program,
    and everything is released when the PC connects or disconnects.

  Transport:
    Nordic UART Service (NUS) over BLE, plus the same commands on USB Serial (115200 baud,
    "Newline" line ending in the Serial Monitor). One command per line.
    The advertisement carries manufacturer data FF FF 'L' 'B' 'i' 'o' so the web app's
    device picker lists ESP32io boards whatever their name.

  Command format (PC -> ESP32):   [id] COMMAND args...
    id = number chosen by the PC, echoed in the reply.
         id 0 = "no reply on success" (fast fire-and-forget), errors are still sent.
         No id (typing in the Serial Monitor): the reply has no id either.

    HELLO                        -> OK ESP32io <fw version> <board> <ble name> <mac>
    PING                         -> OK
    CAPS                         -> OK <pin>:<flags> ... PWM=<n> ENC=<n>
                                    flags: I input, O output, A analog in (ADC1), D DAC, P internal pull-up/down
    RESET                        -> release every pin (outputs go to their "off" level)
    NAME <name>                  -> new BLE name (1-20 chars A-Z a-z 0-9 _ -), saved in flash,
                                    used the next time the board advertises (after a disconnect)
    RATE <ms>                    -> minimum time between two value reports (5-1000, default 20)
    WDT <ms>                     -> stop all outputs if no command arrives for <ms> (0 = off, default)

    CFG <pin> DIN [UP|DOWN|NONE] [HIGH|LOW] [debounce ms]
                                 -> digital input. HIGH/LOW = level that reads as 1.
                                    Defaults: NONE HIGH 10
    CFG <pin> DOUT [INV]         -> digital output (INV: 1 = LOW, for active-low relay boards)
    CFG <pin> PWM [freq]         -> PWM output, 0-100 % (default 1000 Hz)
    CFG <pin> AIN [delta]        -> analog input 0-4095, reported when it moves by >= delta (default 16)
    CFG <pin> DAC                -> true analog output 0-100 % (ESP32 GPIO 25 and 26 only)
    CFG <pin> SERVO [180|360] [min us] [max us]
                                 -> hobby servo (SG90...). 180: SET = angle 0-180.
                                    360 (continuous): SET = speed -100..100.
                                    Defaults: 180 -> 500..2400 us, 360 -> 1000..2000 us
    CFG <in1> HB2 <in2> [freq] [FAST|SLOW]
                                 -> H-bridge with 2 PWM inputs (DRV8833, MX1508, L9110S). Default 20000 Hz, FAST.
                                    SLOW decay brakes between PWM pulses instead of coasting (not on the L9110S,
                                    which cannot brake): better speed control, needed by the closed loop to slow down.
    CFG <en> HB3 <in1> <in2> [freq]
                                 -> H-bridge with enable + 2 direction pins (L298N, TB6612). Default 1000 Hz
                                    HB2/HB3: SET = power -100..100
    CFG <a> ENC <b> [X1|X2|X4] [UP|NONE]
                                 -> quadrature encoder counted by the PCNT hardware (default X4, pull-up on)
    REL <pin>                    -> release one port

    SET <pin> <value>            -> output value (see each type above)
    GET <pin>                    -> OK <value> (input: current value, output: last SET value)
    STOP [<pin>] [BRAKE|COAST]   -> outputs off (all ports, or one). H-bridges coast unless BRAKE.
                                    Servos stop receiving pulses (they relax).
    ZERO <pin> [preset]          -> set an encoder count (default 0)

  Closed-loop motors (H-bridge + encoder, the control loop runs here every 5 ms):
    LINK <motor> <enc>           -> link an H-bridge port to an encoder port (NONE unlinks)
                                    -> OK dir=<1|-1> ks=<%> top=<counts/s> tau=<ms> kstart=<%>   or OK NOCAL
                                    (ks: power that keeps it turning, kstart: power that starts it)
    CAL <motor>                  -> calibrate (the motor turns for about 6 s, up to full power).
                                    Replies OK at once, then "M <motor> CAL ..." or "M <motor> ERR ...".
                                    The result is saved in flash for this motor pin.
    MPAR <motor>                 -> OK <calibration> (as LINK)
    MPAR <motor> <dir> <ks> <top> <tau> [kstart] [SAVE]
                                 -> set the calibration by hand (top in counts/s with the current encoder mode)
    MPAR <motor> FORGET          -> erase the saved calibration
    RUN <motor> <speed>          -> keep a speed, -100..100 % of the calibrated top speed (0 = stop, brake)
    RUNT <motor> <ms> <speed> [BRAKE|COAST|HOLD] [tag]
                                 -> the same for <ms>, then stop (default BRAKE)
    MOVE <motor> REL|ABS <counts> <speed> [BRAKE|COAST|HOLD] [tag]
                                 -> go <counts> further (REL) or to the count <counts> (ABS), at 1..100 %
                                    of top speed (accelerate, cruise, decelerate), then stop (default BRAKE).
                                    REL counts from the held position when holding, else from where it is.
    HOLD <motor>                 -> stay where it is, pushing back when moved
    MGET <motor>                 -> OK mode=<OFF|SPEED|CAL|MOVE|HOLD> target=<%> speed=<%> power=<%>
                                       cps=<counts/s> pos=<count> ref=<count> tag=<tag>
    MLOG <motor> <ms>            -> send "M <motor> S ..." (as MGET) every <ms> (20-1000, 0 = off)
    MTUNE <motor> [soft] [pos] [decel] [kick] [tol] [stall]
                                 -> tuning, not saved (back to 1 1 0.5 1 0 600 on LINK): soft = x loop time (0.3-5,
                                    higher = softer), pos = x position stiffness (0-5), decel = move deceleration
                                    x acceleration (0.1-1), kick = 0|1, tol = "in place" tolerance in counts
                                    (0 = 2 encoder pulses; a holding motor stays braked until 2 x tol away),
                                    stall = ms pushing (power >= 40 %) without moving before it stops (0 = off).
                                    Replies the values.
    Counts and positions are in the motor direction (positive power = counts go up, whatever the encoder wiring).
    A new RUN / RUNT / MOVE / HOLD replaces the running one. SET and STOP on the motor port go back to
    open loop (direct power). RUNT and MOVE with a tag end with "M <motor> DONE <tag> pos=<count>",
    or "M <motor> CANCEL <tag> pos=<count>" when something else stopped them.
    A stalled RUN / RUNT / MOVE stops (coast) with "M <motor> STALL <tag> pos=<count>" (tag 0 for RUN).

  The port name is its first pin: an encoder on 18+19 is port 18, an HB3 on 25,26,27 is port 25.

  Messages (ESP32 -> PC):
    [id] OK [data]               -> command done
    [id] ERR <message>           -> command refused (id 0 for fire-and-forget commands)
    V <pin>=<value> ...          -> input values (DIN, AIN, ENC), sent when they change
                                    and every second for all inputs
    L <message>                  -> log
    M <motor> CAL|ERR|DONE|CANCEL|STALL|S ...
                                 -> closed-loop motor events (calibration done, error, move ended, stalled, MLOG lines)

  Prerequisites (Arduino IDE):
    1. Boards Manager: "esp32" by Espressif, version 3.x.
    2. Library Manager: "NimBLE-Arduino" by h2zero, version 2.x.
    3. Board: "ESP32 Dev Module" (WROOM-32) or "ESP32S3 Dev Module".

  WARNING: ESP32 pins are 3.3 V only. Power sensors (TCRT5000, encoders...) from 3.3 V, or put a
  divider on their outputs. Motors need their own supply; connect its GND to the ESP32 GND.
  =============================================================================
*/

#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include "soc/soc_caps.h"
#include "driver/gpio.h"
#include "driver/pulse_cnt.h"
#include "ESP32io_types.h"

#define FW_NAME          "ESP32io"
#define FW_VERSION       2
#define DEFAULT_BLE_NAME "ESP32io"
#define NAME_MAX_LEN     20

static const char* NUS_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
static const char* NUS_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

// Company ID 0xFFFF (reserved by the Bluetooth SIG for tests) + "LBio" (LEGO Blockly io)
static const uint8_t ADV_MARKER[] = { 0xFF, 0xFF, 'L', 'B', 'i', 'o' };

#define REPORT_MS_DEFAULT   20     // minimum time between two "V" lines
#define KEYFRAME_MS         1000   // all input values are re-sent this often (covers a lost notification)
#define AIN_SAMPLE_MS       2      // analog inputs: one sample every 2 ms...
#define AIN_SAMPLES         8      // ...averaged by 8
#define AIN_DELTA_DEFAULT   16
#define DIN_DEBOUNCE_DEFAULT 10
#define PWM_BITS            10
#define PWM_FREQ_DEFAULT    1000
#define HB2_FREQ_DEFAULT    20000
#define HB3_FREQ_DEFAULT    1000
#define SERVO_BITS          14
#define SERVO_HZ            50
#define ENC_LIMIT           30000  // PCNT counts to +/-ENC_LIMIT, the driver extends it to 32 bits
#define ENC_GLITCH_NS       1000

#define CTRL_MS          5      // closed-loop period
#define SPEED_WIN        4      // speed = count change over the last 4 periods (20 ms)
#define SPEED_LAG_MS     10     // ...which shows the speed of 10 ms ago
#define ACCEL_MS         200    // speed ramp: 0 -> 100 % in 200 ms
#define WRONG_WAY_MS     500    // turning against the setpoint this long = encoder direction wrong
#define STUCK_MS         40     // no encoder change this long while behind the reference = stuck: kick
#define SETTLE_MS        500    // a move ends at most this long after its reference reached the target
#define HOLD_TAP_EVERY_MS 150   // HOLD, stuck out of place: one tap at the start power every 150 ms...
#define HOLD_TAP_MS      15     // ...lasting 15 ms
#define STALL_POWER      40.0f  // stall detection: "pushing" = power >= 40 % (the time is MTUNE's stall value)
#define LEAD_S           0.05f  // MOVE: the reference stays within 50 ms of top speed of the motor
#define SPEED_WINDOW_S   0.02f  // SPEED: ...within 20 ms of travel (or 2 pulses)
#define CAL_RAMP_PCT_S   40.0f  // calibration: power ramp up while looking for the start power...
#define CAL_DOWN_PCT_S   30.0f  // ...and down while looking for the power that keeps it turning
#define CAL_VERSION      2

#define CMD_LEN       96
#define CMD_QUEUE_LEN 16
#define MAX_TOKENS    10

// ------------------------------------------------------
// Usable pins per chip (no strapping, flash/PSRAM, USB or UART0 pins)
// ------------------------------------------------------
enum : uint8_t { C_IN = 1, C_OUT = 2, C_ADC = 4, C_DAC = 8, C_PULL = 16 };
#define C_IO (C_IN | C_OUT | C_PULL)

struct PinCap { uint8_t pin; uint8_t caps; };

#if CONFIG_IDF_TARGET_ESP32
#define BOARD_NAME "ESP32"
// Not listed: 0, 2, 5, 12, 15 (strapping), 1, 3 (USB serial), 6-11 (flash).
// 16 and 17 are used by the PSRAM on WROVER modules (fine on WROOM-32).
// 34, 35, 36, 39 are input only and have no internal pull-up/down.
static const PinCap PIN_CAPS[] = {
  { 4, C_IO }, { 13, C_IO }, { 14, C_IO }, { 16, C_IO }, { 17, C_IO }, { 18, C_IO },
  { 19, C_IO }, { 21, C_IO }, { 22, C_IO }, { 23, C_IO },
  { 25, C_IO | C_DAC }, { 26, C_IO | C_DAC }, { 27, C_IO },
  { 32, C_IO | C_ADC }, { 33, C_IO | C_ADC },
  { 34, C_IN | C_ADC }, { 35, C_IN | C_ADC }, { 36, C_IN | C_ADC }, { 39, C_IN | C_ADC },
};
#elif CONFIG_IDF_TARGET_ESP32S3
#define BOARD_NAME "ESP32-S3"
// Not listed: 0, 3, 45, 46 (strapping), 19, 20 (USB), 26-32 (flash), 33-37 (octal PSRAM), 43, 44 (UART0).
// 48 (or 38) drives the RGB LED on DevKitC-1 boards.
static const PinCap PIN_CAPS[] = {
  { 1, C_IO | C_ADC }, { 2, C_IO | C_ADC }, { 4, C_IO | C_ADC }, { 5, C_IO | C_ADC },
  { 6, C_IO | C_ADC }, { 7, C_IO | C_ADC }, { 8, C_IO | C_ADC }, { 9, C_IO | C_ADC },
  { 10, C_IO | C_ADC }, { 11, C_IO }, { 12, C_IO }, { 13, C_IO }, { 14, C_IO }, { 15, C_IO },
  { 16, C_IO }, { 17, C_IO }, { 18, C_IO }, { 21, C_IO }, { 38, C_IO }, { 39, C_IO },
  { 40, C_IO }, { 41, C_IO }, { 42, C_IO }, { 47, C_IO }, { 48, C_IO },
};
#else
#error "ESP32io supports the ESP32 (WROOM-32) and the ESP32-S3 only"
#endif

#ifdef SOC_LEDC_SUPPORT_HS_MODE
#define PWM_CHANNELS (SOC_LEDC_CHANNEL_NUM * 2)
#else
#define PWM_CHANNELS SOC_LEDC_CHANNEL_NUM
#endif

static uint8_t pinCaps(int pin) {
  for (const PinCap& c : PIN_CAPS) if (c.pin == pin) return c.caps;
  return 0;
}

// ------------------------------------------------------
// Ports (indexed by their first pin)
// ------------------------------------------------------
static const char* KIND_NAMES[] = { "NONE", "DIN", "DOUT", "PWM", "AIN", "DAC", "SERVO", "HB2", "HB3", "ENC" };

#define MAX_PIN 49
static Port ports[MAX_PIN];
static int8_t owner[MAX_PIN];   // first pin of the port using this pin, -1 = free

static bool isInputKind(Kind k) { return k == K_DIN || k == K_AIN || k == K_ENC; }

static void motorCancel(int hb);      // closed-loop motors (defined after the encoder code)
static void motorUnlinkPin(int pin);
static void motorTakeOver(Motor& m);

// ------------------------------------------------------
// BLE + Serial transport
// ------------------------------------------------------
struct CmdLine { char text[CMD_LEN]; };
static QueueHandle_t cmdQueue = nullptr;

static NimBLEServer* pServer = nullptr;
static NimBLECharacteristic* pTxChar = nullptr;
static volatile bool bleConnected = false;
static volatile bool bleConnectedFlag = false;
static volatile bool bleDisconnectedFlag = false;
static volatile uint16_t bleMtu = 23;

static Preferences prefs;
static String bleName = DEFAULT_BLE_NAME;

static uint32_t reportMs = REPORT_MS_DEFAULT;
static uint32_t lastReportMs = 0, lastKeyframeMs = 0;
static uint32_t wdtMs = 0, lastRxMs = 0;
static bool wdtTripped = false;

static void bleSendLine(const String& s) {
  if (!bleConnected || !pTxChar) return;
  String data = s + "\n";
  size_t chunk = bleMtu > 23 ? bleMtu - 3 : 20;
  const uint8_t* p = (const uint8_t*)data.c_str();
  size_t len = data.length();
  for (size_t off = 0; off < len; off += chunk) {
    size_t n = (len - off > chunk) ? chunk : (len - off);
    // notify() fails when the stack has no free buffer: retry for a few ms
    for (int t = 0; t < 10 && !pTxChar->notify(p + off, n); t++) delay(2);
  }
}

static void sendTo(Src dst, const String& s) {
  if (dst == SRC_SERIAL) Serial.println(s);
  else bleSendLine(s);
}

static void logLine(const String& msg) {
  Serial.println("L " + msg);
  bleSendLine("L " + msg);
}

// Input reports go to the PC when one is connected, else to the Serial Monitor
static void sendReport(const String& s) {
  if (bleConnected) bleSendLine(s);
  else Serial.println(s);
}

class ServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* s, NimBLEConnInfo& connInfo) override {
    bleConnected = true;
    bleConnectedFlag = true;
    // Ask for a short connection interval (7.5-15 ms). The PC may refuse.
    s->updateConnParams(connInfo.getConnHandle(), 6, 12, 0, 200);
  }
  void onDisconnect(NimBLEServer* s, NimBLEConnInfo& connInfo, int reason) override {
    bleConnected = false;
    bleMtu = 23;
    bleDisconnectedFlag = true;
  }
  void onMTUChange(uint16_t mtu, NimBLEConnInfo& connInfo) override {
    bleMtu = mtu;
  }
};

// Runs in the BLE task: only cut lines and queue them, loop() does the work
class RxCallbacks : public NimBLECharacteristicCallbacks {
  char buf[CMD_LEN];
  size_t len = 0;
  void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
    const NimBLEAttValue& v = c->getValue();
    for (size_t i = 0; i < v.size(); i++) {
      char ch = (char)v.data()[i];
      if (ch == '\n' || ch == '\r') {
        if (len) {
          CmdLine line;
          memcpy(line.text, buf, len);
          line.text[len] = '\0';
          xQueueSend(cmdQueue, &line, 0);
          len = 0;
        }
      } else if (len < CMD_LEN - 1) {
        buf[len++] = ch;
      }
    }
  }
};

static void applyBleName() {
  NimBLEDevice::setDeviceName(bleName.c_str());
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData scanData;
  scanData.setName(bleName.c_str());
  adv->setScanResponseData(scanData);
  if (!bleConnected) {
    adv->stop();
    adv->start();
  }
}

// ------------------------------------------------------
// Output helpers
// ------------------------------------------------------
static const uint32_t PWM_MAX = (1u << PWM_BITS) - 1;     // ledcWrite(PWM_MAX) = 100 %
static const uint32_t SERVO_MAX = (1u << SERVO_BITS) - 1;

static void parkLow(uint8_t pin) {
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
}

static void writeDout(Port& p, bool on) {
  digitalWrite(p.pins[0], (on != p.activeLow) ? HIGH : LOW);
}

static void writeServoUs(Port& p, float us) {
  ledcWrite(p.pins[0], (uint32_t)lroundf(us * SERVO_MAX / (1000000.0f / SERVO_HZ)));
}

static void hbPower(Port& p, float power) {
  uint32_t duty = (uint32_t)lroundf(fabsf(power) * PWM_MAX / 100.0f);
  bool fwd = power >= 0;
  if (p.kind == K_HB2) {
    if (duty == 0) {
      // Power 0 = coast (both LOW), in both decay modes
      ledcWrite(p.pins[0], 0);
      ledcWrite(p.pins[1], 0);
    } else if (p.slowDecay) {
      // Slow decay (DRV8833, MX1508, TA6586): one input HIGH, the other LOW for the "on" part of the
      // period and HIGH (= brake) for the rest. The motor is braked, not left coasting, between pulses:
      // it slows down as fast as it speeds up, and the speed follows the power more closely.
      uint32_t inv = PWM_MAX - duty;
      ledcWrite(p.pins[0], fwd ? PWM_MAX : inv);
      ledcWrite(p.pins[1], fwd ? inv : PWM_MAX);
    } else {
      // Fast decay: one input PWM, the other LOW (coasts between pulses; the only mode of the L9110S)
      ledcWrite(p.pins[0], fwd ? duty : 0);
      ledcWrite(p.pins[1], fwd ? 0 : duty);
    }
  } else {
    // EN = PWM, IN1/IN2 = direction (L298N, TB6612)
    digitalWrite(p.pins[1], fwd ? HIGH : LOW);
    digitalWrite(p.pins[2], fwd ? LOW : HIGH);
    ledcWrite(p.pins[0], duty);
  }
}

static void hbStop(Port& p, bool brake) {
  if (p.kind == K_HB2) {
    // Both HIGH = brake, both LOW = coast
    ledcWrite(p.pins[0], brake ? PWM_MAX : 0);
    ledcWrite(p.pins[1], brake ? PWM_MAX : 0);
  } else {
    // IN1 = IN2 = HIGH with EN on = brake. All LOW = coast
    digitalWrite(p.pins[1], brake ? HIGH : LOW);
    digitalWrite(p.pins[2], brake ? HIGH : LOW);
    ledcWrite(p.pins[0], brake ? PWM_MAX : 0);
  }
}

static void stopPort(Port& p, bool brake) {
  switch (p.kind) {
    case K_DOUT:  writeDout(p, false); break;
    case K_PWM:   ledcWrite(p.pins[0], 0); break;
#if SOC_DAC_SUPPORTED
    case K_DAC:   dacWrite(p.pins[0], 0); break;
#endif
    case K_SERVO: ledcWrite(p.pins[0], 0); break;   // no pulses: the servo relaxes, a 360 servo stops
    case K_HB2:
    case K_HB3:   motorCancel(p.pins[0]); hbStop(p, brake); break;
    default: return;
  }
  p.setpoint = 0;
}

static void stopAll(bool brake) {
  for (int i = 0; i < MAX_PIN; i++) stopPort(ports[i], brake);
}

// ------------------------------------------------------
// Encoder (PCNT)
// ------------------------------------------------------
// accum_count needs the PCNT interrupt, which is installed with a callback
static bool IRAM_ATTR encWatchCb(pcnt_unit_handle_t, const pcnt_watch_event_data_t*, void*) { return false; }

static void encDelete(Port& p) {
  if (p.unit) {
    pcnt_unit_stop(p.unit);
    pcnt_unit_disable(p.unit);
  }
  if (p.chA) pcnt_del_channel(p.chA);
  if (p.chB) pcnt_del_channel(p.chB);
  if (p.unit) {
    pcnt_unit_remove_watch_point(p.unit, ENC_LIMIT);
    pcnt_unit_remove_watch_point(p.unit, -ENC_LIMIT);
    pcnt_del_unit(p.unit);
  }
  p.unit = nullptr;
  p.chA = p.chB = nullptr;
}

static bool encCreate(Port& p, int mult, bool pullUp) {
  int a = p.pins[0], b = p.pins[1];
  pinMode(a, INPUT);
  pinMode(b, INPUT);

  pcnt_unit_config_t ucfg = {};
  ucfg.low_limit = -ENC_LIMIT;
  ucfg.high_limit = ENC_LIMIT;
  ucfg.flags.accum_count = 1;
  if (pcnt_new_unit(&ucfg, &p.unit) != ESP_OK) { p.unit = nullptr; return false; }

  bool ok = true;
  pcnt_glitch_filter_config_t fcfg = { .max_glitch_ns = ENC_GLITCH_NS };
  ok = ok && pcnt_unit_set_glitch_filter(p.unit, &fcfg) == ESP_OK;

  pcnt_chan_config_t ca = {};
  ca.edge_gpio_num = a;
  ca.level_gpio_num = b;
  ok = ok && pcnt_new_channel(p.unit, &ca, &p.chA) == ESP_OK;
  if (ok) {
    // X2 and X4 count both edges of A (X4 adds channel B below)
    // (edge actions: rising, falling / level actions: B high, B low)
    if (mult == 1) {
      // X1: edges of A only while B is LOW, rising +1, falling -1. Forward, A rises with B LOW;
      // backward, A falls with B LOW at the same place, so contact bounce and jitter cancel out.
      pcnt_channel_set_edge_action(p.chA, PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_DECREASE);
      pcnt_channel_set_level_action(p.chA, PCNT_CHANNEL_LEVEL_ACTION_HOLD, PCNT_CHANNEL_LEVEL_ACTION_KEEP);
    } else {
      pcnt_channel_set_edge_action(p.chA, PCNT_CHANNEL_EDGE_ACTION_DECREASE, PCNT_CHANNEL_EDGE_ACTION_INCREASE);
      pcnt_channel_set_level_action(p.chA, PCNT_CHANNEL_LEVEL_ACTION_KEEP, PCNT_CHANNEL_LEVEL_ACTION_INVERSE);
    }
  }
  if (ok && mult == 4) {
    pcnt_chan_config_t cb = {};
    cb.edge_gpio_num = b;
    cb.level_gpio_num = a;
    ok = pcnt_new_channel(p.unit, &cb, &p.chB) == ESP_OK;
    if (ok) {
      pcnt_channel_set_edge_action(p.chB, PCNT_CHANNEL_EDGE_ACTION_INCREASE, PCNT_CHANNEL_EDGE_ACTION_DECREASE);
      pcnt_channel_set_level_action(p.chB, PCNT_CHANNEL_LEVEL_ACTION_KEEP, PCNT_CHANNEL_LEVEL_ACTION_INVERSE);
    }
  }
  ok = ok && pcnt_unit_add_watch_point(p.unit, ENC_LIMIT) == ESP_OK;
  ok = ok && pcnt_unit_add_watch_point(p.unit, -ENC_LIMIT) == ESP_OK;
  pcnt_event_callbacks_t cbs = { .on_reach = encWatchCb };
  ok = ok && pcnt_unit_register_event_callbacks(p.unit, &cbs, nullptr) == ESP_OK;
  ok = ok && pcnt_unit_enable(p.unit) == ESP_OK;
  ok = ok && pcnt_unit_clear_count(p.unit) == ESP_OK;
  ok = ok && pcnt_unit_start(p.unit) == ESP_OK;
  if (!ok) { encDelete(p); return false; }

  // The PCNT driver turns the pull-ups on
  if (!pullUp) {
    gpio_pullup_dis((gpio_num_t)a);
    gpio_pullup_dis((gpio_num_t)b);
  }
  return true;
}

static int32_t encRead(Port& p) {
  int c = 0;
  pcnt_unit_get_count(p.unit, &c);
  return c + p.offset;
}

// ------------------------------------------------------
// Closed-loop motors (an H-bridge port linked to an encoder port)
// ------------------------------------------------------
// The motor follows a reference position `ref` that moves at the reference speed `vref`. Every CTRL_MS:
//   speed command = vref + kx * (ref - pos)                  position loop: exact average speed, no drift
//   power = ks + (100 - ks) * vref / top  + accel term       feedforward: what the motor needs (calibration)
//         + kp * (speed command - speed) + integral          PI: load, battery
//   stuck for STUCK_MS while behind: power = kstart          breakaway kick (static friction of gearboxes)
// kx, kp and ki come from the calibration (lambda tuning of a first-order motor): the user never sets them.
// SPEED moves `ref` at the ramped speed, MOVE along a trapezoid profile to moveX, HOLD keeps it still.
// Positions are encoder counts and speeds counts/s, in the motor direction (count x dir).

#define MAX_MOTORS (SOC_PCNT_UNITS_PER_GROUP / 2)   // each motor uses one encoder = one counter unit of 2 per pair
static Motor motors[MAX_MOTORS];
static uint32_t lastCtrlUs = 0;
static const char* MOTOR_MODE_NAMES[] = { "OFF", "SPEED", "CAL", "MOVE", "HOLD" };

static Motor* motorOf(int hb) {
  for (Motor& m : motors) if (m.hb >= 0 && m.hb == hb) return &m;
  return nullptr;
}

static Motor* motorOfEnc(int enc) {
  for (Motor& m : motors) if (m.hb >= 0 && m.enc == enc) return &m;
  return nullptr;
}

static void motorEvent(const Motor& m, const String& s) {
  sendReport("M " + String(m.hb) + " " + s);
}

static String calText(const MotorCal& c) {
  if (!c.valid) return "NOCAL";
  return "dir=" + String(c.dir) + " ks=" + String(c.ks, 1) + " top=" + String(c.top, 0) +
         " tau=" + String(c.tauMs, 0) + " kstart=" + String(c.kstart, 1);
}

static float motorPct(const Motor& m, float cps) { return m.cal.valid ? cps * 100.0f / m.cal.top : 0; }

static String motorState(const Motor& m) {
  return String("mode=") + MOTOR_MODE_NAMES[m.mode] + " target=" + String(motorPct(m, m.target), 1) +
         " speed=" + String(motorPct(m, m.speed), 1) + " power=" + String(ports[m.hb].setpoint, 1) +
         " cps=" + String(m.speed, 0) + " pos=" + String(m.pos) + " ref=" + String(lroundf(m.ref)) + " tag=" + String(m.tag);
}

// Saved calibrations: one flash entry per motor pin ("cal16"). Version 1 had no kstart (no kick until recalibrated).
struct CalStore { uint8_t ver; int8_t dir; uint8_t mult; uint8_t pad; float ks, top, tauMs, kstart; };
#define CAL_STORE_V1_SIZE 16

static String calKey(int hb) { return "cal" + String(hb); }

static bool calLoad(int hb, MotorCal& c, uint8_t mult) {
  CalStore s = {};
  String key = calKey(hb);
  size_t len = 0;
  if (prefs.begin("esp32io", true)) {
    if (prefs.isKey(key.c_str())) len = prefs.getBytesLength(key.c_str());
    if (len == sizeof(s) || len == CAL_STORE_V1_SIZE) len = prefs.getBytes(key.c_str(), &s, len);
    else len = 0;
    prefs.end();
  }
  bool ok = (s.ver == CAL_VERSION && len == sizeof(s)) || (s.ver == 1 && len == CAL_STORE_V1_SIZE);
  if (!ok || s.top <= 0 || s.mult == 0) return false;
  c.valid = true;
  c.dir = s.dir >= 0 ? 1 : -1;
  c.ks = s.ks;
  c.top = s.top * mult / s.mult;   // the encoder mode (X1/X2/X4) may have changed since
  c.tauMs = s.tauMs;
  c.kstart = s.ver == 1 ? 0 : s.kstart;
  c.mult = mult;
  return true;
}

static void calSave(int hb, const MotorCal& c) {
  CalStore s = { CAL_VERSION, c.dir, c.mult, 0, c.ks, c.top, c.tauMs, c.kstart };
  prefs.begin("esp32io", false);
  prefs.putBytes(calKey(hb).c_str(), &s, sizeof(s));
  prefs.end();
}

static void calForget(int hb) {
  prefs.begin("esp32io", false);
  if (prefs.isKey(calKey(hb).c_str())) prefs.remove(calKey(hb).c_str());
  prefs.end();
}

static void motorPowerOut(Motor& m, float power) {
  m.power = power;
  ports[m.hb].setpoint = power;
  hbPower(ports[m.hb], power);
}

static void motorCoast(Motor& m) {
  m.power = 0;
  ports[m.hb].setpoint = 0;
  hbStop(ports[m.hb], false);
}

static void motorBrake(Motor& m) {
  m.power = 0;
  ports[m.hb].setpoint = 0;
  hbStop(ports[m.hb], true);
}

static void motorIdle(Motor& m) {
  m.mode = MM_OFF;
  m.target = m.sp = m.integ = 0;
  m.vref = m.aref = 0;
  m.endMs = m.settleMs = 0;
  m.wrongMs = 0;
}

static void motorResetSpeed(Motor& m) { m.hn = 0; }   // the speed keeps its last value until 4 new samples

// Tell whoever waits for the running move / timed run that it ended
static void motorEndTag(Motor& m, const char* how) {
  if (!m.tag) return;
  motorEvent(m, String(how) + " " + m.tag + " pos=" + m.pos);
  m.tag = 0;
}

// SET, STOP or the watchdog on the motor port: leave the closed loop (the caller drives the pins)
static void motorCancel(int hb) {
  Motor* m = motorOf(hb);
  if (!m || m->mode == MM_OFF) return;
  if (m->mode == MM_CAL) motorEvent(*m, "ERR calibration stopped");
  motorEndTag(*m, "CANCEL");
  motorIdle(*m);
}

static void motorFail(Motor& m, const String& msg) {
  motorCoast(m);
  motorEvent(m, "ERR " + msg);
  motorEndTag(m, "CANCEL");
  motorIdle(m);
}

// The H-bridge or the encoder is released: the motor stops (if the loop was driving it) and the link goes
static void motorUnlinkPin(int pin) {
  for (Motor& m : motors) {
    if (m.hb < 0 || (m.hb != pin && m.enc != pin)) continue;
    if (m.mode == MM_CAL) motorEvent(m, "ERR calibration stopped");
    motorEndTag(m, "CANCEL");
    if (m.mode != MM_OFF) motorCoast(m);
    m = Motor{};
  }
}

static void motorMeasure(Motor& m, uint32_t us) {
  int32_t c = encRead(ports[m.enc]) * m.cal.dir;
  m.pos = c;
  m.hist[m.hidx] = c;
  m.histUs[m.hidx] = us;
  if (m.hn >= SPEED_WIN) {
    uint8_t old = (m.hidx + MOTOR_HIST - SPEED_WIN) % MOTOR_HIST;
    uint32_t dus = us - m.histUs[old];
    if (dus) m.speed = (float)(c - m.hist[old]) * 1e6f / dus;
  }
  m.hidx = (m.hidx + 1) % MOTOR_HIST;
  if (m.hn < MOTOR_HIST) m.hn++;
}

// Power the motor needs for a speed: friction (smoothed near 0 so the sign change is not a jump) + slope
static float motorFeedforward(const Motor& m, float sp) {
  if (sp == 0) return 0;
  const MotorCal& c = m.cal;
  return c.ks * constrain(sp / (0.02f * c.top), -1.0f, 1.0f) + (100.0f - c.ks) * sp / c.top;
}

// "In place" tolerance in counts (MTUNE, the driver sets it from degrees of the output shaft)
static float motorTol(const Motor& m) { return m.tTol > 0 ? m.tTol : 2.0f * m.cal.mult; }

// Follow ref / vref (all modes but CAL)
static void motorTrack(Motor& m, float dt, uint32_t now) {
  const MotorCal& c = m.cal;
  float tol = motorTol(m);
  if (m.pos != m.lastPos) { m.lastPos = m.pos; m.lastMoveMs = now; }
  float ex = m.ref - m.pos;

  // Holding and in place: brake (quiet). The integral is dropped: with gearbox friction it only holds
  // what it crept up to while stuck, which would push the wrong way after the next disturbance.
  // Hysteresis: once in place it stays braked until pushed beyond 2 x the tolerance. With a tolerance
  // smaller than the gearbox play (the encoder is on the motor shaft) the motor hunted back and forth.
  if (m.mode == MM_HOLD) {
    if (fabsf(ex) <= (m.inPlace ? 2.0f * tol : tol)) {
      m.inPlace = true;
      motorBrake(m);
      m.integ = 0;
      m.tapUntil = 0;
      m.wrongMs = 0;
      return;
    }
    m.inPlace = false;
  }
  // Holding, out of place and stuck (friction): short taps at the start power, not a slow creep of the integral
  if (m.mode == MM_HOLD && m.tKick && c.kstart > 0) {
    bool tapping = m.tapUntil && (int32_t)(m.tapUntil - now) > 0;
    if (!tapping && now - m.lastMoveMs > HOLD_TAP_EVERY_MS) {
      m.tapUntil = now + HOLD_TAP_MS;
      m.lastMoveMs = now;   // the next tap waits HOLD_TAP_EVERY_MS if this one does not move it
      tapping = true;
    }
    if (tapping) {
      motorPowerOut(m, ex > 0 ? c.kstart : -c.kstart);
      return;
    }
  }

  float k = c.top / max(100.0f - c.ks, 10.0f);             // counts/s per % of power
  float tau = max(c.tauMs, 5.0f) / 1000.0f;
  float lam = (max(tau, 0.03f) + SPEED_LAG_MS / 1000.0f) * m.tSoft;   // closed loop about as fast as the motor itself
  float kp = tau / (k * lam), ki = 1.0f / (k * lam), kx = m.tPos / (2.0f * lam);
  float vc = m.vref + kx * ex;
  float err = vc - m.speed;
  float ff = motorFeedforward(m, m.vref) + (100.0f - c.ks) / c.top * tau * m.aref;
  float out = ff + kp * err + m.integ;
  // The integral sees the speed error only (integrating kx * ex too made the loop swing on the real motor),
  // plus a slow position integral while the reference stands still (hold, end of a move) for a steady load
  float ierr = (m.vref - m.speed) + (m.vref == 0 ? kx * 0.25f * ex : 0);
  bool stuck = now - m.lastMoveMs > STUCK_MS;
  if (m.tKick && m.mode != MM_HOLD && stuck && c.kstart > 0 && fabsf(ex) > tol && (vc > 0) == (ex > 0) && fabsf(out) < c.kstart) {
    out = ex > 0 ? c.kstart : -c.kstart;   // breakaway kick, until it moves
  } else {
    if (!((out >= 100 && ierr > 0) || (out <= -100 && ierr < 0)))   // anti-windup
      m.integ = constrain(m.integ + ki * ierr * dt, -100.0f, 100.0f);
    out = ff + kp * err + m.integ;
  }
  motorPowerOut(m, constrain(out, -100.0f, 100.0f));

  // The encoder counts the other way: the loop would push to full power, stop it
  if (fabsf(vc) > 0.1f * c.top && fabsf(m.speed) > 0.1f * c.top && (m.speed > 0) != (vc > 0)) {
    if (!m.wrongMs) m.wrongMs = now ? now : 1;
    else if (now - m.wrongMs > WRONG_WAY_MS)
      motorFail(m, "turns the wrong way for its encoder: run CAL again, or check the encoder wiring");
  } else {
    m.wrongMs = 0;
  }
}

// Stall: pushing (power >= STALL_POWER) without moving more than the tolerance for tStallMs.
// The motor stops (coast: no heating) and "M <pin> STALL <tag> pos=" ends what was running.
static bool motorCheckStall(Motor& m, uint32_t now) {
  if (!m.tStallMs) return false;
  if (abs(m.pos - m.stallPos) > motorTol(m) || fabsf(m.power) < STALL_POWER) {
    m.stallPos = m.pos;
    m.stallT = now;
    return false;
  }
  if (now - m.stallT < m.tStallMs) return false;
  motorEvent(m, "STALL " + String(m.tag) + " pos=" + String(m.pos));
  m.tag = 0;
  motorCoast(m);
  motorIdle(m);
  return true;
}

// A move or a timed run is over: DONE event, then brake, coast or hold
static void motorFinish(Motor& m) {
  float holdAt = (m.mode == MM_MOVE) ? m.moveX : (float)m.pos;
  motorEndTag(m, "DONE");
  if (m.endAction == END_HOLD) {
    m.mode = MM_HOLD;
    m.inPlace = false;
    m.ref = holdAt;
    m.vref = m.aref = 0;
    m.target = m.sp = 0;
    m.endMs = m.settleMs = 0;
  } else {
    if (m.endAction == END_BRAKE) motorBrake(m);
    else motorCoast(m);
    motorIdle(m);
  }
}

static void motorSpeedTick(Motor& m, float dt, uint32_t now) {
  const MotorCal& c = m.cal;
  if (m.endMs && (int32_t)(now - m.endMs) >= 0) { motorFinish(m); return; }
  float step = c.top * dt * 1000.0f / ACCEL_MS;
  float sp0 = m.sp;
  if (m.sp < m.target) m.sp = min(m.sp + step, m.target);
  else if (m.sp > m.target) m.sp = max(m.sp - step, m.target);

  // Speed 0 reached: brake (use HOLD to keep the position)
  if (m.sp == 0 && m.target == 0) {
    if (m.power != 0 || m.integ != 0) { m.integ = 0; motorBrake(m); }
    m.ref = m.pos;
    m.vref = m.aref = 0;
    m.wrongMs = 0;
    return;
  }
  m.aref = (m.sp - sp0) / dt;
  m.vref = m.sp;
  m.ref += m.vref * dt;
  // A speed, not a position: the reference stays within a few pulses (or 20 ms of travel) of the motor,
  // so an overshoot or a blocked motor is not paid back later. It still averages the low speeds.
  float window = max(2.0f * c.mult, fabsf(m.vref) * SPEED_WINDOW_S);
  m.ref = constrain(m.ref, m.pos - window, m.pos + window);
  motorTrack(m, dt, now);
  if (m.mode == MM_SPEED) motorCheckStall(m, now);
}

// Trapezoid: accelerate to moveV, cruise, decelerate so the reference stops exactly on moveX
static void motorMoveTick(Motor& m, float dt, uint32_t now) {
  const MotorCal& c = m.cal;
  float acc = c.top * 1000.0f / ACCEL_MS;
  float dec = acc * m.tDecel;   // gentler deceleration: less lag (overshoot) at the end
  float dist = m.moveX - m.ref;
  float vdes = min(m.moveV, sqrtf(2.0f * dec * fabsf(dist)));
  if (dist < 0) vdes = -vdes;
  bool speedingUp = fabsf(vdes) > fabsf(m.vref) && (vdes > 0) == (m.vref >= 0);
  float v0 = m.vref, step = (speedingUp ? acc : dec) * dt;
  if (m.vref < vdes) m.vref = min(m.vref + step, vdes);
  else m.vref = max(m.vref - step, vdes);
  m.aref = (m.vref - v0) / dt;
  // The motor cannot keep up (load, 100 %): the reference waits for it, so the end does not overshoot
  float lead = c.top * LEAD_S + c.mult;
  if ((m.vref > 0 && m.ref > m.pos + lead) || (m.vref < 0 && m.ref < m.pos - lead)) m.vref = 0;
  float nref = m.ref + m.vref * dt;
  if ((m.moveX - nref) * dist <= 0) { m.ref = m.moveX; m.vref = m.aref = 0; }
  else m.ref = nref;

  motorTrack(m, dt, now);
  if (m.mode != MM_MOVE) return;   // stopped by the wrong-way guard
  if (motorCheckStall(m, now)) return;
  if (m.ref == m.moveX && m.vref == 0) {
    if (!m.settleMs) m.settleMs = now ? now : 1;
    if (fabsf(m.moveX - m.pos) <= motorTol(m) || now - m.settleMs > SETTLE_MS) motorFinish(m);
  }
}

static void motorHoldTick(Motor& m, float dt, uint32_t now) {
  m.vref = m.aref = 0;
  motorTrack(m, dt, now);
}

// Calibration: 0 stop, 1 slow power ramp until it moves (start power, direction),
// 2 stop, 3 full power (response time, top speed), 4 slow ramp down until it stops (ks). About 5-7 s.
static void motorCalTick(Motor& m, float dt, uint32_t now) {
  uint32_t t = now - m.calT0;
  switch (m.calStep) {
    case 0:
      if (t < 400) return;
      m.calC0 = encRead(ports[m.enc]);
      m.calPower = 0;
      m.calStep = 1;
      m.calT0 = now;
      return;

    case 1: {
      int32_t d = encRead(ports[m.enc]) - m.calC0;
      int32_t need = max(4, 2 * (int)ports[m.enc].mult);
      if (abs(d) >= need) {
        m.calKsStart = m.calPower;
        m.cal.dir = d > 0 ? 1 : -1;
        motorResetSpeed(m);
        motorCoast(m);
        m.calStep = 2;
        m.calT0 = now;
        return;
      }
      if (m.calPower >= 100) {
        if (t > (uint32_t)(100.0f * 1000.0f / CAL_RAMP_PCT_S) + 500)
          motorFail(m, "calibration: the encoder does not move at full power (check the motor supply, the wiring and the LINK pins)");
        return;
      }
      m.calPower = min(100.0f, m.calPower + CAL_RAMP_PCT_S * dt);
      motorPowerOut(m, m.calPower);
      return;
    }

    case 2:
      if (t < 600) return;
      m.calN = m.calNs = 0;
      m.calAcc = 0;
      motorPowerOut(m, 100);
      m.calStep = 3;
      m.calT0 = now;
      return;

    case 3:
      if (m.calNs < CAL_SAMPLES) m.calSpd[m.calNs++] = m.speed;
      if (t >= 500) { m.calAcc += m.speed; m.calN++; }
      if (t < 800) return;
      m.calV100 = m.calAcc / max(1, (int)m.calN);
      if (m.calV100 <= 0) { motorFail(m, "calibration: the motor turned the other way at full power (encoder?)"); return; }
      {
        int i = 0;
        while (i < m.calNs && m.calSpd[i] < 0.632f * m.calV100) i++;
        m.cal.tauMs = constrain((i + 1) * (float)CTRL_MS - SPEED_LAG_MS, 5.0f, 1000.0f);
      }
      m.calPower = 100;
      m.calStep = 4;
      m.calT0 = now;
      return;

    case 4: {
      // Lower the power slowly until the motor (nearly) stops: the power that keeps it turning.
      // (A straight line through two high powers missed it: speed is not linear in power at low power.)
      m.calPower -= CAL_DOWN_PCT_S * dt;
      if (t >= 100 && (m.speed < 0.02f * m.calV100 || m.calPower <= 0)) {
        // the speed shows the past (motor response + measurement lag): add what the ramp did meanwhile
        float ks = m.calPower + CAL_DOWN_PCT_S * (m.cal.tauMs + SPEED_LAG_MS) / 1000.0f;
        m.cal.ks = constrain(ks, 0.0f, 90.0f);
        m.cal.top = m.calV100;
        m.cal.kstart = max(m.calKsStart, m.cal.ks);
        m.cal.mult = ports[m.enc].mult;
        m.cal.valid = true;
        motorCoast(m);
        motorIdle(m);
        calSave(m.hb, m.cal);
        motorEvent(m, "CAL " + calText(m.cal));
        return;
      }
      motorPowerOut(m, m.calPower);
      return;
    }
  }
}

static void motorsTick() {
  uint32_t us = micros();
  if (us - lastCtrlUs < CTRL_MS * 1000u) return;
  float dt = (us - lastCtrlUs) / 1e6f;
  lastCtrlUs = us;
  if (dt > 0.05f) dt = 0.05f;
  uint32_t now = millis();
  for (Motor& m : motors) {
    if (m.hb < 0) continue;
    motorMeasure(m, us);
    switch (m.mode) {
      case MM_SPEED: motorSpeedTick(m, dt, now); break;
      case MM_MOVE:  motorMoveTick(m, dt, now); break;
      case MM_HOLD:  motorHoldTick(m, dt, now); break;
      case MM_CAL:   motorCalTick(m, dt, now); break;
      default: break;
    }
    if (m.logMs && now - m.lastLogMs >= m.logMs) {
      m.lastLogMs = now;
      motorEvent(m, "S " + motorState(m));
    }
  }
}

// ------------------------------------------------------
// Port setup / release
// ------------------------------------------------------
static void releasePort(int first) {
  Port& p = ports[first];
  motorUnlinkPin(first);
  switch (p.kind) {
    case K_DIN:
    case K_AIN:   pinMode(p.pins[0], INPUT); break;
    case K_DOUT:  writeDout(p, false); break;   // stays an output at its "off" level
    case K_PWM:
    case K_SERVO: ledcDetach(p.pins[0]); parkLow(p.pins[0]); break;
#if SOC_DAC_SUPPORTED
    case K_DAC:   dacDisable(p.pins[0]); parkLow(p.pins[0]); break;
#endif
    case K_HB2:   ledcDetach(p.pins[0]); ledcDetach(p.pins[1]); parkLow(p.pins[0]); parkLow(p.pins[1]); break;
    case K_HB3:   ledcDetach(p.pins[0]); parkLow(p.pins[0]); parkLow(p.pins[1]); parkLow(p.pins[2]); break;
    case K_ENC:   encDelete(p); pinMode(p.pins[0], INPUT); pinMode(p.pins[1], INPUT); break;
    default: break;
  }
  for (int i = 0; i < p.npins; i++) owner[p.pins[i]] = -1;
  p = Port{};
}

static void releaseAll() {
  for (int i = 0; i < MAX_PIN; i++) if (ports[i].kind != K_NONE) releasePort(i);
}

// ------------------------------------------------------
// Command parsing
// ------------------------------------------------------
static String gErr;
static bool fail(const String& msg) { gErr = msg; return false; }

static bool parseLong(const char* s, long& v) {
  if (!s || !*s) return false;
  char* end;
  v = strtol(s, &end, 10);
  return *end == '\0';
}

static bool parseFloat(const char* s, float& v) {
  if (!s || !*s) return false;
  char* end;
  v = strtof(s, &end);
  return *end == '\0';
}

// Accepts 25, GPIO25, IO25, D25
static bool parsePin(const char* s, int& pin) {
  if (!s) return fail("missing pin");
  while (*s && !isdigit((unsigned char)*s)) s++;
  long v;
  if (!parseLong(s, v) || v < 0 || v >= MAX_PIN) return fail(String("bad pin: ") + s);
  pin = (int)v;
  return true;
}

static bool is(const char* tok, const char* word) { return tok && strcasecmp(tok, word) == 0; }

static String pinName(int pin) { return "GPIO" + String(pin); }

// Checks that a pin exists on this board, can do what is asked, and is free (or belongs to `first`)
static bool checkPin(int pin, uint8_t need, int first, const char* what) {
  uint8_t caps = pinCaps(pin);
  if (!caps) return fail(pinName(pin) + " is not usable on " BOARD_NAME " (strapping, flash or serial pin)");
  if ((caps & need) != need) {
    if ((need & C_OUT) && !(caps & C_OUT)) return fail(pinName(pin) + " is input only");
    if (need & C_ADC) return fail(pinName(pin) + " cannot read analog values (ADC1 pins only)");
    if (need & C_DAC) return fail(pinName(pin) + " has no DAC");
    return fail(pinName(pin) + " cannot be used for " + what);
  }
  if (owner[pin] >= 0 && owner[pin] != first)
    return fail(pinName(pin) + " is already used by " + KIND_NAMES[ports[owner[pin]].kind] + " on " + pinName(owner[pin]));
  return true;
}

static bool cmdCfg(char** tok, int n) {
  int first;
  if (n < 3) return fail("usage: CFG <pin> <type> ...");
  if (!parsePin(tok[1], first)) return false;
  const char* type = tok[2];
  char** arg = tok + 3;
  int nargs = n - 3;
  long v;

  // Pins used by the new port
  int pins[3] = { first, -1, -1 };
  int npins = 1;
  uint8_t need = C_IN;
  Kind kind;
  if (is(type, "DIN")) kind = K_DIN;
  else if (is(type, "DOUT")) { kind = K_DOUT; need = C_OUT; }
  else if (is(type, "PWM")) { kind = K_PWM; need = C_OUT; }
  else if (is(type, "AIN")) { kind = K_AIN; need = C_ADC; }
  else if (is(type, "DAC")) { kind = K_DAC; need = C_DAC; }
  else if (is(type, "SERVO")) { kind = K_SERVO; need = C_OUT; }
  else if (is(type, "HB2")) { kind = K_HB2; need = C_OUT; npins = 2; }
  else if (is(type, "HB3")) { kind = K_HB3; need = C_OUT; npins = 3; }
  else if (is(type, "ENC")) { kind = K_ENC; npins = 2; }
  else return fail(String("unknown type: ") + type);

  for (int i = 1; i < npins; i++) {
    if (nargs < 1) return fail(String(type) + " needs " + String(npins) + " pins");
    if (!parsePin(arg[0], pins[i])) return false;
    arg++; nargs--;
  }
  for (int i = 0; i < npins; i++) {
    for (int j = 0; j < i; j++) if (pins[i] == pins[j]) return fail(pinName(pins[i]) + " is given twice");
    if (!checkPin(pins[i], need, first, type)) return false;
  }

  // Reconfiguring an existing port: release it first
  if (ports[first].kind != K_NONE) releasePort(first);

  Port& p = ports[first];
  p = Port{};
  p.kind = kind;
  p.npins = npins;
  for (int i = 0; i < npins; i++) p.pins[i] = pins[i];

  switch (kind) {
    case K_DIN: {
      int mode = INPUT;
      p.activeLow = false;
      p.debounceMs = DIN_DEBOUNCE_DEFAULT;
      for (int i = 0; i < nargs; i++) {
        if (is(arg[i], "UP")) mode = INPUT_PULLUP;
        else if (is(arg[i], "DOWN")) mode = INPUT_PULLDOWN;
        else if (is(arg[i], "NONE")) mode = INPUT;
        else if (is(arg[i], "HIGH")) p.activeLow = false;
        else if (is(arg[i], "LOW")) p.activeLow = true;
        else if (parseLong(arg[i], v) && v >= 0 && v <= 1000) p.debounceMs = v;
        else { p = Port{}; return fail(String("DIN: bad option ") + arg[i]); }
      }
      if (mode != INPUT && !(pinCaps(first) & C_PULL)) {
        p = Port{};
        return fail(pinName(first) + " has no internal pull-up/down: wire an external resistor and use NONE");
      }
      pinMode(first, mode);
      delayMicroseconds(50);   // let the pull-up settle before the first read
      p.lastRaw = digitalRead(first);
      p.rawChangedMs = millis();
      p.value = (p.lastRaw == (p.activeLow ? LOW : HIGH)) ? 1 : 0;
      break;
    }
    case K_DOUT:
      p.activeLow = nargs > 0 && is(arg[0], "INV");
      pinMode(first, OUTPUT);
      writeDout(p, false);
      break;
    case K_PWM: {
      long freq = PWM_FREQ_DEFAULT;
      if (nargs > 0 && (!parseLong(arg[0], freq) || freq < 10 || freq > 40000)) { p = Port{}; return fail("PWM: frequency 10-40000 Hz"); }
      if (!ledcAttach(first, freq, PWM_BITS)) { p = Port{}; parkLow(first); return fail("PWM: no free PWM channel or timer"); }
      ledcWrite(first, 0);
      break;
    }
    case K_AIN:
      p.delta = AIN_DELTA_DEFAULT;
      if (nargs > 0 && (!parseLong(arg[0], v) || v < 1 || v > 4095)) { p = Port{}; return fail("AIN: delta 1-4095"); }
      if (nargs > 0) p.delta = v;
      pinMode(first, INPUT);
      p.value = analogRead(first);
      break;
    case K_DAC:
#if SOC_DAC_SUPPORTED
      dacWrite(first, 0);
      break;
#else
      p = Port{};
      return fail("this board has no DAC");
#endif
    case K_SERVO: {
      p.continuous = nargs > 0 && is(arg[0], "360");
      if (nargs > 0 && !p.continuous && !is(arg[0], "180")) { p = Port{}; return fail("SERVO: type 180 or 360"); }
      p.minUs = p.continuous ? 1000 : 500;
      p.maxUs = p.continuous ? 2000 : 2400;
      if (nargs > 1) {
        if (!parseLong(arg[1], v) || v < 300 || v > 3000) { p = Port{}; return fail("SERVO: min 300-3000 us"); }
        p.minUs = v;
      }
      if (nargs > 2) {
        if (!parseLong(arg[2], v) || v < 300 || v > 3000) { p = Port{}; return fail("SERVO: max 300-3000 us"); }
        p.maxUs = v;
      }
      if (p.minUs >= p.maxUs) { p = Port{}; return fail("SERVO: min must be lower than max"); }
      if (!ledcAttach(first, SERVO_HZ, SERVO_BITS)) { p = Port{}; parkLow(first); return fail("SERVO: no free PWM channel or timer"); }
      ledcWrite(first, 0);   // relaxed until the first SET
      break;
    }
    case K_HB2:
    case K_HB3: {
      long freq = (kind == K_HB2) ? HB2_FREQ_DEFAULT : HB3_FREQ_DEFAULT;
      for (int i = 0; i < nargs; i++) {
        if (kind == K_HB2 && is(arg[i], "SLOW")) p.slowDecay = true;
        else if (kind == K_HB2 && is(arg[i], "FAST")) p.slowDecay = false;
        else if (!parseLong(arg[i], freq) || freq < 100 || freq > 40000) {
          p = Port{};
          return fail(String(type) + (kind == K_HB2 ? ": [frequency 100-40000 Hz] [FAST|SLOW]" : ": frequency 100-40000 Hz"));
        }
      }
      if (!ledcAttach(first, freq, PWM_BITS)) { p = Port{}; parkLow(first); return fail(String(type) + ": no free PWM channel or timer"); }
      if (kind == K_HB2) {
        if (!ledcAttach(pins[1], freq, PWM_BITS)) {
          ledcDetach(first); parkLow(first); parkLow(pins[1]);
          p = Port{};
          return fail("HB2: no free PWM channel or timer");
        }
      } else {
        parkLow(pins[1]);
        parkLow(pins[2]);
      }
      hbStop(p, false);
      break;
    }
    case K_ENC: {
      int mult = 4;
      bool pullUp = true;
      for (int i = 0; i < nargs; i++) {
        if (is(arg[i], "X1")) mult = 1;
        else if (is(arg[i], "X2")) mult = 2;
        else if (is(arg[i], "X4")) mult = 4;
        else if (is(arg[i], "UP")) pullUp = true;
        else if (is(arg[i], "NONE")) pullUp = false;
        else { p = Port{}; return fail(String("ENC: bad option ") + arg[i]); }
      }
      if (!encCreate(p, mult, pullUp)) { p = Port{}; return fail("ENC: no free counter unit (max " + String(SOC_PCNT_UNITS_PER_GROUP) + ")"); }
      p.mult = mult;
      if (pullUp && (!(pinCaps(pins[0]) & C_PULL) || !(pinCaps(pins[1]) & C_PULL)))
        logLine("ENC " + pinName(first) + ": input-only pins have no pull-up, the encoder needs its own resistors");
      p.value = 0;
      break;
    }
    default: break;
  }

  for (int i = 0; i < npins; i++) owner[pins[i]] = first;
  p.reported = p.value;
  p.dirty = isInputKind(kind);   // send the first value at once
  return true;
}

static bool getPort(const char* tok, Port*& p, int& pin) {
  if (!parsePin(tok, pin)) return false;
  int first = owner[pin];
  if (first < 0) return fail(pinName(pin) + " is not configured");
  if (first != pin) return fail(pinName(pin) + " belongs to the port on " + pinName(first) + ": use " + String(first));
  p = &ports[first];
  return true;
}

static bool cmdSet(char** tok, int n) {
  Port* p;
  int pin;
  float v;
  if (n < 3) return fail("usage: SET <pin> <value>");
  if (!getPort(tok[1], p, pin)) return false;
  if (!parseFloat(tok[2], v)) return fail(String("bad value: ") + tok[2]);
  switch (p->kind) {
    case K_DOUT:
      v = (v != 0) ? 1 : 0;
      writeDout(*p, v != 0);
      break;
    case K_PWM:
      v = constrain(v, 0.0f, 100.0f);
      ledcWrite(pin, (uint32_t)lroundf(v * PWM_MAX / 100.0f));
      break;
#if SOC_DAC_SUPPORTED
    case K_DAC:
      v = constrain(v, 0.0f, 100.0f);
      dacWrite(pin, (uint8_t)lroundf(v * 255 / 100.0f));
      break;
#endif
    case K_SERVO: {
      float us;
      if (p->continuous) {
        v = constrain(v, -100.0f, 100.0f);
        us = (p->minUs + p->maxUs) / 2.0f + (p->maxUs - p->minUs) / 2.0f * v / 100.0f;
      } else {
        v = constrain(v, 0.0f, 180.0f);
        us = p->minUs + (p->maxUs - p->minUs) * v / 180.0f;
      }
      writeServoUs(*p, us);
      break;
    }
    case K_HB2:
    case K_HB3:
      v = constrain(v, -100.0f, 100.0f);
      motorCancel(pin);   // direct power: back to open loop
      hbPower(*p, v);
      break;
    default:
      return fail(pinName(pin) + " is an input (" + KIND_NAMES[p->kind] + ")");
  }
  p->setpoint = v;
  return true;
}

static String fmtValue(const Port& p) {
  if (isInputKind(p.kind)) return String(p.value);
  float v = p.setpoint;
  if (v == (long)v) return String((long)v);
  return String(v, 2);
}

// ------------------------------------------------------
// Closed-loop motor commands
// ------------------------------------------------------
static bool getMotorPort(const char* tok, int& pin) {
  Port* p;
  if (!getPort(tok, p, pin)) return false;
  if (p->kind != K_HB2 && p->kind != K_HB3) return fail(pinName(pin) + " is not an H-bridge");
  return true;
}

static bool getMotor(const char* tok, Motor*& m, int& pin) {
  if (!getMotorPort(tok, pin)) return false;
  m = motorOf(pin);
  if (!m) return fail(pinName(pin) + " has no encoder: LINK " + String(pin) + " <encoder pin> first");
  return true;
}

static bool cmdLink(char** cmd, int n, String& data) {
  int hb, enc;
  Port* pe;
  if (n < 3) return fail("usage: LINK <motor pin> <encoder pin | NONE>");
  if (!getMotorPort(cmd[1], hb)) return false;
  if (is(cmd[2], "NONE")) { motorUnlinkPin(hb); return true; }
  if (!getPort(cmd[2], pe, enc)) return false;
  if (pe->kind != K_ENC) return fail(pinName(enc) + " is not an encoder");
  Motor* other = motorOfEnc(enc);
  if (other && other->hb != hb) return fail(pinName(enc) + " is already linked to the motor on " + pinName(other->hb));
  motorUnlinkPin(hb);   // linking again starts fresh
  Motor* m = nullptr;
  for (Motor& x : motors) if (x.hb < 0) { m = &x; break; }
  if (!m) return fail("LINK: " + String(MAX_MOTORS) + " closed-loop motors at most on " BOARD_NAME);
  *m = Motor{};
  m->hb = hb;
  m->enc = enc;
  calLoad(hb, m->cal, pe->mult);
  data = calText(m->cal);
  return true;
}

static bool cmdMpar(char** cmd, int n, String& data) {
  Motor* m;
  int pin;
  if (n < 2) return fail("usage: MPAR <motor pin> [<dir> <ks> <top> <tau> [kstart] [SAVE] | FORGET]");
  if (!getMotor(cmd[1], m, pin)) return false;
  if (n == 2) { data = calText(m->cal); return true; }
  if (m->mode != MM_OFF) { motorCancel(pin); motorCoast(*m); }
  if (is(cmd[2], "FORGET")) {
    m->cal = MotorCal{};
    calForget(pin);
    data = calText(m->cal);
    return true;
  }
  long dir;
  float ks, top, tau, kstart = 0;
  bool save = false, okArgs = n >= 6;
  for (int i = 6; i < n && okArgs; i++) {
    if (is(cmd[i], "SAVE")) save = true;
    else okArgs = i == 6 && parseFloat(cmd[i], kstart) && kstart >= 0 && kstart <= 100;
  }
  if (!okArgs || !parseLong(cmd[2], dir) || (dir != 1 && dir != -1) ||
      !parseFloat(cmd[3], ks) || ks < 0 || ks > 95 || !parseFloat(cmd[4], top) || top <= 0 ||
      !parseFloat(cmd[5], tau) || tau < 1 || tau > 2000)
    return fail("MPAR: <dir 1|-1> <ks 0-95 %> <top counts/s> <tau 1-2000 ms> [kstart 0-100 %] [SAVE]");
  if (dir != m->cal.dir) motorResetSpeed(*m);
  m->cal.valid = true;
  m->cal.dir = dir;
  m->cal.ks = ks;
  m->cal.top = top;
  m->cal.tauMs = tau;
  m->cal.kstart = kstart;
  m->cal.mult = ports[m->enc].mult;
  if (save) calSave(pin, m->cal);
  data = calText(m->cal);
  return true;
}

static bool cmdMotor(const char* c, char** cmd, int n, String& data) {
  Motor* m;
  int pin;
  if (n < 2) return fail(String("usage: ") + c + " <motor pin> ...");
  if (!getMotor(cmd[1], m, pin)) return false;

  if (is(c, "CAL")) {
    motorCancel(pin);
    m->cal.valid = false;   // until the new one is measured (a failed calibration leaves it uncalibrated)
    m->cal.dir = 1;
    motorResetSpeed(*m);
    motorCoast(*m);
    m->mode = MM_CAL;
    m->calStep = 0;
    m->calT0 = millis();
    return true;
  }
  if (is(c, "MGET")) {
    data = motorState(*m);
    return true;
  }
  if (is(c, "MLOG")) {
    long ms;
    if (n < 3 || !parseLong(cmd[2], ms) || (ms != 0 && (ms < 20 || ms > 1000))) return fail("MLOG: 20-1000 ms, 0 = off");
    m->logMs = ms;
    return true;
  }
  if (is(c, "MTUNE")) {
    float v[6] = { m->tSoft, m->tPos, m->tDecel, m->tKick ? 1.0f : 0.0f, m->tTol, (float)m->tStallMs };
    static const float lo[6] = { 0.3f, 0.0f, 0.1f, 0.0f, 0.0f, 0.0f }, hi[6] = { 5.0f, 5.0f, 1.0f, 1.0f, 10000.0f, 10000.0f };
    for (int i = 2; i < n; i++) {
      float x;
      if (i - 2 >= 6 || !parseFloat(cmd[i], x) || x < lo[i - 2] || x > hi[i - 2])
        return fail("MTUNE: [soft 0.3-5] [pos 0-5] [decel 0.1-1] [kick 0|1] [tol counts, 0 = 2 pulses] [stall 0-10000 ms]");
      v[i - 2] = x;
    }
    m->tStallMs = (uint16_t)lroundf(v[5]);
    m->tSoft = v[0];
    m->tPos = v[1];
    m->tDecel = v[2];
    m->tKick = v[3] >= 0.5f;
    m->tTol = v[4];
    data = "soft=" + String(m->tSoft, 2) + " pos=" + String(m->tPos, 2) + " decel=" + String(m->tDecel, 2) +
           " kick=" + String(m->tKick ? 1 : 0) + " tol=" + String(motorTol(*m), 0) + " stall=" + String(m->tStallMs);
    return true;
  }

  // RUN, RUNT, MOVE, HOLD drive the motor: it must be calibrated
  if (m->mode == MM_CAL) return fail(pinName(pin) + " is calibrating");
  if (!m->cal.valid) return fail(pinName(pin) + " is not calibrated: CAL " + String(pin) + " first");

  // Optional "[BRAKE|COAST|HOLD] [tag]" at the end of RUNT / MOVE
  MotorEnd endAction = END_BRAKE;
  long tag = 0;
  auto parseEnd = [&](int from) -> bool {
    for (int i = from; i < n; i++) {
      if (is(cmd[i], "BRAKE")) endAction = END_BRAKE;
      else if (is(cmd[i], "COAST")) endAction = END_COAST;
      else if (is(cmd[i], "HOLD")) endAction = END_HOLD;
      else if (!parseLong(cmd[i], tag) || tag < 0 || tag > 65535) return fail(String("bad option: ") + cmd[i]);
    }
    return true;
  };

  float pctToCps = m->cal.top / 100.0f;
  if (is(c, "RUN")) {
    float v;
    if (n < 3 || !parseFloat(cmd[2], v)) return fail("usage: RUN <motor pin> <speed -100..100>");
    motorTakeOver(*m);
    m->mode = MM_SPEED;
    m->target = constrain(v, -100.0f, 100.0f) * pctToCps;
    return true;
  }
  if (is(c, "RUNT")) {
    long ms;
    float v;
    if (n < 4 || !parseLong(cmd[2], ms) || ms < 1 || ms > 3600000L || !parseFloat(cmd[3], v))
      return fail("usage: RUNT <motor pin> <ms> <speed -100..100> [BRAKE|COAST|HOLD] [tag]");
    if (!parseEnd(4)) return false;
    motorTakeOver(*m);
    m->mode = MM_SPEED;
    m->target = constrain(v, -100.0f, 100.0f) * pctToCps;
    m->endMs = millis() + ms;
    if (!m->endMs) m->endMs = 1;
    m->endAction = endAction;
    m->tag = tag;
    return true;
  }
  if (is(c, "MOVE")) {
    long counts;
    float v;
    bool rel = n > 2 && is(cmd[2], "REL");
    if (n < 5 || !(rel || is(cmd[2], "ABS")) || !parseLong(cmd[3], counts) || !parseFloat(cmd[4], v))
      return fail("usage: MOVE <motor pin> REL|ABS <counts> <speed 1..100> [BRAKE|COAST|HOLD] [tag]");
    if (!parseEnd(5)) return false;
    // Relative to where it holds (chained moves do not add up errors), else to where it is
    float base = (m->mode == MM_HOLD) ? m->ref : (float)m->pos;
    motorTakeOver(*m);
    m->mode = MM_MOVE;
    m->moveX = rel ? base + counts : (float)counts;
    m->moveV = constrain(fabsf(v), 1.0f, 100.0f) * pctToCps;
    m->endAction = endAction;
    m->tag = tag;
    return true;
  }
  if (is(c, "HOLD")) {
    motorTakeOver(*m);
    m->mode = MM_HOLD;
    m->inPlace = false;
    m->ref = m->pos;
    m->vref = m->aref = 0;
    return true;
  }
  return fail(String("unknown command: ") + c);
}

// A new order on a closed-loop motor: continue smoothly from what it was doing
static void motorTakeOver(Motor& m) {
  motorEndTag(m, "CANCEL");   // a move that something waited for is replaced
  if (m.mode == MM_OFF || m.mode == MM_CAL) {
    m.ref = m.pos;
    m.vref = m.sp = m.speed;   // already turning (open loop): no jerk
    m.integ = 0;
  } else {
    m.sp = m.vref;
  }
  m.aref = 0;
  m.target = 0;
  m.endMs = m.settleMs = 0;
  m.wrongMs = 0;
  m.stallPos = m.pos;   // the stall timer starts now
  m.stallT = millis();
}


static void handleLine(char* line, Src src) {
  lastRxMs = millis();
  wdtTripped = false;

  char* tok[MAX_TOKENS];
  int n = 0;
  for (char* t = strtok(line, " \t\r\n"); t && n < MAX_TOKENS; t = strtok(nullptr, " \t\r\n")) tok[n++] = t;
  if (!n) return;

  long id = -1;
  char** cmd = tok;
  if (isdigit((unsigned char)tok[0][0])) {
    parseLong(tok[0], id);
    cmd++;
    n--;
    if (!n) return;
  }

  gErr = "";
  String data;
  bool ok = true;
  const char* c = cmd[0];

  if (is(c, "HELLO")) {
    data = String(FW_NAME) + " " + FW_VERSION + " " BOARD_NAME " " + bleName + " " + NimBLEDevice::getAddress().toString().c_str();
  } else if (is(c, "PING")) {
    // nothing to do
  } else if (is(c, "CAPS")) {
    for (const PinCap& pc : PIN_CAPS) {
      if (data.length()) data += ' ';
      data += String(pc.pin) + ':';
      if (pc.caps & C_IN) data += 'I';
      if (pc.caps & C_OUT) data += 'O';
      if (pc.caps & C_ADC) data += 'A';
      if (pc.caps & C_DAC) data += 'D';
      if (pc.caps & C_PULL) data += 'P';
    }
    data += " PWM=" + String(PWM_CHANNELS) + " ENC=" + String(SOC_PCNT_UNITS_PER_GROUP);
  } else if (is(c, "RESET")) {
    releaseAll();
  } else if (is(c, "NAME")) {
    const char* nm = n > 1 ? cmd[1] : "";
    size_t len = strlen(nm);
    bool valid = len >= 1 && len <= NAME_MAX_LEN;
    for (size_t i = 0; valid && i < len; i++) valid = isalnum((unsigned char)nm[i]) || nm[i] == '_' || nm[i] == '-';
    if (!valid) ok = fail("NAME: 1-20 characters A-Z a-z 0-9 _ -");
    else {
      bleName = nm;
      prefs.begin("esp32io", false);
      prefs.putString("name", bleName);
      prefs.end();
      applyBleName();
      data = bleName;
    }
  } else if (is(c, "RATE")) {
    long v;
    if (n < 2 || !parseLong(cmd[1], v) || v < 5 || v > 1000) ok = fail("RATE: 5-1000 ms");
    else reportMs = v;
  } else if (is(c, "WDT")) {
    long v;
    if (n < 2 || !parseLong(cmd[1], v) || v < 0 || v > 60000) ok = fail("WDT: 0-60000 ms (0 = off)");
    else wdtMs = v;
  } else if (is(c, "CFG")) {
    ok = cmdCfg(cmd, n);
  } else if (is(c, "REL")) {
    Port* p;
    int pin;
    ok = n > 1 && getPort(cmd[1], p, pin);
    if (n < 2) ok = fail("usage: REL <pin>");
    if (ok) releasePort(pin);
  } else if (is(c, "SET")) {
    ok = cmdSet(cmd, n);
  } else if (is(c, "GET")) {
    Port* p;
    int pin;
    ok = n > 1 ? getPort(cmd[1], p, pin) : fail("usage: GET <pin>");
    if (ok) data = fmtValue(*p);
  } else if (is(c, "STOP")) {
    bool brake = false;
    int pin = -1;
    for (int i = 1; i < n && ok; i++) {
      if (is(cmd[i], "BRAKE")) brake = true;
      else if (is(cmd[i], "COAST")) brake = false;
      else {
        Port* p;
        ok = getPort(cmd[i], p, pin);
      }
    }
    if (ok) {
      if (pin >= 0) stopPort(ports[pin], brake);
      else stopAll(brake);
    }
  } else if (is(c, "ZERO")) {
    Port* p;
    int pin;
    long preset = 0;
    ok = n > 1 ? getPort(cmd[1], p, pin) : fail("usage: ZERO <pin> [preset]");
    if (ok && p->kind != K_ENC) ok = fail(pinName(pin) + " is not an encoder");
    if (ok && n > 2 && !parseLong(cmd[2], preset)) ok = fail(String("bad preset: ") + cmd[2]);
    if (ok) {
      int32_t before = encRead(*p);
      pcnt_unit_clear_count(p->unit);
      p->offset = preset;
      p->value = encRead(*p);
      p->dirty = true;
      if (Motor* m = motorOfEnc(pin)) {
        // The count jumped: not a speed. A holding / moving motor keeps its place: shift its reference too.
        float d = (float)(p->value - before) * m->cal.dir;
        m->ref += d;
        m->moveX += d;
        m->pos += (int32_t)d;
        m->lastPos += (int32_t)d;
        motorResetSpeed(*m);
      }
    }
  } else if (is(c, "LINK")) {
    ok = cmdLink(cmd, n, data);
  } else if (is(c, "MPAR")) {
    ok = cmdMpar(cmd, n, data);
  } else if (is(c, "CAL") || is(c, "RUN") || is(c, "RUNT") || is(c, "MOVE") || is(c, "HOLD") || is(c, "MGET") || is(c, "MLOG") || is(c, "MTUNE")) {
    ok = cmdMotor(c, cmd, n, data);
  } else {
    ok = fail(String("unknown command: ") + c);
  }

  if (ok && id == 0) return;   // fire-and-forget
  String reply = (id >= 0) ? String(id) + " " : String();
  reply += ok ? "OK" : "ERR";
  if (ok && data.length()) reply += " " + data;
  if (!ok) reply += " " + gErr;
  sendTo(src, reply);
}

// ------------------------------------------------------
// Inputs: sampling and reports
// ------------------------------------------------------
static void pollInputs(uint32_t now) {
  for (int i = 0; i < MAX_PIN; i++) {
    Port& p = ports[i];
    switch (p.kind) {
      case K_DIN: {
        uint8_t raw = digitalRead(i);
        if (raw != p.lastRaw) {
          p.lastRaw = raw;
          p.rawChangedMs = now;
        } else if (now - p.rawChangedMs >= p.debounceMs) {
          p.value = (raw == (p.activeLow ? LOW : HIGH)) ? 1 : 0;
        }
        break;
      }
      case K_AIN:
        if (now - p.lastSampleMs >= AIN_SAMPLE_MS) {
          p.lastSampleMs = now;
          p.acc += analogRead(i);
          if (++p.nAcc >= AIN_SAMPLES) {
            p.value = (p.acc + AIN_SAMPLES / 2) / AIN_SAMPLES;
            p.acc = 0;
            p.nAcc = 0;
          }
        }
        break;
      case K_ENC:
        p.value = encRead(p);
        break;
      default: break;
    }
  }
}

static void reportInputs(bool all) {
  String line = "V";
  for (int i = 0; i < MAX_PIN; i++) {
    Port& p = ports[i];
    if (!isInputKind(p.kind)) continue;
    bool changed = (p.kind == K_AIN) ? abs(p.value - p.reported) >= p.delta : p.value != p.reported;
    if (!(all || changed || p.dirty)) continue;
    line += ' ';
    line += String(i) + '=' + String(p.value);
    p.reported = p.value;
    p.dirty = false;
    if (line.length() > 180) {
      sendReport(line);
      line = "V";
    }
  }
  if (line.length() > 1) sendReport(line);
}

// ------------------------------------------------------
// Setup / loop
// ------------------------------------------------------
void setup() {
  Serial.begin(115200);
  memset(owner, -1, sizeof(owner));
  cmdQueue = xQueueCreate(CMD_QUEUE_LEN, sizeof(CmdLine));

  prefs.begin("esp32io", true);
  bleName = prefs.getString("name", DEFAULT_BLE_NAME);
  prefs.end();

  NimBLEDevice::init(bleName.c_str());
  NimBLEDevice::setMTU(247);

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());
  pServer->advertiseOnDisconnect(true);

  NimBLEService* service = pServer->createService(NUS_SERVICE_UUID);
  pTxChar = service->createCharacteristic(NUS_CHAR_TX_UUID, NIMBLE_PROPERTY::NOTIFY);
  NimBLECharacteristic* rx = service->createCharacteristic(NUS_CHAR_RX_UUID, NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR);
  rx->setCallbacks(new RxCallbacks());

  // Advertisement: flags (3) + NUS UUID (18) + marker (8) = 29 bytes of 31. The name goes in the scan response.
  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP);
  advData.setCompleteServices(NimBLEUUID(NUS_SERVICE_UUID));
  advData.setManufacturerData(ADV_MARKER, sizeof(ADV_MARKER));
  adv->setAdvertisementData(advData);
  NimBLEAdvertisementData scanData;
  scanData.setName(bleName.c_str());
  adv->setScanResponseData(scanData);
  adv->enableScanResponse(true);
  adv->setMinInterval(32);   // 20 ms
  adv->setMaxInterval(64);   // 40 ms
  adv->start();

  Serial.println();
  Serial.println("===============================================");
  Serial.println(String(FW_NAME) + " v" + FW_VERSION + " on " BOARD_NAME);
  Serial.println("BLE name: " + bleName + "   MAC: " + NimBLEDevice::getAddress().toString().c_str());
  Serial.println("Commands can be typed here too, e.g.  CAPS  or  CFG 4 DIN UP LOW");
  Serial.println("===============================================");
}

static char serialBuf[CMD_LEN];
static size_t serialLen = 0;

void loop() {
  uint32_t now = millis();

  // A new PC or a lost PC both start from a clean board
  if (bleConnectedFlag) {
    bleConnectedFlag = false;
    releaseAll();
    wdtMs = 0;
    reportMs = REPORT_MS_DEFAULT;
    Serial.println("L PC connected");
  }
  if (bleDisconnectedFlag) {
    bleDisconnectedFlag = false;
    releaseAll();
    wdtMs = 0;
    Serial.println("L PC disconnected, all pins released");
  }

  CmdLine cl;
  while (xQueueReceive(cmdQueue, &cl, 0) == pdTRUE) handleLine(cl.text, SRC_BLE);

  while (Serial.available()) {
    char ch = (char)Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (serialLen) {
        serialBuf[serialLen] = '\0';
        handleLine(serialBuf, SRC_SERIAL);
        serialLen = 0;
      }
    } else if (serialLen < CMD_LEN - 1) {
      serialBuf[serialLen++] = ch;
    }
  }

  pollInputs(now);
  motorsTick();

  if (now - lastReportMs >= reportMs) {
    lastReportMs = now;
    bool keyframe = now - lastKeyframeMs >= KEYFRAME_MS;
    if (keyframe) lastKeyframeMs = now;
    reportInputs(keyframe);
  }

  if (wdtMs && !wdtTripped && now - lastRxMs > wdtMs) {
    wdtTripped = true;
    stopAll(false);
    logLine("watchdog: no command for " + String(wdtMs) + " ms, outputs stopped");
  }

  delay(1);
}
