// Builds src/data/generated/fonts.json — the full library used by the site.
//
// Sources:
//   - public/signatures/manifest.json   (the 1,935-font matching index)
//   - src/data/generated/fonts-metadata.json  (Google Fonts catalogue metadata)
//   - real font files (subsetted TTFs from fonts.gstatic.com), cached locally
//     in src/data/.cache/fonts/ and measured with measure.mjs
//
// Usage: node scripts/build-data.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import { measureFont } from "./measure.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const CACHE = join(ROOT, "src", "data", ".cache", "fonts");
const OUT = join(ROOT, "src", "data", "generated", "fonts.json");
const MEASURES_OUT = join(ROOT, "src", "data", "generated", "measurements.json");
mkdirSync(CACHE, { recursive: true });

const manifest = JSON.parse(readFileSync(join(ROOT, "public", "signatures", "manifest.json"), "utf8"));
const metadata = JSON.parse(readFileSync(join(ROOT, "src", "data", "generated", "fonts-metadata.json"), "utf8"));

const metaByFamily = new Map(metadata.map((m) => [m.family.toLowerCase(), m]));
const TEXT = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const UA = "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0)";

const pool = [];
async function getCssUrl(family) {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${TEXT}&display=block`;
  const res = await fetch(cssUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const css = await res.text();
  const m = css.match(/url\((https:\/\/[^)]+)\) format\('truetype'\)/);
  return m ? m[1] : null;
}

async function ensureFontFile(slug, family) {
  const file = join(CACHE, `${slug}.ttf`);
  if (existsSync(file)) return file;
  const url = await getCssUrl(family);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4000) return null;
  writeFileSync(file, buf);
  return file;
}

async function measure(file) {
  const buf = readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return measureFont(font);
}

function weightsInfo(fontMeta) {
  const keys = Object.keys(fontMeta?.fonts ?? {});
  const nums = new Set();
  let italic = false;
  for (const k of keys) {
    const n = parseInt(k, 10);
    if (!isNaN(n)) nums.add(n);
    if (/i$/.test(k)) italic = true;
  }
  const weights = [...nums].sort((a, b) => a - b);
  const variable = Array.isArray(fontMeta?.axes) && fontMeta.axes.length > 0;
  return { weights, italic, variable };
}

function scriptsFor(fontMeta) {
  const ignore = new Set(["menu"]);
  const s = (fontMeta?.subsets ?? []).filter((x) => !ignore.has(x));
  if (!s.length) return ["latin"];
  return s;
}

function displayWeight(n) {
  if (n < 300) return "Light";
  if (n === 300) return "Light";
  if (n === 400) return "Regular";
  if (n === 500) return "Medium";
  if (n === 600) return "SemiBold";
  if (n === 700) return "Bold";
  return "ExtraBold";
}

function variantsLabel(weights, italic, variable) {
  const parts = [];
  if (weights.length) parts.push(`${weights.length} weight${weights.length > 1 ? "s" : ""}`);
  if (italic) parts.push("italic");
  if (variable) parts.push("variable");
  return parts.join(" · ");
}

async function main() {
  const existing = {};
  if (existsSync(MEASURES_OUT)) {
    Object.assign(existing, JSON.parse(readFileSync(MEASURES_OUT, "utf8")));
  }
  const fonts = [];
  const failed = [];

  const entries = manifest.fonts.map((slug, i) => ({
    slug,
    family: manifest.families[i],
    category: manifest.categories[i],
  }));

  // ---- download font files concurrently
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const idx = cursor++;
      const e = entries[idx];
      if (e.slug in existing) continue;
      try {
        await ensureFontFile(e.slug, e.family);
      } catch {
        /* keep going */
      }
    }
  }
  await Promise.all(Array.from({ length: 12 }, worker));

  // ---- measure
  const measurements = { ...existing };
  for (const e of entries) {
    if (!(e.slug in measurements)) {
      const file = join(CACHE, `${e.slug}.ttf`);
      try {
        if (existsSync(file)) {
          measurements[e.slug] = await measure(file);
        } else {
          failed.push(e.slug);
        }
      } catch {
        failed.push(e.slug);
      }
      if (entries.indexOf(e) % 100 === 0) {
        console.log(`measured ${Object.keys(measurements).length}/${entries.length}`);
        writeFileSync(MEASURES_OUT, JSON.stringify(measurements));
      }
    }
  }
  writeFileSync(MEASURES_OUT, JSON.stringify(measurements));

  // ---- assemble
  const SCALE = 3.35 / 2.1; // stem measurements were stored with the old constant
  const byCat = {};
  for (const e of entries) {
    const m = measurements[e.slug];
    if (m) (byCat[e.category] ??= []).push(m);
  }
  const fallbacks = {};
  for (const [cat, arr] of Object.entries(byCat)) {
    const avg = (k) => Math.round(arr.reduce((s, m) => s + m[k], 0) / arr.length * 1000) / 1000;
    fallbacks[cat] = {
      xHeight: avg("xHeight"),
      stemWeight: Math.round(avg("stemWeight") * SCALE * 1000) / 1000,
      contrast: avg("contrast"),
      letterWidth: avg("letterWidth"),
    };
  }
  const finalMeasures = (category, m) =>
    m
      ? { ...m, stemWeight: Math.round(m.stemWeight * SCALE * 1000) / 1000 }
      : fallbacks[category];

  for (const e of entries) {
    const meta = metaByFamily.get(e.family.toLowerCase());
    const { weights, italic, variable } = weightsInfo(meta);
    const m = measurements[e.slug];
    fonts.push({
      slug: e.slug,
      family: e.family,
      category: e.category,
      weights,
      italic,
      variable,
      scripts: scriptsFor(meta),
      designers: (meta?.designers ?? []).slice(0, 3),
      added: meta?.dateAdded ?? "",
      popularity: meta?.popularity ?? null,
      size: meta?.size ?? null,
      weightLabel: variantsLabel(weights, italic, variable),
      measures: finalMeasures(e.category, m),
    });
  }

  const out = { count: fonts.length, fonts };
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`Wrote ${fonts.length} fonts. Measured: ${Object.keys(measurements).length}, failed: ${failed.length}`);
  if (failed.length) console.log("failed:", failed.slice(0, 20).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
