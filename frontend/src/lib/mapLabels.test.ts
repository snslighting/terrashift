import { describe, expect, it } from "vitest";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { GLYPH_FONTS, LABEL_FILES, LABEL_LAYERS, LINE_LAYERS, glyphRanges, labelLayers, lineLayers } from "./mapLabels";

import placesJson from "../../public/geo/places.json?raw";
import bordersJson from "../../public/geo/borders.json?raw";
import riversJson from "../../public/geo/rivers.json?raw";
import viewer from "../components/MapViewer.tsx?raw";

type Collection = { features: { properties: Record<string, string | number> }[] };
const places = JSON.parse(placesJson) as Collection,
  rivers = JSON.parse(riversJson) as Collection,
  borders = JSON.parse(bordersJson) as Collection;
// Every shipped glyph file, as "Font Name/0-255".
const glyphFiles = new Set(
  Object.keys(import.meta.glob("../../public/glyphs/*/*.pbf")).map((k) => k.split("/glyphs/")[1].replace(/\.pbf$/, "")),
);
const names = (c: Collection, kind?: string) =>
  c.features.filter((f) => !kind || f.properties.kind === kind).map((f) => String(f.properties.name));

describe("map borders and place names", () => {
  it("names countries, cities, oceans, seas, lakes and rivers from Natural Earth", () => {
    expect(names(places, "country")).toEqual(expect.arrayContaining(["France", "Brazil", "Japan"]));
    expect(names(places, "capital")).toEqual(expect.arrayContaining(["Paris", "Tashkent", "Caracas"]));
    expect(names(places, "ocean").length).toBeGreaterThanOrEqual(5);
    expect(names(places, "sea")).toEqual(expect.arrayContaining(["Caribbean Sea", "Black Sea"]));
    expect(names(places, "lake").length).toBeGreaterThan(50);
    expect(names(rivers)).toEqual(expect.arrayContaining(["Amazonas", "Danube"]));
    expect(borders.features.length).toBeGreaterThan(300);
  });

  it("ships a glyph file for every character any name uses, in every label font", () => {
    const ranges = glyphRanges([...names(places), ...names(rivers)]);
    expect(ranges).toContain("0-255");
    const used = new Set(labelLayers().map((l) => (l.layout as { "text-font": string[] })["text-font"][0]));
    expect([...used].sort()).toEqual([...GLYPH_FONTS].sort());
    for (const font of GLYPH_FONTS)
      for (const range of ranges) expect(glyphFiles.has(`${font}/${range}`), `${font} ${range}`).toBe(true);
  });

  it("keeps the files small enough to load after the map opens", () => {
    const kb = (text: string) => new TextEncoder().encode(text).length / 1024;
    expect(kb(placesJson)).toBeLessThan(700);
    expect(kb(bordersJson)).toBeLessThan(400);
    expect(kb(riversJson)).toBeLessThan(500);
    expect(Object.values(LABEL_FILES)).toEqual(["geo/places.json", "geo/borders.json", "geo/rivers.json"]);
  });

  it("produces valid MapLibre layers with the ids the viewer toggles", () => {
    const style = {
      version: 8 as const,
      glyphs: "https://example.test/{fontstack}/{range}.pbf",
      sources: Object.fromEntries(
        ["place-names", "place-borders", "place-rivers"].map((id) => [
          id,
          { type: "geojson" as const, data: { type: "FeatureCollection" as const, features: [] } },
        ]),
      ),
      layers: [...lineLayers(), ...labelLayers()],
    };
    expect(validateStyleMin(style)).toEqual([]);
    expect(lineLayers().map((l) => l.id)).toEqual(expect.arrayContaining([...LINE_LAYERS]));
    expect(labelLayers().map((l) => l.id)).toEqual([...LABEL_LAYERS]);
  });

  it("no longer draws the NISAR coverage dots on the map", () => {
    expect(viewer).not.toContain("coverage.json");
    expect(viewer).not.toContain("nisar-coverage");
  });
});
