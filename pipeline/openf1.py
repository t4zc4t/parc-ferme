"""Tyres, safety cars and weather for races since 2023, from OpenF1's free tier.

Free limits are 3 requests a second and 30 a minute, so calls are spaced 2.1s apart.
Three requests per race (stints, race control, weather) plus one per season to find
the sessions. Stored as openf1/<year>/<round>.json.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta

import store

API = "https://api.openf1.org/v1"
FIRST = 2023
PAUSE = 2.1

_last = 0.0


def get(endpoint, tries=4):
    global _last
    url = f"{API}/{endpoint}"
    for attempt in range(tries):
        wait = PAUSE - (time.time() - _last)
        if wait > 0:
            time.sleep(wait)
        _last = time.time()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "parc-ferme-site"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return []
            if attempt == tries - 1:
                raise RuntimeError(f"could not load {url}: {err}")
            time.sleep(20 if err.code == 429 else 5 * (attempt + 1))
        except Exception as err:
            if attempt == tries - 1:
                raise RuntimeError(f"could not load {url}: {err}")
            time.sleep(5 * (attempt + 1))


def path(year, rnd):
    return store.ROOT / "openf1" / str(year) / f"{rnd}.json"


def have(year, rnd):
    return path(year, rnd).exists()


def day(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).date()


def sessions(year):
    """race sessions of a season, keyed by date"""
    return {day(s["date_start"]): s["session_key"] for s in get(f"sessions?year={year}&session_name=Race")}


def session_for(rnd, by_day):
    start = rnd["sessions"].get("R")
    if not start:
        return None
    d = day(start)
    for off in (0, -1, 1):
        if d + timedelta(days=off) in by_day:
            return by_day[d + timedelta(days=off)]
    return None


def periods(messages):
    """safety car, virtual safety car and red flag spans as [kind, from lap, to lap]"""
    out, open_ = [], {}
    for m in sorted(messages, key=lambda m: m.get("date") or ""):
        lap, text, flag = m.get("lap_number"), (m.get("message") or "").upper(), m.get("flag")
        if not lap:
            continue
        if "VIRTUAL SAFETY CAR DEPLOYED" in text:
            open_.setdefault("VSC", lap)
        elif "VIRTUAL SAFETY CAR ENDING" in text and "VSC" in open_:
            out.append(["VSC", open_.pop("VSC"), lap])
        elif "SAFETY CAR DEPLOYED" in text:
            open_.setdefault("SC", lap)
        elif "SAFETY CAR IN THIS LAP" in text and "SC" in open_:
            out.append(["SC", open_.pop("SC"), lap])
        elif flag == "RED":
            open_.setdefault("RED", lap)
        elif flag == "GREEN" and "RED" in open_:
            out.append(["RED", open_.pop("RED"), lap])
    out.extend([k, v, v] for k, v in open_.items())
    return sorted(out, key=lambda p: p[1])


def weather(rows):
    if not rows:
        return None
    pick = lambda k: [r[k] for r in rows if r.get(k) is not None]
    air, track = pick("air_temperature"), pick("track_temperature")
    return {
        "air": [min(air), max(air)] if air else None,
        "track": [min(track), max(track)] if track else None,
        "rain": any(r.get("rainfall") for r in rows),
    }


def race(year, rnd, key):
    """one race, three requests"""
    numbers = {int(r["no"]): r["d"] for r in rnd["results"] if r.get("no") and str(r["no"]).isdigit()}
    stints = {}
    for s in get(f"stints?session_key={key}"):
        d = numbers.get(s.get("driver_number"))
        if d and s.get("lap_start"):
            stints.setdefault(d, []).append([s["lap_start"], s.get("lap_end") or s["lap_start"],
                                             (s.get("compound") or "UNKNOWN").upper(), s.get("tyre_age_at_start")])
    for v in stints.values():
        v.sort()
    if not stints:
        print(f"{year} round {rnd['round']}: no tyre data yet")
        return False
    out = {
        "stints": stints,
        "periods": periods(get(f"race_control?session_key={key}")),
        "weather": weather(get(f"weather?session_key={key}")),
    }
    return store.write_json(path(year, rnd["round"]), out)


def fill(year, season, limit=None, only=None):
    """races of a season that have results but no OpenF1 file yet"""
    todo = [r for r in season["rounds"] if r["results"] and not have(year, r["round"])
            and (only is None or r["round"] in only)]
    if year < FIRST or not todo:
        return 0
    by_day = sessions(year)
    done = 0
    for r in todo[:limit]:
        key = session_for(r, by_day)
        if key is None:
            print(f"{year} round {r['round']}: no OpenF1 session found")
            continue
        done += race(year, r, key)
    return done
