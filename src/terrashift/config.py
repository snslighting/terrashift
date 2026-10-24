from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
COLLECTION = "NISAR_L2_GUNW_PROVISIONAL_V1"
CACHE = ROOT / "data" / "cache"
CATALOG = ROOT / "data" / "catalog"


def configure():
    load_dotenv(ROOT / ".env", override=False)
