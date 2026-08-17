// ============================================================================
// world.js — 2D arena, chassis physics, HC-SR04 ray-cast model, renderer.
// Units: centimetres, degrees. Canvas y grows downward; heading 0° = +x,
// positive rotation = clockwise on screen = a RIGHT turn.
// ============================================================================

import { FW, SIM, ARENA } from './config.js';

const D2R = Math.PI / 180;

export class World {
  constructor() {
    this.obstacles = [];
    this.resetCar();
    this.presetObstacles();
    this.trail = [];
    this.odometerCm = 0;
    this.crashes = 0;
    this._crashCooldown = 0;
    this.crashFlash = 0;
    this.v = 0;                  // signed ground speed cm/s
    this.servoVisual = 90;       // animated servo angle for rendering
    this.rayHistory = [];        // recent measurements for the fading ray viz
    this.rearProx = 0;           // APDS9960 counts (0-255, higher = closer)
    this.rearRay = null;         // last rear cast, for the arena overlay
    this.showRear = false;       // enabled by profiles that declare a rear sensor
  }

  resetCar() {
    this.car = { x: 80, y: ARENA.h - 70, headingDeg: -50 };
    this.v = 0;
    this.trail = [];
    this.odometerCm = 0;
    this.crashes = 0;
    this.rayHistory = [];
  }

  presetObstacles() {
    this.obstacles = [
      { kind: 'box',  x: 210, y: 70,  w: 80, h: 40 },
      { kind: 'box',  x: 350, y: 200, w: 50, h: 90 },
      { kind: 'box',  x: 120, y: 160, w: 40, h: 40 },
      { kind: 'drum', x: 300, y: 90,  r: 22 },
      { kind: 'drum', x: 180, y: 280, r: 26 },
    ];
  }

  addObstacle(kind) {
    for (let tries = 0; tries < 40; tries++) {
      const o = kind === 'drum'
        ? { kind, x: 60 + Math.random() * (ARENA.w - 120), y: 60 + Math.random() * (ARENA.h - 120), r: 16 + Math.random() * 14 }
        : { kind, x: 40 + Math.random() * (ARENA.w - 140), y: 40 + Math.random() * (ARENA.h - 120), w: 30 + Math.random() * 60, h: 25 + Math.random() * 50 };
      const cx = o.kind === 'drum' ? o.x : o.x + o.w / 2;
      const cy = o.kind === 'drum' ? o.y : o.y + o.h / 2;
      if (Math.hypot(cx - this.car.x, cy - this.car.y) > 80) { this.obstacles.push(o); return; }
    }
  }

  // ---- ray casting -----------------------------------------------------------
  _rayCircle(px, py, dx, dy, c) {
    const ox = px - c.x, oy = py - c.y;
    const b = ox * dx + oy * dy;
    const disc = b * b - (ox * ox + oy * oy - c.r * c.r);
    if (disc < 0) return Infinity;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : Infinity;
  }

