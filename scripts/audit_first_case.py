"""Audit the first real product without making an unvalidated ground-motion claim."""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.warp import Resampling, reproject

from terrashift.quality import audit, interpolate_cube

root = Path(__file__).resolve().parents[1]
products = [
    p for p in (root / "data/cache").rglob("*.h5") if "_027_168_A_173_028_" in p.name and "_QA_" not in p.name
]
if len(products) != 1:
    raise SystemExit("Expected one first-case GUNW in the cache.")
report, layers = audit(products[0], (121.1, -8.9, 121.95, -8.1))
xx, yy = np.meshgrid(layers["x"], layers["y"])
transform = from_origin(layers["x"][0] - 40, layers["y"][0] + 40, 80, 80)
dem = np.full(xx.shape, np.nan, dtype="float32")
with rasterio.open(root / "data/cache/dem/DEM_S09_00_E121_00_C01.tif") as src:
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
    )
for name in report["correction_cubes"]:
    a = interpolate_cube(products[0], name, xx, yy, dem)
    layers[name] = a
    valid = a[layers["valid"] & np.isfinite(a)]
    report["correction_cubes"][name]["aoi_range_radians"] = (
        list(map(float, [valid.min(), valid.max()])) if valid.size else None
    )
    report["correction_cubes"][name]["applied_to_phase"] = False
layers["dem_ellipsoid_m"] = dem
out = root / "data/processed/first-case-audit"
out.mkdir(parents=True, exist_ok=True)
(out / "quality-report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
np.savez_compressed(out / "scientific-subset.npz", **layers)
fig, axes = plt.subplots(2, 2, figsize=(12, 9), layout="constrained")
extent = [layers["x"][0] / 1000, layers["x"][-1] / 1000, layers["y"][-1] / 1000, layers["y"][0] / 1000]
for ax, key, title, cmap, unit in zip(
    axes.ravel(),
    ["unwrappedPhase", "coherenceMagnitude", "valid", "ionospheric_uncertainty_equivalent_mm"],
    [
        "Unwrapped phase (not displacement)",
        "Measured coherence",
        "Pixels surviving development QC",
        "Ionospheric uncertainty only",
    ],
    ["RdBu_r", "viridis", "Greys", "magma"],
    ["radians", "0 to 1", "accepted = 1", "phase-equivalent mm"],
):
    a = np.where(layers["inside"], layers[key], np.nan)
    im = ax.imshow(
        a,
        extent=extent,
        cmap=cmap,
        interpolation="nearest",
        vmin=0 if key in ("valid", "coherenceMagnitude") else None,
        vmax=1 if key in ("valid", "coherenceMagnitude") else None,
    )
    fig.colorbar(im, ax=ax, label=unit, shrink=0.8)
    ax.set_title(title)
    ax.set_xlabel("UTM easting (km)")
    ax.set_ylabel("UTM northing (km)")
fig.suptitle(
    "TerraShift | Real NISAR GUNW quality audit\n12-24 August 2026 | Track 168 / Frame 173 | Ground motion NOT validated"
)
fig.savefig(out / "quality-audit.png", dpi=150)
print(json.dumps({k: v for k, v in report.items() if k not in ["metadata", "correction_cubes"]}, indent=2))
