"""Catalog-level screening only; this cannot establish scientific quality."""

from datetime import UTC, datetime

from .catalog import attributes
from .config import COLLECTION


def pair_metadata(umm):
    if umm.get("CollectionReference", {}).get("ShortName") != COLLECTION:
        raise ValueError("Only the verified provisional GUNW collection is accepted.")
    attrs = attributes(umm)

    def one(name):
        values = attrs.get(name, [])
        if len(values) != 1:
            raise ValueError(f"Missing or ambiguous catalog attribute: {name}")
        return values[0]

    if one("PRODUCT_TYPE") != "GUNW":
        raise ValueError("Not a GUNW product.")
    ref = datetime.fromisoformat(one("REFERENCE_ZERO_DOPPLER_START_TIME"))
    sec = datetime.fromisoformat(one("SECONDARY_ZERO_DOPPLER_START_TIME"))
    if ref.tzinfo is None or sec.tzinfo is None or ref >= sec:
        raise ValueError("Invalid reference/secondary acquisition ordering or missing timezone.")
    orbit = one("ASCENDING_DESCENDING")
    if orbit not in ("ASCENDING", "DESCENDING"):
        raise ValueError("Unknown orbit direction.")
    return {
        "reference": ref.isoformat(),
        "secondary": sec.isoformat(),
        "track": int(one("TRACK_NUMBER")),
        "frame": int(one("FRAME_NUMBER")),
        "orbit": orbit,
        "polarizations": attrs.get("FREQUENCY_A_POLARIZATION", []),
        "maturity": "PROVISIONAL",
        "maturity_source": "CMR collection",
        "product_version": one("PRODUCT_VERSION"),
        "science_validated": False,
    }


def brackets_event(umm, event_time):
    meta = pair_metadata(umm)
    event = datetime.fromisoformat(event_time)
    if event.tzinfo is None:
        raise ValueError("Event time must include its UTC offset.")
    event = event.astimezone(UTC)
    return datetime.fromisoformat(meta["reference"]) < event < datetime.fromisoformat(meta["secondary"])
