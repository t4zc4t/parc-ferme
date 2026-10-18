"""Short data answers for the questions page. Everything comes from the store, no API calls.

Each answer is {id, q, answer, body, chart, links, note}. Charts are either
"bars" (one value per row) or "pairs" (a few drivers side by side, a row per stat).
"""
import statistics
from collections import Counter, defaultdict
from datetime import date

import compare
import laps
import openf1
import store

NOW = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
RULES_YEAR = 2026                       # the new engine and chassis rules
RENAMED = {"sauber": "audi"}            # same team, new name for the new rules


def classified(x):
    return bool(x["text"]) and x["text"].isdigit()


def done_rounds(s):
    return [r for r in s["rounds"] if r["results"]]


def pct(a, b):
    return round(100 * a / b) if b else 0


def build(seasons, names, title):
    by = {s["year"]: s for s in seasons}
    cur = seasons[-1]
    makers = [youngest, hamilton, new_rules, rookies, dominance, overtakers,
              safety_cars, pit_crews, tyres, pole, retirements]
    out = []
    for make in makers:
        try:
            item = make(by, cur, names, title)
        except (KeyError, IndexError, ValueError, ZeroDivisionError) as err:
            print(f"question {make.__name__} skipped: {err}")
            continue
        if item:
            out.append(item)
    return {"season": cur["year"], "questions": out}


def age_on(dob, day):
    a, b = date.fromisoformat(dob), date.fromisoformat(day)
    return b.year - a.year - ((b.month, b.day) < (a.month, a.day))


def years_days(dob, day):
    a, b = date.fromisoformat(dob), date.fromisoformat(day)
    yrs = age_on(dob, day)
    last = a.replace(year=a.year + yrs) if not (a.month == 2 and a.day == 29) else date(a.year + yrs, 3, 1)
    return yrs, (b - last).days


def finale(s):
    return max((r["sessions"].get("R") or "")[:10] for r in s["rounds"])


# 1 ---------------------------------------------------------------------------
def youngest(by, cur, names, title):
    champs = []
    for y, s in by.items():
        if not s["complete"] or y == cur["year"]:
            continue
        d = s["standings"]["drivers"][0]["d"]
        dob = names.drivers.get(d, {}).get("dob")
        if dob:
            champs.append((years_days(dob, finale(s)), y, d))
    champs.sort()
    leader = cur["standings"]["drivers"][0]["d"]
    dob = names.drivers[leader]["dob"]
    age = years_days(dob, finale(cur))
    record = champs[0]
    t = next((x for x in (title or {}).get("drivers", []) if x["id"] == leader), None)
    chance = t["prob"] if t else None
    who = names.driver(leader)
    rows = [{"label": f"{names.driver(d)} {y}", "value": a[0] + a[1] / 365, "display": f"{a[0]}y {a[1]}d"} for a, y, d in champs[:5]]
    rows.insert(0, {"label": f"{who} {cur['year']}", "value": age[0] + age[1] / 365,
                    "display": f"{age[0]}y {age[1]}d", "hot": True})
    beats = (age, cur["year"]) < (record[0], record[1])
    if t and (t.get("clinched") or (t.get("note") or "").startswith("Champion")):
        answer = f"Yes. {who} is champion at {age[0]}, the youngest ever."
    elif beats and chance:
        answer = (f"If he holds on, yes. {who} would be {age[0]} at the finale, "
                  f"{record[0][0] - age[0]} years younger than {names.driver(record[2])}'s record.")
    else:
        answer = f"Not this year. The record is still {names.driver(record[2])} at {record[0][0]}."
    body = (f"{who} leads the {cur['year']} championship and turns {age[0]} before the last race. "
            f"The youngest champion so far is {names.driver(record[2])}, who won in {record[1]} "
            f"at {record[0][0]} years and {record[0][1]} days.")
    if chance:
        odds = "more than 99%" if chance >= 0.995 else "less than 1%" if chance < 0.005 else f"{round(chance * 100)}%"
        body += f" Our title model gives {who.split()[-1]} {odds} from here."
    return {"id": "youngest-champion", "q": f"Is {who} about to be the youngest champion ever?",
            "answer": answer, "body": body,
            "chart": {"type": "bars", "title": "Age at the season finale", "lower": True, "rows": rows},
            "links": [{"label": f"{who.split()[-1]}'s page", "href": f"/drivers/{leader}"}, {"label": "Title fight", "href": "/#title"}]}


