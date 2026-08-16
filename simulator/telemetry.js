// ============================================================================
// telemetry.js — data-source abstraction so the same dashboard can be driven
// by the simulation today and the REAL car later (Phase 2).
//
// PHASE 2 (live car over USB serial): add this to the .ino loop / display
// update, then click "Connect car" in the header:
//
//   // 9600 baud on the hardware Serial (USB). One line per display refresh:
//   Serial.print(F("TLM,"));
//   Serial.print(sensorCache.forward); Serial.print(',');
//   Serial.print(sensorCache.left);    Serial.print(',');
//   Serial.print(sensorCache.right);   Serial.print(',');
//   Serial.print((uint8_t)currentState); Serial.print(',');
//   Serial.println(180 - lastCommandedAngle);   // corrected servo deg
//
// Frame shape delivered to the dashboard (both sources):
//   { f, l, r, state, servo }   — cm, cm, cm, state index 0-5, corrected deg
// ============================================================================

export class SerialSource {
  constructor(onFrame, onStatus) {
    this.onFrame = onFrame;
    this.onStatus = onStatus;
    this.port = null;
    this.reader = null;
    this.connected = false;
  }

  static supported() { return 'serial' in navigator; }

  async connect(baud = 9600) {
    if (!SerialSource.supported()) throw new Error('Web Serial not available in this browser');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: baud });
    this.connected = true;
    this.onStatus?.('connected');
    this._readLoop();
  }

  async _readLoop() {
    const decoder = new TextDecoder();
    let buf = '';
    try {
      this.reader = this.port.readable.getReader();
      while (this.connected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buf += decoder.decode(value);
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('TLM,')) continue;
          const p = line.slice(4).split(',').map(Number);
          if (p.length >= 4 && p.every(n => !Number.isNaN(n))) {
            this.onFrame({ f: p[0], l: p[1], r: p[2], state: p[3], servo: p[4] ?? 90 });
          }
        }
      }
    } catch (e) {
      this.onStatus?.('error: ' + e.message);
    } finally {
      this.disconnect();
    }
  }

  async disconnect() {
    this.connected = false;
    try { await this.reader?.cancel(); this.reader?.releaseLock(); } catch {}
    try { await this.port?.close(); } catch {}
    this.onStatus?.('disconnected');
  }
}
