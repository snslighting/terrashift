"""Acquire and process new real NISAR data for TerraShift 3. Run on a machine with Earthdata access.

Subcommands
-----------
series             Download every sequential California GUNW pair (track 42 / frame 70) after 23 July
                   2026, prepare corrected layers, refresh GNSS and run the P287 comparison. Results land in
                   data/processed/california-series/<YYYYMMDD>_<YYYYMMDD>/ and are picked up by export_v3.py.
flores-sensitivity Re-run the Flores earthquake pair with interpolated ionosphere allowed (labelled sensitivity).
gcov               Download a before/after NISAR GCOV backscatter pair for a named area and save a change subset
                   to data/processed/gcov-<name>/ for export_v3.py (floods, wetlands, wildfire burn scars).
                   --config config/cases/<case>.json reads the case; --check verifies it against public
                   metadata only (no login, no download) and stops.
control            Process the quiet-period control pair next to an earthquake pair (config/cases/
                   earthquake-controls.json): same track, frame and processing, dates without an earthquake.
                   --check verifies geometry, dates and the USGS catalog without login or download.

Every step reuses the verified download (NASA size + checksum), the schema-checked audit and the
reviewed correction chain. Nothing is fabricated when a step fails: the pair is skipped and the reason
printed.
"""

import argparse
import json
import subprocess
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

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


def gcov_settings(args):
    """Merge --config FILE with command-line options (the command line wins when given)."""
    config = json.loads(Path(args.config).read_text()) if args.config else {}

    def pick(key):
        return getattr(args, key, None) or config.get(key)

    settings = {
        "name": pick("name"),
        "title": pick("title"),
        "region": pick("region"),
        "change": pick("change"),
        "bbox": pick("bbox"),
        "before": pick("before"),
        "after": pick("after"),
        "terms": args.term or config.get("terms") or ["HHHH"],
        "event": json.loads(args.event) if args.event else config.get("event"),
    }
    missing = [k for k, v in settings.items() if v is None and k != "event"]
    if missing:
        raise SystemExit(f"Missing {', '.join(missing)}: give them on the command line or in --config.")
    if settings["change"] not in ("flood", "wildfire"):
        raise SystemExit("change must be flood or wildfire")
    return settings


