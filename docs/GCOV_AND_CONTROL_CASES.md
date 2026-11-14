# Next processed cases: a GCOV wetland case and earthquake control pairs

Prepared on 14 November 2026. **Nothing on this page has been processed yet.** The scripts,
configuration and checks are in the repository; the steps that need an Earthdata login are for a
team member to run on their own machine. Do not commit any output that was not produced by
these commands from real downloaded files.

## Before you start (once)

1. Create a free NASA Earthdata account at <https://urs.earthdata.nasa.gov/> yourself.
2. In a terminal on your own machine, run `terrashift login` (or `uv run terrashift login`) and
   type your username and password there. TerraShift stores nothing; `earthaccess` writes your
   own `~/.netrc`. Never paste credentials into an issue, chat, commit or the website.
3. `uv sync --extra dev --extra api` in the repository.

Each command below starts with a `--check` run. It uses public metadata only (NASA CMR and the
USGS earthquake catalog): no login, no download. Only continue when it passes.

## 1. Pantanal wetland, GCOV backscatter in HH and HV (item 9)

Configuration: `config/cases/pantanal-gcov.json`

| | |
|---|---|
| Geometry | track 132, frame 169, ascending, full frame, product version 1.0.11 |
| Before | `NISAR_L2_PR_GCOV_024_132_A_169_2005_DHDH_A_20260705T094227_20260705T094302_P05023_N_F_J_001` (5 July 2026) |
| After | `NISAR_L2_PR_GCOV_033_132_A_169_2005_DHDH_A_20261021T094225_20261021T094259_P05023_N_F_J_001` (21 October 2026) |
| Area | west -57.8, south -17.8, east -57.2, north -17.0 (inside both footprints, checked) |
| Terms | HHHH and HVHV (frequency A) |
| Also listed | all 9 dates on this geometry, 5 July to 21 October 2026, for a later time series |

Hypothesis to test (textbook, not a result): early July to late October covers part of the
Pantanal dry season, so open water may shrink, and HH may brighten where water recedes under
vegetation.

```bash
uv run python scripts/acquire.py gcov --config config/cases/pantanal-gcov.json --check
```

```bash
uv run terrashift inspect PATH/TO/first-downloaded-GCOV.h5 --output data/catalog/gcov-inventory.json
```

```bash
uv run python scripts/acquire.py gcov --config config/cases/pantanal-gcov.json
```

The `inspect` step is there because the GCOV reader refuses file layouts it has not seen
(`src/terrashift/gcov.py`); confirm `/science/LSAR/GCOV/grids/frequencyA/HHHH` and `HVHV`,
`xCoordinates`, `yCoordinates` and `projection` exist. Each full GCOV file is large (hundreds of
megabytes or more); downloads are checksum-verified and cached under `data/cache`.

Expected output in `data/processed/gcov-pantanal-wetland/`:

- `gcov-subset.npz`: `x`, `y`, `before`, `after`, `delta_db` (first term, HH) and per term
  `before_HHHH`, `after_HHHH`, `delta_db_HHHH`, `before_HVHV`, `after_HVHV`, `delta_db_HVHV`
  (linear power, and change in dB = 10 log10(after / before)).
- `gcov-report.json`: status `BACKSCATTER_CHANGE_CANDIDATE_NOT_VALIDATED`, both granules with
  dates, track, frame and units, the EPSG code, `terms`, and the product mask description
  (recorded, not applied).

## 2. Control pairs for the earthquake cases (item 10)

Configuration: `config/cases/earthquake-controls.json`. A control pair is the 12-day pair just
before the event on the same track and frame, processed with exactly the same settings. It
shows how much the ground "changes" in radar when nothing happens (vegetation, moisture,
atmosphere), so the event pair can be judged against it.

| Case | Event pair | Control pair | USGS check (14 Nov 2026) |
|---|---|---|---|
| Caracas coast, `venezuela-2026` | 13 → 25 June 2026, track 162 / frame 7 | 1 → 13 June 2026, `NISAR_L2_PR_GUNW_021_162_A_007_022_4000_SH_20260601T100657_20260601T100731_20260613T100656_20260613T100731_P05023_N_F_J_001` | no M≥4 within 150 km (event window: 5) |
| Flores, `flores-2026` | 12 → 24 August 2026, track 168 / frame 173 | 7 → 19 July 2026, `NISAR_L2_PR_GUNW_024_168_A_173_025_4000_SH_20260707T214032_20260707T214106_20260719T214031_20260719T214105_P05023_N_F_J_001` | no M≥4 within 150 km (event window: 285) |

