import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Download,
  Play,
  Pause,
  Columns2,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Info,
  Link2,
  Check,
  ImageDown,
  SquareDashed,
  X,
  Quote,
} from "lucide-react";
import { narratives } from "../lib/stories";
import { mapImage, downloadCanvas } from "../lib/mapImage";
import { useApp, useGrids } from "../lib/context";
import { caseById } from "../lib/api";
import { layerInfo, format, studyRange } from "../lib/layers";
import {
  areaSummary,
  downloadCSV,
  downloadJSON,
  inspect,
  longDate,
  number,
  signed,
} from "../lib/science";
import type { LayerKind, MapMarker, Pixel, Selection, Station } from "../lib/types";
import { PageIntro, StatusBadge, Skeleton, Empty, SourceLink } from "../components/UI";
import { Legend, Raster } from "../components/Raster";
import { ResidualChart, SeriesChart, StructurePanel } from "../components/Charts";
import {
  CaseMap,
  ChangeIcon,
  Confidence,
  Findings,
  PairLabel,
  PixelCard,
  StationCard,
} from "../components/Evidence";

/** Scroll to a section without putting "#name" into a hash-routed URL. */
const jump = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start",
  });
};

function AreaPanel({
  summary,
  kind,
  onClear,
}: {
  summary?: ReturnType<typeof areaSummary>;
  kind: LayerKind;
  onClear: () => void;
}) {
  if (!summary)
    return (
      <p className="area-hint">
        <SquareDashed size={15} /> Draw a rectangle or polygon on the map (tools on the right) to get
        statistics for that area.
      </p>
    );
  const peak = Math.max(1, ...summary.histogram),
    unit = layerInfo[kind].unit,
    [lo, hi] = summary.histogramRange;
  return (
    <section className="area-panel" aria-label="Statistics for the drawn area">
      <div className="area-panel-head">
        <h3>Selected area</h3>
        <button className="text-button" onClick={onClear}>
          <X size={14} /> Clear
        </button>
      </div>
      {summary.cells === 0 ? (
        <p className="muted">No accepted radar data inside this area.</p>
      ) : (
        <>
          <dl className="area-stats">
            <div>
              <dt>Median</dt>
              <dd>{format(kind, summary.median)}</dd>
            </div>
            <div>
              <dt>Mean</dt>
              <dd>{format(kind, summary.mean)}</dd>
            </div>
            <div>
              <dt>5th – 95th percentile</dt>
              <dd>
                {format(kind, summary.p05)} to {format(kind, summary.p95)}
              </dd>
            </div>
            <div>
              <dt>Behind it</dt>
              <dd>
                {summary.cells.toLocaleString()} cells · {summary.sourcePixels.toLocaleString()} radar pixels
              </dd>
            </div>
          </dl>
          <figure className="area-histogram">
            <svg viewBox={`0 0 ${summary.histogram.length * 10} 40`} preserveAspectRatio="none" role="img"
              aria-label={`Histogram of ${summary.cells} cells from ${format(kind, lo)} to ${format(kind, hi)}`}>
              {summary.histogram.map((n, i) => (
                <rect key={i} x={i * 10 + 1} width={8} y={40 - (n / peak) * 40} height={(n / peak) * 40} />
              ))}
            </svg>
            <figcaption>
              <span>{format(kind, lo)}</span>
              <span>Distribution of display cells{unit ? ` (${unit})` : ""}</span>
              <span>{format(kind, hi)}</span>
            </figcaption>
          </figure>
          <p className="tiny">
            Statistics use the display cells, each the mean of its native pixels, weighted equally. The
            histogram spans the lowest to the highest cell in the area.
          </p>
        </>
      )}
    </section>
  );
}

