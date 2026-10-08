# TerraShift — interactive research explorer

A static website showing real NASA NISAR research coherence layers and independent GNSS comparisons. Designed for GitHub Pages: publish this directory’s contents at the repository root and enable Pages from the `main` branch.

## Explore

- Pan and zoom the map; switch satellite/geographic basemaps.
- Compare two California acquisition pairs: 29 June–11 July and 11–23 July 2026.
- Inspect GNSS stations, comparison residuals, and aggregated coherence.
- Review Flores and Venezuela quality audits.
- Search study areas and stations; download the selected public evidence as JSON.

## Scientific limits

**Research preview. Validation has not passed.** Coherence is a dimensionless quality measure, not ground displacement or total uncertainty. California comparison RMSE is approximately 28.4 mm and 51.1 mm. Radar values are unvalidated LOS candidates, include interpolated ionosphere for sensitivity research, and use P287 as the common spatial reference. Total displacement uncertainty remains unknown. Flores and Venezuela publish study outlines and audit findings only. No operational monitoring, live processing, or certified deformation product is provided.

The PNGs and JSON grid contain spatial averages on a 256 × 256 Web Mercator grid, exported from accepted real research pixels. This reduced display is not an original-resolution science product. `research-data.json` records granule identifiers, dates, station comparisons, and grid bounds. Raw scientific files and Earthdata credentials are deliberately excluded.

## Sources and credits

- [NASA/ASF NISAR GUNW documentation](https://nisar-docs.asf.alaska.edu/gunw/)
- [Nevada Geodetic Laboratory GNSS data](https://geodesy.unr.edu/PlugNPlayPortal.php)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/) 6.12.0, bundled locally; see `MAPLIBRE-LICENSE.txt`.
- Satellite basemap: Esri, Maxar, Earthstar Geographics. [Esri World Imagery](https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer).
- Geographic basemap: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- DM Sans and Space Grotesk are requested from Google Fonts; system fonts are the fallback.

An internet connection is needed for basemaps and fonts. The map also requires WebGL. The scientific evidence is served directly from this repository. No API keys are embedded. There is no application backend or analytics.
