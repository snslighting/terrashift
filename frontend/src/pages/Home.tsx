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
  Satellite,
  ScanLine,
  Globe2,
  Check,
  Radio,
} from "lucide-react";
import { Button, Eyebrow, Reveal, SourceLink, StatusBadge } from "../components/UI";
import { useApp, useGrids } from "../lib/context";
import { Raster } from "../components/Raster";
import { ChangeIcon } from "../components/Evidence";
import { layerInfo } from "../lib/layers";
import { longDate } from "../lib/science";
import type { ChangeType, StudyCase } from "../lib/types";
const order: ChangeType[] = ["agriculture", "subsidence", "earthquake", "flood", "wildfire"];
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
    { catalog } = useApp(),
    cases = catalog?.cases ?? [],
    hero = useRef<HTMLDivElement>(null),
    { scrollYProgress } = useScroll({
      target: hero,
      offset: ["start start", "end start"],
    }),
    reduced = useReducedMotion(),
    y = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : 130]);
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
            NISAR radar sees through clouds, day and night, every 12 days.
            <br />
            TerraShift turns its real observations into maps of farm activity,
            <br className="desktop-break" /> earthquake deformation and ground
            motion anywhere on Earth.
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
          </motion.div>
          <div className="hero-proof">
            <span className="live-dot" />
            REAL NISAR DATA · {cases.length || "—"} STUDY AREAS ·{" "}
            {cases.reduce((n, c) => n + c.pairs.length, 0) || "—"} RADAR PAIRS
          </div>
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
      </div>
      <section id="perspective" className="home-section perspective-section">
        <Reveal>
          <Eyebrow>01 / WHAT NISAR CAN SEE</Eyebrow>
          <h2>
            Five kinds of change.
            <br />
            <em>One radar.</em>
          </h2>
        </Reveal>
        <div className="change-grid">
          {order.map((type, i) => {
            const info = catalog?.change_types[type],
              live = cases.filter((c) => c.change_types.includes(type));
            return (
              <Reveal key={type} className="change-card" delay={i * 0.06}>
                <ChangeIcon type={type} size={24} />
                <h3>{info?.label ?? type}</h3>
                <p>{info?.explain}</p>
                <span className={live.length ? "change-live" : "change-ready"}>
                  {live.length
                    ? `${live.length} study area${live.length > 1 ? "s" : ""} · ${info?.measure}`
                    : "Pipeline ready · awaiting processed data"}
                </span>
              </Reveal>
            );
          })}
        </div>
      </section>
      <section className="radar-story home-section">
        <div className="radar-visual">
          <div className="radar-orbit" />
          <Satellite size={44} className="radar-satellite" />
          <div className="radar-beam b1" />
          <div className="radar-beam b2" />
          <div className="radar-ground">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <span className="diagram-tag tag-satellite">01 / TRANSMIT</span>
          <span className="diagram-tag tag-ground">02 / LISTEN</span>
          <span className="radar-caption">
            CONCEPTUAL DIAGRAM · NOT A MEASUREMENT
          </span>
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
      <section className="home-section world-callout">
        <Reveal>
          <Eyebrow>04 / YOUR NEXT PERSPECTIVE</Eyebrow>
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
