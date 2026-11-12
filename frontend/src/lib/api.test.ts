import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeProduct,
  request,
  searchPlaces,
  discover,
  requestProcessing,
  findPair,
  offlineDiscovery,
  offlinePlaces,
} from "./api";
import type { Catalog } from "./types";

afterEach(() => vi.unstubAllGlobals());
describe("public catalog and honest availability", () => {
  it("retains actual footprint and pair metadata without inventing science", () => {
    const p = normalizeProduct({
      meta: { "concept-id": "G123-TEST" },
      umm: {
        GranuleUR: "TEST_ONLY",
        AdditionalAttributes: [
          {
            Name: "REFERENCE_ZERO_DOPPLER_START_TIME",
            Values: ["2026-01-01T00:00:00Z"],
          },
        ],
        SpatialExtent: {
          HorizontalSpatialDomain: {
            Geometry: {
              GPolygons: [
                {
                  Boundary: {
                    Points: [
                      { Longitude: 0, Latitude: 0 },
                      { Longitude: 1, Latitude: 0 },
                      { Longitude: 1, Latitude: 1 },
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    });
    expect(p.status).toBe("processing_unavailable");
    expect(p.cached_pair).toBeNull();
    expect(p.cached_case).toBeNull();
    expect(p.after).toBeNull();
    expect(p.geometry?.type).toBe("MultiPolygon");
    expect(p.source_url).toContain("G123-TEST.umm_json");
    expect(p.metadata_warnings).toContain(
      "Acquisition pair metadata incomplete.",
    );
  });
  it("handles network and HTTP failure with retryable explanations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("secret detail")),
    );
    await expect(request("https://example.test")).rejects.toThrow(
      "could not be reached",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );
    await expect(request("https://example.test")).rejects.toThrow("busy");
  });
  it("uses coordinates without a geocoder call and blocks fake jobs", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await searchPlaces("-6.21, 106.85"))[0].longitude).toBe(106.85);
    expect(fetch).not.toHaveBeenCalled();
    await expect(
      discover(
        { name: "test", bbox: [0, 0, 1, 1] },
        "2026-03-01",
        "2026-01-01",
      ),
    ).rejects.toThrow("chronological");
    const p = normalizeProduct({
      meta: { "concept-id": "G123-TEST" },
      umm: { GranuleUR: "TEST_ONLY" },
    });
    expect(
      (await requestProcessing(p, { name: "test", bbox: [0, 0, 1, 1] })).status,
    ).toBe("processing_unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("links a catalog product to its processed study area by exact granule", () => {
    const catalog = {
      cases: [{ id: "area", pairs: [{ id: "area-1", granule: "TEST_ONLY" }] }],
    } as unknown as Catalog;
    const p = normalizeProduct(
      { meta: { "concept-id": "G1-TEST" }, umm: { GranuleUR: "TEST_ONLY" } },
      catalog,
    );
    expect(p.cached_pair).toBe("area-1");
    expect(p.cached_case).toBe("area");
    expect(p.status).toBe("measured_provisional");
    expect(findPair(catalog, "area-1")?.study.id).toBe("area");
    expect(findPair(catalog, "missing")).toBeUndefined();
  });
});

describe("offline fallbacks", () => {
  const catalog = {
    cases: [
      {
        id: "caracas",
        name: "Caracas coast",
        region: "Venezuela",
        status: "measured_provisional",
        bbox: [-67.3, 10.3, -66.7, 10.7],
        pairs: [
          {
            id: "caracas-1",
            granule: "G1",
            before: "2026-06-13",
            after: "2026-06-25",
            track: 162,
            frame: 7,
            orbit: "Ascending",
            coordinates: [
              [-67.3, 10.7],
              [-66.7, 10.7],
              [-66.7, 10.3],
              [-67.3, 10.3],
            ],
          },
        ],
      },
    ],
  } as unknown as Catalog;
  it("finds built-in places and study areas without the network, ignoring accents", () => {
    expect(offlinePlaces("reykjavik")[0].name).toMatch(/Reykjav/);
    expect(offlinePlaces("caracas", catalog)[0].source).toMatch(/study area/);
    expect(offlinePlaces("nowhere-at-all")).toEqual([]);
  });
  it("returns only stored products that overlap in space and time, labelled offline", () => {
    const hit = offlineDiscovery({ name: "x", bbox: [-67, 10.4, -66.9, 10.5] }, "2026-06-01", "2026-07-01", catalog);
    expect(hit.offline).toBe(true);
    expect(hit.products.map((p) => p.cached_pair)).toEqual(["caracas-1"]);
    expect(offlineDiscovery({ name: "x", bbox: [0, 0, 1, 1] }, "2026-06-01", "2026-07-01", catalog).returned).toBe(0);
    expect(offlineDiscovery({ name: "x", bbox: [-67, 10.4, -66.9, 10.5] }, "2026-08-01", "2026-09-01", catalog).returned).toBe(0);
  });
});
