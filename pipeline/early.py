"""Race and sprint results from OpenF1 while Jolpica catches up.

Jolpica is run by volunteers and can take several hours after the flag. OpenF1 has the
classification about half an hour after the session ends, so the site shows that in the
meantime, marked provisional. The next Jolpica refresh replaces it with the official data.
"""
from datetime import timedelta

import openf1
import sitegen

KINDS = {"R": ("results", "Race"), "SR": ("sprint", "Sprint"), "Q": ("quali", "Qualifying")}
# points for the top ten of a race and the top eight of a sprint
POINTS = {"R": [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], "SR": [8, 7, 6, 5, 4, 3, 2, 1]}
# the session whose order sets the grid, the official grid then adds the penalties
GRID_FROM = {"R": "Qualifying", "SR": "Sprint Qualifying"}
WAIT = timedelta(minutes=35)       # openf1 opens 30 minutes after a session


def clock(seconds):
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{int(h)}:{int(m):02d}:{s:06.3f}" if h else f"{int(m)}:{s:06.3f}"


def gap_text(gap):
    m, s = divmod(gap, 60)
    return f"+{int(m)}:{s:06.3f}" if m else f"+{s:.3f}"


def who(season):
    """driver number -> (driver id, team id) from this season's latest results"""
    out = {}
    for rnd in season["rounds"]:
        for row in (rnd.get("results") or []) + (rnd.get("sprint") or []) + (rnd.get("quali") or []):
            no = row.get("no")
            if no and str(no).isdigit():
                out[int(no)] = (row["d"], row["c"])
    # the quali rows have no car number, so fall back on each driver's number
    for did, d in season["drivers"].items():
        if d.get("number") and str(d["number"]).isdigit():
            latest = next((r["c"] for rnd in reversed(season["rounds"]) for r in rnd.get("quali") or [] if r["d"] == did), None)
            out.setdefault(int(d["number"]), (did, latest))
    return out


def slug(text):
    import unicodedata
    plain = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return "_".join("".join(ch if ch.isalnum() else " " for ch in plain).split())


def stand_ins(season, key, numbers, wanted):
    """cars the season hasn't seen yet, a stand-in driver say: name and team from openf1"""
    missing = [n for n in wanted if n not in numbers]
    if not missing:
        return
    teams = {v["name"].lower(): c for c, v in season["teams"].items()}
    for d in openf1.get(f"drivers?session_key={key}"):
        n = d.get("driver_number")
        if n not in missing or not d.get("last_name"):
            continue
        did = slug(d["last_name"])
        if did in season["drivers"] and season["drivers"][did].get("number") not in (None, str(n)):
            did = slug(f"{d.get('first_name', '')} {d['last_name']}")
        name = (d.get("team_name") or "").lower()
        team = next((c for t, c in teams.items() if t and name and (t in name or name in t)), None)
        if team is None:
            continue
        season["drivers"].setdefault(did, {"first": d.get("first_name"), "last": d["last_name"],
                                           "code": d.get("name_acronym"), "number": str(n), "nat": None, "dob": None})
        numbers[n] = (did, team)
        print(f"car {n} is {d.get('full_name')} for {season['teams'][team]['name']}, not in the season yet")


def session_key(year, rnd, name):
    rows = openf1.get(f"sessions?year={year}&session_name={name}")
    by_day = {openf1.day(s["date_start"]): s["session_key"] for s in rows}
    start = rnd["sessions"].get("R")
    if not start:
        return None
    d = openf1.day(start)
    for off in (0, -1, 1, -2):
        if d + timedelta(days=off) in by_day:
            return by_day[d + timedelta(days=off)]
    return None


def lap_text(v):
    if not isinstance(v, (int, float)) or v <= 0:
        return None
    m, s = divmod(v, 60)
    return f"{int(m)}:{s:06.3f}"


def quali_rows(season, key):
    numbers = who(season)
    res = openf1.get(f"session_result?session_key={key}")
    if not res or not any(r.get("position") for r in res):
        return None
    stand_ins(season, key, numbers, [r["driver_number"] for r in res])
    out = []
    for r in sorted(res, key=lambda r: (r.get("position") is None, r.get("position") or 0)):
        no = r["driver_number"]
        if no not in numbers:
            raise RuntimeError(f"car {no} isn't in the season yet, waiting for Jolpica")
        did, team = numbers[no]
        times = r.get("duration") if isinstance(r.get("duration"), list) else [r.get("duration")]
        times = [lap_text(t) for t in times] + [None, None, None]
        out.append({"d": did, "c": team, "pos": r.get("position"), "q1": times[0], "q2": times[1], "q3": times[2]})
    return out


def start_grid(season, rnd, kind):
    """the official starting grid with penalties applied, driver id -> slot, empty until it's out"""
    key = session_key(season["year"], rnd, GRID_FROM[kind])
    if key is None:
        return {}
    numbers = who(season)
    rows = openf1.get(f"starting_grid?session_key={key}") or []
    return {numbers[r["driver_number"]][0]: r["position"] for r in rows
            if r.get("position") and r.get("driver_number") in numbers}


