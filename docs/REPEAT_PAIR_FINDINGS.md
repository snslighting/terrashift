# Second California development pair

Recorded 6 October 2026. **Validation fails; production gate remains closed.**
This result preserves the negative evidence. No phase sign, physical correction,
station exclusion, reference, or threshold was selected to improve agreement.

## Real data and fixed method

The July 11–23 GUNW completed download, NASA MD5 validation, HDF5 validation and
local SHA-256 hashing. Exact granule:

`NISAR_L2_PR_GUNW_025_042_D_070_026_4000_SH_20260711T025641_20260711T025715_20260723T025640_20260723T025715_P05023_N_F_J_001`

- Bytes: 2,323,644,416.
- NASA MD5: `4b9fa4c6ec4514fec7cf2977d95facfe`.
- Local SHA-256: `6c315b6c672df4801e2c8121e2d80c78dfd386ea482e26ea3d36f038d8b2effc`.
- Cache directory: `data/cache/3ed044826316b503ac004e59e1bae21d7593812a733b50301afb37e573f8a606`.
- Actual inventory: `data/catalog/california-july-repeat-inventory.json`.
- Track/frame/orbit: 42/70/descending; schema 1.5.0; processor 0.25.16.
- AOI: [-120.99, 36.005, -119.7, 36.99], matching the first expanded pair.
- Same cached official ellipsoidal DEM tiles, correction equation, P287 reference,
  500 m neighborhoods, 25-pixel support minimum and development QC algorithm.

The unchanged adaptive coherence algorithm gives a threshold of 0.477796 for
this pair, versus 0.499806 for the first pair. The algorithm is unchanged, but
its data-dependent threshold is not a fixed calibrated acceptance boundary.
The interpolation sensitivity run retains 1,357,460 corrected pixels. A separate
strict audit retains 1,199 pixels before correction interpolation. These are
different quality policies and neither count certifies displacement accuracy.

P287 has 126 accepted radar pixels, coherence 0.873 and phase spatial MAD
0.0636 rad. Its GNSS LOS change is approximately -0.001 mm, with 3.076 mm
formal sigma. Its GNSS endpoint diagnostic flags no large isolated daily change.
These quality indicators do not certify its radar reference against spatially
correlated atmosphere, ionosphere or unwrapping error.

## All second-pair comparisons

Values below are toward-positive LOS millimeters relative to P287. GNSS uses
the actual look geometry at each station; its measured reference change is
subtracted. Radar values remain unvalidated candidates.

| Station | Radar candidate | GNSS | Residual |
|---|---:|---:|---:|
| CAFP | 13.72 | -10.57 | 24.29 |
| Q143 | 37.00 | -10.52 | 47.53 |
| Q164 | 62.91 | -7.17 | 70.08 |
| P285 | 39.59 | -1.90 | 41.49 |
| P286 | 55.62 | -3.31 | 58.93 |
| P288 | 45.22 | 2.13 | 43.09 |
| P289 | 45.65 | -3.10 | 48.75 |
| P290 | 48.39 | -0.10 | 48.49 |
| P294 | 72.99 | -2.53 | 75.52 |
| P298 | 84.37 | -2.40 | 86.76 |
| P302 | -25.24 | -4.60 | -20.63 |
| P307 | 20.22 | -5.90 | 26.12 |
| CAFR | 0.32 | -3.73 | 4.05 |

All 13 comparisons are retained: RMSE **51.061 mm**, mean residual **42.652 mm**.
P300 has only 19 accepted pixels; P293 and P304 lack an exact acquisition-day
GNSS solution. Q164, unavailable in the first pair, is now available. Therefore
the 13-site RMSE cannot be directly attributed to epoch change relative to the
first pair's 12-site RMSE without checking a common station set.

Q143's large isolated June 29 GNSS change is outside this pair. Its July 11 and
23 GNSS endpoints do not trigger the existing isolated-change diagnostic, yet
the second-pair residual remains 47.53 mm. The first pair's Q143 issue does not
explain the new result. This diagnostic is not proof of error-free GNSS.

