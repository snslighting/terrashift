"""Structure of radar-minus-GNSS residuals. Diagnoses error; never tunes results.

Every function here works on station rows that already exist. Leave-one-out
estimates are reported as diagnostics: they show how much of the misfit a
common offset or a planar long-wavelength term could explain, without being
applied to any published map.
"""

import numpy as np


def _usable(rows):
    out = [
        r
        for r in rows
        if r.get("residual_mm") is not None
        and r.get("longitude") is not None
        and r.get("latitude") is not None
        and np.isfinite(r["residual_mm"])
    ]
    return out


def _rmse(values):
    values = np.asarray(values, dtype=float)
    return float(np.sqrt(np.mean(values**2))) if values.size else None


def residual_structure(rows, *, min_stations=4):
    """Offset/plane decomposition of residuals with leave-one-out checks.

    Returns the published RMSE, the RMSE after removing a common offset, and
    leave-one-out RMSE for an offset and a plane. A large drop after removing a
    common offset implicates the spatial reference; a further drop for a plane
    implicates long-wavelength (for example ionospheric) error.
    """
    usable = _usable(rows)
    n = len(usable)
    result = {"stations": n, "status": "INSUFFICIENT_STATIONS"}
    if n < min_stations:
        return result
    r = np.array([row["residual_mm"] for row in usable], dtype=float)
    lon = np.array([row["longitude"] for row in usable], dtype=float)
    lat = np.array([row["latitude"] for row in usable], dtype=float)
    design = np.c_[np.ones(n), lon - lon.mean(), lat - lat.mean()]
    loo_offset, loo_plane = [], []
    for i in range(n):
        keep = np.arange(n) != i
        loo_offset.append(r[i] - r[keep].mean())
        coef, *_ = np.linalg.lstsq(design[keep], r[keep], rcond=None)
        loo_plane.append(r[i] - design[i] @ coef)
    coef, *_ = np.linalg.lstsq(design, r, rcond=None)
    return {
        "stations": n,
        "status": "DIAGNOSTIC_ONLY",
        "mean_residual_mm": float(r.mean()),
        "rmse_mm": _rmse(r),
        "rmse_after_offset_mm": float(r.std()),
        "loo_offset_rmse_mm": _rmse(loo_offset),
        "loo_plane_rmse_mm": _rmse(loo_plane),
        "plane_mm_per_degree": {"longitude": float(coef[1]), "latitude": float(coef[2])},
        "applied_to_maps": False,
        "interpretation": interpret(r, loo_offset, loo_plane),
    }


def interpret(residuals, loo_offset, loo_plane):
    base = _rmse(residuals)
    offset = _rmse(loo_offset)
    plane = _rmse(loo_plane)
    if base is None:
        return "No usable comparisons."
    if offset < 0.7 * base:
        text = "A common offset explains much of the misfit, which implicates the reference area."
    else:
        text = "A common offset does not explain the misfit."
    if plane < 0.8 * offset:
        text += " A planar long-wavelength term explains more, consistent with ionospheric or orbital error."
    return text


def reference_sweep(rows):
    """RMSE if each usable station had been the reference instead of the published one.

    Changing the reference from station R to station K subtracts K's residual
    from every residual, so this needs no access to the radar arrays.
    """
    usable = _usable(rows)
    if len(usable) < 3:
        return []
    names = [r["station"] for r in usable]
    res = np.array([r["residual_mm"] for r in usable], dtype=float)
    sweep = []
    for k, name in enumerate(names):
        shifted = np.delete(res - res[k], k)
        sweep.append({"reference": name, "comparisons": int(shifted.size), "rmse_mm": _rmse(shifted)})
    return sorted(sweep, key=lambda s: s["rmse_mm"])
