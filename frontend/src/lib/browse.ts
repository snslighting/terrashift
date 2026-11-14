import type { BBox, BrowseBand, BrowseSet, Position, Product } from "./types";
import { mercatorLat, mercatorY, nativeGrids } from "./projection";

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

/** All outer-ring points of a product's footprint (every part of a multipolygon). */
export function footprintRing(product: Product): Position[] {
  const g = product.geometry;
  if (!g) return [];
  return g.type === "Polygon"
    ? (g.coordinates[0] as Position[])
    : g.type === "MultiPolygon"
      ? (g.coordinates.flatMap((p) => p[0]) as Position[])
      : [];
}

export function footprintBounds(product: Product): BBox | null {
  const ring = footprintRing(product);
  return ring.length ? ringBounds(ring) : null;
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
 * Corners for a single-polarization image, which NASA renders in the product's own map grid
 * (UTM, or polar stereographic near the poles). The grid is chosen by shape: the footprint's
 * box in the right grid has the same width-to-height ratio as the image's valid data. The
 * valid data's box is matched to the footprint's box in that grid, and the four image corners
 * are projected back to longitude and latitude, so the map draws a slightly turned quad.
 *
 * Checked against OpenStreetMap coastlines (scripts/check_preview_alignment.py): within about
 * 0.2-0.6 km on GCOV scenes in Libya (UTM 33N) and Iceland (EPSG:3413, two orbits), where
 * stretching the image over a longitude/latitude box was 1.3 km to more than 5 km off.
 */
export function placeNative(
  extent: Extent,
  width: number,
  height: number,
  ring: Position[],
): { coordinates: Position[]; grid: string; mismatch: number } {
  const imageAspect = (extent.x1 + 1 - extent.x0) / (extent.y1 + 1 - extent.y0);
  let best: { mismatch: number; grid: ReturnType<typeof nativeGrids>[number]; box: BBox } | undefined;
  for (const grid of nativeGrids(ring)) {
    const p = ring.map(([lon, lat]) => grid.forward(lon, lat)),
      xs = p.map((v) => v[0]),
      ys = p.map((v) => v[1]),
      box: BBox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      mismatch = Math.abs(Math.log((box[2] - box[0]) / (box[3] - box[1]) / imageAspect));
    if (!best || mismatch < best.mismatch) best = { mismatch, grid, box };
  }
  const { grid, box, mismatch } = best!,
    [xmin, , xmax, ymax] = box,
    sx = (xmax - xmin) / (extent.x1 + 1 - extent.x0),
    sy = (box[3] - box[1]) / (extent.y1 + 1 - extent.y0);
  const corners = (
    [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ] as Position[]
  ).map(([px, py]) => grid.inverse(xmin + (px - extent.x0) * sx, ymax - (py - extent.y0) * sy));
  // Keep longitudes continuous across the 180° line, as the map needs.
  const base = corners[0][0];
  return {
    coordinates: corners.map(([lon, lat]) => [lon + 360 * Math.round((base - lon) / 360), lat] as Position),
    grid: grid.name,
    mismatch,
  };
}

/**
 * NASA's lat/lon previews have rows evenly spaced in latitude, but the map stretches an image
 * evenly in Web Mercator. Left as is, the middle of a scene shifts toward the equator: about
 * 1.8 km at 33°N and more than 5 km at 64°N, measured against coastlines. This re-spaces the
 * rows (nearest row, no blending) so the map puts every row at its latitude. `top` and
 * `bottom` are the latitudes of the image's outer edges.
 */
export function mercatorRows(rgba: Uint8ClampedArray, width: number, height: number, top: number, bottom: number) {
  const out = new Uint8ClampedArray(rgba.length),
    row = width * 4,
    yt = mercatorY(top),
    yb = mercatorY(bottom);
  for (let i = 0; i < height; i++) {
    const lat = mercatorLat(yt + ((i + 0.5) / height) * (yb - yt)),
      src = Math.min(height - 1, Math.max(0, Math.floor(((top - lat) / (top - bottom)) * height)));
    out.set(rgba.subarray(src * row, src * row + row), i * row);
  }
  return out;
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
  /** Unique id of this prepared image (used to keep it in memory while shown). */
  id: string;
  /**
   * The masked picture, already decoded. It goes to the map as is: no PNG
   * re-encoding (measured at about 2 s for a 2037 x 2012 preview) and no
   * second decode.
   */
  bitmap: ImageBitmap;
  coordinates: Position[];
  width: number;
  height: number;
  /**
   * How it was placed: "lat/lon" for NASA's lat/lon composite, else the map grid of a
   * single-polarization image (e.g. "UTM zone 33N"). Placement always comes from the
   * footprint, not from coordinates in the file, so it is approximate (about 1-2 km).
   */
  grid: string;
}

/** Longest side, in pixels, of a preview placed on the map. Larger images are scaled down. */
export const MAX_SIDE = 2048;
/** At most this many prepared previews are kept in memory (images on screen are never dropped). */
export const MAX_CACHED = 4;

/** Size to draw an image at: the long side is at most `max` pixels and the aspect ratio is kept. */
export function fitSize(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}

/** Width and height from a PNG file's header, without decoding the picture. */
export function pngSize(head: Uint8Array): { width: number; height: number } | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (head.length < 24 || sig.some((v, i) => head[i] !== v)) return null;
  // Chunk type at bytes 12-15 must be IHDR; width and height follow, big-endian.
  if (String.fromCharCode(...head.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(head.buffer, head.byteOffset, 24);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/**
 * Prepared previews, least recently used first. When more than `capacity` are
 * held, the oldest one that is not on screen (pinned) is dropped and its
 * bitmap closed, so the browser frees the picture at once.
 */
export class PreviewCache {
  private items = new Map<string, PreviewImage>();
  private pins = new Map<string, number>();
  constructor(
    private capacity = MAX_CACHED,
    private release: (image: PreviewImage) => void = (image) => image.bitmap.close?.(),
  ) {}
  get size() {
    return this.items.size;
  }
  get(key: string) {
    const hit = this.items.get(key);
    if (hit) {
      this.items.delete(key);
      this.items.set(key, hit);
    }
    return hit;
  }
  set(key: string, image: PreviewImage) {
    const old = this.items.get(key);
    if (old && old.id !== image.id) this.release(old);
    this.items.delete(key);
    this.items.set(key, image);
    this.trim();
  }
  /** Keep an image while it is on screen; call the returned function when it leaves. */
  pin(id: string) {
    this.pins.set(id, (this.pins.get(id) ?? 0) + 1);
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      const n = (this.pins.get(id) ?? 1) - 1;
      if (n > 0) this.pins.set(id, n);
      else this.pins.delete(id);
      this.trim();
    };
  }
  private trim() {
    // The newest entry is about to be shown, so it is never the one dropped.
    const newest = [...this.items.keys()].at(-1);
    for (const [key, image] of this.items) {
      if (this.items.size <= this.capacity) return;
      if (key === newest || this.pins.has(image.id)) continue;
      this.items.delete(key);
      this.release(image);
    }
  }
}

export type Progress = (fraction: number, loaded: number, total: number) => void;
/** `native`: the image is in the product's own map grid (single polarization), else lat/lon. */
export type Prepare = (url: string, footprint: Position[], native: boolean, signal: AbortSignal, onProgress: Progress) => Promise<PreviewImage>;

const abortError = (signal: AbortSignal) =>
  signal.reason instanceof Error ? signal.reason : new DOMException("The preview request was cancelled.", "AbortError");

/**
 * A preview loader: one download per image even when several views ask for it
 * (the map and the compare dialog), cancelled as soon as no view wants it any
 * more, and finished images kept in a small cache.
 */
export function createPreviewLoader(prepare: Prepare, cache = new PreviewCache()) {
  const inflight = new Map<
    string,
    { promise: Promise<PreviewImage>; controller: AbortController; users: number; listeners: Set<Progress> }
  >();
  function load(
    url: string,
    footprint: Position[],
    native: boolean,
    options: { onProgress?: Progress; signal?: AbortSignal } = {},
  ): Promise<PreviewImage> {
    const { onProgress, signal } = options;
    if (signal?.aborted) return Promise.reject(abortError(signal));
    const hit = cache.get(url);
    if (hit) return Promise.resolve(hit);
    let job = inflight.get(url);
    if (!job) {
      const controller = new AbortController(),
        listeners = new Set<Progress>();
      const created = {
        controller,
        users: 0,
        listeners,
        promise: prepare(url, footprint, native, controller.signal, (f, l, t) => listeners.forEach((fn) => fn(f, l, t))),
      };
      created.promise.then(
        (image) => {
          if (inflight.get(url) === created) inflight.delete(url);
          cache.set(url, image);
        },
        () => {
          if (inflight.get(url) === created) inflight.delete(url);
        },
      );
      inflight.set(url, created);
      job = created;
    }
    const current = job;
    current.users++;
    if (onProgress) current.listeners.add(onProgress);
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      current.users--;
      if (onProgress) current.listeners.delete(onProgress);
      if (current.users <= 0 && inflight.get(url) === current) {
        inflight.delete(url);
        current.controller.abort(signal?.reason);
      }
    };
    return new Promise<PreviewImage>((ok, fail) => {
      const onAbort = () => {
        leave();
        fail(abortError(signal!));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      current.promise.then(
        (image) => {
          signal?.removeEventListener("abort", onAbort);
          leave();
          ok(image);
        },
        (error) => {
          signal?.removeEventListener("abort", onAbort);
          leave();
          fail(error);
        },
      );
    });
  }
  return { load, cache, inflight: () => inflight.size };
}

/** Download with progress, reported at most every 5% so the page is not re-drawn for every chunk. */
async function fetchBytes(url: string, signal: AbortSignal, onProgress: Progress) {
  const response = await fetch(url, { signal, mode: "cors" });
  if (!response.ok) throw Error(`NASA's image server returned ${response.status}.`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (!response.body || !total) return response.blob();
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let got = 0,
    reported = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    parts.push(value);
    got += value.length;
    const fraction = Math.min(1, got / total);
    if (fraction - reported >= 0.05 || fraction === 1) {
      reported = fraction;
      onProgress(fraction, got, total);
    }
  }
  return new Blob(parts as BlobPart[], { type: "image/png" });
}

/**
 * Download, scale, mask and place one preview in the browser. The image is
 * decoded straight to at most MAX_SIDE pixels on its long side, and the work
 * stops between steps once the request is cancelled.
 */
let serial = 0;
const prepareInBrowser: Prepare = async (url, footprint, native, signal, onProgress) => {
  const blob = await fetchBytes(url, signal, onProgress);
  signal.throwIfAborted();
  const size = pngSize(new Uint8Array(await blob.slice(0, 24).arrayBuffer()));
  const target = size ? fitSize(size.width, size.height) : null;
  const bitmap =
    target && target.scale < 1
      ? await createImageBitmap(blob, { resizeWidth: target.width, resizeHeight: target.height, resizeQuality: "high" })
      : await createImageBitmap(blob);
  try {
    signal.throwIfAborted();
    // Fallback for a missing header or a browser that ignores the resize options.
    const { width, height } = fitSize(bitmap.width, bitmap.height),
      canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bitmap, 0, 0, width, height);
    const data = g.getImageData(0, 0, width, height),
      extent = maskNoData(data.data, width, height);
    if (!extent) throw Error("This preview image is empty.");
    signal.throwIfAborted();
    let coordinates: Position[], grid: string, pixels: ImageData;
    if (native) {
      ({ coordinates, grid } = placeNative(extent, width, height, footprint));
      pixels = data;
    } else {
      coordinates = placeImage(extent, width, height, ringBounds(footprint));
      grid = "lat/lon";
      pixels = new ImageData(mercatorRows(data.data, width, height, coordinates[0][1], coordinates[3][1]), width, height);
    }
    const masked = await createImageBitmap(pixels);
    // Free the canvas memory now rather than at the next garbage collection.
    canvas.width = canvas.height = 0;
    if (signal.aborted) {
      masked.close();
      signal.throwIfAborted();
    }
    return {
      id: `${url}#${++serial}`,
      bitmap: masked,
      coordinates,
      width,
      height,
      grid,
    };
  } finally {
    bitmap.close?.();
  }
};

const browserLoader = createPreviewLoader(prepareInBrowser);
/** Load one NASA preview (shared, cancellable, cached). */
export const loadPreview = browserLoader.load;
/** Keep a preview in memory while it is on screen. */
export const holdPreview = (id: string) => browserLoader.cache.pin(id);

/** Image choices for a product: the combined composite, then each frequency/polarization. */
export function previewChoices(product: Product) {
  const choices: { id: string; label: string; url: string; native: boolean }[] = [];
  if (product.browse.combined)
    choices.push({
      id: "combined",
      label: product.kind === "GCOV" ? "Combined" : "Interferogram",
      url: product.browse.combined,
      native: false,
    });
  const freqs = new Set(product.browse.bands.map((b) => b.frequency));
  for (const b of product.browse.bands)
    choices.push({
      id: b.id,
      label: freqs.size > 1 ? `${b.polarization} · ${b.frequency}` : b.polarization,
      url: b.url,
      native: true,
    });
  return choices;
}
