"""Longer studies for the studies page, worked out from every season in the store.

Each study is {id, title, answer, intro, parts: [{h, text, chart}], method}.
Charts use the same shapes as the questions page.
"""
import statistics
from collections import Counter, defaultdict

NO_START = {"Withdrew", "Did not start", "Not restarted"}
CRASH = {"Accident", "Collision", "Spun off", "Collision damage", "Fatal accident", "Damage",
         "Broken wing", "Puncture", "Tyre puncture", "Debris"}
# not the car and not a crash: lapped out, excluded, the driver, fuel, or no reason given
OTHER = {"Retired", "Disqualified", "Excluded", "Not classified", "Lapped", "Physical", "Injury",
         "Injured", "Illness", "Driver unwell", "Eye injury", "Out of fuel", "Underweight",
         "Safety concerns", "Safety", "Fuel rig", "Refuelling"}
VAGUE_FROM = 2023                        # from here the records only say "Retired"


def build(seasons, names):
    out = []
    for make in (car_or_driver, dnf):
        try:
            out.append(make(seasons, names))
        except (KeyError, IndexError, ValueError, ZeroDivisionError) as err:
            print(f"study {make.__name__} skipped: {err}")
    return {"season": seasons[-1]["year"], "studies": out}


def races(s):
    """championship races, without the Indy 500 that counted in the 1950s"""
    for r in s["rounds"]:
        if r["results"] and not (r["circuit"]["id"] == "indianapolis" and s["year"] <= 1960):
            yield r


def started(r):
    return [x for x in r["results"] if x["status"] not in NO_START]


def finished(x):
    return x["text"].isdigit()


def decade(y):
    return y // 10 * 10


def team_points(s):
    pts = Counter()
    for r in races(s):
        for x in r["results"]:
            pts[x["c"]] += x["pts"] or 0
    return pts


def pct(a, b):
    return round(100 * a / b) if b else 0


# ---- car or driver ----

