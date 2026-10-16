// Node-canvas stubs for tools/restyle-characters.mjs — lets CharacterSprites.js run in plain Node.
// Only what the sheet painters touch: document.createElement('canvas'), canvas 2D contexts and
// ImageData (all backed by a Uint8ClampedArray; no compositing is needed because the pipeline
// paints every pixel itself through PixelCanvas / Painter).
class StubContext {
  /** @param {StubCanvas} canvas */
  constructor(canvas) { this.canvas = canvas; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  putImageData(img, dx, dy) {
    const d = img.data ?? img; // an ImageData-like object
    const rowBytes = img.width * 4;
    for (let y = 0; y < img.height; y++) {
      const off = ((dy + y) * this.canvas.width + dx) * 4;
      this.canvas._buf.set(d.subarray(y * rowBytes, (y + 1) * rowBytes), off);
    }
  }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      const src = ((y + yy) * this.canvas.width + x) * 4;
      out.set(this.canvas._buf.subarray(src, src + w * 4), yy * w * 4);
    }
    return { width: w, height: h, data: out };
  }
}

class StubCanvas {
  constructor(width = 0, height = 0) {
    this._w = width | 0; this._h = height | 0;
    this._buf = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4));
    this._ctx = new StubContext(this);
  }
  get width() { return this._w; }
  set width(v) { this._w = v | 0; this._buf = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4)); }
  get height() { return this._h; }
  set height(v) { this._h = v | 0; this._buf = new Uint8ClampedArray(Math.max(1, this._w * this._h * 4)); }
  getContext(kind) { return kind === '2d' ? this._ctx : null; }
  toDataURL() { throw new Error('toDataURL needs a real canvas — the CLI exports PNGs from the RGBA buffer'); }
}

globalThis.document = { createElement: (tag) => (tag === 'canvas' ? new StubCanvas() : {}) };
globalThis.HTMLCanvasElement = StubCanvas;
// PixelCanvas.toCanvas() builds `new ImageData(data, w, h)` — support both constructor shapes.
globalThis.ImageData = class {
  constructor(a, b, c) {
    if (a instanceof Uint8ClampedArray) { this.data = a; this.width = b; this.height = c ?? b; }
    else { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); }
  }
};
export { StubCanvas };
