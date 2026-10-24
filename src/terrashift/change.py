"""Surface-change measures derived from real radar layers.

Coherence measures how similar the radar echo stayed between two dates.
Ploughing, irrigation, crop growth, fire, flooding and earthquake damage all
lower it, so 1 - coherence is a widely used surface-change (disturbance)
indicator. It cannot by itself say which process caused the change.
"""

from itertools import pairwise

import numpy as np


def display_support(layers):
    """Pixels inside the AOI that the processor could unwrap.

    Connected component 0 marks open water and pixels that could not be
    unwrapped; excluding it keeps the sea from appearing as "change".
    """
    coherence = np.asarray(layers["coherenceMagnitude"], dtype=float)
    components = np.asarray(layers["connectedComponents"], dtype=float)
    support = np.asarray(layers["inside"], dtype=bool) & np.isfinite(coherence)
    support &= (coherence >= 0) & (coherence <= 1)
    support &= np.isfinite(components) & (components > 0)
    return support


def disturbance(layers):
    """1 - coherence on supported pixels; NaN elsewhere."""
    coherence = np.asarray(layers["coherenceMagnitude"], dtype=float)
    return np.where(display_support(layers), 1 - coherence, np.nan)


def coherence_change(first, second):
    """Second-period minus first-period coherence on pixels supported in both.

    Both inputs must already share the native grid; this never resamples.
    Negative values: the surface changed more in the second period.
    """
    a = np.where(display_support(first), first["coherenceMagnitude"], np.nan)
    b = np.where(display_support(second), second["coherenceMagnitude"], np.nan)
    if a.shape != b.shape:
        raise ValueError("Coherence change requires identical native grids.")
    for axis in ("x", "y"):
        if axis in first and axis in second and not np.array_equal(first[axis], second[axis]):
            raise ValueError("Coherence change requires identical coordinates.")
    common = np.isfinite(a) & np.isfinite(b)
    return np.where(common, b - a, np.nan)


def backscatter_change_db(before, after, *, floor=1e-6):
    """Log-ratio change of radar backscatter power in decibels (after / before).

    Inputs are linear power (for example NISAR GCOV gamma-naught). Values at or
    below `floor` are treated as no-data rather than clipped.
    """
    before = np.asarray(before, dtype=float)
    after = np.asarray(after, dtype=float)
    if before.shape != after.shape:
        raise ValueError("Backscatter change requires identical grids.")
    good = np.isfinite(before) & np.isfinite(after) & (before > floor) & (after > floor)
    with np.errstate(divide="ignore", invalid="ignore"):
        return np.where(good, 10 * np.log10(after / before), np.nan)


def classify_backscatter_change(delta_db, *, threshold_db=3.0):
    """-1 strong decrease, +1 strong increase, 0 small change, NaN no data.

    Open water after flooding and burned vegetation usually darken (decrease);
    flooded vegetation can brighten. The class is a candidate, not a cause.
    """
    if threshold_db <= 0:
        raise ValueError("Threshold must be positive decibels.")
    delta = np.asarray(delta_db, dtype=float)
    out = np.where(delta <= -threshold_db, -1.0, np.where(delta >= threshold_db, 1.0, 0.0))
    return np.where(np.isfinite(delta), out, np.nan)


def chain_series(pairs):
    """Cumulative value along a gap-free chain of sequential pairs.

    `pairs` is a list of (before, after, value_mm). A chain has no redundancy,
    so unlike `timeseries.invert_network` there is no closure check; the result
    is labelled accordingly by callers.
    """
    ordered = sorted(pairs, key=lambda p: p[0])
    for (_b0, a0, _), (b1, _a1, _v) in pairwise(ordered):
        if a0 != b1:
            raise ValueError("Pairs must form a gap-free chain.")
    dates = [ordered[0][0]] + [p[1] for p in ordered] if ordered else []
    total = 0.0
    values = [0.0]
    for _, _, value in ordered:
        if value is None or not np.isfinite(value):
            return {"dates": dates, "cumulative_mm": None, "status": "BROKEN_BY_MISSING_PAIR"}
        total += float(value)
        values.append(total)
    return {"dates": dates, "cumulative_mm": values, "status": "CHAINED_NO_CLOSURE_CHECK"}
