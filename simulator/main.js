// ============================================================================
// main.js — orchestration: profile lifecycle, sim clock, HAL bridge, input.
// ============================================================================

import { FW, SIM, ARENA, setActiveProfile, resetFW } from './config.js';
import { PROFILES, profileById } from './profiles/index.js';
import { World, drawWorld } from './world.js';
import { Oled } from './oled.js';
import { SerialSource } from './telemetry.js';
import * as UI from './ui.js';

const $ = id => document.getElementById(id);
const canvas = $('arena');
const ctx = canvas.getContext('2d');
const oled = new Oled($('oledCanvas'));

const world = new World();
let simMs = 0, acc = 0, running = true, last = performance.now();
const TICK = 10;
let fw = null;
let profile = null;

// ---- audio ------------------------------------------------------------------
let audio = null;
function beepAudio(count) {
  if (!SIM.soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const period = (FW.BEEP_MS ?? 150) / 1000;
    for (let i = 0; i < count; i++) {
      const t = audio.currentTime + i * period;
      const osc = audio.createOscillator(), g = audio.createGain();
      osc.type = 'square'; osc.frequency.value = 1000;
      g.gain.setValueAtTime(0.04, t); g.gain.setTargetAtTime(0, t + 0.09, 0.01);
      osc.connect(g).connect(audio.destination);
      osc.start(t); osc.stop(t + 0.11);
    }
  } catch {}
}
document.addEventListener('pointerdown', () => { if (audio?.state === 'suspended') audio.resume(); }, { once: true });

// ---- HAL bridge -------------------------------------------------------------
const hal = {
  readUltrasonic: corrected => world.measure(corrected),
  servoWrite: () => {},
  setPins: () => {},
  beep: n => { beepAudio(n); UI.flashBuzzer(n); },
  display: (l1, l2, l3) => oled.show(l1, l2, l3),
};

// ---- profile lifecycle ------------------------------------------------------
function renderProfileChrome() {
  $('sketchLabel').textContent = profile.sketch;
  $('profileNotes').innerHTML = profile.notesHtml ?? '';

  // header toggles declared by the profile
  const host = $('profileToggles');
  host.innerHTML = '';
  $('modeBadge').classList.add('hidden');
  for (const t of profile.toggles ?? []) {
    SIM[t.key] = false;
    const label = document.createElement('label');
    label.className = 'tgl';
    label.title = t.title ?? '';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      SIM[t.key] = input.checked;
      if (t.badge) {
        $('modeBadge').textContent = t.badge;
        $('modeBadge').classList.toggle('hidden', !input.checked);
      }
    });
    label.append(input, ' ' + t.label);
    host.appendChild(label);
  }
}

function restart() {
  simMs = 0; acc = 0;
  world.resetCar();
  UI.clearLog();
  fw.reset(0);
  UI.updateSquintDots();
}

function initProfile(p) {
  profile = p;
  localStorage.setItem('cark1sim.activeProfile', p.id);
  setActiveProfile(p);
  UI.setProfile(p);
  renderProfileChrome();

  fw = p.createFirmware(hal);
  fw.onTransition = (from, to, now, cause) => UI.pushTransition(from, to, now, cause);

  UI.buildServoDial();
  UI.buildStatePanel();
  UI.buildParamPanels(onFwParamChange);
  UI.refreshPresetList();
  restart();
}

function onFwParamChange() { UI.updateSquintDots(); }

// ---- pointer interaction: drag obstacles / car, shift-drag rotates car ------
let drag = null;
function toArena(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * ARENA.w, y: (e.clientY - r.top) / r.height * ARENA.h };
}
canvas.addEventListener('pointerdown', e => {
  const p = toArena(e);
  canvas.setPointerCapture(e.pointerId);
  if (Math.hypot(p.x - world.car.x, p.y - world.car.y) < 22) {
    drag = { kind: e.shiftKey ? 'rotate' : 'car' };
    return;
  }
  for (let i = world.obstacles.length - 1; i >= 0; i--) {
    const o = world.obstacles[i];
    const hit = o.kind === 'drum'
      ? Math.hypot(p.x - o.x, p.y - o.y) < o.r + 4
      : p.x > o.x - 4 && p.x < o.x + o.w + 4 && p.y > o.y - 4 && p.y < o.y + o.h + 4;
    if (hit) { drag = { kind: 'obstacle', o, dx: p.x - o.x, dy: p.y - o.y }; return; }
  }
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = toArena(e);
  if (drag.kind === 'car') { world.car.x = p.x; world.car.y = p.y; world.v = 0; }
  else if (drag.kind === 'rotate') {
    world.car.headingDeg = Math.atan2(p.y - world.car.y, p.x - world.car.x) * 180 / Math.PI;
  } else {
    drag.o.x = p.x - drag.dx; drag.o.y = p.y - drag.dy;
  }
});
canvas.addEventListener('pointerup', () => drag = null);
canvas.addEventListener('dblclick', e => {
  const p = toArena(e);
  for (let i = world.obstacles.length - 1; i >= 0; i--) {
    const o = world.obstacles[i];
    const hit = o.kind === 'drum'
      ? Math.hypot(p.x - o.x, p.y - o.y) < o.r + 4
      : p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h;
    if (hit) { world.obstacles.splice(i, 1); return; }
  }
});

