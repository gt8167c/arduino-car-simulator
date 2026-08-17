// ============================================================================
// ui.js — dashboard panels: sensor gauges, state machine, sliders, log,
// presets, export. Profile-driven: call setProfile() before the builders.
// ============================================================================

import { FW, SIM } from './config.js';
import { statusFor } from './world.js';

const $ = id => document.getElementById(id);

let P = null;   // active profile
export function setProfile(profile) {
  P = profile;
  // rear-sensor block is shown only for profiles that declare one
  const rs = profile.rearSensor;
  $('rearBlock').classList.toggle('hidden', !rs);
  if (rs) {
    $('rearLabel').textContent = rs.label;
    $('rearHint').textContent = rs.hint;
    $('rearUnit').textContent = rs.unit;
  }
}

// ---- sensor panel -----------------------------------------------------------
const BAR_MAX = 150; // cm scale for the bars

export function updateSensorPanel(fw) {
  const c = fw.sensorCache;
  for (const [key, id] of [['left', 'L'], ['forward', 'F'], ['right', 'R']]) {
    const cm = c[key];
    const fill = $(`bar${id}`), val = $(`val${id}`);
    const pct = Math.min(cm, BAR_MAX) / BAR_MAX * 100;
    fill.style.width = pct + '%';
    fill.style.background = statusFor(cm);
    val.textContent = cm === FW.SENSOR_SENTINEL ? cm + '*' : cm + ' cm';
  }

  // rear proximity (profiles that declare one) — counts, higher = closer
  if (P.rearSensor) {
    const rs = P.rearSensor;
    const counts = c.rear ?? 0;
    const thr = FW[rs.thresholdKey] ?? 3;
    const blocked = counts >= thr;
    $('barRear').style.width = Math.min(counts / rs.max * 100, 100) + '%';
    $('barRear').style.background = blocked ? '#d03b3b' : '#0ca30c';
    $('rearMarker').style.left = (thr / rs.max * 100) + '%';
    $('valRear').textContent = counts;
    $('rearVerdict').textContent = blocked ? 'BLOCKED' : 'clear';
    $('rearVerdict').className = 'rear-verdict ' + (blocked ? 'blocked' : 'clear');
  }
  const collPct = Math.min(FW.COLL_DIST ?? 30, BAR_MAX) / BAR_MAX * 100 + '%';
  document.querySelectorAll('.coll-marker').forEach(m => m.style.left = collPct);

  // servo dial
  const corrected = fw.servoCorrected;
  $('servoNeedle').setAttribute('transform', `rotate(${90 - corrected} 60 58)`);
  $('servoDeg').textContent = corrected + '°';
}

export function buildServoDial() {
  const svg = $('servoDial');
  const marks = [];
  for (let a = 0; a <= 180; a += 15) {
    const rad = (180 - a) * Math.PI / 180;
    const x1 = 60 + Math.cos(rad) * 46, y1 = 58 - Math.sin(rad) * 46;
    const x2 = 60 + Math.cos(rad) * (a % 45 === 0 ? 38 : 42), y2 = 58 - Math.sin(rad) * (a % 45 === 0 ? 38 : 42);
    marks.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#383835" stroke-width="${a % 45 === 0 ? 2 : 1}"/>`);
  }
  svg.innerHTML = `
    <path d="M 14 58 A 46 46 0 0 1 106 58" fill="none" stroke="#2c2c2a" stroke-width="6" stroke-linecap="round"/>
    ${marks.join('')}
    <g id="squintDots"></g>
    <line id="servoNeedle" x1="60" y1="58" x2="60" y2="16" stroke="#7fd8ff" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="60" cy="58" r="5" fill="#0d0d0d" stroke="#3987e5" stroke-width="1.5"/>
    <text id="servoDeg" x="60" y="52" text-anchor="middle" fill="#e8e6df" font-size="11" font-family="system-ui">90°</text>`;
  updateSquintDots();
}

export function updateSquintDots() {
  const g = $('squintDots');
  if (!g) return;
  if (FW.CENTER_ANGLE == null || FW.SQUINT_ANGLE == null) { g.innerHTML = ''; return; }
  const dot = (corrected, col) => {
    const rad = (180 - corrected) * Math.PI / 180;
    const x = 60 + Math.cos(rad) * 51, y = 58 - Math.sin(rad) * 51;
    return `<circle cx="${x}" cy="${y}" r="2.5" fill="${col}" opacity="0.9"/>`;
  };
  g.innerHTML =
    dot(180 - (FW.CENTER_ANGLE - FW.SQUINT_ANGLE), '#d95926') +   // L scan
    dot(180 - FW.CENTER_ANGLE, '#3987e5') +                        // C
    dot(180 - (FW.CENTER_ANGLE + FW.SQUINT_ANGLE), '#199e70');     // R scan
}

// ---- state machine panel ----------------------------------------------------
export function buildStatePanel() {
  const host = $('stateFlow');
  host.innerHTML = P.flow.map((s, i) =>
    `<div class="st-node" id="st${s}">${P.states[s].replace(/_/g, ' ')}</div>` +
    (i < P.flow.length - 1 ? '<div class="st-arrow">→</div>' : '')
  ).join('') + '<div class="st-arrow st-loop">⟳</div>';
}

