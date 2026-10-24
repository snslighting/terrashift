import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeProduct,
  request,
  searchPlaces,
  discover,
  requestProcessing,
  findPair,
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
