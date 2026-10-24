"""Verify cached real science files against saved NASA checksums."""

import json
from pathlib import Path

from terrashift.cache import digest
from terrashift.inspection import check_container

root = Path(__file__).resolve().parents[1]
results = []
for path in (root / "data/cache").glob("*/manifest.json"):
    m = json.loads(path.read_text())
    f = path.parent / m["file"]
    if f.stat().st_size != m["bytes"] or digest(f) != m["sha256"]:
        raise ValueError("Local cache integrity failure")
    checksum = m["nasa_checksum"]
    if digest(f, checksum["Algorithm"].lower().replace("-", "")) != checksum["Value"].lower():
        raise ValueError("NASA checksum mismatch")
    check_container(f)
    results.append(
        {"granule": m["granule"], "bytes": m["bytes"], "nasa_checksum_verified": True, "sha256": m["sha256"]}
    )
(root / "data/catalog/download-verification.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
