"""Export TerraShift 3 evidence: study areas, change layers and binary display grids.

Reads processed real subsets under data/processed and writes
frontend/public/evidence/catalog.json plus compact int16 grids. Every grid
cell is the mean of actual accepted source pixels (exact counts are shipped
alongside); nothing is interpolated or filled.

Usage: python scripts/export_v3.py [--processed DIR] [--output DIR]
"""

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from pyproj import Transformer

from terrashift.cache import digest
from terrashift.change import chain_series, coherence_change, display_support, disturbance
from terrashift.gnss import project_los
from terrashift.phase import NATIVE_CONVENTION, phase_to_los_mm, reference_phase
from terrashift.validation import reference_sweep, residual_structure
from terrashift.visualization import aggregate_display, referenced_candidate, summarize_values

ROOT = Path(__file__).resolve().parents[1]
NODATA = -32768
SIZE = 256
SERIES = re.compile(r"(\d{8})_(\d{8})$")

CHANGE_TYPES = {
    "agriculture": {
        "label": "Farming & land disturbance",
        "measure": "Coherence loss (1 − coherence)",
        "explain": "Ploughing, irrigation, harvest and crop growth scramble the radar echo between visits. "
        "Higher values mean the surface changed more.",
    },
    "subsidence": {
        "label": "Land subsidence",
        "measure": "Line-of-sight ground motion (mm)",
        "explain": "Groundwater pumping compacts aquifers and lowers the land. Radar phase measures motion "
        "toward or away from the satellite; sinking land moves away (negative).",
    },
    "earthquake": {
        "label": "Earthquake deformation",
        "measure": "Line-of-sight motion (mm) and coherence loss",
        "explain": "Fault slip moves the ground by centimetres to metres. Interferograms that span the "
        "earthquake record that motion; shaking damage and landslides also lower coherence.",
    },
    "flood": {
        "label": "Floods & wetlands",
        "measure": "Backscatter change (dB)",
        "explain": "Calm open water reflects radar away from the sensor and turns dark; flooded vegetation "
        "can brighten. Requires NISAR GCOV backscatter products.",
    },
    "wildfire": {
        "label": "Wildfire burn scars",
        "measure": "Backscatter change (dB) and coherence loss",
        "explain": "Burned canopy loses volume scattering and coherence. Requires NISAR GCOV products.",
    },
}


def load(folder):
    folder = Path(folder)
    quality = json.loads((folder / "quality-report.json").read_text())
    comparison = None
    if (folder / "gnss-comparison.json").is_file():
        comparison = json.loads((folder / "gnss-comparison.json").read_text())
    with np.load(folder / "scientific-subset.npz") as archive:
        layers = {k: archive[k] for k in archive.files}
    return quality, comparison, layers


def encode(out, name, values, counts, digits):
    """Quantize to int16 with a per-layer step; NaN becomes NODATA."""
    values = np.asarray(values, dtype=float)
    finite = np.isfinite(values)
    peak = float(np.max(np.abs(values[finite]))) if finite.any() else 1.0
    step = max(peak / 32000, 10.0**-digits)
    quantized = np.where(finite, np.round(np.where(finite, values, 0) / step), NODATA).astype("<i2")
    counts = np.asarray(counts)
    peak_count = int(counts.max(initial=0))
    if peak_count > 65535:
        raise ValueError("Display cell support exceeds uint16; increase grid size.")
    count_type = "uint8" if peak_count <= 255 else "uint16"
    (out / "grids").mkdir(parents=True, exist_ok=True)
    (out / "grids" / f"{name}.bin").write_bytes(quantized.tobytes())
    (out / "grids" / f"{name}.count.bin").write_bytes(
        counts.astype("u1" if count_type == "uint8" else "<u2").tobytes()
    )
    return {
        "file": f"grids/{name}.bin",
        "counts": f"grids/{name}.count.bin",
        "count_type": count_type,
        "step": step,
        "nodata": NODATA,
    }


