"""Jolpica (Ergast) API client."""
import json
import os
import time
import urllib.error
import urllib.request

API = "https://api.jolpi.ca/ergast/f1"
PAGE = 100          # the API caps every page at 100 rows
PAUSE = float(os.environ.get("PF_PAUSE", "0.3"))   # seconds between requests, the API allows 4 a second

_last_call = 0.0


def get(path, tries=5):
    """returns MRData, backs off on 429"""
    global _last_call
    url = f"{API}/{path}"
    for attempt in range(tries):
        wait = PAUSE - (time.time() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "parc-ferme-site"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)["MRData"]
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < tries - 1:
                time.sleep(10 * (attempt + 1))
                continue
            if attempt == tries - 1:
                raise RuntimeError(f"could not load {url}: {err}")
        except Exception as err:
            if attempt == tries - 1:
                raise RuntimeError(f"could not load {url}: {err}")
        time.sleep(3 * (attempt + 1))


def races(path, key):
    """all pages of a race list, rejoining races split across pages"""
    joiner = "&" if "?" in path else "?"
    offset, total, merged = 0, None, {}
    while total is None or offset < total:
        data = get(f"{path}{joiner}limit={PAGE}&offset={offset}")
        total = int(data["total"])
        for race in data["RaceTable"]["Races"]:
            ident = (race["season"], int(race["round"]))
            if ident in merged:
                merged[ident][key].extend(race[key])
            else:
                merged[ident] = race
        offset += PAGE
    return [merged[k] for k in sorted(merged, key=lambda k: (int(k[0]), k[1]))]


def count(path):
    joiner = "&" if "?" in path else "?"
    return int(get(f"{path}{joiner}limit=1")["total"])


def team_name(name):
    # some teams come back as "Alpine F1 Team"
    return name.replace(" F1 Team", "").strip()
