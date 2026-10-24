import { ArrowUpRight, Orbit, Globe2, ShieldCheck, Code2 } from "lucide-react";
import {
  PageIntro,
  Reveal,
  Eyebrow,
  Button,
  SourceLink,
} from "../components/UI";
export default function About() {
  return (
    <main className="content-page about-page">
      <PageIntro
        eyebrow="ABOUT TERRASHIFT / A PURPOSEFUL PERSPECTIVE"
        title="Make the changing Earth understandable."
        description="TerraShift brings radar observations, scientific context and independent evidence together—so more people can explore a planet in motion."
      />
      <section className="about-mission">
        <Reveal>
          <Eyebrow>OUR MISSION</Eyebrow>
          <h2>
            Curiosity, guided
            <br />
            by evidence.
          </h2>
        </Reveal>
        <div>
          <p>
            Surface change is easy to overlook and difficult to interpret.
            TerraShift is an independent NASA Space Apps project for the 2026{" "}
            <em>Dancing with the SARs</em> challenge: an interactive application
            using NASA–ISRO NISAR radar observations to explore surface changes
            around the world.
          </p>
          <p>
            TerraShift tracks three kinds of change at study areas on three
            continents: farm activity and surface disturbance in California's
            San Joaquin Valley, earthquake deformation on the Caracas coast and
            Flores Island, and ground motion with an independent GNSS check.
            Worldwide discovery finds NISAR products anywhere, and every result
            states how sure we are.
          </p>
          <SourceLink href="https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/">
            Official NASA Space Apps challenge
          </SourceLink>
        </div>
      </section>
      <div className="about-values">
        {[
          [
            Globe2,
            "Worldwide curiosity",
            "Search beyond a handful of predefined regions and discover actual intersecting products.",
          ],
          [
            ShieldCheck,
            "Scientific honesty",
            "Lead with what changed, and show the independent checks next to it, including those that fail.",
          ],
          [
            Orbit,
            "An accessible perspective",
            "Make maps, comparison tools and explanations understandable without hiding the science.",
          ],
        ].map(([Icon, title, text]) => (
          <Reveal className="about-value" key={String(title)}>
            {typeof Icon !== "string" && <Icon size={28} />}
            <h3>{String(title)}</h3>
            <p>{String(text)}</p>
          </Reveal>
        ))}
      </div>
      <section className="about-roadmap">
        <Eyebrow>BUILT, AND STILL BUILDING</Eyebrow>
        <h2>A clear path forward.</h2>
        <div className="roadmap-row">
          <span className="roadmap-state done">AVAILABLE</span>
          <div>
            <h3>Change maps from real NISAR data</h3>
            <p>
              Surface-change (coherence loss) maps for farming and earthquakes,
              activity change between periods, ground-motion maps with GNSS
              comparisons and error diagnostics, earthquake context from USGS,
              worldwide discovery, timelines, exports and provenance.
            </p>
          </div>
        </div>
        <div className="roadmap-row">
          <span className="roadmap-state available">BUILT / AWAITING DATA</span>
          <div>
            <h3>More pairs, floods, wetlands and wildfires</h3>
            <p>
              <code>scripts/acquire.py</code> downloads and processes the next
              California pairs (a three-month subsidence timeline), a Flores
              sensitivity run, and before/after NISAR GCOV backscatter for
              flood and fire areas. The site picks up each new study area
              automatically once processed.
            </p>
          </div>
        </div>
        <div className="roadmap-row">
          <span className="roadmap-state available">
            IMPLEMENTED / DEPLOYMENT REQUIRED
          </span>
          <div>
            <h3>Scientific API</h3>
            <p>
              Python FastAPI services for bounded discovery, product metadata,
              study areas, grid access, region jobs that survive restarts, and
              exports. The public site works without it.
            </p>
          </div>
        </div>
        <div className="roadmap-row">
          <span className="roadmap-state next">RESEARCH REQUIRED</span>
          <div>
            <h3>Make ground-motion maps trustworthy</h3>
            <p>
              Diagnostics show the California mismatch is mostly a common
              offset and a north–south tilt, pointing to the reference area and
              ionospheric error. Next: independent reference checks, a
              cross-validated long-wavelength correction, longer time spans and
              loop closure.
            </p>
          </div>
        </div>
      </section>
      <section className="about-stack">
        <Eyebrow>OPEN TECHNOLOGY</Eyebrow>
        <h2>Built to be inspected.</h2>
        <div className="stack-pills">
          {[
            "React",
            "TypeScript",
            "Vite",
            "MapLibre",
            "Three.js",
            "Motion",
            "FastAPI",
            "Python",
            "H5py",
            "Rasterio",
            "NumPy",
            "SciPy",
            "PyProj",
          ].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <p>
          Source code and deployment documentation are available in the project
          repository. Team-member names and affiliations have not been supplied;
          no institutional endorsement is implied.
        </p>
        <SourceLink href="https://github.com/snslighting/terrashift">
          Explore the source code
        </SourceLink>
      </section>
      <section className="about-cta">
        <h2>
          The next perspective
          <br />
          is yours.
        </h2>
        <Button to="/explore">Explore the Earth</Button>
      </section>
    </main>
  );
}
