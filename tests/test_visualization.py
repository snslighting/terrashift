"""Synthetic fixtures test arithmetic only; these are never published as observations."""

import numpy as np
import pytest

from terrashift.visualization import aggregate_display, referenced_candidate, summarize_values


def test_candidate_reference_sign_component_and_missing_support():
    wavelength = 0.24
    phase = np.full((6, 6), 2.0 - 4 * np.pi * 0.012 / wavelength)
    components = np.ones((6, 6), dtype=int)
    components[0, 0] = 2
    valid = np.ones((6, 6), dtype=bool)
    valid[1, 1] = False
    result = referenced_candidate(
        {"corrected_phase_radians": phase, "valid": valid, "connectedComponents": components},
        {"accepted_within_500m": 25, "median_phase_rad": 2.0, "component": 1},
        wavelength,
    )
    assert np.isnan(result[0, 0]) and np.isnan(result[1, 1])
    np.testing.assert_allclose(result[np.isfinite(result)], 12.0)
    with pytest.raises(ValueError, match="supported"):
        referenced_candidate(
            {"corrected_phase_radians": phase, "valid": valid, "connectedComponents": components},
            {"accepted_within_500m": 24, "median_phase_rad": 2.0, "component": 1},
            wavelength,
        )


def test_display_conserves_actual_source_support_and_weighted_sum():
    values = np.arange(16, dtype=float).reshape(4, 4)
    values[0, 0] = np.nan
    bounds, raster = aggregate_display(
        np.arange(4) * 10.0 + 5, 35.0 - np.arange(4) * 10.0, 3857, {"values": values}, size=2
    )
    out = raster["values"]
    assert bounds == pytest.approx([0, 0, 40, 40])
    assert out["counts"].sum() == 15
    assert np.nansum(out["values"] * out["counts"]) == pytest.approx(np.nansum(values))


def test_empty_support_stays_missing_and_shape_mismatch_rejected():
    _, raster = aggregate_display([5, 15], [15, 5], 3857, {"v": np.full((2, 2), np.nan)}, 4)
    assert np.isnan(raster["v"]["values"]).all()
    assert raster["v"]["counts"].sum() == 0
    assert summarize_values([np.nan, np.inf])["mean"] is None
    with pytest.raises(ValueError, match="shapes"):
        aggregate_display([5, 15], [15, 5], 3857, {"v": np.ones((3, 3))})
