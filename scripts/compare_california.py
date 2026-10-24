"""Reference-matched real GNSS/InSAR development comparison, without accuracy certification."""

import argparse
import json
from datetime import date
from pathlib import Path

import numpy as np
from pyproj import Transformer

from terrashift.config import ROOT
from terrashift.gnss import daily_difference, daily_quality_diagnostic, project_los, read_tenv3
from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--directory", type=Path, default=ROOT / "data/processed/california-research")
parser.add_argument("--expanded", action="store_true")
parser.add_argument("--reference", default="P300")
args = parser.parse_args()
folder = args.directory.resolve()
if not folder.is_relative_to(ROOT):
    parser.error("Outputs must remain inside TerraShift.")
names = ["P300", "CAFP", "Q143", "Q164"]
if args.expanded:
    names += [
        "P285",
        "P286",
        "P287",
        "P288",
        "P289",
        "P290",
        "P293",
        "P294",
        "P298",
        "P302",
        "P304",
        "P307",
        "CAFR",
    ]
if args.reference not in names:
    parser.error("Reference must belong to the selected station list.")
names = [args.reference] + [name for name in names if name != args.reference]
report = json.loads((folder / "quality-report.json").read_text())
before = date.fromisoformat(report["metadata"]["referenceZeroDopplerStartTime"][:10])
after = date.fromisoformat(report["metadata"]["secondaryZeroDopplerStartTime"][:10])
rows = []
with np.load(folder / "scientific-subset.npz") as archive:
    layers = {
        name: archive[name]
        for name in [
            "x",
            "y",
            "valid",
            "connectedComponents",
            "corrected_phase_radians",
            "losUnitVectorX",
            "losUnitVectorY",
            "incidenceAngle",
            "coherenceMagnitude",
            "ionospheric_uncertainty_equivalent_mm",
        ]
    }
    xx, yy = np.meshgrid(layers["x"], layers["y"])
    transform = Transformer.from_crs(4326, report["epsg"], always_xy=True)
    for name in names:
        row = {"station": name, "role": "reference" if name == args.reference else "comparison"}
        try:
            series = read_tenv3(ROOT / f"data/cache/gnss/{name}.IGS20.tenv3")
            delta, cov = daily_difference(series, before, after)
            row["gnss_daily_diagnostics"] = {
                str(day): daily_quality_diagnostic(series, day) for day in [before, after]
            }
            station = next(s for s in series if s.day == before)
            x, y = transform.transform(station.longitude, station.latitude)
            mask = (np.hypot(xx - x, yy - y) <= 500) & layers["valid"]
            row["accepted_within_500m"] = int(mask.sum())
            if mask.sum() < 25:
                raise ValueError("Insufficient co-located spatial support.")
            ids, counts = np.unique(layers["connectedComponents"][mask], return_counts=True)
            component = ids[np.argmax(counts)]
            mask &= layers["connectedComponents"] == component
            if mask.sum() < 25:
                raise ValueError("Insufficient support within one phase component.")
            look = np.array(
                [
                    np.median(layers["losUnitVectorX"][mask]),
                    np.median(layers["losUnitVectorY"][mask]),
                    np.median(np.cos(np.deg2rad(layers["incidenceAngle"][mask]))),
                ]
            )
            if not np.isclose(np.linalg.norm(look), 1, atol=1e-3):
                raise ValueError("Inconsistent look geometry.")
            look /= np.linalg.norm(look)
            gnss, sigma = project_los(delta, cov, look)
            phase = layers["corrected_phase_radians"][mask]
            phase_median = float(np.median(phase))
            row.update(
                component=int(component),
                longitude=station.longitude,
                latitude=station.latitude,
                median_phase_rad=phase_median,
                phase_spatial_mad_rad=float(np.median(np.abs(phase - phase_median))),
                ionospheric_phase_uncertainty_equivalent_mm=float(
                    np.median(layers["ionospheric_uncertainty_equivalent_mm"][mask])
                ),
                median_coherence=float(np.median(layers["coherenceMagnitude"][mask])),
                look_enu=look.tolist(),
                gnss_los_mm=1000 * gnss,
                gnss_formal_sigma_mm=1000 * sigma,
                gnss_enu_change_mm=(delta * 1000).tolist(),
            )
        except ValueError as exc:
            row["unavailable_reason"] = str(exc)
        rows.append(row)
reference = rows[0]
residuals = []
for row in rows[1:]:
    if "median_phase_rad" not in row or "median_phase_rad" not in reference:
        continue
    if row["component"] != reference["component"]:
        row["unavailable_reason"] = "Disconnected phase component from reference."
        continue
    sar = float(
        phase_to_los_mm(
            row["median_phase_rad"] - reference["median_phase_rad"],
            299792458 / report["wavelength_m"],
            convention=NATIVE_CONVENTION,
        )
    )
    gnss = row["gnss_los_mm"] - reference["gnss_los_mm"]
    residual = sar - gnss
    row.update(
        relative_nisar_candidate_los_mm=sar,
        relative_gnss_los_mm=gnss,
        residual_mm=residual,
        relative_gnss_formal_sigma_mm=float(
            np.hypot(row["gnss_formal_sigma_mm"], reference["gnss_formal_sigma_mm"])
        ),
    )
    residuals.append(residual)
result = {
    "status": "REFERENCE_MATCHED_DEVELOPMENT_COMPARISON_NOT_CERTIFIED",
    "granule": report["granule"],
    "before": str(before),
    "after": str(after),
    "reference_station": args.reference,
    "neighborhood_radius_m": 500,
    "rows": rows,
    "comparison_count": len(residuals),
    "mean_residual_mm": float(np.mean(residuals)) if residuals else None,
    "rmse_mm": float(np.sqrt(np.mean(np.square(residuals)))) if residuals else None,
    "production_gate": "CLOSED",
    "nisar_validation_passed": False,
    "limitations": [
        "Station comparisons alone do not calibrate a spatially varying per-pixel uncertainty model.",
        "Daily GNSS and 500 m radar neighborhoods have different temporal and spatial support.",
        "Formal GNSS covariance assumes independent dates and stations; common-mode errors are not modeled.",
        "Interpolated ionosphere pixels are included only in the labeled sensitivity experiment.",
        "Full InSAR uncertainty and independent held-out controls remain unvalidated.",
    ],
}
(folder / "gnss-comparison.json").write_text(json.dumps(result, indent=2, allow_nan=False))
print(json.dumps(result, indent=2, allow_nan=False))
