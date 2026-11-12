import type { BBox, ProductKind } from "./types";

export type Theme =
  | "wetland"
  | "fire"
  | "farming"
  | "subsidence"
  | "volcano"
  | "earthquake"
  | "ice"
  | "forest"
  | "water";

/**
 * General guidance for reading NASA previews of each theme. These are textbook
 * radar behaviours, not findings about any particular image, and the interface
 * labels them as hypotheses.
 */
export const themeGuide: Record<Theme, { label: string; look: string }> = {
  wetland: {
    label: "Wetland and flooding",
    look: "Open water is dark in both HH and HV. Flooded vegetation can turn very bright in HH, because radar bounces between water and stems. Darkening that spreads between dates suggests new open water.",
  },
  fire: {
    label: "Fire-prone forest",
    look: "Burned canopy usually loses HV brightness, because HV responds to the volume of leaves and branches. Compare a date before and after the fire season.",
  },
  farming: {
    label: "Farming",
    look: "Fields change from date to date as they are ploughed, irrigated and harvested. In backscatter, field patches brighten and darken; in interferograms, worked fields turn grainy.",
  },
  subsidence: {
    label: "Sinking ground",
    look: "In an interferogram, a bullseye of colour bands over a city or basin can mean the ground is sinking. One full colour cycle is about 12 cm of motion toward or away from the satellite.",
  },
  volcano: {
    label: "Volcano",
    look: "Concentric colour bands around a summit can mean the ground inflated or deflated as magma moved. Broad, smooth bands are often atmosphere instead.",
  },
  earthquake: {
    label: "Earthquake",
    look: "Dense colour bands that stop along a line can mark a fault that slipped between the two dates.",
  },
  ice: {
    label: "Ice and glaciers",
    look: "Tight colour bands or a grainy texture over a glacier usually mean fast flow. Backscatter shows crevasse fields and the edge of open water.",
  },
  forest: {
    label: "Forest change",
    look: "Cleared forest loses HV brightness. Straight-edged dark patches appearing between dates are typical of clearing.",
  },
  water: {
    label: "Water and coasts",
    look: "Water is dark in backscatter unless wind roughens it. Compare dates to see shorelines move, lakes shrink or floods spread.",
  },
};

export interface Preset {
  id: string;
  name: string;
  region: string;
  theme: Theme;
  /** Short description of why this place matters. */
  why: string;
  bbox: BBox;
  /** Product family to show first. */
  kind: ProductKind;
  /** Catalog counts on 12 November 2026 (products touching the box, all dates). */
  counts?: { GUNW: number; GCOV: number };
  /** id of a NASA quick-look in evidence/quicklooks, when one exists for this place. */
  quicklook?: string;
}

/** Date of the product counts below. */
export const COUNTS_DATE = "2026-11-12";

const around = (lon: number, lat: number, r = 0.5): BBox => [lon - r, lat - r, lon + r, lat + r];

/**
 * Sample places: the 14 areas counted in NASA's catalog on 12 November 2026,
 * plus the places of NASA's quick-look gallery, as one list.
 */
