"""NASA quick-look images of NISAR products over notable places (no login needed).

For each place, finds the most recent NISAR L2 GUNW (provisional) product that
covers it in NASA's public CMR catalog, downloads NASA's own LATLON browse image
(the product's quick-look), and writes a small catalog for the website. These
images are NASA products shown as they are: TerraShift has not processed,
corrected or validated them.

    python scripts/quicklooks.py   # writes frontend/public/evidence/quicklooks/
"""

from __future__ import annotations

import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

CMR = "https://cmr.earthdata.nasa.gov/search/granules.umm_json"
COLLECTION = "NISAR_L2_GUNW_PROVISIONAL_V1"
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "evidence" / "quicklooks"
UA = {"User-Agent": "terrashift-quicklooks"}

# id, name, region, theme, longitude, latitude, why it is worth a look (context, not a finding)
PLACES = [
    (
        "etna",
        "Mount Etna",
        "Sicily, Italy",
        "volcano",
        14.99,
        37.75,
        "One of Europe's most active volcanoes; radar can track the ground swelling and sinking as magma moves.",
    ),
    (
        "kilauea",
        "Kīlauea",
        "Hawaiʻi, United States",
        "volcano",
        -155.28,
        19.41,
        "A frequently erupting shield volcano whose summit and rift zones deform by centimetres to metres.",
    ),
    (
        "reykjanes",
        "Reykjanes Peninsula",
        "Iceland",
        "volcano",
        -22.45,
        63.88,
        "Repeated fissure eruptions near Grindavík since 2021, preceded by ground uplift that radar can see.",
    ),
    (
        "jakobshavn",
        "Sermeq Kujalleq (Jakobshavn)",
        "Greenland",
        "ice",
        -49.8,
        69.17,
        "One of the fastest-flowing glaciers on Earth, draining the Greenland ice sheet into Disko Bay.",
    ),
    (
        "pine-island",
        "Pine Island Glacier",
        "West Antarctica",
        "ice",
        -100.0,
        -75.2,
        "A fast-changing outlet glacier of the West Antarctic Ice Sheet, watched closely for sea-level rise.",
    ),
    (
        "mexico-city",
        "Mexico City",
        "Mexico",
        "subsidence",
        -99.13,
        19.43,
        "Parts of the city sink tens of centimetres a year as groundwater is pumped from beneath it.",
    ),
    (
        "tehran",
        "Tehran plain",
        "Iran",
        "subsidence",
        51.2,
        35.55,
        "Heavy groundwater use has made the plain south-west of Tehran one of the fastest-sinking areas known.",
    ),
    (
        "aral-sea",
        "Aral Sea",
        "Kazakhstan and Uzbekistan",
        "water",
        59.8,
        45.2,
        "Once the world's fourth-largest lake, it shrank dramatically after its rivers were diverted for irrigation.",
    ),
    (
        "fergana",
        "Fergana Valley",
        "Uzbekistan",
        "farming",
        71.6,
        40.6,
        "Central Asia's most densely farmed valley, irrigated by the Syr Darya and its canals.",
    ),
    (
        "bengal-delta",
        "Ganges–Brahmaputra delta",
        "Bangladesh",
        "water",
        90.0,
        23.4,
        "The world's largest delta, where monsoon floods and sinking land shape the lives of millions.",
    ),
    (
        "rondonia",
        "Rondônia",
        "Brazil",
        "forest",
        -63.0,
        -10.0,
        "A frontier of Amazon deforestation; L-band radar sees through cloud to the forest structure.",
    ),
    (
        "venice",
        "Venice lagoon",
        "Italy",
        "subsidence",
        12.33,
        45.44,
        "A city on slowly sinking ground, where millimetres a year matter against rising seas.",
    ),
]


def get(url: str, timeout: int = 120) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def newest(lon: float, lat: float) -> dict | None:
    query = urllib.parse.urlencode(
        {"short_name": COLLECTION, "point": f"{lon},{lat}", "page_size": 5, "sort_key[]": "-start_date"}
    )
    for item in json.loads(get(f"{CMR}?{query}"))["items"]:
        urls = [r["URL"] for r in item["umm"].get("RelatedUrls", []) if r["URL"].startswith("https")]
        browse = [u for u in urls if u.endswith("_LATLON.png")]
        if browse:
            return {"item": item, "browse": browse[0]}
    return None


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for pid, name, region, theme, lon, lat, why in PLACES:
        found = newest(lon, lat)
        if not found:
            print(f"{pid}: no product with a quick-look", file=sys.stderr)
            continue
        umm, concept = found["item"]["umm"], found["item"]["meta"]["concept-id"]
        title = umm["GranuleUR"]
        parts = title.split("_")
        image = Image.open(io.BytesIO(get(found["browse"]))).convert("RGBA")
        image = image.crop(image.getbbox())
        image.thumbnail((900, 900))
        image.save(OUT / f"{pid}.webp", quality=82, method=6)
        entries.append(
            {
                "id": pid,
                "name": name,
                "region": region,
                "theme": theme,
                "longitude": lon,
                "latitude": lat,
                "why": why,
                "granule": title,
                "before": f"{parts[11][:4]}-{parts[11][4:6]}-{parts[11][6:8]}",
                "after": f"{parts[13][:4]}-{parts[13][4:6]}-{parts[13][6:8]}",
                "orbit": "Ascending" if parts[6] == "A" else "Descending",
                "track": int(parts[5]),
                "frame": int(parts[7]),
                "image": f"quicklooks/{pid}.webp",
                "browse_source": found["browse"],
                "metadata": f"https://cmr.earthdata.nasa.gov/search/concepts/{concept}.umm_json",
            }
        )
        print(f"{pid}: {title}", file=sys.stderr)
    (OUT / "quicklooks.json").write_text(
        json.dumps(
            {
                "collection": COLLECTION,
                "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "note": (
                    "NASA quick-look (browse) images of NISAR GUNW products, shown as distributed. "
                    "Not processed, corrected or validated by TerraShift."
                ),
                "places": entries,
            },
            indent=1,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
