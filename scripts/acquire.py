"""Acquire and process new real NISAR data for TerraShift 3. Run on a machine with Earthdata access.

Subcommands
-----------
series             Download every sequential California GUNW pair (track 42 / frame 70) after 23 July
                   2026, prepare corrected layers, refresh GNSS and run the P287 comparison. Results land in
                   data/processed/california-series/<YYYYMMDD>_<YYYYMMDD>/ and are picked up by export_v3.py.
flores-sensitivity Re-run the Flores earthquake pair with interpolated ionosphere allowed (labelled sensitivity).
gcov               Download a before/after NISAR GCOV backscatter pair for a named area and save a change subset
                   to data/processed/gcov-<name>/ for export_v3.py (floods, wetlands, wildfire burn scars).

Every step reuses the verified download (NASA size + checksum), the schema-checked audit and the
reviewed correction chain. Nothing is fabricated when a step fails: the pair is skipped and the reason
printed.
"""

import argparse
import json
import subprocess
import sys
import urllib.request

import earthaccess
import numpy as np

from terrashift.cache import download
from terrashift.config import COLLECTION, ROOT

PY = sys.executable
CALIFORNIA_BBOX = ["-120.99", "36.005", "-119.7", "36.99"]
CALIFORNIA_DEM = ["data/cache/dem/DEM_N36_00_W121_00_C01.tif", "data/cache/dem/DEM_N36_00_W120_00_C01.tif"]
STATIONS = [
    "P287", "P300", "CAFP", "Q143", "Q164", "P285", "P286", "P288", "P289", "P290",
    "P293", "P294", "P298", "P302", "P304", "P307", "CAFR",
]  # fmt: skip
NGL = "https://geodesy.unr.edu/gps_timeseries/IGS20/tenv3/IGS20/{}.tenv3"


def run(*args):
    print("$", " ".join(map(str, args)), flush=True)
    subprocess.run([PY, *map(str, args)], check=True, cwd=ROOT)


def fetch(short_name, granule):
    results = [
        r
        for r in earthaccess.search_data(short_name=short_name, granule_name=granule, count=2)
        if r["umm"]["GranuleUR"] == granule
    ]
    if len(results) != 1:
        raise ValueError(f"No unique granule {granule}")
    return download(results[0], bounded_transfer=True)


def refresh_gnss(stations):
    folder = ROOT / "data/cache/gnss"
    folder.mkdir(parents=True, exist_ok=True)
    for name in stations:
        target = folder / f"{name}.IGS20.tenv3"
        try:
            with urllib.request.urlopen(NGL.format(name), timeout=60) as response:
                data = response.read()
            if not data.startswith(b"site"):
                raise ValueError("unexpected content")
            target.write_bytes(data)
            print(f"GNSS {name}: refreshed")
        except Exception as exc:  # noqa: BLE001 -- keep the cached copy and continue
            print(f"GNSS {name}: kept cached copy ({type(exc).__name__})")


def series(args):
    results = earthaccess.search_data(
        short_name=COLLECTION,
        bounding_box=tuple(map(float, CALIFORNIA_BBOX)),
        temporal=(args.start, args.end),
        granule_name="NISAR_L2_PR_GUNW_*_042_D_070_*",
        count=200,
    )
    granules = sorted({r["umm"]["GranuleUR"] for r in results})
    if not args.skip_gnss:
        refresh_gnss(STATIONS)
    done = []
    for granule in granules:
        parts = granule.split("_")
        before, after = parts[11][:8], parts[13][:8]
        if before < "20260723":
            continue  # the June/July pairs are already processed
        out = ROOT / "data/processed/california-series" / f"{before}_{after}"
        if (out / "gnss-comparison.json").is_file() and not args.force:
            print(f"{before}_{after}: already processed")
            done.append(out.name)
            continue
        try:
            path = fetch(COLLECTION, granule)
            run("scripts/prepare_layers.py", path, "--bbox", *CALIFORNIA_BBOX, "--dem", *CALIFORNIA_DEM,
                "--output", out, "--allow-interpolated-ionosphere")  # fmt: skip
            run("scripts/compare_california.py", "--directory", out, "--expanded", "--reference", "P287")
            done.append(out.name)
        except Exception as exc:  # noqa: BLE001 -- skip this pair, never substitute data
            print(f"{before}_{after}: skipped ({type(exc).__name__}: {exc})")
    print(json.dumps({"processed_pairs": done}, indent=2))


