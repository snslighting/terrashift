import { lazy, Suspense, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "motion/react";
import {
  ArrowUpRight,
  ArrowDown,
  ScanLine,
  Globe2,
  Check,
  Radio,
  PlayCircle,
} from "lucide-react";
import { useTour } from "../components/Tour";
import { Button, Eyebrow, Reveal, SourceLink, StatusBadge } from "../components/UI";
import { useApp, useGrids } from "../lib/context";
import { Raster } from "../components/Raster";
import RadarDiagram from "../components/RadarDiagram";
import { ChangeIcon } from "../components/Evidence";
import { PlaceGallery } from "../components/Discovery";
import { layerInfo } from "../lib/layers";
import { longDate } from "../lib/science";
import type { ChangeType, StudyCase } from "../lib/types";
const order: ChangeType[] = ["agriculture", "subsidence", "earthquake", "flood", "wildfire"];
const words = ["", "One", "Two", "Three", "Four", "Five"];
function CaseCard({ study, index }: { study: StudyCase; index: number }) {
  const pair = study.pairs.at(-1)!,
    kind = study.primary_layer,
    { grids } = useGrids(pair, [kind]);
  return (
    <Reveal className="case-card" delay={index * 0.08}>
      <Link to={`/discoveries#${study.id}`} className="case-card-image">
        <Raster grid={grids[kind]} kind={kind} entry={pair.layers[kind]} />
        <span className="image-key">{layerInfo[kind].label.toUpperCase()}</span>
        <span className="image-arrow">
          <ArrowUpRight />
        </span>
      </Link>
      <div className="case-card-copy">
        <span className="story-tag">{study.region.toUpperCase()}</span>
        <h3>{study.name}</h3>
        <p>{study.headline}</p>
        <div className="case-card-meta">
          {study.change_types.map((t) => (
            <span key={t} className="change-chip">
              <ChangeIcon type={t} size={13} />
              {t}
            </span>
          ))}
          <span className="tiny">
            {longDate(study.pairs[0].before)} → {longDate(pair.after)}
          </span>
        </div>
        <StatusBadge status={study.status} />
      </div>
    </Reveal>
  );
}
const Globe = lazy(() => import("../components/Globe"));
export default function Home() {
  const navigate = useNavigate(),
    tour = useTour(),
    { catalog } = useApp(),
    cases = catalog?.cases ?? [],
    hero = useRef<HTMLDivElement>(null),
    { scrollYProgress } = useScroll({
      target: hero,
      offset: ["start start", "end start"],
    }),
    reduced = useReducedMotion(),
    y = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 130]),
    // Lead with change types that have processed data; list the rest as "coming next".
    liveTypes = order.filter((t) => cases.some((c) => c.change_types.includes(t))),
    nextTypes = catalog ? order.filter((t) => !liveTypes.includes(t)) : [];
  return (
    <main className="home-page">
      <section className="hero" ref={hero}>
        <div className="hero-grid" />
        <motion.div className="hero-earth" style={{ y }}>
          <Suspense
            fallback={
              <div className="globe-loading">
                <Globe2 className="spin" size={80} />
              </div>
            }
          >
            <Globe
              areas={cases.map((c) => c.bbox)}
              onSelect={(lon, lat) =>
                navigate(`/explore?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`)
              }
            />
          </Suspense>
        </motion.div>
        <div className="hero-copy">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
          >
            <Eyebrow>NASA–ISRO NISAR / EARTH OBSERVATION</Eyebrow>
          </motion.div>
          <h1>
            {["Fields turn.", "Faults slip.", "Now you can", "see it change."].map(
              (line, i) => (
                <motion.span
                  key={line}
                  initial={reduced ? false : { opacity: 0, y: 35 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.75,
                    delay: 0.08 + i * 0.085,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={i > 1 ? "hero-light" : ""}
                >
                  {line}
                </motion.span>
              ),
            )}
          </h1>
          <motion.p
            initial={reduced ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
          >
            Real NISAR radar, through cloud and darkness, turned into maps of
            farm activity, earthquakes and sinking ground.
          </motion.p>
          <motion.div
            className="hero-actions"
            initial={reduced ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65 }}
          >
            <Button to="/discoveries">See what changed</Button>
            <Button to="/explore" secondary>
              Explore anywhere
            </Button>
            <button className="text-button hero-demo" onClick={() => tour.start(true, "demo")}>
              <PlayCircle size={17} />
              Watch the 90-second demo
            </button>
            <div className="hero-proof">
              <span className="live-dot" />
              REAL NISAR DATA · {cases.length || "—"} STUDY AREAS ·{" "}
              {cases.reduce((n, c) => n + c.pairs.length, 0) || "—"} RADAR PAIRS
            </div>
          </motion.div>
        </div>
        <div className="hero-bottom">
          <a href="#perspective" className="scroll-cue">
            <ArrowDown size={15} />
            SCROLL TO DISCOVER
          </a>
          <span>ONE PLANET. COUNTLESS PERSPECTIVES.</span>
          <div>
            <span>01 — 04</span>
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <div className="mission-strip">
        <span>POWERED BY EARTH OBSERVATION</span>
        <strong>
          NASA <small>×</small> ISRO
        </strong>
        <strong>
          NISAR <small>L-BAND SAR</small>
        </strong>
        <strong>
          ASF <small>DATA SERVICES</small>
        </strong>
        <strong>
          NGL <small>INDEPENDENT GNSS</small>
        </strong>
        <SourceLink href="https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/">
          SPACE APPS 2026
        </SourceLink>
        <p className="mission-disclaimer">
          An independent Space Apps project using public NISAR data. Not an
          official NASA or ISRO product.
        </p>
      </div>
      <section id="perspective" className="home-section perspective-section">
        <Reveal>
          <Eyebrow>01 / WHAT NISAR CAN SEE</Eyebrow>
          <h2>
            {liveTypes.length ? `${words[liveTypes.length] ?? liveTypes.length} kinds of change.` : "Kinds of change."}
            <br />
            <em>Measured with real data.</em>
          </h2>
        </Reveal>
        <div className="change-grid">
          {liveTypes.map((type, i) => {
            const info = catalog?.change_types[type],
              live = cases.filter((c) => c.change_types.includes(type));
            return (
              <Reveal key={type} className="change-card" delay={i * 0.06}>
                <ChangeIcon type={type} size={24} />
                <h3>{info?.label ?? type}</h3>
                <p>{info?.explain}</p>
                <span className="change-live">
                  {`${live.length} study area${live.length > 1 ? "s" : ""} · ${info?.measure}`}
                </span>
              </Reveal>
            );
          })}
        </div>
        {nextTypes.length > 0 && (
          <Reveal className="change-next">
            <span>COMING NEXT</span>
            <ul>
              {nextTypes.map((type) => (
                <li key={type}>
                  <ChangeIcon type={type} size={15} />
                  {catalog?.change_types[type]?.label ?? type}
                  <small>{catalog?.change_types[type]?.measure}</small>
                </li>
              ))}
            </ul>
            <p>
              The processing pipeline is built; these appear once real
              before-and-after products are processed. No map is shown without
              real data.
            </p>
          </Reveal>
        )}
      </section>
      <section className="radar-story home-section">
        <div className="radar-visual">
          <RadarDiagram />
          <span className="radar-caption">CONCEPTUAL ANIMATION · NOT A MEASUREMENT</span>
        </div>
        <Reveal className="radar-copy">
          <Eyebrow>02 / A SIGNAL THROUGH THE NOISE</Eyebrow>
          <h2>
            See through clouds.
            <br />
            <em>Listen to the Earth.</em>
          </h2>
          <p>
            NISAR sends L-band radar pulses and records their echoes. Comparing
            two visits reveals change three ways: coherence (did the surface
            change?), phase (did the ground move?) and brightness (did water or
            vegetation appear or vanish?).
          </p>
          <div className="radar-facts">
            <div>
              <Radio size={18} />
              <span>
                Active radar<small>Day and night observations</small>
              </span>
            </div>
            <div>
              <ScanLine size={18} />
              <span>
                Repeat observations
                <small>Compare actual acquisition pairs</small>
              </span>
            </div>
            <div>
              <Check size={18} />
              <span>
                Independent evidence<small>Test candidates against GNSS</small>
              </span>
            </div>
          </div>
          <Button to="/science" secondary>
            How the science works
          </Button>
        </Reveal>
      </section>
      <section className="home-section featured-section">
        <div className="section-heading">
          <Reveal>
            <Eyebrow>03 / EARTH STORIES</Eyebrow>
            <h2>
              Real places.
              <br />
              Real change.
            </h2>
          </Reveal>
          <Reveal>
            <p>
              Each map is made from actual NISAR products,
              <br />
              with the limits of each result stated alongside it.
            </p>
            <Link to="/discoveries" className="text-button">
              Explore Earth Stories
              <ArrowUpRight size={16} />
            </Link>
          </Reveal>
        </div>
        <div className="case-cards">
          {cases.map((c, i) => (
            <CaseCard study={c} index={i} key={c.id} />
          ))}
        </div>
      </section>
      <section className="home-section sample-places-section">
        <Reveal>
          <Eyebrow>04 / TRY A PLACE</Eyebrow>
          <h2>One click, real NISAR data.</h2>
          <p className="section-description">
            Wetlands, farms, volcanoes, ice and sinking cities. Each opens the explorer with NASA's own
            preview images for that place, ready to scrub through time.
          </p>
        </Reveal>
        <PlaceGallery compact limit={8} />
        <Link to="/discoveries" className="text-button">
          All sample places
          <ArrowUpRight size={16} />
        </Link>
      </section>
      <section className="home-section world-callout">
        <Reveal>
          <Eyebrow>05 / YOUR NEXT PERSPECTIVE</Eyebrow>
          <h2>
            Where will
            <br />
            you look <em>next?</em>
          </h2>
          <p>
            Search any location. Discover the real observations.
            <br />
            Let the evidence tell you what is available.
          </p>
          <Button to="/explore">Open the worldwide explorer</Button>
        </Reveal>
        <div className="world-callout-art">
          <Globe2 />
          <div className="coordinate-card">
            <span className="live-dot" />
            NASA CMR · PUBLIC CATALOG
            <small>
              Coverage footprints come from actual product metadata.
            </small>
          </div>
          <span className="orbit-coord">GLOBAL DISCOVERY / LOCAL EVIDENCE</span>
        </div>
      </section>
      <section className="credibility-strip">
        <Reveal>
          <Eyebrow>SCIENCE YOU CAN INSPECT</Eyebrow>
          <h3>
            Every map shows its evidence
            <br />
            and its limits.
          </h3>
        </Reveal>
        <div>
          <p>
            Each result keeps its dates, product identifier, reference, units
            and independent GNSS check. Missing observations stay missing, and
            a failed check is shown, not hidden.
          </p>
          <Link to="/data" className="text-button">
            Read the methodology
            <ArrowUpRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}
