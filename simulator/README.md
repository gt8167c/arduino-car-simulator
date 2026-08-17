# CarK1 Simulator

Browser-based simulator + dashboard for the autonomous car sketches in this
sketchbook (`sketch/simulator/`, sibling to every car project). The active
profile — `../car_8feb26/car_8feb26.ino` (Vasu CarK1) today — runs as a
line-faithful port of its state machine against a 2D arena with ray-cast
HC-SR04 physics. One simulator serves all sketch variants via `profiles/`.

## Run it

**In the browser, no install:** https://gt8167c.github.io/arduino-car-simulator/
(published from this folder by `.github/workflows/pages.yml` on every push to `main`.)

Locally:

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

Current profiles:

| Profile | Sketch | Notes |
|---|---|---|
| `car_8feb26 · CarK1 (patched)` | `car_8feb26/car_8feb26.ino` | Non-blocking state machine, 128×64 OLED. Pre-patch toggle replays bugs Q1–Q4. |
| `car_16Jun24 · rear APDS9960` | `car_16Jun24/car_16Jun24.ino` | Blocking/sequential (`delay()`-driven), 128×32 OLED, **rear APDS9960 proximity** checked before reversing. |

### Rear proximity (APDS9960)

`car_16Jun24` uses the APDS9960 as a proximity sensor, not a gesture sensor: it
looks behind the car before backing away from a front collision. Its units are
8-bit reflectance **counts where higher = closer** (255 ≈ touching, 0 = clear) —
so the sketch's `if (prevBackwardDist < 3)` means *"almost no reflection, rear is
clear, safe to reverse."* The simulator models the falloff (≈127 counts at 4 cm,
12 at 14 cm, 0 past 20 cm) and draws the IR lobe behind the car, green when clear
and red when blocked.

Note the default threshold of **3 counts is very sensitive** — anything within
roughly 15 cm behind reads as blocked. `REAR_CLEAR_MAX` is a slider so you can
tune it against the arena.

### car_16Jun24 bugs B1–B6 — PATCHED 2026-08-16

Found by porting the sketch here; fixed in `../car_16Jun24/car_16Jun24.ino`,
which now compiles in **both** build configurations (AUTONOMOUS 41% flash / 26%
SRAM; Bluetooth path 49% / 35%).

1. **B1/B2** `apds` was a local in `setup()` and `SparkFun_APDS9960` has no
   `SoftwareWire*` constructor — two hard compile errors. Fixed by dropping
   `SoftwareWire` and putting the APDS9960 on the **hardware I2C bus the OLED
   already uses** (APDS 0x39, OLED 0x3C), with `apds` at file scope. This also
   frees D7/D8, which had collided with `BLUETOOTH_TX`/`RX`.
2. **B3** with the rear blocked, `moveforwardduration` was used uninitialized —
   the car drove *into* the obstacle it had just detected. Now initialised to 0
   and guarded, so it stops instead.
3. **B4** `uint8_t` ultrasonic read wrapped long echoes → `unsigned int`.
4. **B5** `stop()` wrote MIN_SPEED to three pins → writes 0.
5. **B6** Bluetooth mode's rear check never read the sensor, so the rear always
   looked clear. It now calls `readBackwardLaser()`, which works because the
   APDS is initialised in both modes.

Measured in the simulator, boxed in front and rear for 10 s: **patched = 0.00 m
travelled, 0 collisions; pre-patch = 2.45 m, 13 collisions.**

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
