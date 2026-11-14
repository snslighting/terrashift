import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  AcquisitionCalendar,
  PlaceCard,
  PlaceGallery,
  PolarizationSwitch,
  StatusLadder,
  SwipeCompare,
  TimeScrubber,
  kindLabels,
  productDates,
  usePreview,
} from "../components/Discovery";
import { presetById, type Preset } from "../lib/presets";
import { timeline } from "../lib/catalogStats";
import { footprintBounds, previewChoices } from "../lib/browse";
import { previewImage, downloadCanvas } from "../lib/mapImage";
import { PREVIEW_TIMEOUT_MS } from "../lib/previewRequest";
import { FullDataPanel } from "../components/Resources";
import { NON_ENDORSEMENT } from "../lib/resources";
import type { Basemap } from "../components/MapViewer";
import {
  Search,
  ArrowRight,
  ChevronDown,
  Download,
  CalendarDays,
  Satellite,
  MapPin,
  X,
  HelpCircle,
  RefreshCw,
  LocateFixed,
  PanelLeftClose,
  PanelLeftOpen,
  ImageDown,
  Sheet,
} from "lucide-react";
import {
  discover,
  searchPlaces,
  requestProcessing,
  getJob,
  backendConfigured,
  findPair,
  cmrGranuleUrl,
} from "../lib/api";
import {
  pointBBox,
  downloadJSON,
  downloadCSV,
  regionalStats,
  validBBox,
  inspect,
  longDate,
} from "../lib/science";
import { useApp, useGrids } from "../lib/context";
import { format, layerInfo, studyRange } from "../lib/layers";
import { statusLevel, trustOf, validationLabel } from "../lib/evidence";
import type {
  BBox,
  Discovery,
  LayerKind,
  MapMarker,
  Pixel,
  Place,
  Product,
  ProductKind,
  Selection,
  Station,
} from "../lib/types";
import { StatusBadge, Empty, SourceLink, Skeleton } from "../components/UI";
import { Legend, rasterURL } from "../components/Raster";
import {
  caseMarkers,
  ChangeIcon,
  Confidence,
  Findings,
  PairLabel,
  PixelCard,
  readAt,
  StationCard,
} from "../components/Evidence";
const MapViewer = lazy(() => import("../components/MapViewer"));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** NISAR launched on 30 July 2025; no science products exist before it. */
const NISAR_LAUNCH = "2025-07-30";
/** Start date `days` before today, never earlier than launch (days < 0 means since launch). */
function presetStart(days: number) {
  if (days < 0) return NISAR_LAUNCH;
  const from = isoDay(new Date(Date.now() - days * 86_400_000));
  return from < NISAR_LAUNCH ? NISAR_LAUNCH : from;
}
const datePresets: [string, number][] = [
  ["30 days", 30],
  ["90 days", 90],
  ["12 months", 365],
  ["Since launch", -1],
];
/** What the optical basemap is, in plain words, so it is not mistaken for the radar's view. */
function OpticalNote({ date }: { date?: string }) {
  return (
    <details className="tiny optical-note">
      <summary>Optical: NASA MODIS Terra{date ? `, ${date} (UTC)` : ""}</summary>
      True colour, about 250 m detail. Terra passes around 10:30 local time, so it can be hours from the radar
      pass; clouds hide the ground, and recent days may not be processed yet. Context only, not a check of the
      radar.
    </details>
  );
}

