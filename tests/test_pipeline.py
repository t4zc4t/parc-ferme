"""Checks on the parts that have bitten before: provisional results, standings maths,
the feed, replay track maths and the trivia files."""
import copy
import importlib
import unittest
from datetime import datetime, timezone

from helpers import scratch_store

scratch_store()
import store  # noqa: E402  (reads PF_STORE when imported)
importlib.reload(store)
import early  # noqa: E402
import feed  # noqa: E402
import history  # noqa: E402
import og  # noqa: E402
import openf1  # noqa: E402
import replay  # noqa: E402
import sitegen  # noqa: E402
import standings  # noqa: E402
import trivia  # noqa: E402

YEAR = max(int(p.stem) for p in (store.ROOT / "current").glob("*.json"))


def fake_openf1(results, sessions):
    def get(ep, tries=4):
        if ep.startswith("sessions"):
            return sessions
        if ep.startswith("session_result"):
            return results
        if ep.startswith("laps") or ep.startswith("drivers"):
            return []
        raise AssertionError(ep)
    return get


class Provisional(unittest.TestCase):
    def setUp(self):
        self.season = store.load(YEAR)
        self.done = [r for r in self.season["rounds"] if r["results"]]
        self.rnd = self.done[-1]

    def test_race_rows_and_standings(self):
        s = copy.deepcopy(self.season)
        r = [x for x in s["rounds"] if x["round"] == self.rnd["round"]][0]
        official = r["results"]
        numbers = {int(x["no"]): x for x in official if str(x.get("no") or "").isdigit()}
        res = [{"position": x["pos"] if (x["text"] or "").isdigit() else None, "driver_number": n,
                "number_of_laps": x["laps"], "points": x["pts"], "dnf": not (x["text"] or "").isdigit(),
                "dns": False, "dsq": False, "duration": 5000.0 if x["pos"] == 1 else None,
                "gap_to_leader": 0 if x["pos"] == 1 else 10.5} for n, x in numbers.items()]
        start = r["sessions"]["R"]
        openf1.get = fake_openf1(res, [{"date_start": start, "session_key": 1}])
        before_pts = {x["d"]: x["pts"] for x in s["standings"]["drivers"]}
        r["results"] = []
        s.pop("official_standings", None)
        s["standings"] = copy.deepcopy(s["standings"])
        # pretend the standings are from before this race
        for x in s["standings"]["drivers"]:
            x["pts"] -= next((o["pts"] for o in official if o["d"] == x["d"]), 0)
        now = sitegen.when(start).replace(tzinfo=timezone.utc) if sitegen.when(start).tzinfo is None else sitegen.when(start)
        from datetime import timedelta
        added = early.fill(s, now + timedelta(hours=3))
        self.assertTrue(any("race" in a for a in added))
        self.assertEqual(r["results"][0]["d"], official[0]["d"])
        self.assertIn("R", r["provisional"])
        after = {x["d"]: x["pts"] for x in s["standings"]["drivers"]}
        for d, pts in before_pts.items():
            self.assertAlmostEqual(after.get(d, 0), pts, msg=d)


class Standings(unittest.TestCase):
    def test_running_totals_end_on_official_points(self):
        seasons = list(store.all_seasons())
        names = sitegen.Names(seasons)
        for s in seasons:
            if s["year"] < 1991 or not any(r["results"] for r in s["rounds"]):
                continue
            out = standings.season(s, names)
            for d in out["drivers"]:
                self.assertAlmostEqual(d["pts"][-1], d["final"], msg=f"{s['year']} {d['id']}")


class Feed(unittest.TestCase):
    def test_new_result_and_official_changes(self):
        s = store.load(YEAR)
        rnd = [r for r in s["rounds"] if r["results"]][-1]
        before = copy.deepcopy(s)
        b = [r for r in before["rounds"] if r["round"] == rnd["round"]][0]
        b["results"] = []
        items = feed.diff(before, s)
        self.assertTrue(any(i["session"] == "Race" and i["type"] == "result" for i in items))
        b["results"] = copy.deepcopy(rnd["results"])
        b["results"][0], b["results"][1] = dict(b["results"][1], pos=1), dict(b["results"][0], pos=2)
        b["provisional"] = ["R"]
        items = feed.diff(before, s)
        official = [i for i in items if i["type"] == "official"]
        self.assertEqual(len(official), 1)
        self.assertEqual(len(official[0]["changes"]), 2)


