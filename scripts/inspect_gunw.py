"""Usage: python scripts/inspect_gunw.py FILE.h5 [--output data/catalog/inspection.json]."""

import sys

from terrashift.cli import main

if __name__ == "__main__":
    sys.argv.insert(1, "inspect")
    raise SystemExit(main())
