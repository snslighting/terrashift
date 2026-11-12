import type { BBox, BrowseBand, BrowseSet, Position, Product } from "./types";

/**
 * NASA's public NISAR preview ("browse") images.
 *
 * Every NISAR product record in NASA's catalog links PNG previews that need no
 * login: a georeferenced lat/lon composite, a 100 px thumbnail and, for GCOV,
 * one greyscale image per frequency and polarization. TerraShift shows them as
 * pictures, never as measurements.
 */

const POLARIZATION: Record<string, string> = { HHHH: "HH", HVHV: "HV", VHVH: "VH", VVVV: "VV" };

/** Sort HH before HV before VH before VV, frequency A before B. */
const bandOrder = (b: BrowseBand) => b.frequency + ["HH", "HV", "VH", "VV"].indexOf(b.polarization);

export function browseLinks(urls: { URL: string; Type?: string }[] | undefined): BrowseSet {
  const set: BrowseSet = { bands: [] };
  for (const { URL: url } of urls ?? []) {
    if (!url.startsWith("https://") || !url.includes("/BROWSE/") || !url.endsWith(".png")) continue;
    const name = url.slice(url.lastIndexOf("/") + 1);
    if (name.endsWith("_LATLON_thumbnail.png")) set.thumbnail = url;
    else if (name.endsWith("_LATLON.png")) set.combined = url;
    else {
      const m = name.match(/_NATIVE_([AB])_([HV]{4})\.png$/);
      if (m && POLARIZATION[m[2]])
        set.bands.push({
          id: `${m[1]}_${POLARIZATION[m[2]]}`,
          frequency: m[1] as "A" | "B",
          polarization: POLARIZATION[m[2]],
          url,
        });
    }
  }
  set.bands.sort((a, b) => bandOrder(a).localeCompare(bandOrder(b)));
  return set;
}

/** West, south, east, north of a ring; longitudes are unwrapped across the 180° line (east may exceed 180). */
export function ringBounds(ring: Position[]): BBox {
  let lons = ring.map((p) => p[0]);
  if (Math.max(...lons) - Math.min(...lons) > 180) lons = lons.map((x) => (x < 0 ? x + 360 : x));
  const lats = ring.map((p) => p[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export function footprintBounds(product: Product): BBox | null {
  const g = product.geometry;
  if (!g) return null;
  const rings: Position[] =
    g.type === "Polygon"
      ? (g.coordinates[0] as Position[])
      : g.type === "MultiPolygon"
        ? (g.coordinates.flatMap((p) => p[0]) as Position[])
        : [];
  return rings.length ? ringBounds(rings) : null;
}

/** Pixel extent of an image's valid data: first and last valid column and row. */
export interface Extent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Corner coordinates for drawing an image on the map.
 *
 * NASA's preview PNGs carry no georeferencing, and the data sits inside an
 * uneven margin. The footprint polygon's west/east/south/north extremes are the
 * valid data's leftmost/rightmost/lowest/highest pixels, so matching those
 * two boxes places the image. Checked on real products: footprint corners
 * land within about 1 km (Tunis GUNW) and 2 km (Pantanal GCOV composite) of
 * the image's corners, and within about 4 km for single-polarization images,
 * which come in the product's own map grid. Scenes are about 300 km wide.
 * Returns top-left, top-right, bottom-right, bottom-left.
 */
export function placeImage(extent: Extent, width: number, height: number, bounds: BBox): Position[] {
  const [w, s, e, n] = bounds,
    // Pixel edges, not centres: the last valid column ends at x1 + 1.
    lonPerPx = (e - w) / (extent.x1 + 1 - extent.x0),
    latPerPx = (n - s) / (extent.y1 + 1 - extent.y0),
    left = w - extent.x0 * lonPerPx,
    right = left + width * lonPerPx,
    top = n + extent.y0 * latPerPx,
    bottom = top - height * latPerPx;
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

/**
 * Make "no data" transparent and measure the valid extent. No-data is either
 * already transparent (GUNW) or near-black connected to the image border
 * (GCOV). Flooding only from the border keeps dark water inside the scene.
 */
export function maskNoData(rgba: Uint8ClampedArray, width: number, height: number, threshold = 6): Extent | null {
  const n = width * height,
    seen = new Uint8Array(n),
    stack: number[] = [];
  const empty = (i: number) => {
    const o = i * 4;
    return (
      rgba[o + 3] === 0 ||
      (rgba[o] <= threshold && rgba[o + 1] <= threshold && rgba[o + 2] <= threshold)
    );
  };
  const push = (i: number) => {
    if (!seen[i] && empty(i)) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (stack.length) {
    const i = stack.pop()!,
      x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < n - width) push(i + width);
  }
  let x0 = width,
    x1 = -1,
    y0 = height,
    y1 = -1;
  for (let i = 0; i < n; i++) {
    if (seen[i] || rgba[i * 4 + 3] === 0) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    const x = i % width,
      y = (i - x) / width;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}

export interface PreviewImage {
  /** blob: URL of the masked PNG. */
  url: string;
  coordinates: Position[];
  width: number;
  height: number;
  /** True for images in the product's own map grid, placed approximately. */
  approximate: boolean;
}

const MAX_SIDE = 2048;
const done = new Map<string, Promise<PreviewImage>>();

async function fetchBytes(url: string, onProgress?: (fraction: number) => void, signal?: AbortSignal) {
  const response = await fetch(url, { signal, mode: "cors" });
  if (!response.ok) throw Error(`NASA's image server returned ${response.status}.`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total || !onProgress) return response.blob();
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new Blob(parts as BlobPart[], { type: "image/png" });
}

/**
 * Download, mask and place one preview image. Results are cached per URL, so
 * scrubbing back and forth does not download again.
 */
export function loadPreview(
  url: string,
  bounds: BBox,
  approximate: boolean,
  onProgress?: (fraction: number) => void,
): Promise<PreviewImage> {
  let pending = done.get(url);
  if (!pending) {
    pending = (async () => {
      const blob = await fetchBytes(url, onProgress);
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height)),
        width = Math.round(bitmap.width * scale),
        height = Math.round(bitmap.height * scale),
        canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext("2d", { willReadFrequently: true })!;
      g.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const data = g.getImageData(0, 0, width, height),
        extent = maskNoData(data.data, width, height);
      if (!extent) throw Error("This preview image is empty.");
      g.putImageData(data, 0, 0);
      const out = await new Promise<Blob>((ok, fail) =>
        canvas.toBlob((b) => (b ? ok(b) : fail(Error("Could not prepare the image."))), "image/png"),
      );
      return {
        url: URL.createObjectURL(out),
        coordinates: placeImage(extent, width, height, bounds),
        width,
        height,
        approximate,
      };
    })();
    pending.catch(() => done.delete(url));
    done.set(url, pending);
  }
  return pending;
}

/** Image choices for a product: the combined composite, then each frequency/polarization. */
export function previewChoices(product: Product) {
  const choices: { id: string; label: string; url: string; approximate: boolean }[] = [];
  if (product.browse.combined)
    choices.push({
      id: "combined",
      label: product.kind === "GCOV" ? "Combined" : "Interferogram",
      url: product.browse.combined,
      approximate: false,
    });
  const freqs = new Set(product.browse.bands.map((b) => b.frequency));
  for (const b of product.browse.bands)
    choices.push({
      id: b.id,
      label: freqs.size > 1 ? `${b.polarization} · ${b.frequency}` : b.polarization,
      url: b.url,
      approximate: true,
    });
  return choices;
}
