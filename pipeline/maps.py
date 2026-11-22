"""Circuit outlines from open map data, for tracks we have no replay of. The shapes come
from github.com/bacinger/f1-circuits (MIT, see maps-LICENSE.md) and are kept in maps.json.

  python maps.py <path to f1-circuits/circuits>   redo maps.json from the geojson files
"""
import json
import math
import sys
from pathlib import Path

import trivia

HERE = Path(__file__).resolve().parent
FILE = HERE / "maps.json"

# geojson file -> our circuit id
FILES = {
    "it-1953": "imola", "bh-2002": "bahrain", "ae-2009": "yas_marina", "sa-2021": "jeddah",
    "qa-2004": "losail", "fr-1969": "ricard", "tr-2005": "istanbul", "ru-2014": "sochi",
    "pt-2008": "portimao", "de-1927": "nurburgring", "it-1914": "mugello", "de-1932": "hockenheimring",
    "fr-1960": "magny_cours", "us-1909": "indianapolis", "ar-1952": "galvez", "pt-1972": "estoril",
    "za-1961": "kyalami", "br-1977": "jacarepagua", "us-1956": "watkins_glen",
}


def load():
    """circuit id -> svg path"""
    try:
        return json.loads(FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def convert(folder):
    out = {}
    for name, cid in FILES.items():
        geo = json.loads((Path(folder) / f"{name}.geojson").read_text(encoding="utf-8"))
        coords = geo["features"][0]["geometry"]["coordinates"]
        lat0 = math.radians(sum(c[1] for c in coords) / len(coords))
        # flat enough at the size of a circuit: longitude squeezed by the latitude, north up
        out[cid] = trivia.outline([(lon * math.cos(lat0), lat) for lon, lat in coords])
    FILE.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {len(out)} outlines")


if __name__ == "__main__":
    convert(sys.argv[1])
