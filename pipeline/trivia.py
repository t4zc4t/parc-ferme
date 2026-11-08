"""Facts, quiz questions and an on-this-day list, all worked out from the results.

Written for the site's trivia page and for anyone's bot to read as plain JSON:
  trivia/facts.json      {facts: [{id, category, text, link}]}
  trivia/quiz.json       {questions: [{id, category, difficulty, q, options, answer, explain, link}]}
  trivia/onthisday.json  {days: {"MM-DD": [{year, text, link}]}}
Every number comes from the data, so they move on by themselves after each race.
"""
import hashlib
import json
from collections import Counter, defaultdict
from datetime import date, timedelta

import store

from compare import classified, is_pole

NOT_STARTED = {"W", "F", "E"}       # withdrawn, failed to qualify, excluded
MIN_CIRCUIT = 15                     # races held before a circuit gets its own facts


def mix(key, items):
    """a stable shuffle, so the files only change when the data does"""
    return sorted(items, key=lambda x: hashlib.md5(f"{key}|{x}".encode()).hexdigest())


def ordinal(n):
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def age(born, on):
    b, d = date.fromisoformat(born), date.fromisoformat(on)
    years = d.year - b.year - ((d.month, d.day) < (b.month, b.day))
    last = b.replace(year=b.year + years) if not (b.month == 2 and b.day == 29) else date(b.year + years, 3, 1)
    return years, (d - last).days


def plural(n, word):
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def short(name):
    return name.replace(" Grand Prix", " GP")


