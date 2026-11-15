/** Zoom and pan of a picture inside its frame: scale `k`, and the offset `x`, `y` of its top-left corner in pixels. */
export interface View {
  k: number;
  x: number;
  y: number;
}

export const MAX_ZOOM = 12;
export const HOME: View = { k: 1, x: 0, y: 0 };

/** Keep the zoom within 1 to MAX_ZOOM and the picture covering the whole frame (no empty edges). */
export function clampView(v: View, width: number, height: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k));
  return {
    k,
    x: Math.min(0, Math.max(width - width * k, v.x)),
    y: Math.min(0, Math.max(height - height * k, v.y)),
  };
}

/** Zoom by `factor` keeping the point (cx, cy) of the frame fixed under the cursor. */
export function zoomView(v: View, factor: number, cx: number, cy: number, width: number, height: number): View {
  const k = Math.min(MAX_ZOOM, Math.max(1, v.k * factor)),
    ratio = k / v.k;
  return clampView({ k, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio }, width, height);
}
