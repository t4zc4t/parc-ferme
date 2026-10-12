"""Fill archive/ with missing finished seasons. Slow on purpose (500 req/hour limit).

    python pipeline/backfill.py [first] [last]
"""
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("PF_PAUSE", "7.5")

import api  # noqa: E402
import season  # noqa: E402
import store  # noqa: E402

BUDGET = float(os.environ.get("PF_BUDGET_MIN", "320")) * 60   # stop well before the 6 hour job limit
EVERY = 5


def year_arg(i, default, this_year):
    """comes from a github form, so only plain years get through"""
    raw = sys.argv[i].strip() if len(sys.argv) > i else ""
    if not raw:
        return default
    if not raw.isdigit() or not 1950 <= int(raw) <= this_year:
        sys.exit(f"not a season year: {raw!r}")
    return int(raw)


def main():
    this_year = datetime.now(timezone.utc).year
    first = year_arg(1, 1950, this_year)
    last = year_arg(2, this_year - 1, this_year)
    have = set(store.archived_years())
    todo = [y for y in range(first, last + 1) if y not in have]
    print(f"{len(todo)} seasons to fetch, pausing {api.PAUSE}s between requests")

    started, done = time.time(), []
    for year in todo:
        if time.time() - started > BUDGET:
            print("time budget used up, the next run will continue")
            break
        data = season.fetch(year)
        if not data["complete"]:
            print(f"{year}: not finished yet, skipped")
            continue
        store.save_season(data, finished=True)
        done.append(year)
        print(f"{year}: {len(data['rounds'])} rounds, {len(data['drivers'])} drivers")
        if len(done) % EVERY == 0:
            store.commit(f"Archive {done[-EVERY]}-{done[-1]}")
    if done:
        store.commit(f"Archive up to {done[-1]}")
    print(f"archived {len(done)} seasons")


if __name__ == "__main__":
    main()
