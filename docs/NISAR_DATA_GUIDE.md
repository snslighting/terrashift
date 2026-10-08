# NISAR data guide

Reviewed 2026-10-05 against live official documentation and actual downloaded files.

## Verified collection and access

ASF lists `NISAR_L2_GUNW_PROVISIONAL_V1` as the provisional Level-2 GUNW collection. Public catalog discovery uses earthaccess/CMR; the science assets require Earthdata login. TerraShift uses HTTPS downloads, not website scraping. CMR interval overlap can return pairs whose reference date precedes the search start; earthquake selection must inspect both actual acquisition times.

Sources: [ASF Earthaccess guide](https://nisar-docs.asf.alaska.edu/earthaccess/), [collection names](https://nisar-docs.asf.alaska.edu/earthdata-search/).

## Actual product structure

The inventories in `data/catalog/first-hdf5-inventory.json` and `second-hdf5-inventory.json` enumerate real paths, dimensions, attributes and small scalar metadata. They are the authoritative observed schema for these files. `inspect_gunw.py` handles named datatypes, HDF5 references and non-finite complex fill values without reading whole rasters.

Observed group roots:

- Identification: `/science/LSAR/identification`
- Frequency and center frequency: `/science/LSAR/GUNW/grids/frequencyA`
- Unwrapped phase, coherence, connected components, ionospheric phase and its uncertainty: `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/HH`
- Combined mask: `/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram/mask`
- Projection and x/y coordinate arrays: the HH group above (also shared at its parent).
- Geometry and atmospheric/tidal cubes: `/science/LSAR/GUNW/metadata/radarGrid`
- Processor parameters: `/science/LSAR/GUNW/metadata/processingInformation`

The first file has 4,068 x 4,185 unwrapped pixels, 80 m spacing, EPSG:32751, frequency 1,239,000,000 Hz, product version 1.0.11, schema 1.5.0 and processor 0.25.16. Its derived wavelength is approximately 0.241963 m. Do not substitute the nominal L-band wavelength.

## Corrections and geometry

GUNW supplies corrections separately. Geocoding correction flags describe geolocation, not proof that phase screens were subtracted. Geometry/correction cubes need evaluation at each pixel's WGS84 ellipsoidal DEM height. The matching NISAR DEM v1.2 tile has been retrieved. Interpolation is tested with an analytic 3D field and refuses extrapolation by returning nodata.

Sources: [GUNW overview](https://nisar-docs.asf.alaska.edu/gunw/), [metadata cubes](https://nisar-docs.asf.alaska.edu/metadata/).

## Version mismatch

The retrieved Rev D GUNW PDF describes an older 1.1.0 specification. The real files say 1.5.0. In particular their masks are uint32, not the older byte layout. The old PDF cannot establish current mask behavior. The observed mask description agrees with the [current ISCE3 GUNW writer](https://github.com/isce-framework/isce3/blob/36f0b36b0e07679621c654ad19e9f90bd68c2307/python/packages/nisar/products/insar/GUNW_writer.py). Missing newer datasets are not invented.

The inspected file has no pixelwise `validDataMask` layer; its combined mask is used, and no claim of independent layover/shadow screening is made.
