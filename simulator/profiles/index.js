// ============================================================================
// profiles/index.js — firmware profile registry.
//
// A profile bundles everything sketch-specific:
//   id, label, sketch          identity shown in the header dropdown
//   states, oledStates, flow   state machine metadata for the panels
//   oled (optional)            {width, height, rows:[{scale}]}; default 128x64
//   rearSensor (optional)      declares a rear proximity readout + arena lobe
//   fwDefaults                 mirror of the sketch's #define block
//   fwSliders                  [key, min, max, step, unit, hint] rows
//   toggles (optional)         header checkboxes -> SIM[key] flags
//   createFirmware(hal)        returns the sketch-logic model; must expose:
//                              update(now), reset(now), onTransition, state,
//                              stateSince, sensorCache{forward,left,right},
//                              lastScan, pins{fwd,rev,left,right},
//                              servoCorrected, stateName()
//                              HAL it may call: readUltrasonic, readRearProximity,
//                              servoWrite, setPins, beep, display(rows[])
//   exportDefines(FW)          paste-ready #define block
//   notesHtml (optional)       card shown under the parameters panel
//
// To add a variant: copy car_8feb26.js + car_8feb26.firmware.js, adapt them to
// the other sketch, import it here and add it to PROFILES. Nothing else changes.
// ============================================================================

import car_8feb26 from './car_8feb26.js';
import car_16Jun24 from './car_16Jun24.js';

export const PROFILES = [car_8feb26, car_16Jun24];

export function profileById(id) {
  return PROFILES.find(p => p.id === id) ?? PROFILES[0];
}
