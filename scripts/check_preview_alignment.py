"""Check where TerraShift places a NASA NISAR preview image, against an independent coastline.

NASA's preview PNGs carry no georeferencing. The website places them from the product
footprint (frontend/src/lib/browse.ts):

* the lat/lon composite ("combined") is stretched over the footprint's lon/lat bounding box,
  with its rows re-spaced evenly in Web Mercator (the map stretches images evenly in Mercator,
  while NASA's rows are evenly spaced in latitude), so each row lands at its own latitude;
* single-polarization images ("A_HH", "B_HV", ...) are in the product's own map grid. The
  website picks that grid (UTM zone of the scene centre, or polar stereographic EPSG:3413 /
  EPSG:3031) by matching the image's valid-data shape, projects the image corners and gives the
  map a four-corner quad, which MapLibre draws with a bilinear warp.

This script repeats that placement, maps the OpenStreetMap coastline (NASA GIBS WMS layer
``OSM_Land_Water_Map``) into the image's pixels through it, and finds the shift that puts the
strongest radar edges (land/sea contrast) on the coastline. The shift is the placement error.

Everything used is public and needs no login: the NASA CMR record, NASA's preview PNG and GIBS.

    uv run python scripts/check_preview_alignment.py \\
        NISAR_L2_PR_GCOV_033_072_A_018_4005_DHDH_A_20261017T042326_20261017T042400_P05023_N_F_J_001 \\
        --image combined --image A_HH --out out/alignment

``--placement before`` reproduces the placement before November 2026, for comparison: every image
stretched over the lon/lat box and drawn by the map without the Mercator row correction.
The Python placement mirrors the TypeScript one; if either changes, change both.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from scipy import ndimage

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
GIBS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
KM_PER_DEG = 111.32
POLARIZATION = {"HHHH": "HH", "HVHV": "HV", "VHVH": "VH", "VVVV": "VV"}


def ring_bounds(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """West, south, east, north; longitudes unwrapped across 180 degrees (as browse.ts ringBounds)."""
    lons = [p[0] for p in points]
    if max(lons) - min(lons) > 180:
        lons = [x + 360 if x < 0 else x for x in lons]
    lats = [p[1] for p in points]
    return min(lons), min(lats), max(lons), max(lats)


def mask_no_data(rgba: np.ndarray, threshold: int = 6) -> tuple[np.ndarray, tuple[int, int, int, int] | None]:
    """Valid-pixel mask and extent (x0, x1, y0, y1), as browse.ts maskNoData.

    No-data is transparent, or near-black and connected to the image border (so dark water
    inside the scene is kept). ``rgba`` is uint8 with shape (h, w, 4).
    """
    transparent = rgba[..., 3] == 0
    dark = transparent | np.all(rgba[..., :3] <= threshold, axis=-1)
    labels, _ = ndimage.label(dark, structure=[[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    border = border[border > 0]
    valid = ~(np.isin(labels, border) | transparent)
    ys, xs = np.nonzero(valid)
    if not len(xs):
        return valid, None
    return valid, (int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max()))


def place_image(extent, width: int, height: int, bounds) -> list[tuple[float, float]]:
    """Corners (top-left, top-right, bottom-right, bottom-left) in lon/lat, as browse.ts placeImage."""
    x0, x1, y0, y1 = extent
    w, s, e, n = bounds
    lon_px = (e - w) / (x1 + 1 - x0)
    lat_px = (n - s) / (y1 + 1 - y0)
    left = w - x0 * lon_px
    top = n + y0 * lat_px
    right, bottom = left + width * lon_px, top - height * lat_px
    return [(left, top), (right, top), (right, bottom), (left, bottom)]


def grid_candidates(points: list[tuple[float, float]]) -> dict[str, int]:
    """Map grids NISAR uses for single-polarization previews, as browse.ts nativeGrids."""
    w, s, e, n = ring_bounds(points)
    lon0 = ((w + e) / 2 + 180) % 360 - 180
    north = (s + n) / 2 >= 0
    zone = min(60, int((lon0 + 180) // 6) + 1)
    return {
        f"UTM {zone}{'N' if north else 'S'}": (32600 if north else 32700) + zone,
        "EPSG:3413" if north else "EPSG:3031": 3413 if north else 3031,
    }


def place_native(extent, width: int, height: int, points) -> tuple[list[tuple[float, float]], str, float]:
    """Corners of a single-polarization image placed on its own map grid, as browse.ts placeNative.

    Returns corners, the grid chosen and how far its shape differs from the image's (log ratio).
    """
    from pyproj import Transformer

    x0, x1, y0, y1 = extent
    image_aspect = (x1 + 1 - x0) / (y1 + 1 - y0)
    best = None
    for name, epsg in grid_candidates(points).items():
        fwd = Transformer.from_crs(4326, epsg, always_xy=True)
        fx, fy = fwd.transform([p[0] for p in points], [p[1] for p in points])
        aspect = (max(fx) - min(fx)) / (max(fy) - min(fy))
        miss = abs(math.log(aspect / image_aspect))
        if best is None or miss < best[0]:
            best = (miss, name, epsg, min(fx), max(fx), min(fy), max(fy))
    miss, name, epsg, xmin, xmax, ymin, ymax = best
    sx = (xmax - xmin) / (x1 + 1 - x0)
    sy = (ymax - ymin) / (y1 + 1 - y0)
    inv = Transformer.from_crs(epsg, 4326, always_xy=True)
    corners = []
    for px, py in [(0, 0), (width, 0), (width, height), (0, height)]:
        lon, lat = inv.transform(xmin + (px - x0) * sx, ymax - (py - y0) * sy)
        corners.append((lon, lat))
    # Keep longitudes continuous across the 180 degree line, as the map needs.
    base = corners[0][0]
    corners = [(lon + 360 * round((base - lon) / 360), lat) for lon, lat in corners]
    return corners, name, miss


def mercator(lon, lat):
    lat = np.clip(lat, -85.05, 85.05)
    return np.radians(lon), np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def lonlat_to_pixel(lon, lat, corners, width: int, height: int):
    """Pixel position of lon/lat points in an image drawn on ``corners`` with a bilinear warp in Mercator."""
    X, Y = mercator(np.asarray(lon, float), np.asarray(lat, float))
    cx, cy = mercator(np.array([c[0] for c in corners]), np.array([c[1] for c in corners]))
    # P(u, v) = TL + u (TR - TL) + v (BL - TL) + u v (TL - TR + BR - BL), solved by Newton steps.
    a = np.array([cx[0], cy[0]])
    b = np.array([cx[1] - cx[0], cy[1] - cy[0]])
    c = np.array([cx[3] - cx[0], cy[3] - cy[0]])
    d = np.array([cx[0] - cx[1] + cx[2] - cx[3], cy[0] - cy[1] + cy[2] - cy[3]])
    det0 = b[0] * c[1] - b[1] * c[0]
    u = ((X - a[0]) * c[1] - (Y - a[1]) * c[0]) / det0
    v = (b[0] * (Y - a[1]) - b[1] * (X - a[0])) / det0
    for _ in range(6):
        fx = a[0] + u * b[0] + v * c[0] + u * v * d[0] - X
        fy = a[1] + u * b[1] + v * c[1] + u * v * d[1] - Y
        j11, j12 = b[0] + v * d[0], c[0] + u * d[0]
        j21, j22 = b[1] + v * d[1], c[1] + u * d[1]
        det = j11 * j22 - j12 * j21
        u = u - (fx * j22 - fy * j12) / det
        v = v - (j11 * fy - j21 * fx) / det
    return u * width, v * height


def edge_shift(brightness: np.ndarray, valid: np.ndarray, px: np.ndarray, py: np.ndarray, radius: int):
    """Shift (dx, dy) in pixels that puts the strongest radar edges on the coastline points.

    Land and sea differ sharply in radar brightness, so along the true coastline the image
    gradient is high. Returns (dx, dy, score at best, score at zero, peak contrast). Contrast is
    the best score over the median over all shifts: near 1 there is no clear peak, and either the
    image has no land/sea contrast or the error is larger than the search radius.
    """
    grad = ndimage.gaussian_gradient_magnitude(brightness.astype(float), sigma=1.5)
    grad[~ndimage.binary_erosion(valid, iterations=3)] = np.nan
    h, w = brightness.shape
    scores = {}
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            x = np.round(px + dx).astype(int)
            y = np.round(py + dy).astype(int)
            keep = (x >= 0) & (x < w) & (y >= 0) & (y < h)
            values = grad[y[keep], x[keep]]
            values = values[np.isfinite(values)]
            if len(values) >= 50:
                scores[(dx, dy)] = float(values.mean())
    if not scores:
        return 0, 0, float("nan"), None, float("nan")
    (dx, dy), best = max(scores.items(), key=lambda kv: kv[1])
    return dx, dy, best, scores.get((0, 0)), best / float(np.median(list(scores.values())))


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "TerraShift alignment check"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def read_png(data: bytes) -> np.ndarray:
    """PNG bytes as uint8 RGBA (h, w, 4)."""
    import matplotlib.image as mpimg

    a = mpimg.imread(io.BytesIO(data), format="png")
    if a.dtype != np.uint8:
        a = np.round(a * 255).astype(np.uint8)
    if a.ndim == 2:
        a = np.stack([a, a, a, np.full_like(a, 255)], axis=-1)
    elif a.shape[2] == 3:
        a = np.concatenate([a, np.full(a.shape[:2] + (1,), 255, np.uint8)], axis=-1)
    return a


def granule_record(granule: str) -> dict:
    # CMR refuses a name-only query across all collections; ASF hosts NISAR.
    query = urllib.parse.urlencode({"provider": "ASF", "granule_ur": granule})
    items = json.loads(fetch(f"{CMR}?{query}"))["items"]
    if not items:
        raise SystemExit(f"NASA CMR has no record named {granule}")
    return items[0]["umm"]


def browse_urls(umm: dict) -> dict[str, str]:
    urls = {}
    for link in umm.get("RelatedUrls", []):
        url = link["URL"]
        if not (url.startswith("https://") and "/BROWSE/" in url and url.endswith(".png")):
            continue
        name = url.rsplit("/", 1)[-1]
        if name.endswith("_LATLON.png"):
            urls["combined"] = url
        elif "_NATIVE_" in name:
            freq, pol = name[:-4].rsplit("_", 2)[-2:]
            if pol in POLARIZATION:
                urls[f"{freq}_{POLARIZATION[pol]}"] = url
    return urls


def footprint(umm: dict) -> list[tuple[float, float]]:
    geometry = umm["SpatialExtent"]["HorizontalSpatialDomain"]["Geometry"]
    points = geometry["GPolygons"][0]["Boundary"]["Points"]
    return [(p["Longitude"], p["Latitude"]) for p in points]


def coastline(bounds, size: int = 3000, pad: float = 0.3):
    """Lon/lat of OpenStreetMap coastline pixels around ``bounds`` (NASA GIBS)."""
    w, s, e, n = bounds
    w, s, e, n = w - pad, s - pad, e + pad, n + pad
    query = urllib.parse.urlencode(
        {
            "SERVICE": "WMS",
            "VERSION": "1.1.1",
            "REQUEST": "GetMap",
            "LAYERS": "OSM_Land_Water_Map",
            "STYLES": "",
            "SRS": "EPSG:4326",
            "BBOX": f"{w},{s},{e},{n}",
            "WIDTH": str(size),
            "HEIGHT": str(size),
            "FORMAT": "image/png",
        }
    )
    # OSM_Land_Water_Map: water is drawn mid-grey (128), land dark grey (75).
    water = read_png(fetch(f"{GIBS}?{query}"))[..., 0] > 100
    edge = water ^ ndimage.binary_erosion(water, iterations=1, border_value=1)
    yc, xc = np.nonzero(edge)
    return w + (xc + 0.5) / size * (e - w), n - (yc + 0.5) / size * (n - s)


def check(granule: str, image: str, out: Path, radius: int = 25, placement: str = "auto") -> dict:
    umm = granule_record(granule)
    urls = browse_urls(umm)
    if image not in urls:
        raise SystemExit(f"{granule} has no '{image}' preview (has: {', '.join(sorted(urls))})")
    rgba = read_png(fetch(urls[image]))
    h, w = rgba.shape[:2]
    points = footprint(umm)
    bounds = ring_bounds(points)
    valid, extent = mask_no_data(rgba)
    if extent is None:
        raise SystemExit("The preview image is empty.")
    lon, lat = coastline(bounds)
    if placement == "before":
        corners, grid, miss = place_image(extent, w, h, bounds), "lat/lon box, no Mercator rows", 0.0
        px, py = lonlat_to_pixel(lon, lat, corners, w, h)
    elif image == "combined":
        # Rows re-spaced in Mercator: each displayed row shows the source row at its latitude,
        # so the source pixel of a point is linear in longitude and latitude.
        corners, grid, miss = place_image(extent, w, h, bounds), "lat/lon", 0.0
        (left, top), _, (right, bottom), _ = corners
        px = (np.asarray(lon) - left) / (right - left) * w
        py = (top - np.asarray(lat)) / (top - bottom) * h
    else:
        corners, grid, miss = place_native(extent, w, h, points)
        px, py = lonlat_to_pixel(lon, lat, corners, w, h)
    inside = (px >= 0) & (px < w) & (py >= 0) & (py < h)
    px, py = px[inside], py[inside]
    brightness = rgba[..., :3].mean(axis=-1)
    dx, dy, _, _, contrast = edge_shift(brightness, valid, px, py, radius)
    lat_mid = (corners[0][1] + corners[2][1]) / 2
    km_lon = KM_PER_DEG * math.cos(math.radians(lat_mid))
    # Pixel size along the image's own axes, in km.
    top_km = math.hypot(
        (corners[1][0] - corners[0][0]) * km_lon, (corners[1][1] - corners[0][1]) * KM_PER_DEG
    )
    side_km = math.hypot(
        (corners[3][0] - corners[0][0]) * km_lon, (corners[3][1] - corners[0][1]) * KM_PER_DEG
    )
    px_km = (top_km / w, side_km / h)
    result = {
        "granule": granule,
        "image": image,
        "image_size_px": [w, h],
        "grid": grid,
        "grid_shape_mismatch": round(miss, 4),
        "corners_lonlat": [[round(x, 5), round(y, 5)] for x, y in corners],
        "pixel_km": [round(px_km[0], 4), round(px_km[1], 4)],
        "coastline_points": len(px),
        "edge_shift_px": [dx, dy],
        "edge_shift_km": round(math.hypot(dx * px_km[0], dy * px_km[1]), 2),
        "peak_contrast": round(contrast, 2),
        "conclusive": bool(contrast >= 1.5 and len(px) >= 200),
        "search_radius_km": round(radius * max(px_km), 1),
        "reference": "OpenStreetMap land/water map via NASA GIBS WMS (OSM_Land_Water_Map)",
    }
    out.mkdir(parents=True, exist_ok=True)
    stem = f"{granule[17:40]}_{image}_{placement}"
    (out / f"{stem}.json").write_text(json.dumps(result, indent=2))
    _figure(rgba, valid, px, py, result, out / f"{stem}.png")
    return result


def _figure(rgba, valid, px, py, result, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    shown = rgba.copy()
    shown[~valid, 3] = 0
    fig, ax = plt.subplots(figsize=(8, 8), dpi=110)
    ax.set_facecolor("#0a1424")
    ax.imshow(shown, interpolation="nearest")
    ax.scatter(px, py, s=0.4, c="#ff4fd8", linewidths=0)
    ax.set_xlim(0, rgba.shape[1])
    ax.set_ylim(rgba.shape[0], 0)
    ax.set_xlabel("image column (pixels)")
    ax.set_ylabel("image row (pixels)")
    verdict = "conclusive" if result["conclusive"] else "INCONCLUSIVE (no clear peak)"
    ax.set_title(
        f"NASA preview '{result['image']}' placed by TerraShift on {result['grid']}\n"
        f"magenta: OpenStreetMap coastline (NASA GIBS) mapped through that placement.\n"
        f"Best edge fit: {result['edge_shift_km']:.2f} km off, peak contrast {result['peak_contrast']:.2f} "
        f"({verdict})",
        fontsize=9,
    )
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("granule", help="NISAR granule name (GranuleUR) with a coastline in view")
    parser.add_argument("--image", action="append", help="combined, A_HH, A_HV, B_HH, ... (repeatable)")
    parser.add_argument("--out", type=Path, default=Path("out/alignment"))
    parser.add_argument("--radius", type=int, default=25, help="search radius in pixels")
    parser.add_argument("--placement", choices=["auto", "before"], default="auto")
    args = parser.parse_args()
    for image in args.image or ["combined"]:
        r = check(args.granule, image, args.out, args.radius, args.placement)
        print(
            f"{image:9s} {r['grid']:30s} {r['image_size_px'][0]}x{r['image_size_px'][1]} px "
            f"({r['pixel_km'][0]:.3f} km/px): off by {r['edge_shift_km']:.2f} km "
            f"({r['edge_shift_px'][0]:+d}, {r['edge_shift_px'][1]:+d} px), peak contrast "
            f"{r['peak_contrast']:.2f}, {'conclusive' if r['conclusive'] else 'INCONCLUSIVE'}"
        )


if __name__ == "__main__":
    main()