# 2 ---------------------------------------------------------------------------
def hamilton(by, cur, names, title):
    d = "hamilton"
    teams = defaultdict(list)
    for y, s in by.items():
        if y < 2013:
            continue
        for r in done_rounds(s):
            for x in r["results"]:
                if x["d"] == d:
                    teams[x["c"]].append((y, r, x))
    if "ferrari" not in teams:
        return None

    def line(rows):
        n = len(rows)
        return {
            "races": n,
            "wins": sum(x["text"] == "1" for _, _, x in rows),
            "podiums": sum(x["text"] in ("1", "2", "3") for _, _, x in rows),
            "ppr": round(sum(x["pts"] for _, _, x in rows) / n, 1),
        }

    def mates(team):
        won = lost = 0
        mate = Counter()
        for y, r, x in teams[team]:
            other = [o for o in r["results"] if o["c"] == team and o["d"] != d]
            if len(other) == 1:
                mate[other[0]["d"]] += 1
                if x["pos"] < other[0]["pos"]:
                    won += 1
                else:
                    lost += 1
        return won, lost, mate.most_common(1)[0][0] if mate else None

    m, f = line(teams["mercedes"]), line(teams["ferrari"])
    mw, ml, _ = mates("mercedes")
    fw, fl, fmate = mates("ferrari")
    years = sorted({y for y, _, _ in teams["ferrari"]})
    answer = (f"Not yet. At Ferrari he wins {pct(f['wins'], f['races'])}% of races against "
              f"{pct(m['wins'], m['races'])}% at Mercedes, and {names.driver(fmate).split()[-1]} has beaten him "
              f"{fl} times to {fw}.") if f["wins"] / f["races"] < m["wins"] / m["races"] else "Yes, he's matching his Mercedes form."
    return {"id": "hamilton-ferrari", "q": "Did Hamilton's move to Ferrari actually work?",
            "answer": answer,
            "body": f"Mercedes from 2013 to 2024 against Ferrari since {years[0]}. Points per race use each race's own scoring.",
            "chart": {"type": "pairs", "cols": ["Mercedes 2013–24", f"Ferrari {years[0]}–{str(years[-1])[2:]}"], "rows": [
                {"label": "Races", "values": [m["races"], f["races"]]},
                {"label": "Win rate", "values": [f"{pct(m['wins'], m['races'])}%", f"{pct(f['wins'], f['races'])}%"], "better": 0},
                {"label": "Podium rate", "values": [f"{pct(m['podiums'], m['races'])}%", f"{pct(f['podiums'], f['races'])}%"], "better": 0},
                {"label": "Points per race", "values": [m["ppr"], f["ppr"]], "better": 0 if m["ppr"] >= f["ppr"] else 1},
                {"label": "Beat his teammate", "values": [f"{pct(mw, mw + ml)}%", f"{pct(fw, fw + fl)}%"], "better": 0 if mw / (mw + ml) >= fw / (fw + fl) else 1},
            ]},
            "links": [{"label": "Hamilton vs Leclerc", "href": f"/compare?a=hamilton&b={fmate}&p=same&from={years[0]}&to={years[-1]}&r=mates"},
                      {"label": "Hamilton's page", "href": "/drivers/hamilton"}]}


