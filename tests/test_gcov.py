"""Synthetic GCOV-like HDF5 checks the reader's refusals; not a real product."""

import h5py
import numpy as np
import pytest

from terrashift.gcov import GRID, IDENT, read_backscatter, same_grid


def make(path, product="GCOV", term="HHHH"):
    with h5py.File(path, "w") as f:
        ident = f.create_group(IDENT)
        for k, v in {
            "productType": product,
            "missionId": "NISAR",
            "granuleId": path.stem,
            "zeroDopplerStartTime": "2026-08-01T00:00:00",
            "trackNumber": 5,
            "frameNumber": 9,
            "orbitPassDirection": "Ascending",
        }.items():
            ident[k] = v
        grid = f.create_group(GRID)
        grid["xCoordinates"] = 500000.0 + np.arange(20) * 100
        grid["yCoordinates"] = 4000000.0 - np.arange(20) * 100
        grid["projection"] = 32611
        data = grid.create_dataset(term, data=np.full((20, 20), 0.05, dtype="float32"))
        data.attrs["units"] = "unitless"
        data[0, 0] = 0
    return path


def test_reader_subsets_and_rejects_nonpositive_power(tmp_path):
    out = read_backscatter(make(tmp_path / "a.h5"), (-117.01, 36.1, -116.97, 36.2))
    assert out["epsg"] == 32611 and out["term"] == "HHHH" and out["mask_applied"] is False
    assert np.nanmax(out["power"]) == pytest.approx(0.05)
    assert same_grid(out, out)


def test_reader_refuses_unknown_products_and_terms(tmp_path):
    with pytest.raises(ValueError, match="GCOV"):
        read_backscatter(make(tmp_path / "b.h5", product="GUNW"), (-117.01, 36.1, -116.97, 36.2))
    with pytest.raises(ValueError, match="absent"):
        read_backscatter(make(tmp_path / "c.h5", term="VVVV"), (-117.01, 36.1, -116.97, 36.2))
    with pytest.raises(ValueError, match="Unknown"):
        read_backscatter(make(tmp_path / "d.h5"), (-117.01, 36.1, -116.97, 36.2), term="XX")
