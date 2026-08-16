// ============================================================================
// profiles/index.js — firmware profile registry.
//
// A profile bundles everything sketch-specific:
//   id, label, sketch          identity shown in the header dropdown
//   states, oledStates, flow   state machine metadata for the panels
//   fwDefaults                 mirror of the sketch's #define block
//   fwSliders                  [key, min, max, step, unit, hint] rows
//   toggles (optional)         header checkboxes -> SIM[key] flags
//   createFirmware(hal)        returns the sketch-logic model; must expose:
//                              update(now), reset(now), onTransition, state,
//                              stateSince, sensorCache{forward,left,right},
//                              lastScan, pins{fwd,rev,left,right},
//                              servoCorrected, stateName()
//   exportDefines(FW)          paste-ready #define block
//   notesHtml (optional)       card shown under the parameters panel
//
// To add a variant: copy car_8feb26.js + car_8feb26.firmware.js, adapt them to
// the other sketch, import it here and add it to PROFILES. Nothing else changes.
// ============================================================================

import car_8feb26 from './car_8feb26.js';

export const PROFILES = [car_8feb26];

export function profileById(id) {
  return PROFILES.find(p => p.id === id) ?? PROFILES[0];
}
