// Types used by ESP32io.ino. They live in a header because the Arduino IDE writes the
// function prototypes at the top of the .ino, before any type defined there.
#pragma once

#include <Arduino.h>
#include "driver/pulse_cnt.h"

enum Kind : uint8_t { K_NONE, K_DIN, K_DOUT, K_PWM, K_AIN, K_DAC, K_SERVO, K_HB2, K_HB3, K_ENC, K_STEP4, K_STEPDIR };

struct Port {
  Kind kind = K_NONE;
  uint8_t pins[4] = { 0, 0, 0, 0 };
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
  uint8_t mult = 4;           // ENC: counts per encoder pulse (X1, X2, X4)
  bool slowDecay = false;     // HB2: PWM off-time brakes (one input HIGH, the other inverted PWM)
};

// Closed-loop motor: what calibration measured (speeds in encoder counts per second)
struct MotorCal {
  bool valid = false;
  int8_t dir = 1;             // +1: positive power makes the encoder count go up
  float ks = 0;               // power (%) that friction eats: the base power of any speed
  float top = 0;              // speed at 100 % power, counts/s
  float tauMs = 0;            // time to reach 63 % of a speed step
  float kstart = 0;           // power (%) that starts it from rest (breakaway kick when it sticks)
  uint8_t mult = 4;           // encoder mode the speeds were measured with
};

enum MotorMode : uint8_t { MM_OFF, MM_SPEED, MM_CAL, MM_MOVE, MM_HOLD };
enum MotorEnd : uint8_t { END_BRAKE, END_COAST, END_HOLD };

#define MOTOR_HIST  8         // encoder samples kept for the speed estimate
#define CAL_SAMPLES 80        // speed samples kept during the calibration step (80 x 5 ms)

// H-bridge port linked to an encoder port, run by the control loop
struct Motor {
  int8_t hb = -1, enc = -1;   // first pins of the two ports (-1 = free slot)
  MotorCal cal;
  MotorMode mode = MM_OFF;
  float target = 0;           // SPEED: requested speed, counts/s (motor direction)
  float sp = 0;               // SPEED: setpoint after the acceleration ramp
  float ref = 0;              // reference position the motor follows, counts (motor direction)
  float vref = 0, aref = 0;   // reference speed (counts/s) and acceleration (counts/s2)
  float moveX = 0;            // MOVE: target position
  float moveV = 0;            // MOVE: cruise speed (> 0)
  MotorEnd endAction = END_BRAKE;   // MOVE / timed RUN: what to do at the end
  uint16_t tag = 0;           // MOVE / timed RUN: echoed in "M <pin> DONE|CANCEL <tag>" (0 = nothing waits)
  uint32_t endMs = 0;         // timed RUN: end time (0 = runs until told otherwise)
  uint32_t settleMs = 0;      // MOVE: when the reference reached the target
  int32_t lastPos = 0;        // stuck detection: last position and when it changed
  uint32_t lastMoveMs = 0;
  uint32_t tapUntil = 0;      // HOLD: end of the running breakaway tap (0 = none)
  float tSoft = 1.0f;         // MTUNE: x closed-loop time (higher = softer, slower corrections)
  float tPos = 1.0f;          // MTUNE: x position stiffness
  float tDecel = 0.5f;        // MTUNE: deceleration of moves, x the acceleration
  bool tKick = true;          // MTUNE: breakaway kick when stuck
  float tTol = 0;             // MTUNE: "in place" tolerance, counts (0 = 2 encoder pulses)
  uint16_t tStallMs = 600;    // MTUNE: stall = pushing without moving this long (0 = no stall detection)
  int32_t stallPos = 0;       // stall detection: position and time when it last moved (or stopped pushing)
  uint32_t stallT = 0;
  bool inPlace = false;       // HOLD: in place (braked) until pushed beyond 2 x the tolerance
  float integ = 0;            // integral part of the PI, %
  float power = 0;            // last power sent to the H-bridge, %
  float speed = 0;            // measured speed, counts/s (motor direction)
  int32_t pos = 0;            // count x dir
  int32_t hist[MOTOR_HIST] = {};
  uint32_t histUs[MOTOR_HIST] = {};
  uint8_t hidx = 0, hn = 0;
  uint32_t wrongMs = 0;       // since when the motor turns against the setpoint
  uint16_t logMs = 0;         // MLOG period, 0 = off
  uint32_t lastLogMs = 0;
  // calibration state
  uint8_t calStep = 0;
  uint32_t calT0 = 0;
  int32_t calC0 = 0;
  float calPower = 0, calKsStart = 0, calV100 = 0, calAcc = 0;
  uint16_t calN = 0, calNs = 0;
  float calSpd[CAL_SAMPLES] = {};
};

// Stepper motor: the step interrupt makes the steps, the 5 ms loop sets their rate (acceleration, moves)
struct Stepper {
  int8_t port = -1;           // first pin (-1 = free slot)
  bool stepDir = false;       // STEPDIR driver board (A4988...), else 4 coils (ULN2003...)
  uint8_t pin[4] = {};        // STEP4: coils A B C D. STEPDIR: STEP, DIR, EN
  bool hasEn = false;         // STEPDIR: EN pin wired (LOW = driver on)
  int8_t rev = 1;             // -1: the motor turns the other way (REV)
  uint8_t seqStep = 1;        // STEP4: steps through the half-step table by 1 (HALF) or 2 (FULL, WAVE)
  float top = 800;            // steps/s at 100 %
  float accel = 4000;         // steps/s2
  // shared with the step interrupt
  volatile int32_t pos = 0;
  volatile uint32_t inc = 0;  // added to phase every tick: steps/s x 2^32 / STEP_TICK_HZ (0 = no steps)
  volatile int8_t dir = 1;    // direction of the next steps
  volatile bool limitOn = false;
  volatile int32_t limit = 0; // MOVE: the interrupt makes no step past this position
  volatile bool energized = false;
  uint32_t phase = 0;
  uint8_t idx = 0;            // STEP4: place in the half-step table
  int8_t dirOut = 0;          // STEPDIR: direction written on DIR (0 = not yet)
  bool pulseHigh = false;     // STEPDIR: STEP is HIGH (back LOW on the next tick)
  // motion (loop side)
  MotorMode mode = MM_OFF;    // MM_SPEED (RUN, RUNT, HOLD = slow down to 0), MM_MOVE
  float v = 0;                // step rate now, steps/s (signed)
  float target = 0;           // SPEED: requested rate
  int32_t moveX = 0;          // MOVE: target position
  float moveV = 0;            // MOVE: cruise rate (> 0)
  bool ending = false;        // SPEED: slowing down to 0, then the end action
  MotorEnd endAction = END_BRAKE;
  uint16_t tag = 0;
  uint32_t endMs = 0;         // RUNT: end time
  uint16_t logMs = 0;
  uint32_t lastLogMs = 0;
};

enum Src : uint8_t { SRC_BLE, SRC_SERIAL };
