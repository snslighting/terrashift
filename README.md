# TerraShift 2.0

**A new perspective on a changing planet.** A worldwide NISAR catalog explorer and transparent research workspace for NASA Space Apps 2026, **Dancing with the SARs**.

[Live website](https://snslighting.github.io/terrashift/) · [Repository](https://github.com/snslighting/terrashift) · [Official challenge](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/)

## Implemented

- Seven routes: cinematic interactive Earth, global explorer, analysis, Earth Stories, science, data/methodology, and about.
- Worldwide place/address/landmark search via Photon/OpenStreetMap, coordinates, three basemaps, rectangle/polygon AOIs and explicit dateline bounds.
- Actual NASA CMR acquisition discovery, date filters, genuine footprints, track/frame/orbit metadata, source links, bounded requests and honest no-data/error/processing states.
- Two processed California pairs with real coherence and referenced **provisional LOS candidates**, pixel/station inspection, exact support, animated acquisition progression, registered swipe/side-by-side comparison, common-native-support coherence difference and independent pair charts.
- All-result GNSS residuals, native statistics, provenance hashes, evidence JSON and station CSV exports. Failed validation stays visible.
- Scientifically documented California, Flores and Venezuela audits; interactive radar/phase/coherence education labeled conceptual.
- React/TypeScript/Vite, lazy routes/maps/globe, Three.js with actual Natural Earth geography, coordinated motion, responsive layouts, reduced-motion support and keyboard controls.
- Optional FastAPI catalog/geocoder proxy, product metadata, cached analysis/raster/export endpoints and a persistent SQLite queue with two workers for **cached** region statistics.

## Scientific status

**No result is certified ground displacement.** California maps are sensitivity research including interpolated ionosphere. P287 defines the spatial reference; its stability is unverified. Total displacement uncertainty is **unknown**.

| Actual pair | GNSS comparisons | All-result RMSE | Outcome |
|---|---:|---:|---|
| California, 29 June–11 July 2026 | 12 | 28.39 mm | Validation failed |
| California, 11–23 July 2026 | 13 | 51.06 mm | Validation failed |

Second-pair P298 has a +84.37 mm radar candidate versus −2.40 mm relative GNSS: an unresolved 86.76 mm residual. No station is removed to improve agreement. Common support changes candidates by less than 0.30 mm and does not resolve the discrepancy. Coherence difference uses **1,248,081 common accepted native pixels**, subtracting before display aggregation.

Flores has zero supported strict-policy pixels. Venezuela has 154 accepted pixels, no usable radar within 500 m of CCS1, and a nearest acceptable pixel approximately 15.7 km away. Neither is described as a validated change observation.

Coherence is dimensionless correspondence, **not displacement** or proof of a physical cause. LOS candidates are millimeters, toward the sensor positive; they are not automatically vertical movement. Two sequential pairs do not establish annual velocity, loop closure or a calibrated time series.

## Architecture and remaining work

```text
GitHub Pages: React / TypeScript
  → public NASA CMR + Photon, or optional HTTPS FastAPI
  → real reduced research exports with source provenance

Secure local Python pipeline
  → checksum-verified GUNW + GNSS → reviewed corrections/masks/reference
  → independent comparisons → explicit failed validation → public export
```

The frontend performs worldwide discovery directly, without a Python host. It never requests/stores Earthdata credentials. Protected downloads remain in the existing local/backend tools.

**Global scientific processing and remote API hosting are not deployed.** Uncached products show processing unavailable, with no fabricated result or fake queued job. Deploying the API adds public proxies and cached jobs; it does not provision a worldwide raw-product/DEM/correction worker. Such a worker needs authorized Earthdata access, compute, storage, appropriate DEM inputs, reviewed methods and independent validation. Certified stable referencing, total uncertainty, statistically supported regional detection and time-series inversion remain incomplete.

`frontend/` contains the application and actual public exports. `src/terrashift/` preserves the scientific pipeline and adds API/display aggregation. `scripts/export_v2.py` regenerates public data from ignored actual processed arrays. `tests/` contains synthetic fixtures never served as observations. `docs/` retains the audit trail. `website/` preserves version one; `website-v2/` is generated output.

## Install and run

Use Node.js 24 and Python 3.12. The browser-upload deployment includes the complete allowlisted **terrashift-source.zip** at the repository root. Extract it into a project directory. The archive excludes credentials, raw caches, environments and work files.

```powershell
cd frontend
npm ci
npm run dev
# http://127.0.0.1:4175/terrashift/
npm test
npm run build
```

The build creates `website-v2/` and an actual HTML entry point for each route, plus a 404 fallback. Change `frontend/vite.config.ts` if the project base differs from `/terrashift/`.

From the project root:

```powershell
uv sync --extra api --extra dev
.\.venv\Scripts\python.exe -m uvicorn terrashift.api:app --host 127.0.0.1 --port 8000
# API documentation: http://127.0.0.1:8000/docs
```

Copy `frontend/.env.example` to `frontend/.env.local`; set `VITE_API_URL=http://127.0.0.1:8000`, then restart Vite. Use an HTTPS API origin for production and rebuild. Leave it empty for independent public-direct Pages discovery.

Backend configuration: `TERRASHIFT_CORS_ORIGINS` (comma-separated origins) and `TERRASHIFT_JOB_DB` (persistent SQLite path). Default CORS permits the live Pages origin and `http://127.0.0.1:4175`. Public requests have timeouts, bounded five-minute caches, input limits and sanitized upstream failures. Cached jobs expose queued/running/completed/failed states.

## Deploy

Pages uses `.github/workflows/pages.yml` and **Settings → Pages → GitHub Actions**. Update the source archive and README to publish. The workflow extracts source, installs locked dependencies, runs checks, builds and deploys the Pages artifact. A failed build leaves the previous successful deployment intact. The workflow follows [GitHub's official custom-workflow model](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Old root website files remain in Git history; the new artifact does not use them.

The included Dockerfile copies an explicit source/evidence allowlist:

```powershell
docker build -t terrashift-api .
docker run --rm -p 8000:8000 -e TERRASHIFT_CORS_ORIGINS=https://snslighting.github.io -v terrashift-jobs:/app/work terrashift-api
```

Deploy the container to an existing Python/container account with HTTPS and persistent `/app/work` storage. GitHub Pages cannot execute Python. No remote container account has been provisioned.

## Reproduce and verify

```powershell
.\.venv\Scripts\terrashift.exe doctor
.\.venv\Scripts\terrashift.exe search --bbox -120.99 36.005 -119.7 36.99 --start 2026-06-01 --end 2026-08-01 --count 5
.\.venv\Scripts\terrashift.exe download EXACT_GRANULE_ID
.\.venv\Scripts\python.exe scripts/inspect_gunw.py PATH_TO_REAL_GUNW.h5 --output data/catalog/inspection.json
# Follow the documented actual DEM, quality and GNSS processing first:
.\.venv\Scripts\python.exe scripts/export_v2.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check src scripts tests
```

The ignored local `.netrc` is restricted to the current account. Other machines may use NETRC, environment credentials or a token through the CLI. Never commit secrets or indiscriminately upload the project root. NASA size/checksum verification is retained. Interrupted whole-file downloads are not resumed across restarts.

Native reference-times-conjugate-secondary phase uses `LOS_mm = −phase × wavelength / (4π) × 1000`. Corrections follow only reviewed processor 0.25.16/schema 1.5.0. Cube interpolation respects ellipsoidal heights without extrapolation; schema-specific 32-bit masks, finite phase, component/spatial support and adaptive coherence are applied. Referenced LOS is restricted to P287's component.

Public 256×256 grids bin actual accepted source-pixel centers into EPSG:3857 means and exact counts, without filling missing science. Native-pixel statistics are separate from display means. Display filters affect visibility, not acceptance/validation. LOS colors saturate at ±100 mm; numeric inspection preserves the value. GNSS formal sigma is not total radar uncertainty.

Read [first case](docs/FIRST_REAL_CASE.md), [validation](docs/VALIDATION.md), [GNSS comparison](docs/GNSS_COMPARISON.md), [correction diagnostics](docs/CORRECTION_DIAGNOSTICS.md) and [repeat pair](docs/REPEAT_PAIR_FINDINGS.md). Their earlier frontend gate records version-one development; version two publishes clearly unvalidated evidence. The scientific gate remains closed. The previous README is preserved in `docs/README_V1.md`.

## Demonstration

1. Rotate the Earth, then open Explorer.
2. Search Tashkent, select a result and discover real products for the date range. Inspect metadata and processing availability.
3. Open the California shortcut, change coherence/LOS and acquisition pairs, and inspect a station/pixel.
4. Open Analysis; try swipe, side-by-side, difference and temporal pair views. Read all residuals and failed validation.
5. Export evidence/CSV, inspect provenance and use the Science phase simulator. Search an empty time range to check no-data behavior.

## Sources and credits

[NASA NISAR](https://nisar.jpl.nasa.gov/) · [ASF GUNW](https://nisar-docs.asf.alaska.edu/gunw/) · [NASA CMR](https://cmr.earthdata.nasa.gov/search/) · [NGL GNSS](https://geodesy.unr.edu/) · [Photon](https://github.com/komoot/photon) · [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)

Esri satellite/topographic and OpenStreetMap geographic tiles are context imagery, not NISAR displacement. Map attribution stays visible. Natural Earth is public domain. Library notices accompany the build. This is an independent challenge project, not an official NASA/ISRO product or endorsement.