## Correction and neighborhood diagnostics

| Cumulative stage | RMSE, all 13 sites (mm) |
|---|---:|
| Raw | 87.10 |
| Minus ionosphere | 43.75 |
| Minus wet troposphere | 48.38 |
| Minus hydrostatic troposphere | 50.62 |
| Plus solid-Earth tide | 51.06 |

The raw error is already large. The ionosphere correction reduces aggregate
error for this pair, while the subsequent corrections increase it. These
observations do not justify removing corrections: they do not separate the
model errors from other phase errors. The first pair's stage pattern differs.

One-kilometer neighborhoods retain 13 comparisons and give RMSE 51.12 mm;
250 m neighborhoods retain only eight comparisons and give 44.37 mm. The latter
uses a changed denominator and is not a demonstrated improvement.

All accepted pixels at P287 and the original 12 comparison stations carry the
interpolated-ionosphere flag. At Q164, 50 of 54 carry it. Removing flagged pixels
from the sensitivity mask leaves no reference pixels and no valid comparison.
This postfilter experiment is distinct from the independently run strict audit.

## Identical-pixel and reference-cancelling checks

`scripts/compare_repeat_support.py` verifies that both AOIs have identical CRS
and exact x/y coordinates before intersecting masks. Component IDs are interpreted
within each product, rather than assumed to correspond across products. It uses
each product's P287 component, intersects accepted finite pixels, and fixes station
centers to the first pair. Each station and reference needs 25 common pixels.
Original GNSS projections are kept to isolate radar-support effects.

The same 12 comparison stations remain available on common support:

| Pair | RMSE (mm) | Mean residual (mm) | Maximum change from original radar estimate (mm) |
|---|---:|---:|---:|
| June 29–July 11 | 28.371 | 7.110 | 0.206 |
| July 11–23 | 49.142 | 40.368 | 0.291 |

Changing radar samples therefore does not explain the discrepancies for these
stations. Q164 is absent from this intersection because the first pair has no
comparison; its second-pair failure is still retained in the full 13-site report.

For any two stations, subtracting their residuals cancels a shared reference
offset. All 66 station differences per pair are recorded; they are correlated,
not 66 independent validation trials. On the second pair, the P298-minus-P302
residual difference is **107.248 mm**. Thus even a different common reference
offset cannot make all station comparisons agree. P298 and P302 have no large
isolated GNSS endpoint change under the existing diagnostic. Spatially varying
phase/correction errors and remaining processing-convention checks are still
unresolved. This result does not uniquely identify atmosphere, ionosphere or
unwrapping as the cause, and no fitted mean or ramp has been removed.

Two sequential pairs share July 11. They provide no independent loop-closure
test and do not justify annual velocity, temporal uncertainty calibration, or
a validated displacement time series. The reserved September/October pairs
remain unprocessed; evaluation is not opened to compensate for these failures.

## Outputs and reproduction

- `data/processed/california-july-repeat`: corrected research arrays and full GNSS comparison.
- `data/processed/california-july-repeat-strict`: strict QC audit.
- `data/processed/california-july-repeat-diagnostics`: cumulative stages and radius/interpolation experiments.
- `data/processed/california-repeat-support`: hashed input provenance, identical-pixel results,
  all pairwise differences, and `repeat-residuals.png`.

```powershell
.\.venv\Scripts\python.exe scripts/compare_california.py --directory data/processed/california-july-repeat --expanded --reference P287
.\.venv\Scripts\python.exe scripts/diagnose_california.py --directory data/processed/california-july-repeat --output data/processed/california-july-repeat-diagnostics
.\.venv\Scripts\python.exe scripts/compare_repeat_support.py
```

Next science work must resolve correction/phase errors and establish a defensible
uncertainty model using development data, including an independently implemented
real-subset processing cross-check, before evaluating reserved data. More downloads
or smaller residuals at selected stations do not by themselves pass the milestone.
