"""Compare development epochs on identical pixels, without fitting away errors."""

import hashlib
import json

import matplotlib
import numpy as np
from pyproj import Transformer

from terrashift.config import ROOT
from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def main():
    folders = [ROOT / "data/processed" / name for name in ("california-expanded", "california-july-repeat")]
    comparisons = [json.loads((p / "gnss-comparison.json").read_text()) for p in folders]
    quality = [json.loads((p / "quality-report.json").read_text()) for p in folders]
    if any(c["granule"] != q["granule"] for c, q in zip(comparisons, quality, strict=True)):
        raise ValueError("Comparison reports and quality reports describe different products.")
    for field in ("trackNumber", "frameNumber", "orbitPassDirection"):
        if quality[0]["metadata"][field] != quality[1]["metadata"][field]:
            raise ValueError("Incompatible viewing geometry identifiers.")
    if comparisons[0]["after"] != comparisons[1]["before"]:
        raise ValueError("This diagnostic expects sequential development pairs.")
    keys = ["x", "y", "valid", "connectedComponents", "corrected_phase_radians"]
    layers = []
    provenance = []
    for folder in folders:
        with np.load(folder / "scientific-subset.npz") as archive:
            layers.append({key: archive[key] for key in keys})
        hashes = {}
        for name in ("scientific-subset.npz", "quality-report.json", "gnss-comparison.json"):
            with (folder / name).open("rb") as stream:
                hashes[name] = hashlib.file_digest(stream, "sha256").hexdigest()
        provenance.append({"directory": str(folder.relative_to(ROOT)), "sha256": hashes})
    if quality[0]["epsg"] != quality[1]["epsg"]:
        raise ValueError("Grid CRS differs; explicit registration is required.")
    for axis in ("x", "y"):
        if not np.array_equal(layers[0][axis], layers[1][axis]):
            raise ValueError("Grid coordinates differ; do not intersect pixels by array index.")
    if any(c["reference_station"] != "P287" for c in comparisons):
        raise ValueError("This predeclared experiment requires P287 in both source reports.")
    tables = [{r["station"]: r for r in c["rows"]} for c in comparisons]
    masks = []
    for layer, table in zip(layers, tables, strict=True):
        component = table["P287"]["component"]
        masks.append(
            layer["valid"]
            & (layer["connectedComponents"] == component)
            & np.isfinite(layer["corrected_phase_radians"])
        )
    common = masks[0] & masks[1]
    xx, yy = np.meshgrid(layers[0]["x"], layers[0]["y"])
    transform = Transformer.from_crs(4326, quality[0]["epsg"], always_xy=True)
    rows = []
    for station, first in tables[0].items():
        second = tables[1].get(station, {})
        row = {"station": station}
        if any("median_phase_rad" not in r for r in (first, second)):
            rows.append({**row, "status": "UNAVAILABLE_IN_SOURCE_COMPARISON"})
            continue
        # Lock centers to the first epoch to avoid changing spatial support.
        sx, sy = transform.transform(first["longitude"], first["latitude"])
        selected = common & (np.hypot(xx - sx, yy - sy) <= 500)
        row["common_pixels"] = int(selected.sum())
        if selected.sum() < 25:
            rows.append({**row, "status": "INSUFFICIENT_COMMON_SUPPORT"})
            continue
        row["status"] = "DEVELOPMENT_ONLY"
        row["median_phase_rad"] = [float(np.median(a["corrected_phase_radians"][selected])) for a in layers]
        rows.append(row)
    ref = next(r for r in rows if r["station"] == "P287")
    if "median_phase_rad" not in ref:
        raise ValueError("No common reference support; cannot compare relative values.")
    for row in rows:
        if "median_phase_rad" not in row:
            continue
        estimates = []
        for i in range(2):
            sar = float(
                phase_to_los_mm(
                    row["median_phase_rad"][i] - ref["median_phase_rad"][i],
                    299792458 / quality[i]["wavelength_m"],
                    convention=NATIVE_CONVENTION,
                )
            )
            original = tables[i][row["station"]]
            gnss = original["gnss_los_mm"] - tables[i]["P287"]["gnss_los_mm"]
            estimates.append(
                {
                    "candidate_los_mm": sar,
                    "gnss_los_mm": gnss,
                    "residual_mm": sar - gnss,
                    "change_from_original_candidate_mm": sar
                    - original.get("relative_nisar_candidate_los_mm", 0),
                }
            )
        row["epochs"] = estimates
    usable = [r for r in rows if "epochs" in r and r["station"] != "P287"]
    if len(usable) < 2:
        raise ValueError("At least two common comparison stations are needed for pairwise diagnostics.")
    summaries = []
    pairwise = []
    for i in range(2):
        residual = np.array([r["epochs"][i]["residual_mm"] for r in usable])
        summaries.append(
            {
                "comparison_count": len(usable),
                "mean_residual_mm": float(residual.mean()),
                "rmse_mm": float(np.sqrt(np.mean(residual**2))),
                "residual_range_mm": float(np.ptp(residual)),
                "max_support_effect_mm": max(
                    abs(r["epochs"][i]["change_from_original_candidate_mm"]) for r in usable
                ),
            }
        )
        for j, a in enumerate(usable):
            for b in usable[j + 1 :]:
                pairwise.append(
                    {
                        "epoch_index": i,
                        "stations": [a["station"], b["station"]],
                        "reference_cancelling_residual_difference_mm": a["epochs"][i]["residual_mm"]
                        - b["epochs"][i]["residual_mm"],
                    }
                )
    result = {
        "status": "COMMON_SUPPORT_DEVELOPMENT_DIAGNOSTIC",
        "sources": provenance,
        "pairs": [[c["before"], c["after"]] for c in comparisons],
        "rows": rows,
        "summaries": summaries,
        "pairwise_differences": pairwise,
        "production_gate": "CLOSED",
        "total_displacement_uncertainty_mm": None,
        "limitations": [
            "GNSS projection is held at each original pair's geometry to isolate radar support changes.",
            "Differences cancel a common reference offset; they are correlated and are not independent tests.",
            "Two sequential pairs share an acquisition and do not provide loop closure or an annual trend.",
            "No mean/ramp removal, station exclusion by residual, or optimized reference is applied.",
        ],
    }
    out = ROOT / "data/processed/california-repeat-support"
    out.mkdir(exist_ok=True)
    (out / "comparison.json").write_text(json.dumps(result, indent=2, allow_nan=False), encoding="utf-8")
    fig, ax = plt.subplots(figsize=(12, 5))
    for i, pair in enumerate(result["pairs"]):
        ax.plot(
            [r["station"] for r in usable],
            [r["epochs"][i]["residual_mm"] for r in usable],
            "o-",
            label=" to ".join(pair),
        )
    ax.axhline(0, color="black", linewidth=0.8)
    ax.set(
        ylabel="Candidate LOS minus GNSS (mm)",
        title="Identical radar support across two development pairs\nUnvalidated; P287 reference; no fitted error removal",
    )
    ax.legend()
    ax.grid(alpha=0.2)
    fig.tight_layout()
    fig.savefig(out / "repeat-residuals.png", dpi=150)
    plt.close(fig)
    print(json.dumps({"output": str(out), "summaries": summaries}, indent=2))


if __name__ == "__main__":
    main()
