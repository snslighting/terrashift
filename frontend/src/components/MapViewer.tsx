import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Map as LibreMap,
  NavigationControl,
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
} from "lucide-react";
import { asset, bboxFeature, productCollection } from "../lib/api";
import { normalizeLongitude } from "../lib/science";
import type {
  BBox,
  MapMarker,
  Product,
  Selection,
  Position,
} from "../lib/types";
export interface Overlay {
  key: string;
  url: string;
  coordinates: Position[];
}
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
  basemap?: "satellite" | "geographic" | "terrain";
  opacity?: number;
  className?: string;
  compact?: boolean;
  hint?: string;
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
        attributionControl: { compact: true },
        style: {
          version: 8,
          sources: {
            geographic: {
              type: "raster",
              tiles: ["a", "b", "c", "d"].map(
                (k) =>
                  `https://${k}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`,
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
      m.on("load", () => {
        if (cancelled) return;
        m.addSource("coverage", {
          type: "geojson",
          data: productCollection([]),
        });
        m.addLayer({
          id: "coverage-fill",
          type: "fill",
          source: "coverage",
          paint: { "fill-color": "#55d9f3", "fill-opacity": 0.06 },
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
        setReady(true);
      });
      m.on("mousemove", (e) =>
        setCoords(
          `${e.lngLat.lat.toFixed(4)}° LAT · ${normalizeLongitude(e.lngLat.lng).toFixed(4)}° LON`,
        ),
      );
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
      m.on("error", () => {
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
          maxZoom: 12,
          duration: reduced ? 0 : 1100,
        });
    }
  }, [props.selection, ready]);
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
    for (const id of ["satellite", "terrain", "geographic"])
      m.setLayoutProperty(
        id,
        "visibility",
        id === basemap ? "visible" : "none",
      );
  }, [props.basemap, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const overlay = props.overlay;
    if (!overlay) {
      if (m.getLayer("measurement"))
        m.setLayoutProperty("measurement", "visibility", "none");
      return;
    }
    const coords = overlay.coordinates as [Position, Position, Position, Position];
    if (m.getSource("measurement")) {
      (m.getSource("measurement") as ImageSource).updateImage({
        url: overlay.url,
        coordinates: coords,
      });
      m.setLayoutProperty("measurement", "visibility", "visible");
    } else {
      m.addSource("measurement", {
        type: "image",
        url: overlay.url,
        coordinates: coords,
      });
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
        "aoi-line",
      );
    }
    m.setPaintProperty("measurement", "raster-opacity", props.opacity ?? 0.85);
  }, [props.overlay?.key, props.overlay?.url, props.opacity, ready]);
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
      <div className="map-identity">
        <i />
        NISAR OBSERVATION EXPLORER <span>WGS84</span>
      </div>
      <div className="map-tools">
        <button
          onClick={fit}
          title="Fit selected area"
          aria-label="Fit selected area"
        >
          <Crosshair size={17} />
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
      <div className="map-coordinate">
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
