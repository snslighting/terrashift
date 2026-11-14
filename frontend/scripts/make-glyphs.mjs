// Builds the map's label font (SDF glyph files MapLibre needs to draw text) from DM Sans,
// the site's own body font (SIL Open Font License 1.1). Run from frontend/ once after
// changing the label data; the output is committed, so the site never fetches fonts for the map.
//
//   npm i --no-save maplibre-font-maker-node@0.5.0 @fontsource/dm-sans@5.3.0
//   node scripts/make-glyphs.mjs
//
// Ranges: Latin, Latin Extended A/B, Latin Extended Additional (Vietnamese) and punctuation:
// every character in public/geo/places.json and rivers.json (checked by mapLabels.test.ts).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { generateGlyphPbfFiles, range256 } from "maplibre-font-maker-node";

export const RANGES = [0, 256, 512, 7680, 8192];
const files = "node_modules/@fontsource/dm-sans/files";
const stacks = [
  ["DM Sans Regular", "400-normal"],
  ["DM Sans SemiBold", "600-normal"],
  ["DM Sans Italic", "400-italic"],
];
for (const [fontstack, style] of stacks) {
  const fonts = ["latin", "latin-ext"].map((subset) => ({
    name: `${fontstack} ${subset}`,
    bytes: readFileSync(`${files}/dm-sans-${subset}-${style}.woff2`),
  }));
  const out = await generateGlyphPbfFiles({ fontstack, fonts, ranges: RANGES.map(range256) });
  for (const f of out) {
    const path = `public/glyphs/${f.filename}`;
    mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
    writeFileSync(path, f.bytes);
    console.log(path, f.bytes.length);
  }
}
