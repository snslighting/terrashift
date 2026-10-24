import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useApp, useGrids } from "../lib/context";
import { layerInfo } from "../lib/layers";
import { inspect } from "../lib/science";
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

function Story({ study, index }: { study: StudyCase; index: number }) {
  const [pairIndex, setPairIndex] = useState(study.pairs.length - 1),
    pair = study.pairs[pairIndex],
    kinds = Object.keys(pair.layers) as LayerKind[],
    [kind, setKind] = useState<LayerKind>(study.primary_layer),
    active = pair.layers[kind] ? kind : kinds[0],
    { grids } = useGrids(pair, kinds),
    [pixel, setPixel] = useState<Pixel>();
  useEffect(() => setPixel(undefined), [pair.id]);
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
            onPixel={(lon, lat) => setPixel(inspect(pair, grids, lon, lat))}
          />
        </div>
        <div className="story-narration">
          <span className="eyebrow">
            <PairLabel pair={pair} />
          </span>
          <p>{study.summary}</p>
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
            <div className="story-pair-buttons">
              {study.pairs.map((p, i) => (
                <button
                  key={p.id}
                  className={pairIndex === i ? "active" : ""}
                  onClick={() => setPairIndex(i)}
                >
                  {p.before.slice(5)} → {p.after.slice(5)}
                </button>
              ))}
            </div>
          )}
          <p className="muted">{layerInfo[active].explain}</p>
          {pixel && <PixelCard pixel={pixel} />}
        </div>
      </div>
      <div className="story-results">
        <div>
          <h3>What changed</h3>
          <Findings study={study} />
        </div>
        <Confidence study={study} pair={pair} />
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
