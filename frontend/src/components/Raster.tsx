import { useEffect, useRef } from "react";
import type { Grid, LayerEntry, LayerKind } from "../lib/types";
import { color, displayRange, gradient, layerInfo } from "../lib/layers";

export function paint(
  canvas: HTMLCanvasElement,
  grid: Grid,
  kind: LayerKind,
  range: [number, number],
) {
  const size = grid.size;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;
  const pixels = context.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = grid.values[i];
    if (!Number.isFinite(v)) continue;
    pixels.data.set([...color(v, kind, range), 235], i * 4);
  }
  context.putImageData(pixels, 0, 0);
}

/**
 * Image URL for drawing a grid on the map. Uses a blob: URL (allowed by strict
 * content-security policies that block data: fetches) and caches one per grid,
 * layer and colour range, so switching back and forth does not repaint.
 */
const rasterCache = new WeakMap<Grid, Map<string, string>>();
export function rasterURL(grid: Grid, kind: LayerKind, range: [number, number]) {
  const key = `${kind}:${range[0]}:${range[1]}`;
  let byKey = rasterCache.get(grid);
  if (!byKey) rasterCache.set(grid, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  paint(c, grid, kind, range);
  const encoded = atob(c.toDataURL("image/png").split(",")[1]),
    bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
  byKey.set(key, url);
  return url;
}

export function Raster({
  grid,
  kind,
  entry,
  range,
  label,
}: {
  grid?: Grid;
  kind: LayerKind;
  entry?: LayerEntry;
  range?: [number, number];
  label?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const r = range ?? displayRange(kind, entry);
  useEffect(() => {
    if (ref.current && grid) paint(ref.current, grid, kind, r);
  }, [grid, kind, r[0], r[1]]);
  if (!grid) return <div className="science-raster raster-pending" aria-hidden="true" />;
  return (
    <canvas
      ref={ref}
      className="science-raster"
      role="img"
      aria-label={label ?? layerInfo[kind].label}
    />
  );
}

export function Legend({
  kind,
  entry,
  range: given,
  compact = false,
  noise,
}: {
  kind: LayerKind;
  entry?: LayerEntry;
  range?: [number, number];
  compact?: boolean;
  /** Measured error around zero (layer units): that part of the scale is greyed out. */
  noise?: number;
}) {
  const info = layerInfo[kind],
    range = given ?? displayRange(kind, entry),
    unit = info.unit ? ` ${info.unit}` : "",
    span = range[1] - range[0],
    band =
      noise && noise > 0 && info.diverging && span > 0
        ? {
            left: Math.max(0, ((-noise - range[0]) / span) * 100),
            right: Math.min(100, ((noise - range[0]) / span) * 100),
          }
        : null;
  return (
    <div className="legend">
      <div className="legend-heading">
        {info.short.toUpperCase()}
        <span>{info.unit || (info.diverging ? "Δ coherence" : "0 – 1")}</span>
      </div>
      <div className="legend-gradient" style={{ background: gradient(kind) }}>
        {band && (
          <span
            className="legend-noise"
            style={{ left: `${band.left}%`, width: `${band.right - band.left}%` }}
            title={`Within the measured error (±${Math.round(noise!)}${unit} RMS)`}
          />
        )}
      </div>
      <div className="legend-ticks">
        <span>
          {info.diverging ? `≤ ${range[0]}${unit}` : "0"} · {info.low}
        </span>
        {info.diverging && <span>0</span>}
        <span>
          {info.high} · {info.diverging ? `≥ +${range[1]}${unit}` : "1"}
        </span>
      </div>
      {band && (
        <p className="legend-noise-note">
          <i /> Within error: ±{Math.round(noise!)}
          {unit} RMS against GNSS
        </p>
      )}
      {!compact && <p>{info.explain}</p>}
    </div>
  );
}
