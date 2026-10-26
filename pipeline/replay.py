"""Race replays from OpenF1: where every car was, twice a second, from 2026 on.

About 26 requests a race (one location call per car plus laps, order, gaps, pits and
drivers), fetched once a few hours after the flag and never again. Stored straight in
the site folder as site/replay/<year>/<round>.json since it never changes.

File layout, times are seconds after the start, distances in metres:
  v        format version
  step     seconds between samples
  track    [[x, y], ...] the circuit, traced from one clean lap, starting at the line
  lap      length of that line
  cars     {id: {code, color, d: [...]}} distance travelled along the track, laps added
           up; first value absolute, then deltas, null where the car isn't on track
           (and the value after it absolute again)
  laps     {id: [start of lap 1, lap 2, ...]}
  order    {id: [[t, position], ...]}
  gaps     {id: [[t, gap], ...]} gap to the leader, a number or "+1 LAP"
  pits     [[id, t, seconds in the pit lane], ...]
  end      when the last car took the flag
"""
import json
import math
import urllib.request
from datetime import datetime

import openf1
import store

FIRST = 2026
STEP = 0.5
VERSION = 2         # 2: distance along the track instead of x and y
SCALE = 10          # openf1 units are a tenth of a metre, a metre is plenty


def path(year, rnd):
    return store.ROOT / "site" / "replay" / str(year) / f"{rnd}.json"


def have(year, rnd):
    """a replay in the current format"""
    try:
        return store.read_json(path(year, rnd)).get("v") == VERSION
    except (FileNotFoundError, ValueError):
        return False


