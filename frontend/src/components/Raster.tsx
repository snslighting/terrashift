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

export function rasterURL(grid: Grid, kind: LayerKind, range: [number, number]) {
  const c = document.createElement("canvas");
  paint(c, grid, kind, range);
  return c.toDataURL();
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
}: {
  kind: LayerKind;
  entry?: LayerEntry;
  range?: [number, number];
  compact?: boolean;
}) {
  const info = layerInfo[kind],
    range = given ?? displayRange(kind, entry),
    unit = info.unit ? ` ${info.unit}` : "";
  return (
    <div className="legend">
      <div className="legend-heading">
        {info.short.toUpperCase()}
        <span>{info.unit || "0 – 1"}</span>
      </div>
      <div className="legend-gradient" style={{ background: gradient(kind) }} />
      <div className="legend-ticks">
        <span>
          {info.diverging ? `≤ ${range[0]}${unit}` : "0"} · {info.low}
        </span>
        {info.diverging && <span>0</span>}
        <span>
          {info.high} · {info.diverging ? `≥ +${range[1]}${unit}` : "1"}
        </span>
      </div>
      {!compact && <p>{info.explain}</p>}
    </div>
  );
}
