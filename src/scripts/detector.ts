// ---------------------------------------------------------------------------
// Font Finder AI — client-side font identification engine.
// All processing runs in the browser: binarize -> connected components ->
// 16x16 letter signatures -> Hamming match against the pre-computed index ->
// whole-word re-render check against the top candidates.
// ---------------------------------------------------------------------------

const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// ---------------------------------------------------------------------------
// Image -> binary mask
// ---------------------------------------------------------------------------

// Otsu threshold over a 256-bin histogram.
function otsu(hist: Uint32Array): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 0;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > max) {
      max = between;
      threshold = i;
    }
  }
  return threshold;
}

interface Mask {
  bits: Uint8Array; // 0/1, 1 = ink
  width: number;
  height: number;
}

// Unpremultiply RGBA onto white, estimate the background colour, and binarise
// into ink/background. Returns the binary mask plus the mode of the grayscale
// for polarity detection.
function binarize(data: Uint8ClampedArray, width: number, height: number): Mask {
  const n = width * height;
  const r = new Uint8Array(n);
  const g = new Uint8Array(n);
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const a = data[p + 3] / 255;
    r[i] = Math.round(data[p] * a + 255 * (1 - a));
    g[i] = Math.round(data[p + 1] * a + 255 * (1 - a));
    b[i] = Math.round(data[p + 2] * a + 255 * (1 - a));
  }
  const hist = new Uint32Array(4096);
  for (let i = 0; i < n; i++) {
    hist[(r[i] >> 4) << 8 | (g[i] >> 4) << 4 | (b[i] >> 4)]++;
  }
  let mode = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i] > hist[mode]) mode = i;
  const bgR = (mode >> 8 & 15) * 17;
  const bgG = (mode >> 4 & 15) * 17;
  const bgB = (mode & 15) * 17;

  const dist = new Float64Array(n);
  const gray = new Uint8Array(n);
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(r[i] - bgR, g[i] - bgG, b[i] - bgB);
    dist[i] = d;
    if (d > maxDist) maxDist = d;
  }
  if (maxDist === 0) return { bits: new Uint8Array(n), width, height };
  for (let i = 0; i < n; i++) gray[i] = Math.round((dist[i] * 255) / maxDist);
  const th = otsu(histOf(gray));
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) bits[i] = gray[i] > th ? 1 : 0;
  return { bits, width, height };
}

function histOf(gray: Uint8Array): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) h[gray[i]]++;
  return h;
}

// ---------------------------------------------------------------------------
// Connected components
// ---------------------------------------------------------------------------

function connectedComponents(mask: Mask, minSize = 12): { x: number; y: number; w: number; h: number }[] {
  const { bits, width, height } = mask;
  const seen = new Uint8Array(bits.length);
  const comps: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i] || seen[i]) continue;
    const stack: number[] = [i];
    seen[i] = 1;
    let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
    while (stack.length) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx / width) | 0;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nidx = ny * width + nx;
          if (bits[nidx] && !seen[nidx]) {
            seen[nidx] = 1;
            stack.push(nidx);
          }
        }
      }
    }
    if (count >= minSize) comps.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  comps.sort((a, b) => a.x - b.x);
  return comps;
}

// Merge components that overlap horizontally into words/letters.
function mergeOverlap(comps: { x: number; y: number; w: number; h: number }[], overlap = 0.55, vOverlap = 0.4) {
  const result: { x: number; y: number; w: number; h: number }[] = [];
  const sorted = comps.slice().sort((a, b) => a.x - b.x);
  for (const comp of sorted) {
    const last = result[result.length - 1];
    if (last) {
      const hOverlap = Math.min(last.x + last.w, comp.x + comp.w) - Math.max(last.x, comp.x);
      const minW = Math.min(last.w, comp.w);
      const verticalOverlap = Math.max(last.y, comp.y) - Math.min(last.y + last.h, comp.y + comp.h) < Math.min(last.h, comp.h) * vOverlap;
      if (hOverlap > 0 && hOverlap >= minW * overlap && verticalOverlap) {
        last.x = Math.min(last.x, comp.x);
        last.y = Math.min(last.y, comp.y);
        last.w = Math.max(last.x + last.w, comp.x + comp.w) - last.x;
        last.h = Math.max(last.y + last.h, comp.y + comp.h) - last.y;
        continue;
      }
    }
    result.push({ ...comp });
  }
  return result;
}

function dropSmall(comps: { x: number; y: number; w: number; h: number }[]) {
  if (!comps.length) return comps;
  const heights = comps.map((c) => c.h).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)];
  return comps.filter((c) => c.h >= median * 0.35 && c.w >= 2);
}

