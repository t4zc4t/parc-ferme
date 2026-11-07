"""Site files for the race explorer: a list per season and one file per race."""
import laps
import findings
import openf1
import practice
import replay
import store


def build(seasons, names, out):
    """returns True if any file changed"""
    changed = False
    years = []
    for s in seasons:
        year = s["year"]
        rounds = []
        for r in s["rounds"]:
            lap_file = laps.path(year, r["round"])
            tyre_file = openf1.path(year, r["round"])
            has_laps, has_tyres = lap_file.exists(), tyre_file.exists()
            win = next((x for x in r["results"] if x["text"] == "1"), None)
            rounds.append({
                "round": r["round"], "name": r["name"], "date": (r["sessions"].get("R") or "")[:10],
                "country": r["circuit"]["country"], "done": bool(r["results"]),
                "winner": {"id": win["d"], "name": names.driver(win["d"]), "code": names.code(win["d"]),
                           "team": names.team(win["c"])} if win else None,
                "laps": has_laps, "tyres": has_tyres, "replay": replay.have(year, r["round"]),
                "sprint": bool(r.get("sprint")), "page": bool(r["results"] or r.get("sprint") or r.get("quali")),
            })
            if not (r["results"] or r.get("sprint") or r.get("quali")):
                continue

            def rows(src):
                return [{
                    "id": x["d"], "name": names.driver(x["d"]), "code": names.code(x["d"]), "team": names.team(x["c"]),
                    "no": x.get("no"), "grid": x["grid"], "pos": x["text"] or str(x["pos"]), "order": x["pos"],
                    "laps": x["laps"], "status": x["status"], "time": x["time"], "points": x["pts"],
                    "fl": x.get("fl"),
                } for x in sorted(src, key=lambda x: x["pos"])]
            prov = r.get("provisional") or []
            page = {
                "year": year, "round": r["round"], "name": r["name"], "date": rounds[-1]["date"],
                "circuit": r["circuit"], "rounds": len(s["rounds"]),
                "provisional": "R" in prov,
                "results": rows(r["results"]),
            }
            if r.get("sprint"):
                page["sprint"] = rows(r["sprint"])
                page["sprintProvisional"] = "SR" in prov
            if r.get("quali"):
                page["quali"] = [{
                    "id": q["d"], "name": names.driver(q["d"]), "code": names.code(q["d"]), "team": names.team(q["c"]),
                    "pos": q["pos"], "q1": q.get("q1"), "q2": q.get("q2"), "q3": q.get("q3"),
                } for q in sorted(r["quali"], key=lambda q: q["pos"] or 99)]
                page["qualiProvisional"] = "Q" in prov
            if has_laps:
                page.update(store.read_json(lap_file))
            if has_tyres:
                extra = store.read_json(tyre_file)
                stops = {}
                for d, lap, _, _ in page.get("pits", []):
                    stops.setdefault(d, set()).add(lap)
                extra["stints"] = {d: openf1.reconcile(v, stops.get(d, set())) for d, v in extra["stints"].items()}
                page.update(extra)
            if replay.have(year, r["round"]):
                page["replay"] = True
                page["findings"] = findings.cards(page, names)
            times = practice.for_site(year, r["round"], names)
            if times:
                page["practice"] = times
            changed |= store.write_json(out / "races" / str(year) / f"{r['round']}.json", page)
        changed |= store.write_json(out / "races" / f"{year}.json", {"year": year, "rounds": rounds})
        years.append({"year": year, "races": sum(1 for x in rounds if x["done"]),
                      "laps": any(x["laps"] for x in rounds), "tyres": any(x["tyres"] for x in rounds)})
    changed |= store.write_json(out / "races" / "index.json", {"years": years[::-1]})
    return changed