export default function Analysis() {
  const { catalog, error } = useApp(),
    [params, setParams] = useSearchParams();
  // With no case in the link, open on Venezuela: the clearest signal (hundreds of mm)
  // well above the error, while California remains the validation story.
  const study =
    caseById(catalog, params.get("case")) ??
    caseById(catalog, "venezuela-2026") ??
    catalog?.cases[0];
  const [pairIndex, setPairIndex] = useState(0),
    [kind, setKind] = useState<LayerKind>("disturbance"),
    // Shareable view: case, pair, layer and comparison mode live in the URL (?case=&pair=&layer=&mode=).
    linked = useRef({ pair: params.get("pair"), layer: params.get("layer") }),
    [mode, setMode] = useState<"swipe" | "side" | "series">(() => {
      const m = params.get("mode");
      return m === "side" || m === "series" ? m : "swipe";
    }),
    [copied, setCopied] = useState(false),
    [area, setArea] = useState<Selection>(),
    [swipe, setSwipe] = useState(50),
    [playing, setPlaying] = useState(false),
    [pixel, setPixel] = useState<Pixel>(),
    [station, setStation] = useState<Station>(),
    [seriesStation, setSeriesStation] = useState("");
  useEffect(() => {
    if (!study) return;
    const want = linked.current,
      linkedPair = study.pairs.findIndex((p) => p.id === want.pair),
      linkedLayer = want.layer as LayerKind | null;
    linked.current = { pair: null, layer: null };
    setPairIndex(linkedPair >= 0 ? linkedPair : study.pairs.length - 1);
    setKind(
      linkedLayer && study.pairs.some((p) => p.layers[linkedLayer])
        ? linkedLayer
        : study.primary_layer,
    );
    setPixel(undefined);
    setStation(undefined);
    setArea(undefined);
    setPlaying(false);
    const names = Object.keys(study.series?.stations ?? {}).filter(
      (n) => n !== study.series?.reference,
    );
    setSeriesStation(names.includes("P298") ? "P298" : (names[0] ?? ""));
  }, [study?.id]);
  useEffect(() => {
    if (!playing || !study) return;
    const timer = setInterval(
      () => setPairIndex((v) => (v + 1) % study.pairs.length),
      2200,
    );
    return () => clearInterval(timer);
  }, [playing, study?.id]);
  const pair = study?.pairs[Math.min(pairIndex, (study?.pairs.length ?? 1) - 1)];
  const kinds = pair ? (Object.keys(pair.layers) as LayerKind[]) : [];
  const active = pair?.layers[kind] ? kind : kinds[0];
  const {
    grids,
    error: gridError,
    loading: gridsLoading,
    retry: retryGrids,
  } = useGrids(pair, kinds);
  useEffect(() => setPixel(undefined), [pair?.id]);
  const first = study?.pairs[0],
    last = study?.pairs.at(-1);
  const { grids: firstGrids } = useGrids(
    study && study.pairs.length > 1 ? first : undefined,
    [active],
  );
  const { grids: lastGrids } = useGrids(
    study && study.pairs.length > 1 ? last : undefined,
    [active],
  );
  useEffect(() => {
    if (!study || !pair || !active) return;
    setParams(
      { case: study.id, pair: pair.id, layer: active, mode },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [study?.id, pair?.id, active, mode]);
  const range = study && active ? studyRange(study, active) : ([0, 1] as [number, number]);
  const summary = useMemo(
    () =>
      area && pair && grids[active] && !gridsLoading
        ? areaSummary(pair, grids[active]!, area)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [area, pair?.id, active, grids, gridsLoading],
  );
  const copyLink = () =>
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  const seriesNames = useMemo(
    () =>
      Object.keys(study?.series?.stations ?? {}).filter(
        (n) => n !== study?.series?.reference,
      ),
    [study?.id],
  );
  if (!catalog || !study || !pair)
    return (
      <main className="content-page">
        <PageIntro
          eyebrow="SCIENTIFIC WORKSPACE"
          title="Look beneath the surface."
          description="Compare real radar observations and inspect the evidence behind each result."
        />
        {error ? <Empty title="Evidence unavailable">{error}</Empty> : <Skeleton />}
      </main>
    );
  const comparison = pair.comparison;
  const onMarker = (m: MapMarker) => {
    const s = comparison?.stations.find((x) => x.station === m.id);
    if (s) setStation(s);
  };
  const exportJSON = () =>
    downloadJSON(`terrashift-${study.id}.json`, {
      project: "TerraShift",
      study: {
        id: study.id,
        name: study.name,
        region: study.region,
        change_types: study.change_types,
        findings: study.findings,
        limits: study.limits,
        status: study.status,
      },
      pair,
      selected_pixel: pixel,
      selected_station: station,
      validation: comparison?.validation ?? "NO_INDEPENDENT_COMPARISON",
      total_uncertainty_mm: null,
      source: catalog.gnss_source,
      exported_utc: new Date().toISOString(),
    });
  const exportCSV = () =>
    downloadCSV(`terrashift-${study.id}-stations.csv`, [
      [
        "granule",
        "before",
        "after",
        "station",
        "radar_los_mm",
        "gnss_los_mm",
        "residual_mm",
        "validation",
        "reference",
      ],
      ...study.pairs.flatMap((p) =>
        (p.comparison?.stations ?? []).map((s) => [
          p.granule,
          p.before,
          p.after,
          s.station,
          s.relative_nisar_candidate_los_mm,
          s.relative_gnss_los_mm,
          s.residual_mm,
          p.comparison!.validation,
          p.comparison!.reference,
        ]),
      ),
    ]);
  const stat = pair.layers[active]?.native_statistics;
  const takeaway = narratives[study.id]?.takeaway;
  const exportPNG = () => {
    const grid = grids[active];
    if (grid)
      downloadCanvas(
        mapImage(study, pair, active, grid, range),
        `terrashift-${study.id}-${pair.before}-${active}.png`,
      );
  };
  const citation = `TerraShift (${new Date().getFullYear()}). ${study.name}: ${layerInfo[active].label}, ${pair.before} to ${pair.after}. Derived from NASA–ISRO NISAR product ${pair.granule} (NASA/ASF DAAC), accessed ${catalog.generated?.slice(0, 10) ?? "2026"}. https://github.com/snslighting/terrashift`;
  return (
    <main className="content-page analysis-page">
      <div className="analysis-heading">
        <PageIntro
          eyebrow={`SCIENTIFIC WORKSPACE / ${study.region.toUpperCase()}`}
          title={study.name}
          description={study.headline}
        />
        <div className="analysis-exports">
          <button
            className="button secondary"
            onClick={copyLink}
            aria-label="Copy a link to this exact view"
          >
            {copied ? <Check size={15} /> : <Link2 size={15} />}
            {copied ? "Link copied" : "Copy link"}
          </button>
          <span className="visually-hidden" aria-live="polite">
            {copied ? "Link to this view copied to the clipboard" : ""}
          </span>
          <button
            className="button secondary"
            onClick={exportPNG}
            disabled={!grids[active]}
          >
            <ImageDown size={15} />
            Map image
          </button>
          <button className="button secondary" onClick={exportJSON}>
            <Download size={15} />
            Evidence JSON
          </button>
          {study.pairs.some((p) => p.comparison) && (
            <button className="text-button" onClick={exportCSV}>
              Station CSV
              <Download size={13} />
            </button>
          )}
        </div>
      </div>
      {takeaway && (
        <p className="analysis-takeaway">
          <span>KEY TAKEAWAY</span>
          {takeaway}
        </p>
      )}
      <div className="case-switch" role="tablist" aria-label="Study area">
        {catalog.cases.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === study.id}
            className={c.id === study.id ? "active" : ""}
            onClick={() => setParams({ case: c.id })}
          >
            {c.change_types.map((t) => (
              <ChangeIcon key={t} type={t} size={14} />
            ))}
            {c.name}
          </button>
        ))}
      </div>
      <section className="analysis-summary">
        <div>
          <StatusBadge status={study.status} />
          <h2>
            <PairLabel pair={pair} />
          </h2>
          <p>
            {pair.orbit} orbit · track {pair.track} / frame {pair.frame}
          </p>
        </div>
        <div className="analysis-stat">
          <span>{layerInfo[active].short.toUpperCase()} · MEDIAN</span>
          <strong>{format(active, stat?.median ?? null)}</strong>
          <p>{stat?.count.toLocaleString()} accepted pixels</p>
        </div>
        <div className="analysis-stat">
          <span>GNSS CHECK</span>
          <strong className={comparison ? "unknown" : ""}>
            {comparison ? `${number(comparison.rmse_mm)} mm` : "—"}
          </strong>
          <p>
            {comparison
              ? `RMS · ${comparison.count} stations · validation failed`
              : "No co-located stations"}
          </p>
        </div>
        <div className="analysis-stat">
          <span>TOTAL UNCERTAINTY</span>
          <strong className="unknown">Unknown</strong>
          <p>Independent calibration required</p>
        </div>
      </section>
      <nav className="analysis-nav" aria-label="Sections of this analysis">
        <a href="#analysis-map" onClick={jump("analysis-map")}>Map</a>
        {study.pairs.length > 1 && (
          <a href="#analysis-compare" onClick={jump("analysis-compare")}>Compare</a>
        )}
        {(comparison || pair.gnss) && (
          <a href="#analysis-evidence" onClick={jump("analysis-evidence")}>Evidence</a>
        )}
        <a href="#analysis-method" onClick={jump("analysis-method")}>Method</a>
      </nav>
      <div className="analysis-toolbar">
        <div className="segmented wrap" role="group" aria-label="Map layer">
          {kinds.map((k) => (
            <button
              key={k}
              className={active === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {layerInfo[k].short}
            </button>
          ))}
        </div>
        {study.pairs.length > 1 && (
          <div className="analysis-timeline">
            {study.pairs.map((p, i) => (
              <button
                key={p.id}
                className={pair.id === p.id ? "active" : ""}
                onClick={() => {
                  setPlaying(false);
                  setPairIndex(i);
                }}
              >
                <span>PAIR {String(i + 1).padStart(2, "0")}</span>
                {p.before.slice(5)} → {p.after.slice(5)}
              </button>
            ))}
            <button
              onClick={() => setPlaying(!playing)}
              aria-label={playing ? "Pause the timeline" : "Play the timeline"}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
          </div>
        )}
      </div>
      <section className="analysis-map" id="analysis-map">
        <CaseMap
          study={study}
          pair={pair}
          kind={active}
          grid={grids[active]}
          onPixel={(lon, lat) => {
            setStation(undefined);
            if (!gridsLoading) setPixel(inspect(pair, grids, lon, lat));
          }}
          onMarker={onMarker}
          onSelect={setArea}
          selection={area}
        />
        {/* Always present so screen readers announce each new inspection. */}
        <div
          className={pixel || station ? "analysis-inspector" : "visually-hidden"}
          aria-live="polite"
        >
          {station && comparison ? (
            <StationCard station={station} reference={comparison.reference} />
          ) : (
            pixel && <PixelCard pixel={pixel} />
          )}
        </div>
      </section>
      <AreaPanel
        summary={summary}
        kind={active}
        onClear={() => setArea(undefined)}
      />
      {gridError && (
        <p className="warning" role="alert">
          {gridError}{" "}
          <button className="text-button" onClick={retryGrids}>
            Retry
          </button>
        </p>
      )}
      <section className="story-results">
        <div>
          <h3>What changed</h3>
          <Findings study={study} />
        </div>
        <Confidence study={study} pair={pair} />
      </section>
      {study.pairs.length > 1 && (
        <section className="comparison-section" id="analysis-compare">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                TIME, SIDE BY SIDE
              </div>
              <h2>Watch the surface change.</h2>
            </div>
            <div className="mode-tabs">
              {(
                [
                  ["swipe", ArrowLeftRight, "Swipe"],
                  ["side", Columns2, "Side by side"],
                  ...(seriesNames.length
                    ? ([["series", ChartNoAxesCombined, "Timeline"]] as const)
                    : []),
                ] as const
              ).map(([key, Icon, label]) => (
                <button
                  key={key}
                  className={mode === key ? "active" : ""}
                  onClick={() => setMode(key)}
                >
                  <Icon size={15} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="section-description">
            First and latest 12-day pairs on the same registered grid. Each
            panel is one interferometric pair, not a photograph.
          </p>
          {mode === "swipe" && first && last && (
            <div className="swipe-comparison">
              <div className="swipe-base">
                <Raster grid={lastGrids[active]} kind={active} range={range} />
              </div>
              <div className="swipe-before" style={{ clipPath: `inset(0 ${100 - swipe}% 0 0)` }}>
                <Raster grid={firstGrids[active]} kind={active} range={range} />
              </div>
              <div className="swipe-line" style={{ left: `${swipe}%` }}>
                <span>
                  <ArrowLeftRight size={18} />
                </span>
              </div>
              <span className="comparison-date left">
                {first.before.slice(5)} → {first.after.slice(5)}
              </span>
              <span className="comparison-date right">
                {last.before.slice(5)} → {last.after.slice(5)}
              </span>
              <input
                aria-label="Compare first and latest pair"
                type="range"
                min="0"
                max="100"
                value={swipe}
                onChange={(e) => setSwipe(+e.target.value)}
              />
            </div>
          )}
          {mode === "side" && first && last && (
            <div className="side-comparison">
              {[first, last].map((p, i) => (
                <div key={p.id}>
                  <div className="comparison-raster">
                    <Raster
                      grid={(i ? lastGrids : firstGrids)[active]}
                      kind={active}
                      range={range}
                    />
                  </div>
                  <h3>
                    {longDate(p.before)} → {longDate(p.after)}
                  </h3>
                  <p>
                    Median {format(active, p.layers[active]?.native_statistics.median ?? null)}
                    {p.comparison && ` · GNSS RMS ${number(p.comparison.rmse_mm)} mm`}
                  </p>
                </div>
              ))}
            </div>
          )}
          {mode === "series" && (
            <div className="temporal-view">
              <label>
                GNSS station
                <select value={seriesStation} onChange={(e) => setSeriesStation(e.target.value)}>
                  {seriesNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <SeriesChart study={study} station={seriesStation} />
            </div>
          )}
          {mode !== "series" && pair.layers[active] && (
            <Legend kind={active} range={range} />
          )}
        </section>
      )}
      {comparison && (
        <section className="validation-section" id="analysis-evidence">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                INDEPENDENT EVIDENCE
              </div>
              <h2>Radar against GNSS.</h2>
            </div>
            <span className="failure-badge">GROUND-MOTION VALIDATION FAILED</span>
          </div>
          <div className="validation-grid">
            <ResidualChart comparison={comparison} />
            <div className="validation-explanation">
              <StructurePanel comparison={comparison} />
              <p>
                Daily GNSS east, north and up changes on the radar dates are
                projected onto the radar line of sight, and both are expressed
                relative to {comparison.reference}. Coherence-based surface
                change does not depend on this reference and is unaffected.
              </p>
              <SourceLink href={catalog.gnss_source}>Independent GNSS source · NGL</SourceLink>
            </div>
          </div>
        </section>
      )}
      {pair.gnss && (
        <section className="validation-section" id={comparison ? undefined : "analysis-evidence"}>
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                <span />
                INDEPENDENT EVIDENCE
              </div>
              <h2>GNSS {pair.gnss.station} saw the earthquake.</h2>
            </div>
          </div>
          <div className="native-stats">
            <div>
              <span>EAST</span>
              <strong>{signed(pair.gnss.east_north_up_mm[0], 0)} mm</strong>
            </div>
            <div>
              <span>NORTH</span>
              <strong>{signed(pair.gnss.east_north_up_mm[1], 0)} mm</strong>
            </div>
            <div>
              <span>UP</span>
              <strong>{signed(pair.gnss.east_north_up_mm[2], 0)} mm</strong>
            </div>
            <div>
              <span>ALONG RADAR LINE OF SIGHT</span>
              <strong>{signed(pair.gnss.los_mm ?? null, 0)} mm</strong>
            </div>
          </div>
          <p className="section-description">
            <Info size={14} /> The station is {number(pair.gnss.nearest_accepted_radar_km ?? null)} km from the
            nearest accepted radar pixel, so it confirms the scale and direction of motion but cannot validate
            individual radar values. Radar values are relative to a reference area; GNSS values are absolute.
          </p>
          <SourceLink href={pair.gnss.source}>GNSS time series · NGL</SourceLink>
        </section>
      )}
      <section className="method-note" id="analysis-method">
        <div className="eyebrow">
          <span />
          REPRODUCIBLE, WITH LIMITS
        </div>
        <h3>Know what each number represents.</h3>
        <p>
          Maps show means of accepted native pixels grouped into a{" "}
          {pair.grid.size} × {pair.grid.size} Web Mercator display grid, with the
          exact number of source pixels per cell. Medians above come from the
          native pixels themselves. Line-of-sight motion is positive toward the
          satellite; it is not converted to vertical motion.
        </p>
        <dl className="provenance">
          <dt>Product</dt>
          <dd>
            <code className="granule-id">{pair.granule}</code>
          </dd>
          {pair.correction_equation && (
            <>
              <dt>Corrections</dt>
              <dd>{pair.correction_equation}</dd>
            </>
          )}
          {pair.ionosphere_policy && (
            <>
              <dt>Ionosphere policy</dt>
              <dd>{pair.ionosphere_policy.replaceAll("_", " ")}</dd>
            </>
          )}
          <dt>Source hashes</dt>
          <dd>
            {Object.entries(pair.source_hashes).map(([k, v]) => (
              <span key={k} className="hash">
                {k}: {v.slice(0, 16)}…
              </span>
            ))}
          </dd>
        </dl>
        <div className="citation">
          <span>
            <Quote size={14} /> CITE THIS VIEW
          </span>
          <p>{citation}</p>
          <button
            className="text-button"
            onClick={() => navigator.clipboard?.writeText(citation).catch(() => {})}
          >
            Copy citation
          </button>
        </div>
        <Link to="/data" className="text-button">
          Inspect processing and provenance
          <ArrowRight size={15} />
        </Link>
      </section>
    </main>
  );
}