// ---------------------------------------------------------------------------
// 16x16 signatures
// ---------------------------------------------------------------------------

function signature(mask: Mask, box: { x: number; y: number; w: number; h: number }, n = 16): Uint8Array {
  const out = new Uint8Array((n * n) / 8);
  for (let gy = 0; gy < n; gy++) {
    for (let gx = 0; gx < n; gx++) {
      const x0 = box.x + Math.floor((gx * box.w) / n);
      const x1 = box.x + Math.max(Math.floor(((gx + 1) * box.w) / n), Math.floor((gx * box.w) / n) + 1);
      const y0 = box.y + Math.floor((gy * box.h) / n);
      const y1 = box.y + Math.max(Math.floor(((gy + 1) * box.h) / n), Math.floor((gy * box.h) / n) + 1);
      let ink = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          total++;
          if (mask.bits[y * mask.width + x]) ink++;
        }
      }
      if (total > 0 && ink / total >= 0.5) {
        const bit = gy * n + gx;
        out[bit >> 3] |= 1 << (7 - (bit & 7));
      }
    }
  }
  return out;
}

// Single-step morphological erosion (a pixel survives if all 8 neighbours are ink).
function erode(mask: Mask): Mask {
  const { bits, width, height } = mask;
  const out = new Uint8Array(bits.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (!bits[idx]) continue;
      let solid = 1;
      for (let dy = -1; dy <= 1 && solid; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!bits[(y + dy) * width + (x + dx)]) {
            solid = 0;
            break;
          }
        }
      }
      out[idx] = solid;
    }
  }
  return { bits: out, width, height };
}