For Flores, the pair just before the event (19 July → 12 August) spans 24 days, not 12, so the
next 12-day pair back was chosen: coherence falls with time, so spans must match.

```bash
uv run python scripts/acquire.py control --case venezuela-2026 --check
```

```bash
uv run python scripts/acquire.py control --case venezuela-2026
```

```bash
uv run python scripts/acquire.py control --case flores-2026 --check
```

```bash
uv run python scripts/acquire.py control --case flores-2026
```

The run needs the DEM tiles the event pair used, in `data/cache/dem/`; the check lists the
names it expects (`DEM_N10_00_W068_00_C01.tif`, `DEM_N10_00_W067_00_C01.tif` for Venezuela,
`DEM_S09_00_E121_00_C01.tif` for Flores). The Venezuela names are derived from the naming rule,
not read from the original run: confirm they are the files used for
`data/processed/venezuela-research`. Ionosphere settings follow the event pairs: interpolated
ionosphere allowed for Venezuela (as in `venezuela-research`), strict for Flores (as in
`first-case-audit`); compare the `ionosphere_interpolation_policy` in both `quality-report.json`
files before publishing.

Expected output in `data/processed/control-<case>/`: `quality-report.json` and
`scientific-subset.npz` (from `prepare_layers.py`, same layers as the event pair) and
`control.json` (role, event granule, quiet-check settings and time).

## 3. Export and check

```bash
uv run python scripts/export_v3.py
```

```bash
uv run pytest -q
```

```bash
cd frontend && npm test && npm run build && node e2e/smoke.mjs
```

### New catalog.json fields

GCOV case (new entry in `cases`, written by `gcov_cases`):

- `id` `pantanal-wetland`, `name`, `region`, `bbox`, `change_types: ["flood"]`,
  `primary_layer: "backscatter_change"`, `status: "measured_provisional"`.
- `pairs[0]`: `before`, `after`, `granule` (after), `track`, `frame`, `orbit`, `coordinates`,
  `grid`, `source_hashes`, and `layers.backscatter_change` (HH, dB) plus
  `layers.backscatter_change_hv` (HV, dB), each with `file`, `counts`, `step`, `nodata`, `unit`,
  `native_statistics`.
- `findings`: the share of pixels that darkened or brightened by 3 dB or more, for HH and HV.
- `limits`: moisture, wind and crops also change backscatter; the product mask is not applied;
  ±3 dB marks candidates.
- Grids: `grids/pantanal-wetland-2026-07-05-backscatter.bin` and `-backscatter-hv.bin`, each
  with a `.count.bin`.

Control pair (new `control` field on each earthquake case, written by `control_block`):

- `id`, `role: "control"`, the same metadata block as the event pair (`granule`, `before`,
  `after`, `track`, `frame`, `orbit`, versions, `ionosphere_policy`, ...), `coordinates`, `grid`,
  `layers.disturbance` (1 − coherence, same measure as the event pair),
  `share_changed_percent`, `quiet_check` (`radius_km`, `min_magnitude`, `source`) and
  `source_hashes` (including `control.json`).
- `control` is `null` until the control pair has been processed.

The frontend already accepts these: `backscatter_change_hv` is a layer kind, and
`StudyCase.control` is typed. Showing the control is the next frontend step (below).

## How to show the control pair beside the event pair

- Side by side in Analysis and in the Earth Story for the case: **left "Quiet period (control)"**,
  **right "Across the earthquake"**, with the dates under each.
- One colour scale for both (disturbance 0 to 1), one legend, the same map extent; the swipe
  and side-by-side tools work as for two pairs of one area.
- A line under the pair: "Changed by more than half: X% in the quiet period, Y% across the
  earthquake." Use `share_changed_percent` and the event pair's finding.
- Wording: the control shows background change. Where the event map changes and the control
  does not, the change is more likely caused by the earthquake; that is a hypothesis, not proof.
  If the control changes as much as the event pair, say so plainly.
- Keep the status ladder: both are level 3 (processed by TerraShift); neither is checked
  against GNSS unless a comparison exists.
