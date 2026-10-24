# Known limitations

Updated for TerraShift 3 (24 October 2026).

## What is solid

- **Surface change (coherence loss).** Coherence is measured directly in every NISAR GUNW product and needs no reference area or atmospheric model. The San Joaquin, Caracas and Flores surface-change maps rest on 1.8 M, 0.39 M and 0.55 M unwrapped land pixels respectively. Coherence loss shows that the surface changed; it does not say which process (ploughing, irrigation, growth, shaking, landslides) caused it.
- **Activity change between periods.** Computed on identical native pixels measured in both sequential pairs, before any display aggregation.
- **Earthquake context.** The Caracas pair brackets the 24 June 2026 M7.2 and M7.5 earthquakes; GNSS station CCS1 moved 466 mm horizontally between the radar dates.

## What is not yet reliable

- **Ground-motion (line-of-sight) maps in California.** Against GNSS the radar differs by 28.4 mm and 51.1 mm RMS in the two pairs. `terrashift.validation` shows that in the second pair most of this is a common offset (+42.7 mm; 28.1 mm RMS after removing it) plus a north–south tilt (leave-one-out plane: 25.1 mm). This points to the spatial reference (P287) and long-wavelength ionospheric error rather than random noise. Expected 12-day subsidence is a few millimetres, so a single pair cannot resolve it. These diagnostics are reported and never applied to the published maps.
- **Venezuela line-of-sight values** are relative to a predeclared southern reference area whose stability is unverified, and include interpolated ionosphere (sensitivity mode). CCS1 is 15.7 km from the nearest accepted pixel, so it confirms the scale and direction of motion but cannot validate individual values.
- **Flores** has no ground-motion layer: almost every land pixel carries an interpolated-ionosphere flag, which the strict policy rejects. `scripts/acquire.py flores-sensitivity` produces a labelled sensitivity layer.
- **Total uncertainty** is unknown for every result. No confidence percentage is invented.
- **Time series.** Sequential pairs are chained without loop closure; `timeseries.invert_network` needs a redundant network and is ready for it.

## Not yet available

- Floods, wetlands and wildfire burn scars need NISAR GCOV backscatter products. The reader (`terrashift.gcov`), change measures and export path are implemented and tested on synthetic files; no real GCOV case has been processed yet, and the GCOV mask is not yet decoded.
- No hosted processing worker: products other than the processed study areas show catalog metadata only.

The earlier expanded California comparison also showed unresolved 20–54 mm discrepancies at several stations, aside from a suspect GNSS endpoint at Q143. See GNSS_COMPARISON.md and REPEAT_PAIR_FINDINGS.md.

Sources: [ASF provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/), [NASA/ASF discussion of corrupted-input GUNWs](https://forum.earthdata.nasa.gov/viewtopic.php?t=8133).