// ---- header controls --------------------------------------------------------
$('btnRun').addEventListener('click', () => {
  running = !running;
  $('btnRun').textContent = running ? '⏸ Pause' : '▶ Run';
  $('btnRun').classList.toggle('primary', !running);
});
$('btnReset').addEventListener('click', () => restart());
$('btnResetParams').addEventListener('click', () => { resetFW(); UI.buildParamPanels(onFwParamChange); UI.updateSquintDots(); UI.refreshPresetList(); });
$('selSpeed').addEventListener('change', e => SIM.timescale = Number(e.target.value));
$('chkSound').addEventListener('change', e => SIM.soundOn = e.target.checked);
$('chkTrail').addEventListener('change', e => SIM.trailOn = e.target.checked);
$('btnBox').addEventListener('click', () => world.addObstacle('box'));
$('btnDrum').addEventListener('click', () => world.addObstacle('drum'));
$('btnClearObs').addEventListener('click', () => world.obstacles = []);
$('btnPreset').addEventListener('click', () => world.presetObstacles());

// profile dropdown
const selProfile = $('selProfile');
selProfile.innerHTML = PROFILES.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
selProfile.addEventListener('change', e => initProfile(profileById(e.target.value)));

// ---- serial (Phase 2 stub) --------------------------------------------------
const serialBtn = $('btnSerial');
if (!SerialSource.supported()) {
  serialBtn.disabled = true;
  serialBtn.title = 'Web Serial not available in this browser — Phase 2 works in Chrome/Edge';
}
let serial = null;
serialBtn.addEventListener('click', async () => {
  if (serial?.connected) { serial.disconnect(); serial = null; serialBtn.textContent = '⚡ Connect car'; return; }
  serial = new SerialSource(
    frame => { /* Phase 2: drive panels from live frames */
      fw.sensorCache.forward = frame.f; fw.sensorCache.left = frame.l; fw.sensorCache.right = frame.r;
      if (frame.state >= 0 && frame.state < profile.states.length && frame.state !== fw.state) {
        fw.onTransition?.(fw.state, frame.state, simMs, 'live telemetry');
        fw.state = frame.state; fw.stateSince = simMs;
      }
      fw.servoCorrected = frame.servo;
    },
    status => { $('srcChip').textContent = 'LIVE · ' + status; }
  );
  try { await serial.connect(9600); serialBtn.textContent = '✕ Disconnect'; }
  catch (e) { $('srcChip').textContent = 'SIM'; serial = null; }
});

// ---- boot -------------------------------------------------------------------
UI.wireExport();
UI.wirePresets(onFwParamChange);
const savedId = localStorage.getItem('cark1sim.activeProfile');
selProfile.value = profileById(savedId).id;
initProfile(profileById(savedId));

// Sim clock + DOM panels on a timer (RAF is throttled in background panes);
// RAF only paints the canvas.
function updatePanels() {
  UI.updateSensorPanel(fw);
  UI.updateStatePanel(fw, simMs);
  UI.updateStats(simMs, world);
  const p = fw.pins;
  $('pinFwd').textContent = p.fwd; $('pinRev').textContent = p.rev;
  $('pinLeft').textContent = p.left; $('pinRight').textContent = p.right;
}

let panelTick = 0;
setInterval(() => {
  const t = performance.now();
  const dt = Math.min(100, t - last);
  last = t;
  if (running && !(serial?.connected)) {
    acc += dt * SIM.timescale;
    while (acc >= TICK) {
      simMs += TICK;
      fw.update(simMs);
      world.step(TICK / 1000, fw.pins);
      acc -= TICK;
    }
    world.animateServo(fw.servoCorrected, dt / 1000);
  }
  if (++panelTick % 5 === 0) updatePanels();   // ~12 Hz DOM refresh
}, 16);

function frame() {
  drawWorld(ctx, world, fw, canvas);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
