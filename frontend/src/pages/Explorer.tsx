import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
} from "lucide-react";
import {
  discover,
  searchPlaces,
  requestProcessing,
  getJob,
  backendConfigured,
  findPair,
} from "../lib/api";
import {
  pointBBox,
  downloadJSON,
  regionalStats,
  validBBox,
  inspect,
  longDate,
} from "../lib/science";
import { useApp, useGrids } from "../lib/context";
import { format, layerInfo, studyRange } from "../lib/layers";
import type {
  BBox,
  Discovery,
  LayerKind,
  MapMarker,
  Pixel,
  Place,
  Product,
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
  StationCard,
} from "../components/Evidence";
const MapViewer = lazy(() => import("../components/MapViewer"));
export default function Explorer() {
  const { catalog, selection, setSelection, error: researchError } = useApp();
  const [params] = useSearchParams(),
    [query, setQuery] = useState(""),
    [places, setPlaces] = useState<Place[]>([]),
    [searching, setSearching] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Discovery>(),
    [product, setProduct] = useState<Product>(),
    [pairId, setPairId] = useState<string | null>(null),
    [layer, setLayer] = useState<LayerKind>("disturbance"),
    [basemap, setBasemap] = useState<"satellite" | "terrain" | "geographic">(
      "satellite",
    ),
    [opacity, setOpacity] = useState(0.8),
    [stations, setStations] = useState(true),
    [start, setStart] = useState("2026-01-01"),
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
    { grids } = useGrids(pair, kinds);
  const overlay = useMemo(
    () =>
      pair && active && grids[active]
        ? {
            key: `${pair.id}-${active}`,
            url: rasterURL(grids[active]!, active, studyRange(study!, active)),
            coordinates: pair.coordinates,
          }
        : undefined,
    [pair?.id, active, grids],
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
  }, [catalog]);
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
    setBounds(s.bbox.map((v) => v.toFixed(4)).join(", "));
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
  async function find() {
    if (!selection) return;
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
      const d = await discover(selection, start, end, c.signal);
      if (!c.signal.aborted) setResult(d);
    } catch (e) {
      if (!c.signal.aborted) setError((e as Error).message);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }
  function selectProduct(p: Product) {
    setProduct(p);
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
        ? `MEASURED_PROVISIONAL_${pair.comparison ? "VALIDATION_FAILED" : "NO_INDEPENDENT_COMPARISON"}`
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
          onClick={find}
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
          GUNW provisional collection · up to 50 results.
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
              <span>{result.bounded ? "BOUNDED SEARCH" : "NASA CMR"}</span>
            </div>
            {!result.returned ? (
              <Empty title="No suitable GUNW data">
                No products were returned for this area and date range. Try a
                broader period or a nearby region. Other NISAR product types are
                not searched here.
              </Empty>
            ) : (
              result.products.map((p) => (
                <button
                  key={p.id}
                  className={`product-card ${p.id === product?.id ? "active" : ""}`}
                  onClick={() => selectProduct(p)}
                >
                  <span className="product-dates">
                    {p.before?.slice(0, 10) ?? "Unknown"}
                    <ArrowRight size={13} />
                    {p.after?.slice(0, 10) ?? "Unknown"}
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
                        ? "Processed · open map"
                        : "Metadata · not yet processed"}
                    </span>
                    <ArrowRight size={15} />
                  </span>
                </button>
              ))
            )}
            <p className="tiny">
              Queried {new Date(result.queried_utc).toLocaleString()} ·{" "}
              {result.cached ? "5-minute cache" : "public metadata"}
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
            <div className="global-places">
              {[
                ["Tashkent", 69.24, 41.3],
                ["Jakarta", 106.85, -6.21],
                ["Reykjavík", -21.94, 64.15],
              ].map(([n, lon, lat]) => (
                <button
                  key={n}
                  onClick={() =>
                    choose({
                      name: String(n),
                      bbox: pointBBox(Number(lon), Number(lat)),
                    })
                  }
                >
                  {n}
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
            <p className="tiny">
              These shortcuts select coordinates. Product availability is
              discovered live.
            </p>
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
          </select>
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
            focus={study?.bbox}
            selection={selection}
            products={result?.products}
            basemap={basemap}
            opacity={opacity}
            onSelect={choose}
            onProduct={(id) => {
              const p = result?.products.find((p) => p.id === id);
              if (p) selectProduct(p);
            }}
            onMarker={onMarker}
            onPoint={(lon, lat) => {
              if (pair) {
                setPixel(inspect(pair, grids, lon, lat));
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
                      href={`https://cmr.earthdata.nasa.gov/search/granules.umm_json?granule_ur=${encodeURIComponent(pair.granule)}`}
                    >
                      Original product metadata
                    </SourceLink>
                  </>
                )}
              </>
            ) : (
              product && (
                <>
                  <span className="eyebrow">
                    <span />
                    CATALOG PRODUCT
                  </span>
                  <h2>Product discovered.</h2>
                  <StatusBadge status="processing_unavailable" />
                  <div className="result-date">
                    {product.before ? longDate(product.before.slice(0, 10)) : "Unknown date"} →{" "}
                    {product.after ? longDate(product.after.slice(0, 10)) : "Unknown date"}
                  </div>
                  {resultOpen && (
                    <>
                      <p className="tiny">
                        The footprint confirms coverage. Maps appear once this
                        product has been downloaded and processed.
                      </p>
                      <dl className="details">
                        <div>
                          <dt>Track / frame</dt>
                          <dd>
                            {product.track} / {product.frame}
                          </dd>
                        </div>
                        <div>
                          <dt>Orbit</dt>
                          <dd>{product.orbit}</dd>
                        </div>
                        <div>
                          <dt>Product</dt>
                          <dd>GUNW · provisional</dd>
                        </div>
                      </dl>
                      <code className="granule-id">{product.granule}</code>
                      {product.metadata_warnings.length > 0 && (
                        <p className="warning">{product.metadata_warnings.join(" ")}</p>
                      )}
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
                        Check processing availability
                      </button>
                      {job && (
                        <div className="warning compact" role="status">
                          <strong>{job.status.replaceAll("_", " ")}</strong>
                          <p>{job.message}</p>
                        </div>
                      )}
                      <SourceLink href={product.source_url}>View original metadata</SourceLink>
                      <SourceLink href="https://search.asf.alaska.edu/#/?dataset=NISAR">
                        Open ASF data search
                      </SourceLink>
                      <p className="tiny">
                        Science-file downloads require an Earthdata sign-in.
                        Credentials are never entered into TerraShift.
                      </p>
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