export function updateStatePanel(fw, nowMs) {
  for (const s of P.flow) {
    $(`st${s}`).classList.toggle('active', fw.state === s);
  }
  $('stateTime').textContent = ((nowMs - fw.stateSince) / 1000).toFixed(1) + 's in state';
}

// ---- transition log ---------------------------------------------------------
const log = [];
export function pushTransition(from, to, nowMs, cause) {
  log.unshift({ t: nowMs, from, to, cause });
  if (log.length > 40) log.pop();
  const name = i => (P.states[i] ?? `S${i}`).replace(/_/g, ' ');
  $('logList').innerHTML = log.map(e =>
    `<div class="log-row"><span class="log-t">${(e.t / 1000).toFixed(2)}s</span>` +
    `<span class="log-tr">${name(e.from)} → <b>${name(e.to)}</b></span>` +
    `<span class="log-c">${e.cause}</span></div>`
  ).join('');
}
export function clearLog() { log.length = 0; $('logList').innerHTML = ''; }

// ---- parameter sliders ------------------------------------------------------
const SIM_SLIDERS = [
  ['vmaxCmS',     20, 200, 5,   'cm/s', 'speed @ PWM 255'],
  ['deadbandPWM',  0, 140, 5,   'pwm',  'motor stall floor'],
  ['maxSteerDeg', 10, 45,  1,   '°',    'steering lock'],
  ['coneHalfDeg',  2, 15,  1,   '°',    'sonar half-cone'],
  ['noiseCm',      0, 10,  1,   '±cm',  'sensor noise'],
];

function sliderRow(obj, [key, min, max, step, unit, hint], onchange) {
  const row = document.createElement('div');
  row.className = 'param-row';
  row.innerHTML =
    `<label title="${hint}">${key}</label>` +
    `<input type="range" min="${min}" max="${max}" step="${step}" value="${obj[key]}">` +
    `<span class="param-val">${obj[key]}<i>${unit}</i></span>`;
  const input = row.querySelector('input');
  const val = row.querySelector('.param-val');
  input.addEventListener('input', () => {
    obj[key] = Number(input.value);
    val.innerHTML = `${obj[key]}<i>${unit}</i>`;
    onchange?.(key);
  });
  return row;
}

export function buildParamPanels(onFwChange) {
  const fwHost = $('fwParams'), simHost = $('simParams');
  fwHost.innerHTML = ''; simHost.innerHTML = '';
  for (const s of P.fwSliders) fwHost.appendChild(sliderRow(FW, s, onFwChange));
  for (const s of SIM_SLIDERS) simHost.appendChild(sliderRow(SIM, s, null));
}

// ---- presets (per-profile, stored in localStorage) --------------------------
const presetKey = () => `cark1sim.presets.${P.id}`;

function loadPresets() {
  try { return JSON.parse(localStorage.getItem(presetKey())) ?? {}; }
  catch { return {}; }
}

export function refreshPresetList(selected = '') {
  const sel = $('presetSel');
  const names = Object.keys(loadPresets()).sort();
  sel.innerHTML = '<option value="">— preset —</option>' +
    names.map(n => `<option value="${n.replace(/"/g, '&quot;')}"${n === selected ? ' selected' : ''}>${n}</option>`).join('');
}

export function wirePresets(onApplied) {
  $('btnPresetSave').addEventListener('click', () => {
    const name = $('presetName').value.trim();
    if (!name) { $('presetName').focus(); return; }
    const all = loadPresets();
    all[name] = { ...FW };
    localStorage.setItem(presetKey(), JSON.stringify(all));
    $('presetName').value = '';
    refreshPresetList(name);
  });

  $('presetSel').addEventListener('change', e => {
    const name = e.target.value;
    if (!name) return;
    const preset = loadPresets()[name];
    if (!preset) return;
    for (const k of Object.keys(preset)) if (k in FW) FW[k] = preset[k];
    buildParamPanels(onApplied ? () => onApplied() : null);
    onApplied?.();
  });

  $('btnPresetDel').addEventListener('click', () => {
    const name = $('presetSel').value;
    if (!name) return;
    const all = loadPresets();
    delete all[name];
    localStorage.setItem(presetKey(), JSON.stringify(all));
    refreshPresetList();
  });
}

// ---- export -----------------------------------------------------------------
export function wireExport() {
  $('btnExport').addEventListener('click', async () => {
    const text = P.exportDefines(FW);
    $('exportText').value = text;
    $('exportBox').classList.remove('hidden');
    try { await navigator.clipboard.writeText(text); $('exportNote').textContent = 'Copied to clipboard ✓'; }
    catch { $('exportNote').textContent = 'Select & copy:'; }
  });
  $('btnExportClose').addEventListener('click', () => $('exportBox').classList.add('hidden'));
}

// ---- misc chips -------------------------------------------------------------
export function flashBuzzer(count) {
  const chip = $('buzzerChip');
  chip.classList.add('beeping');
  chip.querySelector('span:last-of-type').textContent = `beep ×${count}`;
  setTimeout(() => { chip.classList.remove('beeping'); chip.querySelector('span:last-of-type').textContent = 'idle'; },
    count * (FW.BEEP_MS ?? 150) + 200);
}

export function updateStats(nowMs, world) {
  $('statTime').textContent = (nowMs / 1000).toFixed(1) + 's';
  $('statOdo').textContent = (world.odometerCm / 100).toFixed(2) + ' m';
  $('statCrash').textContent = world.crashes;
}