def corners(bounds):
    tr = Transformer.from_crs(3857, 4326, always_xy=True)
    west, south = tr.transform(bounds[0], bounds[1])
    east, north = tr.transform(bounds[2], bounds[3])
    return [[west, north], [east, north], [east, south], [west, south]]


def layer_entry(out, name, native, display, digits, unit, kind):
    entry = encode(out, name, display["values"], display["counts"], digits)
    entry.update(unit=unit, kind=kind, native_statistics=summarize_values(native))
    return entry


def pct(mask, support):
    total = int(np.count_nonzero(support))
    return round(100 * int(np.count_nonzero(mask & support)) / total, 1) if total else None


def comparison_block(comparison):
    if not comparison:
        return None
    rows = comparison["rows"]
    keep = [
        "station",
        "role",
        "longitude",
        "latitude",
        "median_coherence",
        "accepted_within_500m",
        "relative_nisar_candidate_los_mm",
        "relative_gnss_los_mm",
        "residual_mm",
        "gnss_los_mm",
        "gnss_formal_sigma_mm",
        "relative_gnss_formal_sigma_mm",
        "unavailable_reason",
        "component",
    ]
    return {
        "reference": comparison["reference_station"],
        "count": comparison["comparison_count"],
        "rmse_mm": comparison["rmse_mm"],
        "mean_residual_mm": comparison.get("mean_residual_mm"),
        "validation": "PASSED" if comparison.get("nisar_validation_passed") else "FAILED",
        "stations": [{k: r[k] for k in keep if k in r} for r in rows],
        "structure": residual_structure(rows),
        "reference_sweep": reference_sweep(rows),
    }


def metadata_block(quality):
    meta = quality["metadata"]
    return {
        "granule": quality["granule"],
        "before": meta["referenceZeroDopplerStartTime"][:10],
        "after": meta["secondaryZeroDopplerStartTime"][:10],
        "track": meta.get("trackNumber"),
        "frame": meta.get("frameNumber"),
        "orbit": meta.get("orbitPassDirection"),
        "product_version": meta.get("productVersion"),
        "schema": meta.get("productSpecificationVersion"),
        "doi": meta.get("productDoi"),
        "processor_version": quality.get("processor_version"),
        "correction_equation": quality.get("correction_equation"),
        "ionosphere_policy": quality.get("ionosphere_interpolation_policy") or "rejected",
        "coherence_threshold": quality.get("coherence_threshold"),
        "accepted_pixels": quality.get("accepted_after_corrections") or 0,
    }


def hashes(folder):
    names = ["scientific-subset.npz", "quality-report.json", "gnss-comparison.json"]
    return {n: digest(Path(folder) / n) for n in names if (Path(folder) / n).is_file()}


