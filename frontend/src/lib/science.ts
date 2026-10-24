import type {
  BBox,
  Grid,
  LayerKind,
  Pair,
  Pixel,
  Stats,
  Status,
  Position,
} from "./types";
export const statuses: Record<
  Status,
  { label: string; className: string; explanation: string }
> = {
  measured_validated: {
    label: "Measured · validated",
    className: "validated",
    explanation:
      "Requires reviewed corrections, stable reference, a supported total uncertainty model and specified independent validation checks. No current TerraShift result meets this standard.",
  },
  measured_provisional: {
    label: "Measured · provisional",
    className: "provisional",
    explanation:
      "An explicitly referenced LOS estimate exists. Independent validation has not passed. Use for research, with the stated processing limits.",
  },
  quality_limited: {
    label: "Quality limited",
    className: "limited",
    explanation:
      "An observation exists, but masks, spatial support or comparison failures limit its interpretation.",
  },
  no_suitable_data: {
    label: "No suitable data",
    className: "empty",
    explanation:
      "No matching GUNW products were returned for this area and time range. This does not establish that all NISAR product types are unavailable.",
  },
  processing_unavailable: {
    label: "Processing unavailable",
    className: "unavailable",
    explanation:
      "Catalog metadata may be available, but this deployment cannot process the selected scientific product.",
  },
};
export const number = (v: number | null | undefined, d = 1) =>
  v == null
    ? "Unavailable"
    : v.toLocaleString("en-US", {
        maximumFractionDigits: d,
        minimumFractionDigits: d,
      });
export const signed = (v: number | null | undefined, d = 1) =>
  v == null ? "Unavailable" : `${v > 0 ? "+" : ""}${number(v, d)}`;
export const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function normalizeLongitude(lon: number) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}
export function validBBox(b: BBox) {
  return (
    b.every(finite) &&
    b[0] >= -180 &&
    b[0] <= 180 &&
    b[2] >= -180 &&
    b[2] <= 180 &&
    b[1] >= -90 &&
    b[3] <= 90 &&
    b[1] < b[3] &&
    b[0] !== b[2]
  );
}
export function splitBBox(b: BBox): BBox[] {
  if (!validBBox(b)) throw Error("Enter a valid WGS84 area.");
  return b[0] < b[2]
    ? [b]
    : [
        [b[0], b[1], 180, b[3]],
        [-180, b[1], b[2], b[3]],
      ];
}
export function pointBBox(lon: number, lat: number): BBox {
  lon = normalizeLongitude(lon);
  return [
    normalizeLongitude(lon - 0.15),
    Math.max(-90, lat - 0.12),
    normalizeLongitude(lon + 0.15),
    Math.min(90, lat + 0.12),
  ];
}
export function parseCoordinates(text: string): Position | null {
  const match = text
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = +match[1],
    lon = +match[2];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180)
    throw Error("Coordinates must be latitude −90…90, longitude −180…180.");
  return [lon, lat];
}
export function mercatorToLngLat(x: number, y: number): Position {
  return [
    ((x / 6378137) * 180) / Math.PI,
    ((2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180) / Math.PI,
  ];
}
export function gridIndex(
  bounds: BBox,
  size: number,
  lon: number,
  lat: number,
): number | null {
  if (!finite(lon) || !finite(lat) || Math.abs(lat) >= 85.051129) return null;
  const x = (6378137 * lon * Math.PI) / 180,
    y = 6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const col = Math.floor(((x - bounds[0]) / (bounds[2] - bounds[0])) * size),
    row = Math.floor(((bounds[3] - y) / (bounds[3] - bounds[1])) * size);
  return col >= 0 && row >= 0 && col < size && row < size
    ? row * size + col
    : null;
}
/** Sample every loaded layer of a pair at one location. Missing stays missing. */
export function inspect(
  pair: Pair,
  grids: Partial<Record<LayerKind, Grid>>,
  lon: number,
  lat: number,
): Pixel {
  const i = gridIndex(pair.grid.bounds_mercator, pair.grid.size, lon, lat);
  return {
    longitude: lon,
    latitude: lat,
    samples: (Object.keys(grids) as LayerKind[]).map((kind) => {
      const g = grids[kind]!,
        v = i == null ? NaN : g.values[i];
      return {
        kind,
        value: Number.isFinite(v) ? v : null,
        support: i == null ? 0 : g.counts[i],
      };
    }),
  };
}
export function stats(values: ArrayLike<number | null>): Stats {
  const v = Array.from(values)
      .filter(finite)
      .sort((a, b) => a - b),
    n = v.length;
  return {
    count: n,
    mean: n ? v.reduce((a, b) => a + b, 0) / n : null,
    median: n
      ? (v[Math.floor((n - 1) / 2)] + v[Math.ceil((n - 1) / 2)]) / 2
      : null,
    min: n ? v[0] : null,
    max: n ? v[n - 1] : null,
  };
}
export function insidePolygon(point: Position, polygon: Position[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export function regionalStats(
  pair: Pair,
  grid: Grid,
  bbox: BBox,
  polygon?: Position[],
) {
  const b = pair.grid.bounds_mercator,
    size = pair.grid.size,
    selected: number[] = [];
  for (let row = 0; row < size; row++) {
    const lat = mercatorToLngLat(0, b[3] - ((row + 0.5) * (b[3] - b[1])) / size)[1];
    if (lat < bbox[1] || lat > bbox[3]) continue;
    for (let col = 0; col < size; col++) {
      const lon = mercatorToLngLat(b[0] + ((col + 0.5) * (b[2] - b[0])) / size, 0)[0];
      const inBox =
        bbox[0] < bbox[2]
          ? lon >= bbox[0] && lon <= bbox[2]
          : lon >= bbox[0] || lon <= bbox[2];
      if (inBox && (!polygon || insidePolygon([lon, lat], polygon)))
        selected.push(grid.values[row * size + col]);
    }
  }
  return stats(selected);
}
/** Decode an exported int16 grid; NODATA becomes NaN. */
export function decodeGrid(
  data: ArrayBuffer,
  counts: ArrayBuffer,
  size: number,
  step: number,
  nodata: number,
  countType: "uint8" | "uint16",
): Grid {
  const raw = new Int16Array(data);
  const c =
    countType === "uint8" ? new Uint8Array(counts) : new Uint16Array(counts);
  if (raw.length !== size * size || c.length !== size * size)
    throw Error("Grid file does not match the catalog size.");
  const values = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++)
    values[i] = raw[i] === nodata ? NaN : raw[i] * step;
  return { size, values, counts: c };
}
export function shortDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
export function longDate(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
export function downloadJSON(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadCSV(
  name: string,
  rows: (string | number | null | undefined)[][],
) {
  const text = rows
    .map((row) =>
      row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
