import { afterEach, describe, expect, it, vi } from "vitest";
import { gibsTileAt, gibsTiles, opticalAvailable } from "./optical";

afterEach(() => vi.unstubAllGlobals());

describe("optical view of the same day (item 11)", () => {
  it("addresses NASA GIBS by the product's own date", () => {
    expect(gibsTiles("2026-10-21")).toContain("/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-10-21/");
    // The probe tile at zoom 3 over the Libyan coast (33.1 N, 12.27 E) is z3/y3/x4, the tile
    // fetched from GIBS by hand on 14 November 2026.
    expect(gibsTileAt("2026-10-21", 12.27, 33.1)).toMatch(/\/2026-10-21\/GoogleMapsCompatible_Level9\/3\/3\/4\.jpg$/);
    expect(gibsTileAt("2026-10-21", -57.5, -17.5)).toMatch(/\/3\/4\/2\.jpg$/);
    expect(gibsTileAt("2026-10-21", 190, 89)).toMatch(/\/3\/0\/0\.jpg$/);
  });
  it("reports a day GIBS has no image of (404), or a different day served", async () => {
    const answer = (status: number, served?: string) =>
      vi.fn(async () => new Response(status === 200 ? "jpg" : "", { status, headers: served ? { "layer-time-actual": served } : {} }));
    vi.stubGlobal("fetch", answer(200, "2026-10-21T00:00:00Z"));
    expect(await opticalAvailable("2026-10-21", 12.27, 33.1)).toBe(true);
    vi.stubGlobal("fetch", answer(404));
    expect(await opticalAvailable("2026-11-20", 12.27, 33.1)).toBe(false);
    vi.stubGlobal("fetch", answer(200, "2026-10-20T00:00:00Z"));
    expect(await opticalAvailable("2026-10-21", 12.27, 33.1)).toBe(false);
  });
});
