"""Schema-neutral inspection: discovers actual HDF5 paths; does not infer displacement."""

from pathlib import Path

import h5py
import numpy as np


def json_value(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, np.ndarray):
        return json_value(value.tolist())
    if isinstance(value, np.generic):
        return json_value(value.item())
    if isinstance(value, (list, tuple)):
        return [json_value(v) for v in value]
    if isinstance(value, float) and not np.isfinite(value):
        return str(value)
    if isinstance(value, complex):
        return {"real": json_value(value.real), "imag": json_value(value.imag)}
    if isinstance(value, h5py.Reference):
        return "<HDF5 reference>"
    return value


def inspect_file(path):
    path = Path(path)
    if not h5py.is_hdf5(path):
        raise ValueError("Not an HDF5 product (possibly an incomplete download or login HTML).")
    report = {
        "file": path.name,
        "bytes": path.stat().st_size,
        "groups": [],
        "datatypes": [],
        "datasets": [],
        "scientific_status": "INSPECTED_ONLY_NOT_VALIDATED",
    }
    with h5py.File(path, "r") as h5:
        report["root_attributes"] = {k: json_value(v) for k, v in h5.attrs.items()}

        def visit(name, obj):
            if isinstance(obj, h5py.Group):
                report["groups"].append("/" + name)
                return
            if isinstance(obj, h5py.Datatype):
                report["datatypes"].append({"path": "/" + name, "dtype": str(obj.dtype)})
                return
            entry = {
                "path": "/" + name,
                "shape": list(obj.shape) if obj.shape is not None else None,
                "dtype": str(obj.dtype),
                "attributes": {k: json_value(v) for k, v in obj.attrs.items()},
                "dimensions": [dim.label for dim in obj.dims],
            }
            # Only small metadata, never pull full raster arrays into memory.
            if obj.size is not None and obj.size <= 16:
                entry["value"] = json_value(obj[()])
            report["datasets"].append(entry)

        h5.visititems(visit)
    return report


def check_container(path):
    """Reject HTML/truncated containers. This is NOT scientific quality validation."""
    with h5py.File(path, "r") as h5:
        if "science" not in h5:
            raise ValueError("Missing science group; not an accepted NISAR science container.")