def ts(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def turn(x, y, angle):
    """rotate so the map sits the way official track maps do"""
    c, s = math.cos(angle), math.sin(angle)
    return x * c - y * s, x * s + y * c


def rotation(key):
    """the circuit's map rotation, from the track info openf1 links to, 0 if missing"""
    try:
        meeting = openf1.get(f"sessions?session_key={key}")[0]["meeting_key"]
        url = openf1.get(f"meetings?meeting_key={meeting}")[0]["circuit_info_url"]
        req = urllib.request.Request(url, headers={"User-Agent": "parc-ferme-site"})
        with urllib.request.urlopen(req, timeout=30) as res:
            return math.radians(float(json.load(res).get("rotation") or 0))
    except Exception as err:
        print(f"no track rotation: {err}")
        return 0.0


def positions(rows, t0, end, angle=0.0):
    """raw positions every STEP seconds in metres, None where there's no reading within 5s"""
    pts = sorted((ts(r["date"]), *turn(r["x"], r["y"], angle)) for r in rows
                 if r.get("date") and not (r["x"] == 0 and r["y"] == 0))
    xs, ys, i = [], [], 0
    t = t0
    while t <= end:
        while i + 1 < len(pts) and pts[i + 1][0] <= t:
            i += 1
        if not pts or i + 1 >= len(pts) or pts[i][0] > t or t - pts[i][0] > 5 or pts[i + 1][0] - t > 5:
            xs.append(None)
            ys.append(None)
        else:
            (a, ax, ay), (b, bx, by) = pts[i], pts[i + 1]
            f = (t - a) / (b - a) if b > a else 0
            xs.append((ax + (bx - ax) * f) / SCALE)
            ys.append((ay + (by - ay) * f) / SCALE)
        t += STEP
    return xs, ys


class Track:
    """the traced lap as a line we can measure distance along"""

    def __init__(self, pts):
        # a point every couple of metres so projections are smooth
        fine = []
        for (ax, ay), (bx, by) in zip(pts, pts[1:] + pts[:1]):
            n = max(1, int(math.hypot(bx - ax, by - ay) // 2))
            fine.extend((ax + (bx - ax) * k / n, ay + (by - ay) * k / n) for k in range(n))
        self.pts = fine
        self.cum = [0.0]
        for (ax, ay), (bx, by) in zip(fine, fine[1:] + fine[:1]):
            self.cum.append(self.cum[-1] + math.hypot(bx - ax, by - ay))
        self.length = self.cum[-1]

    def project(self, x, y, near=None):
        """distance along the lap of the closest point, looking near the last one first"""
        n = len(self.pts)
        idx = range(n) if near is None else (i % n for i in range(near - 15, near + 60))
        best, bi, bt = None, 0, 0.0
        for i in idx:
            ax, ay = self.pts[i]
            bx, by = self.pts[(i + 1) % n]
            dx, dy = bx - ax, by - ay
            seg = dx * dx + dy * dy
            t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / seg)) if seg else 0.0
            d = (ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2
            if best is None or d < best:
                best, bi, bt = d, i, t
        if near is not None and best > 30 ** 2:
            return self.project(x, y)      # lost it, look everywhere
        return bi, self.cum[bi] + bt * (self.cum[bi + 1] - self.cum[bi]), best

    def distances(self, xs, ys):
        """metres travelled along the track at each sample, laps added up"""
        out, near, last, laps = [], None, None, 0
        for x, y in zip(xs, ys):
            if x is None:
                out.append(None)
                near = None
                continue
            near, s, far = self.project(x, y, near)
            if far > 80 ** 2:
                # parked in the garage or somewhere off the circuit
                out.append(None)
                near = None
                continue
            if last is not None:
                if s - last < -self.length / 2:
                    laps += 1
                elif s - last > self.length / 2:
                    laps -= 1
            last = s
            out.append(round(laps * self.length + s))
        return out


def pack(vals):
    out, last = [], None
    for v in vals:
        if v is None:
            out.append(None)
            last = None
        elif last is None:
            out.append(v)
            last = v
        else:
            out.append(v - last)
            last = v
    # trailing gaps carry nothing
    while out and out[-1] is None:
        out.pop()
    return out


def outline(rows, start, end, angle=0.0):
    """the circuit from one lap of one car, a point every few metres"""
    pts = [(ts(r["date"]), *(v / SCALE for v in turn(r["x"], r["y"], angle))) for r in rows
           if r.get("date") and start <= ts(r["date"]) <= end and not (r["x"] == 0 and r["y"] == 0)]
    pts.sort()
    out = []
    for _, x, y in pts:
        if not out or (x - out[-1][0]) ** 2 + (y - out[-1][1]) ** 2 >= 25:
            out.append((round(x), round(y)))
    return [list(p) for p in out]


def race(year, rnd, key):
    numbers = {int(r["no"]): r["d"] for r in rnd["results"] if str(r.get("no") or "").isdigit()}
    info = {d["driver_number"]: d for d in openf1.get(f"drivers?session_key={key}")}

    lap_rows = openf1.get(f"laps?session_key={key}")
    laps = {}
    for r in lap_rows:
        d = numbers.get(r.get("driver_number"))
        if d and r.get("date_start"):
            laps.setdefault(d, []).append((r["lap_number"], ts(r["date_start"]), r.get("lap_duration")))
    if not laps:
        print(f"{year} round {rnd['round']}: no laps for a replay yet")
        return False
    # lights out: the earliest lap 1, or lap 2 less a typical opening lap
    firsts = [t for v in laps.values() for n, t, _ in v if n == 1]
    t0 = min(firsts) if firsts else min(t for v in laps.values() for n, t, _ in v if n == 2) - 100
    ends = [t + dur for v in laps.values() for n, t, dur in v if dur and n == max(m for m, _, _ in v)]
    end = (max(ends) if ends else max(t for v in laps.values() for _, t, _ in v) + 120) + 30

    angle = rotation(key)
    raw, track = {}, None
    # the track comes from the winner's fastest lap, else anyone's, a fast lap is a clean one
    finish = [r["d"] for r in rnd["results"]]
    for no, d in sorted(numbers.items(), key=lambda kv: finish.index(kv[1]) if kv[1] in finish else 99):
        rows = openf1.get(f"location?session_key={key}&driver_number={no}")
        if not rows:
            continue
        raw[d] = (no, positions(rows, t0, end, angle))
        timed = [(dur, t) for n, t, dur in laps.get(d, []) if dur and n > 1]
        if track is None and timed:
            dur, t = min(timed)
            lap = outline(rows, t, t + dur, angle)
            if len(lap) > 50:
                track = lap
    if not raw or not track:
        print(f"{year} round {rnd['round']}: positions incomplete, no replay")
        return False

    line = Track(track)
    cars = {}
    for d, (no, (xs, ys)) in raw.items():
        meta = info.get(no, {})
        cars[d] = {"code": meta.get("name_acronym"), "color": "#" + (meta.get("team_colour") or "888888"),
                   "d": pack(line.distances(xs, ys))}

    order = {}
    for r in sorted(openf1.get(f"position?session_key={key}"), key=lambda r: r.get("date") or ""):
        d = numbers.get(r.get("driver_number"))
        if d and r.get("date") and r.get("position"):
            order.setdefault(d, []).append([max(0, round(ts(r["date"]) - t0)), r["position"]])

    gaps, last = {}, {}
    for r in sorted(openf1.get(f"intervals?session_key={key}"), key=lambda r: r.get("date") or ""):
        d = numbers.get(r.get("driver_number"))
        if not d or not r.get("date"):
            continue
        t = round(ts(r["date"]) - t0)
        if t < 0 or t - last.get(d, -99) < 5:
            continue
        g = r.get("gap_to_leader")
        gaps.setdefault(d, []).append([t, round(g, 1) if isinstance(g, (int, float)) else g])
        last[d] = t

    pits = []
    for r in openf1.get(f"pit?session_key={key}"):
        d = numbers.get(r.get("driver_number"))
        lane = r.get("lane_duration") or r.get("pit_duration")
        if d and r.get("date") and lane:
            pits.append([d, round(ts(r["date"]) - t0), round(lane, 1)])

    out = {
        "v": VERSION,
        "step": STEP,
        "lap": round(line.length),
        "end": round(end - t0),
        "track": track,
        "cars": cars,
        "laps": {d: [round(t - t0) for _, t, _ in sorted(v)] for d, v in laps.items()},
        "order": order,
        "gaps": gaps,
        "pits": sorted(pits, key=lambda p: p[1]),
    }
    return store.write_json(path(year, rnd["round"]), out)


def fill(year, season, limit=None, only=None):
    """finished races of a season without a replay yet"""
    if year < FIRST:
        return 0
    todo = [r for r in season["rounds"] if r["results"] and not have(year, r["round"])
            and (only is None or r["round"] in only)]
    if not todo:
        return 0
    by_day = openf1.sessions(year)
    done = 0
    for r in todo[:limit]:
        key = openf1.session_for(r, by_day)
        if key is None:
            print(f"{year} round {r['round']}: no openf1 session for a replay")
            continue
        done += bool(race(year, r, key))
    return done
