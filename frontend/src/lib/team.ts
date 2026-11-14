/**
 * The TerraShift team, in the order given by the team. Names and roles only, plus a portrait
 * supplied by the team (files in public/team). Nothing else is published about anyone.
 */
export interface Member {
  name: string;
  role: string;
  /** Path under public/, when a portrait was supplied. */
  photo?: string;
}

export const team: Member[] = [
  { name: "Sharifjon Farmonov", role: "Product Manager", photo: "team/sharifjon-farmonov.webp" },
  { name: "Sardorbek Komilov", role: "Backend Developer", photo: "team/sardorbek-komilov.webp" },
  { name: "Nurjahon Shodiyev", role: "Frontend Developer", photo: "team/nurjahon-shodiyev.webp" },
  { name: "Jahongir Karimov", role: "Data Analyst & Researcher", photo: "team/jahongir-karimov.webp" },
  { name: "Temurbek Tolibov", role: "UX/UI Designer", photo: "team/temurbek-tolibov.webp" },
  { name: "Amiriddin Ramazonov", role: "Spokesman", photo: "team/amiriddin-ramazonov.webp" },
];

/**
 * NASA Space Apps asks teams to acknowledge where AI tools were used. Code, tests and
 * documentation were written with the help of an AI assistant at the team's direction.
 * Radar maps and previews on the site come from NASA data and imagery.
 */
export const AI_ASSISTANCE =
  "AI assistance: the code, tests and documentation of TerraShift were written with the help of an AI assistant (Claude, by Anthropic) at the team’s direction. Radar maps and previews come from NASA data and imagery, not from AI image generation.";

export const INDEPENDENCE =
  "TerraShift is an independent NASA Space Apps 2026 project. No endorsement by NASA, ISRO or any institution is implied.";

/**
 * Data and tools the site uses, with the terms recorded in public/THIRD_PARTY_NOTICES.md.
 * Where that file records no licence (NASA CMR, NASA GIBS, USGS), the terms are left empty
 * rather than guessed.
 */
export const credits: { source: string; use: string; terms: string }[] = [
  {
    source: "NASA–ISRO NISAR data via the ASF DAAC",
    use: "Radar products and NASA's preview images",
    terms: "NISAR product metadata and data: NASA / ISRO / ASF.",
  },
  { source: "NASA CMR (Common Metadata Repository)", use: "Live search of NISAR products", terms: "" },
  { source: "NASA GIBS", use: "Optical (MODIS Terra) imagery of the radar's day", terms: "" },
  {
    source: "Nevada Geodetic Laboratory",
    use: "Independent GNSS station positions",
    terms: "Independent GNSS: Nevada Geodetic Laboratory.",
  },
  { source: "USGS", use: "Earthquake epicentres and catalog checks", terms: "" },
  {
    source: "OpenStreetMap / Photon",
    use: "Place search and map context",
    terms: "OpenStreetMap data; see openstreetmap.org/copyright.",
  },
  {
    source: "Esri World Imagery and World Topo Map",
    use: "Satellite and terrain basemaps",
    terms: "Context tile services with on-map attribution.",
  },
];