def san_joaquin(processed, out):
    folders = [processed / "california-expanded", processed / "california-july-repeat"]
    series = processed / "california-series"
    if series.is_dir():
        folders += sorted(p for p in series.iterdir() if SERIES.search(p.name))
    # Sort by the reports first; load one large array archive at a time to bound memory.
    loaded = [
        (f, json.loads((f / "quality-report.json").read_text()))
        for f in folders
        if (f / "scientific-subset.npz").is_file()
    ]
    loaded.sort(key=lambda item: item[1]["metadata"]["referenceZeroDopplerStartTime"])
    if not loaded:
        return None
    pairs, previous, chain_inputs, findings = [], None, {}, []
    disturbed_share = []
    for folder, _ in loaded:
        quality, comparison, layers = load(folder)
        meta = metadata_block(quality)
        pid = f"san-joaquin-{meta['before']}"
        support = display_support(layers)
        dist = disturbance(layers)
        arrays = {"disturbance": dist}
        los = None
        if comparison and "corrected_phase_radians" in layers:
            ref = next((r for r in comparison["rows"] if r["role"] == "reference"), None)
            if ref and "median_phase_rad" in ref:
                los = referenced_candidate(layers, ref, quality["wavelength_m"])
                arrays["los"] = los
        bounds, display = aggregate_display(layers["x"], layers["y"], quality["epsg"], arrays, SIZE)
        entry = {
            "id": pid,
            **meta,
            "coordinates": corners(bounds),
            "grid": {"size": SIZE, "bounds_mercator": bounds},
            "layers": {
                "disturbance": layer_entry(
                    out, f"{pid}-disturbance", dist, display["disturbance"], 4, "", "disturbance"
                )
            },
            "comparison": comparison_block(comparison),
            "source_hashes": hashes(folder),
        }
        if los is not None:
            entry["layers"]["los"] = layer_entry(out, f"{pid}-los", los, display["los"], 2, "mm", "los")
        disturbed_share.append(pct(dist > 0.5, support))
        if (
            previous is not None
            and previous[1]["metadata"]["secondaryZeroDopplerStartTime"][:10] == meta["before"]
        ):
            change = coherence_change(previous[2], layers)
            _, cdisplay = aggregate_display(layers["x"], layers["y"], quality["epsg"], {"c": change}, SIZE)
            common = np.isfinite(change)
            entry["layers"]["coherence_change"] = layer_entry(
                out, f"{pid}-coherence-change", change, cdisplay["c"], 4, "", "coherence_change"
            )
            entry["layers"]["coherence_change"]["from_pair"] = pairs[-1]["id"]
            entry["layers"]["coherence_change"]["more_disturbed_percent"] = pct(change < -0.1, common)
            entry["layers"]["coherence_change"]["less_disturbed_percent"] = pct(change > 0.1, common)
        if comparison:
            for row in comparison["rows"]:
                if row.get("residual_mm") is not None or row["role"] == "reference":
                    chain_inputs.setdefault(row["station"], []).append(
                        (
                            meta["before"],
                            meta["after"],
                            0.0 if row["role"] == "reference" else row.get("relative_nisar_candidate_los_mm"),
                            0.0 if row["role"] == "reference" else row.get("relative_gnss_los_mm"),
                        )
                    )
        pairs.append(entry)
        previous = (folder, quality, layers)
    stations = {}
    for name, rows in chain_inputs.items():
        radar = chain_series([(b, a, r) for b, a, r, _ in rows]) if len(rows) == len(pairs) else None
        gnss = chain_series([(b, a, g) for b, a, _, g in rows]) if len(rows) == len(pairs) else None
        if radar and radar["cumulative_mm"] is not None:
            stations[name] = {
                "dates": radar["dates"],
                "radar_mm": radar["cumulative_mm"],
                "gnss_mm": gnss["cumulative_mm"] if gnss else None,
            }
    first = pairs[0]
    findings.append(
        f"Between {first['before']} and {first['after']}, {disturbed_share[0]}% of mapped land lost more than "
        "half of its radar coherence, the pattern expected from actively worked fields."
    )
    for p in pairs[1:]:
        change = p["layers"].get("coherence_change")
        if change:
            findings.append(
                f"From one 12-day period to the next ({p['before']} → {p['after']}), surface change increased on "
                f"{change['more_disturbed_percent']}% of land and decreased on {change['less_disturbed_percent']}%."
            )
    worst = max((p for p in pairs if p["comparison"]), key=lambda p: p["comparison"]["rmse_mm"], default=None)
    if worst:
        s = worst["comparison"]["structure"]
        if s.get("status") == "DIAGNOSTIC_ONLY":
            findings.append(
                f"Ground-motion maps are not yet reliable: against {s['stations']} GNSS stations the radar is off by "
                f"{worst['comparison']['rmse_mm']:.0f} mm RMS in {worst['before']} → {worst['after']}, mostly a "
                f"common offset of {s['mean_residual_mm']:+.0f} mm. {s['interpretation']}"
            )
    return {
        "id": "san-joaquin",
        "name": "San Joaquin Valley",
        "region": "California, United States",
        "bbox": quality_bbox(loaded[0][1]),
        "change_types": ["agriculture", "subsidence"],
        "primary_layer": "disturbance",
        "headline": "Farm fields light up as the radar watches them change every 12 days.",
        "summary": "One of the most productive farming regions on Earth, and one of the fastest-sinking. "
        "NISAR revisits every 12 days; coherence loss maps field activity, and phase measures ground motion.",
        "status": "measured_provisional",
        "event": None,
        "pairs": pairs,
        "series": {
            "status": "CHAINED_NO_CLOSURE_CHECK" if len(pairs) > 1 else "SINGLE_PAIR",
            "reference": "P287",
            "stations": stations,
        },
        "findings": findings,
        "limits": [
            "Coherence loss shows that the surface changed, not which farming activity caused it.",
            "Open water and pixels that could not be unwrapped are left blank.",
            "Line-of-sight values are relative to station P287, whose stability is unverified.",
            "Ionospheric interpolation is included (sensitivity mode); total uncertainty is unknown.",
            "Sequential pairs are chained without loop closure; this is not a calibrated velocity.",
        ],
    }


