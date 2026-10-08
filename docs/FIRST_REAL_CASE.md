# First real cases

**Status: downloaded and inspected; validated displacement milestone not passed.**

Recorded 2026-10-05. Both files are production NISAR products from the provisional collection.

## Flores earthquake candidate

Granule: `NISAR_L2_PR_GUNW_027_168_A_173_028_4000_SH_20260812T214030_20260812T214104_20260824T214029_20260824T214104_P05023_N_F_J_001`

- Reference: 2026-08-12T21:40:30.000000000 UTC
- Secondary: 2026-08-24T21:40:29.000000000 UTC
- AOI WGS84 (W,S,E,N): [121.1, -8.9, 121.95, -8.1]
- Track/frame: 168/173; orbit: Ascending; look: Left
- Maturity: PROVISIONAL (CMR collection); CRID: P05023
- Product/schema version: 1.0.11/1.5.0
- Source: NASA/ASF Earthdata, DOI 10.5067/NIL2GUNW-P1
- Spatial support under strict development QC: 0 pixels
- Ground motion confirmed: No. Total displacement uncertainty: unknown.

Real report: `data/processed/first-case-audit/quality-report.json`

## San Joaquin Valley candidate

Granule: `NISAR_L2_PR_GUNW_024_042_D_070_025_4000_SH_20260629T025641_20260629T025716_20260711T025641_20260711T025715_P05023_N_F_J_001`

- Reference: 2026-06-29T02:56:41.000000000 UTC
- Secondary: 2026-07-11T02:56:41.000000000 UTC
- AOI WGS84 (W,S,E,N): [-120.3, 36.05, -119.8, 36.55]
- Track/frame: 42/70; orbit: Descending; look: Left
- Maturity: PROVISIONAL (CMR collection); CRID: P05023
- Product/schema version: 1.0.11/1.5.0
- Source: NASA/ASF Earthdata, DOI 10.5067/NIL2GUNW-P1
- Spatial support under strict development QC: 925 pixels
- Ground motion confirmed: No. Total displacement uncertainty: unknown.

Real report: `data/processed/san-joaquin-audit/quality-report.json`

## Event context

The saved USGS FDSN response identifies event us6000tkt2, M7.8 near Ende, on 2026-08-14T21:58:21.561Z. Its date is inside the first acquisition pair. Event metadata is not displacement ground truth.

## Reproduce

Run `python scripts/verify_downloads.py` for NASA-checksum validation. Actual HDF5 inventories are in data/catalog/first-hdf5-inventory.json and second-hdf5-inventory.json. Run `python scripts/audit_first_case.py` for Flores, or `python scripts/audit_gunw.py FILE.h5 --bbox WEST SOUTH EAST NORTH --output data/processed/NAME` for either file.

No independent, corrected ground-motion result has passed validation. The samples remain development data. See ALGORITHM.md and VALIDATION.md.

## Venezuela earthquake development candidate

Granule: `NISAR_L2_PR_GUNW_022_162_A_007_023_4000_SH_20260613T100656_20260613T100731_20260625T100655_20260625T100730_P05023_N_F_J_001`

Reference 2026-06-13T10:06:56 UTC; secondary 2026-06-25T10:06:55 UTC. Track 162/frame 7, ascending, provisional P05023, NASA/ASF source, DOI 10.5067/NIL2GUNW-P1. AOI [-67.3,10.02,-66.4,10.7]. NASA size/checksum verified. Strict QC: 154 pixels. Interpolation sensitivity: 187,872 corrected research-phase pixels. CCS1 has no co-located usable radar coverage; no GNSS validation pass. See GNSS_COMPARISON.md and data/processed/venezuela-research.
