# Third-party notices

MapLibre GL JS: BSD-3-Clause. The MapLibre worker and shared module are redistributed under its license, included in `licenses/maplibre.txt`.

Three.js: MIT, included in `licenses/three.txt`.

React, React DOM, React Router, Motion, Lucide, Vite and supporting dependencies retain their original licenses and source notices. Package versions and dependency provenance are retained in the source distribution's `frontend/package-lock.json`.

Natural Earth country geography is public domain: https://www.naturalearthdata.com/about/terms-of-use/. Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson (outlines simplified to 0.08° for the globe texture; names kept, other attributes removed).

Natural Earth place names and borders are public domain: https://www.naturalearthdata.com/about/terms-of-use/. Source: https://github.com/nvkelso/natural-earth-vector at commit ca96624a56bd078437bca8184e78163e5039ad19 (ne_50m_admin_0_countries label points, ne_10m_populated_places_simple, ne_10m_geography_marine_polys, ne_50m_lakes, ne_50m_rivers_lake_centerlines, ne_50m_admin_0_boundary_lines_land), turned into `geo/places.json`, `geo/borders.json` and `geo/rivers.json` by `scripts/map_labels.py` (names and Natural Earth zoom levels kept, coordinates rounded).

DM Sans (map label glyphs in `glyphs/`): Copyright 2014 The DM Sans Project Authors, SIL Open Font License 1.1, included in `licenses/dm-sans-ofl.txt`. Glyphs built from @fontsource/dm-sans 5.3.0 by `frontend/scripts/make-glyphs.mjs`.

Esri World Imagery and World Topo Map are context tile services with on-map attribution. OpenStreetMap context tiles and Photon place search use OpenStreetMap data; https://www.openstreetmap.org/copyright. Context imagery is not a NISAR scientific measurement.

NISAR product metadata/data: NASA / ISRO / ASF. Independent GNSS: Nevada Geodetic Laboratory. Original product identifiers, source links and processing limitations accompany the research export. This project makes no endorsement claim.