def quality_bbox(quality):
    return quality["bbox_wgs84"]


def nearest_look(layers, epsg, lon, lat):
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(lon, lat)
    col = int(np.argmin(np.abs(layers["x"] - x)))
    row = int(np.argmin(np.abs(layers["y"] - y)))
    lx, ly, inc = (layers[k] for k in ("losUnitVectorX", "losUnitVectorY", "incidenceAngle"))
    finite = np.isfinite(lx) & np.isfinite(ly) & np.isfinite(inc)
    rows, cols = np.nonzero(finite)
    if not rows.size:
        return None, None
    k = int(np.argmin((rows - row) ** 2 + (cols - col) ** 2))
    r, c = rows[k], cols[k]
    look = np.array([lx[r, c], ly[r, c], np.cos(np.deg2rad(inc[r, c]))])
    distance = float(np.hypot(layers["x"][c] - x, layers["y"][r] - y))
    return look / np.linalg.norm(look), distance


def venezuela(processed, catalog, out):
    folder = processed / "venezuela-research"
    if not (folder / "scientific-subset.npz").is_file():
        return None
    quality, _, layers = load(folder)
    meta = metadata_block(quality)
    epsg = quality["epsg"]
    xx, yy = np.meshgrid(layers["x"], layers["y"])
    lon, lat = Transformer.from_crs(epsg, 4326, always_xy=True).transform(xx, yy)
    valid = layers["valid"] & np.isfinite(layers["corrected_phase_radians"])
    # Predeclared southern boxes from station_comparison.py, tried in order; never chosen by result.
    boxes = [(-67.25, 10.05, -67.1, 10.15), (-67.0, 10.05, -66.85, 10.15), (-66.65, 10.05, -66.5, 10.15)]
    los, reference = None, None
    for box in boxes:
        region = (lon >= box[0]) & (lon <= box[2]) & (lat >= box[1]) & (lat <= box[3])
        try:
            phase, ref = reference_phase(
                layers["corrected_phase_radians"], valid, layers["connectedComponents"], region
            )
        except ValueError:
            continue
        los = phase_to_los_mm(phase, 299792458 / quality["wavelength_m"], convention=NATIVE_CONVENTION)
        reference = {**ref, "bbox": list(box)}
        break
    dist = disturbance(layers)
    arrays = {"disturbance": dist}
    if los is not None:
        arrays["los"] = los
    bounds, display = aggregate_display(layers["x"], layers["y"], epsg, arrays, SIZE)
    pid = f"venezuela-{meta['before']}"
    entry = {
        "id": pid,
        **meta,
        "coordinates": corners(bounds),
        "grid": {"size": SIZE, "bounds_mercator": bounds},
        "layers": {
            "disturbance": layer_entry(
                out, f"{pid}-disturbance", dist, display["disturbance"], 4, "", "disturbance"
            )
        },
        "comparison": None,
        "reference_area": reference,
        "source_hashes": hashes(folder),
    }
    findings = []
    if los is not None:
        entry["layers"]["los"] = layer_entry(out, f"{pid}-los", los, display["los"], 2, "mm", "los")
        stats = summarize_values(los)
        findings.append(
            f"Across {stats['count']:,} accepted pixels, line-of-sight motion relative to a predeclared southern "
            f"reference area spans {stats['p05']:+.0f} to {stats['p95']:+.0f} mm (5th–95th percentile)."
        )
    gnss = None
    path = catalog / "CCS1-independent-comparison.json"
    if path.is_file():
        record = json.loads(path.read_text())
        enu = np.array(record["east_north_up_change_mm"]) / 1000
        cov = np.array(record["formal_difference_covariance_mm2"]) / 1e6
        look, distance = nearest_look(layers, epsg, record["longitude"], record["latitude"])
        gnss = {
            "station": record["station"],
            "longitude": record["longitude"],
            "latitude": record["latitude"],
            "east_north_up_mm": record["east_north_up_change_mm"],
            "source": record["source"],
            "nearest_accepted_radar_km": nearest_valid_km(layers, epsg, record),
        }
        if look is not None:
            value, sigma = project_los(enu, cov, look)
            gnss.update(
                los_mm=1000 * value, los_formal_sigma_mm=1000 * sigma, look_vector_distance_m=distance
            )
        horizontal = float(np.hypot(*record["east_north_up_change_mm"][:2]))
        findings.insert(
            0,
            f"GNSS station {record['station']} in Caracas moved {horizontal:.0f} mm horizontally between the two "
            "radar dates — direct evidence of the M7.5 earthquake's ground motion.",
        )
        findings.append(
            f"No accepted radar pixel lies within 500 m of {record['station']} (nearest ≈ "
            f"{gnss['nearest_accepted_radar_km']:.1f} km), so the two cannot be compared directly."
        )
    findings.append(
        f"{pct(dist > 0.5, display_support(layers))}% of mapped land lost more than half its coherence across the "
        "earthquake; vegetation and steep terrain also contribute."
    )
    entry["gnss"] = gnss
    return {
        "id": "venezuela-2026",
        "name": "Caracas coast",
        "region": "Venezuela",
        "bbox": quality["bbox_wgs84"],
        "change_types": ["earthquake"],
        "primary_layer": "los" if los is not None else "disturbance",
        "headline": "A magnitude 7.5 earthquake moved the Caracas coast — radar captured the 12 days around it.",
        "summary": "On 24 June 2026 two large earthquakes (M7.2 and M7.5, 33 seconds apart) struck northern "
        "Venezuela. NISAR imaged the coast on 13 and 25 June, bracketing both.",
        "status": "measured_provisional",
        "event": {
            "events": [
                {
                    "id": "us6000t7zp",
                    "magnitude": 7.5,
                    "place": "20 km W of Catia La Mar, Venezuela",
                    "time": "2026-06-24T22:05:04Z",
                    "longitude": -67.2205,
                    "latitude": 10.5955,
                },
                {
                    "id": "us6000t7zc",
                    "magnitude": 7.2,
                    "place": "20 km E of San Felipe, Venezuela",
                    "time": "2026-06-24T22:04:31Z",
                    "longitude": -68.5564,
                    "latitude": 10.3713,
                },
            ],
            "source": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp",
        },
        "pairs": [entry],
        "series": None,
        "findings": findings,
        "limits": [
            "Motion is relative to a predeclared reference area whose stability is unverified.",
            "Interpolated ionosphere pixels are included (sensitivity mode); total uncertainty is unknown.",
            "A 12-day pair also contains atmospheric and any non-earthquake motion.",
            "Line-of-sight motion is one component of 3-D motion; it is not vertical displacement.",
        ],
    }


