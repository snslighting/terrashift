"""Checks run before processing a new case, using public metadata only (no Earthdata login).

They catch the mistakes that would make a result misleading before anything is downloaded:
a before/after pair from different geometries, a polarization the product does not have, an
area outside the footprint, or a "quiet" control pair that is not quiet.
"""

from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
USGS = "https://earthquake.usgs.gov/fdsnws/event/1/query"
POLARIZATION = {"HHHH": "HH", "HVHV": "HV", "VHVH": "VH", "VVVV": "VV"}


def _get(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": "TerraShift case check"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def cmr_record(granule: str) -> dict:
    """Public NASA CMR record (UMM-G) of one granule. CMR needs a provider for a name query."""
    items = _get(f"{CMR}?{urllib.parse.urlencode({'provider': 'ASF', 'granule_ur': granule})}")["items"]
    if len(items) != 1:
        raise ValueError(f"NASA CMR has {len(items)} records named {granule}")
    return items[0]["umm"]


def usgs_events(start: str, end: str, lon: float, lat: float, radius_km: float, min_magnitude: float) -> list:
    """USGS earthquakes (GeoJSON features) in a time window around a point."""
    query = urllib.parse.urlencode(
        {
            "format": "geojson",
            "starttime": start,
            "endtime": end,
            "longitude": lon,
            "latitude": lat,
            "maxradiuskm": radius_km,
            "minmagnitude": min_magnitude,
        }
    )
    return _get(f"{USGS}?{query}")["features"]


def attributes(umm: dict) -> dict:
    return {a["Name"]: a.get("Values", []) for a in umm.get("AdditionalAttributes", [])}


def geometry_key(umm: dict) -> tuple:
    a = attributes(umm)
    return (
        a.get("TRACK_NUMBER", [None])[0],
        a.get("FRAME_NUMBER", [None])[0],
        a.get("ASCENDING_DESCENDING", [None])[0],
    )


def footprint(umm: dict) -> list[tuple[float, float]]:
    polygons = umm["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"].get("GPolygons", [])
    return [(p["Longitude"], p["Latitude"]) for poly in polygons for p in poly["Boundary"]["Points"]]


def inside(point: tuple[float, float], ring: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon (no dateline handling; checked areas do not cross it)."""
    x, y = point
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1], strict=True):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def bbox_corners(bbox) -> list[tuple[float, float]]:
    w, s, e, n = bbox
    return [(w, s), (e, s), (e, n), (w, n)]


def check_gcov_pair(before: dict, after: dict, terms: list[str], bbox) -> list[str]:
    """Problems with a before/after GCOV pair (empty when it is fine to process)."""
    problems = []
    if geometry_key(before) != geometry_key(after):
        problems.append(
            f"Different geometry: {geometry_key(before)} vs {geometry_key(after)}; pixels would not line up."
        )
    t0 = before["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    t1 = after["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
    if t1 <= t0:
        problems.append(f"'after' ({t1[:10]}) is not later than 'before' ({t0[:10]}).")
    for name, umm in (("before", before), ("after", after)):
        have = set(attributes(umm).get("FREQUENCY_A_POLARIZATION", []))
        for term in terms:
            if POLARIZATION.get(term) not in have:
                problems.append(f"{name} has no {term} (frequency A has {sorted(have)}).")
        ring = footprint(umm)
        if ring and not all(inside(c, ring) for c in bbox_corners(bbox)):
            problems.append(f"The area {list(bbox)} is not fully inside the {name} footprint.")
    return problems


def pair_dates(umm: dict) -> tuple[str, str]:
    a = attributes(umm)
    return a["REFERENCE_ZERO_DOPPLER_START_TIME"][0], a["SECONDARY_ZERO_DOPPLER_START_TIME"][0]


def check_control(event: dict, control: dict, events_in_window: list) -> list[str]:
    """Problems with a quiet-period control pair for an earthquake pair."""
    problems = []
    if geometry_key(event) != geometry_key(control):
        problems.append(f"Different geometry: {geometry_key(event)} vs {geometry_key(control)}.")
    c0, c1 = pair_dates(control)
    e0, e1 = pair_dates(event)
    if not (c1 <= e0 or c0 >= e1):
        problems.append(
            f"Control dates {c0[:10]} -> {c1[:10]} overlap the event pair {e0[:10]} -> {e1[:10]}."
        )
    for f in events_in_window:
        p = f["properties"]
        problems.append(f"Not quiet: M{p['mag']} {p['place']} during the control dates.")
    if _span(c0, c1) != _span(e0, e1):
        problems.append(
            f"Control spans {_span(c0, c1)} days, event {_span(e0, e1)} days: coherence is not directly comparable."
        )
    return problems


def _span(start: str, end: str) -> int:
    """Whole days between two ISO times."""
    from datetime import date

    return date.fromisoformat(end[:10]).toordinal() - date.fromisoformat(start[:10]).toordinal()


def dem_tiles(bbox) -> list[str]:
    """DEM tile files covering an area, in the naming used under data/cache/dem.

    The name is the tile's south-west corner, e.g. DEM_N36_00_W121_00_C01.tif covers 36-37 N,
    121-120 W (as the California tiles already in use).
    """
    w, s, e, n = bbox
    names = []
    for lat in range(math.floor(s), math.ceil(n)):
        for lon in range(math.floor(w), math.ceil(e)):
            ns = f"{'N' if lat >= 0 else 'S'}{abs(lat):02d}"
            ew = f"{'E' if lon >= 0 else 'W'}{abs(lon):03d}"
            names.append(f"DEM_{ns}_00_{ew}_00_C01.tif")
    return names
