// Copies the compiled library into extension/lib and generates the icons, so
// the extension folder can be loaded unpacked in Chrome (chrome://extensions).
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

mkdirSync('extension/lib', { recursive: true });
mkdirSync('extension/icons', { recursive: true });
for (const f of ['sprout.js', 'focus.js']) copyFileSync(`dist/src/${f}`, `extension/lib/${f}`);

// ---- a tiny PNG encoder: a rounded green square with a leaf-ish dot ---------
function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      // rounded square mask
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = dx * dx + dy * dy <= r * r;
      // a bright dot, off centre, like a young leaf
      const cx = size * 0.62, cy = size * 0.38, dot = Math.hypot(x - cx, y - cy) <= size * 0.16;
      let px = [15, 23, 42, 255];
      if (inside) px = dot ? [52, 211, 153, 255] : [30, 41, 59, 255];
      if (!inside) px = [0, 0, 0, 0];
      raw.set(px, o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [16, 48, 128]) writeFileSync(`extension/icons/${size}.png`, png(size));
console.log('extension/ is ready: load it unpacked from chrome://extensions');