def nearest_valid_km(layers, epsg, record):
    x, y = Transformer.from_crs(4326, epsg, always_xy=True).transform(record["longitude"], record["latitude"])
    rows, cols = np.nonzero(layers["valid"])
    if not rows.size:
        return None
    d = np.hypot(layers["x"][cols] - x, layers["y"][rows] - y)
    return float(d.min() / 1000)


def flores(processed, out):
    folder = processed / "first-case-audit"
    if not (folder / "scientific-subset.npz").is_file():
        return None
    quality, _, layers = load(folder)
    meta = metadata_block(quality)
    dist = disturbance(layers)
    bounds, display = aggregate_display(layers["x"], layers["y"], quality["epsg"], {"d": dist}, SIZE)
    pid = f"flores-{meta['before']}"
    share = pct(dist > 0.5, display_support(layers))
    pair = {
        "id": pid,
        **meta,
        "coordinates": corners(bounds),
        "grid": {"size": SIZE, "bounds_mercator": bounds},
        "layers": {
            "disturbance": layer_entry(out, f"{pid}-disturbance", dist, display["d"], 4, "", "disturbance")
        },
        "comparison": None,
        "source_hashes": hashes(folder),
    }
    findings = [f"{share}% of mapped land lost more than half its radar coherence across the earthquake."]
    sensitivity = processed / "flores-sensitivity"
    if (sensitivity / "scientific-subset.npz").is_file():
        squality, _, slayers = load(sensitivity)
        valid = slayers["valid"] & np.isfinite(slayers["corrected_phase_radians"])
        components = slayers["connectedComponents"]
        if valid.sum() >= 25:
            ids, counts = np.unique(components[valid], return_counts=True)
            main = ids[np.argmax(counts)]
            phase, ref = reference_phase(
                slayers["corrected_phase_radians"], valid, components, valid & (components == main)
            )
            los = phase_to_los_mm(phase, 299792458 / squality["wavelength_m"], convention=NATIVE_CONVENTION)
            _, sdisplay = aggregate_display(slayers["x"], slayers["y"], squality["epsg"], {"los": los}, SIZE)
            pair["layers"]["los"] = layer_entry(out, f"{pid}-los", los, sdisplay["los"], 2, "mm", "los")
            pair["reference_area"] = {**ref, "description": "Median of the largest connected component"}
            pair["los_policy"] = "Interpolated ionosphere included (sensitivity run)"
            stats = summarize_values(los)
            findings.append(
                f"In a labelled sensitivity run, line-of-sight motion relative to the scene median spans "
                f"{stats['p05']:+.0f} to {stats['p95']:+.0f} mm (5th–95th percentile) across {stats['count']:,} pixels."
            )
    else:
        findings.append(
            "No ground motion is shown yet: almost every land pixel carries an interpolated ionospheric correction, "
            "which the strict quality policy rejects. A labelled sensitivity run can lift this (see docs)."
        )
    return {
        "id": "flores-2026",
        "name": "Flores Island",
        "region": "East Nusa Tenggara, Indonesia",
        "bbox": quality["bbox_wgs84"],
        "change_types": ["earthquake"],
        "primary_layer": "los" if "los" in pair["layers"] else "disturbance",
        "headline": "Radar coherence across the M7.8 Flores earthquake.",
        "summary": "A magnitude 7.8 earthquake struck near Ende on 14 August 2026. NISAR imaged Flores on 12 and "
        "24 August, two days before and ten days after.",
        "status": "quality_limited",
        "event": {
            "events": [
                {
                    "id": "us6000tkt2",
                    "magnitude": 7.8,
                    "place": "66 km NNW of Ende, Indonesia",
                    "time": "2026-08-14T21:58:21Z",
                    "longitude": 121.3446,
                    "latitude": -8.3358,
                }
            ],
            "source": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tkt2",
        },
        "pairs": [pair],
        "series": None,
        "findings": findings,
        "limits": [
            "Without a pre-earthquake pair, earthquake effects cannot be separated from vegetation change.",
            "Open water and pixels that could not be unwrapped are left blank.",
        ],
    }


