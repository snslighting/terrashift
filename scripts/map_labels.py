"""Place names and borders for the map, from Natural Earth (public domain).

Writes three small files that the map loads after it opens, so labels work on every basemap
and also when the live tile servers are unreachable:

    frontend/public/geo/borders.json  land borders between countries (1:50m)
    frontend/public/geo/places.json   label points: countries, capitals, cities, oceans,
                                      seas, bays and lakes
    frontend/public/geo/rivers.json   named rivers and lake centre lines (1:50m)

    uv run python scripts/map_labels.py

Each label keeps Natural Earth's own name and its own zoom level for showing the label
(min_zoom / min_label), so which names appear at which zoom is Natural Earth's choice, not
ours. Coordinates are rounded to keep the files small (about 1 km at 2 decimals).
"""

from __future__ import annotations

import json
import sys
import unicodedata
import urllib.request
from pathlib import Path

import numpy as np

# Pinned so the files can be rebuilt exactly; checked on 14 November 2026.
COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
SOURCE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{COMMIT}/geojson"
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "data" / "cache" / "natural-earth"
OUT = ROOT / "frontend" / "public" / "geo"

# Cities shown up to this Natural Earth min_zoom (1:10m populated places go to 10).
CITY_MAX_ZOOM = 6.1
MARINE = {"ocean": "ocean", "sea": "sea", "bay": "bay", "gulf": "bay", "strait": "bay", "channel": "bay",
          "sound": "bay", "fjord": "bay", "inlet": "bay", "lagoon": "bay", "reef": None}  # fmt: skip


def load(name: str) -> dict:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"{name}.geojson"
    if not path.exists():
        request = urllib.request.Request(
            f"{SOURCE}/{name}.geojson", headers={"User-Agent": "terrashift-map-labels"}
        )
        with urllib.request.urlopen(request, timeout=300) as response:
            path.write_bytes(response.read())
    return json.loads(path.read_text(encoding="utf-8"))


def rounded(coords, digits: int):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], digits), round(coords[1], digits)]
    return [rounded(c, digits) for c in coords]


def thin(line: list, digits: int) -> list:
    """Round a line and drop points that round onto the previous one."""
    out: list = []
    for point in rounded(line, digits):
        if not out or point != out[-1]:
            out.append(point)
    return out


def clean(name: str) -> str:
    """Drop invisible format characters (Natural Earth has a few left-to-right marks)."""
    return "".join(c for c in name if unicodedata.category(c) != "Cf").strip()


def point(lon: float, lat: float, name: str, kind: str, zoom: float, rank: float) -> dict:
    return {
        "type": "Feature",
        "properties": {
            "name": clean(name),
            "kind": kind,
            "z": round(float(zoom), 1),
            "rank": round(float(rank), 1),
        },
        "geometry": {"type": "Point", "coordinates": [round(lon, 3), round(lat, 3)]},
    }


def _inside(x: np.ndarray, y: np.ndarray, ring: np.ndarray) -> np.ndarray:
    """Even-odd point-in-polygon for many points against one ring."""
    hit = np.zeros(x.shape, bool)
    xs, ys = ring[:, 0], ring[:, 1]
    for i in range(len(ring) - 1):
        x1, y1, x2, y2 = xs[i], ys[i], xs[i + 1], ys[i + 1]
        crosses = (y1 > y) != (y2 > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            at = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
        hit ^= crosses & (x < at)
    return hit


def label_point(geometry: dict, steps: int = 40) -> tuple[float, float]:
    """A point well inside the largest polygon: the sampled point farthest from its edge.

    Centroids fall outside curved seas and bays; this finds a spot inside the water.
    """
    polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]

    def area(ring):
        r = np.asarray(ring, float)
        return abs(np.dot(r[:-1, 0], r[1:, 1]) - np.dot(r[1:, 0], r[:-1, 1])) / 2

    rings = [np.asarray(r, float) for r in max(polygons, key=lambda p: area(p[0]))]
    outer = rings[0]
    (w, s), (e, n) = outer.min(0), outer.max(0)
    gx, gy = np.meshgrid(np.linspace(w, e, steps + 2)[1:-1], np.linspace(s, n, steps + 2)[1:-1])
    x, y = gx.ravel(), gy.ravel()
    keep = _inside(x, y, outer)
    for hole in rings[1:]:
        keep &= ~_inside(x, y, hole)
    if not keep.any():
        return float(outer[:, 0].mean()), float(outer[:, 1].mean())
    x, y = x[keep], y[keep]
    edge = np.concatenate(rings)
    # Distance to the nearest edge vertex (in degrees, longitude scaled by latitude).
    scale = np.cos(np.radians(y))[:, None]
    d = np.hypot((x[:, None] - edge[None, :, 0]) * scale, y[:, None] - edge[None, :, 1]).min(1)
    best = int(d.argmax())
    return float(x[best]), float(y[best])


