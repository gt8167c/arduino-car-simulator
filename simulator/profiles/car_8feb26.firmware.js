// ============================================================================
// profiles/car_8feb26.firmware.js — line-faithful port of car_8feb26.ino.
// Structure intentionally mirrors the sketch (same function names) so a diff
// against the .ino is easy when you refine the Arduino implementation.
//
// The HAL object stands in for the Arduino hardware:
//   hal.readUltrasonic(correctedServoDeg) -> physical cm (int, 0 = no echo)
//   hal.servoWrite(correctedServoDeg)
//   hal.setPins({fwd, rev, left, right})  -> PWM 0-255 per motor pin
//   hal.beep(count)
//   hal.display(line1, line2, line3)
//
// PRE-PATCH MODE (SIM.faithful = true) reproduces four bugs that lived in the
// .ino until the 2026-08-15 patch (fixed at .ino:118,126,134,155,276,297):
//   Q1 setMotors(int8_t, int8_t): MAX_SPEED 200 wrapped to -56, so "forward at
//      200" actually drove reverse at 56; MAX_TURN_SPEED 255 wrapped to -1.
//   Q2 speed 0 wrote MIN_SPEED (110) to the forward/right pins — "stop" never
//      stopped, "straight" always steered right.
//   Q3 STATE_MOVING_FORWARD/REVERSING passed turnSpeed = MIN_SPEED (110) —
//      constant right veer (masked by Q1's wrap).
//   Q4 uint8_t cm = ultrasonic.read(): echoes past 255 cm wrapped mod 256
//      (300 cm read as 44 cm -> phantom obstacle).
// With the toggle OFF the model matches the PATCHED .ino — the current firmware.
// ============================================================================

import { FW, SIM } from '../config.js';

export const ST = { IDLE: 0, SCANNING: 1, MOVING_FORWARD: 2, OBSTACLE_DETECTED: 3, REVERSING: 4, TURNING: 5 };
export const STATE_NAMES = ['IDLE', 'SCANNING', 'MOVING_FORWARD', 'OBSTACLE_DETECTED', 'REVERSING', 'TURNING'];
export const STATE_OLED  = ['IDLE', 'SCAN', 'MOVE FWD', 'OBSTACLE', 'REVERSE', 'TURNING'];

const toInt8 = v => (((Math.trunc(v) % 256) + 384) % 256) - 128;

export class Firmware {
  constructor(hal) {
    this.hal = hal;
    this.onTransition = null;   // (fromIdx, toIdx, now, cause)
    this.reset(0);
  }

  reset(now) {
    this.state = ST.SCANNING;
    this.stateStartTime = now;
    this.stateSince = now;
    this.sensorCache = { forward: 99, left: 99, right: 99, timestamp: 0 };
    this.scanStep = 0;
    this.stepTime = 0;
    this.lastAngle = 255;              // fastReadSonic() static cache
    this.servoCorrected = 90;
    this.pins = { fwd: 0, rev: 0, left: 0, right: 0 };
    this.blockedUntil = 0;             // blocking delay()s (beep, setup)
    this.lastDisplay = 0;
    this.lastScan = { left: null, forward: null, right: null }; // {corrected, cm} for ray viz
    this.pendingSettle = false;

    // setup() (.ino): OLED banner, beep(3), delay(500)
    this.hal.servoWrite(90);
    this.hal.display('Vasu CarK1', 'Setup complete', '');
    this.hal.beep(3);
    this.blockedUntil = now + 3 * FW.BEEP_MS + 500;
    this._setState(ST.SCANNING, now, 'boot');
  }

  _setState(s, now, cause) {
    if (s !== this.state && this.onTransition) this.onTransition(this.state, s, now, cause);
    this.state = s;
    this.stateSince = now;
  }

  // --- setMotors (.ino:118-137) ----------------------------------------------
  setMotors(forwardSpeed, turnSpeed) {
    if (SIM.faithful) {                       // Q1: pre-patch int8_t wrap
      forwardSpeed = toInt8(forwardSpeed);
      turnSpeed = toInt8(turnSpeed);
    }
    const p = { fwd: 0, rev: 0, left: 0, right: 0 };

    if (forwardSpeed > 0)      p.fwd = Math.abs(forwardSpeed);
    else if (forwardSpeed < 0) p.rev = Math.abs(forwardSpeed);
    else if (SIM.faithful)     p.fwd = FW.MIN_SPEED;            // Q2 (pre-patch)

    if (turnSpeed > 0)         p.right = Math.abs(turnSpeed);
    else if (turnSpeed < 0)    p.left = Math.abs(turnSpeed);
    else if (SIM.faithful)     p.right = FW.MIN_SPEED;          // Q2 (pre-patch)

    this.pins = p;
    this.hal.setPins(p);
  }

  // --- fastReadSonic (.ino:141-157) ------------------------------------------
  fastReadSonic(angle) {
    const corrected = 180 - angle;
    if (this.lastAngle !== corrected) {
      this.hal.servoWrite(corrected);
      this.pendingSettle = true;              // models the blocking delay(30)
      this.lastAngle = corrected;
    }
    this.servoCorrected = corrected;
    let cm = Math.round(this.hal.readUltrasonic(corrected));
    if (SIM.faithful) cm = cm & 0xFF;                           // Q4 (pre-patch)
    else if (cm > FW.SENSOR_MAX_CM) cm = FW.SENSOR_SENTINEL;
    const out = (cm === 0 || cm > FW.SENSOR_MAX_CM) ? FW.SENSOR_SENTINEL : cm;
    return { cm: out, corrected };
  }

