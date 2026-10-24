"""Conservative phase arithmetic, separate from scientific certification."""

import numpy as np

NATIVE_CONVENTION = "nisar-reference-times-conjugate-secondary-chronological"


def phase_to_los_mm(phase_radians, frequency_hz, *, convention):
    """Toward-positive LOS for the verified chronological native NISAR convention.

    ISCE3 v0.25.16 Crossmul.cpp forms ref * conj(sec); ARIA-tools documents
    the NISAR-to-toward-positive sign reversal. This function does not apply
    corrections or establish that its input is ground-motion phase.
    """
    if convention != NATIVE_CONVENTION:
        raise ValueError("Unknown phase convention; cannot infer sign.")
    if not np.isfinite(frequency_hz) or frequency_hz <= 0:
        raise ValueError("Frequency must be positive finite hertz.")
    phase = np.asarray(phase_radians, dtype=float)
    return np.where(np.isfinite(phase), -phase * 299792458.0 / frequency_hz / (4 * np.pi) * 1000, np.nan)


def reference_phase(phase, valid, components, reference_mask, *, min_pixels=25):
    """Median-region reference within ONE phase component, never bridge unknown offsets.

    The caller must supply independent stability evidence; low phase spread
    alone does not certify a reference region. Returned MAD is spatial spread,
    not standard error: reference pixels can be strongly correlated.
    """
    phase = np.asarray(phase, dtype=float)
    valid = np.asarray(valid, dtype=bool)
    components = np.asarray(components)
    region = np.asarray(reference_mask, dtype=bool)
    if not (phase.shape == valid.shape == components.shape == region.shape) or phase.ndim != 2:
        raise ValueError("Reference inputs must share a two-dimensional grid.")
    if min_pixels < 25:
        raise ValueError("Reference requires at least 25 pixels.")
    eligible = valid & np.isfinite(phase) & np.isfinite(components) & (components > 0)
    selected = eligible & region
    if selected.sum() < min_pixels:
        raise ValueError("Insufficient valid reference-region pixels.")
    labels = np.unique(components[selected])
    if len(labels) != 1:
        raise ValueError("Reference region crosses unwrapping components.")
    offset = float(np.median(phase[selected]))
    supported = eligible & (components == labels[0])
    output = np.where(supported, phase - offset, np.nan)
    return output, {
        "component": int(labels[0]),
        "reference_pixels": int(selected.sum()),
        "median_phase_radians": offset,
        "spatial_mad_radians": float(np.median(np.abs(phase[selected] - offset))),
        "reference_uncertainty_radians": None,
        "stability_verified": False,
    }


def correct_native_phase(
    raw,
    ionosphere,
    wet_troposphere,
    hydrostatic_troposphere,
    solid_earth_tide,
    *,
    processor_version,
    specification_version,
):
    """Source-specific phase correction for inspected native ISCE3 0.25.16 products.

    Units: all inputs radians on the same grid, with cubes interpolated at the
    ellipsoidal terrain height. The tide cube is a correction, opposite to the
    native interferogram tide contribution (see check_tide_sign.py). This must
    never be applied to already corrected or ARIA-sign-reversed phase.
    """
    if processor_version != "0.25.16" or specification_version != "1.5.0":
        raise ValueError("Correction signs have not been reviewed for this processor/schema.")
    arrays = [
        np.asarray(v, dtype=float)
        for v in (raw, ionosphere, wet_troposphere, hydrostatic_troposphere, solid_earth_tide)
    ]
    if any(a.shape != arrays[0].shape for a in arrays):
        raise ValueError("Correction layers must share the phase grid.")
    good = np.logical_and.reduce([np.isfinite(a) for a in arrays])
    corrected = arrays[0] - arrays[1] - arrays[2] - arrays[3] + arrays[4]
    return np.where(good, corrected, np.nan)
