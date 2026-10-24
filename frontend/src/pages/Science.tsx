import { useState } from "react";
import {
  Satellite,
  Radio,
  ArrowRight,
  Cloud,
  MapPin,
  Activity,
  CheckCircle2,
} from "lucide-react";
import {
  PageIntro,
  Reveal,
  Eyebrow,
  Button,
  SourceLink,
} from "../components/UI";
import { number } from "../lib/science";
export default function Science() {
  const [motion, setMotion] = useState(10),
    [noise, setNoise] = useState(0),
    [tab, setTab] = useState("phase");
  // Centre wavelength of the processed NISAR L-band GUNW products (c / centre frequency).
  const wavelength = 0.24196,
    phase = (-4 * Math.PI * (motion / 1000)) / wavelength;
  const topics = [
    ["radar", "01", "Radar"],
    ["phase", "02", "Phase"],
    ["coherence", "03", "Coherence"],
    ["validation", "04", "Validation"],
  ];
  const wave = (offset = 0) =>
    Array.from({ length: 201 }, (_, i) => {
      const x = (i / 200) * 600,
        y = 105 - Math.sin((i / 200) * Math.PI * 8 + offset) * 38;
      return `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(" ");
  return (
    <main className="content-page science-page">
      <PageIntro
        eyebrow="HOW IT WORKS / A FIELD GUIDE TO RADAR"
        title="A different kind of vision."
        description="A satellite sends a signal. The Earth sends a story back. Learn how scientists turn radar echoes into evidence—and why every step matters."
      />
      <div className="science-topics">
        {topics.map(([key, num, title]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            <span>{num}</span>
            {title}
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
      <section className="science-interactive">
        <div className="science-demo">
          <div className="section-caption">
            INTERACTIVE CONCEPT · NOT OBSERVED DATA
          </div>
          {tab === "phase" || tab === "coherence" ? (
            <>
              <svg
                viewBox="0 0 600 215"
                role="img"
                aria-label="Illustrative radar wave phase comparison"
              >
                <defs>
                  <linearGradient id="waveFade">
                    <stop stopColor="#55d9f3" />
                    <stop offset="1" stopColor="#8878ff" />
                  </linearGradient>
                </defs>
                <line x1="0" x2="600" y1="105" y2="105" stroke="#203248" />
                <path d={wave()} fill="none" stroke="#55d9f3" strokeWidth="2" />
                <path
                  d={wave(tab === "phase" ? phase : noise * Math.PI)}
                  fill="none"
                  stroke="#af99ff"
                  strokeWidth="2"
                  strokeDasharray="5 3"
                  opacity=".9"
                />
                <text x="15" y="22">
                  REFERENCE ECHO
                </text>
                <text x="15" y="198">
                  SECONDARY ECHO · ILLUSTRATIVE
                </text>
              </svg>
              {tab === "phase" ? (
                <>
                  <label className="science-slider">
                    Hypothetical toward-sensor LOS change
                    <strong>
                      {motion > 0 ? "+" : ""}
                      {motion} mm
                    </strong>
                    <input
                      aria-label="Hypothetical LOS change"
                      type="range"
                      min="-50"
                      max="50"
                      value={motion}
                      onChange={(e) => setMotion(+e.target.value)}
                    />
                  </label>
                  <div className="demo-equation">
                    Δφ = −4π Δd / λ<span>{number(phase, 3)} rad</span>
                  </div>
                </>
              ) : (
                <>
                  <label className="science-slider">
                    Illustrative phase mismatch
                    <strong>
                      {noise === 0
                        ? "Aligned"
                        : noise < 0.5
                          ? "Offset"
                          : "Strongly offset"}
                    </strong>
                    <input
                      aria-label="Illustrative echo mismatch"
                      type="range"
                      min="0"
                      max="1"
                      step=".02"
                      value={noise}
                      onChange={(e) => setNoise(+e.target.value)}
                    />
                  </label>
                  <p className="tiny">
                    A single sinusoid does not estimate statistical coherence.
                    This diagram illustrates phase correspondence only.
                  </p>
                </>
              )}
            </>
          ) : tab === "radar" ? (
            <div className="radar-demo">
              <Satellite size={54} />
              <i />
              <Radio size={72} />
              <div className="radar-demo-ground" />
              <span>Transmit → reflect → receive</span>
            </div>
          ) : (
            <div className="validation-demo">
              <Satellite />
              <span>RADAR ESTIMATE</span>
              <div className="compare-symbol">↔</div>
              <MapPin />
              <span>INDEPENDENT GNSS</span>
              <p>Same dates · compatible LOS · common reference</p>
            </div>
          )}
        </div>
        <div className="science-demo-copy">
          <Eyebrow>
            {tab === "radar"
              ? "01 / ACTIVE OBSERVATION"
              : tab === "phase"
                ? "02 / THE DISTANCE IN THE ECHO"
                : tab === "coherence"
                  ? "03 / DO THE ECHOES STILL AGREE?"
                  : "04 / TEST THE ESTIMATE"}
          </Eyebrow>
          <h2>
            {tab === "radar"
              ? "Send. Listen. Repeat."
              : tab === "phase"
                ? "Small distances. A shift in phase."
                : tab === "coherence"
                  ? "A measure of correspondence."
                  : "A second perspective from the ground."}
          </h2>
          <p>
            {tab === "radar"
              ? "Synthetic Aperture Radar sends microwave pulses and combines echoes collected along an orbit. Its active signal supports observations in darkness and through clouds. The radar response also depends on terrain, surface moisture and geometry."
              : tab === "phase"
                ? "Phase describes where a radar wave is in its cycle. Comparing unwrapped phase from repeat observations can yield a line-of-sight displacement candidate—after correcting other contributions and choosing a reference."
                : tab === "coherence"
                  ? "Coherence measures how consistently radar echoes correspond within a local estimation window. Surface changes, viewing geometry, noise and processing can lower it. High coherence alone cannot establish an accurate displacement."
                  : "GNSS measures changes in east, north and up position. Scientists project these components along the radar’s local line of sight, align dates and references, then inspect residuals. Disagreement must remain visible."}
          </p>
          {tab === "phase" && (
            <p className="tiny">
              λ = {number(wavelength, 4)} m from the cached product. The example
              uses the reviewed chronological native NISAR sign convention.
              Wrapped phase has cycle ambiguity and cannot be converted directly
              into reliable displacement.
            </p>
          )}
          {tab === "coherence" && (
            <div className="coherence-key">
              <div />
              <span>0 · poor correspondence</span>
              <span>1 · strong correspondence</span>
            </div>
          )}
        </div>
      </section>
      <section className="science-steps">
        <Reveal>
          <Eyebrow>FROM PRODUCT TO EVIDENCE</Eyebrow>
          <h2>
            There’s more in the phase
            <br />
            than ground movement.
          </h2>
        </Reveal>
        <div className="science-step-grid">
          {[
            [
              Satellite,
              "Observe",
              "A GUNW product contains geocoded unwrapped phase, coherence, connected components and correction layers.",
            ],
            [
              CheckCircle2,
              "Check support",
              "Verify schema and units. Apply finite-data, quality-bit, coherence and spatial-support policies. Keep disconnected phase components separate.",
            ],
            [
              Cloud,
              "Correct carefully",
              "Review ionosphere, wet and hydrostatic troposphere, and solid-Earth tide terms for the exact processor version. Corrections are not removed by default.",
            ],
            [
              MapPin,
              "Reference the estimate",
              "Use one supported connected component and a prescribed spatial reference. A low phase spread does not prove that a reference is stable.",
            ],
            [
              Activity,
              "Compare independently",
              "Project actual daily GNSS solutions into LOS and use common acquisition dates and spatial references. Preserve failed validation.",
            ],
            [
              Radio,
              "Explain the result",
              "Report units, dates, provenance and remaining uncertainty. A candidate is provisional until the relevant validation standard is met.",
            ],
          ].map(([Icon, title, text], i) => (
            <Reveal
              key={String(title)}
              className="science-step"
              delay={(i % 3) * 0.08}
            >
              {typeof Icon !== "string" && <Icon size={24} />}
              <span>0{i + 1}</span>
              <h3>{String(title)}</h3>
              <p>{String(text)}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="science-caution">
        <h2>
          Line of sight is a direction.
          <br />
          It isn’t a vertical measurement.
        </h2>
        <p>
          Radar sees the component of a change along the path between the
          surface and sensor. Converting it to vertical movement requires
          additional assumptions or observations. TerraShift reports the
          reviewed toward-positive LOS convention and keeps the geometric
          reference visible.
        </p>
        <div className="science-caution-grid">
          <div>
            <h3>Unknown uncertainty stays unknown.</h3>
            <p>
              Formal GNSS error and an ionospheric uncertainty layer describe
              particular components. Atmospheric residuals, unwrapping, orbit
              and reference errors can remain. They are not silently replaced
              with a confidence percentage.
            </p>
          </div>
          <div>
            <h3>A signal change needs context.</h3>
            <p>
              Coherence loss does not identify a flood or earthquake by itself.
              Backscatter, offsets and interferometric phase require different
              methods and supporting evidence for physical interpretation.
            </p>
          </div>
        </div>
        <Button to="/analysis">Inspect a real comparison</Button>
      </section>
      <section className="science-sources">
        <SourceLink href="https://nisar-docs.asf.alaska.edu/gunw/">
          Official GUNW product guide
        </SourceLink>
        <SourceLink href="https://nisar.jpl.nasa.gov/mission/">
          NASA–ISRO NISAR mission
        </SourceLink>
        <SourceLink href="https://geodesy.unr.edu/PlugNPlayPortal.php">
          Nevada Geodetic Laboratory
        </SourceLink>
      </section>
    </main>
  );
}