def car_share(s):
    """how much of the spread in drivers' results lines up with their team, 0 to 1"""
    rr = list(races(s))
    score, team = defaultdict(list), defaultdict(Counter)
    for r in rr:
        field = sorted(started(r), key=lambda x: x["pos"])
        if len(field) < 2:
            continue
        for i, x in enumerate(field):
            score[x["d"]].append(1 - i / (len(field) - 1))
            team[x["d"]][x["c"]] += 1
    rows = [(statistics.mean(v), team[d].most_common(1)[0][0])
            for d, v in score.items() if len(v) >= max(4, len(rr) // 2)]
    if len(rows) < 6:
        return None
    total = statistics.pvariance([v for v, _ in rows])
    by_team = defaultdict(list)
    for v, c in rows:
        by_team[c].append(v)
    inside = sum(sum((x - statistics.mean(v)) ** 2 for x in v) for v in by_team.values()) / len(rows)
    return 1 - inside / total if total else None


def car_or_driver(seasons, names):
    shares = defaultdict(list)
    for s in seasons:
        v = car_share(s)
        if v is not None:
            shares[decade(s["year"])].append(v)
    share_rows = [{"label": f"{d}s", "value": round(100 * statistics.mean(v)),
                   "display": f"{round(100 * statistics.mean(v))}%"} for d, v in sorted(shares.items())]
    share_rows[-1]["hot"] = True

    # champions and the best car, by most points scored by the team
    best, misses = defaultdict(lambda: [0, 0]), []
    for s in seasons:
        if not s["complete"]:
            continue
        champ = s["standings"]["drivers"][0]["d"]
        mine = Counter(x["c"] for r in races(s) for x in r["results"] if x["d"] == champ)
        top = team_points(s).most_common(1)[0][0]
        best[decade(s["year"])][1] += 1
        if mine and mine.most_common(1)[0][0] == top:
            best[decade(s["year"])][0] += 1
        else:
            order = [c for c, _ in team_points(s).most_common()]
            misses.append((s["year"], champ, order.index(mine.most_common(1)[0][0]) + 1, mine.most_common(1)[0][0]))
    best_rows = [{"label": f"{d}s", "value": pct(a, b), "display": f"{a} of {b}"} for d, (a, b) in sorted(best.items())]
    seasons_done = sum(b for _, b in best.values())
    in_best = sum(a for a, _ in best.values())
    recent = [m for m in misses if m[0] >= 1990]
    second = sum(1 for m in misses if m[2] == 2)
    lowest = max(misses, key=lambda m: (m[2], -m[0]))

    # beating the teammate, races where both cars finished
    duel = defaultdict(lambda: [0, 0])
    for s in seasons:
        for r in races(s):
            cars = defaultdict(list)
            for x in started(r):
                if finished(x):
                    cars[x["c"]].append(x)
            for xs in cars.values():
                for a in xs:
                    for b in xs:
                        if a is not b:
                            duel[a["d"]][1] += 1
                            duel[a["d"]][0] += a["pos"] < b["pos"]
    beat = sorted(((w / n, d, w, n) for d, (w, n) in duel.items() if n >= 100), reverse=True)[:10]
    top_share, top_d, _, top_n = beat[0]
    now = share_rows[-1]

    return {
        "id": "car-or-driver",
        "title": "Car or driver?",
        "answer": f"Mostly the car, and more than ever. Today about {now['value']}% of the gap between drivers' results "
                  f"lines up with the team they drive for, against {share_rows[0]['value']}% in the 1950s.",
        "intro": "Every fan argument ends up here. Would a great driver win in a slow car, and would an average one "
                 "win in the best car? The archive can't settle it for any one driver, but across 75 years of results "
                 "it shows clearly how much the car has come to decide.",
        "parts": [
            {"h": "How much the team explains",
             "text": "For each season we take every regular driver's average finishing place and ask how much of the "
                     "spread between them disappears once you know their team. If teammates always finished side by "
                     "side it would be 100%. It has climbed almost every decade, as cars became harder to build, "
                     "teams fewer and better funded, and the gap between the best and worst car grew.",
             "chart": {"type": "bars", "title": "Share of the spread in results that lines up with the team",
                       "rows": share_rows, "unit": "%"}},
            {"h": "Champions in the best car",
             "text": f"In {in_best} of {seasons_done} finished seasons the champion drove for the team that scored "
                     "the most points that year. The exceptions are the famous ones, like "
                     + ", ".join(f"{names.driver(d).split()[-1]} in {y}" for y, d, _, _ in recent[-4:])
                     + f". Even then the car was close: in {second} of those {len(misses)} seasons the champion's team "
                     f"was second, and the lowest was {names.driver(lowest[1])}'s {names.team(lowest[3])} in {lowest[0]}, "
                     f"{['', 'first', 'second', 'third', 'fourth', 'fifth'][lowest[2]]}.",
             "chart": {"type": "bars", "title": "Seasons where the champion drove for the top scoring team",
                       "rows": best_rows, "unit": "%"}},
            {"h": "Where the driver still shows",
             "text": "The part the car doesn't explain is the one fans care about. The fairest test is the teammate, "
                     "same car, same day. Counting only races where both cars finished, so breakdowns don't count, "
                     f"{names.driver(top_d)} has finished ahead of his teammate in {round(100 * top_share)}% of "
                     f"{top_n} chances, the best record of anyone with 100 or more.",
             "chart": {"type": "bars", "title": "Finished ahead of the teammate, both cars classified (100+ races)",
                       "rows": [{"label": names.driver(d), "value": round(100 * v),
                                 "display": f"{round(100 * v)}%  {w}/{n}", "href": f"/compare?a={d}",
                                 "hot": i == 0} for i, (v, d, w, n) in enumerate(beat)]}},
        ],
        "method": "Results from every championship race since 1950, without the Indianapolis 500 that counted until "
                  "1960. A regular driver started at least half of a season's races. The best car is the team with "
                  "the most points that season. Teammate records count every pair of cars from the same team in a "
                  "race, so the 1950s, when teams ran four or five cars, give more chances per race.",
    }


# ---- the death of the DNF ----

def dnf(seasons, names):
    fin = defaultdict(lambda: [0, 0])
    why = defaultdict(Counter)
    upset = defaultdict(lambda: [0, 0])
    for s in seasons:
        dec = decade(s["year"])
        top3 = {c for c, _ in team_points(s).most_common(3)}
        for r in races(s):
            field = started(r)
            fin[dec][0] += sum(1 for x in field if finished(x))
            fin[dec][1] += len(field)
            if s["year"] < VAGUE_FROM:
                for x in field:
                    st = x["status"]
                    why[dec]["starts"] += 1
                    if finished(x) or st.startswith("+"):
                        continue
                    why[dec]["crash" if st in CRASH else "other" if st in OTHER else "car"] += 1
            win = next((x for x in r["results"] if x["text"] == "1"), None)
            if win and s["complete"]:
                upset[dec][1] += 1
                upset[dec][0] += win["c"] not in top3

    fin_rows = [{"label": f"{d}s", "value": pct(a, b), "display": f"{pct(a, b)}%"} for d, (a, b) in sorted(fin.items())]
    worst = min(fin_rows, key=lambda x: x["value"])
    worst["hot"] = True
    last = max(why)
    why_rows = [{"label": f"{d}s" if d != last else f"{d}–{VAGUE_FROM % 100 - 1}",
                 "values": [f"{pct(c['car'], c['starts'])}%", f"{pct(c['crash'], c['starts'])}%"],
                 "better": None} for d, c in sorted(why.items())]
    car_then = max(pct(c["car"], c["starts"]) for c in why.values())
    car_now = pct(why[last]["car"], why[last]["starts"])
    up_rows = [{"label": f"{d}s", "value": pct(a, b), "display": f"{pct(a, b)}%"} for d, (a, b) in sorted(upset.items())]
    peak = max(up_rows, key=lambda x: x["value"])
    peak["hot"] = True
    now = fin_rows[-1]

    return {
        "id": "death-of-the-dnf",
        "title": "The death of the DNF",
        "answer": f"Cars used to break all the time. In the {worst['label']} only {worst['value']}% of starters saw the "
                  f"flag, now it's {now['value']}%, and races got more predictable because of it.",
        "intro": "Retirements used to be part of the show. A leader's engine could let go with three laps left and "
                 "hand the win to someone nobody expected. That has almost gone, and it changed how races are won.",
        "parts": [
            {"h": "Who makes it to the flag",
             "text": f"Until 2000 about half the field finished. The low point was the {worst['label']}, with "
                     "turbo engines, tiny fuel limits and 26 car grids. Things turned in the 2000s, when engines had "
                     "to last more than one race weekend and teams got far better at testing parts before races.",
             "chart": {"type": "bars", "title": "Starters who finished the race", "rows": fin_rows, "unit": "%"}},
            {"h": "Why they stopped",
             "text": f"At worst a driver had a {car_then}% chance of their car breaking in any race, about two races "
                     f"in five. By the early 2020s it was {car_now}%. Crashes went the other way for a while, peaking in "
                     "the 1990s, and are now about as common as breakdowns, so a modern retirement is as likely to be "
                     f"the driver's fault as the car's. From {VAGUE_FROM} the official records just "
                     "say \"Retired\" without a reason, so the table stops there.",
             "chart": {"type": "pairs", "title": "Share of starts that ended early", "cols": ["CAR BROKE", "CRASHED"],
                       "rows": why_rows}},
            {"h": "What it did to racing",
             "text": f"When cars broke, the fast teams lost wins they deserved. In the {peak['label']} {peak['value']}% "
                     "of races went to a team outside that season's top three. With cars that never fail, the best "
                     "car nearly always gets its result, which is a big part of why the order feels so fixed now.",
             "chart": {"type": "bars", "title": "Wins for a team outside that season's top three", "rows": up_rows,
                       "unit": "%"}},
        ],
        "method": "Every championship race since 1950, without the Indianapolis 500 that counted until 1960. Starters "
                  "leave out cars that withdrew or didn't start. A car is counted as broken for any mechanical cause "
                  "(engine, gearbox, brakes and so on), a crash covers accidents, collisions, spins and damage. Drivers "
                  "running at the end but too far behind to be classified count as not finishing. Top three teams are "
                  "by points that season, finished seasons only.",
    }
