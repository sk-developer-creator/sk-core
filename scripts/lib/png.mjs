/**
 * Minimal, dependency-free PNG writer + a tiny drawing surface.
 *
 * Only Node built-ins are used (zlib for the deflate stream). Everything is
 * drawn at an integer supersample factor and then box-filtered down, which
 * gives clean edges without any rasteriser library.
 */

import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Encodes an RGBA pixel buffer as a PNG. */
export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;  // bit depth
  header[9] = 6;  // colour type: truecolour + alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------- read raster input */

/** Decodes an 8-bit, non-interlaced PNG (RGB or RGBA) into RGBA pixels. */
export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (!width || !height) throw new Error('PNG has no IHDR');
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG colour type ${colorType}`);

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start];
    const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));

    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const above = previous[i];
      const upperLeft = i >= channels ? previous[i - channels] : 0;
      let value = line[i];

      if (filter === 1) value = (value + left) & 0xff;
      else if (filter === 2) value = (value + above) & 0xff;
      else if (filter === 3) value = (value + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) {
        const p = left + above - upperLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - above);
        const pc = Math.abs(p - upperLeft);
        const predictor = pa <= pb && pa <= pc ? left : (pb <= pc ? above : upperLeft);
        value = (value + predictor) & 0xff;
      }
      line[i] = value;
    }

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      out[target] = line[source];
      out[target + 1] = line[source + 1];
      out[target + 2] = line[source + 2];
      out[target + 3] = channels === 4 ? line[source + 3] : 255;
    }

    previous = line;
  }

  return { width, height, data: out };
}

/** Draws a decoded image into a canvas rectangle using an alpha-weighted box filter. */
export function drawImage(canvas, image, x, y, w, h, opacity = 1) {
  const targetX = Math.round(x);
  const targetY = Math.round(y);
  const targetWidth = Math.max(1, Math.round(w));
  const targetHeight = Math.max(1, Math.round(h));
  const scaleX = image.width / targetWidth;
  const scaleY = image.height / targetHeight;

  for (let py = 0; py < targetHeight; py += 1) {
    const sourceTop = py * scaleY;
    const sourceBottom = (py + 1) * scaleY;
    const firstRow = Math.floor(sourceTop);
    const lastRow = Math.min(image.height, Math.ceil(sourceBottom));

    for (let px = 0; px < targetWidth; px += 1) {
      const sourceLeft = px * scaleX;
      const sourceRight = (px + 1) * scaleX;
      const firstColumn = Math.floor(sourceLeft);
      const lastColumn = Math.min(image.width, Math.ceil(sourceRight));
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let weight = 0;

      for (let sy = firstRow; sy < lastRow; sy += 1) {
        const rowWeight = Math.min(sourceBottom, sy + 1) - Math.max(sourceTop, sy);
        if (rowWeight <= 0) continue;
        for (let sx = firstColumn; sx < lastColumn; sx += 1) {
          const columnWeight = Math.min(sourceRight, sx + 1) - Math.max(sourceLeft, sx);
          if (columnWeight <= 0) continue;
          const area = rowWeight * columnWeight;
          const index = (sy * image.width + sx) * 4;
          const sourceAlpha = image.data[index + 3] / 255;
          red += image.data[index] * sourceAlpha * area;
          green += image.data[index + 1] * sourceAlpha * area;
          blue += image.data[index + 2] * sourceAlpha * area;
          alpha += sourceAlpha * area;
          weight += area;
        }
      }

      if (weight <= 0 || alpha <= 0) continue;
      const outAlpha = Math.min(1, (alpha / weight) * opacity);
      blend(canvas, targetX + px, targetY + py, [
        Math.round(red / alpha),
        Math.round(green / alpha),
        Math.round(blue / alpha),
        outAlpha,
      ]);
    }
  }
}

/* ------------------------------------------------------------------ canvas */

export function createCanvas(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function blend(canvas, x, y, color) {
  const [r, g, b] = color;
  const a = color[3] === undefined ? 1 : color[3];
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height || a <= 0) return;
  const i = (y * canvas.width + x) * 4;
  if (a >= 1) {
    canvas.data[i] = r;
    canvas.data[i + 1] = g;
    canvas.data[i + 2] = b;
    canvas.data[i + 3] = 255;
    return;
  }
  const dstA = canvas.data[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 0) return;
  canvas.data[i] = Math.round((r * a + canvas.data[i] * dstA * (1 - a)) / outA);
  canvas.data[i + 1] = Math.round((g * a + canvas.data[i + 1] * dstA * (1 - a)) / outA);
  canvas.data[i + 2] = Math.round((b * a + canvas.data[i + 2] * dstA * (1 - a)) / outA);
  canvas.data[i + 3] = Math.round(outA * 255);
}

export function fillRect(canvas, x, y, w, h, color) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(canvas.width, Math.round(x + w));
  const y1 = Math.min(canvas.height, Math.round(y + h));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) blend(canvas, px, py, color);
  }
}

/** Vertical gradient fill (great for large backgrounds). */
export function fillGradient(canvas, x, y, w, h, top, bottom) {
  const y0 = Math.max(0, Math.round(y));
  const y1 = Math.min(canvas.height, Math.round(y + h));
  for (let py = y0; py < y1; py += 1) {
    const t = h <= 1 ? 0 : (py - y) / (h - 1);
    const color = [
      Math.round(top[0] + (bottom[0] - top[0]) * t),
      Math.round(top[1] + (bottom[1] - top[1]) * t),
      Math.round(top[2] + (bottom[2] - top[2]) * t),
      (top[3] ?? 1) + ((bottom[3] ?? 1) - (top[3] ?? 1)) * t,
    ];
    fillRect(canvas, x, py, w, 1, color);
  }
}

function inRoundedRect(px, py, x, y, w, h, r) {
  const left = x + r;
  const right = x + w - r;
  const top = y + r;
  const bottom = y + h - r;
  let cx = px;
  let cy = py;
  if (px < left) cx = left; else if (px > right) cx = right;
  if (py < top) cy = top; else if (py > bottom) cy = bottom;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Filled rounded rectangle (corners are exact, not anti-aliased). */
export function fillRoundedRect(canvas, x, y, w, h, radius, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(canvas.width, Math.ceil(x + w));
  const y1 = Math.min(canvas.height, Math.ceil(y + h));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      if (inRoundedRect(px, py, x, y, w, h, radius)) blend(canvas, px, py, color);
    }
  }
}

/** Rounded rectangle outline of a given thickness. */
export function strokeRoundedRect(canvas, x, y, w, h, radius, thickness, color) {
  const x0 = Math.max(0, Math.floor(x - thickness));
  const y0 = Math.max(0, Math.floor(y - thickness));
  const x1 = Math.min(canvas.width, Math.ceil(x + w + thickness));
  const y1 = Math.min(canvas.height, Math.ceil(y + h + thickness));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const outer = inRoundedRect(px, py, x, y, w, h, radius);
      const inner = inRoundedRect(px, py, x + thickness, y + thickness, w - 2 * thickness, h - 2 * thickness, Math.max(0, radius - thickness));
      if (outer && !inner) blend(canvas, px, py, color);
    }
  }
}

export function fillCircle(canvas, cx, cy, radius, color) {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(canvas.width, Math.ceil(cx + radius + 1));
  const y1 = Math.min(canvas.height, Math.ceil(cy + radius + 1));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) blend(canvas, px, py, color);
    }
  }
}

export function strokeCircle(canvas, cx, cy, radius, thickness, color) {
  const inner = radius - thickness;
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const x1 = Math.min(canvas.width, Math.ceil(cx + radius + 1));
  const y1 = Math.min(canvas.height, Math.ceil(cy + radius + 1));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const dx = px + 0.5 - cx;
      const dy = py + 0.5 - cy;
      const distanceSquared = dx * dx + dy * dy;
      // Blend only the ring: never erase what is already on the canvas.
      if (distanceSquared <= radius * radius && distanceSquared >= inner * inner) {
        blend(canvas, px, py, color);
      }
    }
  }
}

/* -------------------------------------------------------------- 5x7 font */

const GLYPHS = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

export function textWidth(text, scale, tracking = 1) {
  const characters = [...text.toUpperCase()];
  if (characters.length === 0) return 0;
  return characters.length * 5 * scale + (characters.length - 1) * tracking * scale;
}

/** Draws bitmap text. `scale` is the pixel size of one font pixel. */
export function drawText(canvas, text, x, y, scale, color, tracking = 1) {
  let cursor = x;
  const colour = [color[0], color[1], color[2], color[3] ?? 1];
  for (const character of text.toUpperCase()) {
    const glyph = GLYPHS[character] ?? GLYPHS[' '];
    for (let row = 0; row < 7; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        if (glyph[row][col] === '1') {
          fillRect(canvas, cursor + col * scale, y + row * scale, scale, scale, colour);
        }
      }
    }
    cursor += (5 + tracking) * scale;
  }
  return cursor - tracking * scale;
}

/* --------------------------------------------------------- render + scale */

/** Draws at `scale`x and box-filters back down, so edges stay smooth. */
export function renderScaled(width, height, scale, draw) {
  const big = createCanvas(width * scale, height * scale);
  draw(big);
  const out = createCanvas(width, height);
  const area = scale * scale;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const i = ((y * scale + sy) * big.width + (x * scale + sx)) * 4;
          const alpha = big.data[i + 3] / 255;
          r += big.data[i] * alpha;
          g += big.data[i + 1] * alpha;
          b += big.data[i + 2] * alpha;
          a += alpha;
        }
      }
      const o = (y * width + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
        out.data[o + 3] = Math.round((a / area) * 255);
      }
    }
  }
  return out;
}
