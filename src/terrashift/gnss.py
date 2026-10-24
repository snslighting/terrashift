"""Independent NGL daily GNSS comparisons; formal errors are not total accuracy."""

from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import numpy as np


@dataclass(frozen=True)
class DailySolution:
    station: str
    day: date
    enu_m: np.ndarray
    covariance_m2: np.ndarray
    latitude: float
    longitude: float
    reference_longitude: float


def read_tenv3(path: Path) -> list[DailySolution]:
    """Read named columns from NGL IGS20 tenv3; combine integer and fractional positions."""
    lines = path.read_text(encoding="utf-8").splitlines()
    header = lines[0].split()
    required = [
        "site",
        "__MJD",
        "reflon",
        "_e0(m)",
        "__east(m)",
        "____n0(m)",
        "_north(m)",
        "u0(m)",
        "____up(m)",
        "sig_e(m)",
        "sig_n(m)",
        "sig_u(m)",
        "__corr_en",
        "__corr_eu",
        "__corr_nu",
        "_latitude(deg)",
        "_longitude(deg)",
    ]
    if len(header) != len(set(header)) or not set(required).issubset(header):
        raise ValueError("Unknown NGL tenv3 columns.")
    result = []
    for line in lines[1:]:
        if not line.strip():
            continue
        row = dict(zip(header, line.split(), strict=True))
        vals = {k: float(row[k]) for k in required if k != "site"}
        if not np.isfinite(list(vals.values())).all():
            raise ValueError("Nonfinite GNSS solution.")
        sigma = np.array([vals[k] for k in ["sig_e(m)", "sig_n(m)", "sig_u(m)"]])
        corr = np.eye(3)
        for i, j, k in [(0, 1, "__corr_en"), (0, 2, "__corr_eu"), (1, 2, "__corr_nu")]:
            corr[i, j] = corr[j, i] = vals[k]
        if np.any(sigma <= 0) or np.linalg.eigvalsh(corr).min() < -1e-10:
            raise ValueError("Invalid GNSS formal covariance.")
        if vals["__MJD"] != int(vals["__MJD"]):
            raise ValueError("Expected integer daily MJD.")
        result.append(
            DailySolution(
                row["site"],
                date(1858, 11, 17) + timedelta(days=int(vals["__MJD"])),
                np.array(
                    [
                        vals["_e0(m)"] + vals["__east(m)"],
                        vals["____n0(m)"] + vals["_north(m)"],
                        vals["u0(m)"] + vals["____up(m)"],
                    ]
                ),
                corr * np.outer(sigma, sigma),
                vals["_latitude(deg)"],
                vals["_longitude(deg)"],
                vals["reflon"],
            )
        )
    if not result or len({r.station for r in result}) != 1:
        raise ValueError("Expected one nonempty station series.")
    if len({r.day for r in result}) != len(result):
        raise ValueError("Duplicate GNSS solution date.")
    return sorted(result, key=lambda r: r.day)


def daily_difference(solutions, before: date, after: date):
    """Exact daily solutions, no gap filling or event-crossing interpolation."""
    if after <= before:
        raise ValueError("Acquisitions must be chronological.")
    by_date = {r.day: r for r in solutions}
    if before not in by_date or after not in by_date:
        raise ValueError("Missing GNSS solution on acquisition date.")
    a, b = by_date[before], by_date[after]
    if a.station != b.station or a.reference_longitude != b.reference_longitude:
        raise ValueError("Incompatible station/reference coordinates.")
    return b.enu_m - a.enu_m, a.covariance_m2 + b.covariance_m2


def project_los(enu_m, covariance_m2, target_to_sensor_enu):
    """Toward-positive projection; covariance assumes independent daily errors."""
    los = np.asarray(target_to_sensor_enu, dtype=float)
    enu = np.asarray(enu_m, dtype=float)
    cov = np.asarray(covariance_m2, dtype=float)
    if los.shape != (3,) or enu.shape != (3,) or cov.shape != (3, 3):
        raise ValueError("Expected ENU vectors and 3x3 covariance.")
    if not (np.isfinite(los).all() and np.isfinite(enu).all() and np.isfinite(cov).all()):
        raise ValueError("Nonfinite GNSS projection input.")
    if not np.isclose(np.linalg.norm(los), 1, atol=1e-5):
        raise ValueError("LOS must be a unit vector directed target to sensor.")
    if not np.allclose(cov, cov.T) or np.linalg.eigvalsh(cov).min() < -1e-12:
        raise ValueError("Invalid covariance.")
    return float(los @ enu), float(np.sqrt(max(0, los @ cov @ los)))


def daily_quality_diagnostic(solutions, day, *, radius_days=7):
    """GNSS-only neighbor diagnostic; it cannot distinguish a real transient from an outlier.

    The center is excluded from the local baseline. The scale is the maximum
    of neighbor robust scatter, the center's formal sigma, and neighbor formal
    sigma, component by component. Never tune this using InSAR residuals.
    """
    center = next((r for r in solutions if r.day == day), None)
    if center is None:
        return {"status": "MISSING_DAY"}
    neighbors = [
        r
        for r in solutions
        if 0 < abs((r.day - day).days) <= radius_days and r.reference_longitude == center.reference_longitude
    ]
    if len(neighbors) < 6:
        return {"status": "INSUFFICIENT_NEIGHBORS", "count": len(neighbors)}
    positions = np.array([r.enu_m for r in neighbors])
    median = np.median(positions, axis=0)
    mad = 1.4826 * np.median(np.abs(positions - median), axis=0)
    formal = np.median([np.sqrt(np.diag(r.covariance_m2)) for r in neighbors], axis=0)
    scale = np.maximum.reduce([mad, formal, np.sqrt(np.diag(center.covariance_m2))])
    scores = np.abs(center.enu_m - median) / scale
    return {
        "status": "LARGE_ISOLATED_CHANGE_REQUIRES_REVIEW" if scores.max() > 8 else "NO_LARGE_ISOLATED_CHANGE",
        "neighbor_count": len(neighbors),
        "component_scores": scores.tolist(),
        "threshold": 8,
        "policy": "Development GNSS-only diagnostic; not a calibrated probability or automatic rejection.",
    }
