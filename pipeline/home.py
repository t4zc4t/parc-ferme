"""Data for the homepage: next race, driver standings and the last race result."""
import sys
from datetime import datetime

from api import get, team_name


def race_start(race):
    t = race.get("time", "00:00:00Z")
    return datetime.fromisoformat(f"{race['date']}T{t}".replace("Z", "+00:00"))


def day_label(dt):
    return dt.strftime("%#d %b %Y" if sys.platform == "win32" else "%-d %b %Y")


def next_race(races, now):
    for race in races:
        start = race_start(race)
        if start > now:
            loc = race["Circuit"]["Location"]
            return {
                "round": int(race["round"]),
                "name": race["raceName"],
                "circuit": race["Circuit"]["circuitName"],
                "place": f"{loc['locality']}, {loc['country']}",
                "start": start.isoformat().replace("+00:00", "Z"),
                "dateLabel": day_label(start),
            }
    return None


def standings_rows(table):
    lists = table["StandingsLists"]
    if not lists:
        return [], 0
    rows = []
    for s in lists[0]["DriverStandings"]:
        d = s["Driver"]
        pts = float(s["points"])
        rows.append({
            "pos": s.get("positionText", s.get("position", "")),
            "id": d["driverId"],
            "driver": f"{d['givenName']} {d['familyName']}",
            "code": d.get("code", ""),
            "team": team_name(s["Constructors"][-1]["name"]) if s["Constructors"] else "",
            "wins": int(s["wins"]),
            "points": int(pts) if pts.is_integer() else pts,
        })
    return rows, int(lists[0]["round"])


def last_race(data):
    races = data["RaceTable"]["Races"]
    if not races:
        return None
    race = races[0]
    rows = []
    for r in race["Results"][:10]:
        d = r["Driver"]
        pts = float(r["points"])
        rows.append({
            "pos": r["positionText"],
            "id": d["driverId"],
            "driver": f"{d['givenName']} {d['familyName']}",
            "code": d.get("code", ""),
            "team": team_name(r["Constructor"]["name"]),
            "grid": int(r["grid"]),
            "gap": r.get("Time", {}).get("time") or r["status"],
            "points": int(pts) if pts.is_integer() else pts,
        })
    return {
        "round": int(race["round"]),
        "name": race["raceName"],
        "dateLabel": day_label(race_start(race)),
        "results": rows,
    }


def build(schedule, standings, now):
    races = schedule["Races"]
    rows, after_round = standings_rows(standings)
    last = last_race(get("current/last/results.json"))
    last_gp = last["round"] if last else 0

    # standings can run a round ahead of the race results when a sprint has
    # been scored but the Grand Prix result isn't in yet
    if after_round > last_gp:
        note = f"AFTER ROUND {last_gp} + ROUND {after_round} SPRINT"
    else:
        note = f"AFTER ROUND {after_round}"

    return {
        "season": int(schedule["season"]),
        "rounds": len(races),
        "afterRound": after_round,
        "standingsNote": note,
        "next": next_race(races, now),
        "lastRace": last,
        "standings": rows,
    }