  _rayRect(px, py, dx, dy, r) {
    let tmin = 0, tmax = Infinity;
    for (const [p, d, lo, hi] of [[px, dx, r.x, r.x + r.w], [py, dy, r.y, r.y + r.h]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return Infinity; }
      else {
        let t1 = (lo - p) / d, t2 = (hi - p) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin > 0 ? tmin : Infinity;
  }

  castRay(px, py, angDeg) {
    const dx = Math.cos(angDeg * D2R), dy = Math.sin(angDeg * D2R);
    let best = Infinity;
    // walls
    if (dx > 1e-9)  best = Math.min(best, (ARENA.w - px) / dx);
    if (dx < -1e-9) best = Math.min(best, (0 - px) / dx);
    if (dy > 1e-9)  best = Math.min(best, (ARENA.h - py) / dy);
    if (dy < -1e-9) best = Math.min(best, (0 - py) / dy);
    for (const o of this.obstacles) {
      best = Math.min(best, o.kind === 'drum' ? this._rayCircle(px, py, dx, dy, o) : this._rayRect(px, py, dx, dy, o));
    }
    return best;
  }

  sensorPos() {
    const a = this.car.headingDeg * D2R;
    const nose = SIM.carLenCm / 2 - 2;
    return { x: this.car.x + Math.cos(a) * nose, y: this.car.y + Math.sin(a) * nose };
  }

  beamAngle(correctedServoDeg) {
    // corrected 90 = straight ahead; >90 = left of nose (counter-clockwise on screen)
    return this.car.headingDeg - (correctedServoDeg - 90);
  }

  // Rear-facing APDS9960 proximity (car_16Jun24). Returns an 8-bit reflectance
  // COUNT, not a distance: 255 ≈ touching, 0 = nothing within range. Falls off
  // faster than linear, like real IR reflectance.
  measureRearProximity() {
    const a = this.car.headingDeg * D2R;
    const tail = SIM.carLenCm / 2 - 2;
    const px = this.car.x - Math.cos(a) * tail;
    const py = this.car.y - Math.sin(a) * tail;
    const centre = this.car.headingDeg + 180;

    let d = Infinity;
    for (const off of [-SIM.apdsHalfDeg, 0, SIM.apdsHalfDeg]) {
      d = Math.min(d, this.castRay(px, py, centre + off));
    }
    this.rearRay = { x: px, y: py, ang: centre, cm: d };

    if (!isFinite(d) || d >= SIM.apdsRangeCm) { this.rearProx = 0; return 0; }
    const n = 1 - d / SIM.apdsRangeCm;
    let prox = Math.round(255 * n * n);
    prox += Math.round((Math.random() * 2 - 1) * SIM.apdsNoise);
    this.rearProx = Math.max(0, Math.min(255, prox));
    return this.rearProx;
  }

  // HAL: measure with beam cone + noise. Returns physical cm (0 = no echo).
  measure(correctedServoDeg) {
    const { x, y } = this.sensorPos();
    const centre = this.beamAngle(correctedServoDeg);
    let d = Infinity;
    for (const off of [-SIM.coneHalfDeg, 0, SIM.coneHalfDeg]) {
      d = Math.min(d, this.castRay(x, y, centre + off));
    }
    if (!isFinite(d) || d > SIM.physMaxCm) return 0;           // no echo
    d += (Math.random() * 2 - 1) * SIM.noiseCm;
    const cm = Math.max(2, d);
    this.rayHistory.push({ corrected: correctedServoDeg, cm, t: performance.now() });
    if (this.rayHistory.length > 6) this.rayHistory.shift();
    return cm;
  }

  // ---- physics ---------------------------------------------------------------
  _pwmTo(v, pwm) { // deadband-mapped fraction of v
    const p = Math.abs(pwm);
    if (p < SIM.deadbandPWM) return 0;
    return v * (p - SIM.deadbandPWM) / (255 - SIM.deadbandPWM);
  }

  step(dtS, pins) {
    const drive = pins.fwd > 0 ? pins.fwd : -pins.rev;
    const vTarget = Math.sign(drive) * this._pwmTo(SIM.vmaxCmS, drive);
    this.v += (vTarget - this.v) * Math.min(1, dtS * 8);

    const steerPwm = pins.right > 0 ? pins.right : -pins.left;   // + = right
    const steerDeg = Math.sign(steerPwm) * this._pwmTo(SIM.maxSteerDeg, steerPwm);

    const yawRate = (this.v / SIM.wheelbaseCm) * Math.tan(steerDeg * D2R); // rad/s
    this.car.headingDeg += yawRate * dtS / D2R;

    const a = this.car.headingDeg * D2R;
    let nx = this.car.x + Math.cos(a) * this.v * dtS;
    let ny = this.car.y + Math.sin(a) * this.v * dtS;

    // collision: car as circle vs walls + obstacles
    const r = SIM.carWidCm / 2 + 3;
    let hit = false;
    if (nx < r) { nx = r; hit = true; }
    if (nx > ARENA.w - r) { nx = ARENA.w - r; hit = true; }
    if (ny < r) { ny = r; hit = true; }
    if (ny > ARENA.h - r) { ny = ARENA.h - r; hit = true; }
    for (const o of this.obstacles) {
      if (o.kind === 'drum') {
        const d = Math.hypot(nx - o.x, ny - o.y), min = o.r + r;
        if (d < min && d > 1e-6) { nx = o.x + (nx - o.x) / d * min; ny = o.y + (ny - o.y) / d * min; hit = true; }
      } else {
        const cx = Math.max(o.x, Math.min(nx, o.x + o.w)), cy = Math.max(o.y, Math.min(ny, o.y + o.h));
        const d = Math.hypot(nx - cx, ny - cy);
        if (d < r) {
          if (d > 1e-6) { nx = cx + (nx - cx) / d * r; ny = cy + (ny - cy) / d * r; }
          hit = true;
        }
      }
    }
    if (hit) {
      this.v *= 0.2;
      const now = performance.now();
      if (now > this._crashCooldown) { this.crashes++; this._crashCooldown = now + 800; this.crashFlash = now; }
    }

    this.odometerCm += Math.abs(this.v) * dtS;
    this.car.x = nx; this.car.y = ny;

    if (SIM.trailOn) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(nx - last.x, ny - last.y) > 3) {
        this.trail.push({ x: nx, y: ny });
        if (this.trail.length > 800) this.trail.shift();
      }
    }
  }

