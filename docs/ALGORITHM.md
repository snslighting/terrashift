# Algorithm: verified implementation and pending science

## Current executable algorithm

The executable pipeline includes quality auditing, source-specific correction arithmetic and numerical LOS/reference/time-series primitives. It is not a validated displacement application. The real HDF5 fields are documented in NISAR_DATA_GUIDE.md and captured with their attributes in the inventories.

Inputs: a downloaded NISAR GUNW of observed schema 1.5.0, a WGS84 rectangle and an explicit development coherence safety floor. The audit checks mission, product, schema, phase units and frequency. It transforms densified AOI bounds into the product CRS, reads only the corresponding 2D window, then applies the exact geographic AOI mask to pixel centers.

The combined uint32 mask is decoded from its actual description: the low byte contains decimal water/reference-subswath/secondary-subswath digits; bits 8-23 contain input anomalies; bit 24 marks interpolated ionospheric estimates; higher reserved bits are conservatively rejected. Fill=255 is rejected. The audit's strict policy excludes ionospheric interpolation; this is a development choice, not a NASA rule that every such pixel is unusable.

Finite-data and fill checks apply to every input. Components zero/fill are invalid. Coherence must be finite and in [0,1]. The working threshold is max(user floor, lower quartile of coherence among otherwise eligible samples). The current floor 0.35 is an explicit uncalibrated policy, not a universal scientific boundary. The [Dolphin theory guide](https://dolphin-insar.readthedocs.io/en/latest/notebooks/theory-phase-linking/) discusses the limitations of arbitrary coherence cutoffs. Threshold sensitivity and held-out calibration are mandatory before scientific deployment.

Spatial support requires at least 25 four-neighbor-connected pixels within the same unwrapping component. This removes isolated samples without averaging across ambiguous component offsets. It does not identify deformation.

## Wavelength and uncertainty conversion

`lambda = 299792458 / centerFrequency_Hz`

`u_iono_equivalent_mm = 1000 * lambda * ionospherePhaseScreenUncertainty / (4*pi)`

This is only the supplied ionospheric phase uncertainty expressed in distance units. It is **not** total displacement uncertainty or a validated one-sigma interval. No arbitrary atmospheric uncertainty is added. No significance/SNR or movement region is emitted while total uncertainty is unknown.

## Correction inspection

The actual wet/hydrostatic troposphere and slant-range solid-Earth-tide cubes are interpolated using scipy RegularGridInterpolator on (ellipsoidal height, northing, easting), using the NISAR DEM on the target grid. Out-of-bounds or invalid DEM pixels remain nodata. Cubes remain separate from the raw phase output.

## Displacement implementation gate

For native chronological NISAR phase, the expected toward-positive conversion has a negative multiplier. [ARIA-tools' explicit convention documentation](https://github.com/aria-tools/ARIA-tools#aria-tools) states that NISAR signs/dates are reversed on extraction to its toward-positive convention. [ISCE3 v0.25.16 Crossmul](https://github.com/isce-framework/isce3/blob/v0.25.16/cxx/isce3/signal/Crossmul.cpp) forms reference times conjugate-secondary.

Do not implement a universal correction subtraction based only on layer names. [Production troposphere code](https://github.com/isce-framework/isce3/blob/v0.25.16/python/packages/nisar/workflows/troposphere.py) and [production tide code](https://github.com/isce-framework/isce3/blob/v0.25.16/python/packages/nisar/workflows/solid_earth_tides.py) must be reconciled with extraction/time-series date conventions and verified numerically. The numerical source check in `scripts/check_tide_sign.py` now executes the hash-pinned production tide function with controlled ENU inputs. It confirms that the stored tide cube equals +4*pi/lambda times the secondary-minus-reference toward-sensor tide displacement. Since its contribution to native chronological interferometric phase is negative, the native correction equation is `phase - ionosphere - wet - hydrostatic + tide`. The phase primitives reject unreviewed processor/schema versions. ARIA-sign-reversed or previously corrected arrays are not compatible inputs. This is algebraic evidence; an independent real observation comparison is still required.

## Numerical primitives and remaining observational validation

- Stable reference REGION: require independent stability evidence, adequate coherent area, low spatial dispersion and temporal consistency. Median referencing within one component; never arbitrarily bridge component offsets. Manual reference selection must be recorded in provenance.
- Total uncertainty: assess effective looks, ionospheric uncertainty, reference covariance, atmospheric and orbital residuals, spatial noise and unwrapping errors. Nominal looks are not independent samples. Do not divide correlated reference noise by sqrt(pixel count).
- Detection: require calibrated significance, coherent support, quality screening, region statistics and geographic outlines. Fixed magnitude alone is insufficient.
- Earthquakes: GUNW already contains a pair. Require the event strictly between actual reference/secondary acquisitions and compatible geometry. USGS gives event context only.
- Slow change: `timeseries.invert_network` implements generalized least squares on a connected redundant network using caller-supplied full covariance. It rejects missing/nonfinite inputs, rank deficiency, duplicate pairs and invalid covariance; reports closure residuals, chi-square and conditional covariance. Synthetic tests pass. No real time series or annual rate is claimed.
- Offsets: inspect GOFF/ROFF for decorrelated large-motion cases and retain their distinct precision/geometry.
- Multiple geometries: LOS only until ascending/descending assumptions and inversion conditioning are validated; do not claim full 3D.

Failure conditions include missing units/schema, unknown mask encoding, no overlap, all masked pixels, missing corrections, no stable reference, disconnected temporal networks, and failed independent validation. These must return explicit insufficient-confidence states.


## Independent GNSS comparison support

`gnss.read_tenv3` reads actual NGL IGS20 column names, preserves integer position offsets, and constructs the full daily ENU covariance from reported uncertainties and correlations. Pair differencing requires both exact acquisition dates; no event-crossing interpolation or gap filling is performed. Target-to-sensor unit vectors project ENU motion toward-positive and propagate full covariance. Daily GNSS estimates are not acquisition-instant positions, and formal uncertainty excludes systematic errors and temporal correlations. A spatial reference must be matched before comparison to relative InSAR.

`phase.reference_phase` takes a region of at least 25 accepted pixels within one unwrapping component. It uses the median and masks all other components rather than bridging unknown offsets. Its spatial MAD is not a standard error and it does not certify stability. `phase.phase_to_los_mm` requires the explicit native chronological convention and a measured frequency in hertz.

The optional interpolation sensitivity audit includes flagged interpolated ionosphere pixels but labels that policy explicitly. It cannot promote them to validated measurements. The default strict audit still rejects them.
