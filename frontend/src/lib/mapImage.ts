import { paint } from "../components/Raster";
import { color, layerInfo } from "./layers";
import { longDate } from "./science";
import { groundMotionWarning, validationLabel } from "./evidence";
import type { Grid, LayerKind, Pair, Product, StudyCase } from "./types";
import type { PreviewImage } from "./browse";
import { ladder } from "./evidence";

/**
 * Render a self-explaining PNG of one map layer: the grid at full resolution
 * (no smoothing), title, dates, colour bar with units, and source line. Every
 * pixel is a display cell from the real grid; blank cells have no data.
 */
export function mapImage(
  study: StudyCase,
  pair: Pair,
  kind: LayerKind,
  grid: Grid,
  range: [number, number],
): HTMLCanvasElement {
  const info = layerInfo[kind],
    W = 1400,
    H = 1080,
    M = 56,
    map = 820,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#070d19";
  g.fillRect(0, 0, W, H);

  g.fillStyle = "#55d9f3";
  g.font = "600 15px 'DM Sans', system-ui, sans-serif";
  g.fillText(`TERRASHIFT · ${study.region.toUpperCase()}`, M, M + 4);
  g.fillStyle = "#f5f8ff";
  g.font = "500 40px 'Space Grotesk', system-ui, sans-serif";
  g.fillText(study.name, M, M + 54);
  g.fillStyle = "#a5bacb";
  g.font = "400 19px 'DM Sans', system-ui, sans-serif";
  g.fillText(
    `${info.label} · ${longDate(pair.before)} → ${longDate(pair.after)} · ${pair.orbit} orbit, track ${pair.track}`,
    M,
    M + 88,
  );

  // The grid, scaled with nearest-neighbour so each display cell stays a crisp square.
  const top = M + 120,
    frame = document.createElement("canvas");
  paint(frame, grid, kind, range);
  // Keep the area's true shape: the grid spans a Web Mercator box that need not be square.
  const [bx0, by0, bx1, by1] = pair.grid.bounds_mercator,
    aspect = (bx1 - bx0) / (by1 - by0),
    dw = aspect >= 1 ? map : map * aspect,
    dh = aspect >= 1 ? map / aspect : map,
    dx = M + (map - dw) / 2,
    dy = top + (map - dh) / 2;
  g.fillStyle = "#0b1526";
  g.fillRect(M, top, map, map);
  g.imageSmoothingEnabled = false;
  g.drawImage(frame, dx, dy, dw, dh);
  g.strokeStyle = "#ffffff22";
  g.strokeRect(M + 0.5, top + 0.5, map - 1, map - 1);
  g.strokeStyle = "#e8f1ffbb";
  g.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);

  // An unvalidated ground-motion map carries its warning inside the image (review P1).
  const warning = groundMotionWarning(kind, pair.comparison);
  if (warning) {
    g.fillStyle = "#3a1f0ce6";
    g.fillRect(M, top, map, 40);
    g.fillStyle = "#ffcf9e";
    g.font = "600 16px 'DM Sans', system-ui, sans-serif";
    g.fillText(warning.ribbon, M + 16, top + 26);
  }

  // Colour bar and its meaning.
  const x = M + map + 48,
    w = W - x - M;
  g.fillStyle = "#f5f8ff";
  g.font = "600 17px 'DM Sans', system-ui, sans-serif";
  g.fillText(info.short.toUpperCase(), x, top + 14);
  for (let i = 0; i < w; i++) {
    const v = range[0] + ((range[1] - range[0]) * i) / (w - 1),
      [r, gg, b] = color(v, kind, range);
    g.fillStyle = `rgb(${r},${gg},${b})`;
    g.fillRect(x + i, top + 32, 1, 20);
  }
  const unit = info.unit ? ` ${info.unit}` : "";
  g.fillStyle = "#c3d1de";
  g.font = "400 15px 'DM Sans', system-ui, sans-serif";
  g.fillText(`${info.diverging ? range[0] : 0}${unit}`, x, top + 74);
  const hi = `${info.diverging ? "+" + range[1] : 1}${unit}`;
  g.fillText(hi, x + w - g.measureText(hi).width, top + 74);
  g.fillStyle = "#8ea3b6";
  g.fillText(info.low, x, top + 96);
  g.fillText(info.high, x + w - g.measureText(info.high).width, top + 96);
  wrap(g, info.explain, x, top + 140, w, 23, "#c3d1de", "400 16px 'DM Sans', system-ui, sans-serif");

  const notes = [
    `Display grid ${pair.grid.size} × ${pair.grid.size}; each cell is the mean of the real radar pixels inside it.`,
    "Blank cells have no accepted data. Nothing is interpolated.",
    pair.comparison
      ? `Independent GNSS check: ${pair.comparison.rmse_mm.toFixed(1)} mm RMS against ${pair.comparison.count} stations (${validationLabel(pair.comparison).phrase}).`
      : "",
  ].filter(Boolean);
  let y = top + 420;
  for (const n of notes) y = wrap(g, n, x, y, w, 21, "#8ea3b6", "400 14px 'DM Sans', system-ui, sans-serif") + 10;

  g.fillStyle = "#8ea3b6";
  g.font = "400 13px 'DM Sans', system-ui, sans-serif";
  g.fillText(`Source: NASA–ISRO NISAR ${pair.granule}`, M, H - 44);
  g.fillText(
    `Made with TerraShift on ${new Date().toISOString().slice(0, 10)}. An independent project, not an official NASA or ISRO product.`,
    M,
    H - 22,
  );
  return c;
}

