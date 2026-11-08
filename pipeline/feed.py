"""What just happened, newest first, for the site and for bots: site/feed.json.

Built by comparing the season before and after each updater run, so every new result,
provisional or official, turns into one entry. When an official result replaces a
provisional one, the entry lists what changed (a penalty, say).
"""
from datetime import datetime, timezone

import store

PATH = store.ROOT / "site" / "feed.json"
KEEP = 80
KINDS = {"Q": ("quali", "Qualifying"), "SR": ("sprint", "Sprint"), "R": ("results", "Race")}


def load():
    try:
        return store.read_json(PATH)["items"]
    except (FileNotFoundError, ValueError, KeyError):
        return []


def add(items):
    """True if anything new went in"""
    have = load()
    ids = {x["id"] for x in have}
    new = [x for x in items if x["id"] not in ids]
    if not new:
        return False
    merged = sorted(new + have, key=lambda x: x["time"], reverse=True)[:KEEP]
    store.write_json(PATH, {"updated": merged[0]["time"], "items": merged})
    return True


def now_iso(now=None):
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _name(season, d):
    info = season["drivers"].get(d, {})
    return " ".join(x for x in (info.get("first"), info.get("last")) if x) or d


def _code(season, d):
    return season["drivers"].get(d, {}).get("code") or d[:3].upper()


def _team(season, c):
    return (season["teams"].get(c) or {}).get("name", c or "")


def _top(season, kind, rows):
    rows = sorted(rows, key=lambda r: r["pos"] or 99)[:3]
    out = []
    for r in rows:
        time = (r.get("q3") or r.get("q2") or r.get("q1")) if kind == "Q" else r.get("time") or r.get("status")
        out.append({"pos": r["pos"], "id": r["d"], "code": _code(season, r["d"]), "name": _name(season, r["d"]),
                    "team": _team(season, r["c"]), "time": time})
    return out


def headline(season, rnd, kind, rows):
    first = sorted(rows, key=lambda r: r["pos"] or 99)[0]
    who = _name(season, first["d"])
    gp = rnd["name"]
    if kind == "Q":
        return f"{who} on pole for the {gp}"
    if kind == "SR":
        return f"{who} wins the {gp} sprint"
    return f"{who} wins the {gp}"


def changes(season, before, after):
    """how an official result differs from the provisional one"""
    was = {r["d"]: r for r in before}
    out = []
    for r in sorted(after, key=lambda r: r["pos"] or 99):
        o = was.get(r["d"])
        if not o:
            continue
        if o["pos"] != r["pos"]:
            out.append(f"{_code(season, r['d'])} P{o['pos']} to P{r['pos']}")
        elif r.get("time") and o.get("time") and r["time"] != o["time"] and r["pos"] != 1:
            out.append(f"{_code(season, r['d'])} time {o['time']} to {r['time']}")
    return out


def diff(before, after, now=None):
    """feed entries for what changed between two copies of a season"""
    if not after:
        return []
    when = now_iso(now)
    year = after["year"]
    old = {r["round"]: r for r in (before or {}).get("rounds", [])}
    items = []
    for rnd in after["rounds"]:
        o = old.get(rnd["round"], {})
        prov = rnd.get("provisional") or []
        oprov = o.get("provisional") or []
        for kind, (field, label) in KINDS.items():
            rows, orows = rnd.get(field) or [], o.get(field) or []
            if not rows:
                continue
            link = f"/races/{year}/{rnd['round']}"
            base = {"year": year, "round": rnd["round"], "race": rnd["name"], "session": label,
                    "link": link, "time": when, "top": _top(after, kind, rows)}
            if not orows:
                provisional = kind in prov
                items.append(dict(base, id=f"{year}-{rnd['round']}-{kind}-{'provisional' if provisional else 'result'}",
                                  type="provisional" if provisional else "result",
                                  title=headline(after, rnd, kind, rows),
                                  text=f"{label} result" + (" from live timing, the official one follows." if provisional else ".")))
            elif kind in oprov and kind not in prov:
                moved = changes(after, orows, rows)
                items.append(dict(base, id=f"{year}-{rnd['round']}-{kind}-official", type="official",
                                  title=f"Official {label.lower()} result for the {rnd['name']}",
                                  text=("Changed from live timing: " + ", ".join(moved) + ".") if moved
                                  else "Same as the live timing result.",
                                  changes=moved))
    return items


def note(id, title, text, link, year=None, rnd=None, now=None):
    """a one-off entry, a new replay say"""
    return {"id": id, "type": "extra", "title": title, "text": text, "link": link,
            "year": year, "round": rnd, "time": now_iso(now)}


def seed(season, rounds=3):
    """a first feed from the last few rounds, timed when each session ended"""
    from datetime import timedelta
    import sitegen
    done = [r for r in season["rounds"] if r["results"] or r.get("quali")][-rounds:]
    items = []
    for rnd in done:
        for item in diff({"rounds": []}, {**season, "rounds": [rnd]}):
            kind = {"Qualifying": "Q", "Sprint": "SR", "Race": "R"}[item["session"]]
            start = rnd["sessions"].get(kind)
            if start:
                item["time"] = now_iso(sitegen.when(start) + timedelta(minutes=sitegen.MINUTES[kind]))
            items.append(item)
    return items