  animateServo(targetCorrected, dtS) {
    const diff = targetCorrected - this.servoVisual;
    const maxStep = 500 * dtS; // deg/s
    this.servoVisual += Math.abs(diff) < maxStep ? diff : Math.sign(diff) * maxStep;
  }
}

// ============================================================================
// Renderer
// ============================================================================
const COL = {
  floor: '#141413', grid: '#22221f', wall: '#383835',
  obstacle: '#26261F', obstacleEdge: '#8a5a2a', drumEdge: '#6a5acd',
  car: '#232a33', carEdge: '#3987e5', wheel: '#0d0d0d',
  beam: 'rgba(57,135,229,0.10)', beamEdge: 'rgba(57,135,229,0.35)',
  trail: 'rgba(57,135,229,0.5)',
  good: '#0ca30c', warning: '#fab219', critical: '#d03b3b',
  ink: '#e8e6df', muted: '#898781',
};

export function statusFor(cm) {
  const coll = FW.COLL_DIST ?? 30;
  if (cm < coll) return COL.critical;
  if (cm < coll * 1.8) return COL.warning;
  return COL.good;
}

export function drawWorld(ctx, world, fw, canvas) {
  const S = canvas.width / ARENA.w;
  ctx.save();
  ctx.scale(S, S * (canvas.height / (ARENA.h * S)) * (ARENA.h * S) / canvas.height); // uniform S
  ctx.setTransform(S, 0, 0, S, 0, 0);

  // floor + grid
  ctx.fillStyle = COL.floor;
  ctx.fillRect(0, 0, ARENA.w, ARENA.h);
  ctx.strokeStyle = COL.grid; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let x = 50; x < ARENA.w; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.h); }
  for (let y = 50; y < ARENA.h; y += 50) { ctx.moveTo(0, y); ctx.lineTo(ARENA.w, y); }
  ctx.stroke();
  ctx.strokeStyle = COL.wall; ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, ARENA.w - 3, ARENA.h - 3);

  // trail
  if (SIM.trailOn && world.trail.length > 1) {
    ctx.strokeStyle = COL.trail; ctx.lineWidth = 1.2;
    ctx.beginPath();
    world.trail.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.stroke();
  }

  // obstacles
  for (const o of world.obstacles) {
    ctx.fillStyle = COL.obstacle;
    if (o.kind === 'drum') {
      ctx.strokeStyle = COL.drumEdge; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.55, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.strokeStyle = COL.obstacleEdge; ctx.lineWidth = 1.5;
      ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y + o.h);
      ctx.moveTo(o.x + o.w, o.y); ctx.lineTo(o.x, o.y + o.h); ctx.stroke();
    }
  }

  const { x: sx, y: sy } = world.sensorPos();

  // live beam cone at animated servo angle
  const beamC = world.car.headingDeg - (world.servoVisual - 90);
  const coneLen = Math.min(250, world.castRay(sx, sy, beamC) + 6);
  ctx.fillStyle = COL.beam; ctx.strokeStyle = COL.beamEdge; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.arc(sx, sy, coneLen, (beamC - SIM.coneHalfDeg) * D2R, (beamC + SIM.coneHalfDeg) * D2R);
  ctx.closePath(); ctx.fill(); ctx.stroke();

  // last L/F/R rays with hit markers + labels
  for (const key of ['left', 'forward', 'right']) {
    const r = fw.lastScan[key];
    if (!r) continue;
    const ang = world.beamAngle(r.corrected) * D2R;
    const len = Math.min(r.cm, 250);
    const ex = sx + Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
    const col = statusFor(r.cm);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.3;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = '9px system-ui';
    const lx = Math.max(10, Math.min(ARENA.w - 10, sx + Math.cos(ang) * (len + 12)));
    const ly = Math.max(10, Math.min(ARENA.h - 6, sy + Math.sin(ang) * (len + 12)));
    ctx.textAlign = 'center';
    const sentinel = FW.SENSOR_SENTINEL ?? 99;
    const label = r.cm === sentinel && len >= sentinel ? sentinel + '*' : `${r.cm}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(13,13,13,0.85)';
    ctx.strokeText(label, lx, ly + 3);
    ctx.fillStyle = COL.ink;
    ctx.fillText(label, lx, ly + 3);
  }

  // rear APDS9960 proximity lobe (profiles with a rear sensor)
  if (world.showRear && world.rearRay) {
    const r = world.rearRay;
    const lobe = Math.min(SIM.apdsRangeCm, isFinite(r.cm) ? r.cm : SIM.apdsRangeCm);
    const blocked = world.rearProx >= (FW.REAR_CLEAR_MAX ?? 3);
    const col = blocked ? COL.critical : COL.good;
    ctx.save();
    ctx.globalAlpha = 0.16; ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y);
    ctx.arc(r.x, r.y, SIM.apdsRangeCm, (r.ang - SIM.apdsHalfDeg) * D2R, (r.ang + SIM.apdsHalfDeg) * D2R);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, lobe, (r.ang - SIM.apdsHalfDeg) * D2R, (r.ang + SIM.apdsHalfDeg) * D2R);
    ctx.stroke();
    ctx.restore();
  }

  // car
  const c = world.car;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.headingDeg * D2R);
  const L = SIM.carLenCm, W = SIM.carWidCm;
  // crash flash ring
  if (performance.now() - world.crashFlash < 400) {
    ctx.strokeStyle = COL.critical; ctx.lineWidth = 2; ctx.globalAlpha = 1 - (performance.now() - world.crashFlash) / 400;
    ctx.beginPath(); ctx.arc(0, 0, W + 6, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // wheels
  ctx.fillStyle = COL.wheel;
  for (const [wx, wy] of [[-L / 2 + 4, -W / 2 - 1.5], [-L / 2 + 4, W / 2 + 1.5], [L / 2 - 6, -W / 2 - 1.5], [L / 2 - 6, W / 2 + 1.5]]) {
    ctx.fillRect(wx - 4, wy - 1.8, 8, 3.6);
  }
  // body
  ctx.fillStyle = COL.car; ctx.strokeStyle = COL.carEdge; ctx.lineWidth = 1.4;
  roundRect(ctx, -L / 2, -W / 2, L, W, 4); ctx.fill(); ctx.stroke();
  // nose chevron
  ctx.fillStyle = COL.carEdge;
  ctx.beginPath(); ctx.moveTo(L / 2 - 2, 0); ctx.lineTo(L / 2 - 8, -4); ctx.lineTo(L / 2 - 8, 4); ctx.closePath(); ctx.fill();
  ctx.restore();

  // servo turret + needle (drawn unrotated at sensor pos)
  ctx.fillStyle = '#0d0d0d'; ctx.strokeStyle = COL.beamEdge; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(sx, sy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#9ec5f4'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(sx, sy);
  ctx.lineTo(sx + Math.cos(beamC * D2R) * 9, sy + Math.sin(beamC * D2R) * 9); ctx.stroke();

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
