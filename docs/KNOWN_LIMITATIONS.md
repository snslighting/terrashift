# Known limitations

This build has not achieved the requested first validated displacement result. No public or local finished web application exists yet. No displacement, velocity, acceleration, prediction, alert, or calibrated confidence score is produced.

The current quality policy is intentionally conservative and uncalibrated. Rejecting bit-24 ionospheric interpolation removes nearly all samples in the Flores AOI. This is evidence about this policy and these products, not proof that all such NISAR pixels are invalid. A scientifically supported treatment of interpolation and its uncertainty remains necessary.

The San Joaquin pair does not establish long-term subsidence. Its roughly 21 mm median ionospheric distance-equivalent uncertainty among retained pixels excludes other uncertainty contributions. It must not be shown as +/-21 mm total measurement error or evidence for 18 mm ground movement.

Known provisional issues include high-latitude ionospheric residuals, incomplete input data, radio-frequency artifacts and problematic diagnostic frames. The user guide and forum may lag newer per-file schemas. TerraShift checks observed metadata and retains provenance rather than assuming that every P05023 file has identical quality layers.

Sources: [ASF provisional known issues](https://nisar-docs.asf.alaska.edu/provisional-known-issues/), [NASA/ASF discussion of corrupted-input GUNWs](https://forum.earthdata.nasa.gov/viewtopic.php?t=8133).

Implemented numerical primitives include source-specific corrections, regional referencing, GNSS projection and covariance-aware time-series inversion. Still unvalidated or unfinished: production correction accuracy, stable referencing, calibrated full uncertainty, meaningful signal-to-noise detection, real time series, multiple geometries, offsets, successful GNSS validation, API, frontend, map tools and animations. Never use the QC plots as ground-deformation maps. No claim of earthquake prediction, vertical displacement or universal millimeter accuracy is supported.


The expanded California comparison has unresolved 20–54 mm discrepancies at several stations even aside from a suspect GNSS endpoint at Q143. No small-motion claim or calibrated per-pixel confidence follows from the current results. See GNSS_COMPARISON.md.
