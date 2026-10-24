import argparse
import json
import sys
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from .auth import AuthenticationRequired, credential_strategy, login
from .cache import download
from .catalog import Query, search, summarize
from .config import CATALOG, COLLECTION, ROOT
from .inspection import inspect_file


def save_json(path, payload):
    path = Path(path).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError("Project outputs must remain inside TerraShift.")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, allow_nan=False), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="TerraShift science-first NISAR discovery and inspection")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("doctor", help="Check configuration without exposing credentials")
    sub.add_parser("login", help="Interactive Earthdata login in your terminal")
    find = sub.add_parser("search", help="Search public NASA CMR metadata; no login needed")
    find.add_argument(
        "--bbox", nargs=4, type=float, required=True, metavar=("WEST", "SOUTH", "EAST", "NORTH")
    )
    find.add_argument("--start", required=True)
    find.add_argument("--end", required=True)
    find.add_argument("--count", type=int, default=20)
    find.add_argument("--track", type=int)
    find.add_argument("--frame", type=int)
    find.add_argument("--orbit", choices=["A", "D"])
    find.add_argument("--output", type=Path, default=CATALOG / "search.json")
    get = sub.add_parser("download", help="Download ONE catalog-selected real granule")
    get.add_argument("granule")
    inspect = sub.add_parser("inspect", help="Enumerate actual HDF5 paths and metadata")
    inspect.add_argument("file", type=Path)
    inspect.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "doctor":
            strategy = credential_strategy()
            print(
                json.dumps(
                    {
                        "collection": COLLECTION,
                        "credential_strategy": strategy,
                        "authentication_verified": False,
                        "real_product_validated": False,
                        "processing_enabled": False,
                    },
                    indent=2,
                )
            )
            if not strategy:
                raise AuthenticationRequired(
                    "Earthdata is not configured. Run 'terrashift login' after creating an account."
                )
        elif args.command == "login":
            login(interactive=True)
            print("Earthdata login completed. Credentials are stored in the ignored project .netrc.")
        elif args.command == "search":
            query = Query(
                tuple(args.bbox), args.start, args.end, args.count, args.track, args.frame, args.orbit
            )
            results = search(query)
            payload = {
                "queried_utc": datetime.now(UTC).isoformat(),
                "source": "NASA CMR via earthaccess",
                "collection": COLLECTION,
                "query": asdict(query),
                "bounded_search": True,
                "returned": len(results),
                "results": [summarize(r) for r in results],
                "raw_umm": [dict(r) for r in results],
            }
            save_json(args.output, payload)
            print(
                f"Found {len(results)} catalog candidates. Saved {args.output}. No deformation claim is made."
            )
        elif args.command == "download":
            import earthaccess

            results = earthaccess.search_data(short_name=COLLECTION, granule_name=args.granule, count=2)
            results = [r for r in results if r["umm"]["GranuleUR"] == args.granule]
            if len(results) != 1:
                raise ValueError(
                    "No unique matching provisional GUNW granule. Use an exact catalog identifier."
                )
            print(download(results[0], bounded_transfer=True))
        elif args.command == "inspect":
            report = inspect_file(args.file)
            if args.output:
                save_json(args.output, report)
                print(f"HDF5 inventory saved: {args.output}")
            else:
                print(json.dumps(report, indent=2, allow_nan=False))
    except (AuthenticationRequired, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 -- CLI boundary, no private response bodies
        print(
            f"{type(exc).__name__}: operation failed; no scientific output was generated. "
            "Check network, file validity, and Earthdata authorization.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
