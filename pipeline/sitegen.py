"""Store -> site/*.json for the pages. No API calls."""
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

import compare
from compare import is_pole
import store
import title

LABELS = {
    "FP1": "Practice 1", "FP2": "Practice 2", "FP3": "Practice 3",
    "SQ": "Sprint qualifying", "SR": "Sprint", "Q": "Qualifying", "R": "Grand Prix",
}
# rough session lengths
MINUTES = {"FP1": 60, "FP2": 60, "FP3": 60, "SQ": 45, "SR": 60, "Q": 60, "R": 120}
ORDER = ["FP1", "FP2", "FP3", "SQ", "SR", "Q", "R"]


def when(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")) if iso else None


def iso(dt):
    return dt.isoformat().replace("+00:00", "Z")


def classified(status):
    return bool(status) and (status == "Finished" or status.startswith("+") or status == "Lapped")


def session_list(rnd):
    items = [(k, when(v)) for k, v in rnd["sessions"].items() if v]
    items.sort(key=lambda kv: (kv[1], ORDER.index(kv[0])))
    return items


def has_data(rnd, kind):
    return bool({"R": rnd["results"], "Q": rnd["quali"], "SR": rnd["sprint"]}.get(kind))


class Names:
    """Driver and team names, newest season wins."""
    def __init__(self, seasons):
        self.drivers, self.teams = {}, {}
        for s in seasons:
            self.drivers.update(s["drivers"])
            self.teams.update(s["teams"])

    def driver(self, did):
        d = self.drivers.get(did, {})
        return f"{d.get('first', '')} {d.get('last', did)}".strip()

    def code(self, did):
        return self.drivers.get(did, {}).get("code") or did[:3].upper()

    def team(self, cid):
        return self.teams.get(cid, {}).get("name", cid)


def row_out(r, names):
    return {
        "pos": r["text"] if r["text"] not in (None, "") else r["pos"],
        "id": r["d"], "driver": names.driver(r["d"]), "code": names.code(r["d"]),
        "team": names.team(r["c"]), "grid": r.get("grid"),
        "gap": r.get("time") or r.get("status"), "points": r.get("pts", 0),
    }


def standings_out(season, names):
    return [{
        "pos": s["text"] or s["pos"], "id": s["d"], "driver": names.driver(s["d"]),
        "code": names.code(s["d"]), "team": names.team(s["c"][-1]) if s["c"] else "",
        "wins": s["wins"], "points": s["pts"],
    } for s in season["standings"]["drivers"]]


def team_standings_out(season, names):
    return [{
        "pos": s["text"] or s["pos"], "id": s["c"], "team": names.team(s["c"]),
        "wins": s["wins"], "points": s["pts"],
    } for s in season["standings"]["teams"]]


def home(season, names):
    rounds = season["rounds"]
    done = [r for r in rounds if r["results"]]
    last = done[-1] if done else None
    after = season["standings"]["round"]
    last_gp = last["round"] if last else 0
    note = f"AFTER ROUND {last_gp} + ROUND {after} SPRINT" if after > last_gp else f"AFTER ROUND {after}"

    out = {
        "season": season["year"],
        "rounds": len(rounds),
        "afterRound": after,
        "standingsNote": note,
        "standings": standings_out(season, names),
        "teams": team_standings_out(season, names),
        "lastRace": None,
    }
    if last:
        start = when(last["sessions"]["R"])
        out["lastRace"] = {
            "round": last["round"], "name": last["name"],
            "dateLabel": f"{start.day} {start.strftime('%b %Y')}",
            "results": [row_out(r, names) for r in last["results"][:10]],
        }
    return out


def schedule(season, names):
    """next/live is worked out in the browser, so this only changes with real data"""
    rounds_out = []
    for r in season["rounds"]:
        sessions = []
        for kind, start in session_list(r):
            end = start + timedelta(minutes=MINUTES[kind])
            top = []
            src = {"R": r["results"], "Q": r["quali"], "SR": r["sprint"]}.get(kind) or []
            for row in src[:3]:
                top.append({"id": row["d"], "code": names.code(row["d"]), "driver": names.driver(row["d"]),
                            "team": names.team(row["c"])})
            sessions.append({"type": kind, "label": LABELS[kind], "start": iso(start), "end": iso(end),
                             "results": kind in ("Q", "SR", "R"), "top3": top})
        first, race = sessions[0]["start"] if sessions else None, r["sessions"]["R"]
        winner = r["results"][0] if r["results"] else None
        rounds_out.append({
            "round": r["round"], "name": r["name"], "circuit": r["circuit"],
            "start": first, "race": race, "sprint": "SR" in r["sessions"],
            "winner": {"id": winner["d"], "driver": names.driver(winner["d"]), "code": names.code(winner["d"]),
                       "team": names.team(winner["c"])} if winner else None,
            "sessions": sessions,
        })
    return {"season": season["year"], "rounds": rounds_out}


def age_on(dob, today):
    born = date.fromisoformat(dob)
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def drivers(seasons, current, names, today):
    grid = current["standings"]["drivers"]
    wanted = {s["d"] for s in grid}
    career = defaultdict(lambda: {"rows": [], "poles": 0, "seasons": {}})

    for s in seasons:
        final = {x["d"]: x for x in s["standings"]["drivers"]}
        for r in s["rounds"]:
            quali = {q["d"]: q["pos"] for q in r["quali"]}
            for row in r["results"]:
                if row["d"] in wanted:
                    c = career[row["d"]]
                    c["poles"] += is_pole(r, quali, row)
                    c["rows"].append((s["year"], r, row))
                    yrs = c["seasons"].setdefault(s["year"], {"teams": [], "races": 0})
                    yrs["races"] += 1
                    team = names.team(row["c"])
                    if team not in yrs["teams"]:
                        yrs["teams"].append(team)
        for did in wanted:
            if did in career and s["year"] in career[did]["seasons"]:
                st = final.get(did, {})
                career[did]["seasons"][s["year"]].update(
                    {"pos": st.get("text") or st.get("pos"), "points": st.get("pts"), "wins": st.get("wins", 0)})

    rounds_this, duels = this_season(current)
    files, index = {}, []
    for st in grid:
        did = st["d"]
        c = career[did]
        rows = [row for _, _, row in c["rows"]]
        wins = sum(1 for r in rows if r["pos"] == 1 and r["text"] == "1")
        podiums = sum(1 for r in rows if r["text"] in ("1", "2", "3"))
        seasons_out = [{"year": y, **v, "pos": str(v.get("pos")) if v.get("pos") is not None else None}
                       for y, v in sorted(c["seasons"].items())]
        titles = sum(1 for x in seasons_out if x["pos"] == "1" and x["year"] < current["year"])
        points = sum(x["points"] or 0 for x in seasons_out)
        first = c["rows"][0] if c["rows"] else None
        info = names.drivers.get(did, {})
        team = names.team(st["c"][-1]) if st["c"] else ""
        files[did] = {
            "id": did, "name": names.driver(did), "first": info.get("first", ""), "last": info.get("last", ""),
            "code": names.code(did), "number": info.get("number"), "nationality": info.get("nat"),
            "age": age_on(info["dob"], today) if info.get("dob") else None, "team": team,
            "season": {"year": current["year"], "pos": st["text"] or st["pos"], "points": st["pts"],
                       "wins": st["wins"], "rounds": rounds_this.get(did, []), "teammates": duels.get(did, [])},
            "career": {
                "races": len(rows), "wins": wins, "podiums": podiums, "poles": c["poles"], "titles": titles,
                "points": round(points, 1) if not float(points).is_integer() else int(points),
                "pointsFinishes": sum(1 for r in rows if (r["pts"] or 0) > 0),
                "finishRate": round(100 * sum(1 for r in rows if classified(r["status"])) / len(rows)) if rows else 0,
                "bestFinish": min((r["pos"] for r in rows if r["pos"]), default=None),
                "debut": {"year": first[0], "race": first[1]["name"]} if first else None,
                "seasons": seasons_out,
            },
        }
        index.append({"id": did, "name": names.driver(did), "code": names.code(did), "number": info.get("number"),
                      "team": team, "pos": st["text"] or st["pos"], "points": st["pts"], "nationality": info.get("nat"),
                      "wins": wins, "titles": titles, "races": len(rows)})
    return index, files


def this_season(season):
    by_driver = defaultdict(list)
    pairs = defaultdict(Counter)
    duels = defaultdict(lambda: defaultdict(lambda: {"race": [0, 0], "quali": [0, 0]}))
    for r in season["rounds"]:
        grids = {q["d"]: q["pos"] for q in r["quali"]}
        teams = defaultdict(list)
        for row in r["results"]:
            teams[row["c"]].append(row)
            by_driver[row["d"]].append({
                "round": r["round"], "race": r["name"].replace(" Grand Prix", " GP"),
                "grid": row["grid"], "quali": grids.get(row["d"]), "finish": row["text"],
                "classified": classified(row["status"]), "status": row["status"], "points": row["pts"],
            })
        for rows in teams.values():
            if len(rows) != 2:
                continue
            a, b = rows
            ia, ib = a["d"], b["d"]
            pairs[ia][ib] += 1
            pairs[ib][ia] += 1
            win = 0 if a["pos"] < b["pos"] else 1
            duels[ia][ib]["race"][win] += 1
            duels[ib][ia]["race"][1 - win] += 1
            qa, qb = grids.get(ia), grids.get(ib)
            if qa and qb:
                win = 0 if qa < qb else 1
                duels[ia][ib]["quali"][win] += 1
                duels[ib][ia]["quali"][1 - win] += 1
    teammates = {}
    for did, mates in pairs.items():
        teammates[did] = [{"id": m, "name": m, "rounds": n, **duels[did][m]}
                          for m, n in mates.most_common()]
    return by_driver, teammates


def build(now=None):
    now = now or datetime.now(timezone.utc)
    seasons = list(store.all_seasons())
    if not seasons:
        raise RuntimeError("the store is empty")
    current = seasons[-1]
    names = Names(seasons)
    stamp = iso(now.replace(second=0, microsecond=0))

    out = store.ROOT / "site"
    h = home(current, names)
    h["title"] = title.build(current, names)
    sched = schedule(current, names)
    index, files = drivers(seasons, current, names, now.date())
    chances = {d["id"]: d for d in (h["title"] or {}).get("drivers", [])}
    for did, f in files.items():
        for t in f["season"]["teammates"]:
            t["name"] = names.driver(t["id"])
        if did in chances:
            f["season"]["title"] = {**chances[did], "racesLeft": h["title"]["racesLeft"],
                                    "sprintsLeft": h["title"]["sprintsLeft"], "sims": h["title"]["sims"]}

    changed = False
    changed |= store.write_json(out / "home.json", h)
    changed |= store.write_json(out / "schedule.json", sched)
    changed |= store.write_json(out / "drivers.json", {"season": current["year"], "drivers": index})
    for did, f in files.items():
        changed |= store.write_json(out / "drivers" / f"{did}.json", f)
    people, results = compare.build(seasons, names, current)
    changed |= store.write_json(out / "people.json", people)
    for did, f in results.items():
        changed |= store.write_json(out / "results" / f"{did}.json", f)
    # only bumps when something changed
    if changed or not (out / "meta.json").exists():
        store.write_json(out / "meta.json", {"updated": stamp, "season": current["year"]})
    return changed