# 3 ---------------------------------------------------------------------------
def new_rules(by, cur, names, title):
    if RULES_YEAR not in by or RULES_YEAR - 1 not in by:
        return None
    before, after = by[RULES_YEAR - 1], by[RULES_YEAR]
    nb, na = len(done_rounds(before)), len(done_rounds(after))
    if not na:
        return None
    old = {RENAMED.get(t["c"], t["c"]): t["pts"] / nb for t in before["standings"]["teams"]}
    new = {t["c"]: t["pts"] / na for t in after["standings"]["teams"]}
    rows = []
    for c in sorted(set(old) | set(new), key=lambda c: new.get(c, 0) - old.get(c, 0), reverse=True):
        if c not in new:
            continue
        diff = round(new.get(c, 0) - old.get(c, 0), 1)
        rows.append({"label": names.team(c) + ("" if c in old else " (new team)"), "value": diff if c in old else 0,
                     "display": ("+" if diff > 0 else "") + f"{diff}" if c in old else f"{new[c]:.1f} a race",
                     "hot": diff > 0 and c in old})
    up, down = rows[0], min(rows, key=lambda r: r["value"])
    return {"id": "new-rules", "q": f"Did the {RULES_YEAR} rules flip the grid?",
            "answer": f"Yes, at the top. {up['label']} gained {up['display']} points a race, {down['label']} dropped {abs(down['value'])}.",
            "body": f"Points per race in {RULES_YEAR - 1} against {RULES_YEAR}, so a full season compares fairly with one still running. Sauber is counted as Audi.",
            "chart": {"type": "bars", "title": "Change in points per race", "diverging": True, "rows": rows},
            "links": [{"label": "Standings", "href": "/#standings"}]}


# 4 ---------------------------------------------------------------------------
def rookies(by, cur, names, title):
    picks = [("antonelli", 2025), ("hamilton", 2007), ("max_verstappen", 2015)]
    cols, rows = [], defaultdict(list)
    for d, y in picks:
        s = by[y]
        st = next(x for x in s["standings"]["drivers"] if x["d"] == d)
        res = []
        for r in done_rounds(s):
            q = {x["d"]: x["pos"] for x in r["quali"]}
            for x in r["results"]:
                if x["d"] == d:
                    res.append((r, q, x))
        now_pts = sum(NOW[int(x["text"]) - 1] if classified(x) and int(x["text"]) <= 10 else 0 for _, _, x in res)
        cols.append(f"{names.driver(d).split()[-1]} {y}")
        rows["Championship"].append(f"P{st['pos']}")
        rows["Wins"].append(sum(x["text"] == "1" for _, _, x in res))
        rows["Podiums"].append(sum(x["text"] in ("1", "2", "3") for _, _, x in res))
        rows["Poles"].append(sum(compare.is_pole(r, q, x) for r, q, x in res))
        rows["Points (today's system)"].append(now_pts)
        rows["Points per race (today's)"].append(round(now_pts / len(res), 1))
    out = []
    for label, vals in rows.items():
        nums = [float(str(v).lstrip("P")) for v in vals]
        best = nums.index(min(nums)) if label == "Championship" else nums.index(max(nums))
        out.append({"label": label, "values": vals, "better": best if nums.count(nums[best]) == 1 else None})
    return {"id": "rookies", "q": "Rookie Antonelli vs rookie Hamilton vs rookie Verstappen",
            "answer": "Hamilton's 2007 is still the rookie season to beat. Antonelli's first year sits between him and a teenage Verstappen.",
            "body": "Each driver's first full season. Points are re-scored on today's 25-18-15 system so 2007 and 2015 compare fairly. "
                    "Hamilton started in a front-running McLaren, Verstappen at 17 in a Toro Rosso.",
            "chart": {"type": "pairs", "cols": cols, "rows": out},
            "links": [{"label": "Compare Antonelli and Hamilton", "href": "/compare?a=antonelli&b=hamilton&p=stage&sf=1&st=1&pts=now"},
                      {"label": "Compare Antonelli and Verstappen", "href": "/compare?a=antonelli&b=max_verstappen&p=stage&sf=1&st=1&pts=now"}]}


