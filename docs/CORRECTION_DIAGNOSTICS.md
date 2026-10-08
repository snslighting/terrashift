# California correction and spatial-support diagnostics

Recorded 6 October 2026. **Development only; the scientific production gate remains closed.**

The original 29 June–11 July comparison was reproduced byte-for-byte (SHA-256
`aff6c7b5e06a167f0960684d5b2eb23b932d9e4fa7e0f96951d0b3776db1287f`).
All 12 available comparisons, including Q143, remain in the report. Its RMSE is
28.3850766698 mm. A pre-run copy is in `work/california-comparison-before-continuation.json`.

## What was measured

`scripts/diagnose_california.py` computes cumulative raw, ionosphere, wet troposphere,
hydrostatic troposphere and solid-Earth-tide stages on identical finite support.
Each station and P287 reference use a separate median at each cumulative stage.
The reported increment is a difference of these cumulative medians: it is not
incorrectly approximated by summing separate layer medians. All stages use the
same unwrapping component as the original P287 reference. The final stage is
numerically checked against the saved corrected array and original residuals.

| Cumulative stage | All 12 comparison RMSE (mm) |
|---|---:|
| Raw native phase converted to LOS | 37.05 |
| Minus ionosphere | 41.79 |
| Minus wet troposphere | 28.75 |
| Minus hydrostatic troposphere | 28.05 |
| Plus solid-Earth tide | 28.39 |

These ablations do **not** authorize selecting the smallest RMSE, reversing a
sign, or omitting a physical correction. Raw phase and intermediate stages are
not ground-motion products. Aggregate error is strongly affected by Q143, so it
cannot establish which correction is accurate.

The wet-troposphere step changes relative candidates by +26.61 mm at P286,
+41.01 mm at P302 and +37.74 mm at CAFR. It also changes CAFP by +54.10 mm,
where the final comparison agrees much better. Tide increments at these sites
are much smaller: +0.81, +1.33, +2.64 and +1.49 mm respectively. Thus the
remaining discrepancies are not explained by simply identifying a large tide
contribution. Atmospheric-model accuracy, input provenance and interpolation
still require investigation; correction magnitude alone is not evidence of a bug.

The saved product run configuration identifies RAiDER, HRES, and
`line_of_sight_mapping`, with wet and hydrostatic outputs enabled. It names
`ECMWF_TROP_202606290000_202606290000_1.nc` and
`ECMWF_TROP_202607110000_202607110000_1.nc`. The acquisition time is about
02:56 UTC, but filenames alone cannot verify the weather files' internal valid
times or establish a timing error. The exact configuration excerpt and inventory
hash are retained in `data/catalog/california-correction-provenance.json`.

## Neighborhood and interpolation sensitivity

Using 1 km instead of 500 m radii, with the original GNSS projections held fixed
to isolate radar support effects, retains all 12 comparisons and gives RMSE
28.37 mm. The largest absolute station change is 3.14 mm (P286). This particular
radius change does not resolve the 20–54 mm discrepancies. It does not prove
that point GNSS and spatial radar averages have identical physical support.

At 250 m only eight comparisons retain 25 pixels in the reference component.
Q143, P286, P288 and P294 become unavailable. The 21.27 mm RMSE uses a changed
denominator and must not be advertised as an improvement over the 12-site result.

Every accepted 500 m pixel at P287 and all 12 compared stations is flagged as
interpolated ionosphere. Excluding flagged pixels from this existing sensitivity
mask leaves zero pixels at each of these stations. This is a controlled subset
experiment, **not** a rerun of strict QC with a recalculated coherence threshold.
It does not prove that all interpolated estimates are wrong, but the comparison
provides no noninterpolated station subgroup to validate their accuracy.

DEM medians and 5th–95th percentile terrain heights, coherence, phase spatial
MAD, ionospheric uncertainty components and sample counts are retained per site.
P287's radar neighborhood median ellipsoidal height is 594 m, versus 73 m at
CAFR and 33 m at CAFP. These differences motivate atmospheric/terrain checks;
they do not by themselves demonstrate a terrain-dependent error. Spatial MAD
is not standard error, and none of these quantities is total LOS uncertainty.

## New acquisition discovery and reservation

Official NASA CMR via earthaccess returned eight candidates for the same AOI,
track 42/frame 70, descending, with a bounded count of 200, on 6 October 2026.
The complete response is `data/catalog/california-repeat-acquisitions.json`.
Actual pair endpoints were read from granule identities, rather than assuming
that every overlap result starts after the query start or spans exactly 12 days.

| Pair dates (2026) | Assigned use |
|---|---|
| June 5–17 | Development candidate; starts before query start |
| June 29–July 11 | Existing development comparison |
| July 11–23 | Next development comparison |
| July 23–August 16 | Development candidate; 24-day pair |
| August 16–28 | Development candidate |
| August 28–September 9 | Buffer; do not tune on this pair |
| September 9–21 | Reserved temporal evaluation |
| September 21–October 3 | Reserved temporal evaluation |

`data/catalog/california-validation-reservation.json` records the exact IDs and
catalog hash before any reserved radar processing or reserved GNSS differencing.
The reservation separates development and evaluation acquisition endpoints.
The two reserved pairs share an endpoint with each other; their errors cannot
be treated as independent. Reusing geography/stations assesses temporal
generalization only. This is not a substitute for separate geographic,
earthquake, vegetation, mountain, snow and stable-control validation cases.

**The acceptance policy is not yet frozen or scientifically calibrated.** The
AOI-adaptive coherence threshold and interpolated-ionosphere uncertainty still
need development evidence. Before opening reserved evaluation, record code and
configuration hashes, reference selection, uncertainty model, missing-data rules,
denominators and acceptance criteria. If evaluation informs tuning, reclassify it
as development and acquire new evaluation data. A reservation is not a passed test.

## Reproduce

From the TerraShift directory:

```powershell
.\.venv\Scripts\python.exe scripts/diagnose_california.py
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\ruff.exe check src scripts tests
.\.venv\Scripts\ruff.exe format --check src scripts tests
```

Outputs: `data/processed/california-diagnostics/diagnostics.json` and
`correction-stages.png`. Source-array/report SHA-256 hashes are in the JSON.
The diagnostic does not overwrite original science arrays or comparison reports.
Three new synthetic tests cover common finite support, the tide-stage arithmetic,
locked component selection and the nonlinearity of medians. Numerical regression
tests cannot certify real displacement.

Official documentation rechecked 6 October 2026:
[collection names](https://nisar-docs.asf.alaska.edu/earthdata-search/),
[GUNW corrections supplied separately](https://nisar-docs.asf.alaska.edu/gunw/),
[provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/),
and [processor troposphere code](https://github.com/isce-framework/isce3/blob/v0.25.16/python/packages/nisar/workflows/troposphere.py).