class Track(unittest.TestCase):
    def test_distance_runs_on_round_a_square(self):
        line = replay.Track([[0, 0], [100, 0], [100, 100], [0, 100]])
        self.assertAlmostEqual(line.length, 400, delta=1)
        xs = [10, 60, 100, 100, 50, 0, 0, 20]
        ys = [0, 0, 40, 90, 100, 60, 10, 0]
        d = line.distances(xs, ys)
        self.assertTrue(all(b > a for a, b in zip(d, d[1:])), d)
        self.assertGreater(d[-1], 400)


class Trivia(unittest.TestCase):
    def test_questions_are_well_formed(self):
        seasons = list(store.all_seasons())
        out = trivia.build(seasons, sitegen.Names(seasons))
        qs = out["quiz"]["questions"]
        self.assertGreater(len(qs), 100)
        ids = set()
        for q in qs:
            self.assertNotIn(q["id"], ids)
            ids.add(q["id"])
            self.assertEqual(len(set(q["options"])), len(q["options"]), q["id"])
            self.assertGreaterEqual(len(q["options"]), 2, q["id"])
            self.assertTrue(0 <= q["answer"] < len(q["options"]), q["id"])
            self.assertTrue(q["explain"].strip(), q["id"])
        self.assertGreater(out["facts"]["count"], 20)


class SprintReplay(unittest.TestCase):
    def test_own_file(self):
        self.assertTrue(str(replay.path(2026, 4, True)).endswith("2026/4-sprint.json"))
        self.assertTrue(str(replay.path(2026, 4)).endswith("2026/4.json"))

    def test_uses_sprint_rows(self):
        season = store.load(YEAR)
        rnd = next((r for r in season["rounds"] if r.get("sprint")), None)
        if rnd is None:
            self.skipTest("no sprint this season")
        asked = []

        def get(ep, tries=4):
            asked.append(ep)
            return []
        old = replay.openf1.get
        replay.openf1.get = get
        try:
            self.assertFalse(replay.race(YEAR, rnd, 1, sprint=True))
        finally:
            replay.openf1.get = old
        self.assertTrue(any(e.startswith("laps?session_key=1") for e in asked))


class ShareImages(unittest.TestCase):
    def test_cards_draw(self):
        if og.Image is None:
            self.skipTest("Pillow is not installed")
        import json
        site = store.ROOT / "site"
        drivers = sorted((site / "drivers").glob("*.json"))
        races = sorted((site / "races" / str(YEAR)).glob("*.json"))
        if not drivers or not races:
            self.skipTest("no site files in the test store")
        img = og.driver_card(json.loads(drivers[0].read_text()))
        self.assertEqual(img.size, (1200, 630))
        race = next(json.loads(r.read_text()) for r in races if json.loads(r.read_text()).get("results"))
        self.assertEqual(og.race_card(race, og.track_points("M10 10 L90 10 L90 90 Z")).size, (1200, 630))


class History(unittest.TestCase):
    def test_pages_add_up(self):
        import json
        import tempfile
        from pathlib import Path
        seasons = list(store.all_seasons())
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            history.build(seasons, sitegen.Names(seasons), out, set())
            read = lambda *p: json.loads(out.joinpath(*p).read_text())
            monza = read("circuits", "monza.json")
            self.assertEqual(monza["held"], len(monza["races"]))
            ferrari = read("teams", "ferrari.json")
            self.assertGreater(ferrari["wins"], 200)
            self.assertEqual(ferrari["wins"], sum(s["wins"] for s in ferrari["seasons"]))
            senna = read("careers", "senna.json")
            self.assertEqual(senna["wins"], len(senna["winList"]))
            self.assertEqual(senna["titles"], [1988, 1990, 1991])
            years = read("wrapped", "index.json")["years"]
            self.assertIn(2021, years)
            self.assertEqual(read("wrapped", "2021.json")["champion"]["id"], "max_verstappen")


if __name__ == "__main__":
    unittest.main()
