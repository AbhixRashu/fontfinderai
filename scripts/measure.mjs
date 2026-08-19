// Measures real shape metrics from a font's outlines:
//   x-height, stem weight, stroke contrast, letter width
// Uses opentype.js for the outlines and sharp for a tiny rasterisation of a
// few key glyphs. Values are real outline measurements, scaled so typical
// grotesques read ~0.16 stem / ~0.1 contrast / ~1.0 width / ~0.75 x-height.
import sharp from "sharp";

const RASTER = 600;

export async function measureFont(font) {
  const upem = font.unitsPerEm;

  const advances = [..."abcdefghijklmnopqrstuvwxyz"]
    .map((c) => font.charToGlyph(c))
    .filter((g) => g.index !== 0)
    .map((g) => g.advanceWidth / upem);
  const avgAdvance = advances.length
    ? advances.reduce((a, b) => a + b, 0) / advances.length
    : 0.5;
  const letterWidth = round3(avgAdvance / 0.525);

  const xb = font.charToGlyph("x").getPath(0, 0, upem).getBoundingBox();
  const Hb = font.charToGlyph("H").getPath(0, 0, upem).getBoundingBox();
  const xHeight = round3(Hb.y2 - Hb.y1 > 0 ? (xb.y2 - xb.y1) / (Hb.y2 - Hb.y1) : 0.7);

  const { stemWeight, contrast } = await glyphStats(font);

  return { xHeight, stemWeight, contrast, letterWidth };
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

async function rasterGlyph(font, char) {
  const g = font.charToGlyph(char);
  if (!g || g.index === 0) return null;
  const path = g.getPath(0, 0, font.unitsPerEm);
  const b = path.getBoundingBox();
  const W = Math.max(2, Math.ceil(b.x2 - b.x1));
  const H = Math.max(2, Math.ceil(b.y2 - b.y1));
  const scale = RASTER / font.unitsPerEm;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(4, Math.round(W * scale))}" height="${Math.max(4, Math.round(H * scale))}" viewBox="${b.x1} ${b.y1} ${W} ${H}">` +
    `<path d="${path.toPathData(1)}" fill="black" fill-rule="evenodd"/>` +
    `</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  const mask = new Uint8Array(px);
  let ink = 0;
  for (let i = 0; i < px; i++) {
    const a = data[i * 4 + 3];
    mask[i] = a > 128 ? 1 : 0;
    if (mask[i]) ink++;
  }
  if (ink < 16) return null;
  return { mask, w: info.width, h: info.height, bboxH: H };
}

function inkBbox(r) {
  let minX = r.w, minY = r.h, maxX = -1, maxY = -1;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (r.mask[y * r.w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function colRunAt(r, x, target) {
  // longest vertical run at column x that passes through pixel (x, target)
  let top = target, bottom = target;
  while (top - 1 >= 0 && r.mask[(top - 1) * r.w + x]) top--;
  while (bottom + 1 < r.h && r.mask[(bottom + 1) * r.w + x]) bottom++;
  return bottom - top + 1;
}
function rowRunAt(r, y, target) {
  let left = target, right = target;
  while (left - 1 >= 0 && r.mask[y * r.w + left - 1]) left--;
  while (right + 1 < r.w && r.mask[y * r.w + right + 1]) right++;
  return right - left + 1;
}

async function glyphStats(font) {
  const upem = font.unitsPerEm;

  // ---- stem weight: median vertical-stroke width across o/n/m/u, em units
  const stems = [];
  for (const ch of ["o", "n", "m", "u"]) {
    const r = await rasterGlyph(font, ch);
    if (!r) continue;
    const perRow = [];
    for (let y = 0; y < r.h; y++) {
      let run = 0, mx = 0;
      for (let x = 0; x < r.w; x++) {
        if (r.mask[y * r.w + x]) {
          run++;
          if (run > mx) mx = run;
        } else run = 0;
      }
      if (mx >= 3) perRow.push(mx);
    }
    if (perRow.length < 6) continue;
    const scale = r.bboxH / (RASTER * upem);
    // use the middle 40% band: true vertical strokes, not the caps
    const lo = Math.floor(perRow.length * 0.3);
    const hi = Math.floor(perRow.length * 0.7);
    stems.push(median(perRow.slice(lo, hi)) * scale);
  }
  const stemWeight = round3(stems.length ? median(stems) * 3.35 : 0.16);

  // ---- stroke contrast from the 'o': thin top/bottom arcs vs thick sides
  let contrast = 0.2;
  const o = await rasterGlyph(font, "o");
  if (o) {
    const bb = inkBbox(o);
    const cx = bb.x + Math.floor(bb.w / 2);
    const cy = bb.y + Math.floor(bb.h / 2);
    const top = colRunAt(o, cx, bb.y);
    const bottom = colRunAt(o, cx, bb.y + bb.h - 1);
    const left = rowRunAt(o, cy, bb.x);
    const right = rowRunAt(o, cy, bb.x + bb.w - 1);
    const thin = median([top, bottom]);
    const thick = median([left, right]);
    if (thick >= 3) {
      contrast = round3(Math.max(0, Math.min(1, 1 - thin / thick)));
    }
  }
  return { stemWeight, contrast };
}

function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}