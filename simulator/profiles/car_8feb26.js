// ============================================================================
// profiles/car_8feb26.js — profile descriptor for car_8feb26.ino (Vasu CarK1).
// This file + car_8feb26.firmware.js are the ONLY places that know about this
// sketch. To simulate another sketch, copy both, adapt, and register the new
// profile in profiles/index.js (see README "Adding a firmware profile").
// ============================================================================

import { Firmware, STATE_NAMES, STATE_OLED } from './car_8feb26.firmware.js';

export default {
  id: 'car_8feb26',
  label: 'car_8feb26 · CarK1 (patched)',
  sketch: 'car_8feb26/car_8feb26.ino',

  // State machine metadata (drives the state-flow panel and the log)
  states: STATE_NAMES,
  oledStates: STATE_OLED,
  flow: [1, 2, 3, 4, 5],          // panel order: SCANNING..TURNING (IDLE hidden)

  // Mirror of the .ino #define block (car_8feb26.ino:47-60)
  fwDefaults: {
    COLL_DIST:       30,    // cm
    MAX_SPEED:       200,   // PWM
    MAX_TURN_SPEED:  255,   // PWM
    MIN_SPEED:       110,   // PWM — unused by the patched .ino; pre-patch mode uses it
    CENTER_ANGLE:    90,
    LEFT_ANGLE:      5,     // defined but unused by the scan loop
    RIGHT_ANGLE:     155,   // defined but unused by the scan loop
    SQUINT_ANGLE:    25,

    FORWARD_MS:      1000,  // forward burst before rescan (.ino:56)
    REVERSE_MS:      500,   // reverse duration (.ino:57)
    TURN_MS:         750,   // turn duration (.ino:58)
    SENSOR_STEP_MS:  30,    // updateSensors() throttle (.ino:59)
    CLEAR_PATH_MIN:  50,    // clear-side threshold in REVERSING (.ino:60)

    // literals still inside .ino functions
    SERVO_SETTLE_MS: 30,    // delay(30) in fastReadSonic()
    DISPLAY_MS:      200,   // OLED refresh
    BEEP_MS:         150,   // per-beep period in beep()
    SENSOR_MAX_CM:   250,   // fastReadSonic() clamp → 99 sentinel
    SENSOR_SENTINEL: 99,
  },

  // Sliders shown in the "Firmware" parameter column: [key, min, max, step, unit, hint]
  fwSliders: [
    ['COLL_DIST',      5, 100, 1,  'cm',  'obstacle threshold'],
    ['MAX_SPEED',      0, 255, 5,  'pwm', 'drive PWM'],
    ['MIN_SPEED',      0, 255, 5,  'pwm', 'low-speed PWM (unused since patch; pre-patch mode uses it)'],
    ['MAX_TURN_SPEED', 0, 255, 5,  'pwm', 'steering PWM'],
    ['SQUINT_ANGLE',   5, 60,  1,  '°',   'L/R scan offset'],
    ['FORWARD_MS',   200, 3000, 50, 'ms', 'forward burst'],
    ['REVERSE_MS',   100, 2000, 50, 'ms', 'reverse duration'],
    ['TURN_MS',      100, 2000, 50, 'ms', 'turn duration'],
    ['SENSOR_STEP_MS', 10, 100, 5,  'ms', 'scan step throttle'],
    ['CLEAR_PATH_MIN', 10, 150, 5,  'cm', 'clear-side threshold'],
  ],

  // Header toggles specific to this profile
  toggles: [
    { key: 'faithful', label: 'pre-patch bugs', badge: 'PRE-PATCH FIRMWARE',
      title: 'Reproduce the four bugs that lived in the .ino before the 2026-08-15 patch' },
  ],

  createFirmware(hal) { return new Firmware(hal); },

  // Paste-ready #define block from the live slider values
  exportDefines(FW) {
    const L = [];
    L.push('// --- tuned in simulator, ' + new Date().toISOString().slice(0, 10) + ' ---');
    L.push(`#define COLL_DIST         ${FW.COLL_DIST}`);
    L.push(`#define MAX_SPEED         ${FW.MAX_SPEED}`);
    L.push(`#define MAX_TURN_SPEED    ${FW.MAX_TURN_SPEED}`);
    L.push(`#define MIN_SPEED         ${FW.MIN_SPEED}`);
    L.push('');
    L.push(`#define CENTER_ANGLE      ${FW.CENTER_ANGLE}`);
    L.push(`#define LEFT_ANGLE        ${FW.LEFT_ANGLE}`);
    L.push(`#define RIGHT_ANGLE       ${FW.RIGHT_ANGLE}`);
    L.push(`#define SQUINT_ANGLE      ${FW.SQUINT_ANGLE}`);
    L.push('');
    L.push(`#define FORWARD_MS        ${FW.FORWARD_MS}  // forward burst before rescan`);
    L.push(`#define REVERSE_MS        ${FW.REVERSE_MS}   // reverse duration`);
    L.push(`#define TURN_MS           ${FW.TURN_MS}   // turn duration`);
    L.push(`#define SENSOR_STEP_MS    ${FW.SENSOR_STEP_MS}    // updateSensors() throttle`);
    L.push(`#define CLEAR_PATH_MIN    ${FW.CLEAR_PATH_MIN}    // min side clearance (cm) to commit a turn`);
    return L.join('\n');
  },

  // Shown in the notes card under the parameters panel
  notesHtml: `
    <div class="findings">
      <h3>✓ Firmware bugs — patched into the .ino 2026-08-15</h3>
      <ul>
        <li><b>Q1</b> <code>setMotors(int8_t,…)</code> — MAX_SPEED&nbsp;200 wrapped to <b>−56</b>: "forward" drove the reverse pin; MAX_TURN_SPEED&nbsp;255 wrapped to −1 → params now <code>int16_t</code> <span class="dim">(.ino:118)</span></li>
        <li><b>Q2</b> speed 0 wrote MIN_SPEED&nbsp;110 — never stopped, "straight" steered right → zero now writes 0 <span class="dim">(.ino:126,134)</span></li>
        <li><b>Q3</b> MOVING_FORWARD / REVERSING passed turnSpeed = MIN_SPEED → now 0 <span class="dim">(.ino:276,297)</span></li>
        <li><b>Q4</b> <code>uint8_t cm</code> — echoes &gt;255 cm wrapped (300&nbsp;cm read as 44&nbsp;cm) → now <code>unsigned int</code> <span class="dim">(.ino:155)</span></li>
      </ul>
      <p class="hint">Default mode = the <b>patched</b> firmware (verified compiling, Uno: 35% flash / 25% SRAM). Toggle <b>pre-patch bugs</b> in the header to replay the old behavior. Original saved as <code>car_8feb26.ino.prepatch-2026-08-15.bak</code>.</p>
    </div>`,
};
