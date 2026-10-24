"""Test GNSS arithmetic independently of satellite-derived displacement."""

from datetime import date

import numpy as np
import pytest

from terrashift.gnss import DailySolution, daily_difference, project_los, read_tenv3


def test_projection_uses_full_covariance():
    los = np.array([0.6, 0, 0.8])
    covariance = np.array([[4, 0, 1], [0, 9, 0], [1, 0, 16]]) * 1e-6
    displacement, sigma = project_los([0.01, 0.02, 0.03], covariance, los)
    assert displacement == pytest.approx(0.03)
    assert sigma**2 == pytest.approx(12.64e-6)
    with pytest.raises(ValueError, match="unit vector"):
        project_los([0, 0, 0], covariance, [1, 1, 1])


def test_pair_does_not_interpolate_across_missing_days():
    a = DailySolution("TEST", date(2026, 6, 13), np.zeros(3), np.eye(3), 10, -67, -67)
    b = DailySolution("TEST", date(2026, 6, 25), np.array([-0.46, 0, 0.03]), np.eye(3), 10, -67, -67)
    delta, cov = daily_difference([a, b], a.day, b.day)
    np.testing.assert_allclose(delta, [-0.46, 0, 0.03])
    np.testing.assert_allclose(cov, 2 * np.eye(3))
    with pytest.raises(ValueError, match="Missing"):
        daily_difference([a, b], date(2026, 6, 12), b.day)


def test_integer_coordinate_rollover_is_not_ground_motion(tmp_path):
    header = "site __MJD reflon _e0(m) __east(m) ____n0(m) _north(m) u0(m) ____up(m) sig_e(m) sig_n(m) sig_u(m) __corr_en __corr_eu __corr_nu _latitude(deg) _longitude(deg)"
    file = tmp_path / "test.tenv3"
    file.write_text(
        header
        + "\nTEST 61204 -67 100 .99 200 .1 800 .1 .001 .001 .004 0 0 0 10 -67\nTEST 61216 -67 101 .01 200 .1 800 .1 .001 .001 .004 0 0 0 10 -67\n"
    )
    data = read_tenv3(file)
    delta, _ = daily_difference(data, date(2026, 6, 13), date(2026, 6, 25))
    np.testing.assert_allclose(delta, [0.02, 0, 0], atol=1e-12)
    file.write_text(file.read_text() + file.read_text().splitlines()[-1] + "\n")
    with pytest.raises(ValueError, match="Duplicate"):
        read_tenv3(file)


def test_gnss_quality_detects_isolated_jump_without_radar_input():
    from datetime import timedelta

    from terrashift.gnss import daily_quality_diagnostic

    center = date(2026, 6, 29)
    series = [
        DailySolution(
            "TEST",
            center + timedelta(days=i),
            np.array([0.1 if i == 0 else 0, 0, 0]),
            np.eye(3) * 1e-6,
            0,
            0,
            0,
        )
        for i in range(-7, 8)
    ]
    result = daily_quality_diagnostic(series, center)
    assert result["status"] == "LARGE_ISOLATED_CHANGE_REQUIRES_REVIEW"
    assert result["component_scores"][0] == pytest.approx(100)
