"""Circuit, team and career pages for everything since 1950, and a wrapped page per season.

  circuits/index.json, circuits/<id>.json   every circuit, its winners, records and shape
  teams/index.json, teams/<id>.json         every constructor, seasons, drivers, titles
  careers/<id>.json                         every driver's career, season by season
  wrapped/index.json, wrapped/<year>.json   a finished season told in a dozen numbers
"""
from collections import Counter, defaultdict

from compare import classified, is_pole
import store
import trivia

NOT_STARTED = {"W", "F", "E"}


def secs(text):
    """'+1:19.183' or '+0.312' as seconds, None for anything else"""
    if not text or not str(text).startswith("+") or "lap" in str(text).lower():
        return None
    try:
        parts = [float(p) for p in str(text)[1:].split(":")]
    except ValueError:
        return None
    return parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0]


def span(years):
    years = sorted(years)
    return str(years[0]) if years[0] == years[-1] else f"{years[0]}–{years[-1]}"


def build(seasons, names, out, grid):
    """True if any file changed. grid: ids of this season's drivers, who have the full page"""
    nm, tm = names.driver, names.team
    changed = False
    races = [(s["year"], r) for s in seasons for r in s["rounds"] if r["results"]]

    # ---- per driver and team tallies in one pass ----
    car = defaultdict(lambda: {"starts": 0, "wins": [], "podiums": 0, "poles": 0, "fastest": 0, "points": 0.0,
                               "best": None, "first": None, "last": None, "teams": defaultdict(set),
                               "seasons": defaultdict(lambda: {"races": 0, "wins": 0, "podiums": 0, "poles": 0, "teams": Counter()})})
    team = defaultdict(lambda: {"entries": set(), "wins": [], "podiums": 0, "poles": 0, "one_two": 0,
                                "drivers": defaultdict(lambda: {"races": 0, "wins": 0, "podiums": 0, "years": set()})})
    circuit = defaultdict(lambda: {"races": [], "info": None})
    for year, r in races:
        quali = {q["d"]: q["pos"] for q in r["quali"]}
        rid = {"year": year, "round": r["round"], "name": r["name"]}
        top2 = [x for x in r["results"] if x["text"] in ("1", "2")]
        if len(top2) == 2 and top2[0]["c"] == top2[1]["c"]:
            team[top2[0]["c"]]["one_two"] += 1
        win = pole = None
        for row in r["results"]:
            d, c, text = row["d"], row["c"], row["text"] or ""
            x, t = car[d], team[c]
            if text in NOT_STARTED:
                continue
            x["starts"] += 1
            x["first"] = x["first"] or rid
            x["last"] = rid
            x["teams"][c].add(year)
            ss = x["seasons"][year]
            ss["races"] += 1
            ss["teams"][c] += 1
            x["points"] += row.get("pts") or 0
            t["entries"].add((year, r["round"]))
            td = t["drivers"][d]
            td["races"] += 1
            td["years"].add(year)
            if text.isdigit():
                p = int(text)
                x["best"] = p if x["best"] is None else min(x["best"], p)
            if is_pole(r, quali, row):
                x["poles"] += 1
                ss["poles"] += 1
                t["poles"] += 1
                pole = d
            if str(row.get("fl") or "") == "1":
                x["fastest"] += 1
            if text in ("1", "2", "3"):
                x["podiums"] += 1
                ss["podiums"] += 1
                t["podiums"] += 1
                td["podiums"] += 1
            if text == "1":
                w = dict(rid, grid=row["grid"], team=c, circuit=r["circuit"]["id"])
                x["wins"].append(w)
                ss["wins"] += 1
                t["wins"].append(dict(rid, driver=d))
                td["wins"] += 1
                win = (d, c)
        cid = r["circuit"]["id"]
        circuit[cid]["info"] = r["circuit"]
        circuit[cid]["races"].append(dict(rid, winner=win, pole=pole))

    titles = defaultdict(list)
    team_titles = defaultdict(list)
    champ_team = {}
    standing = {}
    for s in seasons:
        st = s["standings"]
        if st["drivers"]:
            standing[s["year"]] = st
        if s["complete"] and st["drivers"]:
            d = st["drivers"][0]["d"]
            titles[d].append(s["year"])
            champ_team[s["year"]] = car[d]["seasons"][s["year"]]["teams"].most_common(1)[0][0] if car[d]["seasons"][s["year"]]["teams"] else None
            if st["teams"]:
                team_titles[st["teams"][0]["c"]].append(s["year"])

    shapes = trivia.tracks([s for s in seasons if s["year"] >= 2026])
    person = lambda d: {"id": d, "name": nm(d)}

    # ---- circuits ----
    index = []
    for cid, c in circuit.items():
        info, rs = c["info"], c["races"]
        wins = Counter(x["winner"][0] for x in rs if x["winner"])
        poles = Counter(x["pole"] for x in rs if x["pole"])
        teams = Counter(x["winner"][1] for x in rs if x["winner"])
        both = [x for x in rs if x["winner"] and x["pole"]]
        page = {
            "id": cid, "name": info["name"], "locality": info.get("locality"), "country": info.get("country"),
            "held": len(rs), "first": rs[0]["year"], "last": rs[-1]["year"],
            "track": shapes.get(cid, (None, None))[1],
            "poleWins": round(100 * sum(1 for x in both if x["winner"][0] == x["pole"]) / len(both)) if both else None,
            "topDrivers": [dict(person(d), wins=n) for d, n in wins.most_common(8)],
            "topPoles": [dict(person(d), poles=n) for d, n in poles.most_common(5)],
            "topTeams": [{"id": t, "name": tm(t), "wins": n} for t, n in teams.most_common(6)],
            "races": [dict(x, winner=(dict(person(x["winner"][0]), team=tm(x["winner"][1])) if x["winner"] else None),
                           pole=(person(x["pole"]) if x["pole"] else None)) for x in reversed(rs)],
        }
        changed |= store.write_json(out / "circuits" / f"{cid}.json", page)
        top = wins.most_common(1)
        index.append({"id": cid, "name": info["name"], "locality": info.get("locality"), "country": info.get("country"),
                      "held": len(rs), "first": rs[0]["year"], "last": rs[-1]["year"], "track": page["track"],
                      "king": dict(person(top[0][0]), wins=top[0][1]) if top else None})
    index.sort(key=lambda x: (-x["last"], -x["held"], x["name"]))
    changed |= store.write_json(out / "circuits" / "index.json", {"circuits": index})

    # ---- teams ----
    index = []
    for cid, t in team.items():
        if not t["entries"]:
            continue
        years = sorted({y for y, _ in t["entries"]})
        seasons_out = []
        for y in years:
            st = standing.get(y)
            row = next((x for x in st["teams"] if x["c"] == cid), None) if st else None
            seasons_out.append({"year": y, "pos": row["pos"] if row else None, "pts": row["pts"] if row else None,
                                "wins": sum(1 for w in t["wins"] if w["year"] == y)})
        drivers = sorted(t["drivers"].items(), key=lambda kv: (-kv[1]["races"], kv[0]))
        page = {
            "id": cid, "name": tm(cid), "nat": names.teams.get(cid, {}).get("nat"), "first": years[0], "last": years[-1],
            "entries": len(t["entries"]), "wins": len(t["wins"]), "podiums": t["podiums"], "poles": t["poles"],
            "oneTwos": t["one_two"], "titles": team_titles.get(cid, []),
            "driverTitles": [{"year": y, **person(titles_d)} for titles_d, ys in titles.items() for y in ys if champ_team.get(y) == cid],
            "firstWin": dict(t["wins"][0], driver=person(t["wins"][0]["driver"])) if t["wins"] else None,
            "lastWin": dict(t["wins"][-1], driver=person(t["wins"][-1]["driver"])) if t["wins"] else None,
            "seasons": seasons_out,
            "drivers": [dict(person(d), races=v["races"], wins=v["wins"], podiums=v["podiums"], years=span(v["years"]))
                        for d, v in drivers[:60]],
        }
        page["driverTitles"].sort(key=lambda x: x["year"])
        changed |= store.write_json(out / "teams" / f"{cid}.json", page)
        index.append({"id": cid, "name": page["name"], "first": years[0], "last": years[-1], "wins": page["wins"],
                      "titles": len(page["titles"]), "entries": page["entries"]})
    index.sort(key=lambda x: (-x["last"], -x["wins"], x["name"]))
    changed |= store.write_json(out / "teams" / "index.json", {"teams": index})

    # ---- careers ----
    for d, x in car.items():
        if not x["starts"]:
            continue
        info = names.drivers.get(d, {})
        seasons_out = []
        for y in sorted(x["seasons"]):
            ss = x["seasons"][y]
            st = standing.get(y)
            row = next((s for s in st["drivers"] if s["d"] == d), None) if st else None
            seasons_out.append({"year": y, "teams": [tm(c) for c, _ in ss["teams"].most_common()],
                                "races": ss["races"], "wins": ss["wins"], "podiums": ss["podiums"], "poles": ss["poles"],
                                "pos": (row["text"] or row["pos"]) if row else None, "pts": row["pts"] if row else None})
        page = {
            "id": d, "name": nm(d), "first": info.get("first"), "last": info.get("last"), "code": info.get("code"),
            "nat": info.get("nat"), "dob": info.get("dob"), "number": info.get("number"), "onGrid": d in grid,
            "starts": x["starts"], "wins": len(x["wins"]), "podiums": x["podiums"], "poles": x["poles"],
            "fastest": x["fastest"], "points": round(x["points"], 1) if x["points"] % 1 else int(x["points"]),
            "titles": titles.get(d, []), "best": x["best"], "firstRace": x["first"], "lastRace": x["last"],
            "teams": [{"id": c, "name": tm(c), "years": span(ys)} for c, ys in sorted(x["teams"].items(), key=lambda kv: min(kv[1]))],
            "seasons": seasons_out,
            "winList": [{"year": w["year"], "round": w["round"], "name": w["name"], "grid": w["grid"], "team": tm(w["team"])} for w in x["wins"]],
        }
        changed |= store.write_json(out / "careers" / f"{d}.json", page)

    # ---- wrapped ----
    years = []
    for s in seasons:
        rnds = [r for r in s["rounds"] if r["results"]]
        if not s["complete"] or not rnds or not s["standings"]["drivers"]:
            continue
        w = wrapped(s, rnds, names, car)
        if w:
            changed |= store.write_json(out / "wrapped" / f"{s['year']}.json", w)
            years.append(s["year"])
    changed |= store.write_json(out / "wrapped" / "index.json", {"years": sorted(years, reverse=True)})
    return changed


