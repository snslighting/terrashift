"""Prepare corrected research layers, explicitly without certifying ground motion."""

import argparse
import json
from pathlib import Path

import h5py
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from terrashift.config import ROOT
from terrashift.inspection import json_value
from terrashift.phase import correct_native_phase
from terrashift.quality import RADAR, audit, interpolate_cube

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("file", type=Path)
parser.add_argument("--bbox", nargs=4, type=float, required=True)
parser.add_argument("--dem", nargs="+", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--allow-interpolated-ionosphere", action="store_true")
args = parser.parse_args()
out = args.output.resolve()
if not out.is_relative_to(ROOT):
    parser.error("Outputs must remain inside TerraShift.")
report, layers = audit(args.file, args.bbox, allow_interpolated_ionosphere=args.allow_interpolated_ionosphere)
xx, yy = np.meshgrid(layers["x"], layers["y"])
dx = float(np.diff(layers["x"])[0])
dy = float(-np.diff(layers["y"])[0])
transform = from_origin(layers["x"][0] - dx / 2, layers["y"][0] + dy / 2, dx, dy)
dem = np.full(xx.shape, np.nan, dtype="float32")
for path in args.dem:
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1),
            destination=dem,
            src_transform=src.transform,
            src_crs=src.crs,
            src_nodata=src.nodata,
            dst_transform=transform,
            dst_crs=report["epsg"],
            dst_nodata=np.nan,
            resampling=Resampling.bilinear,
            init_dest_nodata=False,
        )
with h5py.File(args.file, "r") as f:
    if int(f[RADAR + "/projection"][()]) != report["epsg"]:
        raise ValueError("Radar cube and science grid CRS differ; reprojection is required.")
    for name, unit in [("incidenceAngle", "degrees"), ("losUnitVectorX", "1"), ("losUnitVectorY", "1")]:
        if json_value(f[RADAR + "/" + name].attrs["units"]) != unit:
            raise ValueError("Unexpected look-vector or incidence-angle units.")
    version = json_value(
        f["/science/LSAR/GUNW/metadata/processingInformation/algorithms/softwareVersion"][()]
    )
    params = "/science/LSAR/GUNW/metadata/processingInformation/parameters/unwrappedInterferogram/frequencyA/"
    if json_value(f[params + "topographicFlatteningApplied"][()]) != "True":
        raise ValueError("Topographic flattening is required.")
    for name in report["correction_cubes"]:
        if json_value(f[RADAR + "/" + name].attrs["units"]) not in ("radians", "radian"):
            raise ValueError("Unexpected correction units.")
for name in report["correction_cubes"]:
    layers[name] = interpolate_cube(args.file, name, xx, yy, dem)
    report["correction_cubes"][name]["applied_to_research_phase"] = True
for name in ["losUnitVectorX", "losUnitVectorY", "incidenceAngle"]:
    layers[name] = interpolate_cube(args.file, name, xx, yy, dem)
layers["dem_ellipsoid_m"] = dem
layers["corrected_phase_radians"] = correct_native_phase(
    layers["unwrappedPhase"],
    layers["ionospherePhaseScreen"],
    layers["wetTroposphericPhaseScreen"],
    layers["hydrostaticTroposphericPhaseScreen"],
    layers["slantRangeSolidEarthTidesPhase"],
    processor_version=version,
    specification_version=report["metadata"]["productSpecificationVersion"],
)
layers["valid"] &= np.isfinite(layers["corrected_phase_radians"])
report["status"] = "CORRECTED_RESEARCH_PHASE_NOT_VALIDATED_DISPLACEMENT"
report["accepted_after_corrections"] = int(layers["valid"].sum())
report["correction_equation"] = "native_phase - ionosphere - wet - hydrostatic + solid_earth_tide"
report["processor_version"] = version
report["source_arithmetic_check"] = "data/catalog/tide-sign-source-check.json"
report["total_displacement_uncertainty_mm"] = None
report["reference_region"] = None
report["production_gate"] = "CLOSED"
report["blockers"] = [
    "Reference-region stability has not been independently established.",
    "Correction algebra is source-tested; observational validation remains incomplete.",
    "Atmospheric residual, orbit, unwrapping and reference uncertainties are not calibrated.",
    "Independent NISAR-vs-GNSS comparison and held-out validation remain incomplete.",
]
out.mkdir(parents=True, exist_ok=True)
(out / "quality-report.json").write_text(json.dumps(report, indent=2, allow_nan=False))
np.savez_compressed(out / "scientific-subset.npz", **layers)
print(
    json.dumps(
        {"output": str(out), "status": report["status"], "accepted": report["accepted_after_corrections"]}
    )
)
