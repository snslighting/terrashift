import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { useApp, useGrids } from "../lib/context";
import { layerInfo } from "../lib/layers";
import { inspect } from "../lib/science";
import { futureApplications, narratives } from "../lib/stories";
import type { ChangeType, LayerKind, Pixel, StudyCase } from "../lib/types";
import { PageIntro, Reveal, SourceLink, Skeleton, Button, Empty } from "../components/UI";
import {
  CaseMap,
  ChangeIcon,
  Confidence,
  Findings,
  PairLabel,
  PixelCard,
} from "../components/Evidence";

const steps = [
  "Where and why",
  "What the radar saw",
  "Likely drivers",
  "How sure we are",
  "Why it matters",
] as const;

function Story({ study, index }: { study: StudyCase; index: number }) {
  const narrative = narratives[study.id],
    [step, setStep] = useState(1),
    [pairIndex, setPairIndex] = useState(study.pairs.length - 1),
    pair = study.pairs[pairIndex],
    kinds = Object.keys(pair.layers) as LayerKind[],
    [kind, setKind] = useState<LayerKind>(study.primary_layer),
    active = pair.layers[kind] ? kind : kinds[0],
    { grids, loading: gridsLoading } = useGrids(pair, kinds),
    [pixel, setPixel] = useState<Pixel>(),
    total = narrative ? steps.length : 2;
  useEffect(() => setPixel(undefined), [pair.id]);
  const go = (n: number) => {
    const next = Math.min(Math.max(n, 1), total);
    setStep(next);
    // Each step can bring its own map layer, so the map follows the story.
    const wanted = narrative?.layers?.[next as 1 | 2 | 3 | 4 | 5];
    setKind(wanted && pair.layers[wanted] ? wanted : study.primary_layer);
  };
  const title = narrative ? steps[step - 1] : step === 1 ? "What the radar saw" : "How sure we are";
  return (
    <section id={study.id} className="earth-story">
      <div className="earth-story-heading">
        <div>
          <span className="story-tag">
            0{index + 1} / {study.region.toUpperCase()}
          </span>
          <h2>{study.name}</h2>
          <p className="story-headline">{study.headline}</p>
          <div className="case-card-meta">
            {study.change_types.map((t) => (
              <span key={t} className="change-chip">
                <ChangeIcon type={t} size={13} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="earth-story-stage">
        <div className="story-map">
          <CaseMap
            study={study}
            pair={pair}
            kind={active}
            grid={grids[active]}
            compact
            onPixel={(lon, lat) => {
              if (!gridsLoading) setPixel(inspect(pair, grids, lon, lat));
            }}
          />
          <span className="story-map-layer" aria-live="polite">
            Map: {layerInfo[active].label}
          </span>
        </div>
        <div className="story-narration">
          <ol className="story-steps" aria-label="Story steps">
            {Array.from({ length: total }, (_, i) => (
              <li key={i}>
                <button
                  className={step === i + 1 ? "active" : step > i + 1 ? "done" : ""}
                  aria-current={step === i + 1 ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${narrative ? steps[i] : i ? "How sure we are" : "What the radar saw"}`}
                  onClick={() => go(i + 1)}
                >
                  {i + 1}
                </button>
              </li>
            ))}
          </ol>
          <h3 className="story-step-title">
            <span>
              {step} / {total}
            </span>
            {title}
          </h3>
          <div className="story-step-body">{renderStep()}</div>
          <div className="story-step-nav">
            <button
              className="text-button"
              onClick={() => go(step - 1)}
              disabled={step === 1}
            >
              <ArrowLeft size={15} />
              Back
            </button>
            {step < total ? (
              <button className="button secondary" onClick={() => go(step + 1)}>
                Next: {narrative ? steps[step] : "How sure we are"}
                <ArrowRight size={15} />
              </button>
            ) : (
              <Link to={`/analysis?case=${study.id}`} className="button secondary">
                Open the analysis
                <ArrowRight size={15} />
              </Link>
            )}
          </div>
        </div>
      </div>
      <div className="story-bottom">
        <Link to={`/analysis?case=${study.id}`} className="button secondary">
          Open the analysis
          <ArrowRight size={17} />
        </Link>
        <Link
          to={`/explore?lat=${((study.bbox[1] + study.bbox[3]) / 2).toFixed(3)}&lon=${((study.bbox[0] + study.bbox[2]) / 2).toFixed(3)}`}
          className="text-button"
        >
          Find more observations here
          <ArrowUpRight size={16} />
        </Link>
        {study.event?.source && (
          <SourceLink href={study.event.source}>USGS event page</SourceLink>
        )}
      </div>
    </section>
  );

  function renderStep() {
    const id = narrative ? step : step === 1 ? 2 : 4;
    if (id === 1 && narrative)
      return (
        <>
          <p>{narrative.why}</p>
        </>
      );
    if (id === 2)
      return (
        <>
          <span className="eyebrow">
            <PairLabel pair={pair} />
          </span>
          <Findings study={study} />
          <div className="segmented wrap" role="group" aria-label="Map layer">
            {kinds.map((k) => (
              <button
                key={k}
                className={active === k ? "active" : ""}
                aria-pressed={active === k}
                onClick={() => setKind(k)}
              >
                {layerInfo[k].short}
              </button>
            ))}
          </div>
          {study.pairs.length > 1 && (
            <div className="story-pair-buttons">
              {study.pairs.map((p, i) => (
                <button
                  key={p.id}
                  className={pairIndex === i ? "active" : ""}
                  aria-pressed={pairIndex === i}
                  onClick={() => setPairIndex(i)}
                >
                  {p.before.slice(5)} → {p.after.slice(5)}
                </button>
              ))}
            </div>
          )}
          <p className="muted">{layerInfo[active].explain}</p>
          <div aria-live="polite">{pixel && <PixelCard pixel={pixel} />}</div>
        </>
      );
    if (id === 3 && narrative)
      return (
        <>
          <p className="story-hypothesis">
            Hypotheses, not conclusions: the radar shows that the surface
            changed, and these are the most likely reasons.
          </p>
          <ul className="story-drivers">
            {narrative.drivers.map((d) => (
              <li key={d.cause}>
                <strong>{d.cause}</strong>
                <span>{d.evidence}</span>
              </li>
            ))}
          </ul>
          <p className="muted">
            <strong>What else could cause it:</strong> {narrative.alternatives}
          </p>
        </>
      );
    if (id === 4) return <Confidence study={study} pair={pair} />;
    if (id === 5 && narrative)
      return (
        <ul className="story-people">
          {narrative.people.map((p) => (
            <li key={p.who}>
              <strong>{p.who}</strong>
              <span>{p.use}</span>
            </li>
          ))}
        </ul>
      );
    return null;
  }
}

export default function Discoveries() {
  const { catalog, error } = useApp(),
    location = useLocation(),
    [filter, setFilter] = useState<ChangeType | "all">("all");
  const cases = catalog?.cases ?? [];
  const types = [...new Set(cases.flatMap((c) => c.change_types))];
  useEffect(() => {
    if (catalog && location.hash)
      document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [catalog, location.hash]);
  return (
    <main className="content-page discoveries-page">
      <PageIntro
        eyebrow="EARTH STORIES / WHAT THE RADAR SAW"
        title="A changing planet, seen by radar."
        description="Farm fields, earthquakes and sinking ground, mapped from real NISAR products. Each story leads with what changed and ends with how sure we are."
      />
      {!catalog ? (
        error ? (
          <Empty title="Evidence unavailable">{error}</Empty>
        ) : (
          <Skeleton />
        )
      ) : (
        <>
          <div className="story-filters">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              All stories
            </button>
            {types.map((t) => (
              <button
                key={t}
                className={filter === t ? "active" : ""}
                onClick={() => setFilter(t)}
              >
                <ChangeIcon type={t} size={14} />
                {catalog.change_types[t].label}
              </button>
            ))}
          </div>
          {cases
            .filter((c) => filter === "all" || c.change_types.includes(filter))
            .map((c) => (
              <Story study={c} index={cases.indexOf(c)} key={c.id} />
            ))}
        </>
      )}
      <section className="story-applications" aria-labelledby="applications-title">
        <span className="eyebrow">
          <span />
          BEYOND THESE STORIES
        </span>
        <h2 id="applications-title">What NISAR could do next.</h2>
        <p className="section-description">
          NISAR maps nearly all of Earth's land and ice every 12 days, day and
          night, through cloud. These are uses its design makes possible; they
          are not results shown on this site.
        </p>
        <div className="applications-grid">
          {futureApplications.map((a) => (
            <div key={a.title}>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </div>
          ))}
        </div>
      </section>
      <Reveal className="story-future">
        <h2>
          Floods, wetlands
          <br />
          and wildfires are next.
        </h2>
        <p>
          The backscatter pipeline for NISAR GCOV products is built and tested.
          Each new area appears here once its before-and-after products have
          been downloaded and processed. No map is shown until real data exists.
        </p>
        <Button to="/explore">Find observations anywhere</Button>
      </Reveal>
    </main>
  );
}
