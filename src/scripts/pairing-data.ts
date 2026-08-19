// Client-side pairing recommendations, mirroring src/data/library.ts pairings().
// Used to suggest complementary body/heading fonts directly in detector results.

export const PAIR_SANS = [
  "roboto-slab",
  "merriweather",
  "lora",
  "playfair-display",
  "source-serif-4",
  "bitter",
  "newsreader",
  "eb-garamond",
  "dm-serif-display",
  "crimson-pro",
];

export const PAIR_SERIF = [
  "inter",
  "open-sans",
  "source-sans-3",
  "roboto",
  "lato",
  "work-sans",
  "ibm-plex-sans",
  "dm-sans",
  "figtree",
  "hanken-grotesk",
];

export function pairingSlugs(fontSlug: string, category: string): string[] {
  const pool = category === "serif" ? PAIR_SERIF : PAIR_SANS;
  return pool.filter((s) => s !== fontSlug);
}

export function pairingLabel(category: string): string {
  return category === "serif" ? "Pairs well with (sans-serif)" : "Pairs well with (serif)";
}