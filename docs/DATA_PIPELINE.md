# Data pipeline

## Implemented

1. Validate WGS84 bounding-box and date inputs. Reject inverted/antimeridian boxes; split crossing AOIs explicitly.
2. Search the verified provisional collection through earthaccess. Track/frame/orbit filters use the official filename positions. Search count is capped locally, because an observed library response exceeded the requested count. A bounded result set is not an exhaustive acquisition list.
3. Preserve UMM, collection version, actual reference/secondary timestamps, footprint, polarization/frequency attributes and file checksums. Metadata screening rejects incompatible collection/product types and malformed acquisition ordering.
4. Authenticate using explicit environment, NETRC or interactive strategies. Missing credentials never trigger an unattended prompt. Local errors redact third-party response bodies.
5. Download the exact main `GranuleUR.h5` asset; do not confuse it with `_QA_STATS.h5`. A per-granule lock prevents concurrent duplicate downloads. Download to a temporary directory, verify NASA size/checksum, validate the science container, atomically place the file, then atomically write its manifest.
6. Reuse only an existing container whose SHA-256 agrees with its manifest. The SHA-256 is local integrity evidence; the separate NASA checksum is download-integrity evidence. Neither proves measurement quality.
7. Discover actual HDF5 paths, subset by projected bounds and apply a true WGS84 center-in-AOI mask. Inspect phase, coherence, components and mask attributes.
8. Write numeric subsets and clearly labeled QC reports. Corrections may be interpolated for inspection but are not silently applied.

## Current limitations

The service supports the provisional collection only. Polarization is preserved but not yet a server-side CLI filter. Polygon drawing, full catalog pagination, production jobs, API and tiles are pending. Search overlap does not guarantee good pixel coverage. Cache invalidation by NASA revision, retry/backoff/resumable downloads, disk quotas and richer job diagnostics remain to be implemented. Current large downloads are single-granule operations and temporary files are never accepted as completed cache entries.

The script used for the first DEM retrieval also retrieved small VRT metadata records. Only the local GeoTIFF is used; VRTs are never opened to trigger implicit remote reads. All raw files stay in ignored `data/cache`.

## Output contract

`science_validated=false`, `ground_motion_confirmed=false`, `production_gate=CLOSED`, and null total displacement uncertainty are intentional. The current software has no endpoint that can present a QC raster as measured ground motion. Never substitute a synthetic result for empty or rejected real data.


## Bounded transfer recovery

The CLI now reads authenticated HTTPS ranges with a 15-second connection timeout and 45-second read timeout, retrying each range up to three times. It checks Content-Range and byte counts, rolls back partial chunks, then uses the existing final NASA size/checksum and HDF5 validation before atomic cache installation. Unit tests cover ignored ranges and truncated-chunk recovery. This was needed after an earthaccess full-response read stalled at zero bytes. Resume across process restarts and disk quotas remain pending.

## Research processing and independent data

`prepare_layers.py` validates source version, flattening, CRS and layer units; warps official NISAR ellipsoidal DEM tiles to the scientific grid; interpolates correction/look cubes without extrapolation; and saves corrected research phase with the production gate closed. `plot_audit.py` labels plots unvalidated. `compare_gnss.py` saves exact-date NGL ENU differences, source hashes and formal covariance; it does not equate independent GNSS motion with NISAR validation.
