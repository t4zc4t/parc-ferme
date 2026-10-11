"""Builds every data file the site reads, into site/data/.

Cloudflare Pages runs this on every build, so each deploy carries fresh data.
If the API can't be reached the script exits with an error, the build fails,
and Cloudflare keeps serving the last good version of the site.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import drivers  # noqa: E402
import home  # noqa: E402
from api import get  # noqa: E402

DATA = Path(__file__).resolve().parent.parent / "site" / "data"


def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    now = datetime.now(timezone.utc)
    stamp = now.isoformat(timespec="minutes").replace("+00:00", "Z")

    schedule = get("current.json")["RaceTable"]
    standings = get("current/driverstandings.json")["StandingsTable"]

    page = home.build(schedule, standings, now)
    page["updated"] = stamp
    write(DATA / "home.json", page)
    print(f"home: {len(page['standings'])} drivers, {page['standingsNote'].lower()}")

    index, files = drivers.build(page["standings"], page["season"], now.date())
    write(DATA / "drivers.json", {"season": page["season"], "updated": stamp, "drivers": index})
    for did, data in files.items():
        data["updated"] = stamp
        write(DATA / "drivers" / f"{did}.json", data)
    print(f"drivers: {len(files)} pages")


if __name__ == "__main__":
    main()