# 5 ---------------------------------------------------------------------------
def dominance(by, cur, names, title):
    rows = []
    for y, s in by.items():
        if not s["complete"]:
            continue
        n = len(done_rounds(s))
        c, second = s["standings"]["drivers"][0], s["standings"]["drivers"][1]
        led = laps_led(y, s, c["d"])
        rows.append((c["wins"] / n, y, c, n, round(100 * (c["pts"] - second["pts"]) / c["pts"]), led))
    rows.sort(key=lambda r: r[0], reverse=True)
    top = rows[0]
    out = [{"label": f"{names.driver(c['d'])} {y}", "value": round(100 * w, 1), "display": f"{c['wins']} of {n}",
            "hot": y == top[1]} for w, y, c, n, _, _ in rows[:8]]
    led = f", led {top[5]}% of all laps" if top[5] else ""
    return {"id": "most-dominant", "q": f"Was {names.driver(top[2]['d']).split()[-1]}'s {top[1]} the most dominant season ever?",
            "answer": f"Yes. {top[2]['wins']} wins from {top[3]} races{led}, and a title margin of {top[4]}% of his own points.",
            "body": "Ranked by the share of races the champion won. Early seasons count the Indy 500, which was part of the championship then.",
            "chart": {"type": "bars", "title": "Share of races won by the champion", "unit": "%", "rows": out},
            "links": [{"label": f"{top[1]} season", "href": f"/races?y={top[1]}"}]}


def laps_led(year, s, d):
    if year < laps.FIRST:
        return None
    total = mine = 0
    for r in done_rounds(s):
        if not laps.have(year, r["round"]):
            return None
        L = store.read_json(laps.path(year, r["round"]))["drivers"]
        n = max(len(v) for v in L.values())
        total += n
        mine += sum(1 for p, _ in L.get(d, []) if p == 1)
    return pct(mine, total)


# 6 ---------------------------------------------------------------------------
def overtakers(by, cur, names, title):
    years = [y for y in (cur["year"] - 1, cur["year"]) if y in by]
    gains = defaultdict(list)
    for y in years:
        for r in done_rounds(by[y]):
            for x in r["results"]:
                if x["grid"] > 0 and classified(x):
                    gains[x["grid"]].append(x["grid"] - x["pos"])
    typical = {g: statistics.mean(v) for g, v in gains.items()}
    driver = defaultdict(list)
    for y in years:
        for r in done_rounds(by[y]):
            for x in r["results"]:
                if x["grid"] > 0 and classified(x):
                    driver[x["d"]].append((x["grid"] - x["pos"]) - typical[x["grid"]])
    grid = {x["d"] for x in cur["standings"]["drivers"]}
    ranked = sorted(((statistics.mean(v), d, len(v)) for d, v in driver.items() if len(v) >= 15 and d in grid), reverse=True)
    rows = [{"label": names.driver(d), "value": round(v, 2), "display": f"+{v:.1f}" if v > 0 else f"{v:.1f}",
             "hot": i == 0} for i, (v, d, n) in enumerate(ranked[:8])]
    best = ranked[0]
    return {"id": "best-overtaker", "q": "Who's the best overtaker on today's grid?",
            "answer": f"{names.driver(best[1])}, gaining {best[0]:.1f} places a race more than a typical driver from the same grid slot.",
            "body": f"Every classified finish in {years[0]} and {years[-1]}. Starting further back makes gains easier, "
                    "so each result is measured against the average gain from that grid position. At least 15 finishes.",
            "chart": {"type": "bars", "title": "Places gained above typical", "rows": rows},
            "links": [{"label": f"{names.driver(best[1]).split()[-1]}'s page", "href": f"/drivers/{best[1]}"}]}


# 7 ---------------------------------------------------------------------------
def safety_cars(by, cur, names, title):
    flips, hit, total = [], 0, 0
    for y in range(openf1.FIRST, cur["year"] + 1):
        for r in done_rounds(by.get(y, {"rounds": []})):
            if not (openf1.have(y, r["round"]) and laps.have(y, r["round"])):
                continue
            total += 1
            per = [p for p in store.read_json(openf1.path(y, r["round"]))["periods"] if p[0] in ("SC", "RED")]
            if not per:
                continue
            hit += 1
            before = per[0][1] - 1
            if before < 1:
                continue
            L = store.read_json(laps.path(y, r["round"]))["drivers"]
            lead = next((d for d, v in L.items() if len(v) >= before and v[before - 1][0] == 1), None)
            win = next(x["d"] for x in r["results"] if x["text"] == "1")
            if lead and lead != win:
                flips.append({"label": f"{y} {r['name'].replace(' Grand Prix', ' GP')}", "value": 1,
                              "display": f"{names.code(lead)} → {names.code(win)}", "href": f"/races/{y}/{r['round']}"})
    return {"id": "safety-cars", "q": "Do safety cars decide races?",
            "answer": f"Less than it feels. {hit} of {total} races since {openf1.FIRST} had a safety car or red flag, "
                      f"and the leader when it came out lost the win {len(flips)} times.",
            "body": "Leader means whoever was first at the end of the lap before the first full safety car or red flag. "
                    "Virtual safety cars aren't counted, they rarely change the order.",
            "chart": {"type": "list", "title": "Races where the safety car changed the winner", "rows": flips},
            "links": [{"label": "Race explorer", "href": "/races"}]}


