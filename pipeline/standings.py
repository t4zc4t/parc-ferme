"""Standings page data: every season's points round by round, plus who led the stats.

One file per season, site/standings/<year>.json:
  rounds   [{round, name, sprint}] the rounds run so far
  drivers  [{id, name, code, team, pts: [running total after each round], pos, final,
            wins, podiums, poles, fastest, scored, dnfs, starts}] in the official order,
           pos and final are the official place and points
  teams    [{id, name, pts, wins}] from 1958, when the constructors' title began
  complete true once the season is over
  dropped  true before 1991, when only a driver's best results counted, so running
           totals can end higher than the official points
"""
from compare import classified, is_pole

FIRST_TEAMS = 1958


def season(s, names):
    rounds = [r for r in s["rounds"] if r["results"]]
    n = len(rounds)
    drivers, teams = {}, {}

    def driver(d, c):
        if d not in drivers:
            drivers[d] = {"id": d, "name": names.driver(d), "code": names.code(d), "team": names.team(c),
                          "add": [0] * n, "wins": 0, "podiums": 0, "poles": 0, "fastest": 0,
                          "scored": 0, "dnfs": 0, "starts": 0}
        drivers[d]["team"] = names.team(c)
        return drivers[d]

    def team(c):
        if c not in teams:
            teams[c] = {"id": c, "name": names.team(c), "add": [0] * n, "wins": 0}
        return teams[c]

    for i, r in enumerate(rounds):
        quali = {q["d"]: q["pos"] for q in r["quali"]}
        for row in r["results"] + (r.get("sprint") or []):
            sprint = row not in r["results"]
            x = driver(row["d"], row["c"])
            pts = row.get("pts") or 0
            x["add"][i] += pts
            team(row["c"])["add"][i] += pts
            if sprint:
                continue
            x["starts"] += 1
            if row["text"] == "1":
                x["wins"] += 1
                team(row["c"])["wins"] += 1
            if row["text"] in ("1", "2", "3"):
                x["podiums"] += 1
            if is_pole(r, quali, row):
                x["poles"] += 1
            if str(row.get("fl") or "") == "1":
                x["fastest"] += 1
            if pts > 0:
                x["scored"] += 1
            if not classified(row["status"]):
                x["dnfs"] += 1

    def running(add):
        out, total = [], 0
        for v in add:
            total += v
            out.append(round(total, 1) if total % 1 else int(total))
        return out

    order = {x["d"]: k for k, x in enumerate(s["standings"]["drivers"])}
    final = {x["d"]: x for x in s["standings"]["drivers"]}
    out_d = []
    for x in sorted(drivers.values(), key=lambda x: (order.get(x["id"], 999), -sum(x["add"]))):
        x["pts"] = running(x.pop("add"))
        st = final.get(x["id"])
        x["pos"] = (st["text"] or str(st["pos"])) if st else "-"
        x["final"] = st["pts"] if st else x["pts"][-1]
        out_d.append(x)
    out_t = []
    if s["year"] >= FIRST_TEAMS:
        torder = {x["c"]: k for k, x in enumerate(s["standings"]["teams"])}
        for x in sorted(teams.values(), key=lambda x: (torder.get(x["id"], 999), -sum(x["add"]))):
            x["pts"] = running(x.pop("add"))
            out_t.append(x)
    return {
        "year": s["year"],
        "complete": bool(s["complete"]),
        "dropped": s["year"] < 1991,
        "total": len(s["rounds"]),
        "rounds": [{"round": r["round"], "name": r["name"].replace(" Grand Prix", " GP"),
                    "sprint": bool(r.get("sprint"))} for r in rounds],
        "drivers": out_d,
        "teams": out_t,
    }


def build(seasons, names, out):
    """returns True if any file changed"""
    import store
    changed = False
    years = []
    for s in seasons:
        if not any(r["results"] for r in s["rounds"]):
            continue
        changed |= store.write_json(out / "standings" / f"{s['year']}.json", season(s, names))
        years.append(s["year"])
    changed |= store.write_json(out / "standings" / "index.json", {"years": sorted(years, reverse=True)})
    return changed
