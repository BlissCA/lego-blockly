// Types used by ESP32io.ino. They live in a header because the Arduino IDE writes the
// function prototypes at the top of the .ino, before any type defined there.
#pragma once

#include <Arduino.h>
#include "driver/pulse_cnt.h"

enum Kind : uint8_t { K_NONE, K_DIN, K_DOUT, K_PWM, K_AIN, K_DAC, K_SERVO, K_HB2, K_HB3, K_ENC };

struct Port {
  Kind kind = K_NONE;
  uint8_t pins[3] = { 0, 0, 0 };
  uint8_t npins = 0;
  bool activeLow = false;     // DIN: LOW reads as 1. DOUT: 1 drives LOW
  uint16_t debounceMs = 0;
  bool continuous = false;    // SERVO 360
  uint16_t minUs = 0, maxUs = 0;
  int32_t delta = 1;          // AIN report threshold
  float setpoint = 0;         // outputs: last SET value
  int32_t value = 0;          // inputs: current value
  int32_t reported = 0;
  bool dirty = false;         // report on the next cycle even if unchanged
  uint8_t lastRaw = 0;        // DIN debounce
  uint32_t rawChangedMs = 0;
  uint32_t acc = 0;           // AIN averaging
  uint8_t nAcc = 0;
  uint32_t lastSampleMs = 0;
  pcnt_unit_handle_t unit = nullptr;   // ENC
  pcnt_channel_handle_t chA = nullptr, chB = nullptr;
  int32_t offset = 0;
};

enum Src : uint8_t { SRC_BLE, SRC_SERIAL };
