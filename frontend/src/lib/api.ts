import type {
  BBox,
  Catalog,
  Discovery,
  Grid,
  LayerEntry,
  Pair,
  Place,
  Product,
  Selection,
  StudyCase,
} from "./types";
import { decodeGrid, parseCoordinates, splitBBox } from "./science";
export const base = import.meta.env.BASE_URL;
export const asset = (path: string) => base + path.replace(/^\//, "");
const api = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const backendConfigured = Boolean(api);
export const CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json";
export const COLLECTION = "NISAR_L2_GUNW_PROVISIONAL_V1";
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
  const before = one("REFERENCE_ZERO_DOPPLER_START_TIME"),
    after = one("SECONDARY_ZERO_DOPPLER_START_TIME");
  return {
    id: item.meta["concept-id"],
    granule: u.GranuleUR,
    collection: u.CollectionReference?.ShortName ?? COLLECTION,
    before,
    after,
    track: one("TRACK_NUMBER") ? +one("TRACK_NUMBER")! : null,
    frame: one("FRAME_NUMBER") ? +one("FRAME_NUMBER")! : null,
    orbit: one("ASCENDING_DESCENDING"),
    polarizations: a.FREQUENCY_A_POLARIZATION ?? [],
    geometry,
    source_url: `https://cmr.earthdata.nasa.gov/search/concepts/${encodeURIComponent(item.meta["concept-id"])}.umm_json`,
    download_auth_required: true,
    cached_pair: cache?.pair.id ?? null,
    cached_case: cache?.study.id ?? null,
    status: cache ? "measured_provisional" : "processing_unavailable",
    metadata_warnings: [
      ...(!geometry ? ["No displayable catalog footprint."] : []),
      ...(!before || !after ? ["Acquisition pair metadata incomplete."] : []),
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
  } else {
    // Discovery must remain usable when the optional local research export is unavailable.
    const catalog = await loadCatalog().catch(() => undefined);
    const results = await Promise.all(
      splitBBox(bbox).map(async (box) => {
        const params = new URLSearchParams({
          short_name: COLLECTION,
          bounding_box: box.join(","),
          temporal: `${start}T00:00:00Z,${end}T23:59:59Z`,
          page_size: "50",
          "sort_key[]": "-start_date",
        });
        if (selection.polygon && splitBBox(bbox).length === 1) {
          params.delete("bounding_box");
          params.set("polygon", selection.polygon.flat().join(","));
        }
        const result = await request<{
          items: { meta: { "concept-id": string }; umm: UMM }[];
          hits: number;
        }>(`${CMR}?${params}`, signal);
        return result;
      }),
    );
    const products = [
      ...new Map(
        results
          .flatMap((r) => r.items)
          .map((i) => {
            const p = normalizeProduct(i, catalog);
            return [p.id, p];
          }),
      ).values(),
    ].slice(0, 50);
    data = {
      products,
      returned: products.length,
      hits: results.length === 1 ? results[0].hits : null,
      bounded: results.some(
        (r) => r.items.length >= 50 || r.hits > r.items.length,
      ),
      queried_utc: new Date().toISOString(),
      source: "NASA CMR · direct public metadata",
      query: { bbox, start, end },
    };
  }
  cache.set(key, { at: Date.now(), data });
  return data;
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
        properties: { id: p.id, cached: p.cached_pair != null ? 1 : 0 },
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
