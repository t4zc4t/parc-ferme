"""Pulls the current season from the Jolpica API and writes site/data/home.json.

Cloudflare Pages runs this on every build, so each deploy carries fresh data.
If the API can't be reached the script exits with an error, the build fails,
and Cloudflare keeps serving the last good version of the site.
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.jolpi.ca/ergast/f1"
OUT = Path(__file__).resolve().parent.parent / "site" / "data" / "home.json"


def get(path, tries=3):
    url = f"{API}/{path}"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "parc-ferme-site"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)["MRData"]
        except Exception as err:
            if attempt == tries - 1:
                raise RuntimeError(f"could not load {url}: {err}")
            time.sleep(3 * (attempt + 1))


def race_start(race):
    t = race.get("time", "00:00:00Z")
    return datetime.fromisoformat(f"{race['date']}T{t}".replace("Z", "+00:00"))


def next_race(races, now):
    for race in races:
        start = race_start(race)
        if start > now:
            return {
                "round": int(race["round"]),
                "name": race["raceName"],
                "circuit": race["Circuit"]["circuitName"],
                "place": f"{race['Circuit']['Location']['locality']}, {race['Circuit']['Location']['country']}",
                "start": start.isoformat().replace("+00:00", "Z"),
                "dateLabel": start.strftime("%-d %b %Y") if sys.platform != "win32" else start.strftime("%#d %b %Y"),
            }
    return None


def team_name(name):
    # the API writes some teams as "Alpine F1 Team", the rest just as "Ferrari"
    return name.replace(" F1 Team", "").strip()


def driver_rows(table):
    lists = table["StandingsLists"]
    if not lists:
        return [], 0
    rows = []
    for s in lists[0]["DriverStandings"]:
        d = s["Driver"]
        rows.append({
            "pos": s.get("positionText", s.get("position", "")),
            "driver": f"{d['givenName']} {d['familyName']}",
            "code": d.get("code", ""),
            "team": team_name(s["Constructors"][-1]["name"]) if s["Constructors"] else "",
            "wins": int(s["wins"]),
            "points": float(s["points"]),
        })
    return rows, int(lists[0]["round"])


def main():
    now = datetime.now(timezone.utc)
    schedule = get("current.json")["RaceTable"]
    standings = get("current/driverstandings.json")["StandingsTable"]

    races = schedule["Races"]
    rows, after_round = driver_rows(standings)
    for r in rows:
        r["points"] = int(r["points"]) if r["points"].is_integer() else r["points"]

    home = {
        "season": int(schedule["season"]),
        "rounds": len(races),
        "afterRound": after_round,
        "next": next_race(races, now),
        "standings": rows,
        "updated": now.isoformat(timespec="minutes").replace("+00:00", "Z"),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(home, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {OUT.name}: {len(rows)} drivers after round {after_round} of {len(races)}")


if __name__ == "__main__":
    main()
