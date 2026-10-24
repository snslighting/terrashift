import numpy as np
import pytest

from terrashift.timeseries import invert_network


def test_redundant_network_with_correlated_observations():
    result = invert_network(
        ["2026-01-01", "2026-01-13", "2026-01-25"],
        [[0, 1], [1, 2], [0, 2]],
        [3, 5, 8],
        [[2, 0.5, 0], [0.5, 3, 0.5], [0, 0.5, 2]],
    )
    np.testing.assert_allclose(result["relative_los_mm"], [0, 3, 8])
    np.testing.assert_allclose(result["pair_residual_mm"], 0, atol=1e-12)
    assert result["degrees_of_freedom"] == 1
    assert result["annual_velocity_mm_per_year"] is None


def test_closure_error_is_reported_not_erased():
    result = invert_network(
        ["2026-01-01", "2026-01-13", "2026-01-25"], [[0, 1], [1, 2], [0, 2]], [3, 5, 11], np.eye(3)
    )
    assert result["chi_square"] == pytest.approx(3)
    np.testing.assert_allclose(result["pair_residual_mm"], [-1, -1, 1])


def test_disconnected_dense_subnetwork_rejected():
    with pytest.raises(ValueError, match="Disconnected"):
        invert_network(
            ["2026-01-01", "2026-01-13", "2026-01-25", "2026-02-06", "2026-02-18"],
            [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]],
            np.zeros(6),
            np.eye(6),
        )


def test_indefinite_covariance_rejected():
    with pytest.raises(ValueError, match="positive definite"):
        invert_network(
            ["2026-01-01", "2026-01-13", "2026-01-25"],
            [[0, 1], [1, 2], [0, 2]],
            [0, 0, 0],
            [[1, 2, 0], [2, 1, 0], [0, 0, 1]],
        )
