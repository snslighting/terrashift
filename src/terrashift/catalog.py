import math
from dataclasses import dataclass
from datetime import datetime

import earthaccess

from .config import COLLECTION


@dataclass(frozen=True)
class Query:
    bbox: tuple[float, float, float, float]
    start: str
    end: str
    count: int = 20
    track: int | None = None
    frame: int | None = None
    orbit: str | None = None

    def __post_init__(self):
        w, s, e, n = self.bbox
        if not all(math.isfinite(v) for v in self.bbox) or not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
            raise ValueError("Use west,south,east,north in WGS84; split antimeridian AOIs into two searches.")
        if datetime.fromisoformat(self.start) > datetime.fromisoformat(self.end):
            raise ValueError("Start date must not follow end date.")
        if not 1 <= self.count <= 200:
            raise ValueError("count must be 1..200 (bounded discovery, not an exhaustive archive search).")
        if self.orbit not in (None, "A", "D"):
            raise ValueError("Orbit must be A or D.")
        if self.track is not None and not 1 <= self.track <= 173:
            raise ValueError("NISAR track must be 1..173.")
        if self.frame is not None and not 1 <= self.frame <= 176:
            raise ValueError("NISAR frame must be 1..176.")


def attributes(umm):
    return {a["Name"]: a.get("Values", []) for a in umm.get("AdditionalAttributes", [])}


def summarize(result):
    umm = result["umm"]
    return {
        "granule": umm["GranuleUR"],
        "concept_id": result.get("meta", {}).get("concept-id"),
        "collection": umm.get("CollectionReference"),
        "temporal_extent": umm.get("TemporalExtent"),
        "spatial_extent": umm.get("SpatialExtent"),
        "attributes": attributes(umm),
        "archive_files": umm.get("DataGranule", {}).get("ArchiveAndDistributionInformation", []),
        "science_validated": False,
    }


def search(query):
    # Search public CMR metadata without login. Filter scene fields server-side to avoid
    # dropping matches after the bounded result limit. File convention verified in docs.
    parts = [
        "NISAR",
        "L2",
        "PR",
        "GUNW",
        "*",
        f"{query.track:03d}" if query.track is not None else "*",
        query.orbit or "*",
        f"{query.frame:03d}" if query.frame is not None else "*",
        "*",
    ]
    args = {
        "short_name": COLLECTION,
        "bounding_box": query.bbox,
        "temporal": (query.start, query.end),
        "count": query.count,
    }
    if any(v is not None for v in (query.track, query.frame, query.orbit)):
        args["granule_name"] = "_".join(parts)
    return earthaccess.search_data(**args)[: query.count]
