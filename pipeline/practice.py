"""Practice and sprint qualifying timesheets from OpenF1's session_result, 2023 on.

One request per session, plus one for the driver list when a reserve driver ran
in practice and isn't in the race results. Stored as practice/<year>/<round>.json,
{kind: [row, ...]} with rows in finishing order.
"""
from datetime import datetime, timedelta, timezone

import openf1
import store

# our session code -> names openf1 uses for it
KINDS = {"FP1": ("Practice 1",), "FP2": ("Practice 2",), "FP3": ("Practice 3",),
         "SQ": ("Sprint Qualifying", "Sprint Shootout")}
SETTLE = timedelta(minutes=30)       # results land a few minutes after the official ones
GIVE_UP = timedelta(days=1)          # the updater stops asking after this, racedata fills gaps


def path(year, rnd):
    return store.ROOT / "practice" / str(year) / f"{rnd}.json"


def load(year, rnd):
    try:
        return store.read_json(path(year, rnd))
    except FileNotFoundError:
        return {}


def when(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))


def sessions(year):
    """every openf1 session of a year as (name, start, key)"""
    return [(s.get("session_name"), when(s["date_start"]), s["session_key"])
            for s in openf1.get(f"sessions?year={year}") if s.get("date_start")]


def find(all_sessions, kind, start):
    """nearest session with that name; the calendar has Las Vegas a day early"""
    near = [(abs(begin - start), key) for name, begin, key in all_sessions
            if name in KINDS[kind] and abs(begin - start) <= timedelta(hours=36)]
    return min(near)[1] if near else None


def numbers(season, rnd):
    """car number -> (driver, team) from the race results, else the season list"""
    teams = {s["d"]: s["c"][-1] for s in season["standings"]["drivers"] if s.get("c")}
    out = {int(d["number"]): (did, teams.get(did))
           for did, d in season["drivers"].items() if str(d.get("number") or "").isdigit()}
    for r in rnd["results"] or []:
        if str(r.get("no") or "").isdigit():
            out[int(r["no"])] = (r["d"], r["c"])
    return out


def last_set(v):
    """qualifying style answers are [Q1, Q2, Q3], keep the last one set"""
    if isinstance(v, list):
        v = [x for x in v if x not in (None, "")]
        return v[-1] if v else None
    return v


def timesheet(season, rnd, key):
    rows = openf1.get(f"session_result?session_key={key}")
    if not rows:
        return None
    cars = numbers(season, rnd)
    extra = {}
    if any(r.get("driver_number") not in cars for r in rows):
        for d in openf1.get(f"drivers?session_key={key}"):
            extra[d.get("driver_number")] = d
    out = []
    for r in sorted(rows, key=lambda r: (r.get("position") is None, r.get("position") or 0)):
        no = r.get("driver_number")
        did, team = cars.get(no, (None, None))
        info = extra.get(no, {})
        best = last_set(r.get("duration"))
        gap = last_set(r.get("gap_to_leader"))
        out.append({
            "no": no, "d": did, "c": team,
            "code": info.get("name_acronym"), "name": (info.get("full_name") or "").title() or None,
            "team": info.get("team_name"),
            "pos": r.get("position"), "best": best, "gap": gap, "laps": r.get("number_of_laps"),
        })
    return out


def due(rnd, have, now, until=None):
    """sessions of a round that have ended, settled, and aren't stored yet"""
    out = []
    for kind in KINDS:
        start = rnd["sessions"].get(kind)
        if not start or kind in have:
            continue
        ended = when(start) + timedelta(hours=1)
        if now - ended >= SETTLE and (until is None or now - ended <= until):
            out.append((kind, when(start)))
    return out


def fill(year, season, now=None, until=None, limit=None):
    """fetch missing practice timesheets; returns how many sessions were saved"""
    if year < openf1.FIRST:
        return 0
    now = now or datetime.now(timezone.utc)
    todo = []
    for rnd in season["rounds"]:
        have = load(year, rnd["round"])
        for kind, start in due(rnd, have, now, until):
            todo.append((rnd, kind, start))
    if not todo:
        return 0
    found = sessions(year)
    saved = 0
    for rnd, kind, start in todo[:limit]:
        key = find(found, kind, start)
        if key is None:
            print(f"{year} round {rnd['round']} {kind}: no openf1 session")
            continue
        sheet = timesheet(season, rnd, key)
        if not sheet:
            print(f"{year} round {rnd['round']} {kind}: no times yet")
            continue
        have = load(year, rnd["round"])
        have[kind] = sheet
        store.write_json(path(year, rnd["round"]), have)
        saved += 1
    return saved


def for_site(year, rnd, names):
    """timesheets with display names, {kind: rows}"""
    out = {}
    for kind, rows in load(year, rnd).items():
        out[kind] = [{
            "id": r["d"], "code": names.code(r["d"]) if r["d"] else (r["code"] or str(r["no"])),
            "name": names.driver(r["d"]) if r["d"] else (r["name"] or f"Car {r['no']}"),
            "team": names.team(r["c"]) if r["c"] else (r["team"] or ""),
            "pos": r["pos"], "best": r["best"], "gap": r["gap"], "laps": r["laps"],
        } for r in rows]
    return out
