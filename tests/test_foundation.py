"""Synthetic unit fixtures ONLY. These tests do not validate real-world displacement."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import h5py
import numpy as np
import pytest

from terrashift import auth, cache, catalog, cli
from terrashift.inspection import inspect_file
from terrashift.screening import brackets_event, pair_metadata


@pytest.mark.parametrize("bbox", [(0, 1, 0, 2), (180, 0, -180, 1), (0, -91, 1, 1), (0, 0, float("nan"), 1)])
def test_invalid_aoi(bbox):
    with pytest.raises(ValueError):
        catalog.Query(bbox, "2026-01-01", "2026-02-01")


def test_reversed_dates():
    with pytest.raises(ValueError):
        catalog.Query((0, 0, 1, 1), "2026-02-01", "2026-01-01")


def test_public_search_filters_and_bound(monkeypatch):
    captured = {}

    def fake(**kw):
        captured.update(kw)
        return list(range(7))

    monkeypatch.setattr(catalog.earthaccess, "search_data", fake)
    q = catalog.Query((0, 0, 1, 1), "2026-01-01", "2026-02-01", 3, 42, 70, "D")
    assert catalog.search(q) == [0, 1, 2]
    assert captured["granule_name"] == "NISAR_L2_PR_GUNW_*_042_D_070_*"
    assert captured["short_name"] == catalog.COLLECTION


@pytest.fixture
def no_credentials(monkeypatch, tmp_path):
    for key in ("EARTHDATA_TOKEN", "EARTHDATA_USERNAME", "EARTHDATA_PASSWORD", "NETRC"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(auth, "configure", lambda: None)
    monkeypatch.setattr(auth, "ROOT", tmp_path)
    monkeypatch.setattr(Path, "home", lambda: tmp_path)


def test_missing_auth_is_noninteractive(no_credentials, monkeypatch):
    monkeypatch.setattr(auth.earthaccess, "login", lambda **kw: pytest.fail("must not prompt"))
    with pytest.raises(auth.AuthenticationRequired, match="missing"):
        auth.login()


def test_token_strategy(no_credentials, monkeypatch):
    monkeypatch.setenv("EARTHDATA_TOKEN", "UNIT_TEST_ONLY_NOT_A_TOKEN")
    assert auth.credential_strategy() == "environment"


def test_netrc_strategy(no_credentials, tmp_path):
    (tmp_path / ".netrc").write_text("machine urs.earthdata.nasa.gov login test password test")
    assert auth.credential_strategy() == "netrc"


def test_auth_error_redacted(no_credentials, monkeypatch):
    monkeypatch.setenv("EARTHDATA_TOKEN", "UNIT_TEST_ONLY_NOT_A_TOKEN")

    def reject(**kw):
        raise RuntimeError("private-token-do-not-print")

    monkeypatch.setattr(auth.earthaccess, "login", reject)
    with pytest.raises(auth.AuthenticationRequired) as err:
        auth.login()
    assert "private-token" not in str(err.value)


def test_interactive_persists_only_project(no_credentials, monkeypatch, tmp_path):
    monkeypatch.setattr(
        auth.earthaccess,
        "login",
        lambda **kw: SimpleNamespace(authenticated=True, username="UNIT_TEST", password="UNIT_TEST"),
    )
    auth.login(interactive=True)
    assert (tmp_path / ".netrc").is_file()
    assert not (tmp_path / ".urs_cookies").exists()


def test_inspector_discovers_paths_and_units(tmp_path):
    p = tmp_path / "SYNTHETIC_UNIT_FIXTURE.h5"
    with h5py.File(p, "w") as f:
        d = f.create_dataset("science/arbitrary/phase", data=np.ones((100, 100)))
        d.attrs["units"] = "radians"
        f.create_dataset("science/meta/name", data=b"DEVELOPMENT_ONLY")
    result = inspect_file(p)
    layer = next(d for d in result["datasets"] if d["path"].endswith("phase"))
    assert layer["shape"] == [100, 100]
    assert layer["attributes"]["units"] == "radians"
    assert "value" not in layer
    assert result["scientific_status"] == "INSPECTED_ONLY_NOT_VALIDATED"
    json.dumps(result, allow_nan=False)


def test_reject_html(tmp_path):
    p = tmp_path / "bad.h5"
    p.write_text("<html>sign in</html>")
    with pytest.raises(ValueError, match="Not an HDF5"):
        inspect_file(p)


class SyntheticGranule(dict):
    def data_links(self, access):
        return ["https://example.invalid/UNIT_TEST.h5", "https://example.invalid/UNIT_TEST_QA_STATS.h5"]


@pytest.fixture
def synthetic_granule(tmp_path):
    p = tmp_path / "source.h5"
    with h5py.File(p, "w") as f:
        f.create_group("science")
    data = p.read_bytes()
    return SyntheticGranule(
        umm={
            "GranuleUR": "UNIT_TEST",
            "DataGranule": {
                "ArchiveAndDistributionInformation": [
                    {
                        "Name": "UNIT_TEST.h5",
                        "SizeInBytes": len(data),
                        "Checksum": {"Algorithm": "MD5", "Value": hashlib.md5(data).hexdigest()},
                    }
                ]
            },
        }
    ), data


def test_cache_reuses_verified_download_and_repairs_corruption(tmp_path, monkeypatch, synthetic_granule):
    granule, data = synthetic_granule
    calls = []
    monkeypatch.setattr(cache, "login", lambda: None)

    def fake_download(links, local_path, threads):
        assert links == ["https://example.invalid/UNIT_TEST.h5"]
        calls.append(1)
        p = Path(local_path) / "UNIT_TEST.h5"
        p.write_bytes(data)
        return [p]

    monkeypatch.setattr(cache.earthaccess, "download", fake_download)
    root = tmp_path / "cache"
    target = cache.download(granule, root)
    assert cache.download(granule, root) == target
    assert len(calls) == 1
    target.write_bytes(b"corrupted")
    assert cache.download(granule, root).read_bytes() == data
    assert len(calls) == 2


@pytest.mark.parametrize("failure", ["checksum", "size", "incomplete"])
def test_cache_rejects_invalid_downloads(tmp_path, monkeypatch, synthetic_granule, failure):
    granule, data = synthetic_granule
    asset = granule["umm"]["DataGranule"]["ArchiveAndDistributionInformation"][0]
    if failure == "checksum":
        asset["Checksum"]["Value"] = "0" * 32
    elif failure == "size":
        asset["SizeInBytes"] = 1
    monkeypatch.setattr(cache, "login", lambda: None)

    def fake(links, local_path, threads):
        p = Path(local_path) / "UNIT_TEST.h5"
        p.write_bytes(data)
        return [] if failure == "incomplete" else [p]

    monkeypatch.setattr(cache.earthaccess, "download", fake)
    with pytest.raises((ValueError, RuntimeError)):
        cache.download(granule, tmp_path / "cache")
    assert not list((tmp_path / "cache").rglob("manifest.json"))


@pytest.fixture
def umm():
    vals = {
        "PRODUCT_TYPE": "GUNW",
        "REFERENCE_ZERO_DOPPLER_START_TIME": "2026-08-12T21:40:30Z",
        "SECONDARY_ZERO_DOPPLER_START_TIME": "2026-08-24T21:40:29Z",
        "TRACK_NUMBER": "168",
        "FRAME_NUMBER": "173",
        "ASCENDING_DESCENDING": "ASCENDING",
        "PRODUCT_VERSION": "1.0.11",
    }
    return {
        "CollectionReference": {"ShortName": catalog.COLLECTION},
        "AdditionalAttributes": [{"Name": k, "Values": [v]} for k, v in vals.items()],
    }


def test_pair_screening(umm):
    assert pair_metadata(umm)["track"] == 168
    assert brackets_event(umm, "2026-08-14T00:00:00Z")
    assert not brackets_event(umm, "2026-09-01T00:00:00Z")
    assert not pair_metadata(umm)["science_validated"]


def test_wrong_collection_rejected(umm):
    umm["CollectionReference"]["ShortName"] = "SYNTHETIC_WRONG_COLLECTION"
    with pytest.raises(ValueError):
        pair_metadata(umm)


def test_output_cannot_escape_project(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "ROOT", tmp_path / "project")
    with pytest.raises(ValueError):
        cli.save_json(tmp_path / "outside.json", {})


def test_named_datatype_and_complex_nodata(tmp_path):
    p = tmp_path / "SYNTHETIC_TYPES.h5"
    with h5py.File(p, "w") as f:
        f["complex_type"] = np.dtype("complex64")
        d = f.create_dataset("science/complex", data=np.array([complex(float("nan"), 1)], dtype="complex64"))
        d.attrs["_FillValue"] = complex(float("nan"), float("nan"))
    report = inspect_file(p)
    assert report["datatypes"]
    json.dumps(report, allow_nan=False)


def test_native_mask_bits():
    from terrashift.quality import quality_bits

    bits = quality_bits(
        np.array(
            [11, 111, 10, 1, 255, 11 | (1 << 8), 11 | (1 << 16), 11 | (1 << 24), 11 | (1 << 25)],
            dtype="uint32",
        )
    )
    keep = np.logical_and.reduce(list(bits.values()))
    assert keep.tolist() == [True, False, False, False, False, False, False, False, False]


def test_coordinate_transform_and_true_aoi_clip():
    from pyproj import Transformer

    from terrashift.quality import subset_window

    cx, cy = Transformer.from_crs(4326, 32751, always_xy=True).transform(121.5, -8.5)
    x = np.arange(cx - 5000, cx + 5000, 80)
    y = np.arange(cy + 5000, cy - 5000, -80)
    _window, inside, xx, yy = subset_window(x, y, 32751, (121.49, -8.51, 121.51, -8.49))
    lon, lat = Transformer.from_crs(32751, 4326, always_xy=True).transform(xx, yy)
    assert inside.any()
    assert np.all((lon[inside] >= 121.49) & (lon[inside] <= 121.51))
    assert np.all((lat[inside] >= -8.51) & (lat[inside] <= -8.49))
    with pytest.raises(ValueError, match="outside"):
        subset_window(x, y, 32751, (-120, 30, -119, 31))


def test_nodata_propagation(tmp_path):
    from terrashift.quality import finite_data

    p = tmp_path / "SYNTHETIC_NODATA.h5"
    with h5py.File(p, "w") as f:
        d = f.create_dataset("x", data=np.array([1.0, -999.0, np.inf]))
        d.attrs["_FillValue"] = -999.0
        a = finite_data(d, slice(None))
    assert a[0] == 1 and np.isnan(a[1:]).all()


def test_cube_interpolation_no_extrapolation(tmp_path):
    from terrashift.quality import RADAR, interpolate_cube

    p = tmp_path / "SYNTHETIC_CUBE.h5"
    z = np.array([0.0, 100.0])
    y = np.array([10.0, 0.0])
    x = np.array([0.0, 10.0])
    zz, yy, xx = np.meshgrid(z, y, x, indexing="ij")
    with h5py.File(p, "w") as f:
        g = f.create_group(RADAR)
        for name, a in [
            ("heightAboveEllipsoid", z),
            ("yCoordinates", y),
            ("xCoordinates", x),
            ("linear", 2 * zz + 3 * yy + xx),
        ]:
            g.create_dataset(name, data=a)
    out = interpolate_cube(
        p, "linear", np.array([[5.0, 5.0]]), np.array([[5.0, 5.0]]), np.array([[50.0, 101.0]])
    )
    assert out[0, 0] == 120 and np.isnan(out[0, 1])
