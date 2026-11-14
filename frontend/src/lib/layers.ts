import type { LayerEntry, LayerKind, StudyCase } from "./types";

type RGB = [number, number, number];
// Perceptual palettes: inferno-like sequential; dark-centred diverging palettes, so
// "no change" recedes into a dark interface and basemap while real signal is the
// brightest colour (review P2). Blue/red stays reserved for direction of motion or
// brightness; non-directional activity change gets purple/teal (review P3).
const sequential: RGB[] = [
  [20, 11, 52],
  [87, 16, 110],
  [158, 42, 99],
  [221, 81, 58],
  [250, 153, 25],
  [252, 255, 164],
];
// The centre ("no change") is a light slate: at least 3:1 contrast against the empty dark
// map (#0a1424) even at 80% layer opacity, so "no change" is never mistaken for "no data"
// (transparent cells). Lightness still rises steadily away from zero, so real change is the
// brighter, more saturated colour (review 3, item 4).
export const NEUTRAL: RGB = [110, 118, 134];
/** Colour of the empty map behind every layer. */
export const MAP_BACKGROUND: RGB = [10, 20, 36];
const diverging: RGB[] = [
  [170, 215, 255],
  [120, 175, 240],
  [92, 140, 210],
  NEUTRAL,
  [205, 110, 92],
  [235, 140, 100],
  [255, 190, 150],
];
/** Activity change: purple (more change) through slate to teal (less change). */
const activity: RGB[] = [
  [238, 176, 255],
  [200, 130, 245],
  [160, 105, 215],
  NEUTRAL,
  [60, 140, 140],
  [70, 170, 165],
  [110, 210, 195],
];
export const paletteFor = (kind: LayerKind): RGB[] =>
  kind === "coherence_change" ? activity : layerInfo[kind].diverging ? diverging : sequential;

export interface LayerInfo {
  label: string;
  short: string;
  unit: string;
  diverging: boolean;
  low: string;
  high: string;
  explain: string;
  digits: number;
}

export const layerInfo: Record<LayerKind, LayerInfo> = {
  disturbance: {
    label: "Surface change (coherence loss)",
    short: "Surface change",
    unit: "",
    diverging: false,
    low: "Stable",
    high: "Changed",
    explain:
      "1 − radar coherence. Bright areas changed between the two dates: fields worked, crops grown, ground shaken. It shows that the surface changed, not why.",
    digits: 2,
  },
  los: {
    label: "Ground motion (line of sight)",
    short: "Ground motion",
    unit: "mm",
    diverging: true,
    low: "Away from satellite",
    high: "Toward satellite",
    explain:
      "Motion along the radar's line of sight, relative to a reference area. Sinking ground moves away (blue); uplift or motion toward the satellite is red.",
    digits: 0,
  },
  coherence_change: {
    label: "Change in surface activity",
    short: "Activity change",
    unit: "",
    diverging: true,
    low: "More change",
    high: "Less change",
    explain:
      "Coherence in this period minus the previous period, on pixels measured in both. Bright purple: the surface changed more than before (new field work, harvest); teal: it changed less. Dark: about the same.",
    digits: 2,
  },
  backscatter_change: {
    label: "Radar brightness change (HH)",
    short: "HH change",
    unit: "dB",
    diverging: true,
    low: "Darker",
    high: "Brighter",
    explain:
      "After/before backscatter in decibels. New open water and burned canopy usually darken; flooded vegetation can brighten.",
    digits: 1,
  },
  backscatter_change_hv: {
    label: "Radar brightness change (HV)",
    short: "HV change",
    unit: "dB",
    diverging: true,
    low: "Darker",
    high: "Brighter",
    explain:
      "After/before HV backscatter in decibels. HV follows the volume of vegetation: lost canopy usually darkens it, regrowth brightens it.",
    digits: 1,
  },
};

const nice = [1, 2, 2.5, 5, 10];
function niceCeil(v: number) {
  if (!(v > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(v));
  return (nice.find((n) => n * e >= v) ?? 10) * e;
}

/** Symmetric (diverging) or [0, 1] display range chosen from the native distribution. */
export function displayRange(kind: LayerKind, entry?: LayerEntry): [number, number] {
  if (kind === "disturbance") return [0, 1];
  if (kind === "coherence_change") return [-0.5, 0.5];
  const s = entry?.native_statistics;
  const extent = Math.max(Math.abs(s?.p05 ?? 0), Math.abs(s?.p95 ?? 0));
  const fallback = kind.startsWith("backscatter_change") ? 6 : 50;
  const r = niceCeil(extent || fallback);
  return [-r, r];
}

export function color(value: number, kind: LayerKind, range: [number, number]): RGB {
  const palette = paletteFor(kind);
  const t = (value - range[0]) / (range[1] - range[0]);
  const k = Math.min(1, Math.max(0, t)) * (palette.length - 1),
    i = Math.min(palette.length - 2, Math.floor(k)),
    f = k - i;
  return palette[i].map((v, j) =>
    Math.round(v + (palette[i + 1][j] - v) * f),
  ) as RGB;
}

export function gradient(kind: LayerKind) {
  const palette = paletteFor(kind);
  return `linear-gradient(90deg, ${palette.map((c) => `rgb(${c.join(",")})`).join(", ")})`;
}

export function format(kind: LayerKind, value: number | null) {
  if (value == null) return "No data";
  const info = layerInfo[kind];
  const text = value.toLocaleString("en-US", {
    maximumFractionDigits: info.digits,
    minimumFractionDigits: info.digits,
  });
  const signed = info.diverging && value > 0 ? `+${text}` : text;
  return info.unit ? `${signed} ${info.unit}` : signed;
}

/** One range for every pair of a study area, so pairs can be compared by colour. */
export function studyRange(study: StudyCase, kind: LayerKind): [number, number] {
  const ranges = study.pairs
    .map((p) => p.layers[kind])
    .filter((e): e is LayerEntry => Boolean(e))
    .map((e) => displayRange(kind, e));
  if (!ranges.length) return displayRange(kind);
  return [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))];
}