def gcov(args):
    from terrashift.casecheck import check_gcov_pair, cmr_record

    cfg = gcov_settings(args)
    # Public metadata first: a pair that would mislead is refused before any download.
    problems = check_gcov_pair(cmr_record(cfg["before"]), cmr_record(cfg["after"]), cfg["terms"], cfg["bbox"])
    for p in problems:
        print("PROBLEM:", p)
    if problems:
        raise SystemExit("The case does not pass the metadata check; nothing was downloaded.")
    print(f"Metadata check passed: {cfg['before']} -> {cfg['after']}, terms {cfg['terms']}.")
    if args.check:
        return

    from terrashift.change import backscatter_change_db
    from terrashift.gcov import COLLECTION as GCOV
    from terrashift.gcov import read_backscatter, same_grid

    out = ROOT / "data/processed" / f"gcov-{cfg['name']}"
    out.mkdir(parents=True, exist_ok=True)
    files = [fetch(args.collection or GCOV, g) for g in (cfg["before"], cfg["after"])]
    arrays = {}
    for i, term in enumerate(cfg["terms"]):
        first, second = (read_backscatter(f, cfg["bbox"], term) for f in files)
        if not same_grid(first, second):
            raise ValueError(
                "Before/after GCOV grids differ (track, frame or posting); choose a matching pair."
            )
        delta = backscatter_change_db(first["power"], second["power"])
        arrays.update(
            {f"before_{term}": first["power"], f"after_{term}": second["power"], f"delta_db_{term}": delta}
        )
        if i == 0:
            # The first term keeps the original names, so older readers keep working.
            arrays.update(
                x=first["x"], y=first["y"], before=first["power"], after=second["power"], delta_db=delta
            )
    np.savez_compressed(out / "gcov-subset.npz", **arrays)
    report = {
        "status": "BACKSCATTER_CHANGE_CANDIDATE_NOT_VALIDATED",
        "name": cfg["title"],
        "region": cfg["region"],
        "change_type": cfg["change"],
        "bbox_wgs84": cfg["bbox"],
        "epsg": first["epsg"],
        "term": cfg["terms"][0],
        "terms": cfg["terms"],
        "before": {k: first[k] for k in ("granule", "start", "track", "frame", "orbit", "units")},
        "after": {k: second[k] for k in ("granule", "start", "track", "frame", "orbit", "units")},
        "mask_description": first["mask_description"],
        "mask_applied": False,
        "event": cfg["event"],
    }
    (out / "gcov-report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
    print(f"Saved {out}")


def control(args):
    """Quiet-period control pair for an earthquake case, processed like the event pair."""
    from terrashift.casecheck import check_control, cmr_record, dem_tiles, pair_dates, usgs_events

    config = json.loads((ROOT / "config/cases/earthquake-controls.json").read_text())
    case = config["cases"].get(args.case)
    if not case:
        raise SystemExit(f"No control configured for {args.case}; have: {', '.join(config['cases'])}")
    event, ctrl = cmr_record(case["event_granule"]), cmr_record(case["control_granule"])
    start, end = pair_dates(ctrl)
    quiet = config["quiet_check"]
    found = usgs_events(start[:10], end[:19], *case["centre"], quiet["radius_km"], quiet["min_magnitude"])
    problems = check_control(event, ctrl, found)
    for p in problems:
        print("PROBLEM:", p)
    if problems:
        raise SystemExit("The control pair does not pass the check; nothing was downloaded.")
    print(
        f"Control check passed: {start[:10]} -> {end[:10]}, same track/frame as the event pair, "
        f"no M>={quiet['min_magnitude']} within {quiet['radius_km']} km in the USGS catalog."
    )
    dems = [ROOT / "data/cache/dem" / name for name in dem_tiles(case["bbox"])]
    missing = [str(d) for d in dems if not d.is_file()]
    if missing:
        print("DEM tiles needed (use the same files as the event pair):", *missing, sep="\n  ")
    if args.check:
        return
    if missing:
        raise SystemExit("Missing DEM tiles; nothing was processed.")
    path = fetch(COLLECTION, case["control_granule"])
    options = ["--allow-interpolated-ionosphere"] if case["allow_interpolated_ionosphere"] else []
    run("scripts/prepare_layers.py", path, "--bbox", *case["bbox"], "--dem", *dems,
        "--output", case["output"], *options)  # fmt: skip
    (ROOT / case["output"] / "control.json").write_text(
        json.dumps({"role": "control", "event_granule": case["event_granule"], "quiet_check": quiet,
                    "usgs_events_found": 0, "checked_utc": datetime.now(UTC).isoformat()}, indent=2),
        encoding="utf-8",
    )  # fmt: skip


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
    g.add_argument("--config", help="case file, e.g. config/cases/pantanal-gcov.json")
    g.add_argument("--check", action="store_true", help="check public metadata only; no login, no download")
    g.add_argument("--name", help="short id, e.g. pakistan-flood")
    g.add_argument("--title")
    g.add_argument("--region")
    g.add_argument("--change", choices=["flood", "wildfire"])
    g.add_argument("--bbox", nargs=4, type=float)
    g.add_argument("--before", help="exact GCOV granule ID before the event")
    g.add_argument("--after", help="exact GCOV granule ID after the event")
    g.add_argument("--term", nargs="+", help="covariance terms, e.g. HHHH HVHV (default: config, else HHHH)")
    g.add_argument("--collection", help="override the GCOV collection short name")
    g.add_argument(
        "--event", help='optional JSON: {"time": ..., "longitude": ..., "latitude": ..., "source": ...}'
    )
    c = sub.add_parser("control")
    c.add_argument("--case", required=True, help="venezuela-2026 or flores-2026")
    c.add_argument("--check", action="store_true", help="check metadata and USGS only; no login, no download")
    args = parser.parse_args()
    {"series": series, "flores-sensitivity": flores, "gcov": gcov, "control": control}[args.command](args)


if __name__ == "__main__":
    main()
