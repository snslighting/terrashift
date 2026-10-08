# Validation

## Completed engineering checks

The Python environment was installed and the system was run against live NASA CMR and authenticated science downloads. Both main GUNW files passed NASA archive size and MD5 verification. The inspected real files exposed two HDF5 edge cases (named datatypes and complex non-finite fill values), now covered by regression tests.

The foundation tests cover: catalog filtering/count bounds, date/AOI validation, missing-login behavior, token/netrc strategy, redacted auth errors, project-local interactive persistence, actual-path discovery, HDF5 datatype/complex metadata serialization, HTML rejection, checksum/size/incomplete download rejection, cache reuse and corruption repair, collection/pair screening, output containment, native mask bits, coordinate transformations, nodata propagation and analytic 3D interpolation without extrapolation.

Fixtures are explicitly SYNTHETIC UNIT TEST DATA. They are not development/validation deformation cases. Unit success does not validate geophysical motion.

## Real-data audits

See FIRST_REAL_CASE.md. The earthquake candidate is a failed strict-QC case; San Joaquin is an unvalidated candidate. Numerical reports preserve all cumulative mask counts. The original audit retains corrections separately. The research-layer pipeline can apply the source-specific correction equation but labels its result unvalidated research phase. No displacement accuracy, false-positive rate or stable-ground zero result has been established.

## Required acceptance tests before frontend

1. Pin the complete correction convention for the observed product/processor version; reproduce a trusted implementation on a real subset and analytical injected signs/units.
2. Verify an independently stable reference region and quantify reference sensitivity.
3. Compare LOS estimates against independent, co-located GNSS displacements with the same epochs, reference and viewing geometry. Event magnitude/location alone is not ground truth.
4. Check held-out stable controls without tuning thresholds on them; quantify bias, residual spread, coverage and false positives with declared denominators.
5. Lock policies using designated development cases, then evaluate separate earthquakes, subsidence, vegetation, water, snow, mountains and high-latitude cases where available.
6. Validate region outlines/statistics, uncertainty calibration, time-series rank/closure/weights, geometry compatibility and insufficient-observation states.
7. Only after a scientifically defensible real result passes these checks: implement API/frontend, tiles, inspectors and presentation modes; test browser console/network/performance and end-to-end real cases.

All inspected candidates and the CCS1 comparison are development data and cannot later be silently relabeled as independent final evaluation. On 6 October, two unprocessed California pairs were reserved for temporal evaluation in `data/catalog/california-validation-reservation.json`, with a buffer pair separating them from development endpoints. The policy is not frozen and evaluation has not begun; a broader geographic/environmental validation split remains outstanding. See CORRECTION_DIAGNOSTICS.md.

Reference: [NISAR Science Team ATBD validation notebooks](https://github.com/nisar-solid/ATBD/tree/da066c64052c88696d74bfa53bb2e8bc64f6d6b9/methods).


## Added numerical checks

The current 41-test suite also covers physical phase-to-LOS signs, correction signs and nodata, robust reference medians, exclusion of disconnected components, GNSS integer-coordinate rollover, full covariance projection, missing daily solutions, bounded HTTP failures/retries, connected correlated-observation time-series inversion with closure errors, and correction-stage diagnostics on common finite support with locked components and cumulative medians. `scripts/check_tide_sign.py` separately checks the actual pinned production tide function, with synthetic physical inputs. It is not a tide-model or displacement-accuracy validation.

NGL station CCS1 has real IGS20 daily observations on 13 and 25 June 2026. Their difference is approximately -465 mm east, -9 mm north and +25 mm up. The source and full formal covariance are recorded in `data/catalog/CCS1-independent-comparison.json`. This is an independent benchmark, not a NISAR result. A comparison must match geometry, timing, spatial reference and uncertainty before any pass can be reported.

Sources: [NGL CCS1 station](https://geodesy.unr.edu/NGLStationPages/stations/CCS1.sta), [NGL data portal](https://geodesy.unr.edu/PlugNPlayPortal.php). Cite Blewitt, Hammond & Kreemer (2018), doi:10.1029/2018EO104623, and the original station operator when publishing derived comparisons.


Updated real-data outcome: `GNSS_COMPARISON.md` records the completed development comparison and why it does not pass independent validation. This supersedes earlier statements that no comparison had yet been attempted.
