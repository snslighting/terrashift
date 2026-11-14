"""Items 9 and 10: GCOV case and earthquake control pairs, prepared but not processed.

Synthetic metadata and arrays only; no network, no Earthdata login. Exported files go to a
temporary folder, never into frontend/public/evidence.
"""

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
import pytest

from terrashift.casecheck import check_control, check_gcov_pair, dem_tiles, inside

ROOT = Path(__file__).resolve().parents[1]


def _module(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def gcov_umm(date, track="132", frame="169", pols=("HH", "HV"), ring=None):
    ring = ring or [(-56.65, -17.9), (-57.1, -15.8), (-59.5, -16.2), (-59.1, -18.4), (-56.65, -17.9)]
    return {
        "TemporalExtent": {"RangeDateTime": {"BeginningDateTime": f"{date}T09:42:25Z"}},
        "AdditionalAttributes": [
            {"Name": "TRACK_NUMBER", "Values": [track]},
            {"Name": "FRAME_NUMBER", "Values": [frame]},
            {"Name": "ASCENDING_DESCENDING", "Values": ["ASCENDING"]},
            {"Name": "FREQUENCY_A_POLARIZATION", "Values": list(pols)},
        ],
        "SpatialExtent": {
            "HorizontalSpatialDomain": {
                "Geometry": {
                    "GPolygons": [
                        {"Boundary": {"Points": [{"Longitude": x, "Latitude": y} for x, y in ring]}}
                    ]
                }
            }
        },
    }


def gunw_umm(before, after, track="162", frame="7"):
    return {
        "AdditionalAttributes": [
            {"Name": "TRACK_NUMBER", "Values": [track]},
            {"Name": "FRAME_NUMBER", "Values": [frame]},
            {"Name": "ASCENDING_DESCENDING", "Values": ["ASCENDING"]},
            {"Name": "REFERENCE_ZERO_DOPPLER_START_TIME", "Values": [f"{before}T10:06:56Z"]},
            {"Name": "SECONDARY_ZERO_DOPPLER_START_TIME", "Values": [f"{after}T10:06:55Z"]},
        ]
    }


BOX = [-57.8, -17.8, -57.2, -17.0]


def test_a_good_gcov_pair_passes():
    assert check_gcov_pair(gcov_umm("2026-07-05"), gcov_umm("2026-10-21"), ["HHHH", "HVHV"], BOX) == []


def test_gcov_pair_problems_are_named():
    problems = check_gcov_pair(
        gcov_umm("2026-10-21"),
        gcov_umm("2026-07-05", track="31", pols=("HH",)),
        ["HHHH", "HVHV"],
        [-57.6, -18.5, -57.0, -17.0],
    )
    text = " ".join(problems)
    assert "Different geometry" in text
    assert "not later" in text
    assert "after has no HVHV" in text
    assert "not fully inside" in text


def test_point_in_footprint():
    ring = [(0, 0), (1, 0), (1, 1), (0, 1)]
    assert inside((0.5, 0.5), ring)
    assert not inside((1.5, 0.5), ring)


def test_control_pair_must_be_same_geometry_quiet_and_comparable():
    event = gunw_umm("2026-06-13", "2026-06-25")
    assert check_control(event, gunw_umm("2026-06-01", "2026-06-13"), []) == []
    text = " ".join(
        check_control(
            event,
            gunw_umm("2026-06-20", "2026-07-14", track="168"),
            [{"properties": {"mag": 5.0, "place": "30 km N of Catia La Mar, Venezuela"}}],
        )
    )
    assert "Different geometry" in text
    assert "overlap" in text
    assert "Not quiet: M5.0" in text
    assert "24 days, event 12 days" in text


def test_dem_tile_names_follow_the_files_already_used():
    # Names used for California and Flores (scripts/acquire.py).
    assert dem_tiles([-120.99, 36.005, -119.7, 36.99]) == [
        "DEM_N36_00_W121_00_C01.tif",
        "DEM_N36_00_W120_00_C01.tif",
    ]
    assert dem_tiles([121.1, -8.9, 121.95, -8.1]) == ["DEM_S09_00_E121_00_C01.tif"]


def test_case_files_hold_real_looking_ids_on_one_geometry():
    gcov = json.loads((ROOT / "config/cases/pantanal-gcov.json").read_text())
    assert gcov["terms"] == ["HHHH", "HVHV"]
    assert gcov["before"] == gcov["series"][0] and gcov["after"] == gcov["series"][-1]
    assert all("_GCOV_" in g and "_132_A_169_" in g for g in gcov["series"])
    dates = [g.split("_")[11][:8] for g in gcov["series"]]
    assert dates == sorted(dates)
    assert "not a result" in gcov["hypothesis"]
    controls = json.loads((ROOT / "config/cases/earthquake-controls.json").read_text())
    catalog = json.loads((ROOT / "frontend/public/evidence/catalog.json").read_text())
    events = {
        c["id"]: c["pairs"][0]["granule"] for c in catalog["cases"] if "earthquake" in c["change_types"]
    }
    assert set(controls["cases"]) == set(events)
    for cid, case in controls["cases"].items():
        assert case["event_granule"] == events[cid]
        tag = f"_{case['track']:03d}_A_{case['frame']:03d}_"
        assert tag in case["event_granule"] and tag in case["control_granule"]
        assert case["control_granule"] != case["event_granule"]


def test_gcov_settings_merge_config_and_command_line(tmp_path):
    acquire = _module("acquire")
    config = tmp_path / "case.json"
    config.write_text(json.dumps({"name": "x", "title": "X", "region": "R", "change": "flood", "bbox": BOX,
                                  "before": "B", "after": "A", "terms": ["HHHH", "HVHV"]}))  # fmt: skip
    args = argparse.Namespace(config=str(config), name=None, title="Override", region=None, change=None, bbox=None,
                              before=None, after=None, term=None, event=None)  # fmt: skip
    cfg = acquire.gcov_settings(args)
    assert cfg["title"] == "Override" and cfg["terms"] == ["HHHH", "HVHV"] and cfg["bbox"] == BOX
    args.change = "earthquake"
    with pytest.raises(SystemExit):
        acquire.gcov_settings(args)


def test_export_writes_hh_and_hv_layers_for_a_processed_gcov_case(tmp_path):
    export = _module("export_v3")
    folder = tmp_path / "processed" / "gcov-test"
    folder.mkdir(parents=True)
    x = 500_000 + np.arange(40) * 100.0
    y = 8_100_000 - np.arange(30) * 100.0
    hh = np.linspace(-6, 6, 1200).reshape(30, 40)
    hv = -hh
    np.savez_compressed(folder / "gcov-subset.npz", x=x, y=y, delta_db=hh, delta_db_HHHH=hh, delta_db_HVHV=hv)
    side = {"granule": "G", "start": "2026-07-05T09:42:27", "track": 132, "frame": 169, "orbit": "Ascending",
            "units": "linear"}  # fmt: skip
    (folder / "gcov-report.json").write_text(json.dumps({
        "name": "Test wetland", "region": "Nowhere", "change_type": "flood", "bbox_wgs84": BOX, "epsg": 32721,
        "before": side, "after": {**side, "start": "2026-10-21T09:42:25"}, "event": None}))  # fmt: skip
    out = tmp_path / "evidence"
    case = export.gcov_cases(tmp_path / "processed", out)[0]
    pair = case["pairs"][0]
    assert set(pair["layers"]) == {"backscatter_change", "backscatter_change_hv"}
    assert pair["layers"]["backscatter_change_hv"]["unit"] == "dB"
    assert (out / pair["layers"]["backscatter_change_hv"]["file"]).is_file()
    assert case["findings"][0].startswith("HH:") and case["findings"][1].startswith("HV:")
    assert case["status"] == "measured_provisional"
    assert export.control_block(tmp_path / "processed", "venezuela-2026", out) is None
