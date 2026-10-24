"""Development-only GNSS/reference sensitivity comparison; never certifies displacement."""

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np
from pyproj import Transformer

from terrashift.config import ROOT
from terrashift.gnss import daily_difference, project_los, read_tenv3
from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm, reference_phase

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
args = parser.parse_args()
folder = args.directory.resolve()
if not folder.is_relative_to(ROOT):
    parser.error("Output must remain inside TerraShift.")
report = json.loads((folder / "quality-report.json").read_text())
series = read_tenv3(ROOT / "data/cache/gnss/CCS1.IGS20.tenv3")
station = series[-1]
a = date.fromisoformat(report["metadata"]["referenceZeroDopplerStartTime"][:10])
b = date.fromisoformat(report["metadata"]["secondaryZeroDopplerStartTime"][:10])
delta, cov = daily_difference(series, a, b)
result = {
    "station": station.station,
    "status": "DEVELOPMENT_REFERENCE_SENSITIVITY_ONLY",
    "nisar_validation_passed": False,
    "reference_stability_verified": False,
    "total_displacement_uncertainty_mm": None,
    "comparisons": [],
}
with np.load(folder / "scientific-subset.npz") as layers:
    xx, yy = np.meshgrid(layers["x"], layers["y"])
    sx, sy = Transformer.from_crs(4326, report["epsg"], always_xy=True).transform(
        station.longitude, station.latitude
    )
    lon, lat = Transformer.from_crs(report["epsg"], 4326, always_xy=True).transform(xx, yy)
    near = (xx - sx) ** 2 + (yy - sy) ** 2 <= 500**2
    mask = near & layers["valid"]
    result["accepted_within_500m"] = int(mask.sum())
    result["station_inside_subset"] = bool(
        layers["x"].min() <= sx <= layers["x"].max() and layers["y"].min() <= sy <= layers["y"].max()
    )
    if mask.sum() >= 25:
        ids, counts = np.unique(layers["connectedComponents"][mask], return_counts=True)
        component = ids[np.argmax(counts)]
        mask &= layers["connectedComponents"] == component
        if mask.sum() >= 25:
            look = np.array(
                [
                    np.median(layers["losUnitVectorX"][mask]),
                    np.median(layers["losUnitVectorY"][mask]),
                    np.median(np.cos(np.deg2rad(layers["incidenceAngle"][mask]))),
                ]
            )
            if not np.isclose(np.linalg.norm(look), 1, atol=1e-3):
                raise ValueError("Interpolated look geometry is inconsistent.")
            look /= np.linalg.norm(look)
            gnss, sigma = project_los(delta, cov, look)
            result.update(
                gnss_toward_positive_los_mm=gnss * 1000,
                gnss_formal_sigma_mm=sigma * 1000,
                look_enu=look.tolist(),
                station_component=int(component),
                accepted_same_component_within_500m=int(mask.sum()),
                station_median_coherence=float(np.median(layers["coherenceMagnitude"][mask])),
            )
            # Predeclared southern boxes: sensitivity study, not claims of stability.
            references = [
                (-67.25, 10.05, -67.1, 10.15),
                (-67.0, 10.05, -66.85, 10.15),
                (-66.65, 10.05, -66.5, 10.15),
            ]
            for west, south, east, north in references:
                region = (lon >= west) & (lon <= east) & (lat >= south) & (lat <= north)
                valid = layers["valid"] & (layers["connectedComponents"] == component)
                comparison = {"reference_bbox": [west, south, east, north]}
                try:
                    referenced, ref = reference_phase(
                        layers["corrected_phase_radians"], valid, layers["connectedComponents"], region
                    )
                    los = phase_to_los_mm(
                        referenced, 299792458 / report["wavelength_m"], convention=NATIVE_CONVENTION
                    )
                    value = float(np.median(los[mask]))
                    comparison.update(
                        reference=ref,
                        candidate_relative_los_mm=value,
                        difference_from_absolute_gnss_mm=value - gnss * 1000,
                        comparable_absolute_reference=False,
                    )
                except ValueError as exc:
                    comparison["unavailable_reason"] = str(exc)
                result["comparisons"].append(comparison)
    else:
        result["unavailable_reason"] = "Fewer than 25 accepted pixels within 500 m of GNSS station."
result["limitations"] = [
    "Reference boxes have not been independently shown stable; relative InSAR and absolute GNSS are not yet equivalent quantities.",
    "Spatially averaged InSAR and daily GNSS have different spatial/temporal support.",
    "Ionosphere interpolation sensitivity is development-only; total InSAR uncertainty remains unknown.",
    "No thresholds may be tuned here and then described as held-out validation.",
]
(folder / "CCS1-reference-sensitivity.json").write_text(json.dumps(result, indent=2, allow_nan=False))
print(json.dumps(result, indent=2, allow_nan=False))
