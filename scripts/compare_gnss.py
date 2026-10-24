"""Compute a reproducible independent daily GNSS benchmark."""

import argparse
import hashlib
import json
from datetime import date
from pathlib import Path

from terrashift.config import ROOT
from terrashift.gnss import daily_difference, project_los, read_tenv3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("file", type=Path)
parser.add_argument("--before", type=date.fromisoformat, required=True)
parser.add_argument("--after", type=date.fromisoformat, required=True)
parser.add_argument("--source", required=True)
parser.add_argument("--look-enu", type=float, nargs=3)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
output = args.output.resolve()
if not output.is_relative_to(ROOT):
    parser.error("Outputs must remain inside TerraShift.")
series = read_tenv3(args.file)
delta, cov = daily_difference(series, args.before, args.after)
report = {
    "station": series[0].station,
    "source": args.source,
    "source_sha256": hashlib.sha256(args.file.read_bytes()).hexdigest(),
    "frame": "IGS20",
    "before": args.before.isoformat(),
    "after": args.after.isoformat(),
    "east_north_up_change_mm": (delta * 1000).tolist(),
    "formal_difference_covariance_mm2": (cov * 1e6).tolist(),
    "latitude": series[-1].latitude,
    "longitude": series[-1].longitude,
    "limitation": "Daily solutions are not acquisition-instant positions. Formal covariance assumes independent dates and excludes temporal correlations and systematic errors. Spatial reference must match InSAR. Not yet a NISAR validation.",
    "nisar_validation_passed": False,
}
if args.look_enu:
    displacement, sigma = project_los(delta, cov, args.look_enu)
    report.update(toward_positive_los_mm=1000 * displacement, formal_los_sigma_mm=1000 * sigma)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2, allow_nan=False))
print(json.dumps(report, indent=2))
