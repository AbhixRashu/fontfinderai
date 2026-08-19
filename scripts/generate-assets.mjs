// Generate favicons and the Open Graph image from SVG sources.
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const faviconSvg = await readFile("public/favicon.svg");

const sizes = [
  { name: "favicon-96x96.png", size: 96 },
  { name: "favicon-192x192.png", size: 192 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "favicon-16x16.png", size: 16 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(faviconSvg).resize(size, size).png().toFile(`public/${name}`);
  console.log(`generated ${name}`);
}

await sharp(faviconSvg).resize(32, 32).png().toFile("public/favicon.ico");
console.log("generated favicon.ico");

// Open Graph card (1200x630)
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogGrad" x1="0" y1="0" x2="1200" y2="630" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="0.55" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#8b5cf6"/>
    </linearGradient>
    <radialGradient id="ogGlow" cx="0.5" cy="0.42" r="0.6">
      <stop offset="0" stop-color="rgba(99,102,241,0.28)"/>
      <stop offset="1" stop-color="rgba(8,8,12,0)"/>
    </radialGradient>
    <linearGradient id="ogText" x1="0" y1="0" x2="620" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#22d3ee"/>
      <stop offset="1" stop-color="#a5b4fc"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="#08080c"/>
  <rect width="1200" height="630" fill="url(#ogGlow)"/>
  <circle cx="1100" cy="130" r="3.5" fill="#22d3ee"/>
  <circle cx="1130" cy="150" r="2.5" fill="#6366f1"/>
  <circle cx="1095" cy="160" r="2.5" fill="#8b5cf6"/>

  <g stroke="url(#ogGrad)" fill="none">
    <circle cx="232" cy="232" r="120" stroke-width="22"/>
    <circle cx="232" cy="232" r="120" stroke-width="6" fill="rgba(99,102,241,0.12)"/>
    <path d="M168 288 L232 162 L296 288 M198 254 H266" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M316 316 L436 436" stroke-width="30" stroke-linecap="round"/>
    <path d="M118 118 L232 232 M344 118 L232 232 M118 344 L232 232" stroke-width="4" stroke-dasharray="8 12" opacity="0.7"/>
    <circle cx="104" cy="104" r="13" fill="#22d3ee" stroke="none"/>
    <circle cx="356" cy="106" r="13" fill="#22d3ee" stroke="none"/>
    <circle cx="104" cy="354" r="13" fill="#8b5cf6" stroke="none"/>
    <circle cx="356" cy="352" r="11" fill="#6366f1" stroke="none"/>
  </g>

  <text x="512" y="238" font-family="'Plus Jakarta Sans','Segoe UI',system-ui,sans-serif" font-size="104" font-weight="800" fill="url(#ogText)">FontFinder AI</text>
  <text x="512" y="322" font-family="Inter, system-ui, sans-serif" font-size="44" fill="#c4c4d0">Identify any font from a picture</text>
  <rect x="512" y="370" width="120" height="8" rx="4" fill="url(#ogGrad)"/>
  <text x="512" y="512" font-family="Inter, system-ui, sans-serif" font-size="34" fill="#8b8b99">1,935 free fonts indexed · free alternatives to paid type</text>
  <text x="512" y="566" font-family="Inter, system-ui, sans-serif" font-size="30" fill="#5f5f6e">100% in your browser · copy-paste CSS for every match</text>
</svg>
`;

await sharp(Buffer.from(ogSvg)).png().toFile("public/og.png");
console.log("generated og.png");
