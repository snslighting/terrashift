"""Verify the shipped real export; passing these tests does not certify displacement."""

import json

import numpy as np
import pytest

from terrashift.config import ROOT

EVIDENCE = ROOT / "frontend/public/evidence"


def grid(pair, layer):
    entry = pair["layers"][layer]
    size = pair["grid"]["size"]
    raw = np.frombuffer((EVIDENCE / entry["file"]).read_bytes(), dtype="<i2")
    dtype = "u1" if entry["count_type"] == "uint8" else "<u2"
    counts = np.frombuffer((EVIDENCE / entry["counts"]).read_bytes(), dtype=dtype)
    assert raw.size == counts.size == size * size
    return np.where(raw == entry["nodata"], np.nan, raw * entry["step"]), counts


@pytest.fixture(scope="module")
def catalog():
    return json.loads((EVIDENCE / "catalog.json").read_text())


def test_catalog_lists_real_products_and_change_types(catalog):
    assert catalog["version"] == 3
    ids = {c["id"] for c in catalog["cases"]}
    assert {"san-joaquin", "venezuela-2026", "flores-2026"} <= ids
    for case in catalog["cases"]:
        assert set(case["change_types"]) <= set(catalog["change_types"])
        assert case["findings"] and case["limits"]
        for pair in case["pairs"]:
            assert pair["granule"].startswith("NISAR_L2_PR_")
            assert pair["before"] < pair["after"]
            assert pair["source_hashes"]


def test_grids_match_their_native_support_and_never_fill_gaps(catalog):
    for case in catalog["cases"]:
        for pair in case["pairs"]:
            for layer, entry in pair["layers"].items():
                values, counts = grid(pair, layer)
                assert np.isnan(values).tolist() == (counts == 0).tolist(), layer
                assert int(counts.sum()) == entry["native_statistics"]["count"], layer
                if layer == "disturbance":
                    assert np.nanmin(values) >= 0 and np.nanmax(values) <= 1


def test_failed_comparisons_are_preserved_unchanged(catalog):
    case = next(c for c in catalog["cases"] if c["id"] == "san-joaquin")
    rmse = [p["comparison"]["rmse_mm"] for p in case["pairs"][:2]]
    assert rmse == pytest.approx([28.39, 51.06], abs=0.01)
    for pair in case["pairs"]:
        comparison = pair["comparison"]
        assert comparison["validation"] == "FAILED" and comparison["reference"] == "P287"
        rows = [s for s in comparison["stations"] if s.get("residual_mm") is not None]
        assert len(rows) == comparison["count"]
        assert np.sqrt(np.mean([s["residual_mm"] ** 2 for s in rows])) == pytest.approx(comparison["rmse_mm"])
        assert comparison["structure"]["applied_to_maps"] is False


def test_coherence_change_uses_common_support(catalog):
    case = next(c for c in catalog["cases"] if c["id"] == "san-joaquin")
    change = case["pairs"][1]["layers"]["coherence_change"]
    assert change["from_pair"] == case["pairs"][0]["id"]
    values, _ = grid(case["pairs"][1], "coherence_change")
    assert np.nanmax(np.abs(values)) <= 1
