# Study areas

| Area | Change types | Pairs | Layers | Independent check |
|---|---|---|---|---|
| San Joaquin Valley, California | Farming & land disturbance; subsidence | 29 Jun–11 Jul, 11–23 Jul 2026 (track 42 / frame 70, descending) | Surface change, activity change, line-of-sight motion | 12–13 GNSS stations, reference P287 — ground-motion validation failed |
| Caracas coast, Venezuela | Earthquake deformation (M7.2 + M7.5, 24 Jun 2026) | 13–25 Jun 2026 (track 162 / frame 7, ascending) | Surface change, line-of-sight motion | GNSS CCS1 moved 466 mm; 15.7 km from nearest accepted pixel |
| Flores Island, Indonesia | Earthquake (M7.8, 14 Aug 2026) | 12–24 Aug 2026 (track 168 / frame 173, ascending) | Surface change | None co-located |

Every pair is a real NISAR provisional GUNW product, downloaded with NASA size and checksum verification. Granule identifiers, hashes and processing policies travel with each pair in `frontend/public/evidence/catalog.json`.

Next areas (scripts ready, data not yet processed): six more sequential California pairs to 3 October 2026 (`scripts/acquire.py series`), a Flores sensitivity run, and GCOV backscatter before/after pairs for flood and wildfire areas (`scripts/acquire.py gcov`). See ACQUIRE.md.
