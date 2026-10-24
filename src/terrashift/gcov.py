"""NISAR L2 GCOV (geocoded backscatter) subset reader for flood, wetland and fire change.

GCOV stores geocoded, terrain-corrected backscatter power on a projected grid.
This reader follows the same rule as the GUNW audit: it inspects the actual
file and refuses layouts it has not been told about, instead of guessing. Run
`terrashift inspect FILE.h5` on the first downloaded GCOV and confirm the paths
below before trusting results.
"""

import h5py
import numpy as np

from .inspection import json_value
from .quality import finite_data, subset_window

IDENT = "/science/LSAR/identification"
GRID = "/science/LSAR/GCOV/grids/frequencyA"
TERMS = ("HHHH", "VVVV", "HVHV", "VHVH")
COLLECTION = "NISAR_L2_GCOV_PROVISIONAL_V1"


def available_terms(path):
    with h5py.File(path, "r") as f:
        if GRID not in f:
            raise ValueError("Missing GCOV frequencyA grid; inspect this file before processing.")
        return [t for t in TERMS if t in f[GRID]]


def read_backscatter(path, bbox, term="HHHH"):
    """Return metadata and a linear-power subset for one polarization term."""
    if term not in TERMS:
        raise ValueError(f"Unknown GCOV covariance term: {term}")
    with h5py.File(path, "r") as f:
        ident = {k: json_value(v[()]) for k, v in f[IDENT].items() if isinstance(v, h5py.Dataset)}
        if ident.get("productType") != "GCOV" or ident.get("missionId") != "NISAR":
            raise ValueError("Not a NISAR GCOV product.")
        if GRID + "/" + term not in f:
            raise ValueError(f"Term {term} absent; available: {available_terms(path)}")
        x = f[GRID + "/xCoordinates"][()]
        y = f[GRID + "/yCoordinates"][()]
        epsg = int(f[GRID + "/projection"][()])
        window, inside, xx, yy = subset_window(x, y, epsg, bbox)
        power = finite_data(f[GRID + "/" + term], window)
        power[~inside] = np.nan
        power[power <= 0] = np.nan
        mask_description = None
        if GRID + "/mask" in f:
            mask_description = json_value(f[GRID + "/mask"].attrs.get("description"))
        return {
            "granule": ident.get("granuleId"),
            "start": ident.get("zeroDopplerStartTime"),
            "track": ident.get("trackNumber"),
            "frame": ident.get("frameNumber"),
            "orbit": ident.get("orbitPassDirection"),
            "epsg": epsg,
            "term": term,
            "units": json_value(f[GRID + "/" + term].attrs.get("units")),
            "mask_description": mask_description,
            "mask_applied": False,
            "x": xx[0],
            "y": yy[:, 0],
            "power": power,
        }


def same_grid(a, b):
    """True when two subsets can be differenced pixel by pixel without resampling."""
    return (
        a["epsg"] == b["epsg"]
        and a["track"] == b["track"]
        and a["frame"] == b["frame"]
        and np.array_equal(a["x"], b["x"])
        and np.array_equal(a["y"], b["y"])
    )
