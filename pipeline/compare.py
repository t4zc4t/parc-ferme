"""Data for the compare page: a search list of every driver and one results file each."""
from collections import defaultdict


def is_pole(rnd, quali, row):
    # qualifying where we have it, the starting grid where we don't (before 1994, gaps in 1996-2002)
    return quali.get(row["d"]) == 1 if rnd["quali"] else row["grid"] == 1


def classified(status):
    return bool(status) and (status == "Finished" or status.startswith("+") or status == "Lapped")


def build(seasons, names, current):
    races = defaultdict(list)
    seasons_of = defaultdict(dict)

    for s in seasons:
        year = s["year"]
        final = {x["d"]: x for x in s["standings"]["drivers"]}
        teams_this_year = defaultdict(set)
        for r in s["rounds"]:
            quali = {q["d"]: q["pos"] for q in r["quali"]}
            for row in r["results"]:
                d = row["d"]
                # [year, round, team, grid, quali, finish, order, classified, points, pole]
                races[d].append([year, r["round"], row["c"], row["grid"], quali.get(d), row["text"] or "",
                                 row["pos"], 1 if classified(row["status"]) else 0, row["pts"] or 0,
                                 1 if is_pole(r, quali, row) else 0])
                teams_this_year[d].add(row["c"])
        for d, teams in teams_this_year.items():
            st = final.get(d)
            seasons_of[d][year] = {
                "year": year, "teams": sorted(teams),
                "pos": (st["text"] or str(st["pos"])) if st else None,
                "points": st["pts"] if st else 0,
            }

    done = {s["year"] for s in seasons if s["complete"] and s["year"] != current["year"]}
    people, files = [], {}
    for d, rows in races.items():
        yrs = [seasons_of[d][y] for y in sorted(seasons_of[d])]
        titles = sum(1 for x in yrs if x["pos"] == "1" and x["year"] in done)
        wins = sum(1 for r in rows if r[5] == "1")
        people.append([d, names.driver(d), names.code(d), yrs[0]["year"], yrs[-1]["year"], len(rows), wins, titles])
        info = names.drivers.get(d, {})
        files[d] = {
            "id": d, "name": names.driver(d), "code": names.code(d), "nat": info.get("nat"),
            "titles": titles, "seasons": yrs, "races": rows,
        }

    # most races first, so the search list starts with the names people look for
    people.sort(key=lambda p: (-p[5], p[1]))
    teams = {c: names.team(c) for c in {c for f in files.values() for y in f["seasons"] for c in y["teams"]}}
    return {"season": current["year"], "teams": teams, "drivers": people}, files