def wrapped(s, rnds, names, car):
    nm, tm = names.driver, names.team
    year = s["year"]
    st = s["standings"]
    champ, second = st["drivers"][0], st["drivers"][1] if len(st["drivers"]) > 1 else None
    person = lambda d: {"id": d, "name": nm(d)}
    wins, poles, podiums, outs = Counter(), Counter(), Counter(), Counter()
    climbs, close, team_wins, one_two = [], [], Counter(), Counter()
    quali_h2h = defaultdict(lambda: [0, 0])
    running = defaultdict(float)
    leaders, leader = [], None
    max_round = []
    for r in rnds:
        quali = {q["d"]: q["pos"] for q in r["quali"]}
        for x in r["results"]:
            text = x["text"] or ""
            if text in NOT_STARTED:
                continue
            if text == "1":
                wins[x["d"]] += 1
                team_wins[x["c"]] += 1
            if text in ("1", "2", "3"):
                podiums[x["d"]] += 1
            if is_pole(r, quali, x):
                poles[x["d"]] += 1
            if not classified(x["status"]):
                outs[x["d"]] += 1
            if text.isdigit() and x["grid"] and x["grid"] - int(text) > 0:
                climbs.append((x["grid"] - int(text), x["d"], r, int(text), x["grid"]))
            if text == "2" and secs(x.get("time")) is not None:
                close.append((secs(x["time"]), r, x["d"]))
        top2 = [x for x in r["results"] if x["text"] in ("1", "2")]
        if len(top2) == 2 and top2[0]["c"] == top2[1]["c"]:
            one_two[top2[0]["c"]] += 1
        # qualifying battles between team mates
        by_team = defaultdict(list)
        for d, p in quali.items():
            c = next((x["c"] for x in r["results"] if x["d"] == d), None)
            if c and p:
                by_team[c].append((p, d))
        for c, pair in by_team.items():
            if len(pair) == 2:
                (pa, a), (pb, b) = sorted(pair)
                key = tuple(sorted((a, b)))
                quali_h2h[key][0 if key[0] == a else 1] += 1
        # points as they stood after each round, for the lead changes and when the title was settled
        best = 0
        for x in r["results"] + (r.get("sprint") or []):
            running[x["d"]] += x.get("pts") or 0
        best = max((x.get("pts") or 0) for x in r["results"]) + max([x.get("pts") or 0 for x in (r.get("sprint") or [])] or [0])
        max_round.append(best)
        now = max(running, key=lambda d: (running[d], d)) if running else None
        if now != leader:
            leaders.append((r, now))
            leader = now
        r["_table"] = dict(running)
    decided = None
    if year >= 1991 and second:
        for i, r in enumerate(rnds):
            table = sorted(r["_table"].items(), key=lambda kv: -kv[1])
            if len(table) < 2 or table[0][0] != champ["d"]:
                continue
            left = sum(max_round[i + 1:])
            if table[0][1] - table[1][1] > left:
                decided = {"round": r["round"], "name": r["name"], "left": len(rnds) - i - 1}
                break
    for r in rnds:
        r.pop("_table", None)
    rookies = [d for d in running if car[d]["first"] and car[d]["first"]["year"] == year]
    rookie = None
    order = {x["d"]: i for i, x in enumerate(st["drivers"])}
    if rookies:
        d = min(rookies, key=lambda d: order.get(d, 999))
        row = st["drivers"][order[d]] if d in order else None
        rookie = dict(person(d), pos=(row["text"] or row["pos"]) if row else None, pts=row["pts"] if row else 0)
    battles = [(abs(a - b), k, a, b) for k, (a, b) in quali_h2h.items() if a + b >= 8]
    battle = max(battles, key=lambda x: (x[0], x[1])) if battles else None
    climb = max(climbs, key=lambda x: (x[0], -x[3])) if climbs else None
    finish = min(close, key=lambda x: x[0]) if close else None
    top = lambda c: [dict(person(d), n=n) for d, n in c.most_common(3)]
    return {
        "year": year, "races": len(rnds),
        "champion": dict(person(champ["d"]), pts=champ["pts"], wins=wins[champ["d"]]),
        "runnerUp": dict(person(second["d"]), pts=second["pts"], gap=round(champ["pts"] - second["pts"], 1)) if second else None,
        "teams": {"id": st["teams"][0]["c"], "name": tm(st["teams"][0]["c"]), "pts": st["teams"][0]["pts"]} if st["teams"] else None,
        "decided": decided,
        "winners": len(wins), "winnerTeams": len(team_wins),
        "wins": top(wins), "poles": top(poles), "podiums": top(podiums), "dnfs": top(outs),
        "leadChanges": max(0, len(leaders) - 1),
        "leaders": [dict(person(d), round=r["round"], race=r["name"]) for r, d in leaders],
        "climb": {**person(climb[1]), "places": climb[0], "from": climb[4], "to": climb[3], "race": climb[2]["name"],
                  "round": climb[2]["round"]} if climb else None,
        "closest": {**person(finish[2]), "gap": finish[0], "race": finish[1]["name"], "round": finish[1]["round"],
                    "winner": person(next(x["d"] for x in finish[1]["results"] if x["text"] == "1"))} if finish else None,
        "rookie": rookie,
        "battle": {"a": dict(person(battle[1][0]), n=battle[2]), "b": dict(person(battle[1][1]), n=battle[3])} if battle else None,
        "oneTwos": [{"id": c, "name": tm(c), "n": n} for c, n in one_two.most_common(3)],
    }