# 8 ---------------------------------------------------------------------------
def pit_crews(by, cur, names, title):
    y = cur["year"]
    t = defaultdict(list)
    for r in done_rounds(cur):
        if not laps.have(y, r["round"]):
            continue
        team = {x["d"]: x["c"] for x in r["results"]}
        for d, _, _, ms in store.read_json(laps.path(y, r["round"]))["pits"]:
            # longer than 40s is a red flag or a problem, not a normal stop
            if ms and ms < 40000 and d in team:
                t[team[d]].append(ms / 1000)
    med = {c: statistics.median(v) for c, v in t.items() if len(v) >= 10}
    place = {x["c"]: int(x["pos"]) for x in cur["standings"]["teams"]}
    ranked = sorted(med, key=med.get)
    pit_rank = {c: i + 1 for i, c in enumerate(ranked)}
    common = [c for c in ranked if c in place]
    pts_rank = {c: i + 1 for i, c in enumerate(sorted(common, key=place.get))}
    n = len(common)
    rho = 1 - 6 * sum((pit_rank[c] - pts_rank[c]) ** 2 for c in common) / (n * (n * n - 1))
    rows = [{"label": names.team(c), "value": round(med[c], 2), "display": f"{med[c]:.2f}s · P{place.get(c, '–')}",
             "hot": i == 0} for i, c in enumerate(ranked)]
    fastest = ranked[0]
    strength = "strongly" if rho > 0.7 else "somewhat" if rho > 0.4 else "barely"
    return {"id": "pit-crews", "q": "Does the fastest pit crew actually win anything?",
            "answer": f"{names.team(fastest)} have the quickest stops this year and sit P{place.get(fastest)} in the standings. "
                      f"Pit speed and results are {strength} linked.",
            "body": f"Median time in the pit lane for each team's stops in {y}, entry to exit, so it includes the drive through the lane. "
                    f"The rank match between pit speed and championship place is {rho:.2f} (1 would be a perfect match). "
                    "Fast teams tend to be good at both, so it shows the best teams pit well, not that pit stops win titles.",
            "chart": {"type": "bars", "title": "Median pit lane time (and championship place)", "lower": True, "rows": rows},
            "links": [{"label": "Race explorer", "href": "/races"}]}


# 9 ---------------------------------------------------------------------------
def tyres(by, cur, names, title):
    longest, stops = [], Counter()
    for y in range(openf1.FIRST, cur["year"] + 1):
        for r in done_rounds(by.get(y, {"rounds": []})):
            if not (openf1.have(y, r["round"]) and laps.have(y, r["round"])):
                continue
            o = store.read_json(openf1.path(y, r["round"]))
            pits = defaultdict(set)
            for d, lap, _, _ in store.read_json(laps.path(y, r["round"]))["pits"]:
                pits[d].add(lap)
            win = next((x["d"] for x in r["results"] if x["text"] == "1"), None)
            if win:
                stops[len(pits[win])] += 1
            # a red flag means a free tyre change, so those stints aren't real
            if any(p[0] == "RED" for p in o["periods"]):
                continue
            for d, sts in o["stints"].items():
                for a, b, comp, _ in openf1.reconcile(sts, pits[d]):
                    if comp != "UNKNOWN":
                        longest.append((b - a + 1, d, y, r, comp))
    longest.sort(key=lambda s: s[0], reverse=True)
    seen, rows = set(), []
    for n, d, y, r, comp in longest:
        if (d, y, r["round"]) in seen:
            continue
        seen.add((d, y, r["round"]))
        rows.append({"label": f"{names.driver(d)} · {y} {r['name'].replace(' Grand Prix', ' GP')}", "value": n,
                     "display": f"{n} laps · {comp.capitalize()}", "hot": len(rows) == 0, "href": f"/races/{y}/{r['round']}"})
        if len(rows) == 8:
            break
    total = sum(stops.values())
    one = stops.get(1, 0)
    top = rows[0]
    return {"id": "tyre-whisperer", "q": "Who's the tyre whisperer?",
            "answer": f"{top['label'].split(' · ')[0]}, with a {top['value']}-lap stint. "
                      f"And one-stop wins are the most common: {pct(one, total)}% of races since {openf1.FIRST}.",
            "body": "The longest single set of tyres in a race since 2023, checked against the official pit stop records. "
                    "Monaco fills the top because it barely wears tyres and overtaking is close to impossible, so teams stretch stints there. "
                    "Races with a red flag are left out, since teams can change tyres for free during the stoppage.",
            "chart": {"type": "bars", "title": "Longest stints since 2023", "rows": rows},
            "links": [{"label": "Race explorer", "href": "/races"}]}


