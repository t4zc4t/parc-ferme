"""Rebuilds race data: laps and pit stops from the latest dump, then OpenF1 for 2023 on.

    python pipeline/racedata.py jolpica-dump.zip

The dump part makes no API calls. OpenF1 is about 3 requests per race at 2.1s apart,
so a full season takes about two minutes and a first run of every season under ten.
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import laps  # noqa: E402
import openf1  # noqa: E402
import practice  # noqa: E402
import replay  # noqa: E402
import sitegen  # noqa: E402
import store  # noqa: E402
import update  # noqa: E402


def count(n, word):
    return f"{n} {word}" + ("" if n == 1 else "s")


def main():
    if len(sys.argv) < 2 or not Path(sys.argv[1]).is_file():
        sys.exit("usage: racedata.py <dump.zip>")
    labels = []
    n = laps.from_dump(sys.argv[1])
    print(f"laps from the dump: {n} files changed")
    if n:
        labels.append(f"laps for {count(n, 'race')}")

    got = sheets = replays = 0
    for year in range(openf1.FIRST, datetime.now(timezone.utc).year + 1):
        season = store.load(year)
        if season is None:
            continue
        try:
            done = openf1.fill(year, season)
            print(f"openf1 {year}: {done} races")
            got += done
            done = practice.fill(year, season)
            print(f"practice {year}: {done} sessions")
            sheets += done
            done = replay.fill(year, season)
            print(f"replays {year}: {done} races")
            replays += done
        except RuntimeError as err:
            print(f"openf1 {year} stopped: {err}")
    if got:
        labels.append(f"tyres for {count(got, 'race')}")
    if sheets:
        labels.append(f"practice times for {count(sheets, 'session')}")
    if replays:
        labels.append(f"replays for {count(replays, 'race')}")

    if sitegen.build() or labels:
        if store.commit("Race data: " + (", ".join(labels) or "site files rebuilt")):
            print("committed")
            update.trigger_build()


if __name__ == "__main__":
    main()
