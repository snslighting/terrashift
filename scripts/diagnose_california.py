"""Preserve the comparison and quantify correction/support sensitivity on cached real data."""

import argparse
import hashlib
import json
from pathlib import Path

import matplotlib
import numpy as np
from pyproj import Transformer

from terrashift.config import ROOT
from terrashift.diagnostics import correction_stages, summarize_stages
from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "data/processed/california-expanded")
    parser.add_argument("--output", type=Path, default=ROOT / "data/processed/california-diagnostics")
    args = parser.parse_args()
    folder, out = args.directory.resolve(), args.output.resolve()
    if not folder.is_relative_to(ROOT) or not out.is_relative_to(ROOT) or out == folder:
        parser.error("Use a separate output directory inside TerraShift.")
    source_names = ["quality-report.json", "gnss-comparison.json", "scientific-subset.npz"]
    hashes = {name: digest(folder / name) for name in source_names}
    quality = json.loads((folder / source_names[0]).read_text())
    baseline = json.loads((folder / source_names[1]).read_text())
    if quality["granule"] != baseline["granule"]:
        raise ValueError("Comparison and arrays must describe the same granule.")
    with np.load(folder / source_names[2]) as archive:
        layers = {name: archive[name] for name in archive.files}
    stages = correction_stages(
        layers,
        processor_version=quality["processor_version"],
        specification_version=quality["metadata"]["productSpecificationVersion"],
    )
    np.testing.assert_allclose(stages["plus_tide"], layers["corrected_phase_radians"], equal_nan=True)
    transform = Transformer.from_crs(4326, quality["epsg"], always_xy=True)
    xx, yy = np.meshgrid(layers["x"], layers["y"])
    frequency = 299792458 / quality["wavelength_m"]
    reference_name = baseline["reference_station"]
    reference = next(row for row in baseline["rows"] if row["station"] == reference_name)
    component = reference["component"]
    scenarios = []
    # Predeclared sensitivity settings, not candidates selected by agreement with GNSS.
    for radius, noninterpolated in [(500, False), (250, False), (1000, False), (500, True)]:
        rows = []
        for original in baseline["rows"]:
            row = {"station": original["station"]}
            if "median_phase_rad" not in original:
                rows.append(
                    {**row, "status": "BASELINE_UNAVAILABLE", "reason": original.get("unavailable_reason")}
                )
                continue
            sx, sy = transform.transform(original["longitude"], original["latitude"])
            mask = (np.hypot(xx - sx, yy - sy) <= radius) & layers["valid"]
            if noninterpolated:
                mask &= ~layers["ionosphere_interpolated"]
            summary, selected = summarize_stages(
                stages, mask, layers["connectedComponents"], component=component
            )
            row.update(summary)
            if summary["status"] == "DEVELOPMENT_ONLY":
                phase = stages["plus_tide"][selected]
                terrain = layers["dem_ellipsoid_m"][selected]
                row.update(
                    median_coherence=float(np.median(layers["coherenceMagnitude"][selected])),
                    interpolated_fraction=float(layers["ionosphere_interpolated"][selected].mean()),
                    dem_median_m=float(np.median(terrain)),
                    dem_p05_p95_m=np.quantile(terrain, [0.05, 0.95]).tolist(),
                    phase_spatial_mad_rad=float(np.median(np.abs(phase - np.median(phase)))),
                    ionospheric_uncertainty_component_mm=float(
                        np.median(layers["ionospheric_uncertainty_equivalent_mm"][selected])
                    ),
                    longitude=original["longitude"],
                    latitude=original["latitude"],
                )
            rows.append(row)
        ref = next(row for row in rows if row["station"] == reference_name)
        for row, original in zip(rows, baseline["rows"], strict=True):
            if "median_phase_rad" not in row or "median_phase_rad" not in ref:
                continue
            relative = {
                name: float(
                    phase_to_los_mm(
                        value - ref["median_phase_rad"][name], frequency, convention=NATIVE_CONVENTION
                    )
                )
                for name, value in row["median_phase_rad"].items()
            }
            # Hold the original GNSS projection fixed: isolate radar support effects.
            gnss = original["gnss_los_mm"] - reference["gnss_los_mm"]
            row["relative_stage_los_mm"] = relative
            row["relative_gnss_los_mm"] = gnss
            row["stage_residual_mm"] = {name: value - gnss for name, value in relative.items()}
            row["relative_stage_increments_mm"] = {
                name: relative[name] - relative[previous]
                for previous, name in zip(list(stages)[:-1], list(stages)[1:], strict=True)
            }
            if radius == 500 and not noninterpolated and "residual_mm" in original:
                np.testing.assert_allclose(
                    row["stage_residual_mm"]["plus_tide"], original["residual_mm"], rtol=0, atol=1e-9
                )
        usable = [row for row in rows if "stage_residual_mm" in row and row["station"] != reference_name]
        scenarios.append(
            {
                "radius_m": radius,
                "noninterpolated_subset_only": noninterpolated,
                "reference_available": "median_phase_rad" in ref,
                "rows": rows,
                "comparison_count": len(usable),
                "stage_rmse_mm": {
                    name: float(np.sqrt(np.mean([r["stage_residual_mm"][name] ** 2 for r in usable])))
                    if usable
                    else None
                    for name in stages
                },
            }
        )
    result = {
        "status": "DEVELOPMENT_DIAGNOSTICS_NOT_VALIDATION",
        "granule": quality["granule"],
        "source_directory": str(folder.relative_to(ROOT)),
        "source_sha256": hashes,
        "reference_station": reference_name,
        "component": component,
        "scenarios": scenarios,
        "production_gate": "CLOSED",
        "ground_motion_confirmed": False,
        "total_displacement_uncertainty_mm": None,
        "limitations": [
            "Stages share the same finite corrected support; ablations do not authorize omitted corrections.",
            "Sequential increments are differences of cumulative medians, not medians of correction layers.",
            "Neighborhoods keep the original reference component and fixed GNSS projection.",
            "Stations unavailable in the baseline remain unavailable; scenarios are not recovery attempts.",
            "Noninterpolated subset uses the original sensitivity mask and is not a rerun of strict QC.",
            "No thresholds, signs, reference or corrections are selected by lowest residual.",
            "Spatial MAD and supplied ionospheric uncertainty are not total measurement uncertainty.",
        ],
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / "diagnostics.json").write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    base = scenarios[0]
    usable = [r for r in base["rows"] if "stage_residual_mm" in r and r["station"] != reference_name]
    fig, ax = plt.subplots(figsize=(12, 6))
    for name in stages:
        ax.plot(
            [r["station"] for r in usable],
            [r["stage_residual_mm"][name] for r in usable],
            marker="o",
            label=name.replace("_", " "),
            linewidth=1,
        )
    ax.axhline(0, color="black", linewidth=0.7)
    ax.set(
        ylabel="Candidate LOS minus GNSS (mm)",
        title="California development data: cumulative correction stages\nNot validated displacement; all comparisons retained",
    )
    ax.legend(ncols=3)
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(out / "correction-stages.png", dpi=150)
    plt.close(fig)
    print(
        json.dumps(
            {
                "output": str(out),
                "scenarios": [
                    {
                        k: s[k]
                        for k in (
                            "radius_m",
                            "noninterpolated_subset_only",
                            "comparison_count",
                            "stage_rmse_mm",
                        )
                    }
                    for s in scenarios
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