def outline(points, size=100, keep=120):
    """a track as an svg path in a size x size box, y pointing down"""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys)) or 1
    pad = size * 0.06
    k = (size - 2 * pad) / span
    ox = pad + (size - 2 * pad - (max(xs) - min(xs)) * k) / 2
    oy = pad + (size - 2 * pad - (max(ys) - min(ys)) * k) / 2
    step = max(1, len(points) // keep)
    pts = points[::step]
    return "M" + "L".join(f"{ox + (x - min(xs)) * k:.1f},{oy + (max(ys) - y) * k:.1f}" for x, y in pts) + "Z"


def tracks(seasons):
    """circuit id -> (name, svg path, year) from the race replays we have, newest first"""
    out = {}
    for s in sorted(seasons, key=lambda s: -s["year"]):
        for r in s["rounds"]:
            cid = r["circuit"]["id"]
            f = store.ROOT / "site" / "replay" / str(s["year"]) / f"{r['round']}.json"
            if cid in out or not f.exists():
                continue
            try:
                pts = json.loads(f.read_text(encoding="utf-8")).get("track") or []
            except ValueError:
                continue
            if len(pts) > 50:
                out[cid] = (r["circuit"]["name"], outline(pts), s["year"])
    return out


def build(seasons, names, today=None):
    current = seasons[-1]
    now_year = current["year"]
    dob = {}
    for s in seasons:
        for d, info in s["drivers"].items():
            if info.get("dob"):
                dob[d] = info["dob"]

    # every championship race in order, with who did what
    races = []
    for s in seasons:
        for r in s["rounds"]:
            if r["results"]:
                races.append((s["year"], r))
    career = defaultdict(lambda: {"starts": 0, "wins": [], "podiums": 0, "poles": 0, "seconds": 0,
                                  "first_win_after": None, "years": set()})
    circuit_wins = defaultdict(Counter)
    circuit_races = Counter()
    circuit_names = {}
    pole_wins = Counter()
    pole_races = Counter()
    team_one_two = Counter()
    by_date = defaultdict(list)
    first_win_seen = set()
    for year, r in races:
        indy = "Indianapolis" in r["name"]
        quali = {q["d"]: q["pos"] for q in r["quali"]}
        day = (r["sessions"].get("R") or "")[:10]
        cid = r["circuit"]["id"]
        circuit_names[cid] = r["circuit"]["name"]
        if not indy:
            circuit_races[cid] += 1
        top2 = [x for x in r["results"] if x["text"] in ("1", "2")]
        if len(top2) == 2 and top2[0]["c"] == top2[1]["c"]:
            team_one_two[top2[0]["c"]] += 1
        for row in r["results"]:
            d, text = row["d"], row["text"] or ""
            c = career[d]
            c["years"].add(year)
            if text in NOT_STARTED:
                continue
            c["starts"] += 1
            pole = is_pole(r, quali, row)
            if pole:
                c["poles"] += 1
            if text in ("1", "2", "3"):
                c["podiums"] += 1
            if text == "2":
                c["seconds"] += 1
            if text == "1":
                c["wins"].append({"year": year, "round": r["round"], "name": r["name"], "date": day,
                                  "grid": row["grid"], "circuit": cid, "indy": indy, "team": row["c"]})
                if c["first_win_after"] is None:
                    c["first_win_after"] = c["starts"]
                if not indy:
                    circuit_wins[cid][d] += 1
                    pole_races[cid] += 1
                    if pole:
                        pole_wins[cid] += 1
                first = d not in first_win_seen
                first_win_seen.add(d)
                if day:
                    by_date[day[5:]].append({"year": year, "d": d, "name": r["name"], "round": r["round"],
                                             "first": first, "team": row["c"]})

    link_race = lambda y, rnd: f"/races/{y}/{rnd}"
    link_driver = lambda d: f"/drivers/{d}"
    nm = names.driver
    facts, quiz = [], []

    def fact(fid, category, text, link=None, link_text=None):
        facts.append({"id": fid, "category": category, "text": text, "link": link,
                      "linkText": link_text or ("The race" if link and link.startswith("/races/") else "Career record" if link else None)})

    def question(qid, category, difficulty, q, right, wrong, explain, link=None, link_text=None, table=None,
                 options=4, track=None, image=None):
        """table: the numbers behind the answer, [label, value, link] rows shown after answering"""
        wrong = [w for w in dict.fromkeys(wrong) if w != right][:options - 1]
        if len(wrong) < options - 1:
            return
        options = mix(qid, [right] + wrong)
        quiz.append({"id": qid, "category": category, "difficulty": difficulty, "q": q,
                     "options": options, "answer": options.index(right), "explain": explain,
                     "table": table or [], "link": link, **({"track": track} if track else {}), **({"image": image} if image else {}),
                     "linkText": link_text or ("The race" if link and link.startswith("/races/") else
                                               "The standings" if link and link.startswith("/standings") else
                                               "Career record" if link else None)})

    def board(rows, unit):
        """a ranking as table rows: [(count, driver), ...]"""
        return [[nm(d), plural(n, unit), link_driver(d)] for n, d in rows[:5]]

    def ranked(value, keep=lambda d, c: True):
        rows = [(value(c), d) for d, c in career.items() if keep(d, c)]
        return sorted([x for x in rows if x[0]], key=lambda x: (-x[0], x[1]))

    def clear_top(rows):
        return len(rows) >= 4 and rows[0][0] > rows[1][0]

    champions = {}
    team_champions = {}
    for s in seasons:
        if s["complete"] and s["year"] != now_year and s["standings"]["drivers"]:
            champions[s["year"]] = s["standings"]["drivers"]
            if s["standings"]["teams"]:
                team_champions[s["year"]] = s["standings"]["teams"]
    titles = Counter(t[0]["d"] for t in champions.values())

    # ---- all-time records ----
    wins = ranked(lambda c: len(c["wins"]))
    if clear_top(wins):
        (n, d), (n2, d2) = wins[0], wins[1]
        fact("most-wins", "records", f"{nm(d)} has won more Grands Prix than anyone, {n}. {nm(d2)} is next with {n2}.", link_driver(d))
        question("most-wins", "records", "easy", "Who has won the most Formula 1 Grands Prix?",
                 nm(d), [nm(x) for _, x in wins[1:4]], f"{nm(d)} has won {n} Grands Prix, the most of anyone. {nm(d2)} is next with {n2}.",
                 link_driver(d), table=board(wins, "win"))
    poles = ranked(lambda c: c["poles"])
    if clear_top(poles):
        (n, d), (n2, d2) = poles[0], poles[1]
        fact("most-poles", "records", f"{nm(d)} has started from pole {n} times, the most ever. {nm(d2)} has {n2}.", link_driver(d))
        question("most-poles", "records", "easy", "Who has the most pole positions in Formula 1?",
                 nm(d), [nm(x) for _, x in poles[1:4]], f"{nm(d)} has started from pole {n} times, {nm(d2)} {n2}.",
                 link_driver(d), table=board(poles, "pole"))

    no_title = ranked(lambda c: len(c["wins"]), lambda d, c: d not in titles)
    if clear_top(no_title):
        n, d = no_title[0]
        fact("wins-no-title", "records", f"{nm(d)} has {n} Grand Prix wins, more than anyone who has never been world champion.", link_driver(d))
        question("wins-no-title", "records", "medium", "Who has won the most Grands Prix without ever becoming world champion?",
                 nm(d), [nm(x) for _, x in no_title[1:4]], f"{nm(d)} won {n} Grands Prix but never the title, the most of anyone without one.",
                 link_driver(d), table=board(no_title, "win"))
    podium_no_win = ranked(lambda c: c["podiums"], lambda d, c: not c["wins"])
    if clear_top(podium_no_win):
        n, d = podium_no_win[0]
        fact("podiums-no-win", "records", f"{nm(d)} stood on the podium {n} times without ever winning a Grand Prix, the most of anyone.", link_driver(d))
        question("podiums-no-win", "records", "hard", "Who has the most podium finishes without a single Grand Prix win?",
                 nm(d), [nm(x) for _, x in podium_no_win[1:4]], f"{nm(d)} stood on the podium {n} times without ever winning.",
                 link_driver(d), table=board(podium_no_win, "podium"))
    seconds_no_win = ranked(lambda c: c["seconds"], lambda d, c: not c["wins"])
    if clear_top(seconds_no_win):
        n, d = seconds_no_win[0]
        fact("seconds-no-win", "records", f"{nm(d)} finished second {plural(n, 'time')} but never first.", link_driver(d))
    starts_no_podium = ranked(lambda c: c["starts"], lambda d, c: not c["podiums"])
    if clear_top(starts_no_podium):
        n, d = starts_no_podium[0]
        fact("starts-no-podium", "records", f"{nm(d)} started {n} Grands Prix without a single podium, the longest such career.", link_driver(d))
        question("starts-no-podium", "records", "hard", "Who started the most Grands Prix without ever finishing on the podium?",
                 nm(d), [nm(x) for _, x in starts_no_podium[1:4]], f"{nm(d)} started {n} Grands Prix and never finished in the top three.",
                 link_driver(d), table=board(starts_no_podium, "start"))
    waited = ranked(lambda c: (c["first_win_after"] or 0))
    if clear_top(waited):
        n, d = waited[0]
        fact("longest-wait", "records", f"{nm(d)} needed {n} starts to win a Grand Prix, the longest wait of any winner.", link_driver(d))
        question("longest-wait", "records", "hard", "Which winner needed the most starts before their first Grand Prix win?",
                 nm(d), [nm(x) for _, x in waited[1:4]], f"{nm(d)} won at the {ordinal(n)} attempt, the longest wait of any winner.",
                 link_driver(d), table=[[nm(x), f"win at start {k}", link_driver(x)] for k, x in waited[:5]])
    debut = sorted({d for d, c in career.items() if c["first_win_after"] == 1 and not c["wins"][0]["indy"]})
    if debut:
        fact("won-on-debut", "records", f"Leaving out the Indianapolis 500, only {plural(len(debut), 'driver')} won on their championship debut: "
             + ", ".join(nm(d) for d in debut) + ".")

    # youngest and oldest winners and pole sitters
    winners_age = []
    for d, c in career.items():
        if d in dob:
            for w in c["wins"]:
                if w["date"] and not w["indy"]:
                    winners_age.append((age(dob[d], w["date"]), d, w))
    if winners_age:
        (y, dd), d, w = min(winners_age, key=lambda x: x[0])
        fact("youngest-winner", "records", f"{nm(d)} is the youngest Grand Prix winner, {y} years and {dd} days old at the {w['year']} {w['name']}.", link_race(w["year"], w["round"]))
        young = []
        for a, dr, w2 in sorted(winners_age, key=lambda x: x[0]):
            if dr not in young:
                young.append(dr)
        first_win_age = {}
        for a, dr, w2 in sorted(winners_age, key=lambda x: x[0]):
            first_win_age.setdefault(dr, (a, w2))
        question("youngest-winner", "records", "medium", "Who is the youngest driver to win a Formula 1 Grand Prix?",
                 nm(d), [nm(x) for x in young[1:4]], f"{nm(d)} was {y} years and {dd} days old when he won the {w['year']} {w['name']}.",
                 link_race(w["year"], w["round"]),
                 table=[[nm(x), f"{first_win_age[x][0][0]} years {first_win_age[x][0][1]} days, {first_win_age[x][1]['year']}",
                         link_race(first_win_age[x][1]["year"], first_win_age[x][1]["round"])] for x in young[:5]])
        (y, dd), d, w = max(winners_age, key=lambda x: x[0])
        fact("oldest-winner", "records", f"{nm(d)} is the oldest Grand Prix winner, {y} years old at the {w['year']} {w['name']}.", link_race(w["year"], w["round"]))

    # furthest back to win
    from_back = [(w["grid"], d, w) for d, c in career.items() for w in c["wins"] if w["grid"] and not w["indy"]]
    if from_back:
        g, d, w = max(from_back, key=lambda x: (x[0], -x[2]["year"]))
        fact("furthest-back", "records", f"The furthest back anyone has started and still won is P{g}: {nm(d)} at the {w['year']} {w['name']}.", link_race(w["year"], w["round"]))
        pit = [(d, w) for d, c in career.items() for w in c["wins"] if w["grid"] == 0 and not w["indy"]]
        if pit:
            fact("pit-lane-wins", "records", f"{plural(len(pit), 'race')} have been won from a pit lane start, most recently by {nm(pit and max(pit, key=lambda x: x[1]['date'])[0])}.")

    # streaks, chronological across seasons
    best, cur_d, run, start = (0, None, None), None, 0, None
    for year, r in races:
        win = next((x["d"] for x in r["results"] if x["text"] == "1"), None)
        if win == cur_d:
            run += 1
        else:
            cur_d, run, start = win, 1, (year, r["name"])
        if run > best[0]:
            best = (run, win, start)
    if best[1]:
        n, d, (y, gp) = best
        fact("win-streak", "records", f"The longest winning run is {n} races in a row, by {nm(d)}, starting at the {y} {gp}.", link_driver(d))
        question("win-streak", "records", "medium", "What is the record for consecutive Grand Prix wins?",
                 str(n), [str(n - 1), str(n + 1), str(n - 2)], f"{n} in a row, by {nm(d)} from the {y} {gp}.", f"/standings?y={y}", f"The {y} season")

    # seasons
    season_rows = []
    for s in seasons:
        rnds = [r for r in s["rounds"] if r["results"]]
        if not rnds:
            continue
        w = Counter(next((x["d"] for x in r["results"] if x["text"] == "1"), None) for r in rnds)
        w.pop(None, None)
        if w:
            (d, n), = w.most_common(1)
            season_rows.append((s["year"], d, n, len(rnds), len(w)))
    if season_rows:
        y, d, n, total, _ = max(season_rows, key=lambda x: (x[2], -x[0]))
        fact("most-wins-season", "records", f"The most wins in one season is {n}, by {nm(d)} in {y} ({n} of {total} races).", link_driver(d))
        question("most-wins-season", "records", "medium", "What is the record for most Grand Prix wins in a single season?",
                 str(n), [str(n - 1), str(n - 2), str(n + 2)], f"{n} wins, by {nm(d)} in {y}, from {total} races.", f"/standings?y={y}", f"The {y} season",
                 table=[[f"{nm(x[1])}, {x[0]}", f"{x[2]} of {x[3]}", f"/standings?y={x[0]}"] for x in sorted(season_rows, key=lambda x: (-x[2], x[0]))[:5]])
        y, d, n, total, _ = max((x for x in season_rows if x[3] >= 5), key=lambda x: (x[2] / x[3], -x[0]))
        fact("best-season-rate", "records", f"{nm(d)} won {n} of {total} races in {y}, {round(100 * n / total)}%, the highest win rate in a season.", link_driver(d))
        y, _, _, total, k = max(season_rows, key=lambda x: (x[4], -x[0]))
        fact("most-winners", "seasons", f"{y} had {k} different winners in {total} races, the most in any season.")
        question("most-winners", "seasons", "hard", "Which season had the most different Grand Prix winners?",
                 str(y), [str(x[0]) for x in sorted(season_rows, key=lambda x: (-x[4], x[0]))[1:4]], f"{y}, with {k} different winners in {total} races.",
                 f"/races?y={y}", f"The {y} races",
                 table=[[str(x[0]), f"{x[4]} winners in {x[3]} races", f"/races?y={x[0]}"] for x in sorted(season_rows, key=lambda x: (-x[4], x[0]))[:5]])

    # title fights
    margins = [(y, t[0]["pts"] - t[1]["pts"], t[0]["d"], t[1]["d"]) for y, t in champions.items() if len(t) > 1]
    if margins:
        y, m, d, d2 = min(margins, key=lambda x: (x[1], x[0]))
        fact("closest-title", "seasons", f"The closest title fight was in {y}, when {nm(d)} beat {nm(d2)} by {m} {'point' if m == 1 else 'points'}.", f"/standings?y={y}")
        fewest = min(((y, sum(1 for _, r in races if _ == y and any(x["text"] == "1" and x["d"] == t[0]["d"] for x in r["results"])), t[0]["d"])
                      for y, t in champions.items()), key=lambda x: (x[1], x[0]))
        fact("fewest-wins-champion", "seasons", f"{nm(fewest[2])} won the {fewest[0]} title with just {plural(fewest[1], 'win')}, the fewest for any champion.", f"/standings?y={fewest[0]}")
        question("fewest-wins-champion", "seasons", "hard", f"How many races did {nm(fewest[2])} win on the way to the {fewest[0]} title?",
                 str(fewest[1]), [str(fewest[1] + k) for k in (1, 2, 3)], f"{nm(fewest[2])} won the {fewest[0]} title with just {plural(fewest[1], 'win')}, the fewest for any champion.",
                 f"/standings?y={fewest[0]}")
    most_titles = sorted(titles.items(), key=lambda x: (-x[1], x[0]))
    if len(most_titles) >= 4:
        top = [x for x in most_titles if x[1] == most_titles[0][1]]
        who = " and ".join(nm(d) for d, _ in top)
        fact("most-titles", "records", f"{who} {'share' if len(top) > 1 else 'holds'} the record of {most_titles[0][1]} world titles.")

    # each season's champions
    for y, t in sorted(champions.items()):
        if len(t) < 4:
            continue
        diff = "easy" if y >= 2010 else "medium" if y >= 1990 else "hard"
        others = [x["d"] for x in t[1:3]] + [champions[z][0]["d"] for z in (y - 1, y + 1, y - 2) if z in champions]
        question(f"champion-{y}", "seasons", diff, f"Who won the {y} drivers' championship?",
                 nm(t[0]["d"]), [nm(x) for x in others if x != t[0]["d"]],
                 f"{nm(t[0]['d'])} won the {y} title with {t[0]['pts']} points, {nm(t[1]['d'])} was second on {t[1]['pts']}.",
                 f"/standings?y={y}", f"The {y} standings",
                 table=[[nm(x["d"]), f"{x['pts']} pts", link_driver(x["d"])] for x in t[:3]])
    for y, t in sorted(team_champions.items()):
        if len(t) < 3:
            continue
        diff = "easy" if y >= 2010 else "medium" if y >= 1990 else "hard"
        others = [x["c"] for x in t[1:3]] + [team_champions[z][0]["c"] for z in (y - 1, y + 1, y - 3) if z in team_champions]
        question(f"constructors-{y}", "teams", diff, f"Which team won the {y} constructors' championship?",
                 names.team(t[0]["c"]), [names.team(x) for x in others if x != t[0]["c"]],
                 f"{names.team(t[0]['c'])} won the {y} constructors' title with {t[0]['pts']} points.",
                 f"/standings?y={y}&t=teams", f"The {y} standings",
                 table=[[names.team(x["c"]), f"{x['pts']} pts", None] for x in t[:3]])
    team_titles = Counter(t[0]["c"] for t in team_champions.values())
    if team_titles:
        (c, n), = team_titles.most_common(1)
        fact("team-titles", "teams", f"{names.team(c)} have won the constructors' championship {n} times, more than any other team.")
    if team_one_two:
        (c, n), = team_one_two.most_common(1)
        fact("one-twos", "teams", f"{names.team(c)} have finished first and second in a race {n} times, the most one-twos of any team.")
        top = team_one_two.most_common(4)
        if len(top) == 4 and top[0][1] > top[1][1]:
            question("one-twos", "teams", "medium", "Which team has scored the most one-two finishes?",
                     names.team(c), [names.team(x) for x, _ in top[1:]], f"{names.team(c)} have finished first and second {n} times.",
                     table=[[names.team(x), plural(k, "one-two"), None] for x, k in team_one_two.most_common(5)])

    # circuits
    held = Counter(r["name"] for _, r in races)
    (gp, n), = held.most_common(1)
    fact("most-held", "circuits", f"The {gp} has been part of the championship {n} times, more than any other race.")
    question("most-held", "circuits", "medium", "Which Grand Prix has been held the most times in the championship?",
             gp, [g for g, _ in held.most_common(4)[1:]], f"The {gp} has been held {n} times.",
             table=[[g, plural(k, "race"), None] for g, k in held.most_common(5)])
    first_year, first_r = races[0]
    fact("first-race", "circuits", f"The first world championship race was the {first_year} {first_r['name']} at {first_r['circuit']['name']}.", link_race(first_year, first_r["round"]))
    rates = [(pole_wins[c] / pole_races[c], c) for c in pole_races if circuit_races[c] >= MIN_CIRCUIT]
    if rates:
        r_hi, c_hi = max(rates)
        r_lo, c_lo = min(rates)
        overall = sum(pole_wins.values()) / max(1, sum(pole_races.values()))
        fact("pole-power", "circuits", f"Pole has turned into a win {round(100 * overall)}% of the time. At {circuit_names[c_hi]} it's {round(100 * r_hi)}%, at {circuit_names[c_lo]} only {round(100 * r_lo)}%.")
    for c, total in circuit_races.items():
        if total < MIN_CIRCUIT or not circuit_wins[c]:
            continue
        top = circuit_wins[c].most_common(4)
        d, n = top[0]
        tied = sorted(x for x, k in circuit_wins[c].items() if k == n)
        if len(tied) > 2:
            continue
        who = " and ".join(nm(x) for x in tied)
        fact(f"circuit-{c}", "circuits", f"{who} {'share the record at' if len(tied) > 1 else 'has the most wins at'} {circuit_names[c]}, "
             f"{plural(n, 'win')}{' each' if len(tied) > 1 else ''} from {circuit_races[c]} races held there.", link_driver(d))
        if len(top) == 4 and n > top[1][1]:
            years = [w for w in career[d]["wins"] if w["circuit"] == c]
            question(f"circuit-{c}", "circuits", "medium", f"Who has the most wins at {circuit_names[c]}?",
                     nm(d), [nm(x) for x, _ in top[1:]],
                     f"{nm(d)} has won {plural(n, 'time')} at {circuit_names[c]}: " + ", ".join(str(w["year"]) for w in years) + ".",
                     link_race(years[-1]["year"], years[-1]["round"]), f"{nm(d).split()[-1]}'s last win there",
                     table=[[nm(x), plural(k, "win"), link_driver(x)] for x, k in circuit_wins[c].most_common(5)])

    # numbers and firsts for the big winners
    big = [(len(c["wins"]), d) for d, c in career.items() if len(c["wins"]) >= 10]
    for n, d in sorted(big, reverse=True)[:30]:
        c = career[d]
        first = c["wins"][0]
        steps = mix(d, [-3, -2, -1, 1, 2, 3])
        question(f"wins-{d}", "drivers", "medium" if n >= 30 else "hard", f"How many Grand Prix wins does {nm(d)} have?",
                 str(n), [str(n + k) for k in steps if n + k > 0],
                 f"{nm(d)} has {n} wins from {c['starts']} starts, the first at the {first['year']} {first['name']}.", link_driver(d),
                 table=[["Starts", str(c["starts"]), None], ["Wins", str(n), None], ["Podiums", str(c["podiums"]), None], ["Poles", str(c["poles"]), None]])
        question(f"first-win-{d}", "drivers", "hard", f"In which season did {nm(d)} win their first Grand Prix?",
                 str(first["year"]), [str(first["year"] + k) for k in mix(d + "y", [-2, -1, 1, 2]) if first["year"] + k <= now_year],
                 f"{nm(d)} took their first win at the {first['year']} {first['name']}, at the {ordinal(c['first_win_after'])} start.",
                 link_race(first["year"], first["round"]))

    # odd one out: a big name who never won, hidden among winners of the same years
    winners = {d: c for d, c in career.items() if c["wins"]}
    for n, d in podium_no_win[:12]:
        years = career[d]["years"]
        alike = sorted((abs(len(c["years"] & years) - len(years)), w) for w, c in winners.items() if c["years"] & years)
        picks = [w for _, w in alike[:6]]
        if len(picks) < 3:
            continue
        shown = mix(d, picks)[:3]
        question(f"never-won-{d}", "drivers", "hard", "Which of these drivers never won a Grand Prix?",
                 nm(d), [nm(w) for w in shown], f"{nm(d)} never won, despite {plural(n, 'podium')}. The other three all won races.",
                 link_driver(d),
                 table=[[nm(x), f"{plural(len(career[x]['wins']), 'win')}, {plural(career[x]['podiums'], 'podium')}", link_driver(x)] for x in [d] + shown])
    # the team a big winner first won with
    for n, d in sorted(big, reverse=True)[:30]:
        first = career[d]["wins"][0]
        teams = Counter(w["team"] for c in winners.values() for w in c["wins"] if abs(w["year"] - first["year"]) <= 3)
        others = [names.team(t) for t, _ in teams.most_common(8) if t != first["team"]]
        question(f"first-win-team-{d}", "drivers", "hard", f"Which team did {nm(d)} take their first Grand Prix win with?",
                 names.team(first["team"]), mix(d + "t", others)[:3],
                 f"{nm(d)} first won with {names.team(first['team'])}, at the {first['year']} {first['name']}.", link_race(first["year"], first["round"]))

    # higher or lower: two well known drivers, who has more of something
    known = sorted((d for d, c in career.items() if len(c["wins"]) >= 5), key=lambda d: (-len(career[d]["wins"]), d))
    stats = [("wins", "Grand Prix wins", lambda c: len(c["wins"])), ("podiums", "podiums", lambda c: c["podiums"]),
             ("poles", "pole positions", lambda c: c["poles"]), ("starts", "race starts", lambda c: c["starts"])]
    pairs = [(a, b) for i, a in enumerate(known[:40]) for b in known[i + 1:40]]
    for a, b in mix("pairs", pairs)[:60]:
        key, label, get = stats[int(hashlib.md5(f"{a}{b}".encode()).hexdigest(), 16) % len(stats)]
        va, vb = get(career[a]), get(career[b])
        if va == vb:
            continue
        hi, lo = (a, b) if va > vb else (b, a)
        question(f"more-{key}-{a}-{b}", "head to head", "medium", f"Who has more {label}, {nm(a)} or {nm(b)}?",
                 nm(hi), [nm(lo)], f"{nm(hi)} has {max(va, vb)} {label}, {nm(lo)} has {min(va, vb)}.", link_driver(hi),
                 f"{nm(hi).split()[-1]}'s record", table=[[nm(x), str(get(career[x])), link_driver(x)] for x in (hi, lo)], options=2)

    # guess the year from a podium of famous names
    held_years = defaultdict(list)
    for year, r in races:
        held_years[r["name"]].append(year)
    podiums = []
    for year, r in races:
        top = sorted([x for x in r["results"] if x["text"] in ("1", "2", "3")], key=lambda x: x["pos"])
        if len(top) == 3 and all(len(career[x["d"]]["wins"]) >= 3 for x in top) and year >= 1970:
            podiums.append((year, r, top))
    for year, r, top in mix("podiums", podiums)[:50]:
        others = [y for y in held_years[r["name"]] if y != year and abs(y - year) <= 8]
        if len(others) < 3:
            continue
        question(f"podium-year-{year}-{r['round']}", "races", "hard",
                 f"At the {r['name']}, the podium was {nm(top[0]['d'])}, {nm(top[1]['d'])} and {nm(top[2]['d'])}. Which year?",
                 str(year), [str(y) for y in mix(f"{year}{r['round']}", others)[:3]],
                 f"{year}, {nm(top[0]['d'])} won from {nm(top[1]['d'])} and {nm(top[2]['d'])}.", link_race(year, r["round"]))

    # name the circuit from its shape, from the tracks traced for the replays
    shapes = tracks([x for x in seasons if x["year"] >= 2026])
    for cid, (cname, path, y) in sorted(shapes.items()):
        others = [n for c, (n, _, _) in mix(cid, list(shapes.items())) if c != cid][:3]
        question(f"track-{cid}", "circuits", "medium", "Which circuit is this?", cname, others,
                 f"That's {cname}, traced from the cars' positions in the {y} race.", f"/circuits/{cid}", "The circuit",
                 track=path, image=f"https://parc-ferme.pages.dev/data/og/tracks/{cid}.png")

    # recent race winners
    for year, r in races:
        if year < now_year - 8:
            continue
        top = sorted([x for x in r["results"] if (x["text"] or "").isdigit()], key=lambda x: x["pos"])[:4]
        if len(top) < 4 or len({x["d"] for x in top}) < 4:
            continue
        diff = "easy" if year >= now_year - 1 else "medium"
        question(f"winner-{year}-{r['round']}", "races", diff, f"Who won the {year} {r['name']}?",
                 nm(top[0]["d"]), [nm(x["d"]) for x in top[1:]],
                 f"{nm(top[0]['d'])} won the {year} {r['name']} for {names.team(top[0]['c'])}, ahead of {nm(top[1]['d'])}.",
                 link_race(year, r["round"]), f"The {year} {short(r['name'])}",
                 table=[[f"P{x['pos']} {nm(x['d'])}", x["time"] or x["status"] or "", None] for x in top[:3]])

    # this season
    rnds = [r for r in current["rounds"] if r["results"]]
    if rnds and current["standings"]["drivers"]:
        lead = current["standings"]["drivers"][0]
        season_c = defaultdict(lambda: {"scored": 0, "out": 0, "podiums": 0, "races": 0, "climb": (0, None)})
        for r in rnds:
            for x in r["results"]:
                c = season_c[x["d"]]
                if (x["text"] or "") in NOT_STARTED:
                    continue
                c["races"] += 1
                c["scored"] += 1 if x["pts"] else 0
                c["out"] += 0 if classified(x["status"]) else 1
                c["podiums"] += 1 if x["text"] in ("1", "2", "3") else 0
                if (x["text"] or "").isdigit() and x["grid"] and x["grid"] - x["pos"] > c["climb"][0]:
                    c["climb"] = (x["grid"] - x["pos"], r)
        n = len(rnds)
        always = [d for d, c in season_c.items() if c["races"] == n and c["scored"] == n]
        if always:
            fact(f"season-{now_year}-always", "this season", f"{' and '.join(nm(d) for d in always)} {'have' if len(always) > 1 else 'has'} scored points in every one of the {n} races in {now_year}.")
        out = max(season_c.items(), key=lambda x: (x[1]["out"], x[0]))
        if out[1]["out"] >= 3:
            fact(f"season-{now_year}-dnfs", "this season", f"{nm(out[0])} has failed to finish {out[1]['out']} of {n} races in {now_year}, the most on the grid.", link_driver(out[0]))
        climb = max(season_c.items(), key=lambda x: x[1]["climb"][0])
        if climb[1]["climb"][1]:
            k, r = climb[1]["climb"]
            fact(f"season-{now_year}-climb", "this season", f"The biggest climb of {now_year} so far: {nm(climb[0])} gained {k} places at the {r['name']}.", link_race(now_year, r["round"]))
        fact(f"season-{now_year}-leader", "this season", f"{nm(lead['d'])} leads the {now_year} championship with {lead['pts']} points and {plural(lead['wins'], 'win')} after {n} races.", "/standings")

    # on this day
    days = {}
    for md, items in by_date.items():
        out = []
        for x in sorted(items, key=lambda x: -x["year"]):
            c = career[x["d"]]
            count = len(c["wins"])
            extra = ", the first of their " + str(count) + " wins" if x["first"] and count > 1 else ", their only Grand Prix win" if count == 1 else ""
            out.append({"year": x["year"], "text": f"{nm(x['d'])} won the {x['year']} {x['name']} for {names.team(x['team'])}{extra}.",
                        "link": link_race(x["year"], x["round"])})
        days[md] = out

    facts.sort(key=lambda f: f["id"])
    quiz.sort(key=lambda q: q["id"])
    # a question of the day, the same for everyone, set two weeks ahead so a quiet spell can't leave a gap
    today = today or date.today()
    good = [q for q in quiz if q["difficulty"] != "easy" and not q["id"].startswith("winner-")]
    daily = {}
    used = set()
    for k in range(-2, 15):
        day = (today + timedelta(days=k)).isoformat()
        pick = min((q for q in good if q["id"] not in used), key=lambda q: hashlib.md5(f"{day}|{q['id']}".encode()).hexdigest())
        used.add(pick["id"])
        daily[day] = pick
    return {
        "daily": {"days": daily},
        "facts": {"count": len(facts), "facts": facts},
        "quiz": {"count": len(quiz), "questions": quiz},
        "onthisday": {"days": dict(sorted(days.items()))},
    }
