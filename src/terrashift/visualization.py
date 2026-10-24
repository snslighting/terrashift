"""Display aggregation with explicit support; never upgrades scientific validation."""

import numpy as np
from pyproj import Transformer

from .phase import NATIVE_CONVENTION, phase_to_los_mm


def referenced_candidate(layers, reference, wavelength_m):
    """Use the existing comparison's prescribed P287 median and phase component."""
    phase = np.asarray(layers["corrected_phase_radians"], dtype=float)
    valid = np.asarray(layers["valid"], dtype=bool)
    component = np.asarray(layers["connectedComponents"])
    if phase.shape != valid.shape or phase.shape != component.shape:
        raise ValueError("Candidate grids differ.")
    if not np.isfinite(wavelength_m) or wavelength_m <= 0:
        raise ValueError("Invalid wavelength.")
    if reference.get("accepted_within_500m", 0) < 25 or not np.isfinite(
        reference.get("median_phase_rad", np.nan)
    ):
        raise ValueError("A supported prescribed reference is required.")
    if reference.get("component", 0) <= 0:
        raise ValueError("Invalid reference component.")
    support = valid & (component == reference["component"]) & np.isfinite(phase)
    return np.where(
        support,
        phase_to_los_mm(
            phase - reference["median_phase_rad"], 299792458 / wavelength_m, convention=NATIVE_CONVENTION
        ),
        np.nan,
    )


def aggregate_display(x, y, epsg, arrays, size=256):
    """Bin actual source-pixel centers, with exact counts, on one Web Mercator grid.

    Means describe accepted source pixels per display cell. Empty cells remain NaN.
    Arrays must share the native science grid. This exports no interpolated science values.
    """
    x, y = np.asarray(x), np.asarray(y)
    if x.ndim != 1 or y.ndim != 1 or len(x) < 2 or len(y) < 2 or size < 2:
        raise ValueError("Invalid coordinate grid.")
    if not np.all(np.diff(x) > 0) or not np.all(np.diff(y) < 0):
        raise ValueError("Unsupported grid ordering.")
    dx, dy = x[1] - x[0], y[0] - y[1]
    transform = Transformer.from_crs(epsg, 3857, always_xy=True)
    bounds = transform.transform_bounds(
        x[0] - dx / 2, y[-1] - dy / 2, x[-1] + dx / 2, y[0] + dy / 2, densify_pts=41
    )
    xx, yy = transform.transform(*np.meshgrid(x, y))
    col = np.floor((xx - bounds[0]) / (bounds[2] - bounds[0]) * size).astype(int)
    row = np.floor((bounds[3] - yy) / (bounds[3] - bounds[1]) * size).astype(int)
    inside = (col >= 0) & (col < size) & (row >= 0) & (row < size)
    index = row * size + col
    output = {}
    for name, values in arrays.items():
        values = np.asarray(values, dtype=float)
        if values.shape != xx.shape:
            raise ValueError("Raster and coordinate shapes differ.")
        keep = inside & np.isfinite(values)
        count = np.bincount(index[keep], minlength=size * size)
        total = np.bincount(index[keep], weights=values[keep], minlength=size * size)
        mean = np.divide(total, count, out=np.full(size * size, np.nan), where=count > 0)
        output[name] = {"values": mean.reshape(size, size), "counts": count.reshape(size, size)}
    return list(bounds), output


def summarize_values(values):
    v = np.asarray(values, dtype=float)
    v = v[np.isfinite(v)]
    if not len(v):
        return {"count": 0, "mean": None, "median": None, "min": None, "max": None, "p05": None, "p95": None}
    return {
        "count": int(v.size),
        "mean": float(v.mean()),
        "median": float(np.median(v)),
        "min": float(v.min()),
        "max": float(v.max()),
        "p05": float(np.quantile(v, 0.05)),
        "p95": float(np.quantile(v, 0.95)),
    }
