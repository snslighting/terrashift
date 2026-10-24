# Adding new real data

All processing runs locally with Earthdata access (`terrashift login` once). Each command reuses the verified download, schema-checked audit and reviewed corrections. A failed pair is skipped and reported; nothing is substituted.

```powershell
# 1. More California pairs (23 Jul → 3 Oct 2026): subsidence timeline
.\.venv\Scripts\python.exe scripts/acquire.py series

# 2. Flores sensitivity run (interpolated ionosphere allowed, labelled)
.\.venv\Scripts\python.exe scripts/acquire.py flores-sensitivity

# 3. A flood or wildfire area from NISAR GCOV backscatter
#    Find exact before/after granule IDs first, e.g. in https://search.asf.alaska.edu/#/?dataset=NISAR
#    Then inspect one file (paths can differ between product versions):
.\.venv\Scripts\terrashift.exe inspect PATH\TO\GCOV.h5 --output data/catalog/gcov-inventory.json
.\.venv\Scripts\python.exe scripts/acquire.py gcov --name my-flood --title "River X flood" `
    --region "Country" --change flood --bbox W S E N --before GRANULE_BEFORE --after GRANULE_AFTER

# 4. Re-export the site evidence and test
.\.venv\Scripts\python.exe scripts/export_v3.py
.\.venv\Scripts\python.exe -m pytest -q
cd frontend; npm test; npm run build; npm run e2e
```

`export_v3.py` discovers `data/processed/california-series/*`, `data/processed/flores-sensitivity` and `data/processed/gcov-*` automatically. Commit `frontend/public/evidence/` and push; CI tests and deploys.

GCOV notes: the reader expects `/science/LSAR/GCOV/grids/frequencyA/{HHHH,…}` with `xCoordinates`, `yCoordinates` and `projection`, and refuses other layouts. The product mask is recorded but not applied until its encoding is reviewed for the downloaded version. The ±3 dB change threshold marks candidates, not confirmed flooding or burning.
