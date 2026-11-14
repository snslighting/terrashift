import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Map as LibreMap,
  NavigationControl,
  ScaleControl,
  Marker,
  setWorkerUrl,
  type ImageSource,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Crosshair,
  Globe2,
  Square,
  PenTool,
  Check,
  X,
  Layers,
  Compass,
  ChevronDown,
  Tag,
} from "lucide-react";
import { asset, bboxFeature, productCollection } from "../lib/api";
import { normalizeLongitude } from "../lib/science";
import { gibsTiles, opticalAvailable } from "../lib/optical";
import { addPlaceLayers, setPlaceLabels } from "../lib/mapLabels";
export { gibsTiles } from "../lib/optical";
import type {
  BBox,
  MapMarker,
  Product,
  Selection,
  Position,
} from "../lib/types";
export interface Overlay {
  key: string;
  /** Image file to fetch (processed measurement grids). */
  url?: string;
  /** Already-decoded picture (NASA previews), drawn without fetching or decoding again. */
  image?: ImageBitmap;
  coordinates: Position[];
  /** Smooth resampling for photographs (NASA previews); measurement grids stay crisp. */
  smooth?: boolean;
  /** Draw the image's rectangle as the data edge (off for previews, whose footprint is drawn). */
  outline?: boolean;
}
export type Basemap = "satellite" | "geographic" | "terrain" | "optical";
interface Props {
  overlay?: Overlay;
  legend?: ReactNode;
  markers?: MapMarker[];
  products?: Product[];
  selection?: Selection;
  focus?: BBox;
  onPoint?: (lon: number, lat: number) => void;
  onMarker?: (marker: MapMarker) => void;
  onSelect?: (selection: Selection) => void;
  onProduct?: (id: string) => void;
  basemap?: Basemap;
  /** Day shown by the "optical" basemap (YYYY-MM-DD). */
  opticalDate?: string;
  /** Catalog product to highlight among the search footprints. */
  activeProduct?: string;
  opacity?: number;
  className?: string;
  compact?: boolean;
  hint?: string;
  /** Plain-language reading of the measurement at a point, shown live under the cursor. */
  probe?: (lon: number, lat: number) => string | null;
  /** Name shown in the map's corner label; defaults to the Explorer's name. */
  title?: string;
}
function fitBox(b: BBox): [[number, number], [number, number]] {
  let [w, s, e, n] = b;
  if (w > e) e += 360;
  return [
    [w, s],
    [e, n],
  ];
}
export default function MapViewer(props: Props) {
  const holder = useRef<HTMLDivElement>(null),
    map = useRef<LibreMap>(null),
    latest = useRef(props),
    markerRefs = useRef<Marker[]>([]);
  latest.current = props;
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [offlineBasemap, setOfflineBasemap] = useState(false),
    // The optical layer is addressed by day: a missing day is not an offline basemap.
    [opticalMissing, setOpticalMissing] = useState(false),
    offlineRef = useRef(false),
    [labels, setLabels] = useState(true),
    [mode, setMode] = useState<"rectangle" | "polygon" | null>(null),
    [points, setPoints] = useState<Position[]>([]),
    [coords, setCoords] = useState("WORLDWIDE · WGS84"),
    [legendOpen, setLegendOpen] = useState(
      () => !matchMedia("(max-width: 760px)").matches,
    );
  const drawing = useRef<{
    mode: "rectangle" | "polygon" | null;
    points: Position[];
  }>({ mode: null, points: [] });
  drawing.current = { mode, points };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!holder.current) return;
    setWorkerUrl(asset("maplibre-gl-worker.mjs"));
    let cancelled = false;
    try {
      const m = new LibreMap({
        container: holder.current,
        center: [40, 22],
        zoom: 1.7,
        minZoom: 1.2,
        maxZoom: 17,
        renderWorldCopies: true,
        attributionControl: {
          compact: true,
          customAttribution: "Built-in imagery: NASA Blue Marble",
        },
        style: {
          version: 8,
          // Shipped with the site (DM Sans), for the place names in lib/mapLabels.ts.
          glyphs: new URL(asset("glyphs/"), location.href).href + "{fontstack}/{range}.pbf",
          sources: {
            geographic: {
              type: "raster",
              tiles: ["a", "b", "c", "d"].map(
                (k) =>
                  `https://${k}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png`,
              ),
              tileSize: 256,
              attribution:
                '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
            },
            satellite: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
            },
            terrain: {
              type: "raster",
              tiles: [
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
              ],
              tileSize: 256,
              attribution: "Terrain cartography © Esri and contributors",
            },
          },
          layers: [
            {
              id: "offline-background",
              type: "background",
              paint: { "background-color": "#0a1424" },
            },
            {
              id: "geographic",
              type: "raster",
              source: "geographic",
              layout: { visibility: "none" },
            },
            {
              id: "satellite",
              type: "raster",
              source: "satellite",
              paint: {
                "raster-saturation": -0.5,
                "raster-brightness-max": 0.65,
              },
            },
            {
              id: "terrain",
              type: "raster",
              source: "terrain",
              layout: { visibility: "none" },
              paint: {
                "raster-saturation": -0.65,
                "raster-brightness-max": 0.6,
              },
            },
          ],
        },
      });
      map.current = m;
      m.addControl(new NavigationControl({ showCompass: true }), "top-right");
      m.addControl(new ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");
      m.on("load", () => {
        if (cancelled) return;
        // Built-in basemap: NASA Blue Marble (public domain), reprojected to Web Mercator
        // and shipped with the site. It sits beneath the tile basemaps, so it shows
        // whenever tiles are unreachable (offline, or hosts that block tile servers).
        const M = 85.0511287798;
        m.addSource("blue-marble", {
          type: "image",
          url: new URL(asset("geo/blue-marble-mercator.webp"), location.href).href,
          coordinates: [
            [-180, M],
            [180, M],
            [180, -M],
            [-180, -M],
          ],
        });
        m.addLayer(
          {
            id: "blue-marble",
            type: "raster",
            source: "blue-marble",
            paint: {
              "raster-saturation": -0.2,
              "raster-brightness-max": 0.78,
              "raster-resampling": "linear",
            },
          },
          "geographic",
        );
        // A 10-degree graticule gives the offline map a sense of place and scale.
        const lines: GeoJSON.Feature[] = [];
        for (let lon = -180; lon <= 180; lon += 10)
          lines.push({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[lon, -85], [lon, 85]] },
          });
        for (let lat = -80; lat <= 80; lat += 10)
          lines.push({
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]),
            },
          });
        m.addSource("graticule", {
          type: "geojson",
          data: { type: "FeatureCollection", features: lines },
        });
        m.addLayer(
          {
            id: "offline-graticule",
            type: "line",
            source: "graticule",
            paint: { "line-color": "#9fc4e0", "line-width": 0.5, "line-opacity": 0.18 },
          },
          "geographic",
        );
        m.addSource("coverage", {
          type: "geojson",
          data: productCollection([]),
        });
        m.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage",
          // Footprints are outlines only, so the basemap and previews stay visible;
          // the near-invisible fill keeps the whole footprint clickable.
          paint: { "fill-color": "#55d9f3", "fill-opacity": 0.01 },
        });
        m.addLayer({
          id: "coverage-line",
          type: "line",
          source: "coverage",
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "cached"], 1],
              "#c2f19d",
              "#55d9f3",
            ],
            "line-width": 1,
            "line-opacity": 0.65,
          },
        });
        m.addLayer({
          id: "coverage-active",
          type: "line",
          source: "coverage",
          filter: ["==", ["get", "id"], ""],
          paint: { "line-color": "#ffffff", "line-width": 2.2, "line-opacity": 0.95 },
        });
        m.addSource("aoi", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "aoi-fill",
          type: "fill",
          source: "aoi",
          paint: { "fill-color": "#8878ff", "fill-opacity": 0.04 },
        });
        m.addLayer({
          id: "aoi-line",
          type: "line",
          source: "aoi",
          paint: {
            "line-color": "#a99dff",
            "line-width": 1.5,
            "line-dasharray": [3, 2],
          },
        });
        m.addSource("drawing", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addLayer({
          id: "drawing-line",
          type: "line",
          source: "drawing",
          paint: { "line-color": "#a99dff", "line-width": 2 },
        });
        m.addLayer({
          id: "drawing-points",
          type: "circle",
          source: "drawing",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 4,
            "circle-color": "#e9e3ff",
            "circle-stroke-width": 2,
            "circle-stroke-color": "#8878ff",
          },
        });
        // Borders and rivers beneath the footprints and measurements; names above them,
        // beneath the area of interest and the drawing.
        addPlaceLayers(m, (file) => new URL(asset(file), location.href).href, "coverage-fill", "aoi-fill");
        setReady(true);
      });
      m.on("mousemove", (e) => {
        const lon = normalizeLongitude(e.lngLat.lng),
          lat = e.lngLat.lat,
          reading = latest.current.probe?.(lon, lat);
        setCoords(
          reading
            ? `${reading} · ${lat.toFixed(3)}°, ${lon.toFixed(3)}°`
            : `${lat.toFixed(4)}° LAT · ${lon.toFixed(4)}° LON`,
        );
      });
      // Keyboard inspection: arrow keys pan (MapLibre default); Enter or Space reads
      // the measurement under the centre crosshair.
      const canvas = m.getCanvas();
      canvas.setAttribute(
        "aria-label",
        "Map. Arrow keys move the map, plus and minus zoom, Enter inspects the point under the centre crosshair.",
      );
      canvas.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (!latest.current.onPoint || drawing.current.mode) return;
        e.preventDefault();
        const c = m.getCenter();
        latest.current.onPoint(normalizeLongitude(c.lng), Math.max(-90, Math.min(90, c.lat)));
      });
      m.on("moveend", () => {
        if (document.activeElement !== canvas) return;
        const c = m.getCenter(),
          reading = latest.current.probe?.(normalizeLongitude(c.lng), c.lat);
        if (reading) setCoords(`${reading} · centre`);
      });
      m.on("click", (e) => {
        const point: Position = [
            normalizeLongitude(e.lngLat.lng),
            Math.max(-90, Math.min(90, e.lngLat.lat)),
          ],
          d = drawing.current;
        if (d.mode) {
          if (d.points.length >= 99) {
            setError("Use at most 99 polygon vertices.");
            return;
          }
          const updated = [...d.points, point];
          if (d.mode === "rectangle" && updated.length === 2) {
            finishDrawing(updated, "rectangle");
          } else setPoints(updated);
          return;
        }
        const p = latest.current;
        if (p.onProduct && m.getLayer("coverage-fill")) {
          const feature = m.queryRenderedFeatures(e.point, {
            layers: ["coverage-fill"],
          })[0];
          if (feature?.properties?.id) {
            p.onProduct(String(feature.properties.id));
            return;
          }
        }
        p.onPoint?.(...point);
      });
      let failures = 0;
      const basemaps = new Set(["satellite", "terrain", "geographic", "optical"]);
      m.on("error", (e) => {
        // Basemap tiles failing is not fatal: the built-in Blue Marble shows instead.
        const sourceId = (e as { sourceId?: string }).sourceId;
        if (sourceId === "optical") {
          setOpticalMissing(true);
          return;
        }
        if (sourceId && basemaps.has(sourceId)) {
          setOfflineBasemap(true);
          return;
        }
        // Place names are context: if they cannot load, the map works without them.
        if (sourceId?.startsWith("place-")) return;
        if (++failures >= 3)
          setError(
            "Some map resources are unavailable. Evidence and search remain accessible.",
          );
      });
      const observer = new ResizeObserver(() => m.resize());
      observer.observe(holder.current);
      return () => {
        cancelled = true;
        observer.disconnect();
        markerRefs.current.forEach((s) => s.remove());
        m.remove();
        map.current = null;
      };
    } catch {
      setError(
        "This map requires WebGL. You can still search the catalog and inspect the evidence.",
      );
    }
  }, []);
  function finishDrawing(p: Position[], type: "rectangle" | "polygon") {
    if (p.length < 2) return;
    const longs = p.map((v) => v[0]),
      lats = p.map((v) => v[1]);
    const bbox: [number, number, number, number] = [
      Math.min(...longs),
      Math.min(...lats),
      Math.max(...longs),
      Math.max(...lats),
    ];
    if (bbox[0] === bbox[2] || bbox[1] === bbox[3]) {
      setError("Choose an area with nonzero width and height.");
      return;
    }
    if (bbox[2] - bbox[0] > 180) {
      setError(
        "For a dateline region, enter west/east bounds in the selection panel.",
      );
      return;
    }
    let polygon: Position[] | undefined;
    if (type === "polygon") {
      polygon = [...p, p[0]];
      let area = 0;
      for (let i = 0; i < polygon.length - 1; i++)
        area +=
          polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];
      if (area < 0) polygon.reverse();
    }
    latest.current.onSelect?.({
      name: type === "rectangle" ? "Selected rectangle" : "Selected polygon",
      bbox,
      polygon,
    });
    setMode(null);
    setPoints([]);
  }
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const features: GeoJSON.Feature[] = points.map((p) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Point", coordinates: p },
    }));
    if (points.length >= 2)
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: points },
      });
    (m.getSource("drawing") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features,
    });
  }, [points, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const s = props.selection;
    if (!s)
      (m.getSource("aoi") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    if (s) {
      const geo = s.polygon
        ? {
            type: "FeatureCollection" as const,
            features: [
              {
                type: "Feature" as const,
                properties: {},
                geometry: {
                  type: "Polygon" as const,
                  coordinates: [s.polygon],
                },
              },
            ],
          }
        : bboxFeature(s.bbox);
      (m.getSource("aoi") as GeoJSONSource).setData(geo);
      if (!props.focus)
        m.fitBounds(fitBox(s.bbox), {
          padding: props.compact ? 35 : 65,
          // The built-in imagery has ~10 km detail: stay regional when tiles are offline.
          maxZoom: offlineRef.current ? 7 : 12,
          duration: reduced ? 0 : 1100,
        });
    }
  }, [props.selection, ready]);
  // When the live basemap turns out to be offline and no measurement layer is shown,
  // zoom out to a scale where the built-in imagery still shows the landscape.
  useEffect(() => {
    offlineRef.current = offlineBasemap;
    const m = map.current;
    if (!m || !offlineBasemap) return;
    const settle = () => {
      if (!latest.current.overlay && m.getZoom() > 7.5)
        m.easeTo({ zoom: 7, duration: reduced ? 0 : 900 });
    };
    // Check now and after any fly-in that was already under way finishes.
    if (!m.isMoving()) settle();
    m.once("moveend", settle);
    return () => {
      m.off("moveend", settle);
    };
  }, [offlineBasemap]);
  const focusKey = props.focus?.join(",");
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !props.focus) return;
    m.fitBounds(fitBox(props.focus), {
      padding: props.compact ? 30 : 60,
      maxZoom: 12,
      duration: reduced ? 0 : 1100,
    });
  }, [focusKey, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("coverage") as GeoJSONSource).setData(
      productCollection(props.products ?? []),
    );
  }, [props.products, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const basemap = props.basemap ?? "satellite";
    // The optical layer is rebuilt for each date (GIBS tiles are addressed by day).
    const date = props.opticalDate ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    setOpticalMissing(false);
    if (m.getLayer("optical")) m.removeLayer("optical");
    if (m.getSource("optical")) m.removeSource("optical");
    if (basemap === "optical") {
      m.addSource("optical", {
        type: "raster",
        tiles: [gibsTiles(date)],
        tileSize: 256,
        maxzoom: 9,
        attribution: `Optical ${date}: NASA GIBS / MODIS Terra`,
      });
      m.addLayer(
        { id: "optical", type: "raster", source: "optical", paint: { "raster-brightness-max": 0.85 } },
        "geographic",
      );
    }
    let probe: AbortController | undefined;
    if (basemap === "optical") {
      probe = new AbortController();
      const c = m.getCenter(),
        signal = probe.signal;
      opticalAvailable(date, c.lng, c.lat, signal)
        .then((ok) => !signal.aborted && !ok && setOpticalMissing(true))
        .catch(() => !signal.aborted && setOpticalMissing(true));
    }
    for (const id of ["satellite", "terrain", "geographic"])
      m.setLayoutProperty(
        id,
        "visibility",
        id === basemap ? "visible" : "none",
      );
    return () => probe?.abort();
  }, [props.basemap, props.opticalDate, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    m.setFilter("coverage-active", ["==", ["get", "id"], props.activeProduct ?? ""]);
    // With one product open, the other footprints step back.
    m.setPaintProperty("coverage-line", "line-opacity", props.activeProduct ? 0.22 : 0.65);
  }, [props.activeProduct, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const overlay = props.overlay;
    if (!overlay) {
      for (const id of ["measurement", "measurement-edge"])
        if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", "none");
      return;
    }
    const coords = overlay.coordinates as [Position, Position, Position, Position];
    // A thin outline of the processed area, so its edge is clear on any basemap.
    const edge = {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [[...coords, coords[0]]] },
    };
    if (m.getSource("measurement-edge"))
      (m.getSource("measurement-edge") as GeoJSONSource).setData(edge);
    else {
      m.addSource("measurement-edge", { type: "geojson", data: edge });
      m.addLayer(
        {
          id: "measurement-edge",
          type: "line",
          source: "measurement-edge",
          paint: { "line-color": "#e8f1ff", "line-opacity": 0.75, "line-width": 1.2 },
        },
        "aoi-line",
      );
    }
    m.setLayoutProperty(
      "measurement-edge",
      "visibility",
      overlay.outline === false ? "none" : "visible",
    );
    const content = overlay.image ? { image: overlay.image } : { url: overlay.url! };
    if (m.getSource("measurement")) {
      (m.getSource("measurement") as ImageSource).updateImage({ ...content, coordinates: coords });
      m.setLayoutProperty("measurement", "visibility", "visible");
    } else {
      // Created empty, then filled, so a bitmap and a URL take the same path.
      m.addSource("measurement", { type: "image", coordinates: coords });
      (m.getSource("measurement") as ImageSource).updateImage({ ...content, coordinates: coords });
      m.addLayer(
        {
          id: "measurement",
          type: "raster",
          source: "measurement",
          paint: {
            "raster-opacity": props.opacity ?? 0.85,
            "raster-resampling": "nearest",
            "raster-fade-duration": reduced ? 0 : 300,
          },
        },
        // Beneath footprints, the selected-product outline and the area of interest.
        "coverage-fill",
      );
    }
    m.setPaintProperty("measurement", "raster-opacity", props.opacity ?? 0.85);
    m.setPaintProperty("measurement", "raster-resampling", overlay.smooth ? "linear" : "nearest");
  }, [props.overlay?.key, props.overlay?.url, props.overlay?.image, props.opacity, ready]);
  const markerKey = (props.markers ?? []).map((k) => k.id).join("|");
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markerRefs.current.forEach((s) => s.remove());
    markerRefs.current = [];
    (props.markers ?? []).forEach((k) => {
      const el = document.createElement("button");
      el.className = `station-dot ${k.kind}`;
      el.setAttribute("aria-label", k.title ?? `Inspect ${k.label}`);
      el.title = k.title ?? k.label;
      const dot = document.createElement("i");
      const label = document.createElement("span");
      label.textContent = k.label;
      el.append(dot, label);
      el.onclick = (e) => {
        e.stopPropagation();
        latest.current.onMarker?.(k);
      };
      markerRefs.current.push(
        new Marker({ element: el }).setLngLat([k.longitude, k.latitude]).addTo(m),
      );
    });
  }, [markerKey, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.getCanvas().style.cursor = mode ? "crosshair" : "";
  }, [mode]);
  // Esri's terrain map prints its own names; ours would double them, unless its tiles are offline.
  const ownNames = (props.basemap ?? "satellite") === "terrain" && !offlineBasemap;
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    setPlaceLabels(m, labels && !ownNames);
  }, [labels, ownNames, ready]);
  const fit = () => {
    const box = props.focus ?? props.selection?.bbox;
    if (box)
      map.current?.fitBounds(fitBox(box), {
        padding: 60,
        duration: reduced ? 0 : 900,
      });
    else
      map.current?.flyTo({
        center: [40, 22],
        zoom: 1.7,
        duration: reduced ? 0 : 1400,
      });
  };
  return (
    <div className={`map-viewer ${props.className ?? ""}`}>
      <div
        ref={holder}
        className="map-canvas"
        role="region"
        aria-label="Interactive Earth observation map"
      />
      {!ready && !error && (
        <div className="map-loading" role="status">
          <Globe2 className="spin" />
          Loading Earth observation map…
        </div>
      )}
      {error && (
        <div className="map-error" role="status">
          {error}
        </div>
      )}
      {opticalMissing && props.basemap === "optical" && !error && (
        <div className="map-offline" role="status">
          No NASA optical image of {props.opticalDate ?? "this day"} here
          <span className="long">
            {" "}· it may not be processed yet. The built-in Blue Marble shows underneath.
          </span>
        </div>
      )}
      {/* The Esri/CARTO basemaps being offline is irrelevant while the GIBS optical layer is shown. */}
      {offlineBasemap && !error && props.basemap !== "optical" && (
        <div className="map-offline" role="status">
          Live basemap offline<span className="long">
            {" "}· showing NASA Blue Marble (about 10 km detail). NISAR evidence is unaffected.
          </span>
        </div>
      )}
      <div className="map-identity">
        <i />
        {(props.title ?? "NISAR observation explorer").toUpperCase()} <span>WGS84</span>
      </div>
      <div className="map-tools">
        <button
          onClick={fit}
          title="Fit selected area"
          aria-label="Fit selected area"
        >
          <Crosshair size={17} />
        </button>
        <button
          onClick={() => setLabels(!labels)}
          aria-pressed={labels}
          aria-label={labels ? "Hide place names" : "Show place names"}
          title={labels ? "Hide place names" : "Show place names"}
          className={labels ? "active" : ""}
        >
          <Tag size={17} />
        </button>
        {props.onSelect && (
          <>
            <button
              onClick={() => {
                setMode("rectangle");
                setPoints([]);
              }}
              aria-label="Draw rectangle"
              title="Select rectangle with two clicks"
              className={mode === "rectangle" ? "active" : ""}
            >
              <Square size={17} />
            </button>
            <button
              onClick={() => {
                setMode("polygon");
                setPoints([]);
              }}
              aria-label="Draw polygon"
              title="Draw polygon"
              className={mode === "polygon" ? "active" : ""}
            >
              <PenTool size={17} />
            </button>
          </>
        )}
      </div>
      {mode && (
        <div className="drawing-help">
          <span>
            {mode === "rectangle"
              ? `Click ${points.length ? "the opposite corner" : "the first corner"}.`
              : `Click vertices · ${points.length} selected`}
          </span>
          {mode === "polygon" && points.length >= 3 && (
            <button onClick={() => finishDrawing(points, "polygon")}>
              <Check size={15} />
              Finish
            </button>
          )}
          <button
            onClick={() => {
              setMode(null);
              setPoints([]);
            }}
            aria-label="Cancel drawing"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {props.legend && (
        <div className={`map-legend ${legendOpen ? "open" : "closed"}`}>
          <button
            className="legend-toggle"
            onClick={() => setLegendOpen(!legendOpen)}
            aria-expanded={legendOpen}
          >
            <Layers size={13} />
            Legend
            <ChevronDown size={13} />
          </button>
          {legendOpen && props.legend}
        </div>
      )}
      <div className="map-crosshair" aria-hidden="true" />
      <div className="map-coordinate" aria-live="off">
        <Compass size={12} />
        {coords}
      </div>
      <div className="map-hint">
        <Layers size={12} />
        {props.hint ??
          (props.overlay
            ? "Select a point to inspect the measurement."
            : "Click a location or draw a region to discover observations.")}
      </div>
    </div>
  );
}