def flores(args):
    granule = (
        "NISAR_L2_PR_GUNW_027_168_A_173_028_4000_SH_20260812T214030_20260812T214104_"
        "20260824T214029_20260824T214104_P05023_N_F_J_001"
    )
    path = fetch(COLLECTION, granule)
    run("scripts/prepare_layers.py", path, "--bbox", "121.1", "-8.9", "121.95", "-8.1",
        "--dem", "data/cache/dem/DEM_S09_00_E121_00_C01.tif",
        "--output", "data/processed/flores-sensitivity", "--allow-interpolated-ionosphere")  # fmt: skip


def gcov(args):
    from terrashift.change import backscatter_change_db
    from terrashift.gcov import COLLECTION as GCOV
    from terrashift.gcov import read_backscatter, same_grid

    out = ROOT / "data/processed" / f"gcov-{args.name}"
    out.mkdir(parents=True, exist_ok=True)
    subsets = []
    for granule in (args.before, args.after):
        subsets.append(read_backscatter(fetch(args.collection or GCOV, granule), args.bbox, args.term))
    first, second = subsets
    if not same_grid(first, second):
        raise ValueError("Before/after GCOV grids differ (track, frame or posting); choose a matching pair.")
    delta = backscatter_change_db(first["power"], second["power"])
    np.savez_compressed(
        out / "gcov-subset.npz",
        x=first["x"], y=first["y"], before=first["power"], after=second["power"], delta_db=delta,
    )  # fmt: skip
    report = {
        "status": "BACKSCATTER_CHANGE_CANDIDATE_NOT_VALIDATED",
        "name": args.title,
        "region": args.region,
        "change_type": args.change,
        "bbox_wgs84": args.bbox,
        "epsg": first["epsg"],
        "term": args.term,
        "before": {k: first[k] for k in ("granule", "start", "track", "frame", "orbit", "units")},
        "after": {k: second[k] for k in ("granule", "start", "track", "frame", "orbit", "units")},
        "mask_description": first["mask_description"],
        "mask_applied": False,
        "event": json.loads(args.event) if args.event else None,
    }
    (out / "gcov-report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(f"Saved {out}")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("series")
    s.add_argument("--start", default="2026-07-20")
    s.add_argument("--end", default="2026-12-31")
    s.add_argument("--skip-gnss", action="store_true")
    s.add_argument("--force", action="store_true")
    sub.add_parser("flores-sensitivity")
    g = sub.add_parser("gcov")
    g.add_argument("--name", required=True, help="short id, e.g. pakistan-flood")
    g.add_argument("--title", required=True)
    g.add_argument("--region", required=True)
    g.add_argument("--change", choices=["flood", "wildfire"], required=True)
    g.add_argument("--bbox", nargs=4, type=float, required=True)
    g.add_argument("--before", required=True, help="exact GCOV granule ID before the event")
    g.add_argument("--after", required=True, help="exact GCOV granule ID after the event")
    g.add_argument("--term", default="HHHH")
    g.add_argument("--collection", help="override the GCOV collection short name")
    g.add_argument(
        "--event", help='optional JSON: {"time": ..., "longitude": ..., "latitude": ..., "source": ...}'
    )
    args = parser.parse_args()
    {"series": series, "flores-sensitivity": flores, "gcov": gcov}[args.command](args)


if __name__ == "__main__":
    main()