# 10 --------------------------------------------------------------------------
def pole(by, cur, names, title):
    won, tot = Counter(), Counter()
    for y, s in by.items():
        for r in done_rounds(s):
            q = {x["d"]: x["pos"] for x in r["quali"]}
            p = next((x for x in r["results"] if compare.is_pole(r, q, x)), None)
            if p:
                dec = y // 10 * 10
                tot[dec] += 1
                won[dec] += p["text"] == "1"
    decs = sorted(tot)
    rows = [{"label": f"{d}s", "value": pct(won[d], tot[d]), "display": f"{pct(won[d], tot[d])}%",
             "hot": d == decs[-1]} for d in decs]
    now, best_old = rows[-1], max(rows[:-1], key=lambda r: r["value"])
    return {"id": "pole-worth", "q": "Is pole worth more than ever?",
            "answer": f"Yes. Pole wins {now['display']} of races in the {decs[-1]}s, the highest of any decade "
                      f"(the {best_old['label']} were {best_old['display']})." if now["value"] > best_old["value"]
                      else f"No, the {best_old['label']} were higher at {best_old['display']}.",
            "body": "How often the driver on pole won the race, by decade. Pole is the fastest qualifier, or the pole sitter on the grid where qualifying records are missing.",
            "chart": {"type": "bars", "title": "Pole sitter won the race", "unit": "%", "rows": rows},
            "links": [{"label": "Race explorer", "href": "/races"}]}


# 11 --------------------------------------------------------------------------
def retirements(by, cur, names, title):
    years = [y for y in (cur["year"] - 1, cur["year"]) if y in by]
    lost, count = Counter(), Counter()
    for y in years:
        for r in done_rounds(by[y]):
            if not laps.have(y, r["round"]):
                continue
            L = store.read_json(laps.path(y, r["round"]))["drivers"]
            for x in r["results"]:
                # only retirements, a disqualification is on the driver
                if x["text"] != "R" or x["d"] not in L or not L[x["d"]]:
                    continue
                p = next((p for p, _ in reversed(L[x["d"]]) if p), None)
                if p and p <= 10:
                    lost[x["d"]] += NOW[p - 1]
                count[x["d"]] += 1
    grid = {x["d"] for x in cur["standings"]["drivers"]}
    ranked = [(v, d) for d, v in lost.most_common() if d in grid][:8]
    rows = [{"label": names.driver(d), "value": v, "display": f"{v} pts · {count[d]} DNF", "hot": i == 0}
            for i, (v, d) in enumerate(ranked)]
    v, d = ranked[0]
    return {"id": "unluckiest", "q": "Who's lost the most points to retirements?",
            "answer": f"{names.driver(d)}. Retirements cost about {v} points in {years[0]}–{str(years[-1])[2:]}, "
                      "counting where he was running when it ended.",
            "body": "For each retirement, the points the driver would have scored holding the place they had on their last lap, "
                    "on today's 25-18-15 scale. It can't tell a crash from a car failure, the official records rarely say.",
            "chart": {"type": "bars", "title": "Points dropped to retirements", "rows": rows},
            "links": [{"label": f"{names.driver(d).split()[-1]}'s page", "href": f"/drivers/{d}"}]}
