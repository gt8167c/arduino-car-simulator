// ============================================================================
// config.js — shared engine state.
//
// Sketch-specific values (the #define mirror, sliders, state names, export
// layout) live in profiles/<sketch>.js. This file holds:
//   FW    the LIVE firmware parameters of the active profile (sliders mutate it)
//   SIM   simulation-only physics + engine flags
//   ARENA world dimensions
// ============================================================================

export const ARENA = { w: 500, h: 350 };

export const SIM_DEFAULTS = {
  vmaxCmS:      80,   // ground speed at PWM 255
  deadbandPWM:  90,   // DC motors stall below this PWM
  maxSteerDeg:  30,   // steering lock at PWM 255
  wheelbaseCm:  18,
  coneHalfDeg:  7,    // HC-SR04 beam half-angle
  noiseCm:      2,    // measurement noise ±
  physMaxCm:    400,  // HC-SR04 physical range; beyond → no echo (0)
  carLenCm:     26,
  carWidCm:     16,

  faithful:     false, // generic profile-toggle store (e.g. car_8feb26 pre-patch mode)

  timescale:    1,
  soundOn:      true,
  trailOn:      true,
};

export const SIM = { ...SIM_DEFAULTS };

export function resetSIM() {
  const keep = { faithful: SIM.faithful, soundOn: SIM.soundOn, trailOn: SIM.trailOn, timescale: SIM.timescale };
  Object.assign(SIM, SIM_DEFAULTS, keep);
}

// --- live firmware params of the active profile ------------------------------
// FW keeps one stable object identity (modules bind to it), so profile switches
// clear and refill it rather than reassigning.
export const FW = {};

let activeProfile = null;

export function setActiveProfile(profile) {
  activeProfile = profile;
  for (const k of Object.keys(FW)) delete FW[k];
  Object.assign(FW, profile.fwDefaults);
}

export function getActiveProfile() { return activeProfile; }

export function resetFW() {
  if (activeProfile) {
    for (const k of Object.keys(FW)) delete FW[k];
    Object.assign(FW, activeProfile.fwDefaults);
  }
}
