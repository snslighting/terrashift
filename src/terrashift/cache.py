import hashlib
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import earthaccess
from filelock import FileLock

from .auth import login
from .config import CACHE
from .inspection import check_container


def digest(path, algorithm="sha256"):
    h = hashlib.new(algorithm)
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def download(result, cache=CACHE, *, bounded_transfer=False):
    """Atomic cache, NASA checksum verification, and local integrity checking on reuse."""
    granule = result["umm"]["GranuleUR"]
    key = hashlib.sha256(granule.encode()).hexdigest()
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    entry = cache / key
    entry.mkdir(exist_ok=True)
    with FileLock(str(entry / "download.lock"), timeout=300):
        manifest_path = entry / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            name = manifest["file"]
            if Path(name).name != name or "/" in name or "\\" in name:
                raise ValueError("Unsafe cache manifest filename.")
            target = entry / name
            if target.is_file() and digest(target) == manifest["sha256"]:
                check_container(target)
                return target
        login()
        links = [
            u
            for u in result.data_links(access="external")
            if urlparse(u).scheme == "https" and Path(urlparse(u).path).name == granule + ".h5"
        ]
        if len(links) != 1:
            raise ValueError("Expected exactly one HTTPS HDF5 science asset for this granule.")
        with tempfile.TemporaryDirectory(prefix="partial-", dir=entry) as stage:
            if bounded_transfer:
                from .transfer import download_ranges

                files = download_ranges(links, local_path=stage, threads=1)
            else:
                files = earthaccess.download(links, local_path=stage, threads=1)
            if len(files) != 1:
                raise RuntimeError("Incomplete download: expected one science file.")
            source = Path(files[0]).resolve()
            if not source.is_relative_to(Path(stage).resolve()):
                raise RuntimeError("Downloader returned a file outside its staging directory.")
            archive = result["umm"].get("DataGranule", {}).get("ArchiveAndDistributionInformation", [])
            assets = [a for a in archive if a.get("Name") == source.name]
            if len(assets) != 1:
                raise ValueError("Missing unique NASA archive metadata for science asset.")
            asset = assets[0]
            if source.stat().st_size != asset.get("SizeInBytes"):
                raise ValueError("Download size does not match NASA catalog metadata.")
            checksum = asset.get("Checksum", {})
            algorithm = checksum.get("Algorithm", "").lower().replace("-", "")
            if algorithm not in ("md5", "sha256", "sha512", "sha1"):
                raise ValueError("NASA checksum absent or unsupported; cannot accept download.")
            if digest(source, algorithm) != checksum.get("Value", "").lower():
                raise ValueError("Download checksum does not match NASA metadata.")
            check_container(source)
            manifest = {
                "granule": granule,
                "file": source.name,
                "bytes": source.stat().st_size,
                "sha256": digest(source),
                "nasa_checksum": checksum,
                "scientific_validation": "pending",
            }
            target = entry / source.name
            os.replace(source, target)
            pending = entry / "manifest.json.tmp"
            pending.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            os.replace(pending, manifest_path)
            return target
