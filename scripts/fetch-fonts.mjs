// Fetches the full Google Fonts catalogue metadata (used by fonts.google.com itself)
// and writes it to src/data/generated/fonts-metadata.json
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/data/generated/fonts-metadata.json", import.meta.url));

const res = await fetch("https://fonts.google.com/metadata/fonts", {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
});
if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`);
const text = await res.text();
const json = JSON.parse(text.replace(/^\)\]\}'/, ""));

const list = json.familyMetadataList;
console.log(`Fetched ${list.length} families`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(list));

const visible = list.filter((f) => f.visibility === "Production");
console.log(`Production/visible families: ${visible.length}`);
