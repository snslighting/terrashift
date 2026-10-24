"""Synthetic fixtures test arithmetic only; never published as observations."""

import numpy as np
import pytest

from terrashift.change import (
    backscatter_change_db,
    chain_series,
    classify_backscatter_change,
    coherence_change,
    display_support,
    disturbance,
)


def layers(coherence, components=None):
    coherence = np.asarray(coherence, dtype=float)
    return {
        "coherenceMagnitude": coherence,
        "connectedComponents": np.ones_like(coherence) if components is None else np.asarray(components, float),
        "inside": np.ones(coherence.shape, dtype=bool),
        "x": np.arange(coherence.shape[1]),
        "y": -np.arange(coherence.shape[0]),
    }


def test_disturbance_excludes_water_and_invalid_coherence():
    result = disturbance(layers([[0.2, 0.9], [np.nan, 1.4]], components=[[1, 0], [1, 1]]))
    assert result[0, 0] == pytest.approx(0.8)
    assert np.isnan(result[0, 1]) and np.isnan(result[1, 0]) and np.isnan(result[1, 1])
    assert display_support(layers([[0.5]])).all()


def test_coherence_change_requires_common_support_and_identical_grid():
    first = layers([[0.9, 0.8], [0.7, np.nan]])
    second = layers([[0.4, 0.8], [np.nan, 0.5]])
    change = coherence_change(first, second)
    assert change[0, 0] == pytest.approx(-0.5) and change[0, 1] == pytest.approx(0)
    assert np.isnan(change[1, 0]) and np.isnan(change[1, 1])
    shifted = {**second, "x": second["x"] + 1}
    with pytest.raises(ValueError, match="coordinates"):
        coherence_change(first, shifted)


def test_backscatter_log_ratio_and_classes():
    delta = backscatter_change_db([[1.0, 0.1], [0.0, np.nan]], [[0.1, 0.1], [1.0, 1.0]])
    assert delta[0, 0] == pytest.approx(-10) and delta[0, 1] == pytest.approx(0)
    assert np.isnan(delta[1, 0]) and np.isnan(delta[1, 1])
    classes = classify_backscatter_change(np.array([-5.0, 0.5, 4.0, np.nan]))
    assert classes[:3].tolist() == [-1, 0, 1] and np.isnan(classes[3])
    with pytest.raises(ValueError):
        classify_backscatter_change(delta, threshold_db=0)


def test_chain_accumulates_and_refuses_gaps_or_missing_values():
    chain = chain_series([("2026-07-11", "2026-07-23", 2.0), ("2026-06-29", "2026-07-11", 1.0)])
    assert chain["dates"] == ["2026-06-29", "2026-07-11", "2026-07-23"]
    assert chain["cumulative_mm"] == [0.0, 1.0, 3.0]
    assert chain_series([("a", "b", 1.0), ("b", "c", None)])["cumulative_mm"] is None
    with pytest.raises(ValueError, match="chain"):
        chain_series([("a", "b", 1.0), ("c", "d", 1.0)])
