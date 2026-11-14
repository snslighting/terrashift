import { describe, expect, it } from "vitest";
import { mercatorLat, mercatorY, nativeGrids, polarStereographic, utm, utmZone } from "./projection";
import { mercatorRows, placeImage, placeNative } from "./browse";
import type { Position } from "./types";

// Reference values from PROJ (pyproj 3, EPSG definitions), computed 14 November 2026.
const REFERENCE: [number, number, number, number, number][] = [
  [32633, 12.9, 32.7, 303147.055, 3619979.174],
  [32633, 14.57, 31.94, 459357.606, 3533865.86],
  [32633, 17.9, 0.5, 822823.963, 55336.378],
  [32627, -22.4, 63.7, 430793.926, 7064343.077],
  [32627, -25.82, 63.94, 263909.176, 7099256.491],
  [32721, -57.0, -17.0, 500000.0, 8120444.964],
  [32759, 170.5, -45.0, 460592.351, 5016928.012],
  [32601, -179.5, 65.2, 383014.583, 7233061.835],
  [3413, 12.9, 32.7, 5727506.407, -3592857.996],
  [3413, -22.4, 63.7, 1113721.822, -2675544.834],
  [3413, -25.82, 63.94, 943143.909, -2711387.448],
  [3413, -179.5, 65.2, -1945438.721, 1911777.307],
  [3031, -57.0, -17.0, -7690042.42, 4993971.94],
  [3031, 170.5, -45.0, 849512.769, -5076488.13],
  [3031, 0.0, -75.0, 0.0, 1638783.238],
  [3031, 150.0, -70.0, 1097247.124, -1900487.767],
];
const grid = (epsg: number) =>
  epsg === 3413 ? polarStereographic(false) : epsg === 3031 ? polarStereographic(true) : utm(epsg % 100, epsg > 32700);

describe("map grids of NASA's single-polarization previews (item 3)", () => {
  it.each(REFERENCE)("EPSG:%i at %f, %f matches PROJ within 1 m, and inverts", (epsg, lon, lat, x, y) => {
    const g = grid(epsg),
      [gx, gy] = g.forward(lon, lat);
    expect(Math.abs(gx - x)).toBeLessThan(1);
    expect(Math.abs(gy - y)).toBeLessThan(1);
    const [blon, blat] = g.inverse(gx, gy);
    expect(Math.abs(blon - lon)).toBeLessThan(1e-6);
    expect(Math.abs(blat - lat)).toBeLessThan(1e-6);
  });
  it("offers the UTM zone of the scene centre and the polar grid of its hemisphere", () => {
    expect(utmZone(12.9)).toBe(33);
    expect(utmZone(-180)).toBe(1);
    expect(utmZone(180)).toBe(1);
    const iceland: Position[] = [
      [-18.95, 63.34],
      [-21.41, 65.18],
      [-25.82, 63.94],
      [-23.19, 62.17],
    ];
    expect(nativeGrids(iceland).map((g) => g.name)).toEqual(["UTM zone 27N", "EPSG:3413 (Arctic polar stereographic)"]);
    const dateline: Position[] = [
      [179.5, -16],
      [-179.5, -16],
      [-179.5, -17],
      [179.5, -17],
    ];
    expect(nativeGrids(dateline)[0].name).toBe("UTM zone 1S");
  });
});

/** Valid-data box of a synthetic image whose grid is `g`: the footprint's box in that grid at 200 m pixels. */
function syntheticImage(ring: Position[], g: ReturnType<typeof utm>, margin = 20) {
  const p = ring.map(([lon, lat]) => g.forward(lon, lat)),
    xs = p.map((v) => v[0]),
    ys = p.map((v) => v[1]),
    w = Math.round((Math.max(...xs) - Math.min(...xs)) / 200),
    h = Math.round((Math.max(...ys) - Math.min(...ys)) / 200);
  return { extent: { x0: margin, x1: margin + w - 1, y0: margin, y1: margin + h - 1 }, width: w + 2 * margin, height: h + 2 * margin };
}

