"""Snapshot of where NISAR has observed, from NASA's public CMR catalog.

Pages through every NISAR L2 GUNW (provisional) granule, takes the centre of each
footprint, and counts products per 1-degree cell with the first and latest
acquisition dates. The result is metadata only: it shows where NISAR has data,
not that TerraShift has processed or validated anything there.

    python scripts/coverage_snapshot.py  # writes frontend/public/evidence/coverage.json

No login is needed; CMR metadata is public.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
COLLECTION = "NISAR_L2_GUNW_PROVISIONAL_V1"
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "evidence" / "coverage.json"
CELL = 1.0


def centre(entry: dict) -> tuple[float, float] | None:
    rings = entry.get("polygons") or []
    if rings:
        values = [float(v) for v in rings[0][0].split()]
        lats, lons = values[0::2], values[1::2]
    elif entry.get("boxes"):
        s, w, n, e = (float(v) for v in entry["boxes"][0].split())
        lats, lons = [s, n], [w, e]
    else:
        return None
    # Footprints that cross the dateline: shift western longitudes before averaging.
    if max(lons) - min(lons) > 180:
        lons = [x + 360 if x < 0 else x for x in lons]
    lon = sum(lons) / len(lons)
    lon = ((lon + 180) % 360) - 180
    return lon, sum(lats) / len(lats)


def main() -> int:
    cells: dict[tuple[int, int], dict] = defaultdict(lambda: {"n": 0, "first": "9999", "last": "0000"})
    search_after = None
    total = hits = 0
    while True:
        request = urllib.request.Request(
            f"{CMR}?short_name={COLLECTION}&page_size=2000&sort_key[]=start_date",
            headers={"User-Agent": "terrashift-coverage-snapshot"},
        )
        if search_after:
            request.add_header("CMR-Search-After", search_after)
        with urllib.request.urlopen(request, timeout=180) as response:
            hits = int(response.headers.get("CMR-Hits", 0))
            search_after = response.headers.get("CMR-Search-After")
            entries = json.load(response)["feed"]["entry"]
        if not entries:
            break
        for entry in entries:
            point = centre(entry)
            if not point:
                continue
            key = (int((point[0] + 180) // CELL), int((point[1] + 90) // CELL))
            day = entry.get("time_start", "")[:10]
            c = cells[key]
            c["n"] += 1
            c["first"] = min(c["first"], day)
            c["last"] = max(c["last"], day)
        total += len(entries)
        print(f"{total:,} / {hits:,}", file=sys.stderr)
        if not search_after or total >= hits:
            break
    snapshot = {
        "collection": COLLECTION,
        "source": CMR,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "products": total,
        "catalog_hits": hits,
        "cell_degrees": CELL,
        "note": "Metadata only: where NISAR ground-motion products exist. Not processed or validated by TerraShift.",
        # [cell centre lon, cell centre lat, product count, first date, latest date]
        "cells": sorted(
            [
                round(-180 + (x + 0.5) * CELL, 2),
                round(-90 + (y + 0.5) * CELL, 2),
                c["n"],
                c["first"],
                c["last"],
            ]
            for (x, y), c in cells.items()
        ),
    }
    OUT.write_text(json.dumps(snapshot, separators=(",", ":")))
    print(f"{len(cells):,} cells from {total:,} products -> {OUT}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
