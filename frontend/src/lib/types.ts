export type BBox = [number, number, number, number];
export type Position = [number, number];
export type LayerKind =
  | "disturbance"
  | "los"
  | "coherence_change"
  | "backscatter_change";
export type ChangeType =
  | "agriculture"
  | "subsidence"
  | "earthquake"
  | "flood"
  | "wildfire";
export type Status =
  | "measured_validated"
  | "measured_provisional"
  | "quality_limited"
  | "no_suitable_data"
  | "processing_unavailable";
export interface Station {
  station: string;
  role: string;
  longitude?: number;
  latitude?: number;
  median_coherence?: number;
  accepted_within_500m?: number;
  relative_nisar_candidate_los_mm?: number;
  relative_gnss_los_mm?: number;
  residual_mm?: number;
  gnss_los_mm?: number;
  gnss_formal_sigma_mm?: number;
  relative_gnss_formal_sigma_mm?: number;
  unavailable_reason?: string;
  component?: number;
}
export interface Stats {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  p05?: number | null;
  p95?: number | null;
}
export interface LayerEntry {
  file: string;
  counts: string;
  count_type: "uint8" | "uint16";
  step: number;
  nodata: number;
  unit: string;
  kind: LayerKind;
  native_statistics: Stats;
  from_pair?: string;
  more_disturbed_percent?: number | null;
  less_disturbed_percent?: number | null;
}
export interface Structure {
  stations: number;
  status: string;
  mean_residual_mm?: number;
  rmse_mm?: number;
  rmse_after_offset_mm?: number;
  loo_offset_rmse_mm?: number;
  loo_plane_rmse_mm?: number;
  plane_mm_per_degree?: { longitude: number; latitude: number };
  interpretation?: string;
}
export interface Comparison {
  reference: string;
  count: number;
  rmse_mm: number;
  mean_residual_mm?: number;
  validation: "PASSED" | "FAILED";
  stations: Station[];
  structure: Structure;
  reference_sweep: { reference: string; comparisons: number; rmse_mm: number }[];
}
export interface Pair {
  id: string;
  granule: string;
  before: string;
  after: string;
  track?: number | null;
  frame?: number | null;
  orbit?: string | null;
  product_version?: string | null;
  schema?: string;
  doi?: string;
  processor_version?: string;
  correction_equation?: string;
  ionosphere_policy?: string;
  coherence_threshold?: number;
  accepted_pixels?: number;
  coordinates: Position[];
  grid: { size: number; bounds_mercator: BBox };
  layers: Partial<Record<LayerKind, LayerEntry>>;
  comparison: Comparison | null;
  reference_area?: Record<string, unknown> | null;
  gnss?: {
    station: string;
    longitude: number;
    latitude: number;
    east_north_up_mm: number[];
    los_mm?: number;
    los_formal_sigma_mm?: number;
    nearest_accepted_radar_km?: number | null;
    source: string;
  } | null;
  source_hashes: Record<string, string>;
}
export interface QuakeEvent {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  longitude: number;
  latitude: number;
}
export interface StudyCase {
  id: string;
  name: string;
  region: string;
  bbox: BBox;
  change_types: ChangeType[];
  primary_layer: LayerKind;
  headline: string;
  summary: string;
  status: Status;
  event: { events?: QuakeEvent[]; source?: string } | null;
  pairs: Pair[];
  series: {
    status: string;
    reference: string;
    stations: Record<
      string,
      { dates: string[]; radar_mm: number[]; gnss_mm: number[] | null }
    >;
  } | null;
  findings: string[];
  limits: string[];
}
export interface Catalog {
  version: number;
  generated: string;
  change_types: Record<
    ChangeType,
    { label: string; measure: string; explain: string }
  >;
  cases: StudyCase[];
  gnss_source: string;
  grid_note: string;
}
export interface Grid {
  size: number;
  values: Float32Array;
  counts: Uint8Array | Uint16Array;
}
export interface Product {
  id: string;
  granule: string;
  collection: string;
  before: string | null;
  after: string | null;
  track: number | null;
  frame: number | null;
  orbit: string | null;
  polarizations: string[];
  geometry: GeoJSON.Geometry | null;
  source_url: string;
  download_auth_required: boolean;
  cached_pair: string | null;
  cached_case: string | null;
  status: Status;
  metadata_warnings: string[];
}
export interface Discovery {
  products: Product[];
  returned: number;
  hits: number | null;
  bounded: boolean;
  queried_utc: string;
  source: string;
  query: { bbox: BBox; start: string; end: string };
  cached?: boolean;
}
export interface Place {
  name: string;
  longitude: number;
  latitude: number;
  source: string;
}
export interface Selection {
  name: string;
  bbox: BBox;
  polygon?: Position[];
}
export interface Sample {
  kind: LayerKind;
  value: number | null;
  support: number;
}
export interface Pixel {
  longitude: number;
  latitude: number;
  samples: Sample[];
}
export interface MapMarker {
  id: string;
  longitude: number;
  latitude: number;
  label: string;
  kind: "station" | "reference" | "event" | "gnss";
  title?: string;
}
