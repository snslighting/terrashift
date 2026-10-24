import type { LayerEntry, LayerKind, StudyCase } from "./types";

type RGB = [number, number, number];
// Perceptual palettes (inferno-like sequential, RdBu-like diverging).
const sequential: RGB[] = [
  [20, 11, 52],
  [87, 16, 110],
  [158, 42, 99],
  [221, 81, 58],
  [250, 153, 25],
  [252, 255, 164],
];
const diverging: RGB[] = [
  [33, 102, 172],
  [103, 169, 207],
  [209, 229, 240],
  [247, 247, 247],
  [253, 219, 199],
  [239, 138, 98],
  [178, 24, 43],
];

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
      "Coherence in this period minus the previous period, on pixels measured in both. Blue: the surface changed more than before (new field work, harvest).",
    digits: 2,
  },
  backscatter_change: {
    label: "Radar brightness change",
    short: "Brightness change",
    unit: "dB",
    diverging: true,
    low: "Darker",
    high: "Brighter",
    explain:
      "After/before backscatter in decibels. New open water and burned canopy usually darken; flooded vegetation can brighten.",
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
  const fallback = kind === "backscatter_change" ? 6 : 50;
  const r = niceCeil(extent || fallback);
  return [-r, r];
}

export function color(value: number, kind: LayerKind, range: [number, number]): RGB {
  const palette = layerInfo[kind].diverging ? diverging : sequential;
  const t = (value - range[0]) / (range[1] - range[0]);
  const k = Math.min(1, Math.max(0, t)) * (palette.length - 1),
    i = Math.min(palette.length - 2, Math.floor(k)),
    f = k - i;
  return palette[i].map((v, j) =>
    Math.round(v + (palette[i + 1][j] - v) * f),
  ) as RGB;
}

export function gradient(kind: LayerKind) {
  const palette = layerInfo[kind].diverging ? diverging : sequential;
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
