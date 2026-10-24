"""Plot real research layers with their unvalidated status visible."""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from terrashift.config import ROOT

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", type=Path)
args = parser.parse_args()
folder = args.directory.resolve()
if not folder.is_relative_to(ROOT):
    parser.error("Outputs must remain inside TerraShift.")
report = json.loads((folder / "quality-report.json").read_text())
with np.load(folder / "scientific-subset.npz") as data:
    names = [
        "unwrappedPhase",
        "corrected_phase_radians"
        if "corrected_phase_radians" in data
        else "ionospheric_uncertainty_equivalent_mm",
        "coherenceMagnitude",
        "valid",
    ]
    titles = [
        "Raw interferometric phase",
        "Corrected research phase"
        if names[1] == "corrected_phase_radians"
        else "Ionospheric uncertainty only",
        "Measured coherence",
        "Accepted by development QC",
    ]
    units = [
        "radians",
        "radians" if names[1] == "corrected_phase_radians" else "phase-equivalent mm",
        "0 to 1",
        "accepted = 1",
    ]
    fig, axes = plt.subplots(2, 2, figsize=(13, 9), layout="constrained")
    extent = [data["x"][0] / 1000, data["x"][-1] / 1000, data["y"][-1] / 1000, data["y"][0] / 1000]
    for ax, name, title, unit in zip(axes.ravel(), names, titles, units, strict=True):
        array = np.where(data["inside"], data[name], np.nan)
        kwargs = {"vmin": 0, "vmax": 1} if name in ("coherenceMagnitude", "valid") else {}
        if name in ("unwrappedPhase", "corrected_phase_radians"):
            finite = array[np.isfinite(array)]
            if finite.size:
                lower, upper = np.percentile(finite, [2, 98])
                if lower < upper:
                    kwargs = {"vmin": lower, "vmax": upper}
            title += " (2-98% display scale)"
        im = ax.imshow(
            array,
            extent=extent,
            cmap="RdBu_r" if "phase" in name.lower() else "viridis",
            interpolation="nearest",
            **kwargs,
        )
        fig.colorbar(im, ax=ax, label=unit, shrink=0.85)
        ax.set(title=title, xlabel="Projected easting (km)", ylabel="Projected northing (km)")
    fig.suptitle(
        "TerraShift | Real NISAR research audit\nGround displacement NOT independently validated", fontsize=16
    )
    fig.savefig(folder / "quality-audit.png", dpi=150)
print(folder / "quality-audit.png")
