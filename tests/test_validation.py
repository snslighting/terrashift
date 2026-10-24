"""Synthetic station rows; diagnostics only."""

import numpy as np
import pytest

from terrashift.validation import reference_sweep, residual_structure


def rows(residuals, lons, lats):
    return [
        {"station": f"S{i}", "residual_mm": r, "longitude": lo, "latitude": la}
        for i, (r, lo, la) in enumerate(zip(residuals, lons, lats, strict=True))
    ]


def test_common_offset_is_identified_without_changing_inputs():
    rng = np.random.default_rng(1)
    lons, lats = rng.uniform(-121, -120, 12), rng.uniform(36, 37, 12)
    data = rows(40 + rng.normal(0, 3, 12), lons, lats)
    result = residual_structure(data)
    assert result["mean_residual_mm"] == pytest.approx(40, abs=3)
    assert result["loo_offset_rmse_mm"] < 0.2 * result["rmse_mm"]
    assert "offset explains" in result["interpretation"] and result["applied_to_maps"] is False


def test_plane_is_identified_by_leave_one_out():
    rng = np.random.default_rng(2)
    lons, lats = rng.uniform(-121, -120, 15), rng.uniform(36, 37, 15)
    data = rows(80 * (lats - 36.5) + rng.normal(0, 1, 15), lons, lats)
    result = residual_structure(data)
    assert result["loo_plane_rmse_mm"] < 0.2 * result["loo_offset_rmse_mm"]
    assert result["plane_mm_per_degree"]["latitude"] == pytest.approx(80, rel=0.1)


def test_too_few_stations_and_reference_sweep():
    assert residual_structure(rows([1, 2], [0, 1], [0, 1]))["status"] == "INSUFFICIENT_STATIONS"
    sweep = reference_sweep(rows([10, 12, 50], [0, 1, 2], [0, 1, 2]))
    assert sweep[0]["reference"] in {"S0", "S1"} and sweep[0]["comparisons"] == 2
    assert sweep[-1]["reference"] == "S2"
    assert reference_sweep([{"station": "x", "residual_mm": None}]) == []
