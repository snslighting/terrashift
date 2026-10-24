"""Check the tide sign by executing only the pinned production computation with controlled inputs.

This tests source arithmetic, not geophysical accuracy of the tide model.
"""

import ast
import hashlib
import json
from pathlib import Path

import numpy as np

root = Path(__file__).resolve().parents[1]
source = root / "work/production-solid_earth_tides.py"
if (
    hashlib.sha256(source.read_bytes()).hexdigest()
    != "9ae89925c411b6c5db89097d3119d572246e86a8672c96fa318822e68cd18763"
):
    raise ValueError("Source differs from reviewed ISCE3 v0.25.16 tide implementation.")
tree = ast.parse(source.read_text())
function = next(
    n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "compute_solid_earth_tides"
)
module = ast.Module(body=[function], type_ignores=[])
shape = (2, 1, 1)
zero = np.zeros(shape)
inc = np.full(shape, 40.0)
los_e = np.full(shape, 0.5)
los_n = np.full(shape, np.sqrt(np.sin(np.deg2rad(40)) ** 2 - 0.5**2))
wave = 0.24
params = (
    inc,
    los_e,
    los_n,
    np.array([0.0]),
    np.array([0.0]),
    np.array([0.0, 1000.0]),
    "reference",
    zero,
    zero,
    "secondary",
    zero,
    zero,
    4326,
    wave,
)
tide_ref = np.array([0.01, -0.02, 0.03])
tide_sec = np.array([-0.02, 0.01, 0.07])


def tides(epoch, *args):
    enu = tide_ref if epoch == "reference" else tide_sec
    return tuple(np.full(shape, v) for v in enu)


namespace = {
    "np": np,
    "_extract_params_from_gunw_hdf5": lambda _: params,
    "transform_xy_to_latlon": lambda epsg, x, y: (y, x, None),
    "calculate_solid_earth_tides": tides,
}
exec(compile(module, str(source), "exec"), namespace)  # noqa: S102 -- hash-pinned, reviewed function
actual = namespace["compute_solid_earth_tides"]("controlled-test")
los = np.array([los_e.item(0), los_n.item(0), np.cos(np.deg2rad(40))])
expected = 4 * np.pi / wave * np.dot(los, tide_sec - tide_ref)
np.testing.assert_allclose(actual, expected, rtol=1e-12)
report = {
    "source": "https://github.com/isce-framework/isce3/blob/v0.25.16/python/packages/nisar/workflows/solid_earth_tides.py",
    "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
    "test": "Production tide function with controlled ref/sec ENU displacement and look vectors",
    "expected_phase_rad": float(expected),
    "actual_phase_rad": float(actual.item(0)),
    "passed": True,
    "interpretation": "Stored tide cube equals +4pi/lambda times secondary-minus-reference target-to-sensor tide displacement. Native chronological phase contribution has the opposite sign; removing it requires addition.",
    "limitations": "Algebra test only. Does not validate tide model, interpolation, production corrections, or independent observed displacement.",
}
(root / "data/catalog/tide-sign-source-check.json").write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
