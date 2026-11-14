import type {
  BBox,
  Catalog,
  Discovery,
  Grid,
  LayerEntry,
  Pair,
  Place,
  Product,
  ProductKind,
  Selection,
  StudyCase,
} from "./types";
import { decodeGrid, parseCoordinates, splitBBox } from "./science";
import { browseLinks } from "./browse";
export const base = import.meta.env.BASE_URL;
export const asset = (path: string) => base + path.replace(/^\//, "");
const api = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const backendConfigured = Boolean(api);
export const CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json";
/**
 * NASA CMR record of one granule by name. CMR refuses a name-only query across
 * all collections, so the provider (ASF, which hosts NISAR) is named too.
 */
export const cmrGranuleUrl = (granule: string) =>
  `${CMR}?provider=ASF&granule_ur=${encodeURIComponent(granule)}`;
export const COLLECTION = "NISAR_L2_GUNW_PROVISIONAL_V1";
/** Catalog short names of the two public NISAR product families TerraShift searches. */
export const COLLECTIONS: Record<ProductKind, string> = {
  GUNW: COLLECTION,
  GCOV: "NISAR_L2_GCOV_PROVISIONAL_V1",
};
/** Products requested per family and search box. */
export const PAGE_SIZE = 100;
let evidence: Promise<Catalog> | undefined;
/** Small study-area catalog (~30 kB). Grids load separately, only when drawn. */
export const loadCatalog = () =>
  (evidence ??= request<Catalog>(asset("evidence/catalog.json")).catch(
    (error) => {
      evidence = undefined;
      throw error;
    },
  ));
const grids = new Map<string, Promise<Grid>>();
async function bytes(path: string) {
  const response = await fetch(asset("evidence/" + path));
  if (!response.ok) throw Error(`Evidence grid unavailable (${response.status}).`);
  // Hosts that serve only standard web types get the same bytes as base64 in JSON
  // (scripts/hosted.mjs); the decoded grid is identical.
  if (path.endsWith(".json")) {
    const { base64 } = (await response.json()) as { base64: string };
    const raw = atob(base64),
      out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out.buffer;
  }
  return response.arrayBuffer();
}
export function loadGrid(pair: Pair, entry: LayerEntry): Promise<Grid> {
  let pending = grids.get(entry.file);
  if (!pending) {
    pending = Promise.all([bytes(entry.file), bytes(entry.counts)]).then(
      ([data, counts]) =>
        decodeGrid(
          data,
          counts,
          pair.grid.size,
          entry.step,
          entry.nodata,
          entry.count_type,
        ),
    );
    pending.catch(() => grids.delete(entry.file));
    grids.set(entry.file, pending);
  }
  return pending;
}
export function findPair(catalog: Catalog | undefined, pairId: string | null) {
  for (const c of catalog?.cases ?? [])
    for (const p of c.pairs) if (p.id === pairId) return { study: c, pair: p };
  return undefined;
}
export function caseById(catalog: Catalog | undefined, id: string | null) {
  return catalog?.cases.find((c: StudyCase) => c.id === id);
}
export async function request<T>(
  url: string,
  signal?: AbortSignal,
  options?: RequestInit,
): Promise<T> {
  const ctrl = new AbortController(),
    timer = setTimeout(() => ctrl.abort(), 25000);
  const abort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(url, { ...options, signal: ctrl.signal });
    if (!response.ok)
      throw Error(
        response.status === 429
          ? "The data service is busy. Please wait and try again."
          : `Data service returned ${response.status}. Please try again.`,
      );
    return (await response.json()) as T;
  } catch (e) {
    if (ctrl.signal.aborted)
      throw Error(
        signal?.aborted
          ? "Search cancelled."
          : "The data service took too long. Please retry.",
      );
    if (e instanceof TypeError)
      throw Error(
        "The data service could not be reached. Check your connection and retry.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const p = parseCoordinates(query);
  if (p)
    return [
      {
        name: `${p[1]}°, ${p[0]}°`,
        longitude: p[0],
        latitude: p[1],
        source: "Entered WGS84 coordinates",
      },
    ];
  if (query.trim().length < 2)
    throw Error("Enter a place name or latitude, longitude.");
  if (api)
    return request<Place[]>(
      `${api}/api/locations?q=${encodeURIComponent(query)}`,
      signal,
    );
  try {
    return await photon(query, signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    // The public geocoder is unreachable (offline, blocked or busy): use built-in places.
    const found = offlinePlaces(query, await loadCatalog().catch(() => undefined));
    if (found.length) return found;
    throw Error(
      "Place search is unreachable right now. Enter latitude, longitude (for example 10.6, -67.0) or pick a study area.",
    );
  }
}
/** Well-known places for offline search; coordinates are city centres (WGS84). */
const builtInPlaces: [string, number, number][] = [
  ["Tashkent, Uzbekistan", 69.24, 41.3],
  ["Samarkand, Uzbekistan", 66.96, 39.65],
  ["Almaty, Kazakhstan", 76.89, 43.24],
  ["Bishkek, Kyrgyzstan", 74.59, 42.87],
  ["Jakarta, Indonesia", 106.85, -6.21],
  ["Ende, Flores, Indonesia", 121.66, -8.84],
  ["Manila, Philippines", 120.98, 14.6],
  ["Tokyo, Japan", 139.69, 35.68],
  ["Kathmandu, Nepal", 85.32, 27.72],
  ["Dhaka, Bangladesh", 90.41, 23.81],
  ["New Delhi, India", 77.21, 28.61],
  ["Bengaluru, India", 77.59, 12.97],
  ["Istanbul, Türkiye", 28.98, 41.01],
  ["Cairo, Egypt", 31.24, 30.04],
  ["Nairobi, Kenya", 36.82, -1.29],
  ["Venice, Italy", 12.33, 45.44],
  ["Naples, Italy", 14.27, 40.85],
  ["Reykjavík, Iceland", -21.94, 64.15],
  ["Caracas, Venezuela", -66.88, 10.49],
  ["Lima, Peru", -77.04, -12.05],
  ["Santiago, Chile", -70.67, -33.45],
  ["Mexico City, Mexico", -99.13, 19.43],
  ["Fresno, California, United States", -119.79, 36.74],
  ["Los Angeles, California, United States", -118.24, 34.05],
  ["San Francisco, California, United States", -122.42, 37.77],
  ["Houston, Texas, United States", -95.37, 29.76],
  ["New Orleans, Louisiana, United States", -90.07, 29.95],
  ["Anchorage, Alaska, United States", -149.9, 61.22],
];
const fold = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function offlinePlaces(query: string, catalog?: Catalog): Place[] {
  const q = fold(query);
  const study = (catalog?.cases ?? [])
    .filter((c) => fold(`${c.name} ${c.region}`).includes(q))
    .map((c) => ({
      name: `${c.name}, ${c.region}`,
      longitude: (c.bbox[0] + c.bbox[2]) / 2,
      latitude: (c.bbox[1] + c.bbox[3]) / 2,
      source: "TerraShift study area (offline search)",
    }));
  const places = builtInPlaces
    .filter(([name]) => fold(name).includes(q))
    .map(([name, longitude, latitude]) => ({
      name,
      longitude,
      latitude,
      source: "Built-in place list (offline search)",
    }));
  return [...study, ...places].slice(0, 5);
}
async function photon(query: string, signal?: AbortSignal): Promise<Place[]> {
  const data = await request<{
    features: {
      geometry: { coordinates: [number, number] };
      properties: Record<string, string>;
    }[];
  }>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`,
    signal,
  );
  return data.features.map((f) => ({
    name: [
      f.properties.name,
      f.properties.city,
      f.properties.state,
      f.properties.country,
    ]
      .filter((v, i, a) => v && a.indexOf(v) === i)
      .join(", "),
    longitude: f.geometry.coordinates[0],
    latitude: f.geometry.coordinates[1],
    source: "Photon / OpenStreetMap",
  }));
}
type UMM = {
  GranuleUR: string;
  RelatedUrls?: { URL: string; Type?: string }[];
  TemporalExtent?: { RangeDateTime?: { BeginningDateTime?: string } };
  CollectionReference?: { ShortName: string };
  AdditionalAttributes?: { Name: string; Values: string[] }[];
  SpatialExtent?: {
    HorizontalSpatialDomain?: {
      Geometry?: {
        GPolygons?: {
          Boundary: { Points: { Longitude: number; Latitude: number }[] };
        }[];
        BoundingRectangles?: {
          WestBoundingCoordinate: number;
          SouthBoundingCoordinate: number;
          EastBoundingCoordinate: number;
          NorthBoundingCoordinate: number;
        }[];
      };
    };
  };
};
export function normalizeProduct(
  item: { meta: { "concept-id": string }; umm: UMM },
  catalog?: Catalog,
): Product {
  const u = item.umm,
    a = Object.fromEntries(
      (u.AdditionalAttributes ?? []).map((r) => [r.Name, r.Values]),
    ),
    one = (k: string) => (a[k]?.length === 1 ? a[k][0] : null);
  const polygons =
    u.SpatialExtent?.HorizontalSpatialDomain?.Geometry?.GPolygons;
  const rectangles =
    u.SpatialExtent?.HorizontalSpatialDomain?.Geometry?.BoundingRectangles;
  let geometry: GeoJSON.Geometry | null = null;
  if (polygons?.length) {
    const rings = polygons.map((p) => {
      const points = p.Boundary.Points.map((v) => [v.Longitude, v.Latitude]);
      if (
        points.length &&
        JSON.stringify(points[0]) !== JSON.stringify(points.at(-1))
      )
        points.push(points[0]);
      return [points];
    });
    geometry = { type: "MultiPolygon", coordinates: rings };
  } else if (rectangles?.length) {
    geometry = {
      type: "MultiPolygon",
      coordinates: rectangles.map((b) => [
        [
          [b.WestBoundingCoordinate, b.SouthBoundingCoordinate],
          [b.EastBoundingCoordinate, b.SouthBoundingCoordinate],
          [b.EastBoundingCoordinate, b.NorthBoundingCoordinate],
          [b.WestBoundingCoordinate, b.NorthBoundingCoordinate],
          [b.WestBoundingCoordinate, b.SouthBoundingCoordinate],
        ],
      ]),
    };
  }
  let cache: { study: StudyCase; pair: Pair } | undefined;
  for (const study of catalog?.cases ?? [])
    for (const pair of study.pairs)
      if (pair.granule === u.GranuleUR) cache = { study, pair };
  const collection = u.CollectionReference?.ShortName ?? COLLECTION,
    kind: ProductKind =
      collection.includes("GCOV") || u.GranuleUR.includes("_GCOV_") ? "GCOV" : "GUNW";
  const before = kind === "GUNW" ? one("REFERENCE_ZERO_DOPPLER_START_TIME") : null,
    after = kind === "GUNW" ? one("SECONDARY_ZERO_DOPPLER_START_TIME") : null,
    acquired = u.TemporalExtent?.RangeDateTime?.BeginningDateTime ?? null;
  return {
    id: item.meta["concept-id"],
    granule: u.GranuleUR,
    collection,
    kind,
    date: (kind === "GUNW" ? after : acquired)?.slice(0, 10) ?? null,
    browse: browseLinks(u.RelatedUrls),
    frequencies: a.FREQUENCIES ?? [],
    before,
    after,
    track: one("TRACK_NUMBER") ? +one("TRACK_NUMBER")! : null,
    frame: one("FRAME_NUMBER") ? +one("FRAME_NUMBER")! : null,
    orbit: one("ASCENDING_DESCENDING"),
    polarizations: a.FREQUENCY_A_POLARIZATION ?? [],
    geometry,
    source_url: `https://cmr.earthdata.nasa.gov/search/concepts/${encodeURIComponent(item.meta["concept-id"])}.umm_json`,
    data_url:
      (u.RelatedUrls ?? []).find(
        (r) => r.Type === "GET DATA" && r.URL.startsWith("https://") && r.URL.endsWith(".h5"),
      )?.URL ?? null,
    download_auth_required: true,
    cached_pair: cache?.pair.id ?? null,
    cached_case: cache?.study.id ?? null,
    status: cache ? "measured_provisional" : "processing_unavailable",
    metadata_warnings: [
      ...(!geometry ? ["No displayable catalog footprint."] : []),
      ...(kind === "GUNW" && (!before || !after) ? ["Acquisition pair metadata incomplete."] : []),
    ],
  };
}
const cache = new Map<string, { at: number; data: Discovery }>();
export async function discover(
  selection: Selection,
  start: string,
  end: string,
  signal?: AbortSignal,
): Promise<Discovery> {
  if (!start || !end || start > end)
    throw Error("Select a chronological date range.");
  const bbox = selection.bbox,
    key = JSON.stringify([selection, start, end]);
  const stored = cache.get(key);
  if (stored && Date.now() - stored.at < 300000)
    return { ...stored.data, cached: true };
  let data: Discovery;
  if (api) {
    const params = new URLSearchParams({
      bbox: bbox.join(","),
      start,
      end,
      limit: "50",
    });
    if (selection.polygon)
      params.set("polygon", JSON.stringify(selection.polygon));
    data = await request<Discovery>(`${api}/api/discovery?${params}`, signal);
    // The optional backend searches GUNW only and returns products without previews.
    data.products = data.products.map((p) => ({
      ...p,
      kind: p.kind ?? "GUNW",
      date: p.date ?? p.after?.slice(0, 10) ?? null,
      browse: p.browse ?? { bands: [] },
      frequencies: p.frequencies ?? [],
    }));
  } else {
    // Discovery must remain usable when the optional local research export is unavailable.
    const catalog = await loadCatalog().catch(() => undefined);
    let results;
    try {
      results = await liveSearch();
    } catch (error) {
      if (signal?.aborted || !catalog) throw error;
      // NASA's catalog is unreachable (offline or blocked by the host): show the
      // processed products stored with TerraShift that match, clearly labelled.
      return offlineDiscovery(selection, start, end, catalog);
    }
    // Both product families, every box of a dateline-split area, in parallel.
    async function liveSearch() {
      const boxes = splitBBox(bbox);
      return Promise.all(
        (Object.keys(COLLECTIONS) as ProductKind[]).flatMap((kind) =>
          boxes.map(async (box) => {
            const params = new URLSearchParams({
              short_name: COLLECTIONS[kind],
              bounding_box: box.join(","),
              temporal: `${start}T00:00:00Z,${end}T23:59:59Z`,
              page_size: String(PAGE_SIZE),
              "sort_key[]": "-start_date",
            });
            if (selection.polygon && boxes.length === 1) {
              params.delete("bounding_box");
              params.set("polygon", selection.polygon.flat().join(","));
            }
            const result = await request<{
              items: { meta: { "concept-id": string }; umm: UMM }[];
              hits: number;
            }>(`${CMR}?${params}`, signal);
            return { kind, split: boxes.length > 1, ...result };
          }),
        ),
      );
    }
    const products = [
      ...new Map(
        results
          .flatMap((r) => r.items)
          .map((i) => {
            const p = normalizeProduct(i, catalog);
            return [p.id, p];
          }),
      ).values(),
    ];
    const hitsByKind = Object.fromEntries(
      (Object.keys(COLLECTIONS) as ProductKind[]).map((k) => {
        const r = results.filter((x) => x.kind === k);
        return [k, r.length === 1 && !r[0].split ? r[0].hits : null];
      }),
    ) as Record<ProductKind, number | null>;
    data = {
      products,
      returned: products.length,
      hits:
        hitsByKind.GUNW != null && hitsByKind.GCOV != null
          ? hitsByKind.GUNW + hitsByKind.GCOV
          : null,
      hits_by_kind: hitsByKind,
      bounded: results.some(
        (r) => r.items.length >= PAGE_SIZE || r.hits > r.items.length,
      ),
      queried_utc: new Date().toISOString(),
      source: "NASA CMR · direct public metadata",
      query: { bbox, start, end },
    };
  }
  cache.set(key, { at: Date.now(), data });
  return data;
}
/** Stored, processed products that overlap a search, for when the live catalog is unreachable. */
export function offlineDiscovery(
  selection: Selection,
  start: string,
  end: string,
  catalog: Catalog,
): Discovery {
  const boxes = splitBBox(selection.bbox);
  const products: Product[] = [];
  for (const study of catalog.cases)
    for (const pair of study.pairs) {
      const lons = pair.coordinates.map((c) => c[0]),
        lats = pair.coordinates.map((c) => c[1]),
        w = Math.min(...lons),
        e = Math.max(...lons),
        s = Math.min(...lats),
        n = Math.max(...lats);
      const overlaps = boxes.some((b) => b[0] <= e && b[2] >= w && b[1] <= n && b[3] >= s);
      const inTime = pair.before <= end && pair.after >= start;
      if (!overlaps || !inTime) continue;
      const ring = [...pair.coordinates, pair.coordinates[0]];
      products.push({
        id: pair.granule,
        granule: pair.granule,
        collection: COLLECTION,
        kind: "GUNW",
        date: pair.after,
        browse: { bands: [] },
        frequencies: [],
        before: pair.before,
        after: pair.after,
        track: pair.track ?? null,
        frame: pair.frame ?? null,
        orbit: pair.orbit ?? null,
        polarizations: [],
        geometry: { type: "Polygon", coordinates: [ring] },
        source_url: cmrGranuleUrl(pair.granule),
        download_auth_required: true,
        cached_pair: pair.id,
        cached_case: study.id,
        status: study.status,
        metadata_warnings: [
          "Stored with TerraShift: NASA's live catalog could not be reached. The outline is the processed map extent.",
        ],
      });
    }
  return {
    products,
    returned: products.length,
    hits: null,
    bounded: false,
    queried_utc: new Date().toISOString(),
    source: "Stored TerraShift evidence · NASA catalog unreachable",
    query: { bbox: selection.bbox, start, end },
    offline: true,
  };
}
export async function requestProcessing(
  product: Product,
  selection: Selection,
) {
  if (!api)
    return {
      status: "processing_unavailable",
      message:
        "This deployment has no processing worker for new products. Open one of the processed study areas, or access the product in Earthdata Search.",
    };
  return request<{ status: string; message: string; job_id?: string }>(
    `${api}/api/jobs`,
    undefined,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: product.id, bbox: selection.bbox }),
    },
  );
}
export const getJob = (id: string) =>
  request<{ status: string; message: string; result?: unknown }>(
    `${api}/api/jobs/${encodeURIComponent(id)}`,
  );
export function productCollection(
  products: Product[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: products
      .filter((p) => p.geometry)
      .map((p) => ({
        type: "Feature",
        id: p.id,
        properties: { id: p.id, cached: p.cached_pair != null ? 1 : 0, kind: p.kind },
        geometry: p.geometry!,
      })),
  };
}
export function bboxFeature(b: BBox): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: splitBBox(b).map((box) => ({
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [box[0], box[1]],
            [box[2], box[1]],
            [box[2], box[3]],
            [box[0], box[3]],
            [box[0], box[1]],
          ],
        ],
      },
    })),
  };
}