describe("placing single-polarization previews on their own grid (item 3)", () => {
  // Footprint corners of real NISAR GCOV products (NASA CMR, public metadata).
  const libya: Position[] = [
    [14.5703, 31.94338],
    [13.88274, 34.00551],
    [11.26719, 33.34687],
    [12.0066, 31.29975],
  ];
  const iceland: Position[] = [
    [-18.94953, 63.33785],
    [-21.4133, 65.18322],
    [-25.82035, 63.94119],
    [-23.1881, 62.16885],
  ];
  it("recognises a UTM image and puts the footprint's corners back on the footprint", () => {
    const { extent, width, height } = syntheticImage(libya, utm(33, false));
    const placed = placeNative(extent, width, height, libya);
    expect(placed.grid).toBe("UTM zone 33N");
    // In the grid, the image corners sit on the footprint's box widened by the 20 px margin.
    const g = utm(33, false),
      p = libya.map(([lon, lat]) => g.forward(lon, lat)),
      xmin = Math.min(...p.map((v) => v[0])),
      xmax = Math.max(...p.map((v) => v[0])),
      ymax = Math.max(...p.map((v) => v[1])),
      sx = (xmax - xmin) / (extent.x1 + 1 - extent.x0);
    const [x, y] = g.forward(...placed.coordinates[0]);
    expect(Math.abs(x - (xmin - 20 * sx))).toBeLessThan(1);
    expect(y).toBeGreaterThan(ymax);
  });
  it("recognises a polar stereographic image at 64°N", () => {
    const { extent, width, height } = syntheticImage(iceland, polarStereographic(false));
    expect(placeNative(extent, width, height, iceland).grid).toMatch(/EPSG:3413/);
  });
  it("places a polar image as a turned quad, not a north-up box", () => {
    const { extent, width, height } = syntheticImage(iceland, polarStereographic(false));
    const [tl, tr] = placeNative(extent, width, height, iceland).coordinates;
    // The image's top edge is not a parallel of latitude: EPSG:3413 is turned against north here.
    expect(Math.abs(tl[1] - tr[1])).toBeGreaterThan(0.1);
  });
});

describe("lat/lon previews drawn on a Mercator map (item 3)", () => {
  it("round-trips Mercator y", () => {
    for (const lat of [-70, -12.5, 0, 33.1, 64]) expect(mercatorLat(mercatorY(lat))).toBeCloseTo(lat, 9);
  });
  it("re-spaces rows so each lands at its own latitude", () => {
    // 1 px wide, 100 rows from 66°N to 62°N; each row's red value is its row index.
    const h = 100,
      rgba = new Uint8ClampedArray(h * 4);
    for (let i = 0; i < h; i++) rgba.set([i, 0, 0, 255], i * 4);
    const out = mercatorRows(rgba, 1, h, 66, 62);
    // Row i of the output is drawn at Mercator-linear position; it must show the source row at that latitude.
    for (const i of [0, 25, 50, 75, 99]) {
      const lat = mercatorLat(mercatorY(66) + ((i + 0.5) / h) * (mercatorY(62) - mercatorY(66)));
      expect(out[i * 4]).toBe(Math.floor(((66 - lat) / 4) * h));
    }
    // Rows near the top (higher latitude, stretched more by Mercator) repeat; the middle shifts north.
    expect(out[50 * 4]).toBeLessThan(50);
    expect(out[0]).toBe(0);
    expect(out[99 * 4]).toBe(99);
  });
  it("keeps the lat/lon box placement for the composite", () => {
    expect(placeImage({ x0: 0, x1: 9, y0: 0, y1: 9 }, 10, 10, [10, 20, 11, 21])).toEqual([
      [10, 21],
      [11, 21],
      [11, 20],
      [10, 20],
    ]);
  });
});