  // --- updateSensors (.ino:162-198) ------------------------------------------
  updateSensors(now) {
    if (now - this.stepTime < FW.SENSOR_STEP_MS) return false;
    this.stepTime = now;

    if (this.pendingSettle) {                 // consume the servo settle delay
      this.pendingSettle = false;
      this.stepTime = now + (FW.SERVO_SETTLE_MS - FW.SENSOR_STEP_MS);
      return false;
    }

    const c = this.sensorCache;
    switch (this.scanStep) {
      case 0: {
        const r = this.fastReadSonic(FW.CENTER_ANGLE - FW.SQUINT_ANGLE);
        c.left = r.cm; this.lastScan.left = r;
        if (this.pendingSettle) return false;
        this.scanStep = 1; return false;
      }
      case 1: {
        const r = this.fastReadSonic(FW.CENTER_ANGLE);
        c.forward = r.cm; this.lastScan.forward = r;
        if (this.pendingSettle) return false;
        this.scanStep = 2; return false;
      }
      case 2: {
        const r = this.fastReadSonic(FW.CENTER_ANGLE + FW.SQUINT_ANGLE);
        c.right = r.cm; this.lastScan.right = r;
        if (this.pendingSettle) return false;
        this.scanStep = 3; return false;
      }
      case 3: {
        const r = this.fastReadSonic(FW.CENTER_ANGLE);   // second centre read, averaged
        c.forward = Math.floor((c.forward + r.cm) / 2);
        this.lastScan.forward = { corrected: r.corrected, cm: c.forward };
        if (this.pendingSettle) return false;
        c.timestamp = now;
        this.scanStep = 0; return true;
      }
    }
    return false;
  }

  beep(count) {                               // beep() blocks (.ino)
    this.hal.beep(count);
    this.blockedUntil = Math.max(this.blockedUntil, this._now + count * FW.BEEP_MS);
  }

  // --- autonomousDrive (.ino:250-337) ----------------------------------------
  update(now) {
    this._now = now;
    if (now < this.blockedUntil) return;      // inside a blocking delay()

    const sensorReady = this.updateSensors(now);
    const c = this.sensorCache;

    switch (this.state) {
      case ST.SCANNING:
        if (sensorReady) {
          const minDist = Math.min(c.forward, c.left, c.right);
          if (minDist < FW.COLL_DIST) {
            this._setState(ST.OBSTACLE_DETECTED, now, `min ${minDist}cm < ${FW.COLL_DIST}`);
            this.stateStartTime = now;
            this.beep(2);
          } else {
            this._setState(ST.MOVING_FORWARD, now, `clear (min ${minDist}cm)`);
            this.stateStartTime = now;
          }
        }
        break;

      case ST.MOVING_FORWARD:
        // patched: turnSpeed 0; pre-patch passed MIN_SPEED (Q3)
        this.setMotors(FW.MAX_SPEED, SIM.faithful ? FW.MIN_SPEED : 0);
        if (now - this.stateStartTime > FW.FORWARD_MS) {
          this._setState(ST.SCANNING, now, 'burst done');
        }
        if (c.forward < FW.COLL_DIST) {
          this._setState(ST.OBSTACLE_DETECTED, now, `F ${c.forward}cm while moving`);
          this.stateStartTime = now;
        }
        break;

      case ST.OBSTACLE_DETECTED:
        this.setMotors(0, 0);
        this._setState(ST.REVERSING, now, 'stop & back off');
        this.stateStartTime = now;
        break;

      case ST.REVERSING:
        this.setMotors(-FW.MAX_SPEED, SIM.faithful ? FW.MIN_SPEED : 0);
        if (now - this.stateStartTime > FW.REVERSE_MS) {
          let cause;
          if (c.left > c.right && c.left > FW.CLEAR_PATH_MIN) {
            this.setMotors(FW.MAX_SPEED, -FW.MAX_TURN_SPEED); cause = `left clearer (${c.left}cm)`;
          } else if (c.right > FW.CLEAR_PATH_MIN) {
            this.setMotors(FW.MAX_SPEED, FW.MAX_TURN_SPEED); cause = `right clearer (${c.right}cm)`;
          } else {
            this.setMotors(-FW.MAX_SPEED, FW.MAX_TURN_SPEED); cause = 'both blocked, U-turn';
          }
          this._setState(ST.TURNING, now, cause);
          this.stateStartTime = now;
        }
        break;

      case ST.TURNING:
        if (now - this.stateStartTime > FW.TURN_MS) {
          this.setMotors(0, 0);
          this._setState(ST.SCANNING, now, 'turn done');
        }
        break;

      default:
        this._setState(ST.SCANNING, now, 'reset');
        break;
    }

    // updateDisplay() every DISPLAY_MS
    if (now - this.lastDisplay > FW.DISPLAY_MS) {
      const l2 = `F:${String(c.forward).padStart(3)} L:${String(c.left).padStart(3)} R:${String(c.right).padStart(3)}`;
      this.hal.display('Vasu CarK1', l2, STATE_OLED[this.state]);
      this.lastDisplay = now;
    }
  }

  stateName() { return STATE_NAMES[this.state]; }
}
