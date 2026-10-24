import { motion, useReducedMotion } from "motion/react";
import type { Comparison, StudyCase } from "../lib/types";
import { number, finite, shortDate } from "../lib/science";

export function ResidualChart({ comparison }: { comparison: Comparison }) {
  const reduced = useReducedMotion(),
    rows = comparison.stations.filter((s) => finite(s.residual_mm)),
    max = Math.max(100, ...rows.map((s) => Math.abs(s.residual_mm!)));
  return (
    <div className="residual-chart">
      <div className="chart-caption">
        <span>EVERY AVAILABLE STATION</span>
        <span>Radar − GNSS · mm</span>
      </div>
      {rows.map((s, i) => (
        <div className="bar-row" key={s.station}>
          <span>{s.station}</span>
          <div className="bar-track">
            <i className="zero-line" />
            <motion.i
              className={s.residual_mm! < 0 ? "negative" : "positive"}
              initial={reduced ? false : { width: 0 }}
              animate={{ width: `${(Math.abs(s.residual_mm!) / max) * 48}%` }}
              transition={{ duration: 0.5, delay: i * 0.018 }}
              style={{
                left:
                  s.residual_mm! < 0
                    ? `${50 - (Math.abs(s.residual_mm!) / max) * 48}%`
                    : "50%",
              }}
            />
          </div>
          <strong>{number(s.residual_mm)}</strong>
        </div>
      ))}
      <div className="chart-note">
        Both relative to {comparison.reference}. No station was removed to
        improve agreement.
      </div>
    </div>
  );
}

export function StructurePanel({ comparison }: { comparison: Comparison }) {
  const s = comparison.structure;
  if (s.status !== "DIAGNOSTIC_ONLY") return null;
  const best = comparison.reference_sweep[0];
  const rows: [string, number | undefined][] = [
    ["As published", s.rmse_mm],
    ["If the common offset were removed", s.rmse_after_offset_mm],
    ["Offset predicted from the other stations", s.loo_offset_rmse_mm],
    ["Tilted plane predicted from the other stations", s.loo_plane_rmse_mm],
  ];
  const max = Math.max(...rows.map((r) => r[1] ?? 0), 1);
  return (
    <div className="structure-panel">
      <div className="chart-caption">
        <span>WHERE DOES THE ERROR COME FROM?</span>
        <span>RMS · mm</span>
      </div>
      {rows.map(([label, value]) => (
        <div className="bar-row structure-row" key={label}>
          <span>{label}</span>
          <div className="bar-track">
            <i className="positive" style={{ left: 0, width: `${((value ?? 0) / max) * 100}%` }} />
          </div>
          <strong>{number(value ?? null)}</strong>
        </div>
      ))}
      <p className="chart-note">
        Mean difference {number(s.mean_residual_mm ?? null)} mm.{" "}
        {s.interpretation} Diagnostic only — nothing here is applied to the
        maps.
        {best &&
          ` The best alternative reference (${best.reference}) would give ${number(best.rmse_mm)} mm.`}
      </p>
    </div>
  );
}

export function SeriesChart({
  study,
  station,
}: {
  study: StudyCase;
  station: string;
}) {
  const series = study.series?.stations[station];
  if (!series) return null;
  const all = [...series.radar_mm, ...(series.gnss_mm ?? [])];
  const limit = Math.max(20, ...all.map((v) => Math.abs(v)));
  const n = series.dates.length,
    x = (i: number) => 70 + (i * 420) / Math.max(1, n - 1),
    y = (v: number) => 150 - (v / limit) * 110;
  const path = (values: number[]) =>
    values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const ticks = [-limit, -limit / 2, 0, limit / 2, limit].map((v) => Math.round(v));
  return (
    <div className="temporal-chart">
      <div className="chart-caption">
        <span>{station} · CUMULATIVE MOTION</span>
        <span>Line of sight · mm</span>
      </div>
      <svg
        viewBox="0 0 520 300"
        role="img"
        aria-label={`Cumulative radar and GNSS line-of-sight motion at ${station}, relative to ${study.series?.reference}.`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1="58" x2="500" y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v ? "3 6" : undefined} />
            <text x="48" y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        <path d={path(series.radar_mm)} fill="none" stroke="#efaa7c" strokeWidth="2.5" />
        {series.gnss_mm && (
          <path d={path(series.gnss_mm)} fill="none" stroke="#55d9f3" strokeWidth="2" strokeDasharray="5 4" />
        )}
        {series.dates.map((d, i) => (
          <g key={d}>
            <circle cx={x(i)} cy={y(series.radar_mm[i])} r="5" fill="#efaa7c" />
            {series.gnss_mm && <circle cx={x(i)} cy={y(series.gnss_mm[i])} r="4" fill="#55d9f3" />}
            <text x={x(i)} y="285" textAnchor="middle">
              {shortDate(d)}
            </text>
          </g>
        ))}
      </svg>
      <div className="chart-key">
        <span>
          <i style={{ background: "#efaa7c" }} />
          Radar (NISAR)
        </span>
        <span>
          <i style={{ background: "#55d9f3" }} />
          Independent GNSS
        </span>
      </div>
      <p className="chart-note">
        Sequential 12-day pairs added end to end, relative to{" "}
        {study.series?.reference}. A chain has no loop-closure check and is not
        a calibrated velocity.
      </p>
    </div>
  );
}
