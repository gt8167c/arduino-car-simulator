// ============================================================================
// profiles/car_16Jun24.firmware.js — port of car_16Jun24.ino.
//
// Unlike car_8feb26 (non-blocking state machine), this sketch is SEQUENTIAL:
// autonomous_car() runs top to bottom with real delay() calls. It is modelled
// here as a generator where `yield n` IS `delay(n)`, so the control flow reads
// the same as the .ino and the timing is faithful (one scan cycle really does
// take ~1.8 s of blocked time).
//
// REAR SENSOR — the APDS9960 is used as a proximity sensor, not a gesture
// sensor: readBackwardLaser() checks for obstacles before reversing. Note its
// units are 8-bit reflectance COUNTS where HIGHER = CLOSER (255 ≈ touching,
// 0 = clear). So `prevBackwardDist < 3` means "almost no reflection, rear is
// CLEAR, safe to reverse"; >= 3 means something is behind us -> "rear collsn!".
//
// KNOWN ISSUES in the .ino, reproduced when SIM.faithful is on (see the notes
// card in car_16Jun24.js):
//   B1 `apds` is constructed as a LOCAL in setup(), so readBackwardLaser()
//      cannot see it -> "'apds' was not declared in this scope" (compile error).
//   B2 SparkFun_APDS9960 has no SoftwareWire constructor -> compile error.
//   B3 moveforwardduration is left UNINITIALIZED when the rear is blocked, then
//      passed to moveForwardStraight() -> drives forward into the obstacle.
//   B4 readUltraSonic(): `uint8_t cm` then `cm > 255` is never true; echoes
//      past 255 cm wrap (same class as car_8feb26's Q4).
//   B5 stop()/move(0,0) writes MIN_SPEED to forward, left AND right pins, so
//      "stop" creeps and the steering pins fight each other.
// ============================================================================

import { FW, SIM } from '../config.js';

export const ST = {
  IDLE: 0, SCAN_FORWARD: 1, FWD_COLLISION: 2, READ_REAR: 3,
  REAR_BLOCKED: 4, REVERSING: 5, FIND_PATH: 6, TURNING: 7, MOVE_FORWARD: 8,
};
export const STATE_NAMES = ['IDLE', 'SCAN_FORWARD', 'FWD_COLLISION', 'READ_REAR',
  'REAR_BLOCKED', 'REVERSING', 'FIND_PATH', 'TURNING', 'MOVE_FORWARD'];

export class Firmware {
  constructor(hal) {
    this.hal = hal;
    this.onTransition = null;
    this.reset(0);
  }

  reset(now) {
    this.state = ST.IDLE;
    this.stateSince = now;
    this.sensorCache = { forward: 99, left: 99, right: 99, rear: 0 };
    this.lastScan = { left: null, forward: null, right: null };
    this.pins = { fwd: 0, rev: 0, left: 0, right: 0 };
    this.servoCorrected = 90;
    this.prevServoAngle = 90;
    this.spd = 0; this.turn = 0;
    this.prevForwardDist = 0;
    this.prevBackwardDist = 99;
    this.prevForwardLeftDist = 0;
    this.prevForwardRightDist = 0;
    this.blockedUntil = 0;
    this._now = now;

    // setup(): OLED banner + playtone(8)
    this.hal.display([FW.CARLABEL ?? '16Jun24 CarK1', 'Setup complete', 'Baud rate 9600', 'Autonomous']);
    this.hal.beep(8);

    this.prog = this.program();
    this.blockedUntil = now + 8 * (FW.TONE_MS ?? 160);
  }

  _setState(s, cause) {
    if (s !== this.state && this.onTransition) this.onTransition(this.state, s, this._now, cause);
    this.state = s;
    this.stateSince = this._now;
  }

