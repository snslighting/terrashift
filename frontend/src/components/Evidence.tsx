import { lazy, Suspense, useMemo } from "react";
import {
  ShieldAlert,
  Sparkles,
  Radio,
  MapPin,
  Sprout,
  ArrowDownToLine,
  Activity,
  Waves,
  Flame,
} from "lucide-react";
import type {
  ChangeType,
  Grid,
  LayerKind,
  MapMarker,
  Pair,
  Pixel,
  Station,
  StudyCase,
} from "../lib/types";
import { format, layerInfo, studyRange } from "../lib/layers";
import { longDate, number, signed } from "../lib/science";
import { Legend, rasterURL } from "./Raster";
import { Skeleton, StatusBadge } from "./UI";
const MapViewer = lazy(() => import("./MapViewer"));

const icons = {
  agriculture: Sprout,
  subsidence: ArrowDownToLine,
  earthquake: Activity,
  flood: Waves,
  wildfire: Flame,
};
export function ChangeIcon({ type, size = 18 }: { type: ChangeType; size?: number }) {
  const Icon = icons[type];
  return <Icon size={size} aria-hidden="true" />;
}

export function caseMarkers(study: StudyCase, pair?: Pair): MapMarker[] {
  const markers: MapMarker[] = [];
  for (const e of study.event?.events ?? [])
    markers.push({
      id: e.id,
      longitude: e.longitude,
      latitude: e.latitude,
      label: `M${e.magnitude}`,
      kind: "event",
      title: `M${e.magnitude} earthquake · ${e.place} · ${e.time.slice(0, 10)}`,
    });
  for (const s of pair?.comparison?.stations ?? [])
    if (s.longitude != null && s.latitude != null)
      markers.push({
        id: s.station,
        longitude: s.longitude,
        latitude: s.latitude,
        label: s.station,
        kind: s.role === "reference" ? "reference" : "station",
      });
  if (pair?.gnss)
    markers.push({
      id: pair.gnss.station,
      longitude: pair.gnss.longitude,
      latitude: pair.gnss.latitude,
      label: pair.gnss.station,
      kind: "gnss",
      title: `GNSS ${pair.gnss.station}`,
    });
  return markers;
}

export function CaseMap({
  study,
  pair,
  kind,
  grid,
  onPixel,
  onMarker,
  compact = false,
  opacity,
  basemap,
  showStations = true,
  className,
}: {
  study: StudyCase;
  pair: Pair;
  kind: LayerKind;
  grid?: Grid;
  onPixel?: (lon: number, lat: number) => void;
  onMarker?: (m: MapMarker) => void;
  compact?: boolean;
  opacity?: number;
  basemap?: "satellite" | "geographic" | "terrain";
  showStations?: boolean;
  className?: string;
}) {
  const entry = pair.layers[kind];
  const range = useMemo(() => studyRange(study, kind), [study.id, kind]);
  const overlay = useMemo(
    () =>
      grid
        ? {
            key: `${pair.id}-${kind}`,
            url: rasterURL(grid, kind, range),
            coordinates: pair.coordinates,
          }
        : undefined,
    [grid, pair.id, kind, range],
  );
  const markers = useMemo(
    () =>
      caseMarkers(study, pair).filter(
        (m) => showStations || m.kind === "event",
      ),
    [study.id, pair.id, showStations],
  );
  return (
    <Suspense fallback={<Skeleton label="Loading the map…" />}>
      <MapViewer
        overlay={overlay}
        legend={<Legend kind={kind} entry={entry} range={range} compact={compact} />}
        markers={markers}
        focus={study.bbox}
        onPoint={onPixel}
        onMarker={onMarker}
        compact={compact}
        opacity={opacity}
        basemap={basemap}
        className={className}
      />
    </Suspense>
  );
}

export function Findings({ study }: { study: StudyCase }) {
  return (
    <ul className="findings">
      {study.findings.map((f) => (
        <li key={f}>
          <Sparkles size={15} />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  );
}

export function Confidence({
  study,
  pair,
}: {
  study: StudyCase;
  pair?: Pair;
}) {
  const c = pair?.comparison;
  return (
    <section className="confidence" aria-label="How sure are we?">
      <div className="confidence-heading">
        <ShieldAlert size={17} />
        <h4>How sure are we?</h4>
        <StatusBadge status={study.status} />
      </div>
      {c ? (
        <p>
          Checked against {c.count} independent GNSS stations (reference{" "}
          {c.reference}): ground-motion differs by{" "}
          <strong>{number(c.rmse_mm)} mm RMS</strong>, so ground-motion
          validation <strong>failed</strong>.
          {c.structure.status === "DIAGNOSTIC_ONLY" &&
            ` ${c.structure.interpretation}`}
        </p>
      ) : pair?.gnss ? (
        <p>
          No co-located independent comparison is possible: the nearest
          accepted radar pixel is{" "}
          {number(pair.gnss.nearest_accepted_radar_km ?? null)} km from GNSS
          station {pair.gnss.station}.
        </p>
      ) : (
        <p>No independent ground measurements are available for this area.</p>
      )}
      <ul>
        {study.limits.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}

export function PixelCard({ pixel }: { pixel: Pixel }) {
  const empty = pixel.samples.every((s) => s.value == null);
  return (
    <div className="pixel-card">
      <span className="tiny">
        <MapPin size={12} /> {pixel.latitude.toFixed(4)}°,{" "}
        {pixel.longitude.toFixed(4)}°
      </span>
      <dl className="details">
        {pixel.samples.map((s) => (
          <div key={s.kind}>
            <dt>{layerInfo[s.kind].short}</dt>
            <dd>
              {format(s.kind, s.value)}
              <small> · {s.support} px</small>
            </dd>
          </div>
        ))}
      </dl>
      {empty && (
        <p className="muted">
          No accepted measurement here (water, outside the study area, or
          rejected by quality checks). Nothing is filled in.
        </p>
      )}
    </div>
  );
}

export function StationCard({ station, reference }: { station: Station; reference: string }) {
  return (
    <div className="pixel-card">
      <span className="tiny">
        <Radio size={12} /> GNSS {station.station}
        {station.role === "reference" ? " · spatial reference" : ""}
      </span>
      {station.role === "reference" ? (
        <p className="muted">
          All radar and GNSS values are expressed relative to this station. Its
          stability is not independently verified.
        </p>
      ) : (
        <dl className="details">
          <div>
            <dt>Radar</dt>
            <dd>{signed(station.relative_nisar_candidate_los_mm)} mm</dd>
          </div>
          <div>
            <dt>GNSS</dt>
            <dd>{signed(station.relative_gnss_los_mm)} mm</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>{signed(station.residual_mm)} mm</dd>
          </div>
          <div>
            <dt>Coherence</dt>
            <dd>{number(station.median_coherence ?? null, 2)}</dd>
          </div>
        </dl>
      )}
      {station.unavailable_reason && <p className="warning">{station.unavailable_reason}</p>}
      <span className="tiny">Line of sight, relative to {reference}</span>
    </div>
  );
}

export function PairLabel({ pair }: { pair: Pair }) {
  return (
    <>
      {longDate(pair.before)} → {longDate(pair.after)}
    </>
  );
}
