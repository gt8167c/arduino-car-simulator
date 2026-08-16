# CarK1 Simulator

Browser-based simulator + dashboard for the autonomous car sketches in this
sketchbook (`sketch/simulator/`, sibling to every car project). The active
profile — `../car_8feb26/car_8feb26.ino` (Vasu CarK1) today — runs as a
line-faithful port of its state machine against a 2D arena with ray-cast
HC-SR04 physics. One simulator serves all sketch variants via `profiles/`.

## Run it

```bash
cd "$(dirname "$0")" && ./start.sh     # serves http://localhost:8137
```

or from Claude Code: the `car-simulator` launch config attaches the preview to
`http://localhost:8137` (start `start.sh` first — macOS privacy settings block the
preview launcher from reading ~/Documents, so the server must be started from a
terminal that has Files-and-Folders access).

## Keeping it in sync with the .ino

| You changed in the .ino | Update here |
|---|---|
| any `#define` value | `profiles/car_8feb26.js` → `fwDefaults` (labeled with .ino line refs) |
| state machine / scan logic / motor logic | `profiles/car_8feb26.firmware.js` (mirrors the sketch function-for-function) |
| new sensor or peripheral | `world.js` (physics) + a panel in `index.html`/`ui.js` |

`⇪ Export #defines` generates a paste-ready `#define` block from the current
slider values that maps 1:1 onto the sketch's define block.

## Firmware profiles (simulating other sketch variants)

One simulator, many sketches. Everything sketch-specific lives in `profiles/`;
the engine (arena, physics, OLED, panels, presets) is shared. The header
dropdown switches the active profile; the choice is remembered.

To add a variant (e.g. `car_31mar19`):

1. Copy `profiles/car_8feb26.firmware.js` → `profiles/car_31mar19.firmware.js`
   and make its logic mirror that sketch.
2. Copy `profiles/car_8feb26.js` → `profiles/car_31mar19.js`; update `id`,
   `label`, `sketch`, `fwDefaults`, `fwSliders`, states, export layout.
3. Register it in `profiles/index.js`: import it and add it to `PROFILES`.

Do **not** copy a second `.ino` into an Arduino sketch folder — the IDE compiles
every `.ino` in the folder together, giving duplicate `setup()`/`loop()` errors.
Profiles exist so the simulator can model other sketches without moving them.

## Parameter presets

Save the current firmware sliders under a name (Parameters panel → type a name →
**save**), then A/B between setups from the preset dropdown. Presets are stored
per-profile in the browser (localStorage) and survive reloads; **✕** deletes the
selected one, **defaults** returns to the .ino values. Presets only capture
firmware parameters (not chassis-physics), and any preset can be exported as a
`#define` block after applying it.

## Firmware bugs Q1–Q4 — PATCHED 2026-08-15

All four were found by porting the sketch here, then fixed in
`../car_8feb26/car_8feb26.ino` (original preserved as
`../car_8feb26/car_8feb26.ino.prepatch-2026-08-15.bak`). The patch
compiles clean for Uno (35% flash, 25% SRAM). The **pre-patch bugs** toggle in the
header replays the old behavior; default mode matches the patched firmware.

1. **Q1** `setMotors(int8_t, int8_t)` — `MAX_SPEED` 200 wrapped to −56, so every
   "forward at 200" drove the **reverse** pin at PWM 56; `MAX_TURN_SPEED` 255 wrapped
   to −1. Fixed: `int16_t` params (.ino:118).
2. **Q2** speed 0 wrote `MIN_SPEED` — "stop" kept driving at 110 and "straight" kept
   steering right. Fixed: zero writes 0 (.ino:126,134). `MIN_SPEED` is now unused,
   kept for future slow-speed maneuvers.
3. **Q3** `MOVING_FORWARD`/`REVERSING` passed `turnSpeed = MIN_SPEED` — constant right
   veer. Fixed: pass 0 (.ino:276,297).
4. **Q4** `uint8_t cm = ultrasonic.read()` — echoes > 255 cm wrapped mod 256
   (300 cm read as 44 cm ⇒ phantom obstacle). Fixed: `unsigned int` read (.ino:155).

The patch also promoted the timing literals to `#define`s (`FORWARD_MS`, `REVERSE_MS`,
`TURN_MS`, `SENSOR_STEP_MS`, `CLEAR_PATH_MIN`, .ino:56-60), so the **⇪ Export
#defines** block now maps 1:1 onto the sketch.

## Phase 2 — live telemetry from the real car

`telemetry.js` has a Web Serial client ready. Add this to the .ino display refresh,
plug in USB, click **⚡ Connect car** (Chrome/Edge):

```cpp
Serial.print(F("TLM,"));
Serial.print(sensorCache.forward); Serial.print(',');
Serial.print(sensorCache.left);    Serial.print(',');
Serial.print(sensorCache.right);   Serial.print(',');
Serial.print((uint8_t)currentState); Serial.print(',');
Serial.println(sonarServo.read());
```

(and `Serial.begin(9600);` in `setup()`). Frames drive the sensor bars, OLED, state
machine and log in place of the simulation.

## Files

- `index.html` / `style.css` — dashboard layout, dark cockpit theme
- `config.js` — shared engine state: live FW params, sim physics, arena size
- `profiles/index.js` — profile registry + the profile interface contract
- `profiles/car_8feb26.js` — CarK1 profile: `#define` mirror, sliders, export, notes
- `profiles/car_8feb26.firmware.js` — port of the .ino control logic
- `world.js` — arena, obstacles, chassis physics, HC-SR04 ray-cast, renderer
- `oled.js` — SSD1306 128×64 replica (two-tone amber/cyan module look)
- `ui.js` — panels: gauges, sliders, state flow, log, presets, export
- `telemetry.js` — Phase-2 Web Serial source
- `main.js` — profile lifecycle, sim clock, HAL bridge, input, orchestration
