/**
 * The TerraShift team, in the order given by the team. Names and roles only, plus a portrait
 * where the team supplied one (files in public/team). Nothing else is published about anyone.
 */
export interface Member {
  name: string;
  role: string;
  /** Path under public/, when a portrait was supplied. */
  photo?: string;
}

export const team: Member[] = [
  { name: "Sharifjon Farmonov", role: "Product Manager" },
  { name: "Sardorbek Komilov", role: "Backend Developer" },
  { name: "Nurjahon Shodiyev", role: "Frontend Developer", photo: "team/nurjahon-shodiyev.webp" },
  { name: "Jahongir Karimov", role: "Data Analyst & Researcher" },
  { name: "Temurbek Tolibov", role: "UX/UI Designer" },
  { name: "Amiriddin Ramazonov", role: "Spokesman" },
];

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
