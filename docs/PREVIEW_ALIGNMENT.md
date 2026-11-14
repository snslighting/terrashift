# Where NASA preview images land on the map

NASA's NISAR preview PNGs carry no map coordinates. TerraShift places them from the product
footprint in NASA's catalog. This page records how that placement was checked and what was
fixed on 14 November 2026.

## How it is placed

| Image | Grid of the file | Placement in `frontend/src/lib/browse.ts` |
|---|---|---|
| Combined (`_LATLON.png`), also every GUNW interferogram preview | latitude/longitude | Valid-data box matched to the footprint's lon/lat box (`placeImage`); rows re-spaced evenly in Web Mercator before upload (`mercatorRows`) |
| Single polarization (`_NATIVE_A_HHHH.png` and similar) | the product's own map grid: UTM zone of the scene centre, or polar stereographic (EPSG:3413 north, EPSG:3031 south) | Grid chosen by shape: the footprint's box in the right grid has the image's width-to-height ratio. The image corners are projected back and drawn as a four-corner quad (`placeNative`) |

Why the Mercator rows: the map stretches an image evenly in Web Mercator, while NASA's lat/lon
rows are evenly spaced in latitude. Without the correction the middle of a scene shifts
toward the equator, by more at higher latitude.

The UTM / polar stereographic rule was found by testing, not read from a NISAR specification
(the NISAR documentation site could not be reached from the environment used). If NASA
changes the grids, the shape test will stop matching and the numbers below must be redone.

## How it was checked

`scripts/check_preview_alignment.py` repeats the website's placement in Python, maps the
OpenStreetMap coastline (NASA GIBS WMS layer `OSM_Land_Water_Map`) into the image's pixels
through it, and finds the shift (within a search window) that puts the strongest radar edges
on the coastline. Peak contrast below 1.5 means no clear answer.

```bash
uv run python scripts/check_preview_alignment.py NISAR_L2_PR_GCOV_033_072_A_018_4005_DHDH_A_20261017T042326_20261017T042400_P05023_N_F_J_001 --image combined --image A_HH --image B_HV --radius 60
```

```bash
uv run python scripts/check_preview_alignment.py NISAR_L2_PR_GCOV_033_087_A_034_4005_DHDH_A_20261018T053052_20261018T053126_P05023_N_F_J_001 --image combined --image A_HH --radius 60
```

```bash
uv run python scripts/check_preview_alignment.py NISAR_L2_PR_GCOV_033_111_D_056_4005_DHDH_A_20261019T214037_20261019T214049_P05023_N_P_J_001 --image combined --image A_HV --radius 60
```

Add `--placement before` to reproduce the placement used before this change.

## Results (14 November 2026)

| Scene | Image | Before | After | Peak contrast after |
|---|---|---|---|---|
| Libya coast, 33°N, track 72 ascending | combined | 1.77 km | 0.49 km | 2.98 |
| | A_HH (UTM 33N) | 2.59 km | 0.55 km | 2.56 |
| | B_HV (UTM 33N) | 1.31 km | 0.24 km | 4.24 |
| Iceland, 64°N, track 87 ascending | combined | 10.79 km | 1.49 km | 3.35 |
| | A_HH (EPSG:3413) | no clear fit (more than the 12 km window) | 0.45 km | 2.30 |
| Iceland, 64°N, track 111 descending | combined | 7.94 km | 0.51 km | 6.74 |
| | A_HV (EPSG:3413) | 15.66 km | 0.52 km | 4.84 |
| Iceland GUNW, track 87 | interferogram | inconclusive | inconclusive | 1.21 |

Pixel size is about 0.17 to 0.31 km, so the remaining error is 1 to 6 pixels.

## What could not be verified

- GUNW interferogram previews show phase colours, not land/sea brightness, so the coastline
  test finds no clear peak. They use the same lat/lon placement as the GCOV composite, which
  was checked.
- Only three GCOV scenes were checked (two latitudes, both hemispheres not covered). Southern
  polar scenes (EPSG:3031) were not tested on real data.
- The interface therefore says "placement approximate" for every preview.
