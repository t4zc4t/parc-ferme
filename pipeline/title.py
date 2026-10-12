"""Title fight: who's mathematically out, plus odds from 10k simulated seasons.

Seeded from the data, so the same results always give the same numbers.
"""
import random
import zlib
from collections import Counter, defaultdict

SIMS = 10000


def scoring(season, key):
    """points per place, read from this season's results"""
    by_pos = defaultdict(Counter)
    for r in season["rounds"]:
        for row in r[key]:
            if row["pos"]:
                by_pos[row["pos"]][row["pts"]] += 1
    table = []
    for pos in range(1, 31):
        if not by_pos.get(pos):
            break
        table.append(by_pos[pos].most_common(1)[0][0])
    while table and table[-1] == 0:
        table.pop()
    return table


def remaining(season):
    races = [r for r in season["rounds"] if not r["results"]]
    sprints = [r for r in races if "SR" in r["sessions"] and not r["sprint"]]
    return races, sprints


def form(season, active):
    """finishing places this season (oldest first) and DNF rate"""
    out = {}
    for did in active:
        places, dnf, starts = [], 0, 0
        for r in season["rounds"]:
            for row in r["results"]:
                if row["d"] != did:
                    continue
                starts += 1
                if row["text"] and row["text"].isdigit() and row["status"] and (
                        row["status"] == "Finished" or row["status"].startswith("+") or row["status"] == "Lapped"):
                    places.append(row["pos"])
                else:
                    dnf += 1
        if not places:
            places = [18]
        # small prior so one weekend doesn't decide it
        out[did] = {"places": places, "dnf": (dnf + 1) / (starts + 10)}
    return out


def simulate(season, active, team_of, race_pts, sprint_pts, n_races, n_sprints):
    seed = zlib.crc32(f"{season['year']}-{season['standings']['round']}-{len(active)}".encode())
    rng = random.Random(seed)
    f = form(season, active)
    weights = {d: [0.6 + 0.8 * i / max(1, len(f[d]["places"]) - 1) for i in range(len(f[d]["places"]))]
               for d in active}
    base = {s["d"]: s["pts"] for s in season["standings"]["drivers"]}
    wins = {s["d"]: s["wins"] for s in season["standings"]["drivers"]}
    titles, team_titles = Counter(), Counter()
    teams = sorted(set(team_of.values()))
    team_base = {t["c"]: t["pts"] for t in season["standings"]["teams"]}

    def one_event(points_table, totals, team_totals, wins_now):
        scores = []
        for d in active:
            if rng.random() < f[d]["dnf"]:
                continue
            pick = rng.choices(f[d]["places"], weights=weights[d])[0]
            scores.append((pick + rng.uniform(-2.5, 2.5), d))
        scores.sort()
        for i, (_, d) in enumerate(scores):
            if i >= len(points_table):
                break
            totals[d] += points_table[i]
            team_totals[team_of[d]] += points_table[i]
        if scores and wins_now is not None:
            wins_now[scores[0][1]] += 1

    for _ in range(SIMS):
        totals = Counter({d: base.get(d, 0) for d in active})
        team_totals = Counter({t: team_base.get(t, 0) for t in teams})
        wins_now = Counter({d: wins.get(d, 0) for d in active})
        for _ in range(n_races):
            one_event(race_pts, totals, team_totals, wins_now)
        for _ in range(n_sprints):
            one_event(sprint_pts, totals, team_totals, None)
        # ties go to more wins
        champ = max(active, key=lambda d: (totals[d], wins_now[d]))
        titles[champ] += 1
        team_titles[max(teams, key=lambda t: team_totals[t])] += 1
    return {d: titles[d] / SIMS for d in active}, {t: team_titles[t] / SIMS for t in teams}


def build(season, names):
    standings = season["standings"]
    if not standings["drivers"]:
        return None
    race_pts, sprint_pts = scoring(season, "results"), scoring(season, "sprint")
    races, sprints = remaining(season)
    max_driver = len(races) * (race_pts[0] if race_pts else 0) + len(sprints) * (sprint_pts[0] if sprint_pts else 0)
    max_team = len(races) * sum(race_pts[:2]) + len(sprints) * sum(sprint_pts[:2])

    # still racing = has a result in the last 3 rounds
    done = [r for r in season["rounds"] if r["results"]]
    recent = {row["d"] for r in done[-3:] for row in r["results"]}
    team_of = {}
    for r in done[-3:]:
        for row in r["results"]:
            team_of[row["d"]] = row["c"]
    active = [s["d"] for s in standings["drivers"] if s["d"] in recent]

    finished = not races and not sprints
    if finished or not active:
        probs, team_probs = {}, {}
    else:
        probs, team_probs = simulate(season, active, team_of, race_pts, sprint_pts, len(races), len(sprints))

    lead_d = standings["drivers"][0]
    second_d = standings["drivers"][1] if len(standings["drivers"]) > 1 else None
    next_round = races[0] if races else None
    next_max = 0
    if next_round:
        next_max = race_pts[0] + (sprint_pts[0] if next_round in sprints else 0)

    def entry(rows, key, max_left, probs, label, leader, runner):
        out = []
        for s in rows:
            ident = s[key]
            gap = leader["pts"] - s["pts"]
            alive = s["pts"] + max_left >= leader["pts"]
            item = {
                "id": ident, "name": label(ident), "pos": s["text"] or s["pos"], "points": s["pts"],
                "gap": gap, "maxPoints": s["pts"] + max_left, "alive": alive and not finished,
                "prob": round(probs.get(ident, 0.0), 4),
            }
            if finished:
                item["note"] = "Champion" if ident == leader[key] else "Season over"
            elif ident == leader[key]:
                lead = leader["pts"] - (runner["pts"] if runner else 0)
                if runner is None or lead > max_left:
                    item["note"] = "Champion, it can't be caught any more"
                    item["clinched"] = True
                else:
                    # rivals' max drops by this event's points
                    need = max_left - next_max - lead + 1
                    item["note"] = (f"Leads by {lead}. Clinches at the {next_round['name']} by finishing "
                                    f"{max(need, 1)} or more points clear of every rival there"
                                    if need <= next_max else
                                    f"Leads by {lead} with {max_left} points still on offer")
            elif alive:
                per = gap / max(1, len(races) + len(sprints))
                item["note"] = (f"Needs to outscore {label(leader[key])} by {gap + 1} or more over the "
                                f"last {len(races)} {'race' if len(races) == 1 else 'races'}"
                                + (f" and {len(sprints)} {'sprint' if len(sprints) == 1 else 'sprints'}" if sprints else "")
                                + f", about {per:.0f} a round" if gap > 0 else "Level on points, wins decide a tie")
            else:
                item["note"] = f"Out of the fight, {gap - max_left} short even with maximum points"
            out.append(item)
        return out

    drivers = entry(standings["drivers"], "d", max_driver, probs, names.driver, lead_d, second_d)
    for d in drivers:
        d["code"] = names.code(d["id"])
        d["team"] = names.team(team_of.get(d["id"], "")) if d["id"] in team_of else ""
    teams = entry(standings["teams"], "c", max_team, team_probs, names.team,
                  standings["teams"][0] if standings["teams"] else None,
                  standings["teams"][1] if len(standings["teams"]) > 1 else None) if standings["teams"] else []

    return {
        "season": season["year"],
        "racesLeft": len(races), "sprintsLeft": len(sprints),
        "maxDriver": max_driver, "maxTeam": max_team,
        "sims": SIMS if probs else 0,
        "finished": finished,
        "drivers": drivers, "teams": teams,
    }
