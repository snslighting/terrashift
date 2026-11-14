"""Map borders and place names (scripts/map_labels.py): synthetic Natural Earth-shaped input."""

import importlib.util
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("map_labels", ROOT / "scripts" / "map_labels.py")
ml = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ml)


def feature(props, geometry):
    return {"type": "Feature", "properties": props, "geometry": geometry}


def test_label_point_lands_inside_a_curved_sea():
    # A U-shaped sea: its centroid (the middle of the U) is land.
    u = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]]
    x, y = ml.label_point({"type": "Polygon", "coordinates": [u]})
    assert ml._inside(np.array([x]), np.array([y]), np.array(u, float))[0]
    assert not (3 < x < 7 and y > 3)


def test_label_point_uses_the_largest_part_and_avoids_holes():
    small = [[[50, 50], [51, 50], [51, 51], [50, 51], [50, 50]]]
    big = [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]], [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]]]
    x, y = ml.label_point({"type": "MultiPolygon", "coordinates": [small, big]})
    assert 0 < x < 20 and 0 < y < 20
    assert not (5 < x < 15 and 5 < y < 15)


def test_names_lose_invisible_marks_but_keep_accents():
    assert ml.clean("‎São Paulo ") == "São Paulo"


def test_cities_follow_natural_earth_zoom_and_mark_capitals():
    data = {"features": [
        feature({"name": "Big", "min_zoom": 2, "scalerank": 0, "adm0cap": 1}, {"type": "Point", "coordinates": [1, 2]}),
        feature({"name": "Town", "min_zoom": 6, "scalerank": 5, "adm0cap": 0}, {"type": "Point", "coordinates": [3, 4]}),
        feature({"name": "Village", "min_zoom": 9, "scalerank": 10, "adm0cap": 0}, {"type": "Point", "coordinates": [5, 6]}),
    ]}  # fmt: skip
    out = ml.cities(data, max_zoom=6.1)
    assert [(f["properties"]["name"], f["properties"]["kind"]) for f in out] == [
        ("Big", "capital"),
        ("Town", "city"),
    ]
    assert out[1]["properties"]["z"] == 6


def test_borders_mark_disputed_lines_and_drop_repeated_points():
    data = {"features": [
        feature({"FEATURECLA": "International boundary (verify)"},
                {"type": "LineString", "coordinates": [[0.001, 0], [0.002, 0], [1, 1]]}),
        feature({"FEATURECLA": "Disputed (please verify)"},
                {"type": "MultiLineString", "coordinates": [[[0, 0], [1, 0]], [[2, 2], [2.001, 2.001]]]}),
    ]}  # fmt: skip
    out = ml.borders(data)["features"]
    assert out[0]["geometry"]["coordinates"] == [[0.0, 0.0], [1.0, 1.0]]
    assert [f["properties"]["disputed"] for f in out] == [0, 1]  # the 1 mm second line is dropped


def test_rivers_keep_names_and_label_zoom():
    data = {"features": [
        feature({"name": "Nile", "featurecla": "River", "min_zoom": 2, "min_label": 3},
                {"type": "MultiLineString", "coordinates": [[[31, 30], [31.5, 29]]]}),
        feature({"name": None, "featurecla": "River", "min_zoom": 2, "min_label": 3},
                {"type": "MultiLineString", "coordinates": [[[0, 0], [1, 1]]]}),
    ]}  # fmt: skip
    out = ml.rivers(data)["features"]
    assert len(out) == 1 and out[0]["properties"] == {
        "name": "Nile",
        "kind": "river",
        "z": 2.0,
        "label_z": 3.0,
    }


def test_shipped_files_come_from_the_pinned_source():
    places = json.loads((ROOT / "frontend/public/geo/places.json").read_text(encoding="utf-8"))
    assert places["source"] == f"Natural Earth @ {ml.COMMIT[:7]}"
    kinds = {f["properties"]["kind"] for f in places["features"]}
    assert {"country", "capital", "city", "ocean", "sea", "bay", "lake"} <= kinds
    zooms = [(f["properties"]["z"], f["properties"]["rank"]) for f in places["features"]]
    assert zooms == sorted(zooms)
    assert ml.COMMIT in (ROOT / "frontend/public/THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8")
