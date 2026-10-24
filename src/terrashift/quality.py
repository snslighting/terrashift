"""Real-file quality audit. This deliberately does not certify ground motion."""

import h5py
import numpy as np
from pyproj import Transformer
from scipy import ndimage
from scipy.interpolate import RegularGridInterpolator

from .catalog import Query
from .inspection import json_value

BASE = "/science/LSAR/GUNW/grids/frequencyA/unwrappedInterferogram"
POL = BASE + "/HH"
IDENT = "/science/LSAR/identification"
RADAR = "/science/LSAR/GUNW/metadata/radarGrid"


def finite_data(dataset, window):
    values = dataset[window].astype("float64")
    fill = dataset.attrs.get("_FillValue")
    if fill is not None:
        values[values == fill] = np.nan
    values[~np.isfinite(values)] = np.nan
    return values


def quality_bits(mask):
    """Decode schema 1.5.0 using the actual file's mask description.

    Reject unknown high bits and ionospheric interpolation for this conservative audit.
    This is not a layover/shadow mask.
    """
    mask = np.asarray(mask, dtype=np.uint32)
    low = mask & 255
    return {
        "non_water": (low // 100) == 0,
        "valid_subswaths": ((low // 10) % 10 > 0) & (low % 10 > 0) & (low != 255),
        "no_anomaly": ((mask >> 8) & 65535) == 0,
        "iono_not_interpolated": ((mask >> 24) & 1) == 0,
        "no_reserved_flags": (mask >> 25) == 0,
    }


def subset_window(x, y, epsg, bbox):
    Query(tuple(bbox), "2026-01-01", "2026-01-01")
    if not (np.all(np.diff(x) > 0) and np.all(np.diff(y) < 0)):
        raise ValueError("Unsupported grid ordering; require east-increasing/north-decreasing coordinates.")
    bounds = Transformer.from_crs(4326, epsg, always_xy=True).transform_bounds(*bbox, densify_pts=41)
    cols = np.where((x >= bounds[0]) & (x <= bounds[2]))[0]
    rows = np.where((y >= bounds[1]) & (y <= bounds[3]))[0]
    if not cols.size or not rows.size:
        raise ValueError("AOI outside product grid.")
    window = (slice(rows[0], rows[-1] + 1), slice(cols[0], cols[-1] + 1))
    xx, yy = np.meshgrid(x[window[1]], y[window[0]])
    lon, lat = Transformer.from_crs(epsg, 4326, always_xy=True).transform(xx, yy)
    inside = (lon >= bbox[0]) & (lon <= bbox[2]) & (lat >= bbox[1]) & (lat <= bbox[3])
    return window, inside, xx, yy


def audit(path, bbox, floor=0.35, *, allow_interpolated_ionosphere=False):
    if not 0 < floor < 1:
        raise ValueError("Coherence safety floor must be between zero and one.")
    with h5py.File(path, "r") as f:
        meta = {k: json_value(v[()]) for k, v in f[IDENT].items() if isinstance(v, h5py.Dataset)}
        if meta["productType"] != "GUNW" or meta["missionId"] != "NISAR":
            raise ValueError("Not a real NISAR GUNW product.")
        if meta["productSpecificationVersion"] != "1.5.0":
            raise ValueError("Schema has not been inspected for this version; audit refuses to guess.")
        description = json_value(f[BASE + "/mask"].attrs["description"])
        if "Bits 8-15" not in description or "Bit 24" not in description:
            raise ValueError("Mask encoding differs from the inspected schema.")
        for name in ["unwrappedPhase", "ionospherePhaseScreen", "ionospherePhaseScreenUncertainty"]:
            if json_value(f[POL + "/" + name].attrs["units"]) not in ("radians", "radian"):
                raise ValueError("Phase units must be radians.")
        frequency = f["/science/LSAR/GUNW/grids/frequencyA/centerFrequency"]
        if json_value(frequency.attrs["units"]) != "hertz" or float(frequency[()]) <= 0:
            raise ValueError("Invalid center frequency or units.")
        wavelength = 299792458.0 / float(frequency[()])
        x, y = f[POL + "/xCoordinates"][()], f[POL + "/yCoordinates"][()]
        epsg = int(f[POL + "/projection"][()])
        window, inside, xx, yy = subset_window(x, y, epsg, bbox)
        layers = {
            n: finite_data(f[POL + "/" + n], window)
            for n in [
                "unwrappedPhase",
                "coherenceMagnitude",
                "connectedComponents",
                "ionospherePhaseScreen",
                "ionospherePhaseScreenUncertainty",
            ]
        }
        bits = quality_bits(f[BASE + "/mask"][window])
        valid = inside.copy()
        counts = {"inside_aoi": int(valid.sum())}
        for name, keep in bits.items():
            if name == "iono_not_interpolated" and allow_interpolated_ionosphere:
                continue
            valid &= keep
            counts[name] = int(valid.sum())
        for name, values in layers.items():
            valid &= np.isfinite(values)
        valid &= layers["connectedComponents"] > 0
        coh = layers["coherenceMagnitude"]
        valid &= (coh >= 0) & (coh <= 1) & (layers["ionospherePhaseScreenUncertainty"] >= 0)
        counts["finite_scientific_layers"] = int(valid.sum())
        threshold = max(floor, float(np.quantile(coh[valid], 0.25))) if valid.any() else floor
        valid &= coh >= threshold
        counts["coherence"] = int(valid.sum())
        supported = np.zeros(valid.shape, dtype=bool)
        for component in np.unique(layers["connectedComponents"][valid]):
            labels, _ = ndimage.label(valid & (layers["connectedComponents"] == component))
            sizes = np.bincount(labels.ravel())
            keep_ids = np.flatnonzero(sizes >= 25)
            keep_ids = keep_ids[keep_ids != 0]
            supported |= np.isin(labels, keep_ids)
        valid &= supported
        counts["spatial_support_25_pixels"] = int(valid.sum())
        uncertainty_equivalent = layers["ionospherePhaseScreenUncertainty"] * wavelength / (4 * np.pi) * 1000
        cube = {}
        for name in [
            "wetTroposphericPhaseScreen",
            "hydrostaticTroposphericPhaseScreen",
            "slantRangeSolidEarthTidesPhase",
        ]:
            ds = f[RADAR + "/" + name]
            sample = ds[:, ::20, ::20]
            cube[name] = {
                "path": ds.name,
                "shape": list(ds.shape),
                "units": json_value(ds.attrs.get("units")),
                "finite_sample_fraction": float(np.isfinite(sample).mean()),
            }
        report = {
            "status": "REAL_DATA_QC_ONLY_NOT_VALIDATED_DISPLACEMENT",
            "granule": meta["granuleId"],
            "metadata": meta,
            "bbox_wgs84": list(bbox),
            "epsg": epsg,
            "subset_shape": list(inside.shape),
            "wavelength_m": wavelength,
            "quality_counts_cumulative": counts,
            "coherence_threshold": threshold,
            "threshold_status": "Development policy, not calibrated to held-out data",
            "ionosphere_interpolation_policy": "included_for_sensitivity_only"
            if allow_interpolated_ionosphere
            else "rejected",
            "correction_cubes": cube,
            "median_ionospheric_uncertainty_phase_equivalent_mm": float(
                np.median(uncertainty_equivalent[valid])
            )
            if valid.any()
            else None,
            "total_displacement_uncertainty_mm": None,
            "ground_motion_confirmed": False,
            "production_gate": "CLOSED",
            "quality_status": "ALL_PIXELS_MASKED" if not valid.any() else "UNVALIDATED_CANDIDATE",
            "blockers": [
                "Reference-region stability has not been independently established.",
                "Full correction sign chain requires numerical cross-validation for processor 0.25.16.",
                "Atmospheric residual, orbit, unwrapping and reference uncertainties are not calibrated.",
                "No independent GNSS or held-out deformation validation has been completed.",
            ],
        }
        layers.update(
            valid=valid,
            ionosphere_interpolated=~bits["iono_not_interpolated"],
            inside=inside,
            x=xx[0],
            y=yy[:, 0],
            ionospheric_uncertainty_equivalent_mm=uncertainty_equivalent,
        )
        return report, layers


def interpolate_cube(gunw, name, xx, yy, dem):
    """Interpolate an inspected 3D correction on WGS84 ellipsoidal heights; never extrapolate."""
    if dem.shape != xx.shape or yy.shape != xx.shape:
        raise ValueError("DEM and target coordinates must share a grid.")
    with h5py.File(gunw, "r") as f:
        g = f[RADAR]
        axes = (g["heightAboveEllipsoid"][()], g["yCoordinates"][()], g["xCoordinates"][()])
        interpolator = RegularGridInterpolator(
            axes, finite_data(g[name], np.s_[:]), bounds_error=False, fill_value=np.nan
        )
        return interpolator(np.column_stack((dem.ravel(), yy.ravel(), xx.ravel()))).reshape(xx.shape)
