import {
  Database,
  ShieldCheck,
  FileJson,
  Code2,
  ArrowRight,
  Download,
  Globe2,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  PageIntro,
  Reveal,
  Eyebrow,
  SourceLink,
  Skeleton,
  StatusBadge,
} from "../components/UI";
import { useApp } from "../lib/context";
import { statuses, number, downloadJSON, longDate } from "../lib/science";
import type { Status } from "../lib/types";
import { backendConfigured } from "../lib/api";
export default function Data() {
  const { catalog } = useApp();
  const pairs = (catalog?.cases ?? []).flatMap((c) =>
    c.pairs.map((p) => ({ study: c, pair: p })),
  );
  return (
    <main className="content-page data-page">
      <PageIntro
        eyebrow="DATA & METHODOLOGY / NOTHING HIDDEN"
        title="Evidence, all the way down."
        description="Know where the data came from, what happened to it, and which conclusions it can support. Scientific transparency is part of the product."
      />
      <div className="data-principles">
        {[
          [
            Database,
            "Actual observations",
            "NASA CMR metadata and real NASA/ASF NISAR files.",
          ],
          [
            ShieldCheck,
            "Independent checks",
            "Every GNSS comparison is shown, including the ones that fail.",
          ],
          [
            FileJson,
            "Traceable exports",
            "Identifiers, dates, references, units and source hashes travel with results.",
          ],
          [
            Code2,
            "Open methods",
            "Correction arithmetic, quality masks and GNSS comparison remain inspectable.",
          ],
        ].map(([Icon, title, text]) => (
          <Reveal className="data-principle" key={String(title)}>
            {typeof Icon !== "string" && <Icon size={23} />}
            <h3>{String(title)}</h3>
            <p>{String(text)}</p>
          </Reveal>
        ))}
      </div>
      <section className="data-section">
        <Eyebrow>01 / FROM THE SOURCE</Eyebrow>
        <h2>
          Public metadata.
          <br />
          Scientific products.
        </h2>
        <div className="data-source-grid">
          <article>
            <span>NASA / ASF</span>
            <h3>NISAR GUNW</h3>
            <p>
              Geocoded unwrapped interferograms: unwrapped phase, coherence,
              connected components, ionosphere and correction lookup tables.
              They give surface change (coherence) and ground motion (phase).
              The backscatter pipeline reads NISAR GCOV products for floods,
              wetlands and fire scars.
            </p>
            <code>NISAR_L2_GUNW_PROVISIONAL_V1 · NISAR_L2_GCOV_PROVISIONAL_V1</code>
            <SourceLink href="https://nisar-docs.asf.alaska.edu/gunw/">
              Official product guide
            </SourceLink>
            <SourceLink href="https://doi.org/10.5067/NIL2GUNW-P1">
              Collection DOI
            </SourceLink>
            <SourceLink href="https://search.asf.alaska.edu/#/?dataset=NISAR">
              ASF data search
            </SourceLink>
          </article>
          <article>
            <span>NEVADA GEODETIC LABORATORY</span>
            <h3>Independent GNSS</h3>
            <p>
              Actual IGS20 daily tenv3 positions and formal covariance. Exact
              acquisition days are compared without gap filling. Local look
              geometry projects east, north and up changes into toward-positive
              LOS.
            </p>
            <code>IGS20 / tenv3 / exact daily endpoints</code>
            <SourceLink href="https://geodesy.unr.edu/PlugNPlayPortal.php">
              Station portal and data
            </SourceLink>
            <p className="tiny">
              Formal covariance assumes independent endpoints and stations;
              unmodeled common errors remain.
            </p>
          </article>
        </div>
      </section>
      <section className="data-section">
        <div className="section-heading">
          <div>
            <Eyebrow>02 / PRODUCTS YOU CAN TRACE</Eyebrow>
            <h2>Every product. Every detail.</h2>
          </div>
          {catalog && (
            <button
              className="text-button"
              onClick={() =>
                downloadJSON(
                  "terrashift-provenance.json",
                  pairs.map(({ study, pair }) => ({
                    study: study.id,
                    granule: pair.granule,
                    before: pair.before,
                    after: pair.after,
                    product_version: pair.product_version,
                    processor_version: pair.processor_version,
                    correction_equation: pair.correction_equation,
                    ionosphere_policy: pair.ionosphere_policy,
                    source_hashes: pair.source_hashes,
                    validation: pair.comparison?.validation ?? "NO_INDEPENDENT_COMPARISON",
                  })),
                )
              }
            >
              <Download size={15} />
              Export provenance
            </button>
          )}
        </div>
        {!catalog ? (
          <Skeleton />
        ) : (
          pairs.map(({ study, pair: p }) => (
            <article className="provenance-card" key={p.id}>
              <div className="provenance-heading">
                <span>{study.name.toUpperCase()}</span>
                <h3>
                  {longDate(p.before)} → {longDate(p.after)}
                </h3>
                <StatusBadge status={study.status} />
              </div>
              <code className="granule-id">{p.granule}</code>
              <div className="provenance-grid">
                <div>
                  <span>SCHEMA / PROCESSOR</span>
                  <strong>
                    {p.schema ?? "—"} / {p.processor_version ?? "—"}
                  </strong>
                </div>
                <div>
                  <span>TRACK / FRAME / ORBIT</span>
                  <strong>
                    {p.track} / {p.frame} / {p.orbit}
                  </strong>
                </div>
                <div>
                  <span>ACCEPTED PIXELS</span>
                  <strong>{p.accepted_pixels?.toLocaleString() ?? "—"}</strong>
                </div>
                <div>
                  <span>COHERENCE THRESHOLD</span>
                  <strong>{number(p.coherence_threshold ?? null, 3)}</strong>
                </div>
                <div>
                  <span>LAYERS</span>
                  <strong>{Object.keys(p.layers).join(" · ").replaceAll("_", " ")}</strong>
                </div>
                <div>
                  <span>GNSS CHECK</span>
                  <strong>
                    {p.comparison
                      ? `${p.comparison.count} stations · ${number(p.comparison.rmse_mm, 1)} mm · ${p.comparison.validation.toLowerCase()}`
                      : "Not available"}
                  </strong>
                </div>
              </div>
              <SourceLink
                href={`https://cmr.earthdata.nasa.gov/search/granules.umm_json?granule_ur=${encodeURIComponent(p.granule)}`}
              >
                Original NASA CMR metadata
              </SourceLink>
              <details>
                <summary>SHA-256 hashes of local scientific inputs</summary>
                <div className="hash-list">
                  {Object.entries(p.source_hashes ?? {}).map(([name, hash]) => (
                    <div key={name}>
                      <span>{name}</span>
                      <code>{hash}</code>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))
        )}
      </section>
      <section className="data-section methodology">
        <Eyebrow>03 / REPRODUCIBLE PROCESSING</Eyebrow>
        <h2>Every step has a reason.</h2>
        <ol>
          <li>
            <span>01</span>
            <div>
              <h3>Inspect the actual product.</h3>
              <p>
                Verify the NASA size and checksum, local SHA-256, HDF5
                structure, metadata, units, topographic flattening, product
                schema 1.5.0 and processor 0.25.16. Unsupported versions are
                rejected by the reviewed correction routine.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>Apply explicit quality policies.</h3>
              <p>
                The actual 32-bit schema is decoded for water, valid subswaths,
                anomaly and reserved flags. Finite phase/coherence/correction
                layers, positive connected components and coherent patches of at
                least 25 native pixels are required. The development threshold
                is max(0.35, accepted-coherence first quartile); it is not a
                calibrated confidence cutoff. Surface-change maps use every
                unwrapped land pixel instead, because low coherence is the
                signal they measure.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>Apply source-reviewed corrections.</h3>
              <p>
                Interpolate correction cubes at official ellipsoidal DEM
                heights, without extrapolating. The reviewed native equation is:
              </p>
              <code>
                native phase − ionosphere − wet − hydrostatic + solid-Earth tide
              </code>
              <p>
                California display layers use the explicitly labeled
                interpolation-sensitivity policy. Strict audits remain separate;
                pixel counts from different masks are not interchangeable.
              </p>
            </div>
          </li>
          <li>
            <span>04</span>
            <div>
              <h3>Reference and convert ground motion.</h3>
              <p>
                California uses GNSS station P287's 500 m median; Venezuela uses
                the first predeclared southern reference area with enough
                support. Only the reference's unwrapping component is kept.
                Corrected phase is converted with the product's centre
                frequency.
              </p>
              <code>Δd toward [mm] = −λ Δφ / (4π) × 1000</code>
              <p>
                No wrapped-phase conversion, vertical-motion conversion or
                automatic annual trend is performed. The reference is not
                certified stable.
              </p>
            </div>
          </li>
          <li>
            <span>05</span>
            <div>
              <h3>Test against independent GNSS.</h3>
              <p>
                Compare exact daily endpoints, project local ENU into sensor LOS
                and subtract the reference station's change. Keep every
                available station. Leave-one-out diagnostics show how much of
                the misfit is a common offset or a tilt; they are reported, never
                applied to the maps.
              </p>
            </div>
          </li>
          <li>
            <span>06</span>
            <div>
              <h3>Export compact grids with provenance.</h3>
              <p>
                Aggregate accepted native pixels into 256 × 256 Web Mercator
                cells, keep exact counts and store them as 16-bit binary grids
                (about 1 MB for all study areas). Activity change is computed on
                identical native pixels measured in both periods before
                aggregation. Native statistics are labelled separately.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section className="data-section">
        <Eyebrow>04 / WHAT EACH STATUS MEANS</Eyebrow>
        <h2>Understand the limits.</h2>
        <div className="status-definitions">
          {(Object.keys(statuses) as Status[]).map((key) => (
            <div key={key}>
              <StatusBadge status={key} />
              <p>{statuses[key].explanation}</p>
            </div>
          ))}
        </div>
        <div className="warning">
          No TerraShift result is currently “Measured · validated.” No
          confidence percentages or total-uncertainty values are invented.
        </div>
      </section>
      <section className="data-section architecture">
        <Eyebrow>05 / HOW THE SYSTEM FITS TOGETHER</Eyebrow>
        <h2>
          Explore anywhere.
          <br />
          Process with care.
        </h2>
        <div className="architecture-diagram">
          <div>
            <GlobeIcon />
            React / TypeScript<span>Maps · evidence · comparison</span>
          </div>
          <b>↔</b>
          <div>
            <Database size={23} />
            Public data services<span>NASA CMR · Photon / OSM</span>
          </div>
          <b>↔</b>
          <div>
            <Code2 size={23} />
            Python scientific API<span>Cached analysis · secure pipeline</span>
          </div>
        </div>
        <p>
          The GitHub Pages frontend queries public catalog metadata and the
          geocoder directly, and serves processed research evidence from this
          repository. A configurable FastAPI service adds bounded, cached
          discovery, metadata, raster access, region-analysis jobs and JSON
          exports.
        </p>
        <div className="service-state">
          <span className="live-dot" />
          {backendConfigured
            ? "Backend API URL configured."
            : "Hosted processing backend not configured."}
          <small>
            Global raw-product processing remains unavailable in this
            deployment. The Python worker supports actual cached-region analysis
            when deployed.
          </small>
        </div>
        <p>
          Earthdata science-file access may require authentication. Credentials
          belong only in the backend's ignored environment or protected
          credential store. No credentials are collected or embedded in this
          frontend. Basemaps and geocoding are geographic context, not
          scientific observations.
        </p>
        <Link to="/about" className="text-button">
          Project architecture and roadmap
          <ArrowRight size={15} />
        </Link>
      </section>
      <section className="data-section acknowledgments">
        <Eyebrow>OPEN-SOURCE ACKNOWLEDGMENTS</Eyebrow>
        <p>
          React · TypeScript · Vite · MapLibre GL JS · Three.js · Motion ·
          Lucide · FastAPI · NumPy · SciPy · Rasterio · H5py · PyProj ·
          Earthaccess. Natural Earth provides public-domain globe geography.
          Basemap imagery and terrain: Esri and credited contributors.
          Dark geographic basemap: CARTO, with OpenStreetMap contributors data;
          Photon provides the public geocoder. Earthquake context: USGS. Fonts: Google Fonts (Space
          Grotesk and DM Sans).
        </p>
        <SourceLink href="https://www.naturalearthdata.com/about/terms-of-use/">
          Natural Earth terms
        </SourceLink>
        <SourceLink href="https://www.openstreetmap.org/copyright">
          OpenStreetMap attribution
        </SourceLink>
        <SourceLink href="https://github.com/snslighting/terrashift">
          Source repository and bundled licenses
        </SourceLink>
      </section>
    </main>
  );
}
function GlobeIcon() {
  return <Globe2 size={23} />;
}
