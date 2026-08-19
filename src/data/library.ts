import fontsJson from "./generated/fonts.json";
import { commercialFor } from "./commercial";

export interface Measures {
  xHeight: number;
  stemWeight: number;
  contrast: number;
  letterWidth: number;
}

export interface FontRecord {
  slug: string;
  family: string;
  category: string;
  weights: number[];
  italic: boolean;
  variable: boolean;
  scripts: string[];
  designers: string[];
  added: string;
  popularity: number | null;
  size: number | null;
  weightLabel: string;
  measures: Measures;
}

export const fonts: FontRecord[] = (fontsJson as { fonts: FontRecord[] }).fonts;
export const COUNT = (fontsJson as { count: number }).count;

const bySlug = new Map(fonts.map((f) => [f.slug, f]));

export function fontBySlug(slug: string): FontRecord | undefined {
  return bySlug.get(slug);
}

export function variantsLabel(f: FontRecord): string {
  return f.weightLabel;
}

export function categoryLabel(category: string): string {
  const map: Record<string, string> = {
    "sans-serif": "Sans-serif",
    serif: "Serif",
    display: "Display",
    handwriting: "Handwriting",
    monospace: "Monospace",
  };
  return map[category] ?? category;
}

export function contrastLabel(v: number): string {
  if (v < 0.25) return "Low";
  if (v < 0.55) return "Medium";
  return "High";
}

export function widthLabel(v: number): string {
  if (v < 0.85) return "Condensed";
  if (v > 1.15) return "Expanded";
  return "Normal";
}

export function xHeightLabel(v: number): string {
  if (v < 0.66) return "Low";
  if (v > 0.78) return "High";
  return "Medium";
}

// ---- similar faces: nearest by measured shape (normalised euclidean distance)
function normScale(key: keyof Measures): [number, number] {
  const vals = fonts.map((f) => f.measures[key]).filter((v) => Number.isFinite(v));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return [min, Math.max(max - min, 1e-6)];
}
const SCALES: Record<keyof Measures, [number, number]> = {
  contrast: normScale("contrast"),
  letterWidth: normScale("letterWidth"),
  xHeight: normScale("xHeight"),
  stemWeight: normScale("stemWeight"),
};

function norm(key: keyof Measures, v: number): number {
  const [min, span] = SCALES[key];
  return (v - min) / span;
}

export function similarFonts(slug: string, limit = 6): FontRecord[] {
  const self = bySlug.get(slug);
  if (!self) return [];
  const scored = fonts
    .map((f) => {
      if (f.slug === slug) return null;
      let d =
        Math.abs(norm("contrast", f.measures.contrast) - norm("contrast", self.measures.contrast)) * 1.2 +
        Math.abs(norm("letterWidth", f.measures.letterWidth) - norm("letterWidth", self.measures.letterWidth)) * 1.0 +
        Math.abs(norm("xHeight", f.measures.xHeight) - norm("xHeight", self.measures.xHeight)) * 1.0 +
        Math.abs(norm("stemWeight", f.measures.stemWeight) - norm("stemWeight", self.measures.stemWeight)) * 1.2;
      if (f.category === self.category) d *= 0.6;
      return { f, d };
    })
    .filter(Boolean) as { f: FontRecord; d: number }[];
  scored.sort((a, b) => a.d - b.d);
  return scored.slice(0, limit).map((s) => s.f);
}

// ---- pairings: curated cross-category companions
const PAIR_SANS = ["roboto-slab", "merriweather", "lora", "playfair-display", "source-serif-4", "bitter", "newsreader", "eb-garamond", "dm-serif-display", "crimson-pro"];
const PAIR_SERIF = ["inter", "open-sans", "source-sans-3", "roboto", "lato", "work-sans", "ibm-plex-sans", "dm-sans", "figtree", "hanken-grotesk"];

export function pairings(f: FontRecord, limit = 3): FontRecord[] {
  const pool = f.category === "serif" ? PAIR_SERIF : PAIR_SANS;
  const list = pool
    .map((s) => bySlug.get(s))
    .filter((x): x is FontRecord => !!x && x.slug !== f.slug)
    .sort((a, b) => (b.popularity ?? 999) - (a.popularity ?? 999));
  return list.slice(0, limit);
}

// ---- free alternatives / commercial look-alikes
export function commercialLookalikes(slug: string) {
  return commercialFor(slug);
}

export function popularByCategory(category: string, limit = 40): FontRecord[] {
  return fonts
    .filter((f) => f.category === category)
    .sort((a, b) => (a.popularity ?? 9999) - (b.popularity ?? 9999))
    .slice(0, limit);
}

export function featuredFonts(limit = 12): FontRecord[] {
  return [...fonts]
    .sort((a, b) => (a.popularity ?? 9999) - (b.popularity ?? 9999))
    .slice(0, limit);
}

export const CATEGORY_COUNTS: Record<string, number> = {
  "sans-serif": fonts.filter((f) => f.category === "sans-serif").length,
  serif: fonts.filter((f) => f.category === "serif").length,
  display: fonts.filter((f) => f.category === "display").length,
  handwriting: fonts.filter((f) => f.category === "handwriting").length,
  monospace: fonts.filter((f) => f.category === "monospace").length,
};

export function googleFontsCssUrl(f: FontRecord): string {
  const name = f.family.replace(/ /g, "+");
  const hasWght = f.weights.length > 0 && f.weights.some((w) => w !== 400) && f.weights.length > 1;
  return `https://fonts.googleapis.com/css2?family=${name}${hasWght ? `:wght@${f.weights.slice(0, 4).join(";")}` : ""}${f.italic ? ";ital@1" : ""}&display=swap`;
}

export function specimenUrl(f: FontRecord): string {
  return `https://fonts.google.com/specimen/${f.family.replace(/ /g, "+")}`;
}