export default function Explorer() {
  const { catalog, selection, setSelection, error: researchError } = useApp();
  const [params, setParams] = useSearchParams(),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [searching, setSearching] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Discovery>(),
    [product, setProduct] = useState<Product>(),
    [pairId, setPairId] = useState<string | null>(null),
    [layer, setLayer] = useState<LayerKind>("disturbance"),
    [basemap, setBasemap] = useState<Basemap>("satellite"),
    [kind, setKind] = useState<ProductKind>("GUNW"),
    [choice, setChoice] = useState("combined"),
    [preset, setPreset] = useState<Preset>(),
    [comparing, setComparing] = useState(false),
    [opacity, setOpacity] = useState(0.8),
    [stations, setStations] = useState(true),
    [start, setStart] = useState(() => presetStart(365)),
    [end, setEnd] = useState(new Date().toISOString().slice(0, 10)),
    [pixel, setPixel] = useState<Pixel>(),
    [station, setStation] = useState<Station>(),
    [collapsed, setCollapsed] = useState(false),
    [resultOpen, setResultOpen] = useState(true),
    [tour, setTour] = useState<number | null>(null),
    [job, setJob] = useState<{
      status: string;
      message: string;
      job_id?: string;
      result?: unknown;
    }>(),
    [boundsOpen, setBoundsOpen] = useState(false),
    [bounds, setBounds] = useState("");
  const wantedProduct = useRef<string | null>(null),
    restored = useRef(false);
  const controller = useRef<AbortController>(null),
    searchController = useRef<AbortController>(null);
  const tourDialog = useRef<HTMLElement>(null);
  const tourIsOpen = tour !== null;
  useEffect(() => {
    if (!tourIsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = tourDialog.current;
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTour(null);
      if (event.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [tourIsOpen]);
  const opened = findPair(catalog, pairId),
    study = opened?.study,
    pair = opened?.pair,
    kinds = pair ? (Object.keys(pair.layers) as LayerKind[]) : [],
    active = pair?.layers[layer] ? layer : kinds[0],
    { grids, loading: gridsLoading } = useGrids(pair, kinds);
  // Products of the chosen family, oldest first (scrubber, calendar order).
  const series = useMemo(() => (result ? timeline(result.products, kind) : []), [result, kind]);
  const listed = useMemo(() => [...series].reverse(), [series]);
  const { state: preview, retry: retryPreview } = usePreview(pair ? undefined : product, choice);
  const shown =
    preview.status === "ready" ? preview.image : preview.status === "loading" ? preview.thumb : undefined;
  const level = statusLevel(product, pair);
  // Day of the optical basemap: the radar date (a GUNW's second date), else yesterday.
  const opticalDate = (product?.date ?? pair?.after)?.slice(0, 10);
  // Which image is on the map, in words: "Backscatter · HV", "Ground motion · Interferogram".
  const previewLabel = product
    ? `${kindLabels[product.kind].short} · ${(previewChoices(product).find((o) => o.id === choice) ?? previewChoices(product)[0])?.label ?? ""}`
    : "";
  // Fit the map to the open product, rounded so scrubbing one track does not jitter the view.
  const productFocus = useMemo(() => {
    const b = product && !pair ? footprintBounds(product) : null;
    return b ? (b.map((v, i) => (i < 2 ? Math.floor(v * 4) / 4 : Math.ceil(v * 4) / 4)) as BBox) : undefined;
  }, [product?.id, pair?.id]);
  const overlay = useMemo(
    () =>
      pair && active && grids[active]
        ? {
            key: `${pair.id}-${active}`,
            url: rasterURL(grids[active]!, active, studyRange(study!, active)),
            coordinates: pair.coordinates,
          }
        : shown && product
          ? {
              key: `preview-${product.id}-${choice}`,
              image: shown.bitmap,
              coordinates: shown.coordinates,
              smooth: true,
              outline: false,
            }
          : undefined,
    [pair?.id, active, grids, shown?.id, product?.id, choice],
  );
  const markers = useMemo(
    () =>
      study && pair
        ? caseMarkers(study, pair).filter((m) => stations || m.kind === "event")
        : [],
    [study?.id, pair?.id, stations],
  );
  useEffect(() => {
    const lat = params.get("lat"),
      lon = params.get("lon");
    if (
      lat !== null &&
      lon !== null &&
      Number.isFinite(+lat) &&
      Number.isFinite(+lon) &&
      Math.abs(+lat) <= 90 &&
      Math.abs(+lon) <= 180
    )
      choose({ name: `${+lat}°, ${+lon}°`, bbox: pointBBox(+lon, +lat) });
    const wanted = params.get("study") ?? params.get("case");
    if (wanted) openCase(wanted);
    if (restored.current || !catalog) return;
    restored.current = true;
    // Shared discovery views: ?preset=… or ?area=w,s,e,n&type=GCOV&product=<granule>&from=&to=
    const fromPreset = presetById(params.get("preset"));
    const area = params.get("area")?.split(",").map(Number) as BBox | undefined;
    const type = params.get("type");
    if (type === "GUNW" || type === "GCOV") setKind(type);
    if (params.get("product")) wantedProduct.current = params.get("product");
    if (params.get("image")) setChoice(params.get("image")!);
    const from = params.get("from") ?? undefined,
      to = params.get("to") ?? undefined;
    if (fromPreset) runPreset(fromPreset, type === "GUNW" || type === "GCOV" ? type : undefined, from, to);
    else if (area?.length === 4 && validBBox(area)) {
      const sel = { name: params.get("name") ?? "Shared area", bbox: area };
      choose(sel);
      find(sel, from, to, type === "GUNW" || type === "GCOV" ? type : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);
  // Keep a discovery view in the page address, so a link restores it.
  useEffect(() => {
    if (!result || !selection || pair) return;
    const next: Record<string, string> = {
      area: selection.bbox.map((v) => +v.toFixed(4)).join(","),
      name: selection.name,
      type: kind,
      from: result.query.start,
      to: result.query.end,
    };
    if (preset) next.preset = preset.id;
    if (product) next.product = product.granule;
    if (product && choice !== "combined") next.image = choice;
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, kind, product?.id, choice, preset?.id]);
  useEffect(
    () => () => {
      controller.current?.abort();
      searchController.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!job?.job_id || !["queued", "running"].includes(job.status)) return;
    const timer = setTimeout(() => {
      getJob(job.job_id!)
        .then((p) => setJob({ ...p, job_id: job.job_id }))
        .catch((e) => setJob({ status: "failed", message: e.message }));
    }, 1500);
    return () => clearTimeout(timer);
  }, [job]);
  function choose(s: Selection) {
    controller.current?.abort();
    searchController.current?.abort();
    setSearching(false);
    setLoading(false);
    setSelection(s);
    setResult(undefined);
    setProduct(undefined);
    setPairId(null);
    setPixel(undefined);
    setStation(undefined);
    setPlaces([]);
    setError("");
    setJob(undefined);
    setPreset(undefined);
    setComparing(false);
    setBounds(s.bbox.map((v) => v.toFixed(4)).join(", "));
  }
  /** One click: set the area, theme and dates of a sample place, and search. */
  function runPreset(p: Preset, type?: ProductKind, from?: string, to?: string) {
    const sel = { name: `${p.name}, ${p.region}`, bbox: p.bbox };
    choose(sel);
    setPreset(p);
    setKind(type ?? p.kind);
    setChoice("combined");
    find(sel, from ?? NISAR_LAUNCH, to ?? isoDay(new Date()), type ?? p.kind);
  }
  function openCase(id: string) {
    const c =
      catalog?.cases.find((x) => x.id === id) ??
      (id === "california" ? catalog?.cases[0] : undefined);
    if (!c) return;
    choose({ name: `${c.name}, ${c.region}`, bbox: c.bbox });
    setPairId(c.pairs.at(-1)!.id);
    setLayer(c.primary_layer);
    setResultOpen(true);
  }
  async function search(e: React.FormEvent) {
    e.preventDefault();
    searchController.current?.abort();
    const c = new AbortController();
    searchController.current = c;
    setSearching(true);
    setError("");
    setPlaces([]);
    try {
      const p = await searchPlaces(query, c.signal);
      if (c.signal.aborted) return;
      if (p.length === 1) {
        const v = p[0];
        choose({ name: v.name, bbox: pointBBox(v.longitude, v.latitude) });
      } else {
        setPlaces(p);
        if (!p.length)
          setError(
            "No matching place. Try a nearby city or latitude, longitude.",
          );
      }
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setSearching(false);
    }
  }
  async function find(
    area: Selection | undefined = selection,
    from = start,
    to = end,
    prefer?: ProductKind,
  ) {
    if (!area) return;
    setStart(from);
    setEnd(to);
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setError("");
    setResult(undefined);
    setProduct(undefined);
    setPairId(null);
    setPixel(undefined);
    setStation(undefined);
    setJob(undefined);
    try {
      const d = await discover(area, from, to, c.signal);
      if (c.signal.aborted) return;
      setResult(d);
      // Open a picture straight away: the shared product, else the latest of the
      // preferred family (or of the other family when the preferred has none).
      const want = prefer ?? kind;
      const family: ProductKind = d.products.some((p) => p.kind === want)
        ? want
        : want === "GUNW"
          ? "GCOV"
          : "GUNW";
      const shared = d.products.find((p) => p.granule === wantedProduct.current);
      wantedProduct.current = null;
      const first = shared ?? timeline(d.products, family).at(-1);
      setKind(shared?.kind ?? family);
      if (first) {
        setProduct(first);
        setPairId(first.cached_pair);
        setResultOpen(true);
      }
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  function selectProduct(p: Product) {
    setProduct(p);
    if (p.kind !== kind) setKind(p.kind);
    setPairId(p.cached_pair);
    setResultOpen(true);
    setPixel(undefined);
    setStation(undefined);
    setJob(undefined);
  }
  const exportData = () =>
    downloadJSON("terrashift-research-evidence.json", {
      project: "TerraShift",
      status: pair
        ? `MEASURED_PROVISIONAL_${pair.comparison ? `VALIDATION_${validationLabel(pair.comparison).code}` : "NO_INDEPENDENT_COMPARISON"}`
        : product
          ? "PROCESSING_UNAVAILABLE"
          : "CATALOG_DISCOVERY",
      science_validated: false,
      total_uncertainty_mm: null,
      selection,
      discovery: result,
      product,
      study: study && {
        id: study.id,
        name: study.name,
        findings: study.findings,
        limits: study.limits,
      },
      pair,
      pixel,
      station,
      job,
      exported_utc: new Date().toISOString(),
      note: "Pixel samples describe display cells (means of accepted native pixels). Coherence loss shows surface change, not its cause.",
    });
  const exportProducts = () =>
    result &&
    downloadCSV(`terrashift-products-${isoDay(new Date())}.csv`, [
      ["kind", "granule", "date", "before", "after", "track", "frame", "orbit", "frequencies", "status_level", "preview", "metadata"],
      ...[...result.products]
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .map((p) => [
          p.kind,
          p.granule,
          p.date,
          p.before,
          p.after,
          p.track,
          p.frame,
          p.orbit,
          p.frequencies.join("+"),
          statusLevel(p, findPair(catalog, p.cached_pair)?.pair),
          p.browse.combined ?? "",
          p.source_url,
        ]),
    ]);
  const exportPreview = () => {
    if (preview.status !== "ready" || !product) return;
    const label =
      previewChoices(product).find((o) => o.id === choice)?.label ?? kindLabels[product.kind].short;
    previewImage(product, preview.image, label, selection?.name ?? "", level)
      .then((c) => downloadCanvas(c, `terrashift-nasa-preview-${product.date}-${product.kind}.png`))
      .catch(() => setError("The map image could not be made from this preview."));
  };
  const summary = useMemo(
    () =>
      pair && active && grids[active] && selection
        ? regionalStats(pair, grids[active]!, selection.bbox, selection.polygon)
        : null,
    [pair?.id, active, grids, selection],
  );
  const onMarker = (m: MapMarker) => {
    const s = pair?.comparison?.stations.find((x) => x.station === m.id);
    if (s) {
      setStation(s);
      setPixel(undefined);
      setResultOpen(true);
    }
  };
  const tours = [
    [
      "Choose a place",
      "Search a city, address or landmark, or enter latitude, longitude. Click the map or draw a rectangle/polygon to choose your area.",
    ],
    [
      "Discover real observations",
      "Set a date range and search NASA CMR. Footprints describe acquisition coverage, not the presence of valid ground-motion measurements.",
    ],
    [
      "Inspect the evidence",
      "Products already processed open as maps of surface change or ground motion. Others show their catalog metadata and how to obtain them.",
    ],
    [
      "Compare responsibly",
      "Open Analysis for timelines, side-by-side comparison and the independent GNSS check. Each result says how sure we are.",
    ],
  ];
  return (
    <main className={`explorer-page ${collapsed ? "panel-collapsed" : ""}`}>
      <aside className="explorer-panel">
        <div className="panel-top">
          <div className="eyebrow">
            <span />
            WORLDWIDE EXPLORER
          </div>
          <button
            onClick={() => setCollapsed(true)}
            aria-label="Collapse search panel"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <h1>Find your perspective.</h1>
        <p className="muted">
          Discover the observations behind a changing planet.
        </p>
        <form className="search-field" onSubmit={search}>
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="City, address, or lat, lon…"
            aria-label="Search anywhere on Earth"
          />
          <button aria-label="Search locations" disabled={searching}>
            {searching ? (
              <RefreshCw size={17} className="spin" />
            ) : (
              <ArrowRight size={17} />
            )}
          </button>
        </form>
        <span className="tiny">Search on submit · Photon / OpenStreetMap</span>
        {places.length > 0 && (
          <div className="place-results">
            {places.map((p, i) => (
              <button
                key={i}
                onClick={() =>
                  choose({
                    name: p.name,
                    bbox: pointBBox(p.longitude, p.latitude),
                  })
                }
              >
                <MapPin size={14} />
                <span>
                  {p.name}
                  <small>
                    {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                  </small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
        <div className="selection-heading">
          <span>SELECTED AREA</span>
          <button onClick={() => setBoundsOpen(!boundsOpen)}>
            Edit bounds
            <ChevronDown size={13} />
          </button>
        </div>
        {selection ? (
          <div className="selected-place">
            <LocateFixed size={17} />
            <div>
              <strong>{selection.name}</strong>
              <small>
                {selection.bbox.map((v) => v.toFixed(3)).join(" · ")}
              </small>
            </div>
            <button
              onClick={() => {
                controller.current?.abort();
                searchController.current?.abort();
                setLoading(false);
                setSearching(false);
                setSelection(undefined);
                setPairId(null);
                setResult(undefined);
                setProduct(undefined);
                setJob(undefined);
                setPixel(undefined);
                setStation(undefined);
              }}
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <p className="selection-empty">
            Search a place or select an area on the map.
          </p>
        )}
        {boundsOpen && (
          <form
            className="bounds-form"
            onSubmit={(e) => {
              e.preventDefault();
              const b = bounds.split(",").map(Number) as BBox;
              if (b.length !== 4 || !validBBox(b)) {
                setError(
                  "Enter west, south, east, north in WGS84. West > east represents a dateline crossing.",
                );
                return;
              }
              choose({ name: "Custom WGS84 area", bbox: b });
            }}
          >
            <label>
              West, south, east, north
              <input
                value={bounds}
                onChange={(e) => setBounds(e.target.value)}
                placeholder="−120.99, 36.005, −119.7, 36.99"
              />
            </label>
            <button className="text-button">Apply region</button>
          </form>
        )}
        <div className="date-presets" role="group" aria-label="Date range presets">
          {datePresets.map(([label, days]) => {
            const from = presetStart(days),
              today = isoDay(new Date());
            return (
              <button
                key={label}
                type="button"
                className={start === from && end === today ? "active" : ""}
                aria-pressed={start === from && end === today}
                onClick={() => {
                  setStart(from);
                  setEnd(today);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="date-fields">
          <label>
            <CalendarDays size={13} />
            From
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <button
          className="button discover-button"
          onClick={() => find()}
          disabled={!selection || loading}
        >
          {loading ? (
            <RefreshCw size={17} className="spin" />
          ) : (
            <Satellite size={17} />
          )}{" "}
          {loading ? "Querying NASA CMR…" : "Discover NISAR observations"}
          <ArrowRight size={16} />
        </button>
        <p className="tiny">
          Ground motion (GUNW) and backscatter (GCOV) provisional collections · up to 100 of each.
          <br />
          Catalog availability does not establish measurement quality.
        </p>
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={13} />
            </button>
          </div>
        )}
        {researchError && (
          <div className="error-box">
            Cached evidence could not load. Worldwide catalog discovery is still
            available.
          </div>
        )}
        {loading && (
          <Skeleton label="Looking for intersecting NISAR products…" />
        )}
        {result && (
          <div className="catalog-results">
            <div className="section-caption">
              <span>{result.returned} PRODUCTS RETURNED</span>
              <span>
                {result.offline ? "STORED · OFFLINE" : result.bounded ? "BOUNDED SEARCH" : "NASA CMR"}
              </span>
            </div>
            {result.returned > 0 && (
              <>
                <PlaceCard products={result.products} preset={preset} hits={result.hits_by_kind} />
                <AcquisitionCalendar
                  products={result.products}
                  active={product}
                  onPick={selectProduct}
                />
                <div className="segmented kind-switch" role="group" aria-label="Data type">
                  {(["GUNW", "GCOV"] as const).map((k) => (
                    <button
                      key={k}
                      className={kind === k ? "active" : ""}
                      aria-pressed={kind === k}
                      onClick={() => {
                        setKind(k);
                        setChoice("combined");
                        const latest = timeline(result.products, k).at(-1);
                        if (latest) selectProduct(latest);
                      }}
                    >
                      {kindLabels[k].short}
                      <small>{result.products.filter((p) => p.kind === k).length}</small>
                    </button>
                  ))}
                </div>
                <button className="text-button" onClick={exportProducts}>
                  <Sheet size={14} />
                  Product list (CSV)
                </button>
              </>
            )}
            {result.offline && (
              <div className="offline-notice" role="status">
                <strong>NASA's live catalog could not be reached.</strong> Showing the processed
                NISAR products stored with TerraShift that overlap your search. Other observations
                may exist; search again when you are online.
              </div>
            )}
            {!result.returned && result.offline ? (
              <Empty title="No stored products here">
                None of the processed study areas overlap this area and date range. Try San Joaquin
                Valley, Caracas or Flores, or search again when you are online.
              </Empty>
            ) : !result.returned ? (
              <Empty title="No NISAR products here yet">
                Neither ground-motion (GUNW) nor backscatter (GCOV) products were
                returned for this area and date range. Try a broader period, a
                nearby region, or one of the sample places.
              </Empty>
            ) : !listed.length ? (
              <Empty title={`No ${kindLabels[kind].short.toLowerCase()} products`}>
                Switch the data type above to see the other family.
              </Empty>
            ) : (
              listed.map((p) => (
                <button
                  key={p.id}
                  className={`product-card ${p.id === product?.id ? "active" : ""}`}
                  onClick={() => selectProduct(p)}
                >
                  <span className="product-dates">
                    {p.kind === "GUNW" ? (
                      <>
                        {p.before?.slice(0, 10) ?? "Unknown"}
                        <ArrowRight size={13} />
                        {p.after?.slice(0, 10) ?? "Unknown"}
                      </>
                    ) : (
                      (p.date ?? "Unknown date")
                    )}
                  </span>
                  <span className="product-detail">
                    TRACK {p.track ?? "?"} · FRAME {p.frame ?? "?"} ·{" "}
                    {p.orbit?.toLowerCase() ?? "unknown orbit"}
                  </span>
                  <span className="product-bottom">
                    <span
                      className={`data-pill ${p.cached_pair != null ? "cached" : ""}`}
                    >
                      {p.cached_pair != null
                        ? "Processed by TerraShift · open map"
                        : p.browse.combined || p.browse.bands.length
                          ? `NASA preview${p.browse.bands.length ? ` · ${[...new Set(p.browse.bands.map((b) => b.polarization))].join(" / ")}` : ""}`
                          : "Catalog record"}
                    </span>
                    <ArrowRight size={15} />
                  </span>
                </button>
              ))
            )}
            <p className="tiny">
              Queried {new Date(result.queried_utc).toLocaleString()} ·{" "}
              {result.offline
                ? "stored evidence, not the live catalog"
                : result.cached
                  ? "5-minute cache"
                  : "public metadata"}
              {result.hits != null
                ? ` · ${result.hits.toLocaleString()} catalog matches`
                : ""}
              .
            </p>
          </div>
        )}
        {!result && !loading && (
          <div className="quick-start">
            <div className="section-caption">START WITH REAL EVIDENCE</div>
            {(catalog?.cases ?? []).map((c) => (
              <button key={c.id} className="featured-study" onClick={() => openCase(c.id)}>
                <span className="case-mini-art">
                  {c.change_types.map((t) => (
                    <ChangeIcon key={t} type={t} size={16} />
                  ))}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {c.region} · {c.change_types.join(" · ")} · {c.pairs.length} pair
                    {c.pairs.length > 1 ? "s" : ""}
                  </small>
                </span>
                <ArrowRight size={17} />
              </button>
            ))}
            <div className="section-caption">TRY THESE PLACES · ONE CLICK</div>
            <PlaceGallery compact onPick={(p) => runPreset(p)} />
          </div>
        )}
        <div className="panel-bottom">
          <span className="live-dot" />
          {backendConfigured
            ? "API CONNECTED · PUBLIC METADATA"
            : "DIRECT PUBLIC CATALOG · PROCESSED STUDY AREAS"}
          <button onClick={() => setTour(0)}>
            <HelpCircle size={15} />
            Take a tour
          </button>
        </div>
      </aside>
      <section className="explorer-map-area">
        {collapsed && (
          <button className="reopen-panel" onClick={() => setCollapsed(false)}>
            <PanelLeftOpen size={18} />
            Search & discovery
          </button>
        )}
        <div className="map-controls-top">
          <select
            aria-label="Basemap"
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as typeof basemap)}
          >
            <option value="satellite">Satellite</option>
            <option value="geographic">Geographic</option>
            <option value="terrain">Terrain</option>
            <option value="optical">Optical on {opticalDate ?? "the latest day"}</option>
          </select>
          {preview.status === "ready" && !pair && (
            <button onClick={exportPreview} aria-label="Save this map image">
              <ImageDown size={15} />
              <span>Map image</span>
            </button>
          )}
          <button onClick={exportData} aria-label="Export evidence">
            <Download size={15} />
            <span>Export evidence</span>
          </button>
          <button onClick={() => setTour(0)} aria-label="Explorer tour">
            <HelpCircle size={16} />
          </button>
        </div>
        <Suspense fallback={<Skeleton label="Preparing interactive map…" />}>
          <MapViewer
            overlay={overlay}
            legend={
              pair && active ? (
                <Legend kind={active} range={studyRange(study!, active)} compact />
              ) : undefined
            }
            markers={markers}
            focus={study?.bbox ?? productFocus}
            selection={selection}
            products={pair ? result?.products : listed}
            basemap={basemap}
            opticalDate={opticalDate}
            activeProduct={product?.id}
            opacity={opacity}
            onSelect={choose}
            onProduct={(id) => {
              const p = result?.products.find((p) => p.id === id);
              if (p) selectProduct(p);
            }}
            onMarker={onMarker}
            probe={
              pair && active && grids[active]
                ? (lon, lat) => readAt(pair, active, grids[active]!, lon, lat)
                : undefined
            }
            onPoint={(lon, lat) => {
              if (pair) {
                if (!gridsLoading) setPixel(inspect(pair, grids, lon, lat));
                setStation(undefined);
                setResultOpen(true);
              } else
                choose({
                  name: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`,
                  bbox: pointBBox(lon, lat),
                });
            }}
          />
        </Suspense>
        {!pair && product && shown && (
          <div className="map-ribbon preview" role="note">
            NASA PREVIEW{previewLabel ? ` · ${previewLabel.toUpperCase()}` : ""} · NOT PROCESSED BY TERRASHIFT
            {" · PLACEMENT APPROXIMATE"}
            {preview.status === "loading" ? " · LOW DETAIL, LOADING" : ""}
          </div>
        )}
        {!pair && product && !shown && preview.status === "loading" && (
          <div className="map-ribbon loading" role="status">
            <RefreshCw size={13} className="spin" /> LOADING NASA PREVIEW{previewLabel ? ` · ${previewLabel.toUpperCase()}` : ""}
          </div>
        )}
        {!pair && product && shown && (
          <div className="layer-panel preview-layer-panel">
            <div className="section-caption">NASA PREVIEW</div>
            <label className="range-label">
              Image opacity<span>{Math.round(opacity * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step=".05"
                value={opacity}
                onChange={(e) => setOpacity(+e.target.value)}
                aria-label="Preview image opacity"
              />
            </label>
            <p className="tiny">Lower it to see the basemap, or the optical view of the same day, underneath.</p>
            {basemap === "optical" && <OpticalNote date={opticalDate} />}
          </div>
        )}
        {!pair && result && series.length > 1 && (
          <TimeScrubber
            products={series}
            active={product}
            onPick={selectProduct}
            onCompare={() => product && setComparing(true)}
            ready={preview.status !== "loading"}
          />
        )}
        {comparing && product && (
          <SwipeCompare
            products={series}
            start={product}
            choice={choice}
            onClose={() => setComparing(false)}
          />
        )}
        {pair && (
          <div className="layer-panel">
            <div className="section-caption">MAP LAYER</div>
            <div className="segmented wrap">
              {kinds.map((k) => (
                <button
                  key={k}
                  className={active === k ? "active" : ""}
                  onClick={() => setLayer(k)}
                >
                  {layerInfo[k].short}
                </button>
              ))}
            </div>
            <label className="range-label">
              Layer opacity<span>{Math.round(opacity * 100)}%</span>
              <input
                type="range"
                min="0"
                max="1"
                step=".05"
                value={opacity}
                onChange={(e) => setOpacity(+e.target.value)}
                aria-label="Layer opacity"
              />
            </label>
            {(pair.comparison || pair.gnss || study?.event) && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={stations}
                  onChange={(e) => setStations(e.target.checked)}
                />
                GNSS stations
              </label>
            )}
            {basemap === "optical" && <OpticalNote date={opticalDate} />}
          </div>
        )}
        {(pair || product) && (
          <div className={`map-result-panel ${resultOpen ? "" : "minimized"}`}>
            <div className="result-controls">
              <button
                onClick={() => setResultOpen(!resultOpen)}
                aria-expanded={resultOpen}
                aria-label={resultOpen ? "Minimize panel" : "Expand panel"}
              >
                <ChevronDown size={16} />
              </button>
              <button
                onClick={() => {
                  setPairId(null);
                  setProduct(undefined);
                  setPixel(undefined);
                  setStation(undefined);
                }}
                aria-label="Close result"
              >
                <X size={16} />
              </button>
            </div>
            {pair && study ? (
              <>
                <span className="eyebrow">
                  <span />
                  {study.change_types.map((t) => t.toUpperCase()).join(" · ")}
                </span>
                <h2>{study.name}</h2>
                <div className="result-date">
                  <PairLabel pair={pair} />
                </div>
                {resultOpen && (
                  <>
                    <StatusLadder level={level} trust={trustOf(pair)} />
                    {station && pair.comparison ? (
                      <StationCard station={station} reference={pair.comparison.reference} />
                    ) : pixel ? (
                      <PixelCard pixel={pixel} />
                    ) : (
                      <>
                        <Findings study={{ ...study, findings: study.findings.slice(0, 2) }} />
                        {summary && active && (
                          <dl className="details">
                            <div>
                              <dt>Selected area · mean</dt>
                              <dd>{format(active, summary.mean)}</dd>
                            </div>
                            <div>
                              <dt>Display cells</dt>
                              <dd>{summary.count.toLocaleString()}</dd>
                            </div>
                          </dl>
                        )}
                      </>
                    )}
                    <Confidence study={study} pair={pair} />
                    {study.pairs.length > 1 && (
                      <div className="pair-selector">
                        {study.pairs.map((p, i) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setPairId(p.id);
                              setPixel(undefined);
                              setStation(undefined);
                            }}
                            className={pairId === p.id ? "active" : ""}
                          >
                            Pair {i + 1}
                            <small>
                              {p.before.slice(5)} → {p.after.slice(5)}
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                    <Link className="text-button" to={`/analysis?case=${study.id}`}>
                      Open detailed analysis
                      <ArrowRight size={15} />
                    </Link>
                    <SourceLink
                      href={cmrGranuleUrl(pair.granule)}
                    >
                      Original product metadata
                    </SourceLink>
                    <FullDataPanel
                      product={{
                        granule: pair.granule,
                        kind: "GUNW",
                        data_url: product?.granule === pair.granule ? product.data_url : null,
                      }}
                    />
                  </>
                )}
              </>
            ) : (
              product && (
                <>
                  <span className="eyebrow">
                    <span />
                    {level >= 2 ? "NASA PREVIEW" : "CATALOG RECORD"} · {kindLabels[product.kind].long.toUpperCase()}
                  </span>
                  <h2>{productDates(product)}</h2>
                  <div className="result-date">
                    Track {product.track ?? "?"} / frame {product.frame ?? "?"} ·{" "}
                    {product.orbit?.toLowerCase() ?? "unknown orbit"}
                  </div>
                  {resultOpen && (
                    <>
                      <StatusLadder level={level} />
                      {preview.status === "loading" && (
                        <p className="preview-status" role="status">
                          <RefreshCw size={14} className="spin" /> Loading NASA's preview image
                          {previewLabel ? ` (${previewLabel})` : ""}…{" "}
                          {preview.total > 0 &&
                            `${(preview.loaded / 1e6).toFixed(1)} of ${(preview.total / 1e6).toFixed(1)} MB`}
                          <small>
                            {preview.thumb
                              ? "A low-detail version is shown until it arrives."
                              : "The map shows only the footprint until it arrives."}{" "}
                            We stop waiting after {PREVIEW_TIMEOUT_MS / 1000} seconds.
                          </small>
                        </p>
                      )}
                      {preview.status === "error" && (
                        <div className="warning compact" role="alert">
                          <strong>{preview.timedOut ? "Preview took too long." : "Preview unavailable."}</strong>
                          <p>
                            {preview.message} The footprint outline and the place report still show
                            what NISAR covered.
                          </p>
                          <button className="text-button" onClick={retryPreview}>
                            <RefreshCw size={14} /> Retry
                          </button>
                        </div>
                      )}
                      {level === 1 && (
                        <p className="tiny">
                          NASA lists no preview image for this product. The footprint shows the area
                          it covers.
                        </p>
                      )}
                      <PolarizationSwitch product={product} choice={choice} onChoice={setChoice} />
                      {product.kind === "GUNW" && level >= 2 && (
                        <p className="tiny">
                          Interferogram preview: if colours repeat in bands, one full cycle is about
                          12 cm of motion toward or away from the satellite (half the 24 cm L-band
                          wavelength). Grainy areas lost coherence; dark purple inside the frame has
                          no data.
                        </p>
                      )}
                      <dl className="details">
                        <div>
                          <dt>Product</dt>
                          <dd>{product.kind} · provisional</dd>
                        </div>
                        {product.frequencies.length > 0 && (
                          <div>
                            <dt>Frequencies</dt>
                            <dd>{product.frequencies.join(", ")} (L-band)</dd>
                          </div>
                        )}
                        {product.polarizations.length > 0 && (
                          <div>
                            <dt>Polarizations</dt>
                            <dd>{product.polarizations.join(", ")}</dd>
                          </div>
                        )}
                      </dl>
                      <code className="granule-id">{product.granule}</code>
                      {product.metadata_warnings.length > 0 && (
                        <p className="warning">{product.metadata_warnings.join(" ")}</p>
                      )}
                      {backendConfigured && (
                        <button
                          className="text-button"
                          onClick={async () => {
                            if (!selection) return;
                            setJob({
                              status: "checking",
                              message: "Checking processing availability…",
                            });
                            try {
                              setJob(await requestProcessing(product, selection));
                            } catch (e) {
                              setJob({ status: "failed", message: (e as Error).message });
                            }
                          }}
                        >
                          <Satellite size={15} />
                          Request processing
                        </button>
                      )}
                      {job && (
                        <div className="warning compact" role="status">
                          <strong>{job.status.replaceAll("_", " ")}</strong>
                          <p>{job.message}</p>
                        </div>
                      )}
                      {product.browse.combined && (
                        <SourceLink href={product.browse.combined}>NASA preview image (full size)</SourceLink>
                      )}
                      <SourceLink href={product.source_url}>View original metadata</SourceLink>
                      <FullDataPanel product={product} />
                      <p className="tiny">{NON_ENDORSEMENT}</p>
                    </>
                  )}
                </>
              )
            )}
          </div>
        )}
      </section>
      {tour !== null && (
        <div className="modal-backdrop" onClick={() => setTour(null)}>
          <section
            ref={tourDialog}
            className="tour-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Explorer introduction"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setTour(null)}
              className="dialog-x"
              aria-label="Close tour"
            >
              <X size={18} />
            </button>
            <div className="eyebrow">EXPLORER GUIDE · {tour + 1} / 4</div>
            <h2>{tours[tour][0]}</h2>
            <p>{tours[tour][1]}</p>
            <div className="tour-progress">
              {tours.map((_, i) => (
                <i key={i} className={i <= tour ? "active" : ""} />
              ))}
            </div>
            <button
              autoFocus
              className="button"
              onClick={() => setTour(tour === 3 ? null : tour + 1)}
            >
              {tour === 3 ? "Start exploring" : "Next step"}
              <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