  // --- motors: move() / DCMOTOR() (.ino:316-345) -----------------------------
  // NB: spd/turn are `int` here, so there is no int8_t overflow (car_8feb26 Q1).
  move(spd, turn) {
    if (spd !== undefined) { this.spd = spd; this.turn = turn; }
    const p = { fwd: 0, rev: 0, left: 0, right: 0 };
    const MIN = FW.MIN_SPEED;

    if (this.turn > 0)      p.right = Math.abs(this.turn);
    else if (this.turn < 0) p.left = Math.abs(this.turn);
    else if (SIM.faithful)  p.right = MIN;                    // B5

    if (this.spd !== 0) {
      if (this.spd > 0) p.fwd = Math.abs(this.spd);
      else              p.rev = Math.abs(this.spd);
    } else if (SIM.faithful) {                                // B5: both pin pairs driven
      p.fwd = MIN;
      p.left = MIN;
    }
    this.pins = p;
    this.hal.setPins(p);
  }

  stop() { this.move(0, 0); }

  // --- readUltraSonic (.ino:307-314) -----------------------------------------
  readUltraSonic() {
    let cm = Math.round(this.hal.readUltrasonic(this.servoCorrected));
    if (SIM.faithful) cm = cm & 0xFF;                         // B4: uint8_t wrap
    if (cm === 0 || cm > 255) cm = FW.CONTROL_MAX;            // (`> 255` is dead in C)
    return cm;
  }

  // --- readBackwardLaser (.ino:223-235) — APDS9960 proximity -----------------
  readBackwardLaser() {
    const counts = this.hal.readRearProximity();
    this.prevBackwardDist = counts;
    this.sensorCache.rear = counts;
    return counts;
  }

  // --- readForwardSonic (.ino:237-259) ---------------------------------------
  *readForwardSonic(deg) {
    const corrected = 180 - deg - FW.CORRECTION_ANGLE;
    this.servoCorrected = corrected;
    this.hal.servoWrite(corrected);
    if (this.prevServoAngle !== corrected) {
      this.prevServoAngle = corrected;
      yield 100;                                              // delay(100)
    }
    // readDistanceAndDisplay()
    const cm = this.readUltraSonic();
    this.prevForwardDist = cm;
    this.hal.display([FW.CARLABEL ?? '16Jun24 CarK1', `${cm}[cm] Forward`, '', '']);
    yield 100;                                                // delay(100)
    return cm;
  }

  // --- lookAheadForward (.ino:174-190) ---------------------------------------
  *lookAheadForward() {
    this._setState(ST.SCAN_FORWARD, 'sweep L/C/R/C');

    const left = yield* this.readForwardSonic(FW.CENTER_ANGLE - FW.SQUINT_ANGLE);
    this.sensorCache.left = left; this.lastScan.left = { corrected: this.servoCorrected, cm: left };
    yield 250;
    const c1 = yield* this.readForwardSonic(FW.CENTER_ANGLE);
    yield 250;
    const right = yield* this.readForwardSonic(FW.CENTER_ANGLE + FW.SQUINT_ANGLE);
    this.sensorCache.right = right; this.lastScan.right = { corrected: this.servoCorrected, cm: right };
    yield 250;
    const c2 = yield* this.readForwardSonic(FW.CENTER_ANGLE);
    yield 250;

    const centre = Math.floor((c1 + c2) / 2);
    this.sensorCache.forward = centre;
    this.lastScan.forward = { corrected: 90, cm: centre };

    const leftorright = Math.min(left, right);
    return Math.min(leftorright, centre);
  }

  // --- findClearPath (.ino:192-211) — returns 1 when both flanks are open ----
  *findClearPath() {
    this._setState(ST.FIND_PATH, 'checking flanks');
    this.stop();

    this.prevForwardRightDist = yield* this.readForwardSonic(FW.RIGHT_ANGLE);
    this.sensorCache.right = this.prevForwardRightDist;
    this.lastScan.right = { corrected: this.servoCorrected, cm: this.prevForwardRightDist };
    yield 250;
    const c1 = yield* this.readForwardSonic(FW.CENTER_ANGLE);
    yield 250;
    this.prevForwardLeftDist = yield* this.readForwardSonic(FW.LEFT_ANGLE);
    this.sensorCache.left = this.prevForwardLeftDist;
    this.lastScan.left = { corrected: this.servoCorrected, cm: this.prevForwardLeftDist };
    yield 250;
    const c2 = yield* this.readForwardSonic(FW.CENTER_ANGLE);
    yield 250;

    this.prevForwardDist = Math.floor((c1 + c2) / 2);
    this.sensorCache.forward = this.prevForwardDist;
    return (this.prevForwardLeftDist < FW.CLEAR_PATH_MIN || this.prevForwardRightDist < FW.CLEAR_PATH_MIN) ? 0 : 1;
  }

