"""Synthetic arithmetic tests, not real displacement validation."""

import numpy as np
import pytest

from terrashift.diagnostics import correction_stages, summarize_stages


def test_stage_common_support_and_tide_sign():
    layers = dict(
        zip(
            [
                "unwrappedPhase",
                "ionospherePhaseScreen",
                "wetTroposphericPhaseScreen",
                "hydrostaticTroposphericPhaseScreen",
                "slantRangeSolidEarthTidesPhase",
            ],
            [np.full((6, 6), v, dtype=float) for v in (20, 2, 3, 4, 5)],
            strict=True,
        )
    )
    layers["slantRangeSolidEarthTidesPhase"][0, 0] = np.nan
    stages = correction_stages(layers, processor_version="0.25.16", specification_version="1.5.0")
    assert [a[1, 1] for a in stages.values()] == [20, 18, 15, 11, 16]
    assert all(np.isnan(a[0, 0]) for a in stages.values())
    result, mask = summarize_stages(stages, np.ones((6, 6), bool), np.ones((6, 6)))
    assert result["pixels"] == mask.sum() == 35


def test_component_lock_does_not_select_larger_disconnected_region():
    components = np.ones((10, 10))
    components[:2] = 2
    result, _ = summarize_stages(
        {"raw": np.zeros((10, 10))}, np.ones((10, 10), bool), components, component=2
    )
    assert result == {"pixels": 20, "component": 2, "status": "INSUFFICIENT_SUPPORT"}


def test_cumulative_median_is_not_sum_of_medians():
    raw = np.tile([0.0, 0.0, 100.0], (10, 1))
    correction = np.tile([0.0, 100.0, 100.0], (10, 1))
    result, _ = summarize_stages(
        {"raw": raw, "corrected": raw - correction}, np.ones(raw.shape, bool), np.ones(raw.shape)
    )
    assert result["median_phase_rad"]["corrected"] == 0
    assert np.median(raw) - np.median(correction) == -100
    with pytest.raises(ValueError, match="grids"):
        summarize_stages({"raw": raw[:, :2]}, np.ones(raw.shape, bool), np.ones(raw.shape))