def countries(data: dict) -> list[dict]:
    out = []
    for f in data["features"]:
        p = f["properties"]
        if p.get("LABEL_X") is None or not p.get("NAME"):
            continue
        out.append(point(p["LABEL_X"], p["LABEL_Y"], p["NAME"], "country", p["MIN_LABEL"], p["LABELRANK"]))
    return out


def cities(data: dict, max_zoom: float = CITY_MAX_ZOOM) -> list[dict]:
    out = []
    for f in data["features"]:
        p = f["properties"]
        if p["min_zoom"] > max_zoom or not p.get("name"):
            continue
        kind = "capital" if p.get("adm0cap") else "city"
        lon, lat = f["geometry"]["coordinates"]
        out.append(point(lon, lat, p["name"], kind, p["min_zoom"], p["scalerank"]))
    return out


def waters(marine: dict, lakes: dict) -> list[dict]:
    out = []
    for f in marine["features"]:
        p = f["properties"]
        kind = MARINE.get((p.get("featurecla") or "").lower())
        if not kind or not p.get("name"):
            continue
        out.append(point(*label_point(f["geometry"]), p["name"], kind, p["min_label"], p["scalerank"]))
    for f in lakes["features"]:
        p = f["properties"]
        if not p.get("name") or p.get("featurecla") != "Lake":
            continue
        out.append(point(*label_point(f["geometry"]), p["name"], "lake", p["min_label"], p["scalerank"]))
    return out


def borders(data: dict) -> dict:
    features = []
    for f in data["features"]:
        g = f["geometry"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        disputed = "disputed" in (f["properties"].get("FEATURECLA") or "").lower()
        for line in lines:
            line = thin(line, 2)
            if len(line) >= 2:
                features.append({"type": "Feature", "properties": {"disputed": int(disputed)},
                                 "geometry": {"type": "LineString", "coordinates": line}})  # fmt: skip
    return {"type": "FeatureCollection", "features": features}


def rivers(data: dict) -> dict:
    features = []
    for f in data["features"]:
        p = f["properties"]
        if not p.get("name"):
            continue
        g = f["geometry"]
        lines = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        lines = [line for line in (thin(line, 2) for line in lines) if len(line) >= 2]
        if not lines:
            continue
        props = {"name": clean(p["name"]), "kind": "lake" if "Lake" in p["featurecla"] else "river",
                 "z": round(float(p["min_zoom"]), 1), "label_z": round(float(p["min_label"]), 1)}  # fmt: skip
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "MultiLineString", "coordinates": lines}})  # fmt: skip
    return {"type": "FeatureCollection", "features": features}


def write(name: str, data: dict) -> None:
    path = OUT / name
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{path.relative_to(ROOT)}: {len(data['features'])} features, {path.stat().st_size / 1024:.0f} KB")


def main() -> int:
    places = (
        countries(load("ne_50m_admin_0_countries"))
        + waters(load("ne_10m_geography_marine_polys"), load("ne_50m_lakes"))
        + cities(load("ne_10m_populated_places_simple"))
    )
    # Most important first, so MapLibre places them before smaller names compete for room.
    places.sort(key=lambda f: (f["properties"]["z"], f["properties"]["rank"]))
    write("places.json", {"type": "FeatureCollection", "source": f"Natural Earth @ {COMMIT[:7]}",
                          "features": places})  # fmt: skip
    write("borders.json", borders(load("ne_50m_admin_0_boundary_lines_land")))
    write("rivers.json", rivers(load("ne_50m_rivers_lake_centerlines")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
