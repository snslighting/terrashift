"""Generalized least-squares inversion with explicit covariance and network checks."""

import numpy as np


def invert_network(acquisition_dates, pairs, pair_displacement_mm, covariance_mm2):
    """Invert a connected redundant network relative to the first acquisition.

    Every input must share a verified spatial reference and LOS geometry. The
    caller supplies covariance; diagonal weights are not silently invented.
    Estimates remain LOS, and this routine deliberately estimates no annual rate.
    """
    dates = np.asarray(acquisition_dates, dtype="datetime64[ns]")
    pairs = np.asarray(pairs)
    values = np.asarray(pair_displacement_mm, dtype=float)
    covariance = np.asarray(covariance_mm2, dtype=float)
    n = len(dates)
    m = len(values)
    if n < 3 or np.isnat(dates).any() or not np.all(np.diff(dates) > np.timedelta64(0, "ns")):
        raise ValueError("Require at least three unique chronological acquisitions.")
    if pairs.shape != (m, 2) or not np.issubdtype(pairs.dtype, np.integer):
        raise ValueError("Pairs must be integer acquisition-index rows.")
    if m < n or np.any(pairs < 0) or np.any(pairs >= n) or np.any(pairs[:, 0] >= pairs[:, 1]):
        raise ValueError("Require chronological pairs and a redundant network.")
    if len(set(map(tuple, pairs))) != m:
        raise ValueError("Duplicate pairs do not provide independent redundancy.")
    if covariance.shape != (m, m) or not np.isfinite(covariance).all() or not np.isfinite(values).all():
        raise ValueError("Finite displacement and full pair covariance required.")
    if not np.allclose(covariance, covariance.T, rtol=1e-10, atol=1e-12):
        raise ValueError("Pair covariance must be symmetric.")
    try:
        chol = np.linalg.cholesky(covariance)
    except np.linalg.LinAlgError as exc:
        raise ValueError("Pair covariance must be positive definite.") from exc
    design = np.zeros((m, n))
    design[np.arange(m), pairs[:, 0]] = -1
    design[np.arange(m), pairs[:, 1]] = 1
    design = design[:, 1:]
    weighted_design = np.linalg.solve(chol, design)
    weighted_values = np.linalg.solve(chol, values)
    solution, _, rank, singular = np.linalg.lstsq(weighted_design, weighted_values, rcond=None)
    if rank != n - 1:
        raise ValueError("Disconnected or rank-deficient acquisition network.")
    condition = float(singular[0] / singular[-1])
    if condition > 1e8:
        raise ValueError("Ill-conditioned acquisition network.")
    residual = values - design @ solution
    normalized = np.linalg.solve(chol, residual)
    posterior = np.linalg.inv(weighted_design.T @ weighted_design)
    full_cov = np.zeros((n, n))
    full_cov[1:, 1:] = posterior
    return {
        "dates": [str(d) for d in dates],
        "relative_los_mm": np.r_[0.0, solution],
        "conditional_covariance_mm2": full_cov,
        "pair_residual_mm": residual,
        "chi_square": float(normalized @ normalized),
        "degrees_of_freedom": m - (n - 1),
        "condition_number": condition,
        "annual_velocity_mm_per_year": None,
        "uncertainty_status": "Conditional on supplied covariance; excludes unmodeled errors",
        "validation_status": "NUMERICAL_INVERSION_ONLY",
    }
