"""Small client for the Jolpica API (the continuation of Ergast)."""
import json
import time
import urllib.error
import urllib.request

API = "https://api.jolpi.ca/ergast/f1"
PAGE = 100          # the API caps every page at 100 rows
PAUSE = 0.3         # stays well under the API's burst limit

_last_call = 0.0


def get(path, tries=5):
    """One request, returns the MRData block. Waits and retries when rate limited."""
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
    """Every page of a race list, with races that were split across pages joined back up.

    key is the list inside each race that holds the rows, like "Results" or "QualifyingResults".
    """
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
    """Just the number of rows a query would return."""
    joiner = "&" if "?" in path else "?"
    return int(get(f"{path}{joiner}limit=1")["total"])


def team_name(name):
    # the API writes some teams as "Alpine F1 Team", the rest just as "Ferrari"
    return name.replace(" F1 Team", "").strip()
