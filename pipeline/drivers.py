"""A data file for every driver in this season's standings.

Career numbers come from each driver's full list of race results, season
finishes from that year's final standings, and the teammate battle from this
season's race and qualifying results.
"""
from collections import Counter, defaultdict
from datetime import date

from api import count, get, races, team_name

FINISHED = ("Finished",)


def classified(status):
    # "+1 Lap", "+2 Laps" also mean the car was running at the flag
    return status in FINISHED or status.startswith("+")


def season_standings(year, cache):
    if year not in cache:
        lists = get(f"{year}/driverStandings.json?limit=100")["StandingsTable"]["StandingsLists"]
        table = {}
        if lists:
            for s in lists[-1]["DriverStandings"]:
                pts = float(s["points"])
                table[s["Driver"]["driverId"]] = {
                    "pos": s.get("positionText", s.get("position")),
                    "points": int(pts) if pts.is_integer() else pts,
                    "wins": int(s["wins"]),
                }
        cache[year] = table
    return cache[year]


def age_on(dob, today):
    born = date.fromisoformat(dob)
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def career(driver_id, season_now, cache):
    results = races(f"drivers/{driver_id}/results.json", "Results")
    rows = [r["Results"][0] for r in results]

    wins = sum(1 for r in rows if r["position"] == "1")
    podiums = sum(1 for r in rows if r["position"] in ("1", "2", "3"))
    points_finishes = sum(1 for r in rows if float(r["points"]) > 0)
    finishes = sum(1 for r in rows if classified(r["status"]))
    best = min((int(r["position"]) for r in rows), default=None)

    teams_by_year = defaultdict(list)
    for race, r in zip(results, rows):
        name = team_name(r["Constructor"]["name"])
        if name not in teams_by_year[race["season"]]:
            teams_by_year[race["season"]].append(name)

    seasons, titles, total_points = [], 0, 0
    for year in sorted(teams_by_year, key=int):
        st = season_standings(year, cache).get(driver_id, {})
        pos = st.get("pos")
        if pos == "1" and int(year) < season_now:
            titles += 1
        if isinstance(st.get("points"), (int, float)):
            total_points += st["points"]
        seasons.append({
            "year": int(year),
            "teams": teams_by_year[year],
            "pos": pos,
            "points": st.get("points"),
            "wins": st.get("wins", 0),
            "races": sum(1 for race in results if race["season"] == year),
        })

    first = results[0] if results else None
    return {
        "races": len(rows),
        "wins": wins,
        "podiums": podiums,
        "poles": count(f"drivers/{driver_id}/qualifying/1.json"),
        "titles": titles,
        "points": round(total_points, 1) if not float(total_points).is_integer() else int(total_points),
        "pointsFinishes": points_finishes,
        "finishRate": round(100 * finishes / len(rows)) if rows else 0,
        "bestFinish": best,
        "debut": {"year": int(first["season"]), "race": first["raceName"]} if first else None,
        "seasons": seasons,
    }


def this_season(race_list, quali_list):
    """Per driver: every round this season, plus who they were paired with."""
    by_driver = defaultdict(list)
    pairs = defaultdict(lambda: Counter())     # driver -> teammate -> rounds together
    duels = defaultdict(lambda: defaultdict(lambda: {"race": [0, 0], "quali": [0, 0]}))
    names = {}

    grids = {}
    for race in quali_list:
        rnd = int(race["round"])
        for q in race["QualifyingResults"]:
            grids[(rnd, q["Driver"]["driverId"])] = int(q["position"])

    for race in race_list:
        rnd = int(race["round"])
        team_rows = defaultdict(list)
        for r in race["Results"]:
            d = r["Driver"]
            names[d["driverId"]] = f"{d['givenName']} {d['familyName']}"
            team_rows[r["Constructor"]["constructorId"]].append(r)
            pts = float(r["points"])
            by_driver[d["driverId"]].append({
                "round": rnd,
                "race": race["raceName"].replace(" Grand Prix", " GP"),
                "grid": int(r["grid"]),
                "quali": grids.get((rnd, d["driverId"])),
                "finish": r["positionText"],
                "classified": classified(r["status"]),
                "status": r["status"],
                "points": int(pts) if pts.is_integer() else pts,
            })

        for rows in team_rows.values():
            if len(rows) != 2:
                continue
            a, b = rows
            ia, ib = a["Driver"]["driverId"], b["Driver"]["driverId"]
            pairs[ia][ib] += 1
            pairs[ib][ia] += 1
            # race: better finishing order wins the round
            if int(a["position"]) < int(b["position"]):
                duels[ia][ib]["race"][0] += 1
                duels[ib][ia]["race"][1] += 1
            else:
                duels[ia][ib]["race"][1] += 1
                duels[ib][ia]["race"][0] += 1
            qa, qb = grids.get((rnd, ia)), grids.get((rnd, ib))
            if qa and qb:
                if qa < qb:
                    duels[ia][ib]["quali"][0] += 1
                    duels[ib][ia]["quali"][1] += 1
                else:
                    duels[ia][ib]["quali"][1] += 1
                    duels[ib][ia]["quali"][0] += 1

    teammates = {}
    for driver, mates in pairs.items():
        teammates[driver] = [
            {"id": mate, "name": names.get(mate, mate), "rounds": n, **duels[driver][mate]}
            for mate, n in mates.most_common()
        ]
    return by_driver, teammates


def build(standings_rows, season_now, today):
    race_list = races("current/results.json", "Results")
    quali_list = races("current/qualifying.json", "QualifyingResults")
    rounds, teammates = this_season(race_list, quali_list)

    # driver details (number, birth date, nationality) from the standings call
    lists = get("current/driverstandings.json")["StandingsTable"]["StandingsLists"]
    info = {s["Driver"]["driverId"]: s["Driver"] for s in lists[0]["DriverStandings"]} if lists else {}

    cache, files, index = {}, {}, []
    for row in standings_rows:
        did = row["id"]
        d = info.get(did, {})
        c = career(did, season_now, cache)
        files[did] = {
            "id": did,
            "name": row["driver"],
            "first": d.get("givenName", ""),
            "last": d.get("familyName", ""),
            "code": row["code"],
            "number": d.get("permanentNumber"),
            "nationality": d.get("nationality"),
            "age": age_on(d["dateOfBirth"], today) if d.get("dateOfBirth") else None,
            "team": row["team"],
            "season": {
                "year": season_now,
                "pos": row["pos"],
                "points": row["points"],
                "wins": row["wins"],
                "rounds": rounds.get(did, []),
                "teammates": teammates.get(did, []),
            },
            "career": c,
        }
        index.append({
            "id": did, "name": row["driver"], "code": row["code"],
            "number": d.get("permanentNumber"), "team": row["team"],
            "pos": row["pos"], "points": row["points"],
            "nationality": d.get("nationality"),
            "wins": c["wins"], "titles": c["titles"], "races": c["races"],
        })
        print(f"  {row['code']}: {c['races']} races, {c['wins']} wins, {c['titles']} titles")
    return index, files
