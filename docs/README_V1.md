# TerraShift

**See the Earth move.** Science-first NASA NISAR project.

## Current status — 8 October 2026

This is a working data-access and scientific-inspection foundation, **not a finished displacement application**.
Earthdata authentication and real downloads work. Four production GUNW files were downloaded, checked against NASA size/MD5 metadata, inspected and subset numerically. The first scientific milestone is **not passed**. A static interactive research website is now available in `website/`; GitHub Pages deployment is configured at https://snslighting.github.io/terrashift/. It shows coherence and explicitly unvalidated GNSS comparisons.

- Flores earthquake candidate: no spatially supported pixels survived the deliberately strict development quality policy.
- San Joaquin Valley candidate: 925 pixels survived; median supplied ionospheric uncertainty corresponds to approximately 21 mm before other errors. This does not establish a subsidence rate or validate tiny displacement.
- Real-file mask schema is 1.5.0. Do not replace its 32-bit encoding with the old specification's byte-mask assumptions.
- Source-specific phase correction, LOS conversion, robust regional referencing, independent GNSS projection and covariance-aware time-series arithmetic are implemented and unit-tested. Real displacement certification, reference stability, total uncertainty, region detection and API remain outstanding.

All code and data belong to this TerraShift directory. Ember Atlas is untouched.

## Run (PowerShell, from this directory)

```powershell
.\.venv\Scripts\terrashift.exe doctor
.\.venv\Scripts\terrashift.exe search --bbox -120.8 35.6 -119 37.2 --start 2026-06-17 --end 2026-10-05 --count 5
.\.venv\Scripts\terrashift.exe download EXACT_GRANULE_ID
.\.venv\Scripts\python.exe scripts/inspect_gunw.py PATH_TO_REAL_GUNW.h5 --output data/catalog/inspection.json
.\.venv\Scripts\python.exe scripts/audit_first_case.py
.\.venv\Scripts\python.exe -m pytest -q --basetemp work/test-tmp
.\.venv\Scripts\ruff.exe check src scripts tests
```

The local environment is installed. To recreate it with uv: `uv sync --extra dev` (uses uv.lock). Put uv's cache under `work/uv-cache` if your global cache is unavailable. Python 3.12 is the tested interpreter.

## Authentication

An ignored `.netrc` is configured locally and restricted to the current Windows account. No secret is in source, catalog metadata, or frontend code. For another machine, copy `.env.example` to `.env` and configure **one** method: NETRC, environment username/password, or EARTHDATA_TOKEN. Alternatively run `terrashift login` interactively in your own terminal. Credentials must never be committed or placed in chat. `doctor` checks configuration only; it does not claim that a configured token is valid.

## Project contents

- `src/terrashift`: authentication, bounded official CMR search, cache, metadata screening, generic HDF5 inspection, real-schema AOI quality audit and 3D cube interpolation.
- `scripts`: reproducible first-case inspection and quality audit.
- `data/catalog`: real public catalog responses and complete actual-file inventories.
- `data/cache`: ignored raw scientific files and download manifests.
- `data/processed`: ignored real-array subsets and quality reports/plots. These are **not displacement products**.
- `tests`: explicitly synthetic unit fixtures only; never served as real NASA data.
- `docs`: sources, verified findings, unresolved science and next acceptance gates.

Read `docs/FIRST_REAL_CASE.md` and `docs/VALIDATION.md` before interpreting outputs. Successful unit tests are not a validation of ground displacement.


The CLI downloader uses bounded HTTPS ranges through an earthaccess-authenticated session, with timeouts/retries and final NASA checksum verification. This avoids indefinite stalled full-response reads observed with the installed earthaccess downloader. Interrupted whole downloads are not yet resumed across process restarts.

For corrected **research phase only**, use `scripts/prepare_layers.py FILE.h5 --bbox W S E N --dem OFFICIAL_ELLIPSOIDAL_DEM.tif --output data/processed/NAME`. No ground-motion or total-uncertainty claim follows from this output.


The reference-matched California development comparison now includes 12 available station comparisons: all-result RMSE is approximately 28 mm, with substantial unresolved discrepancies. Venezuela lacks co-located usable radar data at CCS1. See `docs/GNSS_COMPARISON.md`. **The science milestone remains unpassed; the website is a research preview, not a certified displacement application.**

The continuation reproduced the California report byte-for-byte and added correction-stage and neighborhood diagnostics. All compared station pixels use interpolated ionosphere; expanding neighborhoods does not resolve the discrepancies. Eight repeat-pair candidates were found through official CMR, and two September/October pairs were reserved for later temporal evaluation before processing. The acceptance policy remains uncalibrated. See `docs/CORRECTION_DIAGNOSTICS.md`. The expanded synthetic suite has 41 passing tests.

The fourth real GUNW (California July 11–23) is downloaded, checksum-verified and processed. Its 13-site GNSS comparison has 51.06 mm RMSE. Intersecting radar support across both California pairs changes candidates by less than 0.30 mm; a 107.25 mm reference-cancelling station discrepancy remains. See `docs/REPEAT_PAIR_FINDINGS.md`. The frontend gate remains closed.

## Research website

Serve locally with `node scripts/serve-website.cjs` and open http://127.0.0.1:4174/. Publish only the contents of `website/` to GitHub Pages; never upload this project root, credentials or raw caches. See `website/README.md` for sources and limitations.

Website repository: https://github.com/snslighting/terrashift (main branch, root). Initial website commit: 942c7a5c0f9bd38d169ddf966e22b20cefd5d306.
