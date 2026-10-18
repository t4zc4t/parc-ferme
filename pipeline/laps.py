"""Lap-by-lap positions, lap times and pit stops for every Grand Prix since 1996.

History comes from Jolpica's database dump (saved monthly as a release asset), so
it costs no API calls. Races newer than the dump come from the API, one race at a time.

Stored as laps/<year>/<round>.json:
    {"drivers": {id: [[position, lap ms], ...]}, "pits": [[id, lap, stop, ms], ...]}
"""
import csv
import io
import zipfile
from collections import defaultdict

import api
import store

FIRST = 1996   # the first season with lap data


def path(year, rnd):
    return store.ROOT / "laps" / str(year) / f"{rnd}.json"


def have(year, rnd):
    return path(year, rnd).exists()


def ms(text):
    """'00:01:16.29', '1:16.290' or '22.345' -> milliseconds"""
    if not text:
        return None
    parts = text.split(":")
    try:
        secs = float(parts[-1]) + (int(parts[-2]) * 60 if len(parts) > 1 else 0) + (int(parts[-3]) * 3600 if len(parts) > 2 else 0)
    except ValueError:
        return None
    return round(secs * 1000)


def _table(z, name):
    with z.open(f"formula_one_{name}.csv") as f:
        yield from csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))


def from_dump(zip_path, first=FIRST):
    """every race in the dump since `first`, returns how many files changed"""
    z = zipfile.ZipFile(zip_path)
    season = {r["id"]: int(r["year"]) for r in _table(z, "season")}
    rounds = {r["id"]: (season[r["season_id"]], int(r["number"])) for r in _table(z, "round") if r["number"]}
    races = {r["id"]: rounds[r["round_id"]] for r in _table(z, "session")
             if r["type"] == "R" and r["round_id"] in rounds and rounds[r["round_id"]][0] >= first}
    driver = {r["id"]: r["reference"] for r in _table(z, "driver")}
    team_driver = {r["id"]: driver[r["driver_id"]] for r in _table(z, "teamdriver")}
    entry_driver = {r["id"]: team_driver[r["team_driver_id"]] for r in _table(z, "roundentry")}
    entries = {r["id"]: (races[r["session_id"]], entry_driver[r["round_entry_id"]])
               for r in _table(z, "sessionentry") if r["session_id"] in races}

    laps = defaultdict(lambda: defaultdict(dict))
    lap_no = {}
    for r in _table(z, "lap"):
        if not r["number"] or r["session_entry_id"] not in entries:
            continue
        race, d = entries[r["session_entry_id"]]
        n = int(r["number"])
        lap_no[r["id"]] = n
        laps[race][d][n] = [int(r["position"]) if r["position"] else None, ms(r["time"])]

    pits = defaultdict(list)
    for r in _table(z, "pitstop"):
        if r["session_entry_id"] not in entries or r["lap_id"] not in lap_no:
            continue
        race, d = entries[r["session_entry_id"]]
        pits[race].append([d, lap_no[r["lap_id"]], int(r["number"]) if r["number"] else None, ms(r["duration"])])

    changed = 0
    for (year, rnd), by_driver in laps.items():
        changed += store.write_json(path(year, rnd), pack(by_driver, pits.get((year, rnd), [])))
    return changed


def pack(by_driver, pits):
    out = {}
    for d, by_lap in by_driver.items():
        last = max(by_lap)
        out[d] = [by_lap.get(n, [None, None]) for n in range(1, last + 1)]
    return {"drivers": out, "pits": sorted(pits, key=lambda p: (p[1], p[0]))}


def from_api(year, rnd):
    """one race from the API: about 13 requests for the laps plus one for pit stops"""
    by_driver = defaultdict(dict)
    offset, total = 0, None
    while total is None or offset < total:
        data = api.get(f"{year}/{rnd}/laps.json?limit={api.PAGE}&offset={offset}")
        total = int(data["total"])
        for race in data["RaceTable"]["Races"]:
            for lap in race.get("Laps", []):
                n = int(lap["number"])
                for t in lap["Timings"]:
                    by_driver[t["driverId"]][n] = [int(t["position"]), ms(t.get("time"))]
        offset += api.PAGE
    if not by_driver:
        return False
    pits = []
    for race in api.races(f"{year}/{rnd}/pitstops.json", "PitStops"):
        for p in race["PitStops"]:
            pits.append([p["driverId"], int(p["lap"]), int(p["stop"]), ms(p.get("duration"))])
    return store.write_json(path(year, rnd), pack(by_driver, pits))
