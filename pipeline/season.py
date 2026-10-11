"""Fetches one whole season from the API into our own compact format.

The same format is used for finished seasons in archive/ and for the season in
progress in current/, so the rest of the pipeline never needs to know which
one it is reading.
"""
from datetime import datetime, timezone

from api import get, races, team_name

# schedule keys the API uses for sessions, mapped to our short names
SESSION_KEYS = {
    "FirstPractice": "FP1",
    "SecondPractice": "FP2",
    "ThirdPractice": "FP3",
    "SprintQualifying": "SQ",
    "SprintShootout": "SQ",
    "Sprint": "SR",
    "Qualifying": "Q",
}


def stamp(date, time=None):
    if not date:
        return None
    return f"{date}T{time or '00:00:00Z'}".replace("+00:00", "Z")


def num(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else f


def result_row(r):
    return {
        "d": r["Driver"]["driverId"],
        "c": r["Constructor"]["constructorId"],
        "no": r.get("number"),
        "grid": num(r.get("grid")),
        "pos": num(r.get("position")),
        "text": r.get("positionText"),
        "pts": num(r.get("points")) or 0,
        "laps": num(r.get("laps")),
        "status": r.get("status"),
        "time": (r.get("Time") or {}).get("time"),
        "fl": (r.get("FastestLap") or {}).get("rank"),
    }


def fetch(year):
    """Everything about one season. Roughly 8 to 15 requests depending on its size."""
    schedule = get(f"{year}.json?limit=100")["RaceTable"]["Races"]
    results = races(f"{year}/results.json", "Results")
    quali = races(f"{year}/qualifying.json", "QualifyingResults")
    sprint = races(f"{year}/sprint.json", "SprintResults") if int(year) >= 2021 else []

    drivers, teams = {}, {}

    def remember(r):
        d, c = r["Driver"], r["Constructor"]
        drivers.setdefault(d["driverId"], {
            "first": d.get("givenName"), "last": d.get("familyName"),
            "code": d.get("code"), "number": d.get("permanentNumber"),
            "nat": d.get("nationality"), "dob": d.get("dateOfBirth"),
        })
        teams.setdefault(c["constructorId"], {"name": team_name(c["name"]), "nat": c.get("nationality")})

    by_round = {}
    for race in schedule:
        rnd = int(race["round"])
        sessions = {short: stamp(race[key].get("date"), race[key].get("time"))
                    for key, short in SESSION_KEYS.items() if isinstance(race.get(key), dict)}
        sessions["R"] = stamp(race.get("date"), race.get("time"))
        loc = race["Circuit"]["Location"]
        by_round[rnd] = {
            "round": rnd,
            "name": race["raceName"],
            "circuit": {
                "id": race["Circuit"]["circuitId"],
                "name": race["Circuit"]["circuitName"],
                "locality": loc.get("locality"),
                "country": loc.get("country"),
            },
            "sessions": sessions,
            "results": [],
            "quali": [],
            "sprint": [],
        }

    for race in results:
        for r in race["Results"]:
            remember(r)
        by_round[int(race["round"])]["results"] = [result_row(r) for r in race["Results"]]

    for race in sprint:
        for r in race["SprintResults"]:
            remember(r)
        by_round[int(race["round"])]["sprint"] = [result_row(r) for r in race["SprintResults"]]

    for race in quali:
        rows = []
        for q in race["QualifyingResults"]:
            remember(q)
            rows.append({
                "d": q["Driver"]["driverId"], "c": q["Constructor"]["constructorId"],
                "pos": num(q.get("position")),
                "q1": q.get("Q1"), "q2": q.get("Q2"), "q3": q.get("Q3"),
            })
        by_round[int(race["round"])]["quali"] = rows

    standings = {"round": 0, "drivers": [], "teams": []}
    ds = get(f"{year}/driverStandings.json?limit=100")["StandingsTable"]["StandingsLists"]
    if ds:
        standings["round"] = int(ds[-1]["round"])
        standings["drivers"] = [{
            "d": s["Driver"]["driverId"],
            "pos": num(s.get("position")), "text": s.get("positionText"),
            "pts": num(s["points"]), "wins": int(s["wins"]),
            "c": [c["constructorId"] for c in s["Constructors"]],
        } for s in ds[-1]["DriverStandings"]]
        for s in ds[-1]["DriverStandings"]:
            drivers.setdefault(s["Driver"]["driverId"], {
                "first": s["Driver"].get("givenName"), "last": s["Driver"].get("familyName"),
                "code": s["Driver"].get("code"), "number": s["Driver"].get("permanentNumber"),
                "nat": s["Driver"].get("nationality"), "dob": s["Driver"].get("dateOfBirth"),
            })
    if int(year) >= 1958:
        cs = get(f"{year}/constructorStandings.json?limit=100")["StandingsTable"]["StandingsLists"]
        if cs:
            standings["teams"] = [{
                "c": s["Constructor"]["constructorId"],
                "pos": num(s.get("position")), "text": s.get("positionText"),
                "pts": num(s["points"]), "wins": int(s["wins"]),
            } for s in cs[-1]["ConstructorStandings"]]
            for s in cs[-1]["ConstructorStandings"]:
                c = s["Constructor"]
                teams.setdefault(c["constructorId"], {"name": team_name(c["name"]), "nat": c.get("nationality")})

    rounds = [by_round[k] for k in sorted(by_round)]
    last_round = rounds[-1]["round"] if rounds else 0
    return {
        "year": int(year),
        "rounds": rounds,
        "drivers": drivers,
        "teams": teams,
        "standings": standings,
        # a season is finished once its last round has a race result and the standings caught up
        "complete": bool(rounds) and bool(rounds[-1]["results"]) and standings["round"] == last_round,
        "fetched": datetime.now(timezone.utc).isoformat(timespec="minutes").replace("+00:00", "Z"),
    }
