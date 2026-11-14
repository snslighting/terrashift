import { describe, expect, it } from "vitest";
import {
  decodeGrid,
  insidePolygon,
  inspect,
  parseCoordinates,
  pointBBox,
  regionalStats,
  areaSummary,
  splitBBox,
  stats,
} from "./science";
import { color, displayRange, format, MAP_BACKGROUND, NEUTRAL } from "./layers";
import type { Grid, LayerEntry, Pair } from "./types";

// All fixture values are synthetic and never part of the public research export.
const values = new Int16Array([6000, -32768, 9000, 3000]);
const counts = new Uint8Array([25, 0, 30, 27]);
const grid: Grid = decodeGrid(values.buffer, counts.buffer, 2, 0.0001, -32768, "uint8");
const pair = {
  id: "test",
  grid: { size: 2, bounds_mercator: [0, 0, 200, 200] },
  layers: {},
} as unknown as Pair;
describe("grids, selection and units", () => {
  it("decodes int16 grids, keeping no-data missing and counts exact", () => {
    expect(grid.values[0]).toBeCloseTo(0.6);
    expect(Number.isNaN(grid.values[1])).toBe(true);
    expect(Array.from(grid.counts)).toEqual([25, 0, 30, 27]);
    expect(() =>
      decodeGrid(new Int16Array(3).buffer, new Uint8Array(4).buffer, 2, 1, -32768, "uint8"),
    ).toThrow("size");
  });
  it("samples every loaded layer and reports missing data as null", () => {
    const p = inspect(pair, { disturbance: grid }, 0.0005, 0.0014);
    expect(p.samples[0].value).toBeCloseTo(0.6);
    expect(p.samples[0].support).toBe(25);
    expect(inspect(pair, { disturbance: grid }, 20, 20).samples[0].value).toBeNull();
    expect(regionalStats(pair, grid, [-1, -1, 1, 1]).count).toBe(3);
    expect(stats([null, 0, 12, -9]).count).toBe(3);
    expect(stats([NaN]).mean).toBeNull();
  });
  it("summarises a drawn area without inventing missing cells", () => {
    const a = areaSummary(pair, grid, { bbox: [-1, -1, 1, 1] }, [0, 1], 4);
    expect(a.cells).toBe(3); // the no-data cell is left out
    expect(a.sourcePixels).toBe(25 + 30 + 27);
    expect(a.median).toBeCloseTo(0.6);
    expect(a.p05).toBeCloseTo(0.3);
    expect(a.p95).toBeCloseTo(0.9);
    expect(a.histogram).toEqual([0, 1, 1, 1]);
    expect(areaSummary(pair, grid, { bbox: [10, 10, 11, 11] }, [0, 1]).median).toBeNull();
  });
  it("parses coordinates and splits dateline areas", () => {
    expect(parseCoordinates("41.3, 69.24")).toEqual([69.24, 41.3]);
    expect(parseCoordinates("Jakarta")).toBeNull();
    expect(() => parseCoordinates("91, 69")).toThrow();
    expect(splitBBox(pointBBox(179.99, 0))).toHaveLength(2);
    expect(() => splitBBox([0, 0, 1, -1])).toThrow();
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(insidePolygon([0.5, 0.5], square)).toBe(true);
    expect(insidePolygon([2, 2], square)).toBe(false);
  });
  it("chooses readable symmetric ranges and distinct palettes", () => {
    const entry = { native_statistics: { p05: -349, p95: 26 } } as LayerEntry;
    expect(displayRange("los", entry)).toEqual([-500, 500]);
    expect(displayRange("disturbance")).toEqual([0, 1]);
    expect(color(-100, "los", [-100, 100])).not.toEqual(color(100, "los", [-100, 100]));
    // Dark-centred: "no change" is the darkest colour, never the brightest.
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (const kind of ["los", "coherence_change", "backscatter_change"] as const) {
      const zero = lum(color(0, kind, [-1, 1]));
      expect(zero).toBeLessThan(lum(color(-1, kind, [-1, 1])));
      expect(zero).toBeLessThan(lum(color(1, kind, [-1, 1])));
    }
    // Lightness rises steadily away from zero on both sides.
    for (const kind of ["los", "coherence_change"] as const) {
      const at = (v: number) => lum(color(v, kind, [-1, 1]));
      for (const side of [-1, 1]) for (let t = 0; t < 1; t += 1 / 6) expect(at(side * (t + 1 / 6))).toBeGreaterThan(at(side * t) - 1e-9);
    }
    // "No change" vs "no data": the zero colour, drawn at the Explorer's default 80% opacity
    // over the empty map, keeps at least 3:1 contrast with the map (WCAG non-text contrast).
    const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const L = (rgb: number[]) => 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
    const shown = NEUTRAL.map((v, i) => 0.8 * v + 0.2 * MAP_BACKGROUND[i]);
    expect(color(0, "los", [-1, 1])).toEqual(NEUTRAL);
    expect((L(shown) + 0.05) / (L(MAP_BACKGROUND) + 0.05)).toBeGreaterThanOrEqual(3);
    // "More change" (negative coherence change) is the brighter end.
    expect(lum(color(-0.5, "coherence_change", [-0.5, 0.5]))).toBeGreaterThan(
      lum(color(0.5, "coherence_change", [-0.5, 0.5])),
    );
    expect(format("los", 12.4)).toBe("+12 mm");
    expect(format("disturbance", null)).toBe("No data");
  });
});