def gcov_cases(processed, out):
    cases = []
    for folder in sorted(processed.glob("gcov-*")):
        if not (folder / "gcov-report.json").is_file():
            continue
        report = json.loads((folder / "gcov-report.json").read_text())
        with np.load(folder / "gcov-subset.npz") as archive:
            x, y, delta = archive["x"], archive["y"], archive["delta_db"]
        bounds, display = aggregate_display(x, y, report["epsg"], {"d": delta}, SIZE)
        cid = folder.name.removeprefix("gcov-")
        before, after = report["before"]["start"][:10], report["after"]["start"][:10]
        finite = np.isfinite(delta)
        pid = f"{cid}-{before}"
        cases.append(
            {
                "id": cid,
                "name": report["name"],
                "region": report["region"],
                "bbox": report["bbox_wgs84"],
                "change_types": [report["change_type"]],
                "primary_layer": "backscatter_change",
                "headline": f"Radar brightness change around {report['name']}.",
                "summary": "NISAR GCOV backscatter before and after the event, compared pixel by pixel.",
                "status": "measured_provisional",
                "event": report.get("event"),
                "pairs": [
                    {
                        "id": pid,
                        "granule": report["after"]["granule"],
                        "before": before,
                        "after": after,
                        "track": report["after"]["track"],
                        "frame": report["after"]["frame"],
                        "orbit": report["after"]["orbit"],
                        "product_version": None,
                        "coordinates": corners(bounds),
                        "grid": {"size": SIZE, "bounds_mercator": bounds},
                        "layers": {
                            "backscatter_change": layer_entry(
                                out, f"{pid}-backscatter", delta, display["d"], 2, "dB", "backscatter_change"
                            )
                        },
                        "comparison": None,
                        "source_hashes": {
                            n: digest(folder / n) for n in ["gcov-subset.npz", "gcov-report.json"]
                        },
                    }
                ],
                "series": None,
                "findings": [
                    (
                        f"{pct(delta <= -3, finite)}% of pixels darkened by 3 dB or more (open water or burned "
                        f"canopy candidates); {pct(delta >= 3, finite)}% brightened by 3 dB or more."
                    )
                ],
                "limits": [
                    "Backscatter also changes with soil moisture, wind on water and crop growth.",
                    "The product's own mask has not been decoded for this product version; it is not applied.",
                    "A ±3 dB threshold marks candidates, not confirmed flooding or burning.",
                ],
            }
        )
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--processed", type=Path, default=ROOT / "data/processed")
    parser.add_argument("--catalog", type=Path, default=ROOT / "data/catalog")
    parser.add_argument("--output", type=Path, default=ROOT / "frontend/public/evidence")
    args = parser.parse_args()
    out = args.output.resolve()
    if (out / "grids").is_dir():
        for old in (out / "grids").glob("*.bin"):
            old.unlink()
    out.mkdir(parents=True, exist_ok=True)
    cases = [
        c
        for c in (
            san_joaquin(args.processed, out),
            venezuela(args.processed, args.catalog, out),
            flores(args.processed, out),
        )
        if c
    ] + gcov_cases(args.processed, out)
    payload = {
        "version": 3,
        "generated": datetime.now(UTC).isoformat(),
        "change_types": CHANGE_TYPES,
        "cases": cases,
        "gnss_source": "https://geodesy.unr.edu/PlugNPlayPortal.php",
        "grid_note": "Each display cell is the mean of accepted native pixels whose centres fall in it; counts are exact.",
    }
    (out / "catalog.json").write_text(
        json.dumps(payload, separators=(",", ":"), allow_nan=False), encoding="utf-8"
    )
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file())
    print(
        json.dumps(
            {"cases": [c["id"] for c in cases], "pairs": sum(len(c["pairs"]) for c in cases), "bytes": size}
        )
    )


if __name__ == "__main__":
    main()