/**
 * PNG of a NASA preview as shown on the map: the image, what it is, its status
 * level and the attribution line. Never presented as a TerraShift measurement.
 */
export async function previewImage(
  product: Product,
  image: PreviewImage,
  label: string,
  place: string,
  level: number,
): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = image.url;
  await img.decode();
  const W = 1400,
    M = 56,
    box = 900,
    scale = Math.min(box / img.width, box / img.height),
    w = img.width * scale,
    h = img.height * scale,
    top = M + 130,
    H = top + box + 110,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  g.fillStyle = "#070d19";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#55d9f3";
  g.font = "600 15px 'DM Sans', system-ui, sans-serif";
  g.fillText(`TERRASHIFT · NASA PREVIEW · ${product.kind}`, M, M + 4);
  g.fillStyle = "#f5f8ff";
  g.font = "500 38px 'Space Grotesk', system-ui, sans-serif";
  g.fillText(place || "NISAR observation", M, M + 52);
  g.fillStyle = "#a5bacb";
  g.font = "400 19px 'DM Sans', system-ui, sans-serif";
  const dates =
    product.kind === "GUNW" && product.before && product.after
      ? `${longDate(product.before.slice(0, 10))} → ${longDate(product.after.slice(0, 10))}`
      : product.date
        ? longDate(product.date)
        : "";
  g.fillText(
    `${label} · ${dates} · ${product.orbit?.toLowerCase() ?? ""} orbit, track ${product.track ?? "?"}, frame ${product.frame ?? "?"}`,
    M,
    M + 86,
  );
  g.fillStyle = "#0b1526";
  g.fillRect(M, top, box, box);
  g.drawImage(img, M + (box - w) / 2, top + (box - h) / 2, w, h);
  g.fillStyle = "#3a1f0ce6";
  g.fillRect(M, top, box, 40);
  g.fillStyle = "#ffcf9e";
  g.font = "600 16px 'DM Sans', system-ui, sans-serif";
  g.fillText("NASA PREVIEW · NOT PROCESSED OR VALIDATED BY TERRASHIFT", M + 16, top + 26);
  const x = M + box + 44,
    tw = W - x - M;
  g.fillStyle = "#f5f8ff";
  g.font = "600 17px 'DM Sans', system-ui, sans-serif";
  g.fillText("STATUS", x, top + 14);
  let y = top + 46;
  for (const r of ladder) {
    g.fillStyle = r.level <= level ? "#55d9f3" : "#3b4a5c";
    g.beginPath();
    g.arc(x + 9, y - 5, 9, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = r.level <= level ? "#f5f8ff" : "#6d7f91";
    g.font = "500 15px 'DM Sans', system-ui, sans-serif";
    g.fillText(`${r.level}. ${r.short}`, x + 26, y);
    y += 30;
  }
  y = wrap(g, ladder[level - 1].text, x, y + 14, tw, 21, "#a5bacb", "400 14px 'DM Sans', system-ui, sans-serif");
  if (image.approximate)
    y = wrap(g, "Single-polarization image in the product's own map grid; placement is approximate.", x, y + 10, tw, 21, "#8ea3b6", "400 14px 'DM Sans', system-ui, sans-serif");
  g.fillStyle = "#8ea3b6";
  g.font = "400 13px 'DM Sans', system-ui, sans-serif";
  g.fillText(`Source: NASA/JPL-Caltech NISAR preview via NASA ASF DAAC · ${product.granule}`, M, H - 44);
  g.fillText(
    `Made with TerraShift on ${new Date().toISOString().slice(0, 10)}. An independent project, not an official NASA or ISRO product.`,
    M,
    H - 22,
  );
  return c;
}

function wrap(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  line: number,
  fill: string,
  font: string,
) {
  g.fillStyle = fill;
  g.font = font;
  let row = "";
  for (const word of text.split(" ")) {
    const next = row ? row + " " + word : word;
    if (g.measureText(next).width > width && row) {
      g.fillText(row, x, y);
      row = word;
      y += line;
    } else row = next;
  }
  if (row) g.fillText(row, x, y);
  return y + line;
}

export function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, "image/png");
}