export const presets: Preset[] = [
  {
    id: "okavango",
    name: "Okavango Delta",
    region: "Botswana",
    theme: "wetland",
    why: "An inland delta whose flood pulse arrives in the dry season.",
    bbox: [22.4, -19.6, 23.4, -18.6],
    kind: "GCOV",
    counts: { GUNW: 28, GCOV: 31 },
  },
  {
    id: "pantanal",
    name: "Pantanal",
    region: "Brazil",
    theme: "wetland",
    why: "The world's largest tropical wetland: seasonal floods and dry-season fires.",
    bbox: [-57.5, -18.5, -56.5, -17.5],
    kind: "GCOV",
    counts: { GUNW: 64, GCOV: 72 },
  },
  {
    id: "sundarbans",
    name: "Sundarbans",
    region: "Bangladesh / India",
    theme: "wetland",
    why: "Mangrove forest on the Ganges–Brahmaputra delta, exposed to storm floods.",
    bbox: [88.6, 21.6, 89.6, 22.4],
    kind: "GCOV",
    counts: { GUNW: 58, GCOV: 72 },
  },
  {
    id: "everglades",
    name: "Everglades",
    region: "Florida, United States",
    theme: "wetland",
    why: "A managed wetland where water levels are watched closely.",
    bbox: [-81.2, 25.4, -80.4, 26.2],
    kind: "GCOV",
    counts: { GUNW: 125, GCOV: 149 },
  },
  {
    id: "mekong",
    name: "Mekong Delta",
    region: "Vietnam",
    theme: "farming",
    why: "Rice paddies on a delta that is sinking and losing sediment.",
    bbox: [105.2, 9.6, 106.2, 10.4],
    kind: "GCOV",
    counts: { GUNW: 85, GCOV: 95 },
  },
  {
    id: "jakarta",
    name: "Jakarta",
    region: "Indonesia",
    theme: "subsidence",
    why: "One of the fastest-sinking cities on Earth, from groundwater pumping.",
    bbox: [106.6, -6.4, 107.1, -6.0],
    kind: "GUNW",
    counts: { GUNW: 50, GCOV: 56 },
  },
  {
    id: "punjab",
    name: "Punjab",
    region: "India",
    theme: "farming",
    why: "Rice and wheat rotation that depends heavily on groundwater.",
    bbox: [74.6, 30.8, 75.6, 31.6],
    kind: "GCOV",
    counts: { GUNW: 83, GCOV: 95 },
  },
  {
    id: "nile-delta",
    name: "Nile Delta",
    region: "Egypt",
    theme: "farming",
    why: "Intensive farming on a low coast at risk from the sea.",
    bbox: [30.5, 30.6, 31.5, 31.4],
    kind: "GCOV",
    counts: { GUNW: 39, GCOV: 44 },
  },
  {
    id: "chao-phraya",
    name: "Chao Phraya",
    region: "Thailand",
    theme: "subsidence",
    why: "Rice farming around Bangkok, a city that has sunk for decades.",
    bbox: [100.2, 13.4, 100.9, 14.0],
    kind: "GUNW",
    counts: { GUNW: 47, GCOV: 54 },
  },
  {
    id: "kamchatka",
    name: "Kamchatka",
    region: "Russia",
    theme: "volcano",
    why: "A chain of active volcanoes on a fast-moving subduction zone.",
    bbox: [158.0, 53.0, 160.0, 54.5],
    kind: "GUNW",
    counts: { GUNW: 119, GCOV: 134 },
  },
  {
    id: "reykjanes",
    name: "Reykjanes Peninsula",
    region: "Iceland",
    theme: "volcano",
    why: "Repeated eruptions since 2021, with the ground rising between them.",
    bbox: [-22.5, 63.7, -21.9, 64.0],
    kind: "GUNW",
    counts: { GUNW: 87, GCOV: 93 },
    quicklook: "reykjanes",
  },
  {
    id: "west-greenland",
    name: "West Greenland",
    region: "Greenland",
    theme: "ice",
    why: "Sermeq Kujalleq (Jakobshavn), one of the fastest glaciers on Earth.",
    bbox: [-50.0, 69.0, -48.0, 69.5],
    kind: "GCOV",
    counts: { GUNW: 68, GCOV: 76 },
    quicklook: "jakobshavn",
  },
  {
    id: "northern-california",
    name: "Northern California forest",
    region: "California, United States",
    theme: "fire",
    why: "Forests that burn often, near towns.",
    bbox: [-122.6, 39.6, -121.4, 40.4],
    kind: "GCOV",
    counts: { GUNW: 127, GCOV: 138 },
  },
  {
    id: "manitoba",
    name: "Southern Manitoba",
    region: "Canada",
    theme: "wetland",
    why: "Boreal wetlands and the Red River's spring floods.",
    bbox: [-98.5, 50.0, -97.0, 51.0],
    kind: "GCOV",
    counts: { GUNW: 68, GCOV: 77 },
  },
  // Places from NASA's quick-look gallery (counts not taken).
  { id: "etna", name: "Mount Etna", region: "Italy", theme: "volcano", why: "Europe's most active volcano.", bbox: around(14.99, 37.75, 0.3), kind: "GUNW", quicklook: "etna" },
  { id: "kilauea", name: "Kīlauea", region: "Hawaiʻi, United States", theme: "volcano", why: "A frequently erupting shield volcano.", bbox: around(-155.28, 19.41, 0.3), kind: "GUNW", quicklook: "kilauea" },
  { id: "pine-island", name: "Pine Island Glacier", region: "Antarctica", theme: "ice", why: "A fast-thinning glacier draining West Antarctica.", bbox: around(-100.0, -75.2), kind: "GCOV", quicklook: "pine-island" },
  { id: "mexico-city", name: "Mexico City", region: "Mexico", theme: "subsidence", why: "A city sinking tens of centimetres a year in places.", bbox: around(-99.13, 19.43, 0.3), kind: "GUNW", quicklook: "mexico-city" },
  { id: "tehran", name: "Tehran plain", region: "Iran", theme: "subsidence", why: "Farmland and suburbs sinking from groundwater loss.", bbox: around(51.2, 35.55, 0.4), kind: "GUNW", quicklook: "tehran" },
  { id: "aral-sea", name: "Aral Sea", region: "Kazakhstan / Uzbekistan", theme: "water", why: "Once the fourth-largest lake; most of it has dried out.", bbox: around(59.8, 45.2), kind: "GCOV", quicklook: "aral-sea" },
  { id: "fergana", name: "Fergana Valley", region: "Uzbekistan / Kyrgyzstan / Tajikistan", theme: "farming", why: "Central Asia's most densely farmed valley, irrigated by canals.", bbox: around(71.6, 40.6), kind: "GCOV", quicklook: "fergana" },
  { id: "bengal-delta", name: "Ganges–Brahmaputra delta", region: "Bangladesh", theme: "water", why: "Rivers that shift and flood across one of the world's largest deltas.", bbox: around(90.0, 23.4), kind: "GCOV", quicklook: "bengal-delta" },
  { id: "rondonia", name: "Rondônia", region: "Brazil", theme: "forest", why: "A frontier of Amazon forest clearing.", bbox: around(-63.0, -10.0), kind: "GCOV", quicklook: "rondonia" },
  { id: "venice", name: "Venice lagoon", region: "Italy", theme: "subsidence", why: "A city slowly sinking into its lagoon.", bbox: around(12.33, 45.44, 0.3), kind: "GUNW", quicklook: "venice" },
];

export const presetById = (id: string | null | undefined) => presets.find((p) => p.id === id);
