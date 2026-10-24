"""Bounded public discovery and cached research analysis API. No public credentials."""

import json
import math
import os
import re
import sqlite3
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from functools import lru_cache
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi import Query as Param
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .config import COLLECTION, ROOT
from .visualization import summarize_values

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
EVIDENCE = ROOT / "frontend/public/evidence"
JOB_DB = Path(os.getenv("TERRASHIFT_JOB_DB", str(ROOT / "work/jobs.sqlite3")))
cache = {}
cache_lock = threading.Lock()
pool = ThreadPoolExecutor(max_workers=2)


@asynccontextmanager
async def lifespan(_app):
    resume_jobs()
    yield


app = FastAPI(title="TerraShift scientific research API", version="3.0.0", lifespan=lifespan)
origins = os.getenv("TERRASHIFT_CORS_ORIGINS", "https://snslighting.github.io,http://127.0.0.1:4175").split(
    ","
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


def bbox_parts(text):
    try:
        b = tuple(float(v) for v in text.split(","))
    except ValueError:
        raise HTTPException(422, "Use four finite WGS84 coordinates.") from None
    if len(b) != 4 or not all(math.isfinite(v) for v in b):
        raise HTTPException(422, "Use four finite WGS84 coordinates.")
    w, s, e, n = b
    if not (-180 <= w <= 180 and -180 <= e <= 180 and -90 <= s < n <= 90 and w != e):
        raise HTTPException(422, "Invalid WGS84 bounds.")
    return b, [b] if w < e else [(w, s, 180, n), (-180, s, e, n)]


def get_public(url, params):
    key = (url, tuple(sorted((k, str(v)) for k, v in params.items())))
    with cache_lock:
        hit = cache.get(key)
    if hit and time.monotonic() - hit[0] < 300:
        return hit[1]
    try:
        r = httpx.get(
            url,
            params=params,
            timeout=20,
            follow_redirects=False,
            headers={"User-Agent": "TerraShift/2.0 research application"},
        )
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "The upstream catalog or geocoder is unavailable. Retry shortly.") from None
    with cache_lock:
        while len(cache) >= 128:
            cache.pop(next(iter(cache)))
        cache[key] = (time.monotonic(), data)
    return data