def rows_for(season, rnd, key, kind="R"):
    numbers = who(season)
    res = openf1.get(f"session_result?session_key={key}")
    if not res or not any(r.get("position") for r in res):
        return None
    stand_ins(season, key, numbers, [r["driver_number"] for r in res])
    grid = start_grid(season, rnd, kind)
    official = bool(grid)
    if not official and kind == "R":
        grid = {q["d"]: q["pos"] for q in rnd.get("quali") or []}
    # openf1 sometimes leaves points at zero for a while, then they come from the finishing order
    scored = any(r.get("points") for r in res)
    # fastest lap ranks from the lap times
    best = {}
    for lap in openf1.get(f"laps?session_key={key}"):
        t = lap.get("lap_duration")
        if t and not lap.get("is_pit_out_lap"):
            n = lap["driver_number"]
            best[n] = min(best.get(n, t), t)
    rank = {n: i + 1 for i, n in enumerate(sorted(best, key=best.get))}
    leader = max((r.get("number_of_laps") or 0) for r in res)
    out = []
    order = sorted(res, key=lambda r: (r.get("position") is None, r.get("position") or 0,
                                       -(r.get("number_of_laps") or 0)))
    for i, r in enumerate(order, 1):
        no = r["driver_number"]
        if no not in numbers:
            raise RuntimeError(f"car {no} isn't in the season yet, waiting for Jolpica")
        did, team = numbers[no]
        laps_done = r.get("number_of_laps") or 0
        gap = r.get("gap_to_leader")
        if r.get("dsq"):
            status, text = "Disqualified", "D"
        elif r.get("dns"):
            status, text = "Did not start", "W"
        elif r.get("dnf"):
            status, text = "Retired", "R"
        elif laps_done < leader or (isinstance(gap, str) and "LAP" in gap.upper()):
            status, text = "Lapped", str(r["position"])
        else:
            status, text = "Finished", str(r["position"])
        if i == 1 and r.get("duration"):
            time = clock(r["duration"])
        elif isinstance(gap, (int, float)) and gap > 0:
            time = gap_text(gap)
        else:
            time = None
        if scored:
            pts = r.get("points") or 0
        elif text.isdigit() and int(text) <= len(POINTS[kind]):
            pts = POINTS[kind][int(text) - 1]
        else:
            pts = 0
        # left out of a published grid means a pit lane start
        slot = grid.get(did, 0 if official else None)
        out.append({
            "d": did, "c": team, "no": str(no), "grid": slot,
            "pos": i, "text": text, "pts": pts, "laps": laps_done,
            "status": status, "time": time, "fl": str(rank[no]) if no in rank else None,
        })
    if official:
        rnd["grids"] = sorted(set(rnd.get("grids") or []) | {kind})
    return out


def restand(season):
    """standings rebuilt from the last official table plus the provisional rounds"""
    base = season.get("official_standings") or season["standings"]
    season["official_standings"] = base
    drivers = {s["d"]: dict(s, c=list(s["c"])) for s in base["drivers"]}
    teams = {s["c"]: dict(s) for s in base["teams"]}
    last = base["round"]
    for rnd in season["rounds"]:
        if not rnd.get("provisional"):
            continue
        for kind in rnd["provisional"]:
            if kind == "Q":
                continue
            for row in rnd[KINDS[kind][0]]:
                d = drivers.setdefault(row["d"], {"d": row["d"], "pts": 0, "wins": 0, "c": []})
                d["pts"] = (d.get("pts") or 0) + row["pts"]
                if row["c"] and row["c"] not in d["c"]:
                    d["c"].append(row["c"])
                if row["c"]:
                    t = teams.setdefault(row["c"], {"c": row["c"], "pts": 0, "wins": 0})
                    t["pts"] = (t.get("pts") or 0) + row["pts"]
                if kind == "R" and row["pos"] == 1:
                    d["wins"] += 1
                    if row["c"]:
                        teams[row["c"]]["wins"] += 1
            last = max(last, rnd["round"])

    def rank(rows):
        rows = sorted(rows, key=lambda s: (-(s.get("pts") or 0), -s.get("wins", 0)))
        for i, s in enumerate(rows, 1):
            s["pos"], s["text"] = i, str(i)
        return rows
    season["standings"] = {"round": last, "drivers": rank(drivers.values()), "teams": rank(teams.values())}


def fill(season, now):
    """provisional results for sessions that ended a while ago and Jolpica hasn't got yet"""
    year = season["year"]
    added = []
    for rnd in season["rounds"]:
        # the official grid before the race starts, once the stewards have applied the penalties
        start = rnd["sessions"].get("R")
        if start and rnd.get("quali") and not rnd["results"] and sitegen.when(start) - timedelta(days=1) <= now <= sitegen.when(start):
            try:
                grid = start_grid(season, rnd, "R")
            except Exception as e:      # the grid is a nice extra, the results matter more
                print(f"round {rnd['round']} starting grid: {e}")
                grid = {}
            if grid and grid != rnd.get("grid"):
                rnd["grid"] = grid
                added.append(f"round {rnd['round']} starting grid")
        for kind, (field, name) in KINDS.items():
            start = rnd["sessions"].get(kind)
            # a provisional result is redone until it has the official grid in it
            redo = kind != "Q" and kind in (rnd.get("provisional") or []) and kind not in (rnd.get("grids") or [])
            if not start or (rnd[field] and not redo):
                continue
            end = sitegen.when(start) + timedelta(minutes=sitegen.MINUTES[kind])
            if not (end + WAIT <= now <= end + timedelta(days=3)):
                continue
            key = session_key(year, rnd, name)
            if key is None:
                print(f"round {rnd['round']} {name.lower()}: no openf1 session yet")
                continue
            rows = quali_rows(season, key) if kind == "Q" else rows_for(season, rnd, key, kind)
            if not rows:
                print(f"round {rnd['round']} {name.lower()}: openf1 has no result yet")
                continue
            if rows == rnd[field]:
                continue
            rnd[field] = rows
            rnd["provisional"] = sorted(set(rnd.get("provisional") or []) | {kind})
            added.append(f"round {rnd['round']} {name.lower()}")
    if any(a.endswith(("race", "sprint")) for a in added):
        restand(season)
    return added
