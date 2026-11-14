"""Tests for scripts/check_preview_alignment.py (synthetic images, no network)."""

import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest

_SPEC = importlib.util.spec_from_file_location(
    "check_preview_alignment", Path(__file__).resolve().parents[1] / "scripts" / "check_preview_alignment.py"
)
align = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(align)


def scene(h=120, w=160, margin=10):
    """Grey land, darker water, black no-data margin. Water is inside the scene, not at the border."""
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 3] = 255
    rgba[margin:-margin, margin:-margin, :3] = 150
    rgba[margin : h // 2, margin:-margin, :3] = 30  # sea in the north half
    return rgba


def test_no_data_margin_is_masked_but_dark_water_is_kept():
    rgba = scene()
    rgba[40:50, 40:50, :3] = 2  # near-black lake inside the scene: kept, as in browse.ts
    valid, extent = align.mask_no_data(rgba)
    assert extent == (10, 149, 10, 109)
    assert valid[45, 45]
    assert not valid[0, 0]


def test_ring_bounds_unwraps_the_dateline():
    assert align.ring_bounds([(179.0, -16.0), (-179.0, -17.0)]) == (179.0, -17.0, 181.0, -16.0)


def test_place_image_matches_the_footprint_box_to_the_valid_data():
    corners = align.place_image((10, 19, 10, 19), 30, 30, (0.0, 0.0, 1.0, 1.0))
    assert corners[0] == pytest.approx((-1.0, 2.0))
    assert corners[2] == pytest.approx((2.0, -1.0))


def test_lonlat_to_pixel_follows_the_maps_mercator_stretch():
    corners = [(0.0, 64.0), (2.0, 64.0), (2.0, 62.0), (0.0, 62.0)]
    px, py = align.lonlat_to_pixel(np.array([1.0, 0.0]), np.array([63.0, 64.0]), corners, 100, 100)
    assert px == pytest.approx([50.0, 0.0], abs=1e-6)
    # Mercator stretches 63-64 degrees more than 62-63, so 63 degrees sits below the middle.
    assert 50.5 < py[0] < 51.5
    assert py[1] == pytest.approx(0.0, abs=1e-6)


def test_edge_shift_recovers_a_known_offset():
    rgba = scene()
    rgba[10:-10, 10:40, :3] = 30  # a strip of sea along the west too: the coast turns a corner
    valid, _ = align.mask_no_data(rgba)
    brightness = rgba[..., :3].mean(axis=-1)
    # Radar coast: row 59/60 (north) and column 39/40 (west). Reference drawn 3 px north and 3 px west.
    px = np.concatenate([np.arange(40, 140, dtype=float), np.full(40, 36.5)])
    py = np.concatenate([np.full(100, 56.5), np.arange(60, 100, dtype=float)])
    dx, dy, _, _, contrast = align.edge_shift(brightness, valid, px, py, radius=6)
    # The radar edge lies between two pixels, so 3 px comes back as 3 or 4 after rounding.
    assert 2 <= dx <= 4 and 2 <= dy <= 4
    assert contrast > 1.5


def test_place_native_chooses_utm_for_a_utm_shaped_image():
    from pyproj import Transformer

    libya = [(14.5703, 31.94338), (13.88274, 34.00551), (11.26719, 33.34687), (12.0066, 31.29975)]
    fwd = Transformer.from_crs(4326, 32633, always_xy=True)
    x, y = fwd.transform([p[0] for p in libya], [p[1] for p in libya])
    w = round((max(x) - min(x)) / 200)
    h = round((max(y) - min(y)) / 200)
    corners, grid, miss = align.place_native((20, 20 + w - 1, 20, 20 + h - 1), w + 40, h + 40, libya)
    assert grid == "UTM 33N"
    assert miss < 0.005
    # Image corners are outside the footprint box by the 20 px margin (about 4 km).
    assert corners[0][0] < 11.26719
    assert not math.isclose(corners[0][1], corners[1][1], abs_tol=1e-3)  # turned against north
