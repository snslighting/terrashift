import { describe, expect, it } from "vitest";
import { browseLinks, footprintBounds, maskNoData, placeImage, previewChoices, ringBounds } from "./browse";
import { normalizeProduct } from "./api";
import { placeStats, timeline } from "./catalogStats";
import { dataBounds, sameGeometry, statusLevel, trustOf } from "./evidence";
import { presets } from "./presets";
import type { Pair, Product } from "./types";

// Trimmed from real NASA catalog records (public metadata, 12 November 2026).
const BROWSE = "https://nisar.asf.earthdatacloud.nasa.gov/BROWSE/NISAR_L2_GCOV_PROVISIONAL_V1/G/G";
const gcovRecord = {
  meta: { "concept-id": "G1-ASF" },
  umm: {
    GranuleUR: "NISAR_L2_PR_GCOV_033_132_A_169_2005_DHDH_A_20261021T094225_20261021T094259_P05023_N_F_J_001",
    CollectionReference: { ShortName: "NISAR_L2_GCOV_PROVISIONAL_V1" },
    TemporalExtent: { RangeDateTime: { BeginningDateTime: "2026-10-21T09:42:25.000000Z" } },
    RelatedUrls: [
      { URL: "https://nisar.asf.earthdatacloud.nasa.gov/NISAR/X/G.h5", Type: "GET DATA" },
      { URL: `${BROWSE}_LATLON.png`, Type: "GET RELATED VISUALIZATION" },
      { URL: `${BROWSE}_LATLON_thumbnail.png` },
      { URL: `${BROWSE}_NATIVE.png` },
      { URL: `${BROWSE}_NATIVE_B_HVHV.png` },
      { URL: `${BROWSE}_NATIVE_A_HVHV.png` },
      { URL: `${BROWSE}_NATIVE_A_HHHH.png` },
      { URL: `${BROWSE}_NATIVE_B_HHHH.png` },
      { URL: "s3://sds-n-cumulus-prod-nisar-browse/X/G_LATLON.png" },
    ],
    AdditionalAttributes: [
      { Name: "TRACK_NUMBER", Values: ["132"] },
      { Name: "FRAME_NUMBER", Values: ["169"] },
      { Name: "ASCENDING_DESCENDING", Values: ["ASCENDING"] },
      { Name: "FREQUENCIES", Values: ["A", "B"] },
      { Name: "FREQUENCY_A_POLARIZATION", Values: ["HH", "HV"] },
    ],
    SpatialExtent: {
      HorizontalSpatialDomain: {
        Geometry: {
          GPolygons: [
            {
              Boundary: {
                Points: [
                  { Latitude: -17.90808, Longitude: -56.63654 },
                  { Latitude: -15.82364, Longitude: -57.08351 },
                  { Latitude: -16.28492, Longitude: -59.51912 },
                  { Latitude: -18.36433, Longitude: -59.10568 },
                  { Latitude: -17.90808, Longitude: -56.63654 },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

describe("NASA preview links (F1, F2)", () => {
  it("finds the composite, thumbnail and every polarization, https only", () => {
    const set = browseLinks(gcovRecord.umm.RelatedUrls);
    expect(set.combined).toBe(`${BROWSE}_LATLON.png`);
    expect(set.thumbnail).toBe(`${BROWSE}_LATLON_thumbnail.png`);
    expect(set.bands.map((b) => b.id)).toEqual(["A_HH", "A_HV", "B_HH", "B_HV"]);
  });
  it("tells GCOV from GUNW and dates a GCOV by its acquisition", () => {
    const p = normalizeProduct(gcovRecord);
    expect(p.kind).toBe("GCOV");
    expect(p.date).toBe("2026-10-21");
    expect(p.before).toBeNull();
    expect(p.metadata_warnings).toEqual([]);
    expect(previewChoices(p).map((c) => c.label)).toEqual(["Combined", "HH · A", "HV · A", "HH · B", "HV · B"]);
    expect(statusLevel(p)).toBe(2);
  });
  it("is a catalog record (level 1) without previews", () => {
    const p = normalizeProduct({ ...gcovRecord, umm: { ...gcovRecord.umm, RelatedUrls: [] } });
    expect(statusLevel(p)).toBe(1);
  });
});

describe("placing a preview on the map", () => {
  it("maps the valid-data box onto the footprint box", () => {
    // 100 x 50 image, data in columns 10..89 and rows 5..44 → footprint 0..8°E, 0..4°N.
    const c = placeImage({ x0: 10, x1: 89, y0: 5, y1: 44 }, 100, 50, [0, 0, 8, 4]);
    expect(c[0][0]).toBeCloseTo(-1);
    expect(c[0][1]).toBeCloseTo(4.5);
    expect(c[2][0]).toBeCloseTo(9);
    expect(c[2][1]).toBeCloseTo(-0.5);
  });
  it("masks no-data from the border but keeps dark water inside the scene", () => {
    const W = 6,
      H = 5,
      px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4,
          inside = x >= 1 && x <= 4 && y >= 1 && y <= 3,
          lake = x === 2 && y === 2;
        const v = inside && !lake ? 200 : 0;
        px.set([v, v, v, 255], o);
      }
    const extent = maskNoData(px, W, H);
    expect(extent).toEqual({ x0: 1, x1: 4, y0: 1, y1: 3 });
    expect(px[(2 * W + 2) * 4 + 3]).toBe(255); // the black lake stays
    expect(px[3]).toBe(0); // the border is transparent
  });
  it("unwraps footprints across the 180° line", () => {
    expect(ringBounds([[179, 1], [-179, 1], [-179, 2], [179, 2]])).toEqual([179, 1, 181, 2]);
    const pair = { coordinates: [[179.5, 2], [-179.5, 2], [-179.5, 1], [179.5, 1]] } as unknown as Pair;
    expect(dataBounds(pair)).toEqual([179.5, 1, -179.5, 2]);
    const p = normalizeProduct(gcovRecord);
    expect(footprintBounds(p)![0]).toBeCloseTo(-59.51912);
  });
});

const product = (o: Partial<Product>): Product =>
  ({
    id: Math.random().toString(36),
    granule: "g",
    collection: "c",
    kind: "GCOV",
    date: null,
    browse: { bands: [] },
    frequencies: [],
    before: null,
    after: null,
    track: 1,
    frame: 10,
    orbit: "ASCENDING",
    polarizations: [],
    geometry: null,
    source_url: "",
    download_auth_required: true,
    cached_pair: null,
    cached_case: null,
    status: "processing_unavailable",
    metadata_warnings: [],
    ...o,
  }) as Product;

describe("time series, compare and place report (F3–F5)", () => {
  const list = [
    product({ date: "2026-07-05" }),
    product({ date: "2026-07-17" }),
    product({ date: "2026-07-29" }),
    product({ date: "2026-07-10", track: 2, orbit: "DESCENDING" }),
    product({ date: "2026-07-22", track: 2, orbit: "DESCENDING" }),
    product({ date: "2026-07-17", kind: "GUNW" }),
  ];
  it("orders one family by date", () => {
    expect(timeline(list, "GCOV").map((p) => p.date)).toEqual([
      "2026-07-05",
      "2026-07-10",
      "2026-07-17",
      "2026-07-22",
      "2026-07-29",
    ]);
  });
  it("only compares the same family, track, frame and direction", () => {
    expect(sameGeometry(list[0], list[1])).toBe(true);
    expect(sameGeometry(list[0], list[3])).toBe(false);
    expect(sameGeometry(list[1], list[5])).toBe(false);
    expect(sameGeometry(list[0], { ...list[1], frame: 11 })).toBe(false);
  });
  it("reports counts, span and the 12-day repeat per track", () => {
    const s = placeStats(list);
    expect(s.counts).toEqual({ GUNW: 1, GCOV: 5 });
    expect(s.first).toBe("2026-07-05");
    expect(s.last).toBe("2026-07-29");
    expect(s.repeatDays).toBe(12);
    expect(s.orbits).toEqual(["ASCENDING", "DESCENDING"]);
  });
});

describe("trust levels (F7, F10)", () => {
  it("separates validated, partly checked, failed and unchecked", () => {
    const base = { comparison: null, gnss: null } as unknown as Pair;
    expect(trustOf(base)).toBe("not_checked");
    expect(trustOf({ ...base, gnss: { station: "CCS1" } } as unknown as Pair)).toBe("partly_checked");
    expect(trustOf({ ...base, comparison: { validation: "FAILED" } } as unknown as Pair)).toBe("failed");
    expect(trustOf({ ...base, comparison: { validation: "PASSED" } } as unknown as Pair)).toBe("validated");
    expect(statusLevel(undefined, base)).toBe(3);
    expect(statusLevel(undefined, { ...base, gnss: { station: "CCS1" } } as unknown as Pair)).toBe(4);
  });
});

describe("sample places (F6)", () => {
  it("has the 14 counted places with valid boxes and unique ids", () => {
    expect(presets.filter((p) => p.counts)).toHaveLength(14);
    expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
    for (const p of presets) {
      const [w, s, e, n] = p.bbox;
      expect(w < e && s < n && n - s <= 2 && e - w <= 2, p.id).toBe(true);
    }
  });
});
