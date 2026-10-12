"""The data branch: archive/ (finished seasons), current/, site/."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get("PF_STORE", Path(__file__).resolve().parent.parent / "store"))


def path_for(year, finished):
    return ROOT / ("archive" if finished else "current") / f"{year}.json"


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    """True if the content changed"""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def archived_years():
    folder = ROOT / "archive"
    return sorted(int(p.stem) for p in folder.glob("*.json")) if folder.exists() else []


def load(year):
    for finished in (True, False):
        p = path_for(year, finished)
        if p.exists():
            return read_json(p)
    return None


def all_seasons():
    years = set(archived_years())
    cur = ROOT / "current"
    if cur.exists():
        years |= {int(p.stem) for p in cur.glob("*.json")}
    for year in sorted(years):
        yield load(year)


def save_season(season, finished):
    """ignores the fetch time when comparing"""
    p = path_for(season["year"], finished)
    if p.exists():
        old = read_json(p)
        old.pop("fetched", None)
        new = {k: v for k, v in season.items() if k != "fetched"}
        if json.dumps(old, sort_keys=True) == json.dumps(new, sort_keys=True):
            return False
    changed = write_json(p, season)
    if finished:
        # drop the current/ copy once archived
        stale = path_for(season["year"], False)
        if stale.exists():
            stale.unlink()
    return changed


def commit(message):
    """True if it pushed"""
    run = lambda *a: subprocess.run(["git", "-C", str(ROOT), *a], check=True, capture_output=True, text=True)
    run("add", "-A")
    if not run("status", "--porcelain").stdout.strip():
        return False
    run("commit", "-q", "-m", message)
    for attempt in range(3):
        try:
            run("push", "-q", "origin", "HEAD:data")
            return True
        except subprocess.CalledProcessError:
            run("pull", "-q", "--rebase", "origin", "data")
    raise RuntimeError("could not push the data branch")
