# TerraShift

**See the Earth change.** An interactive application that uses real NASA–ISRO NISAR radar data to track and visualize surface change at locations around the world, built for the NASA Space Apps 2026 challenge **Dancing with the SARs**.

[Live website](https://snslighting.github.io/terrashift/) · [Official challenge](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/)

## What it shows

| Change type | Where | How NISAR measures it |
|---|---|---|
| Farming & land disturbance | San Joaquin Valley, California | Coherence loss between 12-day revisits, and how it changes from one period to the next |
| Earthquake deformation | Caracas coast, Venezuela (M7.2 + M7.5, 24 Jun 2026) · Flores, Indonesia (M7.8, 14 Aug 2026) | Line-of-sight ground motion from interferometric phase; coherence loss across the event |
| Land subsidence | San Joaquin Valley | Line-of-sight motion checked against 12–13 independent GNSS stations |
| Floods, wetlands, wildfire | Pipeline ready | NISAR GCOV backscatter change (dB); appears once real products are processed |

Every result leads with what changed and states how sure we are: product identifiers, dates, references, units, the independent GNSS check (including when it fails) and known limits.

Highlights from the real data:

- 25% of mapped San Joaquin farmland lost more than half its radar coherence in 12 days; between consecutive periods, activity rose on 13% of land and fell on 7%.
- Across the Venezuela earthquake, line-of-sight motion spans −349 to +26 mm (5th–95th percentile). GNSS station CCS1 in Caracas moved 466 mm.
- California ground-motion maps do **not** yet pass GNSS validation (28.4 and 51.1 mm RMS). Diagnostics show the misfit is mainly a common offset and a north–south tilt, implicating the reference area and ionosphere; see [known limitations](docs/KNOWN_LIMITATIONS.md).

## Features

- Seven pages: interactive 3D Earth, worldwide explorer, analysis workspace, Earth Stories, science explainer, data & methodology, about.
- Worldwide place search (Photon/OpenStreetMap) or coordinates, rectangle/polygon areas, dateline handling, live NASA CMR discovery with real footprints.
- Study-area maps with layer switching, point inspection (value plus the number of source pixels), GNSS and earthquake markers, timelines, swipe and side-by-side comparison, residual and error-structure charts.
- JSON and CSV evidence exports with source hashes; full provenance per product.
- Accessible: keyboard navigation, reduced motion, phone layouts with collapsible map panels.
- Optional FastAPI backend: proxied discovery and geocoding, study-area/grid endpoints, region jobs stored in SQLite that resume after a restart.

## Repository layout

```text
frontend/            React 19 + TypeScript + Vite + MapLibre + Three.js app
  public/evidence/   catalog.json + compact int16 grids (real processed data, ~1 MB)
  e2e/smoke.mjs      browser smoke test of the production build
src/terrashift/      Python pipeline: download, audit, corrections, change, GNSS, validation, GCOV, API
scripts/             processing (prepare_layers, compare_california, acquire, export_v3, diagnostics)
tests/               Python tests (synthetic fixtures + checks of the shipped evidence)
docs/                method, validation, diagnostics and data-acquisition records
```

## Run locally

Node.js 24 and Python 3.12.

```powershell
cd frontend
npm ci
npm run dev        # http://127.0.0.1:4175/terrashift/
npm test           # unit tests
npm run build      # type-check + build to ../website-v2
npm run e2e        # browser smoke test (needs: npm i --no-save playwright; npx playwright install chromium)
```

```powershell
uv sync --extra api --extra dev
uv run pytest -q
uv run ruff check src scripts tests
uv run uvicorn terrashift.api:app --port 8000     # optional API, docs at /docs
```

Set `VITE_API_URL` in `frontend/.env.local` to use the API; leave it empty for the public-direct mode used on GitHub Pages. Backend settings: `TERRASHIFT_CORS_ORIGINS`, `TERRASHIFT_JOB_DB`.

## Add real data

See [docs/ACQUIRE.md](docs/ACQUIRE.md): `scripts/acquire.py series` (more California pairs), `flores-sensitivity`, and `gcov` (flood/wildfire), then `scripts/export_v3.py`. Earthdata credentials stay in the ignored local `.netrc`; nothing secret is committed or sent to the browser.

## Deploy

Every push runs `.github/workflows/pages.yml`: Python tests and lint, frontend unit tests, type-check and build, and a headless-browser smoke test. Pushes to `main` that pass are deployed to GitHub Pages (Settings → Pages → GitHub Actions).

## Method in brief

Native phase uses `LOS_mm = −φ·λ/(4π)·1000`, toward the satellite positive. Corrections (ionosphere, wet and hydrostatic troposphere, solid-Earth tide) follow only the reviewed processor 0.25.16 / schema 1.5.0. Ground-motion pixels pass schema-specific masks, coherence and spatial-support checks; surface-change maps use every unwrapped land pixel, because low coherence is the signal. Display grids bin actual pixel centres into 256×256 Web Mercator cells with exact counts and no gap filling. Details: [algorithm](docs/ALGORITHM.md), [validation](docs/VALIDATION.md), [GNSS comparison](docs/GNSS_COMPARISON.md), [correction diagnostics](docs/CORRECTION_DIAGNOSTICS.md), [repeat pair](docs/REPEAT_PAIR_FINDINGS.md).

## Sources and credits

[NASA NISAR](https://nisar.jpl.nasa.gov/) · [ASF GUNW](https://nisar-docs.asf.alaska.edu/gunw/) · [NASA CMR](https://cmr.earthdata.nasa.gov/search/) · [NGL GNSS](https://geodesy.unr.edu/) · [USGS earthquakes](https://earthquake.usgs.gov/) · [Photon](https://github.com/komoot/photon) · [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)

Basemaps: Esri imagery and topography, CARTO dark basemap with OpenStreetMap data; they are context, not NISAR measurements. Library licences are in `frontend/public/licenses`. This is an independent challenge project, not an official NASA or ISRO product.
