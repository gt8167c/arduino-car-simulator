// ============================================================================
// oled.js — SSD1306 128x64 replica. Text is rasterized to a 1-bit 128x64
// buffer then drawn as chunky pixels, reproducing the updateDisplay() layout:
//   line1 set2X (16px rows 0-15), line2/line3 set1X (8px rows).
// Styled like the common two-tone module: amber top strip, cyan body.
// ============================================================================

const W = 128, H = 64;

export class Oled {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.raster = document.createElement('canvas');
    this.raster.width = W; this.raster.height = H;
    this.rctx = this.raster.getContext('2d', { willReadFrequently: true });
    this.twoTone = true;
    this.lines = ['', '', ''];
  }

  show(l1, l2, l3) {
    this.lines = [l1, l2, l3];
    const r = this.rctx;
    r.clearRect(0, 0, W, H);
    r.fillStyle = '#fff';
    r.textBaseline = 'alphabetic';
    r.font = 'bold 13px "Courier New", monospace';       // set2X
    r.fillText(l1 ?? '', 1, 12);
    r.font = 'bold 8px "Courier New", monospace';        // set1X
    r.fillText(l2 ?? '', 1, 23);
    r.fillText(l3 ?? '', 1, 32);

    const img = r.getImageData(0, 0, W, H).data;
    const ctx = this.ctx;
    const sx = this.canvas.width / W, sy = this.canvas.height / H;

    ctx.fillStyle = '#06070a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let y = 0; y < H; y++) {
      const on = this.twoTone && y < 16 ? '#ffb020' : '#7fd8ff';
      ctx.fillStyle = on;
      for (let x = 0; x < W; x++) {
        if (img[(y * W + x) * 4 + 3] > 110) {
          ctx.fillRect(x * sx, y * sy, sx * 0.85, sy * 0.85);   // pixel gap = OLED look
        }
      }
    }
  }
}
