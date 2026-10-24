"""Development diagnostics; no correction selection or accuracy certification."""

import numpy as np

from .phase import correct_native_phase


def correction_stages(layers, *, processor_version, specification_version):
    """Keep identical pixels for all stages; missing corrections never become zeros."""
    corrected = correct_native_phase(
        layers["unwrappedPhase"],
        layers["ionospherePhaseScreen"],
        layers["wetTroposphericPhaseScreen"],
        layers["hydrostaticTroposphericPhaseScreen"],
        layers["slantRangeSolidEarthTidesPhase"],
        processor_version=processor_version,
        specification_version=specification_version,
    )
    finite = np.isfinite(corrected)
    raw = np.asarray(layers["unwrappedPhase"], dtype=float)
    iono = raw - layers["ionospherePhaseScreen"]
    wet = iono - layers["wetTroposphericPhaseScreen"]
    hydro = wet - layers["hydrostaticTroposphericPhaseScreen"]
    return {
        name: np.where(finite, values, np.nan)
        for name, values in zip(
            ("raw", "minus_ionosphere", "minus_wet", "minus_hydrostatic", "plus_tide"),
            (raw, iono, wet, hydro, corrected),
            strict=True,
        )
    }


def summarize_stages(stages, mask, components, *, component=None, min_pixels=25):
    """Median each cumulative stage; do not sum medians of correction layers.

    A prescribed component prevents neighborhood experiments from silently
    changing the unwrapping reference. Counts include only common finite support.
    """
    mask = np.asarray(mask, dtype=bool).copy()
    components = np.asarray(components)
    if min_pixels < 25 or not stages:
        raise ValueError("Require stages and at least 25 pixels.")
    if mask.ndim != 2 or components.shape != mask.shape:
        raise ValueError("Expected matching two-dimensional grids.")
    for values in stages.values():
        if values.shape != mask.shape:
            raise ValueError("Stage grids must match the mask.")
        mask &= np.isfinite(values)
    mask &= np.isfinite(components) & (components > 0)
    if component is None and mask.any():
        ids, counts = np.unique(components[mask], return_counts=True)
        component = ids[np.argmax(counts)]
    mask &= components == component
    count = int(mask.sum())
    result = {"pixels": count, "component": int(component) if component is not None else None}
    if count < min_pixels:
        return {**result, "status": "INSUFFICIENT_SUPPORT"}, mask
    return {
        **result,
        "status": "DEVELOPMENT_ONLY",
        "median_phase_rad": {name: float(np.median(values[mask])) for name, values in stages.items()},
    }, mask