  *compareDistanceAndMove(L, R) {
    if (R > L && R > FW.CLEAR_PATH_MIN)      yield* this.forwardRight(1500);
    else if (L > R && L > FW.CLEAR_PATH_MIN) yield* this.forwardLeft(1500);
    else                                     yield* this.turnAround();
  }

  *forwardLeft(ms)   { this._setState(ST.TURNING, 'forward-left'); this.move(FW.MAX_SPEED, -FW.MAX_TURN_SPEED); yield ms; this.stop(); }
  *forwardRight(ms)  { this._setState(ST.TURNING, 'forward-right'); this.move(FW.MAX_SPEED, FW.MAX_TURN_SPEED); yield ms; this.stop(); }
  *backwardRight(ms) { this._setState(ST.TURNING, 'reverse-right'); this.move(-FW.MAX_SPEED, FW.MAX_TURN_SPEED); yield ms; this.stop(); }
  *turnAround()      { yield* this.backwardRight(1500); yield* this.forwardLeft(750); }

  *moveBackwardStraight(ms) {
    this._setState(ST.REVERSING, 'backing off');
    this.move(-FW.MAX_SPEED, FW.MIN_SPEED);                   // turn=MIN_SPEED -> veers
    yield ms;
  }

  *moveForwardStraight(ms) {
    this._setState(ST.MOVE_FORWARD, `${ms}ms burst`);
    this.move(FW.MAX_SPEED, FW.MIN_SPEED);
    yield ms;
  }

  // --- autonomous_car (.ino:128-172) ----------------------------------------
  *program() {
    for (;;) {
      yield 10;                                               // delay(10)

      this.prevForwardDist = yield* this.lookAheadForward();
      let moveforwardduration;

      if (this.prevForwardDist < FW.COLL_DIST) {
        this._setState(ST.FWD_COLLISION, `fwd ${this.prevForwardDist}cm < ${FW.COLL_DIST}`);
        this.hal.display([FW.CARLABEL ?? '16Jun24 CarK1', 'fwd collsn ', 'COLLISION', '']);
        yield 100;
        this.hal.beep(2);
        yield 2 * (FW.TONE_MS ?? 160);

        this.prevBackwardDist = 0;
        this._setState(ST.READ_REAR, 'APDS9960 rear check');
        this.readBackwardLaser();
        yield 20;                                             // I2C read time

        if (this.prevBackwardDist < FW.REAR_CLEAR_MAX) {
          // rear is CLEAR (low reflectance) -> reverse until both flanks open
          let clear = 0;
          do {
            yield* this.moveBackwardStraight(500);
            clear = yield* this.findClearPath();
          } while (!clear);
          yield* this.compareDistanceAndMove(this.prevForwardLeftDist, this.prevForwardRightDist);
          moveforwardduration = 750;
        } else {
          // rear BLOCKED: the .ino only sets a message here and leaves
          // moveforwardduration uninitialized (B3)
          this._setState(ST.REAR_BLOCKED, `rear prox ${this.prevBackwardDist} >= ${FW.REAR_CLEAR_MAX}`);
          this.hal.display([FW.CARLABEL ?? '16Jun24 CarK1', 'rear collsn!', 'COLLISION', '']);
          moveforwardduration = SIM.faithful ? this._garbageDuration() : 0;
          yield 300;
        }
      } else {
        moveforwardduration = 1500;
      }

      yield* this.moveForwardStraight(moveforwardduration);
      this.hal.display([FW.CARLABEL ?? '16Jun24 CarK1', '', 'move forward', '']);
    }
  }

  // B3: an uninitialized local on AVR is whatever was left on the stack. The
  // previous frame here held delay/duration values, so model it as a stale one.
  _garbageDuration() { return 1500; }

  update(now) {
    this._now = now;
    if (now < this.blockedUntil) return;
    const r = this.prog.next();
    if (!r.done && typeof r.value === 'number') this.blockedUntil = now + r.value;
  }

  stateName() { return STATE_NAMES[this.state]; }
}