@lru_cache(maxsize=1)
def research():
    try:
        return json.loads((EVIDENCE / "catalog.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise HTTPException(503, "Cached research export is not installed on this server.") from None


def all_pairs():
    return [(case, pair) for case in research()["cases"] for pair in case["pairs"]]


def find_pair(pair_id):
    match = next(((c, p) for c, p in all_pairs() if p["id"] == pair_id), None)
    if match is None:
        raise HTTPException(404, "Cached pair unavailable.")
    return match


def read_grid(pair, layer):
    """Decode one exported int16 display grid to float with NaN for no data."""
    import numpy as np

    entry = pair["layers"].get(layer)
    if entry is None:
        return None
    raw = np.frombuffer((EVIDENCE / entry["file"]).read_bytes(), dtype="<i2")
    size = pair["grid"]["size"]
    if raw.size != size * size:
        raise ValueError("Grid file size does not match the catalog.")
    return np.where(raw == entry["nodata"], np.nan, raw * entry["step"]).reshape(size, size)


def normalize(item):
    u = item["umm"]
    attrs = {a["Name"]: a.get("Values", []) for a in u.get("AdditionalAttributes", [])}

    def one(key):
        v = attrs.get(key, [])
        return v[0] if len(v) == 1 else None

    geom = u.get("SpatialExtent", {}).get("HorizontalSpatialDomain", {}).get("Geometry", {})
    rings = []
    for p in geom.get("GPolygons", []):
        ring = [[v["Longitude"], v["Latitude"]] for v in p["Boundary"]["Points"]]
        if ring and ring[-1] != ring[0]:
            ring.append(ring[0])
        rings.append([ring])
    for b in geom.get("BoundingRectangles", []) if not rings else []:
        w, s, e, n = [
            b[k]
            for k in [
                "WestBoundingCoordinate",
                "SouthBoundingCoordinate",
                "EastBoundingCoordinate",
                "NorthBoundingCoordinate",
            ]
        ]
        rings.append([[[w, s], [e, s], [e, n], [w, n], [w, s]]])
    try:
        pairs = all_pairs()
    except HTTPException:
        pairs = []
    match = next(((c, p) for c, p in pairs if p["granule"] == u["GranuleUR"]), None)
    pair = match[1] if match else None
    ident = item["meta"]["concept-id"]
    return {
        "id": ident,
        "granule": u["GranuleUR"],
        "collection": u.get("CollectionReference", {}).get("ShortName"),
        "before": one("REFERENCE_ZERO_DOPPLER_START_TIME"),
        "after": one("SECONDARY_ZERO_DOPPLER_START_TIME"),
        "track": int(one("TRACK_NUMBER")) if one("TRACK_NUMBER") else None,
        "frame": int(one("FRAME_NUMBER")) if one("FRAME_NUMBER") else None,
        "orbit": one("ASCENDING_DESCENDING"),
        "polarizations": attrs.get("FREQUENCY_A_POLARIZATION", []),
        "geometry": {"type": "MultiPolygon", "coordinates": rings} if rings else None,
        "source_url": f"https://cmr.earthdata.nasa.gov/search/concepts/{ident}.umm_json",
        "download_auth_required": True,
        "cached_pair": pair["id"] if pair else None,
        "cached_case": match[0]["id"] if match else None,
        "status": "measured_provisional" if pair else "processing_unavailable",
        "metadata_warnings": [] if rings else ["Catalog footprint unavailable."],
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "3.0.0",
        "services": {
            "discovery": True,
            "locations": True,
            "cached_analysis": (EVIDENCE / "catalog.json").is_file(),
            "global_processing": False,
        },
        "earthdata_credentials_exposed": False,
    }


@app.get("/api/locations")
def locations(q: str = Param(min_length=2, max_length=200)):
    data = get_public("https://photon.komoot.io/api/", {"q": q, "limit": 5, "lang": "en"})
    result = []
    for f in data.get("features", []):
        p = f["properties"]
        name = ", ".join(dict.fromkeys(p[k] for k in ["name", "city", "state", "country"] if p.get(k)))
        lon, lat = f["geometry"]["coordinates"]
        result.append({"name": name, "longitude": lon, "latitude": lat, "source": "Photon / OpenStreetMap"})
    return result


@app.get("/api/discovery")
def discovery(
    bbox: str,
    start: date,
    end: date,
    limit: int = Param(default=50, ge=1, le=100),
    polygon: str | None = None,
):
    b, parts = bbox_parts(bbox)
    if start > end:
        raise HTTPException(422, "Start date follows end date.")
    poly = None
    if polygon:
        try:
            poly = json.loads(polygon)
            if not 4 <= len(poly) <= 100 or poly[0] != poly[-1] or len(parts) != 1:
                raise ValueError()
            if not all(
                len(v) == 2 and all(math.isfinite(c) for c in v) and -180 <= v[0] <= 180 and -90 <= v[1] <= 90
                for v in poly
            ):
                raise ValueError()
        except (ValueError, TypeError, KeyError):
            raise HTTPException(
                422, "Use a closed polygon with 4–100 WGS84 vertices; split dateline areas."
            ) from None
    products = {}
    hits = None
    bounded = False
    for box in parts:
        params = {
            "short_name": COLLECTION,
            "bounding_box": ",".join(map(str, box)),
            "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
            "page_size": limit,
            "sort_key[]": "-start_date",
        }
        if poly:
            params.pop("bounding_box")
            params["polygon"] = ",".join(str(c) for v in poly for c in v)
        data = get_public(CMR, params)
        hits = data.get("hits") if len(parts) == 1 else None
        bounded |= len(data.get("items", [])) >= limit or (data.get("hits") or 0) > len(data.get("items", []))
        for item in data.get("items", []):
            p = normalize(item)
            products[p["id"]] = p
    rows = list(products.values())[:limit]
    return {
        "products": rows,
        "returned": len(rows),
        "hits": hits,
        "bounded": bounded,
        "queried_utc": datetime.now(UTC).isoformat(),
        "source": "NASA CMR via TerraShift API",
        "query": {"bbox": b, "start": str(start), "end": str(end)},
    }


@app.get("/api/products/{ident}")
def product(ident: str):
    if not re.fullmatch(r"G\d+-[A-Z0-9_]+", ident):
        raise HTTPException(422, "Invalid CMR granule concept ID.")
    data = get_public(CMR, {"concept_id": ident, "page_size": 1, "short_name": COLLECTION})
    if not data.get("items"):
        raise HTTPException(404, "Product was not found in the configured GUNW collection.")
    return normalize(data["items"][0])


@app.get("/api/cases")
def cases():
    return [
        {k: c[k] for k in ("id", "name", "region", "bbox", "change_types", "status", "headline")}
        for c in research()["cases"]
    ]


@app.get("/api/cases/{case_id}")
def case(case_id: str):
    match = next((c for c in research()["cases"] if c["id"] == case_id), None)
    if match is None:
        raise HTTPException(404, "Study area unavailable.")
    return match


@app.get("/api/analysis/{pair_id}")
def analysis(pair_id: str):
    return find_pair(pair_id)[1]


@app.get("/api/grids/{name}")
def grid(name: str):
    if not re.fullmatch(r"[a-z0-9-]+(\.count)?\.bin", name):
        raise HTTPException(404, "Grid unavailable.")
    path = EVIDENCE / "grids" / name
    if not path.is_file():
        raise HTTPException(404, "Grid unavailable.")
    return FileResponse(path, media_type="application/octet-stream")


class JobRequest(BaseModel):
    product_id: str = Field(min_length=3, max_length=80)
    bbox: tuple[float, float, float, float]


def connection():
    JOB_DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(JOB_DB, timeout=15)
    con.execute(
        "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, status TEXT, payload TEXT, updated REAL)"
    )
    return con


def save_job(ident, status, payload):
    with connection() as con:
        con.execute(
            "INSERT OR REPLACE INTO jobs VALUES (?,?,?,?)", (ident, status, json.dumps(payload), time.time())
        )


def crop_job(ident, pair, bbox):
    save_job(ident, "running", {"message": "Calculating summaries of actual accepted display cells."})
    try:
        import numpy as np
        from pyproj import Transformer

        g = pair["grid"]
        b, size = g["bounds_mercator"], g["size"]
        x = b[0] + (np.arange(size) + 0.5) * (b[2] - b[0]) / size
        y = b[3] - (np.arange(size) + 0.5) * (b[3] - b[1]) / size
        lon, lat = Transformer.from_crs(3857, 4326, always_xy=True).transform(*np.meshgrid(x, y))
        w, s, e, n = bbox
        keep = (lat >= s) & (lat <= n) & (((lon >= w) & (lon <= e)) if w < e else ((lon >= w) | (lon <= e)))
        result = {
            "bbox": bbox,
            "granule": pair["granule"],
            "before": pair["before"],
            "after": pair["after"],
            "validation": (pair.get("comparison") or {}).get("validation", "NO_INDEPENDENT_COMPARISON"),
            "total_uncertainty_mm": None,
            "summary_support": f"{size}×{size} display-cell means",
        }
        for layer in pair["layers"]:
            values = pair["_arrays"][layer] if "_arrays" in pair else read_grid(pair, layer)
            result[layer] = summarize_values(values[keep])
        save_job(
            ident, "completed", {"message": "Cached research region analysis complete.", "result": result}
        )
    except (ValueError, TypeError, KeyError, OSError, RuntimeError):
        save_job(ident, "failed", {"message": "Cached analysis failed; no substitute result was generated."})


@app.post("/api/jobs")
def submit_job(body: JobRequest):
    b, _ = bbox_parts(",".join(map(str, body.bbox)))
    p = product(body.product_id)
    if p["cached_pair"] is None:
        return {
            "status": "processing_unavailable",
            "message": "No global scientific worker is deployed. "
            "Secure Earthdata acquisition and reviewed processing are required. No job has been queued.",
        }
    with connection() as con:
        count = con.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0]
    if count >= 8:
        raise HTTPException(429, "Research worker busy. Retry shortly.")
    ident = str(uuid.uuid4())
    save_job(
        ident, "queued", {"message": "Cached research analysis queued.", "pair": p["cached_pair"], "bbox": b}
    )
    pool.submit(crop_job, ident, analysis(p["cached_pair"]), b)
    return {"job_id": ident, "status": "queued", "message": "Cached research region analysis queued."}


@app.get("/api/jobs/{ident}")
def job(ident: str):
    with connection() as con:
        row = con.execute("SELECT status,payload,updated FROM jobs WHERE id=?", (ident,)).fetchone()
    if not row:
        raise HTTPException(404, "Job not found.")
    if row[0] in {"queued", "running"} and time.time() - row[2] > 300:
        return {"job_id": ident, "status": "failed", "message": "Worker interrupted. Please submit again."}
    return {"job_id": ident, "status": row[0], **json.loads(row[1])}


@app.get("/api/exports/{pair_id}")
def export(pair_id: str):
    case_record, pair = find_pair(pair_id)
    return {
        "project": "TerraShift",
        "scientific_status": "MEASURED_PROVISIONAL_VALIDATION_FAILED",
        "case": {k: case_record[k] for k in ("id", "name", "region", "change_types", "findings", "limits")},
        "analysis": pair,
        "sources": [CMR, research()["gnss_source"]],
    }


def resume_jobs():
    """Re-queue jobs a previous process accepted but did not finish; the queue survives restarts."""
    try:
        with connection() as con:
            rows = con.execute("SELECT id, payload FROM jobs WHERE status IN ('queued','running')").fetchall()
    except sqlite3.Error:
        return
    for ident, payload in rows:
        data = json.loads(payload)
        try:
            pair = analysis(data["pair"])
        except (KeyError, HTTPException):
            save_job(ident, "failed", {"message": "Job could not be resumed; please submit again."})
            continue
        save_job(ident, "queued", {**data, "message": "Resumed after restart."})
        pool.submit(crop_job, ident, pair, data["bbox"])