// Recompute a box's ink bounds inside a (possibly eroded) mask.
function inkBounds(mask: Mask, box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } | null {
  let minX = box.x + box.w, minY = box.y + box.h, maxX = box.x - 1, maxY = box.y - 1;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (mask.bits[y * mask.width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

// Signatures at several erosion levels (thinner variants of the letter).
function multiScaleSignatures(mask: Mask, boxes: { x: number; y: number; w: number; h: number }[], steps = 5): Uint8Array[][] {
  const out: Uint8Array[][] = [boxes.map((b) => signature(mask, b))];
  let eroded = mask;
  for (let i = 1; i <= steps; i++) {
    eroded = erode(eroded);
    const boxes2 = boxes.map((b) => inkBounds(eroded, b));
    if (boxes2.some((b) => b === null)) break;
    out.push(boxes2.map((b, j) => signature(eroded, b!)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Words and lines
// ---------------------------------------------------------------------------

// Horizontal bands of text rows.
function lineRows(mask: Mask): { top: number; bottom: number }[] {
  const { bits, width, height } = mask;
  const rows: { top: number; bottom: number }[] = [];
  let start = -1;
  for (let y = 0; y < height; y++) {
    let has = false;
    for (let x = 0; x < width; x++) if (bits[y * width + x]) { has = true; break; }
    if (has) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      rows.push({ top: start, bottom: y - 1 });
      start = -1;
    }
  }
  if (start >= 0) rows.push({ top: start, bottom: height - 1 });
  return rows;
}

// Split a run of letters into words by inter-letter gaps.
function splitWords(comps: { x: number; y: number; w: number; h: number }[], gapFactor = 2, heightFactor = 0.24): { x: number; y: number; w: number; h: number }[][] {
  if (comps.length < 2) return comps.length ? [comps] : [];
  const sorted = comps.slice().sort((a, b) => a.x - b.x);
  const heights = sorted.map((c) => c.h).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)];
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w));
  const gs = gaps.slice().sort((a, b) => a - b);
  const medGap = Math.max(1, gs[Math.floor(gs.length / 2)]);
  const threshold = Math.max(medGap * gapFactor, medH * heightFactor);
  const words: { x: number; y: number; w: number; h: number }[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (gaps[i - 1] > threshold) words.push([]);
    words[words.length - 1].push(sorted[i]);
  }
  return words;
}

function boundsOf(comps: { x: number; y: number; w: number; h: number }[]) {
  const minX = Math.min(...comps.map((c) => c.x));
  const minY = Math.min(...comps.map((c) => c.y));
  const maxX = Math.max(...comps.map((c) => c.x + c.w));
  const maxY = Math.max(...comps.map((c) => c.y + c.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function inkCount(mask: Mask, box: { x: number; y: number; w: number; h: number }): number {
  let n = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      if (mask.bits[y * mask.width + x]) n++;
    }
  }
  return n;
}

interface Word {
  boxes: { x: number; y: number; w: number; h: number }[];
  signatures: Uint8Array[];
  bounds: { x: number; y: number; w: number; h: number };
  line: number;
  ink: number;
}

// Split the whole mask into words, each with per-letter signatures.
function findWords(mask: Mask): Word[] {
  const comps = connectedComponents(mask);
  const words: Word[] = [];
  lineRows(mask).forEach((row, line) => {
    const inRow = comps.filter((c) => {
      const mid = c.y + c.h / 2;
      return mid >= row.top && mid <= row.bottom;
    });
    if (!inRow.length) return;
    const letters = dropSmall(mergeOverlap(inRow));
    for (const wordComps of splitWords(letters)) {
      if (!wordComps.length) continue;
      words.push({
        boxes: wordComps,
        signatures: wordComps.map((b) => signature(mask, b)),
        bounds: boundsOf(wordComps),
        line,
        ink: wordComps.reduce((sum, b) => sum + inkCount(mask, b), 0),
      });
    }
  });
  return words;
}

// ---------------------------------------------------------------------------
// Index comparison
// ---------------------------------------------------------------------------

interface Index {
  grid: number;
  bytesPerGlyph: number;
  chars: string;
  weights: string[];
  fonts: string[];
  families: string[];
  categories: string[];
}

function zeroBytes(bytes: Uint8Array, offset: number, len: number): boolean {
  for (let i = 0; i < len; i++) if (bytes[offset + i] !== 0) return false;
  return true;
}

function hamming(a: Uint8Array, b: Uint8Array, offset: number): number {
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[offset + i];
    while (x) {
      x &= x - 1;
      dist++;
    }
  }
  return dist;
}

interface LetterEvidence {
  char: string;
  signature: Uint8Array;
  box: { x: number; y: number; w: number; h: number };
}

// Score every font against one letter (one char block).
function scoreFonts(index: Index, charBlock: Map<string, Uint8Array>, letters: LetterEvidence[]): { slug: string; score: number; lettersUsed: number }[] {
  const { bytesPerGlyph, fonts } = index;
  const total = new Float64Array(fonts.length);
  const used = new Uint16Array(fonts.length);
  for (const letter of letters) {
    const block = charBlock.get(letter.char);
    if (!block) continue;
    for (let f = 0; f < fonts.length; f++) {
      const off = f * bytesPerGlyph;
      if (zeroBytes(block, off, bytesPerGlyph)) continue;
      total[f] += hamming(letter.signature, block, off) / 256;
      used[f]++;
    }
  }
  const out: { slug: string; score: number; lettersUsed: number }[] = [];
  for (let f = 0; f < fonts.length; f++) {
    if (used[f] !== 0) out.push({ slug: fonts[f], score: 1 - total[f] / used[f], lettersUsed: used[f] });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Rank across weights (regular, bold), keeping the best score per font.
function rankAcrossWeights(index: Index, weights: { name: string; data: Map<string, Uint8Array> }[], letters: LetterEvidence[]) {
  const best = new Map<string, { slug: string; score: number; weight: string }>();
  for (const weight of weights) {
    for (const hit of scoreFonts(index, weight.data, letters)) {
      const prev = best.get(hit.slug);
      if (!prev || hit.score > prev.score) best.set(hit.slug, { slug: hit.slug, score: hit.score, weight: weight.name });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

// Turn raw scores into 0-100 confidence.
function confidence(scores: { slug: string; score: number; lettersUsed: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  if (!scores.length) return map;
  const top = scores[0].score;
  const med = scores[Math.floor(scores.length / 2)].score;
  const span = Math.max(top - med, 1e-6);
  for (const s of scores) {
    const pct = ((s.score - med) / span) * 100;
    map.set(s.slug, Math.max(0, Math.min(100, Math.round(pct))));
  }
  return map;
}

// ---------------------------------------------------------------------------
// Baseline / x-height heuristics (restrict candidate characters per letter)
// ---------------------------------------------------------------------------

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function modeNear(values: number[], tol: number): number {
  if (!values.length) return 0;
  let best = values[0];
  let bestCount = 0;
  for (const v of values) {
    let count = 0;
    for (const other of values) if (Math.abs(other - v) <= tol) count++;
    if (count > bestCount) {
      bestCount = count;
      best = v;
    }
  }
  return best;
}

interface Typography {
  baseline: number;
  xHeight: number;
  xSize: number;
  reliable: boolean;
  uniformHeight: boolean;
}

function estimateTypography(boxes: { x: number; y: number; w: number; h: number }[]): Typography {
  if (!boxes.length) return { baseline: 0, xHeight: 0, xSize: 1, reliable: false, uniformHeight: false };
  const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)];
  const tol = Math.max(2, medH * 0.08);
  const baseline = modeNear(boxes.map((b) => b.y + b.h), tol);
  const onLine = boxes.filter((b) => Math.abs(b.y + b.h - baseline) <= tol);
  const xHeights = onLine.filter((b) => b.h <= medH * 1.08).map((b) => b.y);
  const xHeight = xHeights.length ? modeNear(xHeights, tol) : baseline - medH;
  return {
    baseline,
    xHeight,
    xSize: Math.max(1, baseline - xHeight),
    reliable: boxes.length >= 2 && onLine.length >= Math.max(2, boxes.length * 0.5),
    uniformHeight: (Math.max(...onLine.map((b) => b.h)) - Math.min(...onLine.map((b) => b.h))) / Math.max(1, medH) < 0.15,
  };
}

// Characters worth trying for a given letter box.
function candidateChars(box: { x: number; y: number; w: number; h: number }, typo: Typography, index: Index): string {
  const chars = index.chars;
  if (!typo.reliable) return chars;
  const tol = typo.xSize * 0.18;
  const top = box.y;
  const bottom = box.y + box.h;
  const asc = top < typo.xHeight - tol;
  const desc = bottom > typo.baseline + tol;
  let pool: string;
  if (asc && desc) pool = "jABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  else if (asc) pool = "bdfhkltABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  else if (desc) pool = "gpqyj";
  else pool = typo.uniformHeight ? "acemnorsuvwxzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" : "acemnorsuvwxz";
  return [...pool].filter((c) => chars.includes(c)).join("") || chars;
}

// Classify each letter: pick the character and font that fit best together.
function classifyLetters(
  index: Index,
  charData: Map<string, Uint8Array>,
  letters: LetterEvidence[],
  typo: Typography
): { glyphs: { char: string; signature: Uint8Array; box: { x: number; y: number; w: number; h: number }; fit: number }[]; bestSlug: string; ranking: { slug: string; score: number }[] } | null {
  const { bytesPerGlyph, fonts } = index;
  if (!letters.length) return null;
  const pools = letters.map((l) => candidateChars(l.box, typo, index));
  const bestChars: string[][] = letters.map(() => Array(fonts.length).fill(""));
  const bestFit: Float64Array[] = letters.map(() => new Float64Array(fonts.length).fill(1));
  for (let li = 0; li < letters.length; li++) {
    for (const ch of pools[li]) {
      const block = charData.get(ch);
      if (!block) continue;
      for (let f = 0; f < fonts.length; f++) {
        const off = f * bytesPerGlyph;
        if (zeroBytes(block, off, bytesPerGlyph)) continue;
        const d = hamming(letters[li].signature, block, off) / 256;
        if (d < bestFit[li][f] || bestChars[li][f] === "") {
          bestFit[li][f] = d;
          bestChars[li][f] = ch;
        }
      }
    }
  }
  const ranking: { slug: string; score: number }[] = [];
  for (let f = 0; f < fonts.length; f++) {
    let sum = 0;
    let count = 0;
    for (let li = 0; li < letters.length; li++) {
      if (bestChars[li][f] !== "") {
        sum += bestFit[li][f];
        count++;
      }
    }
    if (count !== 0) ranking.push({ slug: fonts[f], score: 1 - sum / count });
  }
  if (!ranking.length) return null;
  ranking.sort((a, b) => b.score - a.score);
  const bestSlug = ranking[0].slug;
  const fIdx = fonts.indexOf(bestSlug);
  const glyphs: { char: string; signature: Uint8Array; box: { x: number; y: number; w: number; h: number }; fit: number }[] = [];
  for (let li = 0; li < letters.length; li++) {
    const ch = bestChars[li][fIdx];
    if (ch) glyphs.push({ char: ch, signature: letters[li].signature, box: letters[li].box, fit: 1 - bestFit[li][fIdx] });
  }
  return { glyphs, bestSlug, ranking };
}

function candidateCharSet(boxes: { x: number; y: number; w: number; h: number }[], typo: Typography, index: Index): Set<string> {
  const set = new Set<string>();
  for (const b of boxes) for (const c of candidateChars(b, typo, index)) set.add(c);
  return set;
}

// ---------------------------------------------------------------------------
// Whole-word rendering comparison (second pass)
// ---------------------------------------------------------------------------

// A word that cannot be split into letters (joined script / handwriting).
function isJoined(boxes: { x: number; y: number; w: number; h: number }[]): boolean {
  if (!boxes.length || Math.max(...boxes.map((b) => b.w / Math.max(1, b.h))) > 2) return true;
  if (boxes.length >= 3) {
    const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
    const med = heights[Math.floor(heights.length / 2)];
    if (Math.max(...heights) > med * 2) return true;
  }
  return false;
}

// Normalise a grayscale crop into a 64-row bitmap with a preserved aspect ratio.
interface RenderSpec {
  gray: Uint8Array;
  inkWidth: number;
}

function normalizeGray(src: Uint8ClampedArray, width: number, height: number): RenderSpec | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (src[y * width + x] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const inkWidth = Math.max(1, Math.round((w * 64) / h));
  if (inkWidth > 900) return null;
  const gray = new Uint8Array(64 * 900).fill(255);
  for (let gy = 0; gy < 64; gy++) {
    const y0 = minY + Math.floor((gy * h) / 64);
    const y1 = Math.max(minY + Math.floor(((gy + 1) * h) / 64), y0 + 1);
    for (let gx = 0; gx < inkWidth; gx++) {
      const x0 = minX + Math.floor((gx * w) / inkWidth);
      const x1 = Math.max(minX + Math.floor(((gx + 1) * w) / inkWidth), x0 + 1);
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          sum += src[y * width + x];
          count++;
        }
      }
      gray[gy * 900 + gx] = count ? Math.round(sum / count) : 255;
    }
  }
  return { gray, inkWidth };
}

function renderSimilarity(a: RenderSpec, b: RenderSpec): number {
  let total = 0;
  for (let i = 0; i < a.gray.length; i++) total += Math.abs(a.gray[i] - b.gray[i]);
  return 1 - total / (a.gray.length * 255);
}

function toGray(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i++) {
    const p = i * 4;
    const a = data[p + 3] / 255;
    out[i] = Math.round((0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * a + 255 * (1 - a));
  }
  return out;
}

// Load a set of fonts from Google Fonts, subsetted to the letters in the text.
async function loadFonts(families: string[], text: string, weights: number[] = [400], perChunk = 40): Promise<void> {
  const subset = encodeURIComponent([...new Set([...text])].join(""));
  const ws = [...new Set(weights)].sort((a, b) => a - b);
  const axis = ws.length > 1 || ws[0] !== 400 ? `:wght@${ws.join(";")}` : "";
  const chunks: string[][] = [];
  for (let i = 0; i < families.length; i += perChunk) chunks.push(families.slice(i, i + perChunk));
  await Promise.all(
    chunks.map(
      (chunk) =>
        new Promise<void>((resolve) => {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.dataset.rerank = "true";
          link.href = `https://fonts.googleapis.com/css2?` + chunk.map((f) => `family=${f.replace(/ /g, "+")}${axis}`).join("&") + `&text=${subset}&display=block`;
          link.onload = () => resolve();
          link.onerror = () => resolve();
          document.head.append(link);
        })
    )
  );
  await Promise.all(
    families.flatMap((f) => ws.map((w) => document.fonts.load(`${w} 140px "${f}"`, text).catch(() => [])))
  );
}

function renderWordToGray(ctx: CanvasRenderingContext2D, family: string, text: string, weight = 400): RenderSpec | null {
  const canvas = ctx.canvas;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${weight} 140px "${family}", monospace`;
  ctx.fillText(text, 20, 182);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return normalizeGray(toGray(img.data, canvas.width, canvas.height), canvas.width, canvas.height);
}

function minMaxNormalize(vals: number[]): (v: number) => number {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(max - min, 1e-9);
  return (v) => (v - min) / span;
}

interface Candidate {
  slug: string;
  family: string;
  category: string;
  shapeScore?: number;
  weight?: number;
}

// Re-render the top candidates and blend shape + render scores.
async function renderRank(
  reference: RenderSpec,
  candidates: Candidate[],
  text: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ slug: string; score: number; shapeScore: number | null; renderScore: number }[]> {
  const byWeight = new Map<number, string[]>();
  for (const c of candidates) {
    const w = c.weight ?? 400;
    if (!byWeight.has(w)) byWeight.set(w, []);
    byWeight.get(w)!.push(c.family);
  }
  await Promise.all([...byWeight].map(([w, fams]) => loadFonts(fams, text, [w])));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(600, 140 * text.length);
  canvas.height = 280;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rendered: { input: Candidate; render: RenderSpec }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const r = renderWordToGray(ctx, candidates[i].family, text, candidates[i].weight ?? 400);
    if (r) rendered.push({ input: candidates[i], render: r });
    if (i % 8 === 0) onProgress?.(i, candidates.length);
  }
  onProgress?.(candidates.length, candidates.length);
  if (!rendered.length) return [];
  const norm = minMaxNormalize(rendered.map((r) => renderSimilarity(reference, r.render)));
  const shapeVals = rendered.map((r) => r.input.shapeScore).filter((v): v is number => v !== undefined);
  const shapeNorm = shapeVals.length ? minMaxNormalize(shapeVals) : null;
  return rendered
    .map(({ input, render }) => {
      const rs = norm(renderSimilarity(reference, render));
      const ss = shapeNorm && input.shapeScore !== undefined ? shapeNorm(input.shapeScore) : null;
      return {
        slug: input.slug,
        score: ss === null ? rs : 0.5 * rs + 0.5 * ss,
        shapeScore: ss,
        renderScore: rs,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Index loading
// ---------------------------------------------------------------------------

let indexPromise: Promise<Index> | null = null;
function getIndex(): Promise<Index> {
  indexPromise ??= (async () => {
    try {
      const res = await fetch(`/signatures/manifest.json`);
      if (!res.ok) throw new Error(`the index returned ${res.status}`);
      return (await res.json()) as Index;
    } catch (e) {
      indexPromise = null;
      throw new Error(`Could not load the font index: ${errMsg(e)}`);
    }
  })();
  return indexPromise;
}

function errMsg(e: unknown): string {
  const cause = (e as { cause?: { message?: string } })?.cause?.message;
  const msg = e instanceof Error ? e.message : String(e);
  return cause ? `${msg || "request failed"} (${cause})` : msg || "request failed";
}

const GZIP = [31, 139];

async function fetchBytes(url: string): Promise<Uint8Array> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] !== GZIP[0] || bytes[1] !== GZIP[1]) return bytes;
    if (typeof DecompressionStream === "undefined") throw new Error("this browser has no DecompressionStream");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (e) {
    throw new Error(`Could not load the font data: ${errMsg(e)}`);
  }
}

// Buffer layout: char-major blocks of fonts.length * bytesPerGlyph bytes.
function decodeBlocks(bytes: Uint8Array, index: Index): Map<string, Uint8Array> {
  const perChar = index.fonts.length * index.bytesPerGlyph;
  const map = new Map<string, Uint8Array>();
  [...index.chars].forEach((c, i) => map.set(c, bytes.subarray(i * perChar, (i + 1) * perChar)));
  return map;
}

let weightsPromise: Promise<{ name: string; data: Map<string, Uint8Array> }[]> | null = null;
function getWeights(): Promise<{ name: string; data: Map<string, Uint8Array> }[]> {
  weightsPromise ??= (async () => {
    const index = await getIndex();
    const [all, bold] = await Promise.all([`/signatures/all.bin.gz`, `/signatures/bold.bin.gz`].map(async (u) => decodeBlocks(await fetchBytes(u), index)));
    return [
      { name: "regular", data: all },
      { name: "bold", data: bold },
    ];
  })().catch((e) => {
    weightsPromise = null;
    throw e;
  });
  return weightsPromise;
}

// ---------------------------------------------------------------------------
// Image pipeline
// ---------------------------------------------------------------------------

interface LoadedImage {
  image: { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };
  mask: Mask;
  words: Word[];
  primary: number;
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  source: { x: number; y: number; w: number; h: number };
}

// Scale the image so the crop fits within maxDim, then binarise + find words.
function processImage(img: HTMLImageElement, crop: { x: number; y: number; w: number; h: number } | null, maxDim = 1400): LoadedImage {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  const box = crop ?? { x: 0, y: 0, w: naturalW, h: naturalH };
  const scale = Math.min(maxDim / Math.max(box.w, box.h), 4);
  const w = Math.max(1, Math.round(box.w * scale));
  const h = Math.max(1, Math.round(box.h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  const mask = binarize(imageData.data, w, h);
  const words = findWords(mask);
  let primary = 0;
  words.forEach((word, i) => {
    if (word.ink > words[primary].ink) primary = i;
  });
  return {
    image: { data: imageData.data, width: w, height: h },
    mask,
    words,
    primary,
    naturalWidth: naturalW,
    naturalHeight: naturalH,
    scale,
    source: box,
  };
}

// ---------------------------------------------------------------------------
// Detection orchestration
// ---------------------------------------------------------------------------

interface DetectResult {
  fonts: {
    slug: string;
    family: string;
    category: string;
    confidence: number;
    rawScore: number;
    weight: string;
  }[];
  method: "shape+render" | "render";
  text: string;
  lettersUsed: number;
  boxes: { x: number; y: number; w: number; h: number }[];
  thinning: number;
}

// Read each letter of a word (classify) — returns array of chars, "" where unknown.
async function readLetters(word: Word): Promise<string[]> {
  if (isJoined(word.boxes)) return [];
  const index = await getIndex();
  const weights = await getWeights();
  const typo = estimateTypography(word.boxes);
  const candidateSet = candidateCharSet(word.boxes, typo, index);
  const regularOnly = new Map([...weights[0].data].filter(([c]) => candidateSet.has(c)));
  const classified = classifyLetters(
    index,
    regularOnly,
    word.signatures.map((sig, i) => ({ char: "", signature: sig, box: word.boxes[i] })),
    typo
  );
  if (classified) return classified.glyphs.map((g) => g.char);
  return word.boxes.map(() => "");
}

// Greyscale render of the cropped image region (for whole-word comparison).
function cropToGray(image: LoadedImage, boxes: { x: number; y: number; w: number; h: number }[]): RenderSpec | null {
  const { data, width, height } = image.image;
  if (boxes.length) {
    const covered = new Uint8Array(width * height);
    for (const b of boxes) {
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) covered[y * width + x] = 1;
      }
    }
    for (let i = 0; i < covered.length; i++) if (!covered[i]) data[i] = 255;
  }
  return normalizeGray(toGray(data, width, height), width, height);
}

function familyIndex(index: Index): Map<string, number> {
  return new Map(index.fonts.map((slug, i) => [slug, i]));
}

async function detect(
  loaded: LoadedImage,
  wordIndex: number,
  letters: string[],
  onProgress: (done: number, total: number) => void
): Promise<DetectResult> {
  const index = await getIndex();
  const weights = await getWeights();
  const word = loaded.words[wordIndex];
  const famMap = familyIndex(index);
  const makeFont = (slug: string, confidence: number, rawScore: number, weight: string) => ({
    slug,
    family: index.families[famMap.get(slug)!],
    category: index.categories[famMap.get(slug)!],
    confidence,
    rawScore,
    weight,
  });

  if (isJoined(word.boxes)) {
    const text = letters.join("");
    const ref = cropToGray(loaded, []);
    if (!text || !ref) return { fonts: [], method: "render", text, lettersUsed: 0, boxes: [], thinning: 0 };
    const candidates = index.fonts
      .map((slug, i) => ({ slug, family: index.families[i], category: index.categories[i] }))
      .filter((c) => c.category === "handwriting" || c.category === "display")
      .slice(0, 150);
    const ranked = await renderRank(ref, candidates, text, onProgress);
    const conf = confidence(ranked.map((r) => ({ slug: r.slug, score: r.score, lettersUsed: 0 })));
    return {
      fonts: ranked.slice(0, 60).map((r) => makeFont(r.slug, conf.get(r.slug) ?? 0, r.score, "regular")),
      method: "render",
      text,
      lettersUsed: 0,
      boxes: [],
      thinning: 0,
    };
  }

  const valid: number[] = [];
  letters.forEach((l, i) => {
    if (l && index.chars.includes(l) && word.boxes[i]) valid.push(i);
  });
  if (!valid.length) return { fonts: [], method: "shape+render", text: "", lettersUsed: 0, boxes: [], thinning: 0 };

  const text = valid.map((i) => letters[i]).join("");
  const usedSet = new Set(valid.map((i) => letters[i]));
  const filteredWeights = weights.map((w) => ({ name: w.name, data: new Map([...w.data].filter(([c]) => usedSet.has(c))) }));

  const scales = multiScaleSignatures(loaded.mask, word.boxes);
  let best: { slug: string; score: number; weight?: string }[] | null = null;
  let bestScale = 0;
  for (let si = 0; si < scales.length; si++) {
    const scaleSigs = scales[si];
    const letters2 = valid.map((i) => ({ char: letters[i], signature: scaleSigs[i], box: word.boxes[i] }));
    const ranked = rankAcrossWeights(index, filteredWeights, letters2);
    if (ranked.length && (!best || ranked[0].score > best[0].score)) {
      best = ranked;
      bestScale = si;
    }
  }
  if (!best) return { fonts: [], method: "shape+render", text, lettersUsed: 0, boxes: [], thinning: 0 };

  const weightBySlug = new Map(best.map((b) => [b.slug, b.weight ?? "regular"]));
  const top40 = best.slice(0, 40).map((b) => {
    const i = famMap.get(b.slug)!;
    return {
      slug: b.slug,
      family: index.families[i],
      category: index.categories[i],
      shapeScore: b.score,
      weight: b.weight === "bold" ? 700 : 400,
    };
  });

  const ref = cropToGray(loaded, valid.map((i) => word.boxes[i]));
  let combined: { slug: string; score: number }[];
  let renderOk = false;
  try {
    if (!ref) throw new Error("nothing to render against");
    const ranked = await renderRank(ref, top40, text, onProgress);
    renderOk = true;
    const rankedSet = new Set(ranked.map((r) => r.slug));
    combined = [
      ...ranked.map((r) => ({ slug: r.slug, score: r.score })),
      ...best.filter((b) => !rankedSet.has(b.slug)).map((b) => ({ slug: b.slug, score: -1 })),
    ];
  } catch {
    combined = best.map((b) => ({ slug: b.slug, score: b.score }));
  }
  const conf = confidence(combined.filter((c) => c.score >= 0).map((c) => ({ ...c, lettersUsed: valid.length })));
  return {
    fonts: combined.slice(0, 60).map((c) => makeFont(c.slug, conf.get(c.slug) ?? 0, c.score, weightBySlug.get(c.slug) ?? "regular")),
    method: renderOk ? "shape+render" : "shape+render",
    text,
    lettersUsed: valid.length,
    boxes: valid.map((i) => word.boxes[i]),
    thinning: bestScale,
  };
}

export type { LoadedImage, DetectResult };
export { getIndex, processImage, readLetters, detect, isJoined, CHARS };

// ---------------------------------------------------------------------------
// Rotation + perspective correction (applied client-side to the source image)
// ---------------------------------------------------------------------------

export interface QuadPoint {
  x: number;
  y: number;
}

// Render an image onto a canvas rotated by `deg` degrees about its centre,
// sized so the whole image remains visible.
export function rotateImageToCanvas(img: HTMLImageElement, deg: number): HTMLCanvasElement {
  const rad = (deg * Math.PI) / 180;
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  if (Math.abs(deg % 360) < 0.001) {
    const flat = document.createElement("canvas");
    flat.width = W;
    flat.height = H;
    flat.getContext("2d")!.drawImage(img, 0, 0);
    return flat;
  }
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.max(1, Math.ceil(W * cos + H * sin));
  const nh = Math.max(1, Math.ceil(W * sin + H * cos));
  const canvas = document.createElement("canvas");
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(nw / 2, nh / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -W / 2, -H / 2);
  return canvas;
}

// Warp a source canvas so the given convex quad (in source pixel space) is
// stretched to fill the full rectangle. Uses forward bilinear mapping:
// output(x,y) -> (u,v) = (x/W, y/H) -> bilinear(quad, u, v) sampled from source.
export function warpQuadToRect(src: HTMLCanvasElement, quad: QuadPoint[]): HTMLCanvasElement {
  const W = src.width;
  const H = src.height;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const octx = out.getContext("2d")!;
  const img = octx.createImageData(W, H);
  const sctx = src.getContext("2d")!;
  const sdata = sctx.getImageData(0, 0, W, H).data;

  const [p0, p1, p2, p3] = quad;
  const ax = p1.x - p0.x, ay = p1.y - p0.y;
  const bx = p3.x - p0.x, by = p3.y - p0.y;
  const cx = p0.x - p1.x + p2.x - p3.x, cy = p0.y - p1.y + p2.y - p3.y;

  const outData = img.data;
  const invW = 1 / Math.max(1, W - 1);
  const invH = 1 / Math.max(1, H - 1);

  for (let y = 0; y < H; y++) {
    const v = y * invH;
    const omv = 1 - v;
    for (let x = 0; x < W; x++) {
      const u = x * invW;
      // bilinear position in source space
      const sx = (1 - u) * (omv * p0.x + v * p3.x) + u * (omv * p1.x + v * p2.x);
      const sy = (1 - u) * (omv * p0.y + v * p3.y) + u * (omv * p1.y + v * p2.y);
      // clamp + nearest sample (bilinear sampling below)
      const fx = Math.max(0, Math.min(W - 1, sx));
      const fy = Math.max(0, Math.min(H - 1, sy));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(W - 1, x0 + 1);
      const y1 = Math.min(H - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const o = (y * W + x) * 4;
      for (let c = 0; c < 4; c++) {
        const i00 = (y0 * W + x0) * 4 + c;
        const i10 = (y0 * W + x1) * 4 + c;
        const i01 = (y1 * W + x0) * 4 + c;
        const i11 = (y1 * W + x1) * 4 + c;
        const top = sdata[i00] * (1 - tx) + sdata[i10] * tx;
        const bot = sdata[i01] * (1 - tx) + sdata[i11] * tx;
        outData[o + c] = top * (1 - ty) + bot * ty;
      }
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}