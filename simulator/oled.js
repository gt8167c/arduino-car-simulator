// ============================================================================
// oled.js — SSD1306 replica. Text is rasterized to a 1-bit buffer at the
// panel's native resolution, then drawn as chunky pixels.
//
// Geometry is profile-driven so both panel types render truthfully:
//   car_8feb26  Adafruit128x64, set2X banner + set1X rows
//   car_16Jun24 Adafruit128x32, four set1X rows via setCursor(0, 0..3)
//
// show(rows) takes an array of strings, one per declared row.
// ============================================================================

export class Oled {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.raster = document.createElement('canvas');
    this.rctx = null;
    this.twoTone = true;
    this.setGeometry({ width: 128, height: 64, rows: [{ scale: 2 }, { scale: 1 }, { scale: 1 }] });
  }

  // rows: [{ scale }] — scale 1 = set1X (8px), 2 = set2X (16px)
  setGeometry({ width, height, rows }) {
    this.W = width; this.H = height; this.rows = rows;
    this.raster.width = width; this.raster.height = height;
    this.rctx = this.raster.getContext('2d', { willReadFrequently: true });
    // keep the on-screen canvas at the panel's aspect ratio
    this.canvas.width = width * 3;
    this.canvas.height = height * 3;
    this.canvas.style.aspectRatio = `${width} / ${height}`;
    this.lines = rows.map(() => '');
    this.show(this.lines);
  }

  show(lines) {
    this.lines = lines;
    const r = this.rctx;
    r.clearRect(0, 0, this.W, this.H);
    r.fillStyle = '#fff';
    r.textBaseline = 'alphabetic';

    let y = 0;                       // top of the current text row, in pixels
    this.rows.forEach((row, i) => {
      const px = 8 * row.scale;      // Adafruit5x7 cell height per scale
      const text = lines[i] ?? '';
      // Adafruit5x7 is 5px wide + 1px gap, 7px tall; approximate that cell so
      // glyphs don't collide on the 4-row 128x32 panel
      r.font = `${row.scale === 2 ? 'bold 13' : '8'}px "Courier New", monospace`;
      r.fillText(text, 1, y + px - (row.scale === 2 ? 3 : 1));
      y += px;
    });

    const img = r.getImageData(0, 0, this.W, this.H).data;
    const ctx = this.ctx;
    const sx = this.canvas.width / this.W, sy = this.canvas.height / this.H;

    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // two-tone modules put an amber strip over the top 16 rows
    const amberRows = this.H >= 64 ? 16 : 8;
    for (let py = 0; py < this.H; py++) {
      ctx.fillStyle = this.twoTone && py < amberRows ? '#ffb020' : '#7fd8ff';
      for (let px = 0; px < this.W; px++) {
        if (img[(py * this.W + px) * 4 + 3] > 110) {
          ctx.fillRect(px * sx, py * sy, sx * 0.85, sy * 0.85);   // pixel gap = OLED look
        }
      }
    }
  }
}
