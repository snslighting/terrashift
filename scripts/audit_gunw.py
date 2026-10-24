"""Reusable real-GUNW quality audit, without displacement claims."""

import argparse
import json
from pathlib import Path

import numpy as np

from terrashift.config import ROOT
from terrashift.quality import audit

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("file", type=Path)
parser.add_argument("--bbox", nargs=4, type=float, required=True)
parser.add_argument("--output", type=Path, required=True)
parser.add_argument("--allow-interpolated-ionosphere", action="store_true")
args = parser.parse_args()
out = args.output.resolve()
if not out.is_relative_to(ROOT):
    parser.error("Outputs must remain inside TerraShift.")
report, layers = audit(args.file, args.bbox, allow_interpolated_ionosphere=args.allow_interpolated_ionosphere)
out.mkdir(parents=True, exist_ok=True)
(out / "quality-report.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf-8")
np.savez_compressed(out / "scientific-subset.npz", **layers)
print(
    json.dumps(
        {
            "status": report["quality_status"],
            "accepted_pixels": int(layers["valid"].sum()),
            "ground_motion_confirmed": False,
            "output": str(out),
        },
        indent=2,
    )
)
