"""Updater. Only hits the API when a session just ended without results,
the daily check is due, or PF_FORCE=1. Commits and builds only on change.
After a race it also picks up the laps, pit stops and OpenF1 data for it.
"""
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import api  # noqa: E402
import laps  # noqa: E402
import openf1  # noqa: E402
import practice  # noqa: E402
import season  # noqa: E402
import sitegen  # noqa: E402
import store  # noqa: E402

ENDPOINT = {"Q": "qualifying", "SR": "sprint", "R": "results"}
WATCH = timedelta(hours=48)
DAILY = timedelta(hours=20)
CHECKED = store.ROOT / "meta" / "checked.json"


def current_year(now):
    folder = store.ROOT / "current"
    years = [int(p.stem) for p in folder.glob("*.json")] if folder.exists() else []
    return max(years) if years else now.year


def waiting_sessions(data, now):
    """ended recently, no results yet"""
    out = []
    for rnd in data["rounds"]:
        for kind, start in rnd["sessions"].items():
            if kind not in ENDPOINT or not start:
                continue
            end = sitegen.when(start) + timedelta(minutes=sitegen.MINUTES[kind])
            if end <= now < end + WATCH and not sitegen.has_data(rnd, kind):
                out.append((rnd["round"], kind, end))
    return out


def probe(year, rnd, kind):
    return int(api.get(f"{year}/{rnd}/{ENDPOINT[kind]}.json?limit=1")["total"]) > 0


def last_full_check():
    """kept on the data branch so a skipped run can't skip the daily check"""
    try:
        return sitegen.when(store.read_json(CHECKED)["full"])
    except (FileNotFoundError, KeyError, ValueError):
        return datetime(2000, 1, 1, tzinfo=timezone.utc)


def looks_sane(new, old):
    """never replace good data with less"""
    if old is None:
        return bool(new["rounds"])
    if new["year"] != old["year"] or not new["rounds"]:
        return False
    had = sum(1 for r in old["rounds"] if r["results"])
    has = sum(1 for r in new["rounds"] if r["results"])
    return has >= had and len(new["standings"]["drivers"]) >= min(len(old["standings"]["drivers"]), 10)


def reason_to_refresh(now):
    if os.environ.get("PF_FORCE") in ("1", "true"):
        return "manual run"
    year = current_year(now)
    data = store.load(year)
    if data is None:
        return f"no data for {year} yet"
    if now - last_full_check() >= DAILY:
        return "daily check"
    if data["complete"] and now.year > year:
        return f"looking for the {now.year} calendar"
    for rnd, kind, end in waiting_sessions(data, now):
        if probe(year, rnd, kind):
            return f"round {rnd} {sitegen.LABELS[kind].lower()} result is out"
        print(f"round {rnd} {kind}: not published yet")
    return None


def refresh(now):
    year = current_year(now)
    labels = []
    data = season.fetch(year)
    if not looks_sane(data, store.load(year)):
        raise SystemExit(f"the API answer for {year} has less data than the store, keeping what we have")
    if store.save_season(data, finished=data["complete"]):
        labels.append(f"{year} {'archived' if data['complete'] else 'updated'}")
    # start next season once its calendar is out
    if data["complete"] and now.year >= year:
        nxt = season.fetch(year + 1)
        if nxt["rounds"] and store.save_season(nxt, finished=False):
            labels.append(f"{year + 1} calendar added")
    return labels


def race_extras(now):
    """laps and pit stops for finished races of this season, then tyres and safety cars"""
    year = current_year(now)
    data = store.load(year)
    if data is None:
        return []
    labels, finished = [], []
    for r in data["rounds"]:
        start = r["sessions"].get("R")
        if r["results"] and start:
            finished.append((r, now - sitegen.when(start)))
    # one race's laps per run keeps us well inside the hourly API limit
    for r, age in finished:
        if not laps.have(year, r["round"]) and age > timedelta(hours=3):
            try:
                if laps.from_api(year, r["round"]):
                    labels.append(f"round {r['round']} laps")
                else:
                    print(f"round {r['round']}: laps not published yet")
            except RuntimeError as err:
                print(f"round {r['round']} laps failed: {err}")
            break
    # openf1 usually has a race within hours, older gaps are left to the race data workflow
    fresh = {r["round"] for r, age in finished
             if timedelta(hours=3) < age < timedelta(days=7) and not openf1.have(year, r["round"])}
    if fresh and year >= openf1.FIRST:
        try:
            if openf1.fill(year, data, limit=2, only=fresh):
                labels.append("tyres and safety cars")
        except RuntimeError as err:
            print(f"openf1 failed: {err}")
    # practice and sprint qualifying times, a few minutes after each session
    if year >= openf1.FIRST:
        try:
            if practice.fill(year, data, now=now, until=practice.GIVE_UP, limit=3):
                labels.append("practice times")
        except RuntimeError as err:
            print(f"practice times failed: {err}")
    return labels


def trigger_build():
    hook = os.environ.get("CF_DEPLOY_HOOK")
    if not hook:
        print("no deploy hook set, skipping the build")
        return
    req = urllib.request.Request(hook, method="POST", data=b"")
    with urllib.request.urlopen(req, timeout=30):
        pass
    print("asked Cloudflare for a build")


def main():
    now = datetime.now(timezone.utc)
    reason = reason_to_refresh(now)
    labels = []
    if reason:
        print(f"refreshing: {reason}")
        labels = refresh(now)
        store.write_json(CHECKED, {"full": sitegen.iso(now.replace(second=0, microsecond=0))})
    labels += race_extras(now)
    if not reason and not labels:
        print("nothing to do")
        return
    site_changed = sitegen.build(now)
    if not labels and not site_changed:
        # only the check time moved
        store.commit("Daily check, nothing new")
        print("no changes")
        return
    message = ", ".join(labels) if labels else "Site data rebuilt"
    if store.commit(message[0].upper() + message[1:]):
        print(f"committed: {message}")
        trigger_build()


if __name__ == "__main__":
    main()
