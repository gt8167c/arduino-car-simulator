// ============================================================================
// profiles/car_16Jun24.js — profile descriptor for car_16Jun24.ino.
// Autonomous car with a rear APDS9960 used as a PROXIMITY sensor (not gesture):
// it checks for obstacles behind before reversing away from a front collision.
// ============================================================================

import { Firmware, STATE_NAMES } from './car_16Jun24.firmware.js';

export default {
  id: 'car_16Jun24',
  label: 'car_16Jun24 · rear APDS9960',
  sketch: 'car_16Jun24/car_16Jun24.ino',

  states: STATE_NAMES,
  flow: [1, 2, 3, 5, 6, 7, 8],   // SCAN_FORWARD..MOVE_FORWARD (IDLE/REAR_BLOCKED shown only when active)

  // 128x32 four-line panel (Adafruit128x32, all set1X)
  oled: { width: 128, height: 32, rows: [{ scale: 1 }, { scale: 1 }, { scale: 1 }, { scale: 1 }] },

  // A rear proximity readout in counts (higher = closer), with its clear/blocked
  // threshold. Rendered by ui.js and drawn as a lobe behind the car.
  rearSensor: {
    label: 'REAR APDS9960',
    unit: 'counts',
    max: 255,
    thresholdKey: 'REAR_CLEAR_MAX',
    hint: 'IR reflectance, higher = closer. Below the marker = clear to reverse.',
  },

  // Mirror of the .ino #define block (car_16Jun24.ino:10-56)
  fwDefaults: {
    COLL_DIST:       30,    // stop-and-reverse threshold (cm)
    TURN_DIST:       50,    // COLL_DIST+20, defined but unused in the autonomous path
    MAX_SPEED:       200,
    MAX_TURN_SPEED:  255,
    MIN_SPEED:       110,
    CONTROL_MAX:     99,    // also the "nothing in range" sentinel
    CENTER_ANGLE:    90,
    LEFT_ANGLE:      5,
    RIGHT_ANGLE:     155,
    SQUINT_ANGLE:    25,
    CORRECTION_ANGLE: 0,

    REAR_CLEAR_MAX:  3,     // literal in the .ino: `if (prevBackwardDist < 3)`
    CLEAR_PATH_MIN:  50,    // literal: `< 50` flank test in findClearPath()

    TONE_MS:         160,   // playtone() per-note period
    SENSOR_SENTINEL: 99,
    SENSOR_MAX_CM:   255,
    BEEP_MS:         160,
    CARLABEL:        '16Jun24 CarK1',
  },

  fwSliders: [
    ['COLL_DIST',      5, 100, 1,  'cm',     'front stop-and-reverse threshold'],
    ['REAR_CLEAR_MAX', 1, 100, 1,  'counts', 'rear APDS9960: below this = clear to reverse'],
    ['CLEAR_PATH_MIN', 10, 150, 5, 'cm',     'flank clearance needed to stop reversing'],
    ['MAX_SPEED',      0, 255, 5,  'pwm',    'drive PWM'],
    ['MAX_TURN_SPEED', 0, 255, 5,  'pwm',    'steering PWM'],
    ['MIN_SPEED',      0, 255, 5,  'pwm',    'low PWM (also written by stop() — see B5)'],
    ['SQUINT_ANGLE',   5, 60,  1,  '°',      'L/R scan offset'],
    ['CORRECTION_ANGLE', -20, 20, 1, '°',    'servo mounting offset'],
  ],

  toggles: [
    { key: 'faithful', label: 'pre-patch bugs', badge: 'PRE-PATCH FIRMWARE',
      title: 'Replay the pre-2026-08-16 behaviour: drives forward into the obstacle when the rear is blocked, uint8 wrap, stop() creep' },
  ],

  createFirmware(hal) { return new Firmware(hal); },

  exportDefines(FW) {
    const L = [];
    L.push('// --- tuned in simulator, ' + new Date().toISOString().slice(0, 10) + ' ---');
    L.push(`#define COLL_DIST         ${FW.COLL_DIST}`);
    L.push(`#define TURN_DIST         COLL_DIST+20`);
    L.push(`#define MAX_SPEED         ${FW.MAX_SPEED}`);
    L.push(`#define MAX_TURN_SPEED    ${FW.MAX_TURN_SPEED}`);
    L.push(`#define MIN_SPEED         ${FW.MIN_SPEED}`);
    L.push('');
    L.push(`#define CENTER_ANGLE      ${FW.CENTER_ANGLE}`);
    L.push(`#define LEFT_ANGLE        ${FW.LEFT_ANGLE}`);
    L.push(`#define RIGHT_ANGLE       ${FW.RIGHT_ANGLE}`);
    L.push(`#define SQUINT_ANGLE      ${FW.SQUINT_ANGLE}`);
    L.push(`#define CORRECTION_ANGLE  ${FW.CORRECTION_ANGLE}`);
    L.push('');
    L.push('// new defines — replace the matching literals in the .ino:');
    L.push(`#define REAR_CLEAR_MAX    ${FW.REAR_CLEAR_MAX}     // readBackwardLaser(): below = rear clear`);
    L.push(`#define CLEAR_PATH_MIN    ${FW.CLEAR_PATH_MIN}    // findClearPath() flank test`);
    return L.join('\n');
  },

  notesHtml: `
    <div class="findings">
      <h3>✓ Firmware bugs — patched into the .ino 2026-08-16</h3>
      <ul>
        <li><b>B1</b> <code>apds</code> was a <b>local</b> in <code>setup()</code>, invisible to <code>readBackwardLaser()</code> → now declared at file scope <span class="dim">(.ino:100)</span></li>
        <li><b>B2</b> <code>SparkFun_APDS9960</code> has no <code>SoftwareWire*</code> constructor → <b>SoftwareWire dropped</b>; the APDS9960 now shares the OLED's hardware I2C bus (0x39 vs 0x3C), which also frees D7/D8 for Bluetooth <span class="dim">(.ino:31-36)</span></li>
        <li><b>B3</b> when the rear was blocked, <code>moveforwardduration</code> was never set and still passed to <code>moveForwardStraight()</code> — the car drove <b>into</b> the obstacle it had just detected → initialised to 0 and guarded; it now stops <span class="dim">(.ino:155,195)</span></li>
        <li><b>B4</b> <code>uint8_t cm</code> made <code>cm &gt; 255</code> dead and wrapped long echoes → reads into <code>unsigned int</code> <span class="dim">(.ino:~330)</span></li>
        <li><b>B5</b> <code>stop()</code> wrote MIN_SPEED to forward, left <i>and</i> right pins → writes 0; "straight" is 0 too <span class="dim">(.ino:~340)</span></li>
        <li><b>B6</b> Bluetooth mode's rear check never read the sensor (<code>prevBackwardDist = 0</code> then testing it), so the rear always looked clear → now calls <code>readBackwardLaser()</code>, which works in both modes since the APDS is initialised unconditionally</li>
      </ul>
      <p class="hint">Both build configurations compile clean on Uno — <b>AUTONOMOUS 41% flash / 26% SRAM</b>, Bluetooth path 49% / 35%. Timing literals promoted to <code>REAR_CLEAR_MAX</code> and <code>CLEAR_PATH_MIN</code>.</p>
      <p class="hint">Default mode = the <b>patched</b> firmware. Toggle <b>pre-patch bugs</b> in the header to replay the old behaviour.</p>
    </div>`,
};
