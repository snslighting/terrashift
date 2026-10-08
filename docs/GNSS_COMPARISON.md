# Independent GNSS comparison — 6 October 2026

**Result: validation gate remains closed.** These are development observations, not a completed displacement validation.

The same real NISAR pair (29 June–11 July 2026, track 42/frame 70, descending) was compared against NGL IGS20 daily solutions. Each GNSS ENU change was projected using the actual NISAR look geometry. Both radar and GNSS results use the same P287 reference. Radar neighborhoods are 500 m in radius and remain within one phase connected component.

P287 was selected because it has 126 accepted pixels, median coherence about 0.87, low spatial phase dispersion (MAD about 0.039 radians), and a GNSS LOS change of about 4 mm with 3 mm formal uncertainty. The reference is not assumed to be exactly motionless. Its measured GNSS change is removed from each comparison.

| Station | Relative NISAR candidate (mm) | Relative GNSS (mm) | Difference (mm) |
|---|---:|---:|---:|
| CAFP | -5 | -7 | 2 |
| Q143 | -4 | 64 | -68 |
| P285 | 6 | 2 | 4 |
| P286 | 26 | -4 | 30 |
| P288 | 21 | -1 | 22 |
| P289 | 4 | 3 | 1 |
| P290 | 9 | -0 | 9 |
| P294 | 0 | -3 | 3 |
| P298 | 9 | -1 | 10 |
| P302 | 22 | -0 | 23 |
| P307 | -11 | -7 | -3 |
| CAFR | 53 | -1 | 54 |

All 12 available comparisons are retained: RMSE 28.4 mm. This includes Q143's suspect GNSS endpoint; it is not silently removed to improve the score.

Q143 has an isolated roughly 114 mm east-position jump on 29 June compared with its adjacent days, accompanied by inflated formal errors. The GNSS-only neighbor diagnostic flags it for review. Even excluding that issue qualitatively, P286, P288, P302 and CAFR show substantial discrepancies. Missing acquisition-day observations exclude Q164, P293 and P304; the expanded quality mask leaves too few P300 pixels.

The adaptive coherence threshold changes with the AOI (about 0.418 for the smaller AOI versus 0.500 for the expanded AOI). Consequently, P300 ceases to meet the 25-pixel minimum. This context dependence must be assessed and the final policy frozen before held-out evaluation.

The ionospheric-interpolation sensitivity run retains 1,356,279 pixels. Inclusion does not certify their uncertainty. No per-pixel total error model or calibrated significance threshold exists. A low local phase MAD must not be mistaken for low atmospheric/orbital/reference error.

The next scientific requirement is to distinguish residual atmosphere/ionosphere, spatial-support mismatch, GNSS quality issues, and any remaining processing errors using additional epochs and predeclared independent controls. Do not fit a correction to these stations and then present their agreement as held-out validation.

## Venezuela outcome

The June 13–25 earthquake GUNW passed NASA checksum verification and was processed with official ellipsoidal DEMs. Strict QC retained 154 pixels; the interpolation sensitivity run retained 187,872. CCS1 has no accepted radar pixels within 500 m; the closest accepted pixel is about 15.7 km away. Therefore its independent GNSS displacement cannot serve as a co-located comparison for this product.

## Reproduce

`python scripts/compare_california.py --directory data/processed/california-expanded --expanded --reference P287`

The source arrays and complete unrounded comparison are retained in `data/processed/california-expanded`. Original smaller-area results remain in `data/processed/california-research`. All real candidates remain development data.

Sources: [NGL data portal](https://geodesy.unr.edu/PlugNPlayPortal.php), [P287 station](https://geodesy.unr.edu/NGLStationPages/stations/P287.sta), [Q143 station](https://geodesy.unr.edu/NGLStationPages/stations/Q143.sta). Cite Blewitt, Hammond & Kreemer (2018), doi:10.1029/2018EO104623, plus original station operators when publishing these comparisons.
