/**
 * Country borders and place names drawn by the map itself (not baked into basemap tiles), so
 * they read the same on every basemap and stay when the live tile servers are offline.
 *
 * Data: Natural Earth (public domain), built by scripts/map_labels.py into public/geo/.
 * Font: DM Sans (SIL OFL 1.1), built by frontend/scripts/make-glyphs.mjs into public/glyphs/.
 * Natural Earth gives each name the zoom at which a map should start showing it; its zoom
 * levels assume 256-pixel tiles, MapLibre's assume 512, hence NE_ZOOM_OFFSET.
 */
import type { Map as LibreMap, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

export const NE_ZOOM_OFFSET = 1;
/** Line layers sit beneath measurements and footprints; names sit above everything. */
export const LINE_LAYERS = ["place-borders", "place-borders-disputed", "place-rivers"] as const;
export const LABEL_LAYERS = [
  "place-water-lines",
  "place-water",
  "place-ocean",
  "place-city",
  "place-capital",
  "place-country",
] as const;
export const GLYPH_FONTS = ["DM Sans Regular", "DM Sans SemiBold", "DM Sans Italic"] as const;
export const LABEL_FILES = { places: "geo/places.json", borders: "geo/borders.json", rivers: "geo/rivers.json" };

const shown = (key = "z"): ExpressionSpecification => [">=", ["zoom"], ["-", ["get", key], NE_ZOOM_OFFSET]];
const ofKind = (...kinds: string[]): ExpressionSpecification => ["in", ["get", "kind"], ["literal", kinds]];
const size = (a: number, b: number, from = 2, to = 8): ExpressionSpecification => [
  "interpolate",
  ["linear"],
  ["zoom"],
  from,
  a,
  to,
  b,
];
const halo = { "text-halo-color": "#06101e", "text-halo-width": 1.3, "text-halo-blur": 0.4 };
const WATER = "#9dd4ff";

export function lineLayers(): LayerSpecification[] {
  return [
    {
      id: "place-rivers",
      type: "line",
      source: "place-rivers",
      filter: shown(),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#5aa9e6", "line-opacity": 0.55, "line-width": size(0.5, 1.6, 3, 9) },
    },
    {
      id: "place-borders",
      type: "line",
      source: "place-borders",
      filter: ["==", ["get", "disputed"], 0],
      layout: { "line-join": "round" },
      paint: { "line-color": "#f2f6ff", "line-opacity": 0.6, "line-width": size(0.6, 1.4, 1, 8) },
    },
    {
      id: "place-borders-disputed",
      type: "line",
      source: "place-borders",
      filter: ["==", ["get", "disputed"], 1],
      paint: {
        "line-color": "#f2f6ff",
        "line-opacity": 0.5,
        "line-width": size(0.6, 1.2, 1, 8),
        "line-dasharray": [2, 2],
      },
    },
  ];
}

export function labelLayers(): LayerSpecification[] {
  const text = (font: (typeof GLYPH_FONTS)[number]) => ({
    "text-field": ["get", "name"] as ExpressionSpecification,
    "text-font": [font],
    "symbol-sort-key": ["get", "rank"] as ExpressionSpecification,
    "text-padding": 3,
  });
  return [
    {
      id: "place-water-lines",
      type: "symbol",
      source: "place-rivers",
      filter: shown("label_z"),
      layout: {
        ...text("DM Sans Italic"),
        "symbol-placement": "line",
        "symbol-spacing": 420,
        "text-max-angle": 30,
        "text-size": size(10, 12, 4, 10),
      },
      paint: { "text-color": WATER, ...halo },
    },
    {
      id: "place-water",
      type: "symbol",
      source: "place-names",
      filter: ["all", ofKind("sea", "bay", "lake"), shown()],
      layout: { ...text("DM Sans Italic"), "text-size": size(10, 13), "text-max-width": 7 },
      paint: { "text-color": WATER, ...halo },
    },
    {
      id: "place-ocean",
      type: "symbol",
      source: "place-names",
      filter: ofKind("ocean"),
      layout: {
        ...text("DM Sans Italic"),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.25,
        "text-size": size(10, 15, 1, 6),
        "text-max-width": 8,
      },
      paint: { "text-color": WATER, "text-opacity": 0.8, ...halo },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "place-names",
      filter: ["all", ofKind("city"), shown()],
      layout: { ...text("DM Sans Regular"), "text-size": size(10, 13, 4, 10), "text-max-width": 8 },
      paint: { "text-color": "#e3eaf5", ...halo },
    },
    {
      id: "place-capital",
      type: "symbol",
      source: "place-names",
      filter: ["all", ofKind("capital"), shown()],
      layout: { ...text("DM Sans SemiBold"), "text-size": size(10.5, 14, 3, 10), "text-max-width": 8 },
      paint: { "text-color": "#ffffff", ...halo },
    },
    {
      id: "place-country",
      type: "symbol",
      source: "place-names",
      filter: ["all", ofKind("country"), shown()],
      layout: {
        ...text("DM Sans SemiBold"),
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
        "text-size": size(9.5, 15, 1.5, 7),
        "text-max-width": 7,
      },
      paint: { "text-color": "#f4f7ff", "text-opacity": 0.92, ...halo },
    },
  ];
}

/**
 * Add borders, rivers and names. Borders and rivers go under `linesBelow` (the search
 * footprints, so measurements are drawn over them); names go under `namesBelow` (the area of
 * interest, so drawing stays on top), or on top of everything without it.
 * Sources load in the background: until they arrive the map simply has no names.
 */
export function addPlaceLayers(m: LibreMap, url: (file: string) => string, linesBelow?: string, namesBelow?: string) {
  const at = (id?: string) => (id && m.getLayer(id) ? id : undefined);
  m.addSource("place-names", { type: "geojson", data: url(LABEL_FILES.places) });
  m.addSource("place-borders", { type: "geojson", data: url(LABEL_FILES.borders) });
  m.addSource("place-rivers", { type: "geojson", data: url(LABEL_FILES.rivers) });
  for (const layer of lineLayers()) m.addLayer(layer, at(linesBelow));
  for (const layer of labelLayers()) m.addLayer(layer, at(namesBelow));
}

/** Show or hide the names (borders and rivers stay: they are context, not clutter). */
export function setPlaceLabels(m: LibreMap, visible: boolean) {
  for (const id of LABEL_LAYERS)
    if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
}

/** Characters in a set of names, as the 256-code-point glyph ranges MapLibre will request. */
export function glyphRanges(names: string[]): string[] {
  const starts = new Set<number>();
  for (const name of names) for (const ch of name) starts.add(Math.floor(ch.codePointAt(0)! / 256) * 256);
  return [...starts].sort((a, b) => a - b).map((s) => `${s}-${s + 255}`);
}
