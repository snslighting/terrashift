"""Offline API contract tests; synthetic metadata is confined to this file."""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from terrashift import api

client = TestClient(api.app)


@pytest.fixture(autouse=True)
def isolated_api(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "JOB_DB", tmp_path / "jobs.sqlite3")
    api.cache.clear()


@pytest.mark.parametrize("bounds", ["NaN,0,1,1", "0,0,0,1", "181,0,2,1", "0,2,1,1", "1,2"])
def test_invalid_area_rejected_before_network(bounds):
    assert (
        client.get(
            "/api/discovery", params={"bbox": bounds, "start": "2026-01-01", "end": "2026-02-01"}
        ).status_code
        == 422
    )


def test_dateline_is_split_and_no_data_is_not_fabricated(monkeypatch):
    queries = []

    def empty(url, params):
        queries.append(params)
        return {"items": [], "hits": 0}

    monkeypatch.setattr(api, "get_public", empty)
    r = client.get(
        "/api/discovery", params={"bbox": "179,-5,-179,5", "start": "2026-01-01", "end": "2026-02-01"}
    )
    assert r.status_code == 200
    assert r.json()["products"] == [] and r.json()["returned"] == 0
    assert len(queries) == 2
    assert queries[0]["bounding_box"] == "179.0,-5.0,180,5.0"
    assert queries[1]["bounding_box"] == "-180,-5.0,-179.0,5.0"


def test_polygon_and_reversed_dates_rejected(monkeypatch):
    monkeypatch.setattr(api, "get_public", lambda *a: pytest.fail("invalid query reached network"))
    params = {"bbox": "0,0,1,1", "start": "2026-01-01", "end": "2026-02-01"}
    for polygon in [{}, [[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [999, 1], [0, 0]]]:
        assert (
            client.get("/api/discovery", params={**params, "polygon": json.dumps(polygon)}).status_code == 422
        )
    assert client.get("/api/discovery", params={**params, "start": "2026-03-01"}).status_code == 422


def test_upstream_failure_is_sanitized_and_not_cached(monkeypatch):
    def fail(*a, **kw):
        raise httpx.ConnectError("private internal host detail")

    monkeypatch.setattr(api.httpx, "get", fail)
    r = client.get("/api/locations?q=Tashkent")
    assert r.status_code == 503
    assert "private" not in r.text and "Retry" in r.text
    assert not api.cache


def test_uncached_product_never_gets_fake_processing_job(monkeypatch):
    monkeypatch.setattr(api, "product", lambda _: {"cached_pair": None})
    r = client.post("/api/jobs", json={"product_id": "G123-TEST", "bbox": [0, 0, 1, 1]})
    assert r.status_code == 200 and r.json()["status"] == "processing_unavailable"
    assert "job_id" not in r.json() and not api.JOB_DB.exists()


def test_completed_job_retains_failed_validation_and_empty_values():
    import numpy as np

    pair = {
        "granule": "TEST_ONLY",
        "before": "2026-01-01",
        "after": "2026-01-13",
        "grid": {"size": 2, "bounds_mercator": [0, 0, 100, 100]},
        "layers": {"disturbance": {}, "los": {}},
        "comparison": {"validation": "FAILED"},
        "_arrays": {"disturbance": np.full((2, 2), np.nan), "los": np.full((2, 2), np.nan)},
    }
    api.crop_job("test-job", pair, [0, 0, 1, 1])
    r = client.get("/api/jobs/test-job").json()
    assert r["status"] == "completed"
    assert r["result"]["validation"] == "FAILED"
    assert r["result"]["total_uncertainty_mm"] is None
    assert r["result"]["disturbance"]["count"] == 0
    assert r["result"]["los"]["mean"] is None
    assert client.get("/api/jobs/missing").status_code == 404


def test_pair_without_independent_comparison_is_not_called_validated():
    import numpy as np

    pair = {
        "granule": "TEST_ONLY",
        "before": "2026-01-01",
        "after": "2026-01-13",
        "grid": {"size": 2, "bounds_mercator": [0, 0, 100, 100]},
        "layers": {"disturbance": {}},
        "comparison": None,
        "_arrays": {"disturbance": np.full((2, 2), 0.5)},
    }
    api.crop_job("no-gnss", pair, [0, 0, 1, 1])
    assert client.get("/api/jobs/no-gnss").json()["result"]["validation"] == "NO_INDEPENDENT_COMPARISON"


def test_interrupted_job_is_resumed_after_restart(monkeypatch):
    calls = []
    api.save_job("resume-me", "running", {"message": "x", "pair": "p-1", "bbox": [0, 0, 1, 1]})
    api.save_job("orphan", "queued", {"message": "x"})
    monkeypatch.setattr(api, "analysis", lambda pid: {"id": pid})
    monkeypatch.setattr(api.pool, "submit", lambda fn, *args: calls.append(args))
    api.resume_jobs()
    assert calls == [("resume-me", {"id": "p-1"}, [0, 0, 1, 1])]
    assert client.get("/api/jobs/orphan").json()["status"] == "failed"


def test_shipped_grids_are_served_and_names_are_restricted():
    first = api.research()["cases"][0]["pairs"][0]
    name = first["layers"]["disturbance"]["file"].split("/")[-1]
    r = client.get(f"/api/grids/{name}")
    assert r.status_code == 200 and len(r.content) == first["grid"]["size"] ** 2 * 2
    assert client.get("/api/grids/..%2Fcatalog.json").status_code == 404
    assert client.get(f"/api/analysis/{first['id']}").json()["granule"] == first["granule"]
    assert client.get("/api/cases").status_code == 200


def test_metadata_discovery_does_not_depend_on_local_science(monkeypatch):
    def missing():
        raise api.HTTPException(503, "missing export")

    monkeypatch.setattr(api, "research", missing)
    item = {
        "meta": {"concept-id": "G123-TEST"},
        "umm": {
            "GranuleUR": "TEST_ONLY",
            "AdditionalAttributes": [{"Name": "TRACK_NUMBER", "Values": ["42"]}],
        },
    }
    row = api.normalize(item)
    assert row["status"] == "processing_unavailable" and row["cached_pair"] is None
    assert row["cached_case"] is None
    assert row["geometry"] is None and row["before"] is None
    assert row["track"] == 42 and "G123-TEST.umm_json" in row["source_url"]
